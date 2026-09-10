import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { finaliseOrder } from "@/lib/orders";
import { verifyCheckoutSignature } from "@/lib/razorpay";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The browser's report that payment succeeded.
 *
 * Its signature is verified before anything is believed, and even then this is
 * only the fast path — /api/webhooks/razorpay is authoritative and will create
 * the same order if this call never arrives. Both go through the same RPC, which
 * is idempotent on razorpay_order_id.
 */

const bodySchema = z.object({
  checkoutId: z.string().uuid(),
  razorpayOrderId: z.string().min(1).max(120),
  razorpayPaymentId: z.string().min(1).max(120),
  razorpaySignature: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  const db = createAdminClient();

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  const { data: allowed } = await db.rpc("rate_limit_hit", {
    p_key: `confirm:${ip}`,
    p_limit: 20,
    p_window_seconds: 60,
  });
  if (allowed === false) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const { checkoutId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data;

  if (
    !verifyCheckoutSignature({
      razorpayOrderId,
      razorpayPaymentId,
      signature: razorpaySignature,
    })
  ) {
    console.error("Rejected a checkout callback with a bad signature", { checkoutId, razorpayOrderId });
    return NextResponse.json({ error: "That payment could not be verified." }, { status: 400 });
  }

  // The signature proves the ids belong together, but not that they belong to
  // this checkout. Without this the modal's result could be replayed against
  // somebody else's basket.
  const { data: checkout } = await db
    .from("checkouts")
    .select("id, razorpay_order_id")
    .eq("id", checkoutId)
    .maybeSingle();

  if (!checkout || checkout.razorpay_order_id !== razorpayOrderId) {
    return NextResponse.json({ error: "That payment could not be verified." }, { status: 400 });
  }

  try {
    const order = await finaliseOrder({
      checkoutId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      source: "web",
    });
    // /order/confirmed reads this rather than taking an order number from the
    // URL: order numbers are sequential and guessable, and an email address has
    // no business in a query string.
    (await cookies()).set("aalmaram_order", order.orderId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 2,
    });

    return NextResponse.json({ orderNumber: order.orderNumber });
  } catch (err) {
    console.error("Order creation failed after a verified payment", err);
    // The customer has paid. Never imply otherwise — the webhook is still
    // coming, and support can reconcile from razorpay_order_id.
    return NextResponse.json(
      {
        error:
          "Your payment went through, but we hit a snag writing the order. We'll email you shortly — nothing has been lost.",
        paid: true,
      },
      { status: 500 }
    );
  }
}
