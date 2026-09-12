/**
 * P5: every shipping function against the live database, including the ways
 * they must refuse — a second shipment on one order, a status that arrives
 * late, a parcel that has already been delivered, a cancellation after the
 * courier has it, and the P4 guards that shipping must not break.
 *
 *     node --env-file=.env.local scripts/verify/p5-test.mjs
 *
 * Talks to the database directly. No dev server and no Shiprocket account
 * needed: the AWBs and Shiprocket ids here are stand-in strings, which is
 * enough to prove our side books them once and only once. It does not prove
 * that a real parcel can be created — that needs credentials.
 */
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const ACTOR = "p5-test";
const RUN = Date.now();

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(62)} ${detail}`);
};
const section = (title) => console.log(`\n── ${title}`);
const rid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 12)}`;

const emails = [];
const newEmail = (tag) => {
  const email = `p5-${tag}-${RUN}@example.com`;
  emails.push(email);
  return email;
};

// ── Fixtures ────────────────────────────────────────────────────────────────

const { data: product, error: productError } = await db
  .from("products")
  .insert({ handle: `p5-test-${RUN}`, title: "P5 test book", status: "active" })
  .select("id")
  .single();
if (productError) throw productError;

const { data: variant } = await db
  .from("product_variants")
  .insert({
    product_id: product.id,
    title: "Default",
    sku: `P5-${RUN}`,
    price_paise: 50000,
    inventory_quantity: 50,
    weight_grams: 400,
  })
  .select("id")
  .single();

