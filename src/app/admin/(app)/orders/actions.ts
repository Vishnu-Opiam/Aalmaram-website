"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit, requireAdmin } from "@/lib/admin-auth";
import { formatPaise, humaniseDbError, rupeesToPaise } from "@/lib/format";
import { refundOutOfStock, resendConfirmation } from "@/lib/orders";
import { kickOutbox } from "@/lib/outbox";
import { issueRefund, type SkippedLine } from "@/lib/refunds";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ActionState {
  error: string;
  ok?: string;
}

/** Errors our own functions raise on purpose; anything else is unexpected. */
const EXPECTED = new Set(["22023", "55000", "23514", "P0002"]);

function dbError(error: { code?: string; message: string }, fallback: string): string {
  return EXPECTED.has(error.code ?? "") ? humaniseDbError(error.message) : `${fallback}: ${error.message}`;
}

function refreshOrder(orderId: string) {
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
}

function skippedNote(skipped: SkippedLine[]): string {
  if (skipped.length === 0) return "";
  return ` Not restocked, because the product has since been deleted: ${skipped
    .map((s) => `${s.quantity} × ${s.title}`)
    .join(", ")}.`;
}

/** restock_<order_item_id> fields from the form, as the RPC's restock list. */
function readRestock(formData: FormData): { order_item_id: string; quantity: number }[] {
  const lines: { order_item_id: string; quantity: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("restock_")) continue;
    const quantity = Number(String(value || "0"));
    if (Number.isInteger(quantity) && quantity > 0) {
      lines.push({ order_item_id: key.slice("restock_".length), quantity });
    }
  }
  return lines;
}

/** What is still refundable: total, less refunds made, less refunds in flight. */
async function remainingPaise(orderId: string) {
  const db = createAdminClient();
  const { data: order } = await db
    .from("orders")
    .select("id, total_paise, refunded_paise, order_items ( id, quantity, restocked_quantity )")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return null;
  const { data: pending } = await db
    .from("refunds")
    .select("amount_paise")
    .eq("order_id", orderId)
    .eq("status", "pending");
  const inFlight = (pending ?? []).reduce((sum, r) => sum + r.amount_paise, 0);
  return { order, remaining: order.total_paise - order.refunded_paise - inFlight, inFlight };
}

// ── Refund ──────────────────────────────────────────────────────────────────

export async function refundOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();

  const orderId = String(formData.get("order_id") ?? "");
  const amountPaise = rupeesToPaise(String(formData.get("amount") ?? ""));
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  const restock = readRestock(formData);

  if (!orderId) return { error: "Missing order." };
  if (amountPaise === null || amountPaise <= 0) {
    return { error: "Enter an amount in rupees, like 700 or 150.50." };
  }

  const db = createAdminClient();
  const { data: begun, error: beginError } = await db.rpc("begin_refund", {
    p_order_id: orderId,
    p_amount_paise: amountPaise,
    p_restock: restock,
    p_cancel: false,
    p_reason: reason,
    p_actor: session.email,
  });

  if (beginError) return { error: dbError(beginError, "Could not start the refund") };

  const { refund_id: refundId } = begun as { refund_id: string };
  const result = await issueRefund(refundId, session.email);
  refreshOrder(orderId);

  if (!result.ok) {
    return {
      error: result.pending
        ? `${result.error} The refund is on hold, not lost — finish it from the refunds list below.`
        : `Razorpay did not accept the refund: ${result.error} Nothing was changed.`,
    };
  }

  return {
    error: "",
    ok: `Refunded ${formatPaise(amountPaise)} (${result.razorpayRefundId}).${skippedNote(result.skipped)}`,
  };
}

// ── Cancel ──────────────────────────────────────────────────────────────────

