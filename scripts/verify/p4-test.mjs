/**
 * P4: every function that moves money or stock, including the ways they must
 * refuse to — refunds larger than the order, cancelling twice, restocking a
 * deleted variant, a failure halfway through that must leave nothing behind.
 *
 *     node --env-file=.env.local scripts/verify/p4-test.mjs
 *
 * Talks to the database directly; no dev server and no Razorpay needed (the
 * Razorpay refund id is a stand-in string here). Cleans up after itself.
 */
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const ACTOR = "p4-test";
const RUN = Date.now();

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(60)} ${detail}`);
};
const section = (title) => console.log(`\n── ${title}`);
const rid = (prefix = "order_test") => `${prefix}_${Math.random().toString(36).slice(2, 12)}`;

const emails = [];
const newEmail = (tag) => {
  const email = `p4-${tag}-${RUN}@example.com`;
  emails.push(email);
  return email;
};

// ── Fixtures ────────────────────────────────────────────────────────────────
const { data: product } = await db
  .from("products")
  .insert({ handle: `p4-test-${RUN}`, title: "P4 test book", status: "active" })
  .select("id")
  .single();

async function makeVariant(title, price, stock) {
  const { data, error } = await db
    .from("product_variants")
    .insert({
      product_id: product.id,
      title,
      sku: `P4-${title}-${RUN}`,
      price_paise: price,
      inventory_quantity: stock,
      weight_grams: 400,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

const A = await makeVariant("A", 50000, 10);
const B = await makeVariant("B", 30000, 10);
const C = await makeVariant("C", 20000, 10); // deleted mid-test
const D = await makeVariant("D", 40000, 1); // the last copy

const { data: freeShip } = await db
  .from("discounts")
  .insert({ code: `P4SHIP${RUN}`, type: "free_shipping", value: 0, applies_to: "all", usage_limit: 1 })
  .select("id, code")
  .single();

const stock = async (v) =>
  (await db.from("product_variants").select("inventory_quantity").eq("id", v.id).single()).data
    ?.inventory_quantity;

const PRICES = new Map([[A.id, 50000], [B.id, 30000], [C.id, 20000], [D.id, 40000]]);

async function makeCheckout({ email, lines, shipping = 6000, discountCode = null, discountPaise = 0, marketing = false }) {
  const subtotal = lines.reduce((s, l) => s + PRICES.get(l.variant.id) * l.quantity, 0);
  const { data, error } = await db
    .from("checkouts")
    .insert({
      email,
      line_items: lines.map((l) => ({
        variant_id: l.variant.id,
        quantity: l.quantity,
        unit_price_paise: PRICES.get(l.variant.id),
      })),
      subtotal_paise: subtotal,
      discount_paise: discountPaise,
      shipping_paise: shipping,
      total_paise: subtotal - discountPaise + shipping,
      discount_code: discountCode,
      accepts_marketing: marketing,
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
    .select("id, total_paise")
    .single();
  if (error) throw error;
  return data;
}

async function placeOrder(checkoutId) {
  const { data, error } = await db.rpc("create_order_from_checkout", {
    p_checkout_id: checkoutId,
    p_razorpay_order_id: rid(),
    p_razorpay_payment_id: rid("pay_test"),
    p_razorpay_signature: "sig",
  });
  return { data, error };
}

async function makeOrder(opts) {
  const checkout = await makeCheckout(opts);
  const { data, error } = await placeOrder(checkout.id);
  if (error) throw new Error(`fixture order failed: ${error.message}`);
  return loadOrder(data.order_id);
}

async function loadOrder(id) {
  const { data } = await db
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", id)
    .single();
  return data;
}

const itemFor = (order, variant) => order.order_items.find((i) => i.variant_id === variant.id);

const outboxCount = async (orderId, topic) =>
  (
    await db
      .from("webhook_outbox")
      .select("id", { count: "exact", head: true })
      .eq("payload->>order_id", orderId)
      .eq("topic", topic)
  ).count;

const customer = async (email) =>
  (await db.from("customers").select("*").eq("email", email).single()).data;

const begin = (orderId, amount, { restock = [], cancel = false, reason = "test" } = {}) =>
  db.rpc("begin_refund", {
    p_order_id: orderId,
    p_amount_paise: amount,
    p_restock: restock,
    p_cancel: cancel,
    p_reason: reason,
    p_actor: ACTOR,
  });

const complete = (refundId, rzp = rid("rfnd_test")) =>
  db.rpc("complete_refund", { p_refund_id: refundId, p_razorpay_refund_id: rzp, p_actor: ACTOR });

const fail = (refundId, message = "test failure") =>
  db.rpc("fail_refund", { p_refund_id: refundId, p_error: message, p_actor: ACTOR });

const refundsFor = async (orderId) =>
  (await db.from("refunds").select("*").eq("order_id", orderId)).data ?? [];

try {
  // ── 1. adjust_inventory ───────────────────────────────────────────────────
  section("adjust_inventory");
  {
    const { data: after, error } = await db.rpc("adjust_inventory", {
      p_variant_id: A.id, p_delta: 5, p_reason: "restock", p_note: "p4", p_actor: ACTOR,
    });
    check("restock +5 returns the new count", !error && after === 15, error?.message ?? `${after}`);

    const { count: before } = await db
      .from("inventory_adjustments").select("id", { count: "exact", head: true }).eq("variant_id", A.id);
    const { error: e2 } = await db.rpc("adjust_inventory", {
      p_variant_id: A.id, p_delta: -20, p_reason: "manual", p_actor: ACTOR,
    });
    check("going below zero is refused (23514)", e2?.code === "23514", e2?.message?.slice(0, 60));
    check("and stock is untouched", (await stock(A)) === 15, `${await stock(A)}`);
    const { count: afterCount } = await db
      .from("inventory_adjustments").select("id", { count: "exact", head: true }).eq("variant_id", A.id);
    check("and no adjustment row was written", afterCount === before, `${before} -> ${afterCount}`);

    const { error: e3 } = await db.rpc("adjust_inventory", {
      p_variant_id: "00000000-0000-0000-0000-000000000000", p_delta: 1, p_reason: "manual", p_actor: ACTOR,
    });
    check("unknown variant is refused (P0002)", e3?.code === "P0002", e3?.message?.slice(0, 50));

    const { error: e4 } = await db.rpc("adjust_inventory", {
      p_variant_id: A.id, p_delta: 0, p_reason: "manual", p_actor: ACTOR,
    });
    check("a zero adjustment is refused (22023)", e4?.code === "22023", e4?.message?.slice(0, 50));

    await db.rpc("adjust_inventory", { p_variant_id: A.id, p_delta: -5, p_reason: "manual", p_actor: ACTOR });
  }

  // ── 2. Refund validation ──────────────────────────────────────────────────
  section("refund validation");
  const email1 = newEmail("refunds");
  const o1 = await makeOrder({ email: email1, lines: [{ variant: A, quantity: 2 }, { variant: B, quantity: 1 }] });
  const other = await makeOrder({ email: newEmail("other"), lines: [{ variant: B, quantity: 1 }] });
  // 2×500 + 300 + 60 shipping = ₹1,360
  check("fixture order total is 136000p", o1.total_paise === 136000, `${o1.total_paise}`);
  check("stock after the order: A 8, B 8", (await stock(A)) === 8 && (await stock(B)) === 8,
    `A ${await stock(A)}, B ${await stock(B)}`);

  {
    const { error } = await begin(o1.id, 136001);
    check("refund larger than the order is refused (22023)", error?.code === "22023", error?.message?.slice(0, 70));
    const { error: e0 } = await begin(o1.id, 0);
    check("a zero refund is refused", e0?.code === "22023", e0?.message?.slice(0, 50));
    const { error: eNeg } = await begin(o1.id, -500);
    check("a negative refund is refused", eNeg?.code === "22023", eNeg?.message?.slice(0, 50));
    const { error: eOver } = await begin(o1.id, 1000, {
      restock: [{ order_item_id: itemFor(o1, A).id, quantity: 3 }],
    });
    check("restocking 3 of 2 sold is refused", eOver?.code === "22023", eOver?.message?.slice(0, 70));
    const { error: eDup } = await begin(o1.id, 1000, {
      restock: [
        { order_item_id: itemFor(o1, A).id, quantity: 2 },
        { order_item_id: itemFor(o1, A).id, quantity: 1 },
      ],
    });
    check("splitting 3 of 2 across duplicate lines is refused", eDup?.code === "22023", eDup?.message?.slice(0, 60));
    const { error: eForeign } = await begin(o1.id, 1000, {
      restock: [{ order_item_id: other.order_items[0].id, quantity: 1 }],
    });
    check("restocking another order's item is refused", eForeign?.code === "22023", eForeign?.message?.slice(0, 60));
    check("none of that left a refund row", (await refundsFor(o1.id)).length === 0);
  }

  // ── 3. Partial refund, then idempotent completion ─────────────────────────
  section("partial refund");
  const spentBefore = (await customer(email1)).total_spent_paise;
  let r1;
  {
    const { data, error } = await begin(o1.id, 20000, {
      restock: [{ order_item_id: itemFor(o1, A).id, quantity: 1 }],
    });
    r1 = data?.refund_id;
    check("begin a ₹200 refund with 1×A restock", !error && !!r1, error?.message ?? data?.order_number);

    const { error: eOverPending } = await begin(o1.id, 136000 - 20000 + 1);
    check("the pending ₹200 counts against what's left", eOverPending?.code === "22023",
      eOverPending?.message?.slice(0, 60));

    const { error: eRestockPending } = await begin(o1.id, 1000, {
      restock: [{ order_item_id: itemFor(o1, A).id, quantity: 2 }],
    });
    check("the pending restock counts against what's left", eRestockPending?.code === "22023",
      eRestockPending?.message?.slice(0, 60));

    const orderMid = await loadOrder(o1.id);
    check("nothing moves until completion", orderMid.refunded_paise === 0 && (await stock(A)) === 8,
      `refunded ${orderMid.refunded_paise}, A ${await stock(A)}`);

    const rzp = rid("rfnd_test");
    const { data: done, error: eDone } = await complete(r1, rzp);
    check("complete it", !eDone && done?.already_processed === false, eDone?.message ?? done?.payment_status);

    const after = await loadOrder(o1.id);
    check("refunded_paise 20000, partially_refunded",
      after.refunded_paise === 20000 && after.payment_status === "partially_refunded",
      `${after.refunded_paise}, ${after.payment_status}`);
    check("A back to 9", (await stock(A)) === 9, `${await stock(A)}`);
    check("restocked_quantity on the line is 1", itemFor(after, A).restocked_quantity === 1,
      `${itemFor(after, A).restocked_quantity}`);
    const { data: adj } = await db
      .from("inventory_adjustments").select("delta, reason").eq("order_id", o1.id).eq("reason", "refund");
    check("a 'refund' inventory adjustment was logged", adj?.length === 1 && adj[0].delta === 1, JSON.stringify(adj));
    check("customer spend reduced by 20000",
      (await customer(email1)).total_spent_paise === spentBefore - 20000,
      `${spentBefore} -> ${(await customer(email1)).total_spent_paise}`);
    check("order.refunded queued for n8n", (await outboxCount(o1.id, "order.refunded")) === 1);
    const { count: audits } = await db
      .from("audit_log").select("id", { count: "exact", head: true })
      .eq("entity_id", o1.id).eq("action", "order.refund");
    check("audit row written inside the transaction", audits === 1, `${audits}`);

    // Completing again must change nothing.
    const { data: again } = await complete(r1, rzp);
    const afterAgain = await loadOrder(o1.id);
    check("completing twice is a no-op", again?.already_processed === true
      && afterAgain.refunded_paise === 20000 && (await stock(A)) === 9
      && (await outboxCount(o1.id, "order.refunded")) === 1,
      `refunded ${afterAgain.refunded_paise}, A ${await stock(A)}`);

    const { error: eFailDone } = await fail(r1);
    check("a processed refund cannot be marked failed", eFailDone?.code === "55000", eFailDone?.message?.slice(0, 50));
  }

  // ── 4. A failed refund releases its reservation ───────────────────────────
  section("failed refund");
  {
    const { data } = await begin(o1.id, 50000);
    const { error: eFail } = await fail(data.refund_id, "Razorpay said no");
    check("mark a refund failed", !eFail, eFail?.message);
    const { data: row } = await db.from("refunds").select("status, error").eq("id", data.refund_id).single();
    check("status failed, error kept", row.status === "failed" && row.error === "Razorpay said no", row.status);
    const { data: again, error } = await begin(o1.id, 116000);
    check("the full remainder can be reserved again", !error && !!again?.refund_id, error?.message);
    await fail(again.refund_id, "released for the next test");

    const { data: dupe } = await begin(o1.id, 1000);
    const { error: eReuse } = await complete(dupe.refund_id, (await db.from("refunds").select("razorpay_refund_id").eq("id", r1).single()).data.razorpay_refund_id);
    check("the same Razorpay refund id can't be applied twice", !!eReuse, eReuse?.code);
    await fail(dupe.refund_id, "cleanup");
  }

  // ── 5. Cancel with a refund ───────────────────────────────────────────────
  section("cancel + restock");
  {
    const before = await customer(email1);
    const remaining = 136000 - 20000;
    const restock = [
      { order_item_id: itemFor(o1, A).id, quantity: 1 },
      { order_item_id: itemFor(o1, B).id, quantity: 1 },
    ];
    const { error: ePartialCancel } = await begin(o1.id, remaining - 1, { cancel: true, restock });
    check("a cancel must refund everything left", ePartialCancel?.code === "22023",
      ePartialCancel?.message?.slice(0, 60));

    const { data, error } = await begin(o1.id, remaining, { cancel: true, restock, reason: "Changed mind" });
    check("begin the cancellation", !error, error?.message ?? data?.refund_id);
    const { error: eSecond } = await begin(o1.id, 1, { cancel: true });
    check("a second cancellation while one is pending is refused", eSecond?.code === "55000"
      || eSecond?.code === "22023", eSecond?.message?.slice(0, 60));

    const { error: eDone } = await complete(data.refund_id);
    check("complete the cancellation", !eDone, eDone?.message);
    const after = await loadOrder(o1.id);
    check("order cancelled, fulfilment cancelled, fully refunded",
      after.order_status === "cancelled" && after.fulfillment_status === "cancelled"
      && after.payment_status === "refunded" && after.refunded_paise === 136000,
      `${after.order_status}/${after.fulfillment_status}/${after.payment_status}`);
    check("cancel reason recorded", after.cancel_reason === "Changed mind", after.cancel_reason);
    check("stock fully back: A 10, B 9 (B still has the other order)",
      (await stock(A)) === 10 && (await stock(B)) === 9, `A ${await stock(A)}, B ${await stock(B)}`);
    check("order.cancelled queued", (await outboxCount(o1.id, "order.cancelled")) === 1);
    const c = await customer(email1);
    check("customer: one fewer order, spend back to zero",
      c.total_orders === before.total_orders - 1 && c.total_spent_paise === 0,
      `${c.total_orders} orders, ${c.total_spent_paise}p`);

    const { error: eTwice } = await begin(o1.id, 1000, { cancel: true });
    check("cancelling twice is refused (55000)", eTwice?.code === "55000", eTwice?.message?.slice(0, 50));
    const { error: eTwice2 } = await db.rpc("cancel_order", { p_order_id: o1.id, p_actor: ACTOR });
    check("…through cancel_order too", eTwice2?.code === "55000", eTwice2?.message?.slice(0, 50));
    const { error: eRefundCancelled } = await begin(o1.id, 1000);
    check("a cancelled order takes no more refunds", eRefundCancelled?.code === "55000");
  }

  // ── 6. Fulfilled orders can be refunded but not cancelled ─────────────────
  section("fulfilled order");
  {
    const o2 = await makeOrder({ email: newEmail("fulfilled"), lines: [{ variant: B, quantity: 1 }] });
    await db.from("orders").update({ fulfillment_status: "fulfilled" }).eq("id", o2.id);
    const { error } = await begin(o2.id, o2.total_paise, { cancel: true });
    check("cancelling a fulfilled order is refused (55000)", error?.code === "55000", error?.message?.slice(0, 60));
    const { error: eCancel } = await db.rpc("cancel_order", { p_order_id: o2.id, p_actor: ACTOR });
    check("…through cancel_order too", eCancel?.code === "55000");
    const { data, error: eRefund } = await begin(o2.id, 5000);
    check("but it can still be refunded", !eRefund && !!data?.refund_id, eRefund?.message);
    await complete(data.refund_id);
  }

  // ── 7. Restocking a deleted variant ───────────────────────────────────────
  section("deleted variant");
  {
    const o3 = await makeOrder({ email: newEmail("deleted"), lines: [{ variant: C, quantity: 2 }, { variant: A, quantity: 1 }] });
    const itemC = itemFor(o3, C);
    const itemA = itemFor(o3, A);
    const { error: eDel } = await db.from("product_variants").delete().eq("id", C.id);
    check("variant C deleted", !eDel, eDel?.message);
    const aBefore = await stock(A);

    const { data, error } = await begin(o3.id, o3.total_paise, {
      cancel: true,
      restock: [{ order_item_id: itemC.id, quantity: 2 }, { order_item_id: itemA.id, quantity: 1 }],
    });
    check("begin a cancel that restocks the deleted variant", !error, error?.message);
    const { data: done, error: eDone } = await complete(data.refund_id);
    check("completes instead of failing", !eDone, eDone?.message);
    check("the deleted line is reported as skipped",
      done?.skipped?.length === 1 && done.skipped[0].title === "P4 test book", JSON.stringify(done?.skipped));
    check("the live line was restocked", (await stock(A)) === aBefore + 1, `${aBefore} -> ${await stock(A)}`);
    const after = await loadOrder(o3.id);
    const lineC = after.order_items.find((i) => i.id === itemC.id);
    check("the deleted line is marked dealt with", lineC.restocked_quantity === 2 && lineC.variant_id === null,
      `${lineC.restocked_quantity}`);
  }

  // ── 8. A failure halfway through leaves nothing behind ────────────────────
  section("atomicity");
  {
    const o4 = await makeOrder({ email: newEmail("atomic"), lines: [{ variant: A, quantity: 2 }] });
    const aBefore = await stock(A);
    const { data: first } = await begin(o4.id, o4.total_paise, {
      restock: [{ order_item_id: o4.order_items[0].id, quantity: 1 }],
    });
    await fail(first.refund_id, "timed out");
    const { data: second } = await begin(o4.id, o4.total_paise);
    await complete(second.refund_id);

    const outboxBefore = await outboxCount(o4.id, "order.refunded");
    // The first refund, marked failed, now claims Razorpay succeeded after all.
    // Applying it would refund more than the order is worth, so the money
    // constraint fires after the refund row has already been marked processed
    // in the same transaction. All of it must roll back.
    const { error } = await complete(first.refund_id);
    check("over-refunding through a late completion is refused", !!error, `${error?.code} ${error?.message?.slice(0, 50)}`);
    const after = await loadOrder(o4.id);
    const { data: row } = await db.from("refunds").select("status").eq("id", first.refund_id).single();
    check("refund row still failed", row.status === "failed", row.status);
    check("refunded_paise unchanged", after.refunded_paise === o4.total_paise, `${after.refunded_paise}`);
    check("stock unchanged", (await stock(A)) === aBefore, `${aBefore} -> ${await stock(A)}`);
    check("restocked_quantity unchanged", after.order_items[0].restocked_quantity === 0,
      `${after.order_items[0].restocked_quantity}`);
    check("no extra outbox row", (await outboxCount(o4.id, "order.refunded")) === outboxBefore);
  }
  {
    // A failure in the middle of the restock loop: the first line has already
    // gone back on the shelf and the order's money has moved when the second
    // line trips its constraint. Lines are restocked in order_item id order,
    // so corrupt whichever sorts last.
    const o7 = await makeOrder({ email: newEmail("midway"), lines: [{ variant: A, quantity: 2 }, { variant: B, quantity: 1 }] });
    const [firstItem, lastItem] = [...o7.order_items].sort((x, y) => (x.id < y.id ? -1 : 1));
    const firstVariant = firstItem.variant_id === A.id ? A : B;
    const lastVariant = lastItem.variant_id === A.id ? A : B;
    const { data } = await begin(o7.id, 1000, {
      restock: o7.order_items.map((i) => ({ order_item_id: i.id, quantity: i.quantity })),
    });
    await db.from("order_items").update({ restocked_quantity: lastItem.quantity }).eq("id", lastItem.id);

    const firstStock = await stock(firstVariant);
    const lastStock = await stock(lastVariant);
    const { error } = await complete(data.refund_id);
    check("a constraint failing mid-restock aborts the refund", error?.code === "23514",
      `${error?.code} ${error?.message?.slice(0, 40)}`);
    const after = await loadOrder(o7.id);
    const { data: row } = await db.from("refunds").select("status").eq("id", data.refund_id).single();
    check("refund still pending, no money moved", row.status === "pending" && after.refunded_paise === 0
      && after.payment_status === "paid", `${row.status}, ${after.refunded_paise}`);
    check("the line restocked before the failure was rolled back",
      (await stock(firstVariant)) === firstStock && (await stock(lastVariant)) === lastStock
      && after.order_items.find((i) => i.id === firstItem.id).restocked_quantity === 0,
      `${firstStock} -> ${await stock(firstVariant)}`);
    check("no outbox row, no audit row",
      (await outboxCount(o7.id, "order.refunded")) === 0
      && (await db.from("audit_log").select("id", { count: "exact", head: true })
        .eq("entity_id", o7.id).eq("action", "order.refund")).count === 0);
    await db.from("order_items").update({ restocked_quantity: 0 }).eq("id", lastItem.id);
    await fail(data.refund_id, "cleanup");
  }

  // ── 9. cancel_order with nothing left to refund ───────────────────────────
  section("cancel_order (no money)");
  {
    const o5 = await makeOrder({ email: newEmail("nomoney"), lines: [{ variant: B, quantity: 2 }] });
    const { error: eStillPaid } = await db.rpc("cancel_order", { p_order_id: o5.id, p_actor: ACTOR });
    check("refused while money is still on the order", eStillPaid?.code === "55000", eStillPaid?.message?.slice(0, 60));

    const { data } = await begin(o5.id, o5.total_paise);
    const { error: ePending } = await db.rpc("cancel_order", { p_order_id: o5.id, p_actor: ACTOR });
    check("refused while a refund is pending", ePending?.code === "55000");
    await complete(data.refund_id);

    const bBefore = await stock(B);
    const { error } = await db.rpc("cancel_order", {
      p_order_id: o5.id,
      p_restock: [{ order_item_id: o5.order_items[0].id, quantity: 2 }],
      p_reason: "Refunded already",
      p_actor: ACTOR,
    });
    check("cancels a fully refunded order", !error, error?.message);
    const after = await loadOrder(o5.id);
    check("cancelled, B restocked by 2", after.order_status === "cancelled" && (await stock(B)) === bBefore + 2,
      `${after.order_status}, B ${bBefore} -> ${await stock(B)}`);
    check("order.cancelled queued", (await outboxCount(o5.id, "order.cancelled")) === 1);
  }

  // ── 10. Out of stock after payment ────────────────────────────────────────
  section("out of stock after payment");
  {
    const emailOos = newEmail("oos");
    const first = await makeCheckout({ email: emailOos, lines: [{ variant: D, quantity: 1 }] });
    const second = await makeCheckout({ email: emailOos, lines: [{ variant: D, quantity: 1 }] });
    const { error: e1 } = await placeOrder(first.id);
    check("the first buyer gets the last copy", !e1, e1?.message);

    const payment = rid("pay_test");
    const { error: e2 } = await db.rpc("create_order_from_checkout", {
      p_checkout_id: second.id, p_razorpay_order_id: rid(), p_razorpay_payment_id: payment, p_razorpay_signature: "",
    });
    check("the second fails with its own code, OOS01", e2?.code === "OOS01", `${e2?.code} ${e2?.message?.slice(0, 40)}`);

    const noEmail = await makeCheckout({ email: "", lines: [{ variant: A, quantity: 1 }] });
    await db.from("checkouts").update({ shipping_address: {} }).eq("id", noEmail.id);
    const { error: e3 } = await placeOrder(noEmail.id);
    check("'no email' is no longer confused with it (23514)", e3?.code === "23514", e3?.code);
    await db.from("checkouts").delete().eq("id", noEmail.id);

    const rec = () => db.rpc("record_out_of_stock_payment", {
      p_checkout_id: second.id, p_razorpay_payment_id: payment, p_actor: ACTOR,
    });
    const { data: a, error: ea } = await rec();
    check("record the refund owed", !ea && a?.created === true && a.amount_paise === second.total_paise,
      ea?.message ?? `${a?.amount_paise}p`);
    const { data: b } = await rec();
    check("recording again returns the same refund, not a second one",
      b?.created === false && b.refund_id === a.refund_id);
    const { count } = await db
      .from("refunds").select("id", { count: "exact", head: true }).eq("checkout_id", second.id);
    check("exactly one refund row for the checkout", count === 1, `${count}`);

    await db.rpc("adjust_inventory", { p_variant_id: D.id, p_delta: 5, p_reason: "restock", p_actor: ACTOR });
    const { error: e4 } = await db.rpc("create_order_from_checkout", {
      p_checkout_id: second.id, p_razorpay_order_id: rid(), p_razorpay_payment_id: payment, p_razorpay_signature: "",
    });
    check("a retry after restocking still refuses (no book + refund)", e4?.code === "OOS01", e4?.code);

    const { error: eDone } = await complete(a.refund_id);
    check("complete the out-of-stock refund", !eDone, eDone?.message);
    const { data: checkout } = await db.from("checkouts").select("status").eq("id", second.id).single();
    check("checkout marked refunded", checkout.status === "refunded", checkout.status);

    const { error: eDoneCheckout } = await db.rpc("record_out_of_stock_payment", {
      p_checkout_id: first.id, p_razorpay_payment_id: "pay_x", p_actor: ACTOR,
    });
    check("a checkout that became an order can't be refunded this way", eDoneCheckout?.code === "55000");
  }

  // ── 11. Free-shipping codes count as used ─────────────────────────────────
  section("free-shipping redemption");
  {
    const emailFs = newEmail("freeship");
    const o6 = await makeOrder({ email: emailFs, lines: [{ variant: B, quantity: 1 }], shipping: 0, discountCode: freeShip.code });
    const { data: d } = await db.from("discounts").select("used_count").eq("id", freeShip.id).single();
    check("used_count bumped for a zero-value code", d.used_count === 1, `${d.used_count}`);
    const { data: red } = await db
      .from("discount_redemptions").select("amount_paise, order_id").eq("discount_id", freeShip.id);
    check("redemption recorded (amount 0)", red?.length === 1 && red[0].order_id === o6.id && red[0].amount_paise === 0,
      JSON.stringify(red));
  }

  // ── 12. Marketing consent ─────────────────────────────────────────────────
  section("marketing consent");
  {
    const emailMk = newEmail("marketing");
    await makeOrder({ email: emailMk, lines: [{ variant: B, quantity: 1 }] });
    const c0 = await customer(emailMk);
    check("unticked box: no consent", c0.accepts_marketing === false && c0.marketing_consent_at === null);

    await makeOrder({ email: emailMk, lines: [{ variant: B, quantity: 1 }], marketing: true });
    const c1 = await customer(emailMk);
    check("ticked box: consent and a timestamp", c1.accepts_marketing === true && !!c1.marketing_consent_at,
      c1.marketing_consent_at?.slice(0, 19));

    await makeOrder({ email: emailMk, lines: [{ variant: B, quantity: 1 }], marketing: false });
    const c2 = await customer(emailMk);
    check("a later unticked order never flips yes to no",
      c2.accepts_marketing === true && c2.marketing_consent_at === c1.marketing_consent_at);
  }
  // ── 13. The browser's key can reach none of it ────────────────────────────
  section("anon access");
  {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const uuid = "00000000-0000-0000-0000-000000000000";
    const calls = {
      adjust_inventory: { p_variant_id: A.id, p_delta: 100, p_reason: "manual", p_note: "", p_actor: "anon" },
      begin_refund: { p_order_id: uuid, p_amount_paise: 1, p_restock: [], p_cancel: false, p_reason: "", p_actor: "anon" },
      complete_refund: { p_refund_id: uuid, p_razorpay_refund_id: "x", p_actor: "anon" },
      fail_refund: { p_refund_id: uuid, p_error: "x", p_actor: "anon" },
      cancel_order: { p_order_id: uuid, p_restock: [], p_reason: "", p_actor: "anon" },
      record_out_of_stock_payment: { p_checkout_id: uuid, p_razorpay_payment_id: "x", p_actor: "anon" },
      admin_sales_summary: {},
    };
    for (const [fn, args] of Object.entries(calls)) {
      const { error } = await anon.rpc(fn, args);
      check(`anon cannot call ${fn}`, error?.code === "42501", error?.code ?? "no error!");
    }
    const { error: tableError } = await anon.from("refunds").select("id").limit(1);
    check("anon cannot read refunds", tableError?.code === "42501", tableError?.code ?? "no error!");
  }
} finally {
  // ── Cleanup ───────────────────────────────────────────────────────────────
  const { data: orders } = await db.from("orders").select("id").in("email", emails);
  const orderIds = (orders ?? []).map((o) => o.id);
  const { data: checkouts } = await db.from("checkouts").select("id").in("email", emails);
  const checkoutIds = (checkouts ?? []).map((c) => c.id);

  if (orderIds.length) {
    await db.from("refunds").delete().in("order_id", orderIds);
    for (const id of orderIds) await db.from("webhook_outbox").delete().eq("payload->>order_id", id);
  }
  if (checkoutIds.length) await db.from("refunds").delete().in("checkout_id", checkoutIds);
  if (orderIds.length) await db.from("orders").delete().in("id", orderIds);
  if (checkoutIds.length) await db.from("checkouts").delete().in("id", checkoutIds);
  await db.from("customers").delete().in("email", emails);
  await db.from("audit_log").delete().eq("admin_email", ACTOR);
  await db.from("discounts").delete().eq("id", freeShip.id);
  await db.from("products").delete().eq("id", product.id);
  console.log("\ncleaned up fixtures");
}

console.log(failures === 0 ? "\nAll P4 checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
