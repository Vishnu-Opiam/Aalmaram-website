import "server-only";

import { sendOrderConfirmation, sendOutOfStockRefund } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { kickOutbox } from "@/lib/outbox";
import { issueRefund, type IssueRefundResult } from "@/lib/refunds";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The single path from "payment verified" to "order exists".
 *
 * Both the browser callback and the Razorpay webhook come through here, so
 * there is one place where the transaction is run and one place where the
 * confirmation email is sent — and the email is sent only by whichever caller
 * actually created the order.
 */

export interface FinalisedOrder {
  orderId: string;
  orderNumber: string;
  alreadyExisted: boolean;
}

/**
 * The payment was captured but the stock had gone, so no order exists. The
 * refund owed has been recorded (once per checkout, whoever got here first);
 * only the webhook or an admin actually asks Razorpay for it.
 */
export class OutOfStockError extends Error {
  constructor(
    readonly refundId: string,
    readonly refundStatus: string
  ) {
    super("Sold out after payment; a full refund has been recorded.");
  }
}

/** SQLSTATE raised by create_order_from_checkout when stock ran out. */
const OUT_OF_STOCK = "OOS01";

export async function finaliseOrder(params: {
  checkoutId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  source?: string;
  /** Who is asking, for the audit trail: "checkout" or "razorpay-webhook". */
  actor?: string;
}): Promise<FinalisedOrder> {
  const db = createAdminClient();

  const { data, error } = await db.rpc("create_order_from_checkout", {
    p_checkout_id: params.checkoutId,
    p_razorpay_order_id: params.razorpayOrderId,
    p_razorpay_payment_id: params.razorpayPaymentId,
    p_razorpay_signature: params.razorpaySignature,
    p_source: params.source ?? "web",
  });

  if (error?.code === OUT_OF_STOCK) {
    const { data: recorded, error: recordError } = await db.rpc("record_out_of_stock_payment", {
      p_checkout_id: params.checkoutId,
      p_razorpay_payment_id: params.razorpayPaymentId,
      p_actor: params.actor ?? "checkout",
    });
    if (recordError) throw new Error(`Out of stock, and the refund could not be recorded: ${recordError.message}`);
    const refund = recorded as { refund_id: string; status: string };
    throw new OutOfStockError(refund.refund_id, refund.status);
  }

  if (error) throw new Error(error.message);

  const result = data as { order_id: string; order_number: string; already_existed: boolean };
  if (!result.already_existed) kickOutbox();

  // Only the caller that actually created the order sends the receipt, so a
  // webhook arriving after the browser callback does not send a second one.
  if (!result.already_existed) {
    await sendConfirmation(result.order_id).catch((err) =>
      console.error("Confirmation email failed", err)
    );
  }

  return {
    orderId: result.order_id,
    orderNumber: result.order_number,
    alreadyExisted: result.already_existed,
  };
}

/**
 * Asks Razorpay for an out-of-stock refund and, the first time it lands, tells
 * the buyer and the founder. Safe to call repeatedly — a webhook retry, or an
 * admin pressing "Refund now" — because issueRefund never sends a refund twice
 * and the emails go only from the call that actually booked it.
 */
export async function refundOutOfStock(refundId: string, actor: string): Promise<IssueRefundResult> {
  const result = await issueRefund(refundId, actor);
  if (!result.ok || result.alreadyProcessed) return result;

  const db = createAdminClient();
  const { data: refund } = await db
    .from("refunds")
    .select("amount_paise, razorpay_payment_id, checkouts ( email, line_items, shipping_address )")
    .eq("id", refundId)
    .single();

  const checkout = refund?.checkouts;
  if (!refund || !checkout?.email) return result;

  const lines = (checkout.line_items ?? []) as { variant_id: string }[];
  const { data: variants } = await db
    .from("product_variants")
    .select("id, products ( title )")
    .in("id", lines.map((l) => l.variant_id));
  const titles = [...new Set((variants ?? []).map((v) => v.products?.title).filter(Boolean))] as string[];
  const address = (checkout.shipping_address ?? {}) as Record<string, string>;

  const { sent, error } = await sendOutOfStockRefund(checkout.email, {
    name: address.name ?? "",
    amountPaise: refund.amount_paise,
    items: titles,
    razorpayPaymentId: refund.razorpay_payment_id,
    razorpayRefundId: result.razorpayRefundId,
  });
  if (!sent) console.error(`Out-of-stock refund email for ${checkout.email} not sent: ${error}`);

  return result;
}

/** From the admin. Reports whether the email went, rather than throwing. */
export async function resendConfirmation(orderId: string): Promise<{ sent: boolean; error?: string }> {
  return sendConfirmation(orderId);
}

async function sendConfirmation(orderId: string): Promise<{ sent: boolean; error?: string }> {
  const db = createAdminClient();
  const { data: order } = await db
    .from("orders")
    .select(
      "id, order_number, email, subtotal_paise, discount_paise, shipping_paise, tax_paise, total_paise, discount_code, shipping_address, placed_at, created_at, view_token, order_items ( title, variant_title, quantity, total_paise )"
    )
    .eq("id", orderId)
    .single();

  if (!order) return { sent: false, error: "Order not found." };

  const address = (order.shipping_address ?? {}) as Record<string, string>;

  const { sent, error } = await sendOrderConfirmation(order.email, {
    orderNumber: order.order_number,
    name: address.name ?? "",
    placedAt: order.placed_at ?? order.created_at,
    viewUrl: `${siteUrl()}/order/view/${order.view_token}`,
    items: order.order_items.map((item) => ({
      title: item.title,
      variantTitle: item.variant_title,
      quantity: item.quantity,
      totalPaise: item.total_paise,
    })),
    subtotalPaise: order.subtotal_paise,
    discountPaise: order.discount_paise,
    discountCode: order.discount_code,
    shippingPaise: order.shipping_paise,
    taxPaise: order.tax_paise,
    totalPaise: order.total_paise,
    address,
  });

  if (!sent) {
    console.error(`Confirmation email for ${order.order_number} not sent: ${error}`);
  }
  return { sent, error };
}