export async function cancelOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();

  const orderId = String(formData.get("order_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  const restockAll = formData.get("restock") === "on";
  if (!orderId) return { error: "Missing order." };

  const state = await remainingPaise(orderId);
  if (!state) return { error: "That order no longer exists." };
  if (state.inFlight > 0) {
    return { error: "A refund on this order is still in progress. Finish it before cancelling." };
  }

  const restock = restockAll
    ? state.order.order_items
        .map((item) => ({ order_item_id: item.id, quantity: item.quantity - item.restocked_quantity }))
        .filter((line) => line.quantity > 0)
    : [];

  const db = createAdminClient();

  // Nothing left to give back: cancel without touching Razorpay.
  if (state.remaining <= 0) {
    const { error } = await db.rpc("cancel_order", {
      p_order_id: orderId,
      p_restock: restock,
      p_reason: reason,
      p_actor: session.email,
    });
    refreshOrder(orderId);
    if (error) return { error: dbError(error, "Could not cancel") };
    kickOutbox();
    return { error: "", ok: "Order cancelled. Nothing was left to refund." };
  }

  const { data: begun, error: beginError } = await db.rpc("begin_refund", {
    p_order_id: orderId,
    p_amount_paise: state.remaining,
    p_restock: restock,
    p_cancel: true,
    p_reason: reason,
    p_actor: session.email,
  });
  if (beginError) return { error: dbError(beginError, "Could not start the cancellation") };

  const { refund_id: refundId } = begun as { refund_id: string };
  const result = await issueRefund(refundId, session.email);
  refreshOrder(orderId);

  if (!result.ok) {
    return {
      error: result.pending
        ? `${result.error} The cancellation is on hold — finish it from the refunds list below.`
        : `Razorpay did not accept the refund, so the order was not cancelled: ${result.error}`,
    };
  }

  return {
    error: "",
    ok: `Order cancelled and ${formatPaise(state.remaining)} refunded (${result.razorpayRefundId}).${skippedNote(result.skipped)}`,
  };
}

// ── Finish a refund whose outcome we never heard ────────────────────────────

export async function finishRefund(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const refundId = String(formData.get("refund_id") ?? "");
  if (!refundId) return { error: "Missing refund." };

  const db = createAdminClient();
  const { data: refund } = await db
    .from("refunds")
    .select("id, kind, order_id, amount_paise")
    .eq("id", refundId)
    .maybeSingle();
  if (!refund) return { error: "That refund no longer exists." };

  // Out-of-stock refunds go through the path that also emails the buyer.
  const result =
    refund.kind === "out_of_stock"
      ? await refundOutOfStock(refund.id, session.email)
      : await issueRefund(refund.id, session.email);

  if (refund.order_id) refreshOrder(refund.order_id);
  revalidatePath("/admin");

  if (!result.ok) return { error: result.error };
  return {
    error: "",
    ok: result.alreadyProcessed
      ? "That refund was already complete."
      : `Refund of ${formatPaise(refund.amount_paise)} complete (${result.razorpayRefundId}).${skippedNote(result.skipped)}`,
  };
}

// ── Confirmation email ──────────────────────────────────────────────────────

export async function resendConfirmationEmail(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return { error: "Missing order." };

  const { sent, error } = await resendConfirmation(orderId);
  await recordAudit(session, {
    action: "order.confirmation.resend",
    entityType: "order",
    entityId: orderId,
    diff: { sent, ...(error ? { error } : {}) },
  });
  refreshOrder(orderId);

  return sent ? { error: "", ok: "Confirmation email sent." } : { error: `Not sent: ${error}` };
}

// ── Address ─────────────────────────────────────────────────────────────────

const addressSchema = z.object({
  name: z.string().trim().min(1, "A name is required.").max(120),
  phone: z.string().trim().regex(/^[0-9+\-\s]{8,20}$/, "That phone number doesn't look right."),
  line1: z.string().trim().min(1, "An address is required.").max(200),
  line2: z.string().trim().max(200),
  city: z.string().trim().min(1, "A city is required.").max(100),
  state: z.string().trim().min(1, "A state is required.").max(100),
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "That PIN code doesn't look right."),
});

export async function updateAddress(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return { error: "Missing order." };

  const parsed = addressSchema.safeParse(
    Object.fromEntries(Object.keys(addressSchema.shape).map((k) => [k, String(formData.get(k) ?? "")]))
  );
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the address." };

  const db = createAdminClient();
  const { data: before } = await db
    .from("orders")
    .select("shipping_address")
    .eq("id", orderId)
    .maybeSingle();
  if (!before) return { error: "That order no longer exists." };

  const previous = (before.shipping_address ?? {}) as Record<string, string>;
  const next = { ...previous, ...parsed.data };

  // Guarded: once an order is fulfilled or cancelled the address is history,
  // and the guard is in the update itself so a shipment created a moment ago
  // can't be overtaken by a stale form.
  const { data: updated, error } = await db
    .from("orders")
    .update({ shipping_address: next })
    .eq("id", orderId)
    .eq("fulfillment_status", "unfulfilled")
    .eq("order_status", "open")
    .select("id");

  if (error) return { error: `Could not save: ${error.message}` };
  if (!updated?.length) {
    return { error: "This order has been fulfilled or cancelled, so its address can no longer change." };
  }

  const changed = Object.fromEntries(
    Object.entries(parsed.data)
      .filter(([key, value]) => (previous[key] ?? "") !== value)
      .map(([key, value]) => [key, { from: previous[key] ?? "", to: value }])
  );
  await recordAudit(session, {
    action: "order.address.update",
    entityType: "order",
    entityId: orderId,
    diff: changed,
  });

  refreshOrder(orderId);
  return { error: "", ok: Object.keys(changed).length ? "Address updated." : "Nothing had changed." };
}

// ── Notes ───────────────────────────────────────────────────────────────────

export async function updateOrderNotes(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const orderId = String(formData.get("order_id") ?? "");
  const notes = String(formData.get("notes") ?? "").slice(0, 5000);
  if (!orderId) return { error: "Missing order." };

  const db = createAdminClient();
  const { error } = await db.from("orders").update({ notes }).eq("id", orderId);
  if (error) return { error: `Could not save: ${error.message}` };

  await recordAudit(session, {
    action: "order.notes.update",
    entityType: "order",
    entityId: orderId,
    diff: { length: notes.length },
  });
  refreshOrder(orderId);
  return { error: "", ok: "Notes saved." };
}
