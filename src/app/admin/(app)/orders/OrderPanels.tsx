"use client";

import { useActionState } from "react";
import { formatPaise } from "@/lib/format";
import { Notice, SectionTitle, inputClass, labelClass } from "../ui";
import {
  cancelOrder,
  finishRefund,
  refundOrder,
  resendConfirmationEmail,
  updateAddress,
  updateOrderNotes,
  type ActionState,
} from "./actions";

const INITIAL: ActionState = { error: "" };

export interface RestockableLine {
  id: string;
  title: string;
  variantTitle: string;
  quantity: number;
  /** Sold, minus already restocked, minus reserved by refunds in flight. */
  available: number;
  variantGone: boolean;
}

/** Stops the form unless the admin confirms — these buttons move real money. */
function confirmFirst(message: string) {
  return (event: React.FormEvent<HTMLFormElement>) => {
    if (!window.confirm(message)) event.preventDefault();
  };
}

// ── Refund ──────────────────────────────────────────────────────────────────

export function RefundPanel({
  orderId,
  remainingPaise,
  lines,
}: {
  orderId: string;
  remainingPaise: number;
  lines: RestockableLine[];
}) {
  const [state, formAction, pending] = useActionState(refundOrder, INITIAL);

  return (
    <form
      action={formAction}
      onSubmit={confirmFirst("Send this refund through Razorpay? It cannot be undone.")}
      className="space-y-5"
    >
      <SectionTitle hint={`Up to ${formatPaise(remainingPaise)} can still be refunded. Goes back to the way they paid.`}>
        Refund
      </SectionTitle>
      <input type="hidden" name="order_id" value={orderId} />

      <div className="grid md:grid-cols-2 gap-5">
        <label className="block">
          <span className={labelClass}>Amount (₹)</span>
          <input
            name="amount"
            required
            inputMode="decimal"
            defaultValue={String(remainingPaise / 100)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Reason</span>
          <input name="reason" placeholder="Damaged in transit" className={inputClass} />
        </label>
      </div>

      {lines.some((l) => l.available > 0) && (
        <fieldset>
          <legend className={labelClass}>Put back on the shelf</legend>
          <div className="mt-3 space-y-3">
            {lines.map((line) => (
              <label key={line.id} className="flex items-center gap-4 text-[13px]">
                <input
                  name={`restock_${line.id}`}
                  type="number"
                  min={0}
                  max={line.available}
                  defaultValue={0}
                  disabled={line.available === 0}
                  className="preorder-input text-[14px] w-20"
                />
                <span>
                  {line.title}
                  {line.variantTitle && line.variantTitle !== "Default" ? ` · ${line.variantTitle}` : ""}
                  <span className="opacity-60">
                    {" "}
                    — {line.available} of {line.quantity} can go back
                    {line.variantGone ? " (product deleted; will be skipped)" : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <Notice error={state.error} ok={state.ok} />

      <button
        type="submit"
        disabled={pending}
        className="btn-night px-4 py-2.5 text-[13px]"
      >
        {pending ? "Refunding…" : "Refund"}
      </button>
    </form>
  );
}

// ── Cancel ──────────────────────────────────────────────────────────────────

export function CancelPanel({ orderId, remainingPaise }: { orderId: string; remainingPaise: number }) {
  const [state, formAction, pending] = useActionState(cancelOrder, INITIAL);
  const what =
    remainingPaise > 0
      ? `Cancel this order and refund ${formatPaise(remainingPaise)} through Razorpay? It cannot be undone.`
      : "Cancel this order? Nothing is left to refund. It cannot be undone.";

  return (
    <form action={formAction} onSubmit={confirmFirst(what)} className="space-y-5">
      <SectionTitle
        hint={
          remainingPaise > 0
            ? `Refunds everything still paid (${formatPaise(remainingPaise)}) and closes the order.`
            : "Everything has been refunded already; this just closes the order."
        }
      >
        Cancel
      </SectionTitle>
      <input type="hidden" name="order_id" value={orderId} />
      <label className="block">
        <span className={labelClass}>Reason</span>
        <input name="reason" placeholder="Customer asked to cancel" className={inputClass} />
      </label>
      <label className="flex items-center gap-3 text-[13px]">
        <input type="checkbox" name="restock" defaultChecked style={{ accentColor: "var(--night)" }} />
        Put every copy back on the shelf
      </label>

      <Notice error={state.error} ok={state.ok} />

      <button
        type="submit"
        disabled={pending}
        className="px-7 py-3 text-[12.5px] font-normal rounded-full"
        style={{ border: "1px solid var(--spice)", color: "var(--spice)" }}
      >
        {pending ? "Cancelling…" : remainingPaise > 0 ? `Cancel and refund ${formatPaise(remainingPaise)}` : "Cancel order"}
      </button>
    </form>
  );
}

// ── A refund that needs finishing ───────────────────────────────────────────

export function FinishRefundButton({ refundId, label = "Check with Razorpay" }: { refundId: string; label?: string }) {
  const [state, formAction, pending] = useActionState(finishRefund, INITIAL);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="refund_id" value={refundId} />
      <button type="submit" disabled={pending} className="qlink text-[12px]">
        {pending ? "Checking…" : label}
      </button>
      <Notice error={state.error} ok={state.ok} />
    </form>
  );
}

// ── Confirmation email ──────────────────────────────────────────────────────

export function ResendConfirmationButton({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(resendConfirmationEmail, INITIAL);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="order_id" value={orderId} />
      <button type="submit" disabled={pending} className="qlink text-[12.5px]">
        {pending ? "Sending…" : "Resend confirmation email"}
      </button>
      <Notice error={state.error} ok={state.ok} />
    </form>
  );
}

// ── Address ─────────────────────────────────────────────────────────────────

export interface AddressValues {
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
}

export function AddressForm({ orderId, values }: { orderId: string; values: AddressValues }) {
  const [state, formAction, pending] = useActionState(updateAddress, INITIAL);
  const field = (name: keyof AddressValues, label: string, span = false, required = true) => (
    <label className={`block ${span ? "md:col-span-2" : ""}`}>
      <span className={labelClass}>{label}</span>
      <input name={name} defaultValue={values[name]} required={required} className={inputClass} />
    </label>
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="order_id" value={orderId} />
      <div className="grid md:grid-cols-2 gap-5">
        {field("name", "Name", true)}
        {field("phone", "Phone", true)}
        {field("line1", "Address", true)}
        {field("line2", "Apartment, landmark", true, false)}
        {field("city", "City")}
        {field("state", "State")}
        {field("pincode", "PIN code")}
      </div>
      <Notice error={state.error} ok={state.ok} />
      <button
        type="submit"
        disabled={pending}
        className="btn-night px-4 py-2.5 text-[13px]"
      >
        {pending ? "Saving…" : "Save address"}
      </button>
    </form>
  );
}

// ── Notes ───────────────────────────────────────────────────────────────────

export function OrderNotesForm({ orderId, notes }: { orderId: string; notes: string }) {
  const [state, formAction, pending] = useActionState(updateOrderNotes, INITIAL);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="order_id" value={orderId} />
      <textarea
        name="notes"
        defaultValue={notes}
        rows={4}
        placeholder="Only the team sees these."
        className={inputClass}
      />
      <Notice error={state.error} ok={state.ok} />
      <button type="submit" disabled={pending} className="qlink text-[12.5px]">
        {pending ? "Saving…" : "Save notes"}
      </button>
    </form>
  );
}
