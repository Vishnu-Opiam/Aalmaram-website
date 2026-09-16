/**
 * P6 through the running app: the outbox reaching "n8n", the cron fallback,
 * and the summary endpoint Flow 5 reads.
 *
 *     node --env-file=.env.local --env-file=.env.development.local scripts/verify/p6-app-test.mjs
 *
 * This suite plays n8n itself: it listens on 127.0.0.1:4599 and the dev server
 * must be pointed at it. Put these throwaway values in `.env.development.local`
 * and delete that file afterwards:
 *
 *     N8N_ORDER_PAID_WEBHOOK_URL=http://127.0.0.1:4599/paid
 *     N8N_ORDER_REFUNDED_WEBHOOK_URL=http://127.0.0.1:4599/fail
 *     N8N_INVENTORY_LOW_WEBHOOK_URL=http://127.0.0.1:4599/low
 *     N8N_WEBHOOK_SECRET=<anything>
 *     CRON_SECRET=<anything>
 *     RAZORPAY_WEBHOOK_SECRET=<anything>
 *
 * order.cancelled is left unconfigured on purpose.
 */
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const CRON = process.env.CRON_SECRET;
const TOKEN = process.env.N8N_WEBHOOK_SECRET;
const RZP = process.env.RAZORPAY_WEBHOOK_SECRET;

if (!CRON || !TOKEN || !RZP || !process.env.N8N_ORDER_PAID_WEBHOOK_URL) {
  console.error("CRON_SECRET, N8N_WEBHOOK_SECRET, RAZORPAY_WEBHOOK_SECRET and the N8N_* URLs must be set; see the header.");
  process.exit(1);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(62)} ${detail}`);
};
const section = (title) => console.log(`\n── ${title}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const RUN = Date.now();
const ACTOR = "p6-app-test";
const email = `p6-app-${RUN}@example.com`;

// ── A fake n8n ──────────────────────────────────────────────────────────────

const received = [];
const server = createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    let body = null;
    try {
      body = JSON.parse(raw);
    } catch {
      /* recorded as null */
    }
    received.push({ path: req.url, headers: req.headers, raw, body });
    if (req.url === "/fail") {
      res.writeHead(500, { "content-type": "text/plain" }).end("workflow exploded");
    } else {
      res.writeHead(200, { "content-type": "application/json" }).end('{"message":"Workflow was started"}');
    }
  });
});
await new Promise((resolve) => server.listen(4599, "127.0.0.1", resolve));

const { count: foreign } = await db
  .from("webhook_outbox")
  .select("id", { count: "exact", head: true })
  .eq("status", "pending");
if (foreign) {
  console.error(`The outbox has ${foreign} pending row(s) this suite did not create. Refusing to run.`);
  server.close();
  process.exit(1);
}

const cron = (secret) =>
  fetch(`${BASE_URL}/api/cron/outbox`, { headers: secret ? { authorization: `Bearer ${secret}` } : {} });
const loadRow = async (id) => (await db.from("webhook_outbox").select("*").eq("id", id).single()).data;
const waitFor = async (predicate, ms = 20000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const found = predicate();
    if (found) return found;
    await sleep(250);
  }
  return null;
};

const { data: product } = await db
  .from("products")
  .insert({ handle: `p6-app-${RUN}`, title: "P6 app test book", status: "active" })
  .select("id")
  .single();
const { data: variant } = await db
  .from("product_variants")
  .insert({ product_id: product.id, title: "Default", sku: `P6APP-${RUN}`, price_paise: 50000, inventory_quantity: 20, weight_grams: 400 })
  .select("id")
  .single();

let orderId = null;

