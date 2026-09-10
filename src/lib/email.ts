import "server-only";

import { Resend } from "resend";
import OrderConfirmation, { type OrderConfirmationProps } from "@/emails/OrderConfirmation";
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
      subject: `Your Aalmaram order ${props.orderNumber}`,
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