async function makeOrder(tag) {
  const email = newEmail(tag);
  const { data: checkout, error: checkoutError } = await db
    .from("checkouts")
    .insert({
      email,
      line_items: [{ variant_id: variant.id, quantity: 1, unit_price_paise: 50000 }],
      subtotal_paise: 50000,
      discount_paise: 0,
      shipping_paise: 6000,
      total_paise: 56000,
      shipping_address: {
        name: "Test Buyer",
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
  if (checkoutError) throw checkoutError;

  const { data, error } = await db.rpc("create_order_from_checkout", {
    p_checkout_id: checkout.id,
    p_razorpay_order_id: rid("order_test"),
    p_razorpay_payment_id: rid("pay_test"),
    p_razorpay_signature: "sig",
  });
  if (error) throw new Error(`fixture order failed: ${error.message}`);
  return loadOrder(data.order_id);
}

const loadOrder = async (id) =>
  (await db.from("orders").select("*").eq("id", id).single()).data;

const loadShipment = async (id) =>
  (await db.from("shipments").select("*").eq("id", id).single()).data;

const outboxCount = async (orderId, topic) =>
  (
    await db
      .from("webhook_outbox")
      .select("id", { count: "exact", head: true })
      .eq("payload->>order_id", orderId)
      .eq("topic", topic)
  ).count;

const auditCount = async (orderId, action) =>
  (
    await db
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("entity_id", orderId)
      .eq("action", action)
  ).count;

const create = (orderId, srOrder = rid("sr"), srShipment = rid("shp")) =>
  db.rpc("create_shipment", {
    p_order_id: orderId,
    p_shiprocket_order_id: srOrder,
    p_shiprocket_shipment_id: srShipment,
    p_raw: {},
    p_actor: ACTOR,
  });

const assign = (shipmentId, awb, courier = "Delhivery", extra = {}) =>
  db.rpc("assign_shipment_awb", {
    p_shipment_id: shipmentId,
    p_awb_code: awb,
    p_courier_name: courier,
    p_raw: {},
    p_actor: ACTOR,
    ...extra,
  });

const setStatus = (status, args = {}) =>
  db.rpc("update_shipment_status", { p_status: status, p_actor: ACTOR, ...args });

// A snapshot, because set_shiprocket_token writes to the real settings row.
const { data: settingsBefore } = await db
  .from("settings")
  .select("value")
  .eq("key", "shiprocket")
  .maybeSingle();

try {
  // ── Creating a shipment ───────────────────────────────────────────────────
  section("Creating a shipment");

  const orderA = await makeOrder("a");
  const { data: createdA, error: createAError } = await create(orderA.id);
  check("a paid order can be shipped", !createAError, createAError?.message ?? "");

  const shipmentA = await loadShipment(createdA.shipment_id);
  check("the shipment starts pending", shipmentA?.status === "pending", shipmentA?.status);
  check("last_status_at is stamped", Boolean(shipmentA?.last_status_at));
  check(
    "the order becomes fulfilled",
    (await loadOrder(orderA.id)).fulfillment_status === "fulfilled"
  );
  check("it is written to the audit log", (await auditCount(orderA.id, "shipment.create")) === 1);
  check("nothing is queued for n8n yet", (await outboxCount(orderA.id, "order.shipped")) === 0);

  const { error: twiceError } = await create(orderA.id);
  check("a second shipment is refused", twiceError?.code === "55000", twiceError?.code ?? "no error!");

  const { error: missingError } = await create("00000000-0000-0000-0000-000000000000");
  check("an unknown order is refused", missingError?.code === "P0002", missingError?.code ?? "no error!");

  // An order that was never paid. Only reachable by writing one directly:
  // checkout never makes one.
  const unpaidEmail = newEmail("unpaid");
  const { data: unpaid } = await db
    .from("orders")
    .insert({ email: unpaidEmail, payment_status: "pending", total_paise: 1000 })
    .select("id")
    .single();
  const { error: unpaidError } = await create(unpaid.id);
  check("an unpaid order is refused", unpaidError?.code === "55000", unpaidError?.code ?? "no error!");

  // ── Refund and cancellation guards ────────────────────────────────────────
  section("Guards against shipping the wrong thing");

  const orderRefunding = await makeOrder("refunding");
  const { data: begun } = await db.rpc("begin_refund", {
    p_order_id: orderRefunding.id,
    p_amount_paise: 1000,
    p_restock: [],
    p_cancel: false,
    p_reason: "test",
    p_actor: ACTOR,
  });
  const { error: refundingError } = await create(orderRefunding.id);
  check(
    "an order with a refund in flight is refused",
    refundingError?.code === "55000",
    refundingError?.code ?? "no error!"
  );
  await db.rpc("fail_refund", { p_refund_id: begun.refund_id, p_error: "test", p_actor: ACTOR });

  const orderCancelled = await makeOrder("cancelled");
  await db.rpc("begin_refund", {
    p_order_id: orderCancelled.id,
    p_amount_paise: null,
    p_restock: [],
    p_cancel: true,
    p_reason: "test",
    p_actor: ACTOR,
  });
  const { data: cancelRefunds } = await db
    .from("refunds")
    .select("id")
    .eq("order_id", orderCancelled.id)
    .eq("status", "pending");
  await db.rpc("complete_refund", {
    p_refund_id: cancelRefunds[0].id,
    p_razorpay_refund_id: rid("rfnd"),
    p_actor: ACTOR,
  });
  const { error: cancelledError } = await create(orderCancelled.id);
  check(
    "a cancelled order is refused",
    cancelledError?.code === "55000",
    cancelledError?.code ?? "no error!"
  );

  // P4's own guards must still hold while a shipment is live.
  const { error: cancelLiveError } = await db.rpc("cancel_order", {
    p_order_id: orderA.id,
    p_restock: [],
    p_reason: "test",
    p_actor: ACTOR,
  });
  check(
    "a fulfilled order still cannot be cancelled",
    cancelLiveError?.code === "55000",
    cancelLiveError?.code ?? "no error!"
  );

  // ── The AWB ───────────────────────────────────────────────────────────────
  section("Assigning the AWB");

  const awbA = `AWB${RUN}A`;
  const { data: assigned, error: assignError } = await assign(shipmentA.id, awbA);
  check("an AWB can be assigned", !assignError, assignError?.message ?? "");
  check("it asks for the tracking email", assigned?.notify_shipped === true);
  check("the status moves to awb_assigned", assigned?.status === "awb_assigned", assigned?.status);

  const shippedA = await loadShipment(shipmentA.id);
  check("shipped_at is stamped", Boolean(shippedA.shipped_at));
  check(
    "a tracking URL is derived from the AWB",
    shippedA.tracking_url?.endsWith(awbA),
    shippedA.tracking_url ?? ""
  );
  check("order.shipped is queued once", (await outboxCount(orderA.id, "order.shipped")) === 1);

  const { data: again } = await assign(shipmentA.id, awbA);
  check("assigning the same AWB again asks for no second email", again?.notify_shipped === false);
  check("and queues nothing more", (await outboxCount(orderA.id, "order.shipped")) === 1);

  const { error: differentAwb } = await assign(shipmentA.id, `${awbA}X`);
  check("a different AWB is refused", differentAwb?.code === "55000", differentAwb?.code ?? "no error!");

  const { error: emptyAwb } = await assign(shipmentA.id, "");
  check("an empty AWB is refused", emptyAwb?.code === "22023", emptyAwb?.code ?? "no error!");

  // ── Status updates ────────────────────────────────────────────────────────
  section("Status updates");

  const { error: unknownStatus } = await setStatus("teleported", { p_awb_code: awbA });
  check(
    "an unknown status is refused",
    unknownStatus?.code === "22023",
    unknownStatus?.code ?? "no error!"
  );

  const { error: noIdentifier } = await setStatus("in_transit");
  check(
    "a status with no shipment named is refused",
    noIdentifier?.code === "22023",
    noIdentifier?.code ?? "no error!"
  );

  const { error: unknownAwb } = await setStatus("in_transit", { p_awb_code: "nothing-like-this" });
  check("an unknown AWB is refused", unknownAwb?.code === "P0002", unknownAwb?.code ?? "no error!");

  // A fixed, ordered sequence of event times. Shiprocket's clock is not this
  // machine's, and the app never invents one, so the suite must not either.
  const BASE = Date.now() - 600_000;
  const at = (seconds) => new Date(BASE + seconds * 1000).toISOString();

  const { data: transit } = await setStatus("in_transit", {
    p_awb_code: awbA,
    p_remote_status: "IN TRANSIT",
    p_detail: "Left Kochi hub",
    p_occurred_at: at(0),
  });
  check("in transit is applied", transit?.applied === true, transit?.reason ?? "");
  check("and asks for no email, having shipped already", !transit?.notify, transit?.notify ?? "");

  const { data: repeat } = await setStatus("in_transit", {
    p_awb_code: awbA,
    p_occurred_at: at(10),
  });
  check("the same status again changes nothing", repeat?.applied === false && repeat?.reason === "unchanged");

  const { data: stale } = await setStatus("out_for_delivery", {
    p_awb_code: awbA,
    p_occurred_at: at(-60),
  });
  check("an event older than the last one is ignored", stale?.applied === false && stale?.reason === "stale");

  const { data: delivered } = await setStatus("delivered", {
    p_awb_code: awbA,
    p_remote_status: "DELIVERED",
    p_occurred_at: at(20),
  });
  check("delivered is applied", delivered?.applied === true, delivered?.reason ?? "");
  check("delivered_at is stamped", Boolean((await loadShipment(shipmentA.id)).delivered_at));
  check("order.delivered is queued once", (await outboxCount(orderA.id, "order.delivered")) === 1);

  const { data: backwards } = await setStatus("in_transit", {
    p_awb_code: awbA,
    p_occurred_at: at(30),
  });
  check(
    "a delivered parcel cannot go backwards",
    backwards?.applied === false && backwards?.reason === "terminal",
    backwards?.reason ?? ""
  );

  const { data: lost } = await setStatus("lost", {
    p_awb_code: awbA,
    p_occurred_at: at(40),
  });
  check("but it can still be lost", lost?.applied === true, lost?.reason ?? "");
  check("delivered is still only queued once", (await outboxCount(orderA.id, "order.delivered")) === 1);

  // ── The webhook getting there first ───────────────────────────────────────
  section("A webhook that arrives before the AWB is recorded");

  const orderB = await makeOrder("b");
  const { data: createdB } = await create(orderB.id);
  const { data: earlyTransit } = await setStatus("in_transit", {
    p_shipment_id: createdB.shipment_id,
    p_remote_status: "SHIPPED",
  });
  check("a status update alone marks it shipped", earlyTransit?.notify === "shipped", earlyTransit?.notify ?? "");
  check("order.shipped is queued once", (await outboxCount(orderB.id, "order.shipped")) === 1);

  const { data: lateAwb } = await assign(createdB.shipment_id, `AWB${RUN}B`);
  check("the AWB arriving later asks for no second email", lateAwb?.notify_shipped === false);
  check("and queues nothing more", (await outboxCount(orderB.id, "order.shipped")) === 1);
  check(
    "a shipment already in transit is not pulled back to awb_assigned",
    (await loadShipment(createdB.shipment_id)).status === "in_transit"
  );

  // ── Coming back ───────────────────────────────────────────────────────────
  section("Returns");

  const orderC = await makeOrder("c");
  const { data: createdC } = await create(orderC.id);
  await assign(createdC.shipment_id, `AWB${RUN}C`);
  await setStatus("rto_initiated", { p_shipment_id: createdC.shipment_id });
  await setStatus("rto_delivered", { p_shipment_id: createdC.shipment_id });
  check(
    "an RTO that gets back to us marks the order returned",
    (await loadOrder(orderC.id)).fulfillment_status === "returned"
  );

  // ── Cancelling a shipment ─────────────────────────────────────────────────
  section("Cancelling a shipment");

  const orderD = await makeOrder("d");
  const { data: createdD } = await create(orderD.id);
  const { data: cancelledShipment, error: cancelError } = await db.rpc("cancel_shipment", {
    p_shipment_id: createdD.shipment_id,
    p_reason: "wrong box",
    p_actor: ACTOR,
  });
  check("an unshipped parcel can be cancelled", !cancelError, cancelError?.message ?? "");
  check(
    "the order goes back to unfulfilled",
    cancelledShipment?.fulfillment_status === "unfulfilled",
    cancelledShipment?.fulfillment_status ?? ""
  );

  const { error: cancelTwice } = await db.rpc("cancel_shipment", {
    p_shipment_id: createdD.shipment_id,
    p_reason: "again",
    p_actor: ACTOR,
  });
  check("cancelling twice is refused", cancelTwice?.code === "55000", cancelTwice?.code ?? "no error!");

  const { error: replaceError } = await create(orderD.id);
  check("a cancelled shipment can be replaced", !replaceError, replaceError?.message ?? "");

  const { data: replacement } = await db
    .from("shipments")
    .select("id")
    .eq("order_id", orderD.id)
    .neq("status", "cancelled")
    .single();
  await assign(replacement.id, `AWB${RUN}D`);
  const { error: cancelShippedError } = await db.rpc("cancel_shipment", {
    p_shipment_id: replacement.id,
    p_reason: "too late",
    p_actor: ACTOR,
  });
  check(
    "a parcel that has left cannot be cancelled",
    cancelShippedError?.code === "55000",
    cancelShippedError?.code ?? "no error!"
  );

  // And the P4 path re-opens once the shipment is gone.
  const orderE = await makeOrder("e");
  const { data: createdE } = await create(orderE.id);
  await db.rpc("cancel_shipment", { p_shipment_id: createdE.shipment_id, p_reason: "", p_actor: ACTOR });
  const { data: refundsE } = await db.rpc("begin_refund", {
    p_order_id: orderE.id,
    p_amount_paise: null,
    p_restock: [],
    p_cancel: true,
    p_reason: "changed their mind",
    p_actor: ACTOR,
  });
  check("the order can be cancelled again afterwards", Boolean(refundsE?.refund_id));

  // ── The token cache ───────────────────────────────────────────────────────
  section("The Shiprocket token cache");

  await db
    .from("settings")
    .update({ value: { pickup_location: "P5 Test Pickup", token: null, token_expires_at: null } })
    .eq("key", "shiprocket");

  const expiry = new Date(Date.now() + 86_400_000).toISOString();
  const { error: tokenError } = await db.rpc("set_shiprocket_token", {
    p_token: "test-token",
    p_expires_at: expiry,
  });
  check("a token can be cached", !tokenError, tokenError?.message ?? "");

  const { data: cached } = await db.from("settings").select("value").eq("key", "shiprocket").single();
  check("the token is stored", cached.value.token === "test-token");
  check("with its expiry", Boolean(cached.value.token_expires_at));
  check(
    "and the pickup location survives the refresh",
    cached.value.pickup_location === "P5 Test Pickup",
    cached.value.pickup_location ?? "(gone!)"
  );

  // ── Nobody else may touch any of this ─────────────────────────────────────
  section("Anon is locked out");
  {
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false } }
    );
    const uuid = "00000000-0000-0000-0000-000000000000";
    const calls = {
      set_shiprocket_token: { p_token: "x", p_expires_at: expiry },
      create_shipment: {
        p_order_id: uuid,
        p_shiprocket_order_id: "x",
        p_shiprocket_shipment_id: "x",
        p_raw: {},
        p_actor: "anon",
      },
      assign_shipment_awb: { p_shipment_id: uuid, p_awb_code: "x", p_courier_name: "x", p_actor: "anon" },
      record_shipment_pickup: { p_shipment_id: uuid, p_pickup_token: "x", p_actor: "anon" },
      update_shipment_status: { p_status: "delivered", p_awb_code: "x", p_actor: "anon" },
      cancel_shipment: { p_shipment_id: uuid, p_reason: "x", p_actor: "anon" },
    };
    for (const [fn, args] of Object.entries(calls)) {
      const { error } = await anon.rpc(fn, args);
      check(`anon cannot call ${fn}`, error?.code === "42501", error?.code ?? "no error!");
    }
    const { error: tableError } = await anon.from("shipments").select("id").limit(1);
    check("anon cannot read shipments", tableError?.code === "42501", tableError?.code ?? "no error!");

    const { data: settingsRows } = await anon.from("settings").select("key").eq("key", "shiprocket");
    check("anon cannot read the Shiprocket settings", (settingsRows ?? []).length === 0);
  }
} finally {
  // ── Cleanup ───────────────────────────────────────────────────────────────
  if (settingsBefore) {
    await db.from("settings").update({ value: settingsBefore.value }).eq("key", "shiprocket");
  }

  const { data: orders } = await db.from("orders").select("id").in("email", emails);
  const orderIds = (orders ?? []).map((o) => o.id);
  const { data: checkouts } = await db.from("checkouts").select("id").in("email", emails);
  const checkoutIds = (checkouts ?? []).map((c) => c.id);

  if (orderIds.length) {
    await db.from("shipments").delete().in("order_id", orderIds);
    await db.from("refunds").delete().in("order_id", orderIds);
    for (const id of orderIds) {
      await db.from("webhook_outbox").delete().eq("payload->>order_id", id);
      await db.from("audit_log").delete().eq("entity_id", id);
    }
    await db.from("orders").delete().in("id", orderIds);
  }
  if (checkoutIds.length) {
    await db.from("refunds").delete().in("checkout_id", checkoutIds);
    await db.from("checkouts").delete().in("id", checkoutIds);
  }
  await db.from("customers").delete().in("email", emails);
  await db.from("audit_log").delete().eq("admin_email", ACTOR);
  await db.from("products").delete().eq("id", product.id);
  console.log("\ncleaned up fixtures");
}

console.log(failures === 0 ? "\nAll P5 checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
