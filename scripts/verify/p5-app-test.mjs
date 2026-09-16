/**
 * P5 through the running app: the Shiprocket webhook and the tracking cron.
 *
 *     node --env-file=.env.local --env-file=.env.development.local scripts/verify/p5-app-test.mjs
 *
 * Needs a dev server with the same SHIPROCKET_WEBHOOK_TOKEN and CRON_SECRET.
 * Put throwaway values in `.env.development.local` and delete that file
 * afterwards, so it cannot shadow the real ones later.
 *
 * No Shiprocket account is involved: this drives the webhook the way
 * Shiprocket would and checks what our side does with it — including the
 * timestamps, which arrive as naive Indian time and must come back as the same
 * instant.
 */
import { createClient } from "@supabase/supabase-js";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const TOKEN = process.env.SHIPROCKET_WEBHOOK_TOKEN;
const CRON = process.env.CRON_SECRET;

if (!TOKEN || !CRON) {
  console.error("SHIPROCKET_WEBHOOK_TOKEN and CRON_SECRET must be set for this suite.");
  process.exit(1);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(60)} ${detail}`);
};
const section = (title) => console.log(`\n── ${title}`);

const RUN = Date.now();
const ACTOR = "p5-app-test";
const email = `p5-app-${RUN}@example.com`;
const AWB = `AWBAPP${RUN}`;
const rid = (p) => `${p}_${Math.random().toString(36).slice(2, 12)}`;

/** Shiprocket sends naive Indian time; the same instant, differently spelled. */
const EVENT_BASE = Date.now() - 600_000;
const ist = (seconds) =>
  new Date(EVENT_BASE + seconds * 1000 + 5.5 * 3600_000).toISOString().slice(0, 19).replace("T", " ");

const hook = async (body, { token = TOKEN, raw = false } = {}) => {
  const res = await fetch(`${BASE_URL}/api/webhooks/shiprocket`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token === null ? {} : { "x-api-key": token }),
    },
    body: raw ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const cron = async (path) => {
  const res = await fetch(`${BASE_URL}${path}`);
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const loadShipment = async (id) => (await db.from("shipments").select("*").eq("id", id).single()).data;
const outboxCount = async (orderId, topic) =>
  (
    await db
      .from("webhook_outbox")
      .select("id", { count: "exact", head: true })
      .eq("payload->>order_id", orderId)
      .eq("topic", topic)
  ).count;

// ── Fixtures ────────────────────────────────────────────────────────────────

const { data: product } = await db
  .from("products")
  .insert({ handle: `p5-app-${RUN}`, title: "P5 app test book", status: "active" })
  .select("id")
  .single();
const { data: variant } = await db
  .from("product_variants")
  .insert({
    product_id: product.id,
    title: "Default",
    price_paise: 40000,
    inventory_quantity: 5,
    weight_grams: 300,
  })
  .select("id")
  .single();
const { data: checkout } = await db
  .from("checkouts")
  .insert({
    email,
    line_items: [{ variant_id: variant.id, quantity: 1, unit_price_paise: 40000 }],
    subtotal_paise: 40000,
    shipping_paise: 6000,
    total_paise: 46000,
    shipping_address: {
      name: "App Test",
      phone: "9999999999",
      line1: "1 Test Road",
      city: "Kochi",
      state: "Kerala",
      pincode: "682001",
      country: "India",
    },
  })
  .select("id")
  .single();
const { data: placed, error: placeError } = await db.rpc("create_order_from_checkout", {
  p_checkout_id: checkout.id,
  p_razorpay_order_id: rid("order_test"),
  p_razorpay_payment_id: rid("pay_test"),
  p_razorpay_signature: "sig",
});
if (placeError) throw new Error(`fixture order failed: ${placeError.message}`);
const orderId = placed.order_id;

const { data: created } = await db.rpc("create_shipment", {
  p_order_id: orderId,
  p_shiprocket_order_id: rid("sr"),
  p_shiprocket_shipment_id: rid("shp"),
  p_raw: {},
  p_actor: ACTOR,
});
await db.rpc("assign_shipment_awb", {
  p_shipment_id: created.shipment_id,
  p_awb_code: AWB,
  p_courier_name: "Test Courier",
  p_actor: ACTOR,
});

try {
  // ── The token is the whole of the authentication ──────────────────────────
  section("Who may post to the webhook");

  check("no token is refused", (await hook({ awb: AWB }, { token: null })).status === 401);
  check("a wrong token is refused", (await hook({ awb: AWB }, { token: `${TOKEN}x` })).status === 401);
  check(
    "a token of a different length is refused",
    (await hook({ awb: AWB }, { token: "short" })).status === 401
  );

  const malformed = await hook("{not json", { raw: true });
  check("a malformed body is refused", malformed.status === 400, String(malformed.status));

  // ── Payloads it should shrug at ───────────────────────────────────────────
  section("Payloads with nothing to act on");

  const noAwb = await hook({ current_status: "DELIVERED" });
  check("no AWB is acknowledged, not retried", noAwb.status === 200 && noAwb.body.ignored === "no awb");

  const unknown = await hook({ awb: "nothing-like-this", current_status: "DELIVERED" });
  check(
    "an unknown AWB is acknowledged, not retried",
    unknown.status === 200 && Boolean(unknown.body.ignored),
    JSON.stringify(unknown.body).slice(0, 80)
  );

  const unmapped = await hook({ awb: AWB, current_status: "TELEPORTED" });
  check(
    "a status we do not model is acknowledged and changes nothing",
    unmapped.status === 200 && unmapped.body.ignored === "unmapped"
  );

  // ── Real events ───────────────────────────────────────────────────────────
  section("Real events");

  const transit = await hook({
    awb: AWB,
    current_status: "IN TRANSIT",
    current_status_id: 18,
    current_timestamp: ist(0),
    scans: [{ date: ist(0), status: "IT", activity: "Left origin hub" }],
  });
  check("in transit is applied", transit.body.applied === true, transit.body.reason ?? "");
  check("the status is recorded", transit.body.status === "in_transit", transit.body.status ?? "");

  const shipment = await loadShipment(created.shipment_id);
  check(
    "the event time is read as Indian time, not UTC",
    Math.abs(Date.parse(shipment.last_event_at) - EVENT_BASE) < 2000,
    shipment.last_event_at
  );
  check("the activity line is kept", shipment.status_detail === "Left origin hub", shipment.status_detail);

  const replay = await hook({
    awb: AWB,
    current_status: "IN TRANSIT",
    current_status_id: 18,
    current_timestamp: ist(10),
  });
  check(
    "a repeat changes nothing",
    replay.body.applied === false && replay.body.reason === "unchanged",
    replay.body.reason ?? ""
  );

  // Their numeric code alone, with no text we recognise.
  const byCode = await hook({ awb: AWB, current_status: "", current_status_id: 17, current_timestamp: ist(20) });
  check(
    "a status sent only as a code is mapped",
    byCode.body.applied === true && byCode.body.status === "out_for_delivery",
    byCode.body.status ?? ""
  );

  const stale = await hook({ awb: AWB, current_status: "IN TRANSIT", current_timestamp: ist(-120) });
  check(
    "an event from before the last one is ignored",
    stale.body.applied === false && stale.body.reason === "stale",
    stale.body.reason ?? ""
  );

  const delivered = await hook({
    awb: AWB,
    current_status: "DELIVERED",
    current_status_id: 7,
    current_timestamp: ist(30),
  });
  check("delivered is applied", delivered.body.applied === true, delivered.body.reason ?? "");
  check("delivered_at is stamped", Boolean((await loadShipment(created.shipment_id)).delivered_at));
  check("order.delivered is queued once", (await outboxCount(orderId, "order.delivered")) === 1);
  check(
    "order.shipped was queued once, by the AWB and not again",
    (await outboxCount(orderId, "order.shipped")) === 1
  );

  const afterDelivery = await hook({ awb: AWB, current_status: "IN TRANSIT", current_timestamp: ist(40) });
  check(
    "a delivered parcel is not walked backwards",
    afterDelivery.body.applied === false && afterDelivery.body.reason === "terminal",
    afterDelivery.body.reason ?? ""
  );

  // ── The cron ──────────────────────────────────────────────────────────────
  section("The tracking cron");

  check("no secret is refused", (await cron("/api/cron/track")).status === 401);
  check("a wrong secret is refused", (await cron(`/api/cron/track?secret=${CRON}x`)).status === 401);

  const run = await cron(`/api/cron/track?secret=${encodeURIComponent(CRON)}`);
  check("the right secret is let in", run.status === 200, String(run.status));
  check(
    "and it stands down while Shiprocket is unconfigured",
    Boolean(run.body.skipped),
    JSON.stringify(run.body).slice(0, 90)
  );

  // ── The admin screen ──────────────────────────────────────────────────────
  section("The new admin route");
  const page = await fetch(`${BASE_URL}/admin/shipments`, { redirect: "manual" });
  check("/admin/shipments sends a stranger to the login", page.status === 307, String(page.status));
} finally {
  await db.from("shipments").delete().eq("order_id", orderId);
  await db.from("webhook_outbox").delete().eq("payload->>order_id", orderId);
  await db.from("audit_log").delete().eq("entity_id", orderId);
  await db.from("orders").delete().eq("id", orderId);
  await db.from("checkouts").delete().eq("id", checkout.id);
  await db.from("customers").delete().eq("email", email);
  await db.from("audit_log").delete().eq("admin_email", ACTOR);
  // Stock crossing the low-stock threshold queues inventory.low (P6).
  await db.from("webhook_outbox").delete().eq("topic", "inventory.low").eq("payload->>product_id", product.id);
  await db.from("products").delete().eq("id", product.id);
  console.log("\ncleaned up fixtures");
}

console.log(failures === 0 ? "\nAll P5 app checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
