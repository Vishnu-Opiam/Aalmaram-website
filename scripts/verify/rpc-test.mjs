/**
 * Checks that create_order_from_checkout is genuinely atomic and idempotent:
 * an oversell rolls everything back, a replay returns the same order, and the
 * same razorpay_order_id can never produce a second one.
 *
 *     node --env-file=.env.local scripts/verify/rpc-test.mjs
 *
 * Talks to the database directly; no dev server needed. Cleans up after itself.
 */
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(52)} ${detail}`);
};

const rid = () => `order_test_${Math.random().toString(36).slice(2, 12)}`;

// ── Fixture ─────────────────────────────────────────────────────────────────
const { data: product } = await db
  .from("products")
  .insert({ handle: `rpc-test-${Date.now()}`, title: "RPC test book", status: "active" })
  .select("id")
  .single();

const { data: variant } = await db
  .from("product_variants")
  .insert({
    product_id: product.id,
    title: "Default",
    sku: `RPC-${Date.now()}`,
    price_paise: 50000,
    inventory_quantity: 3,
    weight_grams: 400,
  })
  .select("id")
  .single();

const { data: discount } = await db
  .from("discounts")
  .insert({ code: `RPCTEST${Date.now()}`, type: "percentage", value: 10, applies_to: "all" })
  .select("id, code")
  .single();

const email = `rpc-test-${Date.now()}@example.com`;

async function makeCheckout({ quantity, withDiscount = false, discountPaise = 0 }) {
  const subtotal = 50000 * quantity;
  const { data, error } = await db
    .from("checkouts")
    .insert({
      email,
      line_items: [{ variant_id: variant.id, quantity, unit_price_paise: 50000 }],
      subtotal_paise: subtotal,
      discount_paise: discountPaise,
      shipping_paise: 6000,
      total_paise: subtotal - discountPaise + 6000,
      discount_code: withDiscount ? discount.code : null,
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

const stock = async () =>
  (await db.from("product_variants").select("inventory_quantity").eq("id", variant.id).single())
    .data.inventory_quantity;

try {
  // ── 1. Happy path ─────────────────────────────────────────────────────────
  const c1 = await makeCheckout({ quantity: 2 });
  const rz1 = rid();
  const { data: r1, error: e1 } = await db.rpc("create_order_from_checkout", {
    p_checkout_id: c1.id,
    p_razorpay_order_id: rz1,
    p_razorpay_payment_id: "pay_test_1",
    p_razorpay_signature: "sig_test_1",
  });
  check("order created", !e1 && !!r1?.order_number, e1?.message ?? r1?.order_number);

  const { data: order } = await db
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", r1.order_id)
    .single();

  check("payment_status paid", order.payment_status === "paid", order.payment_status);
  check("totals copied from checkout", order.total_paise === c1.total_paise, `${order.total_paise}`);
  check("placed_at stamped", !!order.placed_at, order.placed_at?.slice(0, 19));
  check("one line item, snapshotted", order.order_items.length === 1,
    `${order.order_items[0]?.title} x${order.order_items[0]?.quantity} @ ${order.order_items[0]?.unit_price_paise}`);
  check("line total = unit x qty", order.order_items[0].total_paise === 100000, `${order.order_items[0].total_paise}`);
  check("stock decremented 3 -> 1", (await stock()) === 1, `${await stock()}`);

  const { data: adj } = await db
    .from("inventory_adjustments")
    .select("delta, reason, order_id")
    .eq("order_id", order.id);
  check("inventory adjustment logged", adj?.[0]?.delta === -2 && adj[0].reason === "order",
    JSON.stringify(adj?.[0]));

  const { data: outbox } = await db
    .from("webhook_outbox")
    .select("topic, status, payload")
    .eq("payload->>order_id", order.id);
  check("order.paid queued for n8n", outbox?.[0]?.topic === "order.paid" && outbox[0].status === "pending",
    `${outbox?.[0]?.topic}, ${outbox?.[0]?.payload?.items?.length} item(s)`);

  const { data: checkoutAfter } = await db
    .from("checkouts").select("status, completed_order_id").eq("id", c1.id).single();
  check("checkout marked completed", checkoutAfter.status === "completed" && checkoutAfter.completed_order_id === order.id,
    checkoutAfter.status);

  const { data: customer } = await db
    .from("customers").select("id, total_orders, total_spent_paise, first_name, last_name").eq("email", email).single();
  check("customer created with totals", customer.total_orders === 1 && customer.total_spent_paise === c1.total_paise,
    `${customer.first_name} ${customer.last_name}, ${customer.total_orders} order(s), ${customer.total_spent_paise}p`);

  // ── 2. Idempotency: same checkout replayed ────────────────────────────────
  const stockBefore = await stock();
  const { data: r2, error: e2 } = await db.rpc("create_order_from_checkout", {
    p_checkout_id: c1.id,
    p_razorpay_order_id: rz1,
    p_razorpay_payment_id: "pay_test_1",
    p_razorpay_signature: "sig_test_1",
  });
  check("replaying the checkout returns the same order",
    !e2 && r2?.order_id === r1.order_id && r2?.already_existed === true, r2?.order_number);
  check("replay did not touch stock", (await stock()) === stockBefore, `${await stock()}`);

  const { count: orderCount } = await db
    .from("orders").select("id", { count: "exact", head: true }).eq("razorpay_order_id", rz1);
  check("still exactly one order for that payment", orderCount === 1, `${orderCount}`);

  // ── 3. Idempotency: webhook arrives on a fresh checkout, same payment ──────
  const c3 = await makeCheckout({ quantity: 1 });
  const { data: r3 } = await db.rpc("create_order_from_checkout", {
    p_checkout_id: c3.id,
    p_razorpay_order_id: rz1,
    p_razorpay_payment_id: "pay_test_1",
    p_razorpay_signature: "sig_test_1",
  });
  check("same razorpay_order_id never makes a second order",
    r3?.order_id === r1.order_id && r3?.already_existed === true, r3?.order_number);
  check("and still did not touch stock", (await stock()) === stockBefore, `${await stock()}`);

  // ── 4. Oversell must fail, and fail completely ────────────────────────────
  const c4 = await makeCheckout({ quantity: 99 });
  const { error: e4 } = await db.rpc("create_order_from_checkout", {
    p_checkout_id: c4.id,
    p_razorpay_order_id: rid(),
    p_razorpay_payment_id: "pay_test_oversell",
    p_razorpay_signature: "sig",
  });
  check("oversell rejected", !!e4, e4?.message?.slice(0, 60));
  check("stock untouched after the failure", (await stock()) === stockBefore, `${await stock()}`);
  const { data: c4After } = await db.from("checkouts").select("status").eq("id", c4.id).single();
  check("failed checkout left active (rolled back)", c4After.status === "active", c4After.status);
  const { count: orphanItems } = await db
    .from("order_items").select("id", { count: "exact", head: true }).eq("variant_id", variant.id);
  check("no orphaned order_items from the failure", orphanItems === 1, `${orphanItems}`);

  // ── 5. Discount counters ──────────────────────────────────────────────────
  const c5 = await makeCheckout({ quantity: 1, withDiscount: true, discountPaise: 5000 });
  const { data: r5, error: e5 } = await db.rpc("create_order_from_checkout", {
    p_checkout_id: c5.id,
    p_razorpay_order_id: rid(),
    p_razorpay_payment_id: "pay_test_discount",
    p_razorpay_signature: "sig",
  });
  check("discounted order created", !e5, e5?.message ?? r5?.order_number);

  const { data: discountAfter } = await db
    .from("discounts").select("used_count").eq("id", discount.id).single();
  check("discount used_count bumped", discountAfter.used_count === 1, `${discountAfter.used_count}`);

  const { data: redemption } = await db
    .from("discount_redemptions").select("amount_paise, customer_email").eq("discount_id", discount.id).single();
  check("redemption recorded", redemption?.amount_paise === 5000, `${redemption?.amount_paise}p for ${redemption?.customer_email}`);

  const { data: customer2 } = await db
    .from("customers").select("total_orders, total_spent_paise").eq("email", email).single();
  check("customer totals accumulate", customer2.total_orders === 2, `${customer2.total_orders} orders, ${customer2.total_spent_paise}p`);

  // ── 6. Empty / bad input ──────────────────────────────────────────────────
  const { error: e6 } = await db.rpc("create_order_from_checkout", {
    p_checkout_id: "00000000-0000-0000-0000-000000000000",
    p_razorpay_order_id: rid(),
    p_razorpay_payment_id: "x",
    p_razorpay_signature: "y",
  });
  check("unknown checkout rejected", /not found/.test(e6?.message ?? ""), e6?.message?.slice(0, 40));
} finally {
  // ── Cleanup ───────────────────────────────────────────────────────────────
  const { data: orders } = await db.from("orders").select("id").eq("email", email);
  for (const o of orders ?? []) {
    await db.from("webhook_outbox").delete().eq("payload->>order_id", o.id);
    await db.from("orders").delete().eq("id", o.id);
  }
  await db.from("checkouts").delete().eq("email", email);
  await db.from("customers").delete().eq("email", email);
  await db.from("discounts").delete().eq("id", discount.id);
  await db.from("products").delete().eq("id", product.id);
  console.log("\ncleaned up fixtures");
}

console.log(failures === 0 ? "\nAll RPC checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