try {
  // ── Guards ────────────────────────────────────────────────────────────────
  section("Guards");

  check("the cron refuses no secret", (await cron(null)).status === 401);
  check("the cron refuses a wrong secret", (await cron("nope")).status === 401);

  const summary = (headers, days = "7") => fetch(`${BASE_URL}/api/integrations/summary?days=${days}`, { headers });
  check("the summary refuses no token", (await summary({})).status === 401);
  check("the summary refuses a wrong token", (await summary({ "x-aalmaram-token": "nope" })).status === 401);
  check("the summary refuses a silly window", (await summary({ "x-aalmaram-token": TOKEN }, "0")).status === 400);
  {
    const res = await summary({ "x-aalmaram-token": TOKEN });
    const body = await res.json();
    check(
      "the summary answers with the week's numbers",
      res.status === 200 && body.days === 7 && typeof body.net_revenue_paise === "number" && Array.isArray(body.low_stock),
      JSON.stringify(body).slice(0, 120)
    );
  }

  // ── A paid order reaches n8n without waiting for the cron ────────────────
  section("order.paid, delivered by the kick");

  const rzOrder = `order_p6app_${RUN}`;
  const { data: checkout, error: checkoutError } = await db
    .from("checkouts")
    .insert({
      email,
      line_items: [{ variant_id: variant.id, quantity: 1, unit_price_paise: 50000 }],
      subtotal_paise: 50000,
      discount_paise: 0,
      shipping_paise: 6000,
      total_paise: 56000,
      razorpay_order_id: rzOrder,
      accepts_marketing: true,
      shipping_address: {
        name: "Test Buyer",
        phone: "9999999999",
        line1: "1 Test Road",
        line2: "Near the ferry",
        city: "Kochi",
        state: "Kerala",
        pincode: "682001",
        country: "India",
      },
    })
    .select("id")
    .single();
  if (checkoutError) throw checkoutError;

  const hookBody = JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: { id: `pay_p6app_${RUN}`, order_id: rzOrder, status: "captured" } } },
  });
  const hookRes = await fetch(`${BASE_URL}/api/webhooks/razorpay`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-razorpay-signature": createHmac("sha256", RZP).update(hookBody).digest("hex"),
    },
    body: hookBody,
  });
  const hook = await hookRes.json();
  check("the Razorpay webhook creates the order", hookRes.status === 200 && Boolean(hook.orderNumber), hook.orderNumber ?? JSON.stringify(hook));

  const { data: order } = await db.from("orders").select("id, order_number").eq("email", email).single();
  orderId = order.id;
  const { data: paidRow } = await db
    .from("webhook_outbox")
    .select("id")
    .eq("topic", "order.paid")
    .eq("payload->>order_id", order.id)
    .single();

  const paid = await waitFor(() => received.find((r) => r.path === "/paid"));
  check("n8n hears about it within seconds, with no cron", Boolean(paid));

  if (paid) {
    const b = paid.body;
    check("the topic and event id headers are set", paid.headers["x-aalmaram-topic"] === "order.paid" && paid.headers["x-aalmaram-event-id"] === paidRow.id);
    check("the shared token header is set", paid.headers["x-aalmaram-token"] === TOKEN);
    const expected = "sha256=" + createHmac("sha256", TOKEN).update(paid.raw).digest("hex");
    check("the signature is an HMAC of the exact bytes sent", paid.headers["x-aalmaram-signature"] === expected);
    check("event carries the id, topic and attempt", b.event?.id === paidRow.id && b.event?.topic === "order.paid" && b.event?.attempt === 1);
    check("data carries the original payload", b.data?.order_id === order.id && b.data?.accepts_marketing === true);

    section("…in the shape the Shopify-era flows read");
    check("order_number and name", b.order_number === order.order_number && b.name === `#${order.order_number}`, `${b.order_number} ${b.name}`);
    check("totals in rupee strings", b.total_price === "560.00" && b.subtotal_price === "500.00" && b.total_tax === "0.00", `${b.total_price}`);
    check("the shipping line", b.shipping_lines?.[0]?.price === "60.00");
    check(
      "line items with title, sku, quantity and price",
      b.line_items?.length === 1 &&
        b.line_items[0].title === "P6 app test book" &&
        b.line_items[0].sku === `P6APP-${RUN}` &&
        b.line_items[0].quantity === 1 &&
        b.line_items[0].price === "500.00" &&
        b.line_items[0].variant_title === "",
      JSON.stringify(b.line_items?.[0])
    );
    check("customer name split from the address", b.customer?.first_name === "Test" && b.customer?.last_name === "Buyer" && b.customer?.email === email);
    check("no customer.id, so Flow 2 matches on email", b.customer && !("id" in b.customer));
    check(
      "shipping address in Shopify's field names",
      b.shipping_address?.address1 === "1 Test Road" &&
        b.shipping_address?.address2 === "Near the ferry" &&
        b.shipping_address?.zip === "682001" &&
        b.shipping_address?.province === "Kerala" &&
        b.shipping_address?.phone === "9999999999"
    );
    check("created_at and currency", Boolean(b.created_at) && b.currency === "INR");
  }

  let row = await loadRow(paidRow.id);
  for (let i = 0; i < 20 && row.status !== "sent"; i++) {
    await sleep(250);
    row = await loadRow(paidRow.id);
  }
  check("the row is marked sent with n8n's status", row.status === "sent" && row.last_response_status === 200 && Boolean(row.sent_at), `${row.status} ${row.last_response_status}`);

  const beforeCron = received.filter((r) => r.path === "/paid").length;
  await (await cron(CRON)).json();
  check("the cron does not send it a second time", received.filter((r) => r.path === "/paid").length === beforeCron);

  // ── Failures, unconfigured topics, dropped events ────────────────────────
  section("The cron: failures, unconfigured topics, drops");

  const { data: failing } = await db
    .from("webhook_outbox")
    .insert({ topic: "order.refunded", payload: { order_id: order.id, amount_paise: 100, test: ACTOR } })
    .select("id")
    .single();
  const { data: unconfigured } = await db
    .from("webhook_outbox")
    .insert({ topic: "order.cancelled", payload: { order_id: order.id, test: ACTOR } })
    .select("id")
    .single();
  const { data: orphan } = await db
    .from("webhook_outbox")
    .insert({ topic: "inventory.low", payload: { variant_id: "00000000-0000-0000-0000-000000000000", test: ACTOR } })
    .select("id")
    .single();

  const cronRes = await cron(CRON);
  const drained = await cronRes.json();
  check("the cron drains", cronRes.status === 200 && drained.claimed >= 2, JSON.stringify(drained).slice(0, 160));

  const failed = await loadRow(failing.id);
  check("a 500 from n8n leaves the row pending", failed.status === "pending" && failed.attempts === 1, `${failed.status} ${failed.attempts}`);
  check("…recording the status and body", failed.last_response_status === 500 && failed.last_error?.includes("workflow exploded"), failed.last_error ?? "");
  const retryIn = (new Date(failed.next_attempt_at).getTime() - Date.now()) / 60000;
  check("…and backing off about a minute", retryIn > 0.3 && retryIn < 1.2, `${retryIn.toFixed(2)} min`);

  const idle = await loadRow(unconfigured.id);
  check("a topic with no URL is left alone", idle.status === "pending" && idle.attempts === 0 && idle.last_attempt_at === null);

  const gone = await loadRow(orphan.id);
  check("a low-stock alert for a deleted variant is dropped", gone.status === "sent" && gone.last_error === "variant no longer exists", gone.last_error ?? gone.status);
  check("…without bothering n8n", !received.some((r) => r.path === "/low"));

  // ── Low stock, end to end ─────────────────────────────────────────────────
  section("inventory.low");

  const { data: settings } = await db.from("settings").select("value").eq("key", "inventory").single();
  const threshold = Number(settings.value.low_stock_threshold ?? 5);
  const { data: stock } = await db.from("product_variants").select("inventory_quantity").eq("id", variant.id).single();
  await db.rpc("adjust_inventory", {
    p_variant_id: variant.id,
    p_delta: threshold - stock.inventory_quantity,
    p_reason: "manual",
    p_note: ACTOR,
    p_actor: ACTOR,
  });
  await cron(CRON);
  const low = await waitFor(() => received.find((r) => r.path === "/low"), 5000);
  check("crossing the threshold reaches n8n", Boolean(low));
  check(
    "…with what Flow 6 reads",
    low?.body?.available === threshold &&
      low?.body?.current_available === threshold &&
      low?.body?.data?.product_title === "P6 app test book" &&
      low?.body?.data?.threshold === threshold,
    JSON.stringify(low?.body ?? {}).slice(0, 160)
  );
} finally {
  server.close();
  if (orderId) {
    await db.from("webhook_outbox").delete().eq("payload->>order_id", orderId);
    await db.from("audit_log").delete().eq("entity_id", orderId);
    await db.from("orders").delete().eq("id", orderId);
  }
  await db.from("webhook_outbox").delete().eq("payload->>test", ACTOR);
  await db.from("webhook_outbox").delete().eq("payload->>variant_id", variant.id);
  await db.from("checkouts").delete().eq("email", email);
  await db.from("customers").delete().eq("email", email);
  await db.from("inventory_adjustments").delete().eq("variant_id", variant.id);
  await db.from("audit_log").delete().eq("admin_email", ACTOR);
  await db.from("products").delete().eq("id", product.id);
  console.log("\ncleaned up fixtures");
}

console.log(failures === 0 ? "\nAll P6 app checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
