/**
 * P4 through the running app: the out-of-stock path on both the browser
 * callback and the webhook, the marketing opt-in on /api/checkout, and the
 * signed-out gate on every new admin route.
 *
 *     node --env-file=.env.local --env-file=.env.development.local scripts/verify/p4-app-test.mjs
 *
 * Needs a dev server with the same Razorpay key secret and webhook secret.
 * The out-of-stock refund here is for a made-up payment id, so Razorpay has no
 * such payment: this proves the refund is recorded once and retried, not that
 * money moves. A real refund needs a real captured test payment.
 */
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
if (!KEY_SECRET || !WEBHOOK_SECRET) {
  console.error("RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET must be set for this suite.");
  process.exit(1);
}
if (!process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_")) {
  console.error("Refusing to run: RAZORPAY_KEY_ID is not a test key.");
  process.exit(1);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(58)} ${detail}`);
};

const RUN = Date.now();
const email = `p4-app-${RUN}@example.com`;
const rid = (p) => `${p}_${Math.random().toString(36).slice(2, 12)}`;

const post = async (path, body, headers = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const { data: product } = await db
  .from("products")
  .insert({ handle: `p4-app-${RUN}`, title: "P4 app test book", status: "active" })
  .select("id")
  .single();
const { data: variant } = await db
  .from("product_variants")
  .insert({ product_id: product.id, title: "Default", price_paise: 40000, inventory_quantity: 1, weight_grams: 300 })
  .select("id")
  .single();

async function checkoutWithRazorpayOrder() {
  const { data, error } = await db
    .from("checkouts")
    .insert({
      email,
      line_items: [{ variant_id: variant.id, quantity: 1, unit_price_paise: 40000 }],
      subtotal_paise: 40000,
      shipping_paise: 6000,
      total_paise: 46000,
      razorpay_order_id: rid("order_p4app"),
      shipping_address: { name: "Late Buyer", phone: "9999999999", line1: "1 Road", city: "Kochi", state: "Kerala", pincode: "682001", email },
    })
    .select("id, razorpay_order_id")
    .single();
  if (error) throw error;
  return data;
}

const sign = (orderId, paymentId) => createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");

try {
  // ── The last copy goes to the first buyer ─────────────────────────────────
  const first = await checkoutWithRazorpayOrder();
  const second = await checkoutWithRazorpayOrder();
  const firstPay = rid("pay_p4app");
  const r1 = await post("/api/checkout/confirm", {
    checkoutId: first.id,
    razorpayOrderId: first.razorpay_order_id,
    razorpayPaymentId: firstPay,
    razorpaySignature: sign(first.razorpay_order_id, firstPay),
  });
  check("first buyer's callback creates the order", r1.status === 200 && !!r1.body.orderNumber, r1.body.orderNumber);

  // ── The second buyer's callback: sold out ─────────────────────────────────
  const secondPay = rid("pay_p4app");
  const r2 = await post("/api/checkout/confirm", {
    checkoutId: second.id,
    razorpayOrderId: second.razorpay_order_id,
    razorpayPaymentId: secondPay,
    razorpaySignature: sign(second.razorpay_order_id, secondPay),
  });
  check("second callback answers 409, paid and out of stock",
    r2.status === 409 && r2.body.outOfStock === true && r2.body.paid === true, `${r2.status}`);
  check("and tells the buyer they will be refunded", /refunded in full/.test(r2.body.error ?? ""), r2.body.error?.slice(0, 60));

  const refundsFor = async () =>
    (await db.from("refunds").select("id, status, amount_paise, created_by, kind").eq("checkout_id", second.id)).data ?? [];
  let rows = await refundsFor();
  check("the callback recorded the refund owed, once", rows.length === 1 && rows[0].status === "pending"
    && rows[0].amount_paise === 46000 && rows[0].kind === "out_of_stock", `${rows[0]?.created_by}, ${rows[0]?.amount_paise}p`);
  const { count: secondOrders } = await db
    .from("orders").select("id", { count: "exact", head: true }).eq("razorpay_order_id", second.razorpay_order_id);
  check("no order exists for the second payment", secondOrders === 0, `${secondOrders}`);

  // ── Razorpay's webhook for the same payment ───────────────────────────────
  const webhook = () => {
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: secondPay, order_id: second.razorpay_order_id, status: "captured" } } },
    });
    return post("/api/webhooks/razorpay", body, {
      "x-razorpay-signature": createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex"),
    });
  };
  const w1 = await webhook();
  // The payment id is invented, so Razorpay can't find it and the pre-refund
  // check fails: the webhook must ask to be retried rather than guess.
  check("webhook asks Razorpay to retry when the refund can't be confirmed", w1.status === 500, `${w1.status}`);
  const w2 = await webhook();
  rows = await refundsFor();
  check("a retried webhook still leaves exactly one refund row", w2.status === 500 && rows.length === 1, `${rows.length} row(s)`);
  check("still pending, never marked failed on a transient error", rows[0].status === "pending", rows[0].status);

  // ── A well-formed payment id Razorpay has never seen ──────────────────────
  // Razorpay lists no refunds for it, then refuses to refund it. That is a
  // permanent answer: the row is marked failed, and the webhook acknowledges
  // (200) instead of making Razorpay retry for a day. The admin home shows it.
  {
    const third = await checkoutWithRazorpayOrder();
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const thirdPay = "pay_" + Array.from({ length: 14 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: thirdPay, order_id: third.razorpay_order_id, status: "captured" } } },
    });
    const w = await post("/api/webhooks/razorpay", body, {
      "x-razorpay-signature": createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex"),
    });
    const { data: thirdRows } = await db.from("refunds").select("status, error, created_by").eq("checkout_id", third.id);
    check("webhook alone records the refund when the browser never came back",
      thirdRows?.length === 1 && thirdRows[0].created_by === "razorpay-webhook", thirdRows?.[0]?.created_by);
    check("Razorpay refusing the refund marks it failed, with the reason",
      thirdRows?.[0]?.status === "failed" && !!thirdRows[0].error, thirdRows?.[0]?.error?.slice(0, 60));
    check("and the webhook acknowledges rather than retrying forever",
      w.status === 200 && w.body.outOfStock === true && w.body.refunded === false, `${w.status}`);
  }

  // ── Opt-in on /api/checkout ───────────────────────────────────────────────
  const basket = {
    lines: [{ variantId: variant.id, quantity: 1 }],
    email,
    address: { name: "Opt In", phone: "9999999999", line1: "1 Road", city: "Kochi", state: "Kerala", pincode: "682001" },
  };
  await db.from("product_variants").update({ inventory_quantity: 5 }).eq("id", variant.id);

  const withYes = await post("/api/checkout", { ...basket, acceptsMarketing: true });
  const withNothing = await post("/api/checkout", basket);
  const withString = await post("/api/checkout", { ...basket, acceptsMarketing: "yes" });
  const marketing = async (id) =>
    (await db.from("checkouts").select("accepts_marketing").eq("id", id).single()).data?.accepts_marketing;
  check("ticked box stored as consent", withYes.status === 200 && (await marketing(withYes.body.checkoutId)) === true,
    `${withYes.status}`);
  check("no field means no consent", withNothing.status === 200 && (await marketing(withNothing.body.checkoutId)) === false,
    `${withNothing.status}`);
  check("anything but a real boolean is refused", withString.status === 400, `${withString.status}`);

  // ── Signed out, every new admin route sends you to the login ─────────────
  const { data: someOrder } = await db.from("orders").select("id").eq("razorpay_order_id", first.razorpay_order_id).single();
  for (const path of [
    "/admin",
    "/admin/orders",
    `/admin/orders/${someOrder.id}`,
    "/admin/customers",
    "/admin/discounts",
    "/admin/discounts/new",
  ]) {
    const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
    const location = res.headers.get("location") ?? "";
    check(`signed out: ${path}`, res.status === 307 && location.includes("/admin/login"), `${res.status} → ${location.replace(BASE, "")}`);
  }
} finally {
  const { data: orders } = await db.from("orders").select("id").eq("email", email);
  const { data: checkouts } = await db.from("checkouts").select("id").eq("email", email);
  for (const o of orders ?? []) await db.from("webhook_outbox").delete().eq("payload->>order_id", o.id);
  if (checkouts?.length) await db.from("refunds").delete().in("checkout_id", checkouts.map((c) => c.id));
  await db.from("orders").delete().eq("email", email);
  await db.from("checkouts").delete().eq("email", email);
  await db.from("customers").delete().eq("email", email);
  await db.from("audit_log").delete().in("entity_id", (checkouts ?? []).map((c) => c.id));
  // Stock crossing the low-stock threshold queues inventory.low (P6).
  await db.from("webhook_outbox").delete().eq("topic", "inventory.low").eq("payload->>product_id", product.id);
  await db.from("products").delete().eq("id", product.id);
  console.log("\ncleaned up fixtures");
}

console.log(failures === 0 ? "\nAll P4 app checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
