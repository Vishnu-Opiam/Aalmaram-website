import "server-only";

import { Resend } from "resend";
import AbandonedCheckout, { type AbandonedCheckoutProps } from "@/emails/AbandonedCheckout";
import OrderConfirmation, { type OrderConfirmationProps } from "@/emails/OrderConfirmation";
import OutOfStockRefund, { type OutOfStockRefundProps } from "@/emails/OutOfStockRefund";
import ShippingConfirmation, { type ShippingConfirmationProps } from "@/emails/ShippingConfirmation";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Transactional email.
 *
 * Sending must never take an order down with it: a customer who has paid has an
 * order whether or not the receipt lands. Every function here reports failure by
 * returning it, not by throwing into the caller's transaction.
 */

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function client(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set.");
  return new Resend(key);
}

async function storeSettings() {
  const db = createAdminClient();
  const { data } = await db.from("settings").select("value").eq("key", "store").maybeSingle();
  const value = (data?.value ?? {}) as {
    from_orders?: string;
    admin_notify_email?: string;
  };
  const { data: pub } = await db
    .from("settings")
    .select("value")
    .eq("key", "store_public")
    .maybeSingle();
  const publicValue = (pub?.value ?? {}) as { support_email?: string };

  return {
    from:
      process.env.EMAIL_FROM_ORDERS ??
      value.from_orders ??
      "Aalmaram <foundersteam@aalmaram.com>",
    supportEmail: publicValue.support_email ?? "foundersteam@aalmaram.com",
    notify: process.env.ADMIN_NOTIFY_EMAIL ?? value.admin_notify_email ?? null,
  };
}

export async function sendOrderConfirmation(
  to: string,
  props: Omit<OrderConfirmationProps, "supportEmail">
): Promise<{ sent: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return { sent: false, error: "RESEND_API_KEY is not set — confirmation email skipped." };
  }

  try {
    const { from, supportEmail, notify } = await storeSettings();
    const { error } = await client().emails.send({
      from,
      to,
      replyTo: supportEmail,
      subject: `Your order is confirmed · Aalmaram ${props.orderNumber}`,
      react: OrderConfirmation({ ...props, supportEmail }),
    });

    if (error) return { sent: false, error: error.message };

    // A separate, plainer nudge to the founder. Best effort.
    if (notify) {
      await client()
        .emails.send({
          from,
          to: notify,
          subject: `New order ${props.orderNumber} — ₹${(props.totalPaise / 100).toLocaleString("en-IN")}`,
          text: [
            `Order ${props.orderNumber}`,
            `${props.name} <${to}>`,
            "",
            ...props.items.map((i) => `  ${i.quantity} × ${i.title}`),
            "",
            `Total ₹${(props.totalPaise / 100).toLocaleString("en-IN")}`,
            props.discountCode ? `Discount ${props.discountCode}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        })
        .catch((err) => console.error("Founder alert failed", err));
    }

    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "Unknown email failure" };
  }
}

/**
 * The parcel has a tracking number. Sent once, by whichever call actually
 * stamped `shipped_at` — the AWB being assigned, or a webhook that got there
 * first. Failure is reported, never thrown: the parcel has shipped either way.
 */
export async function sendShippingConfirmation(
  to: string,
  props: Omit<ShippingConfirmationProps, "supportEmail">
): Promise<{ sent: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return { sent: false, error: "RESEND_API_KEY is not set — shipping email skipped." };
  }

  try {
    const { from, supportEmail } = await storeSettings();
    const { error } = await client().emails.send({
      from,
      to,
      replyTo: supportEmail,
      subject: `Your Aalmaram order ${props.orderNumber} is on its way`,
      react: ShippingConfirmation({ ...props, supportEmail }),
    });

    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "Unknown email failure" };
  }
}

/**
 * A payment was captured for stock that had gone, and has been refunded in
 * full. Tells the buyer, and tells the founder, who will want to know both that
 * a sale was lost and that the stock count needs a look.
 */
export async function sendOutOfStockRefund(
  to: string,
  props: Omit<OutOfStockRefundProps, "supportEmail"> & {
    razorpayPaymentId: string;
    razorpayRefundId: string | null;
  }
): Promise<{ sent: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return { sent: false, error: "RESEND_API_KEY is not set — out-of-stock refund email skipped." };
  }

  try {
    const { from, supportEmail, notify } = await storeSettings();
    const amount = `₹${(props.amountPaise / 100).toLocaleString("en-IN")}`;
    const { error } = await client().emails.send({
      from,
      to,
      replyTo: supportEmail,
      subject: "Your Aalmaram payment has been refunded",
      react: OutOfStockRefund({
        name: props.name,
        amountPaise: props.amountPaise,
        items: props.items,
        supportEmail,
      }),
    });

    if (notify) {
      await client()
        .emails.send({
          from,
          to: notify,
          subject: `Sold out after payment — ${amount} refunded to ${to}`,
          text: [
            "A payment was captured, but the stock had gone by the time the order was written,",
            "so no order was created and the payment was refunded in full.",
            "",
            `Buyer: ${props.name} <${to}>`,
            `Items: ${props.items.join(", ") || "(unknown)"}`,
            `Amount: ${amount}`,
            `Razorpay payment: ${props.razorpayPaymentId}`,
            `Razorpay refund: ${props.razorpayRefundId ?? "(pending)"}`,
            "",
            "Worth checking the stock count in the admin.",
          ].join("\n"),
        })
        .catch((err) => console.error("Founder out-of-stock alert failed", err));
    }

    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "Unknown email failure" };
  }
}

/**
 * The one reminder about a basket left at the payment step. Sent from
 * /api/cron/abandoned, which has already stamped the checkout so this can
 * never go twice.
 */
export async function sendAbandonedCheckout(
  to: string,
  props: Omit<AbandonedCheckoutProps, "supportEmail">
): Promise<{ sent: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return { sent: false, error: "RESEND_API_KEY is not set — abandoned-checkout email skipped." };
  }

  try {
    const { from, supportEmail } = await storeSettings();
    const { error } = await client().emails.send({
      from,
      to,
      replyTo: supportEmail,
      subject: "Your basket is still here",
      react: AbandonedCheckout({ ...props, supportEmail }),
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "Unknown email failure" };
  }
}

/** A sign-in link for a new team member, or a password reset for an existing one. */
export async function sendAdminAccessLink(
  to: string,
  params: { link: string; invitedBy: string; kind: "invite" | "recovery" }
): Promise<{ sent: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return { sent: false, error: "RESEND_API_KEY is not set — copy the link and send it yourself." };
  }

  try {
    const { from } = await storeSettings();
    const invite = params.kind === "invite";
    const { error } = await client().emails.send({
      from,
      to,
      subject: invite ? "You've been added to the Aalmaram admin" : "Set a new password for the Aalmaram admin",
      text: [
        invite
          ? `${params.invitedBy} has added you to the Aalmaram store admin.`
          : `${params.invitedBy} has sent you a link to set a new password for the Aalmaram store admin.`,
        "",
        "Choose your password here (the link works once, and expires within the hour):",
        params.link,
        "",
        "If you weren't expecting this, you can ignore it.",
      ].join("\n"),
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "Unknown email failure" };
  }
}
