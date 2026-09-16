/**
 * End-to-end checks for phase 3: pricing, discount rules, signature
 * verification, and the idempotency of the callback and webhook paths.
 *
 * Needs a dev server running and the same Razorpay secrets it has:
 *
 *     node --env-file=.env.local --env-file=.env.development.local scripts/verify/p3-test.mjs
 *
 * Creates and removes its own fixtures. Safe against the real project, but it
 * does write rows, so do not point BASE_URL at production.
 */
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
// Must match whatever the running dev server has. With real Razorpay test keys
// in .env.local these come from there; before that, point both at the same
// throwaway values in .env.development.local.
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

if (!KEY_SECRET || !WEBHOOK_SECRET) {
  console.error("RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET must be set for this suite.");
  process.exit(1);
}

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

const post = async (path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})), headers: res.headers };
};

const email = `p3-test-${Date.now()}@example.com`;

// ── Fixture ─────────────────────────────────────────────────────────────────
const { data: product } = await db
  .from("products")
  .insert({
    handle: `p3-test-${Date.now()}`,
    title: "P3 test book",
    status: "active",
    tags: ["p3-tag"],
  })
  .select("id")
  .single();

const { data: variant } = await db
  .from("product_variants")
  .insert({
    product_id: product.id,
    title: "Default",
    price_paise: 30000,
    inventory_quantity: 10,
    weight_grams: 300,
  })
  .select("id")
  .single();

const codes = {};
async function makeDiscount(suffix, fields) {
  const code = `P3${suffix}${Date.now()}`.toUpperCase();
  // Backdated a minute: left to the database default (its own now()), a code
  // can look "not active yet" to an app server whose clock runs a second or
  // two behind Supabase's.
  const startsAt = new Date(Date.now() - 60_000).toISOString();
  const { data, error } = await db
    .from("discounts")
    .insert({ code, starts_at: startsAt, ...fields })
    .select("id, code")
    .single();
  if (error) throw error;
  codes[suffix] = data;
  return data;
}

