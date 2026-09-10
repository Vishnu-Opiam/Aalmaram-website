import "server-only";

import { sendOrderConfirmation } from "@/lib/email";
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

export async function finaliseOrder(params: {
  checkoutId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  source?: string;
}): Promise<FinalisedOrder> {
  const db = createAdminClient();

  const { data, error } = await db.rpc("create_order_from_checkout", {
    p_checkout_id: params.checkoutId,
    p_razorpay_order_id: params.razorpayOrderId,
    p_razorpay_payment_id: params.razorpayPaymentId,
    p_razorpay_signature: params.razorpaySignature,
    p_source: params.source ?? "web",
  });

  if (error) throw new Error(error.message);

  const result = data as { order_id: string; order_number: string; already_existed: boolean };

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

async function sendConfirmation(orderId: string): Promise<void> {
  const db = createAdminClient();
  const { data: order } = await db
    .from("orders")
    .select(
      "id, order_number, email, subtotal_paise, discount_paise, shipping_paise, total_paise, discount_code, shipping_address, order_items ( title, variant_title, quantity, total_paise )"
    )
    .eq("id", orderId)
    .single();

  if (!order) return;

  const address = (order.shipping_address ?? {}) as Record<string, string>;

  const { sent, error } = await sendOrderConfirmation(order.email, {
    orderNumber: order.order_number,
    name: address.name ?? "",
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
    totalPaise: order.total_paise,
    address,
  });

  if (!sent) {
    console.error(`Confirmation email for ${order.order_number} not sent: ${error}`);
  }
}
