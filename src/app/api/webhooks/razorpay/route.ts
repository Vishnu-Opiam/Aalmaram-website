import { NextResponse } from "next/server";
import { finaliseOrder } from "@/lib/orders";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Razorpay's own account of what happened, and the authority on it.
 *
 * The browser callback is a convenience — the customer can close the tab, lose
 * signal, or have the redirect eaten. This is what guarantees a captured
 * payment becomes an order. It goes through the same idempotent RPC, so
 * whichever arrives second gets the existing order back.
 */

// Signature is computed over the raw bytes, so the body must be read as text
// before anything parses it.
export const dynamic = "force-dynamic";

interface RazorpayEvent {
  event: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        status?: string;
        notes?: Record<string, string>;
      };
    };
    order?: { entity?: { id?: string; receipt?: string } };
  };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.error("Rejected a Razorpay webhook with a bad signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: RazorpayEvent;
  try {
    event = JSON.parse(rawBody) as RazorpayEvent;
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  // Anything else (refunds, failures) is handled in later phases; acknowledge
  // so Razorpay stops retrying.
  if (event.event !== "payment.captured" && event.event !== "order.paid") {
    return NextResponse.json({ received: true, ignored: event.event });
  }

  const payment = event.payload?.payment?.entity;
  const razorpayOrderId = payment?.order_id ?? event.payload?.order?.entity?.id;
  const razorpayPaymentId = payment?.id;

  if (!razorpayOrderId || !razorpayPaymentId) {
    return NextResponse.json({ error: "No payment in payload" }, { status: 400 });
  }

  const db = createAdminClient();

  // Find the basket this payment was created for. The receipt is the checkout
  // id, and the notes carry it too, but the checkouts table is the source we
  // trust.
  const { data: checkout } = await db
    .from("checkouts")
    .select("id, status, completed_order_id")
    .eq("razorpay_order_id", razorpayOrderId)
    .maybeSingle();

  if (!checkout) {
    // A payment we have no record of should be looked at by a human rather than
    // retried forever, so acknowledge and log loudly.
    console.error(`Razorpay webhook for unknown order ${razorpayOrderId}`);
    return NextResponse.json({ received: true, unknown: true });
  }

  try {
    const order = await finaliseOrder({
      checkoutId: checkout.id,
      razorpayOrderId,
      razorpayPaymentId,
      // The webhook signature has already proven this event is genuine; there
      // is no per-payment checkout signature to record here.
      razorpaySignature: "",
      source: "web",
    });

    return NextResponse.json({
      received: true,
      orderNumber: order.orderNumber,
      created: !order.alreadyExisted,
    });
  } catch (err) {
    console.error("Webhook could not create the order", err);
    // 500 makes Razorpay retry, which is what we want for a transient failure.
    return NextResponse.json({ error: "Could not create the order" }, { status: 500 });
  }
}