try {
  const lines = [{ variantId: variant.id, quantity: 2 }];

  // ── Pricing ───────────────────────────────────────────────────────────────
  {
    const { status, body } = await post("/api/checkout/quote", { lines });
    check("quote prices from the database", status === 200 && body.subtotalPaise === 60000,
      `subtotal ${body.subtotalPaise}, shipping ${body.shippingPaise}, total ${body.totalPaise}`);
    check("shipping applied below the free threshold", body.shippingPaise === 6000, `${body.shippingPaise}`);
  }

  {
    // 60000 + 6000 = 66000, still under the 99900 free threshold; 4 x 30000 = 120000 is over.
    const { body } = await post("/api/checkout/quote", {
      lines: [{ variantId: variant.id, quantity: 4 }],
    });
    check("free shipping above the threshold", body.shippingPaise === 0 && body.totalPaise === 120000,
      `subtotal ${body.subtotalPaise}, shipping ${body.shippingPaise}`);
  }

  {
    const { status, body } = await post("/api/checkout/quote", {
      lines: [{ variantId: variant.id, quantity: 999 }],
    });
    check("quantity beyond stock rejected", status === 409, body.error);
  }

  {
    const { status } = await post("/api/checkout/quote", {
      lines: [{ variantId: "00000000-0000-0000-0000-000000000000", quantity: 1 }],
    });
    check("unknown variant rejected", status === 409, `${status}`);
  }

  // A draft product must not be purchasable even if its variant id is known.
  {
    const { data: draft } = await db
      .from("products")
      .insert({ handle: `p3-draft-${Date.now()}`, title: "P3 draft", status: "draft" })
      .select("id")
      .single();
    const { data: draftVariant } = await db
      .from("product_variants")
      .insert({ product_id: draft.id, price_paise: 100, inventory_quantity: 5 })
      .select("id")
      .single();
    const { status, body } = await post("/api/checkout/quote", {
      lines: [{ variantId: draftVariant.id, quantity: 1 }],
    });
    check("draft product cannot be bought", status === 409, body.error);
    await db.from("products").delete().eq("id", draft.id);
  }

  // ── Discounts ─────────────────────────────────────────────────────────────
  {
    const d = await makeDiscount("PCT", { type: "percentage", value: 15, applies_to: "all" });
    const { body } = await post("/api/checkout/quote", { lines, discountCode: d.code });
    check("percentage discount", body.discountPaise === 9000, `${body.discountPaise} off 60000`);
    check("code matched case-insensitively", (await post("/api/checkout/quote", { lines, discountCode: d.code.toLowerCase() })).body.discountPaise === 9000);
  }

  {
    const d = await makeDiscount("FIX", { type: "fixed_amount", value: 999999, applies_to: "all" });
    const { body } = await post("/api/checkout/quote", { lines, discountCode: d.code });
    check("fixed discount capped at the basket value", body.discountPaise === 60000, `${body.discountPaise}`);
    check("total never goes negative", body.totalPaise >= 0, `${body.totalPaise}`);
  }

  {
    const d = await makeDiscount("SHIP", { type: "free_shipping", value: 0, applies_to: "all" });
    const { body } = await post("/api/checkout/quote", { lines, discountCode: d.code });
    check("free shipping code zeroes shipping", body.shippingPaise === 0 && body.discountPaise === 0,
      `shipping ${body.shippingPaise}`);
  }

  {
    const d = await makeDiscount("MIN", {
      type: "percentage", value: 10, applies_to: "all", min_subtotal_paise: 500000,
    });
    const { body } = await post("/api/checkout/quote", { lines, discountCode: d.code });
    check("minimum subtotal enforced", body.discountPaise === 0 && !!body.discountMessage, body.discountMessage);
  }

  {
    const d = await makeDiscount("EXP", {
      type: "percentage", value: 10, applies_to: "all",
      starts_at: "2020-01-01T00:00:00Z", ends_at: "2020-02-01T00:00:00Z",
    });
    const { body } = await post("/api/checkout/quote", { lines, discountCode: d.code });
    check("expired code rejected", body.discountPaise === 0, body.discountMessage);
  }

  {
    const d = await makeDiscount("OFF", { type: "percentage", value: 10, applies_to: "all", active: false });
    const { body } = await post("/api/checkout/quote", { lines, discountCode: d.code });
    check("deactivated code rejected", body.discountPaise === 0, body.discountMessage);
  }

  {
    const d = await makeDiscount("LIM", {
      type: "percentage", value: 10, applies_to: "all", usage_limit: 1,
    });
    await db.from("discounts").update({ used_count: 1 }).eq("id", d.id);
    const { body } = await post("/api/checkout/quote", { lines, discountCode: d.code });
    check("exhausted usage limit rejected", body.discountPaise === 0, body.discountMessage);
  }

  {
    const d = await makeDiscount("SCOPE", {
      type: "percentage", value: 50, applies_to: "products",
      product_ids: ["00000000-0000-0000-0000-000000000000"],
    });
    const { body } = await post("/api/checkout/quote", { lines, discountCode: d.code });
    check("product-scoped code ignores other products", body.discountPaise === 0, body.discountMessage);
  }

  {
    const d = await makeDiscount("TAG", {
      type: "percentage", value: 20, applies_to: "tag", tag: "p3-tag",
    });
    const { body } = await post("/api/checkout/quote", { lines, discountCode: d.code });
    check("tag-scoped code applies to a matching tag", body.discountPaise === 12000, `${body.discountPaise}`);
  }

  {
    const { body } = await post("/api/checkout/quote", { lines, discountCode: "NOSUCHCODE" });
    check("unknown code reported, not applied", body.discountPaise === 0 && !!body.discountMessage,
      body.discountMessage);
  }

  // ── Signature verification ────────────────────────────────────────────────
  async function makeCheckout(rzOrderId, quantity = 2, discountCode = null, discountPaise = 0) {
    const subtotal = 30000 * quantity;
    const { data, error } = await db
      .from("checkouts")
      .insert({
        email,
        line_items: [{ variant_id: variant.id, quantity, unit_price_paise: 30000 }],
        subtotal_paise: subtotal,
        discount_paise: discountPaise,
        shipping_paise: 6000,
        total_paise: subtotal - discountPaise + 6000,
        discount_code: discountCode,
        razorpay_order_id: rzOrderId,
        shipping_address: {
          name: "Test Buyer", phone: "9999999999", line1: "1 Test Road",
          city: "Kochi", state: "Kerala", pincode: "682001", country: "India", email,
        },
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  const sign = (orderId, paymentId) =>
    createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");

  const rzOrder = `order_p3_${Date.now()}`;
  const rzPayment = `pay_p3_${Date.now()}`;
  const checkoutId = await makeCheckout(rzOrder);

  {
    const { status, body } = await post("/api/checkout/confirm", {
      checkoutId,
      razorpayOrderId: rzOrder,
      razorpayPaymentId: rzPayment,
      razorpaySignature: "0".repeat(64),
    });
    check("forged checkout signature rejected", status === 400, body.error);
    const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("razorpay_order_id", rzOrder);
    check("no order created from the forged callback", count === 0, `${count}`);
  }

  let orderNumber;
  {
    const { status, body, headers } = await post("/api/checkout/confirm", {
      checkoutId,
      razorpayOrderId: rzOrder,
      razorpayPaymentId: rzPayment,
      razorpaySignature: sign(rzOrder, rzPayment),
    });
    orderNumber = body.orderNumber;
    check("valid signature creates the order", status === 200 && !!body.orderNumber, body.orderNumber ?? body.error);
    check("order cookie set httpOnly", /aalmaram_order=.*HttpOnly/i.test(headers.get("set-cookie") ?? ""),
      (headers.get("set-cookie") ?? "").slice(0, 40));
  }

  // A signature is valid for its id pair, but must not unlock a different basket.
  {
    const otherCheckout = await makeCheckout(`order_other_${Date.now()}`);
    const { status } = await post("/api/checkout/confirm", {
      checkoutId: otherCheckout,
      razorpayOrderId: rzOrder,
      razorpayPaymentId: rzPayment,
      razorpaySignature: sign(rzOrder, rzPayment),
    });
    check("a valid signature cannot be replayed onto another basket", status === 400, `${status}`);
  }

  {
    const { status, body } = await post("/api/checkout/confirm", {
      checkoutId,
      razorpayOrderId: rzOrder,
      razorpayPaymentId: rzPayment,
      razorpaySignature: sign(rzOrder, rzPayment),
    });
    check("replayed callback returns the same order", status === 200 && body.orderNumber === orderNumber,
      body.orderNumber);
    const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("razorpay_order_id", rzOrder);
    check("still exactly one order", count === 1, `${count}`);
  }

  // ── Webhook ───────────────────────────────────────────────────────────────
  const webhookBody = JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: { id: rzPayment, order_id: rzOrder, status: "captured" } } },
  });

  {
    const res = await fetch(`${BASE}/api/webhooks/razorpay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-razorpay-signature": "deadbeef" },
      body: webhookBody,
    });
    check("webhook with a bad signature rejected", res.status === 400, `${res.status}`);
  }

  {
    const signature = createHmac("sha256", WEBHOOK_SECRET).update(webhookBody).digest("hex");
    const res = await fetch(`${BASE}/api/webhooks/razorpay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-razorpay-signature": signature },
      body: webhookBody,
    });
    const body = await res.json();
    check("signed webhook is idempotent with the callback",
      res.status === 200 && body.orderNumber === orderNumber && body.created === false,
      `${body.orderNumber}, created=${body.created}`);
  }

  // The webhook alone must create an order when the browser never reported back.
  {
    const soloOrder = `order_solo_${Date.now()}`;
    const soloPayment = `pay_solo_${Date.now()}`;
    await makeCheckout(soloOrder, 1);
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: soloPayment, order_id: soloOrder } } },
    });
    const signature = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
    const res = await fetch(`${BASE}/api/webhooks/razorpay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-razorpay-signature": signature },
      body,
    });
    const json = await res.json();
    check("webhook alone creates the order when the browser never returns",
      res.status === 200 && json.created === true, json.orderNumber);
  }

  // ── Order shape ───────────────────────────────────────────────────────────
  {
    const { data: order } = await db
      .from("orders")
      .select("order_number, payment_status, total_paise, razorpay_payment_id, order_items(quantity)")
      .eq("razorpay_order_id", rzOrder)
      .single();
    check("order paid with the right total", order.payment_status === "paid" && order.total_paise === 66000,
      `${order.order_number} · ${order.total_paise}p`);
    check("payment id recorded", order.razorpay_payment_id === rzPayment, order.razorpay_payment_id);

    const { data: outbox } = await db
      .from("webhook_outbox")
      .select("topic")
      .eq("payload->>order_number", order.order_number);
    check("order.paid queued exactly once", outbox?.length === 1, `${outbox?.length} row(s)`);
  }

  // ── Rejections ────────────────────────────────────────────────────────────
  {
    const { status, body } = await post("/api/checkout", {
      lines,
      email: "not-an-email",
      address: { name: "X", phone: "9999999999", line1: "a", city: "b", state: "c", pincode: "682001" },
    });
    check("bad email rejected before payment", status === 400, body.error);
  }

  {
    const { status, body } = await post("/api/checkout", {
      lines,
      email: "ok@example.com",
      address: { name: "X", phone: "9999999999", line1: "a", city: "b", state: "c", pincode: "12" },
    });
    check("bad PIN code rejected before payment", status === 400, body.error);
  }
} finally {
  const { data: orders } = await db.from("orders").select("id, order_number").eq("email", email);
  for (const o of orders ?? []) {
    await db.from("webhook_outbox").delete().eq("payload->>order_id", o.id);
    await db.from("orders").delete().eq("id", o.id);
  }
  await db.from("checkouts").delete().eq("email", email);
  await db.from("customers").delete().eq("email", email);
  for (const d of Object.values(codes)) await db.from("discounts").delete().eq("id", d.id);
  // Stock crossing the low-stock threshold queues inventory.low (P6).
  await db.from("webhook_outbox").delete().eq("topic", "inventory.low").eq("payload->>product_id", product.id);
  await db.from("products").delete().eq("id", product.id);
  console.log("\ncleaned up fixtures");
}

console.log(failures === 0 ? "\nAll P3 checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
