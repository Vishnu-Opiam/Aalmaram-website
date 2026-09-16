import "server-only";

import { kickOutbox } from "@/lib/outbox";
import { createRefund, fetchRefunds, type RazorpayRefund } from "@/lib/razorpay";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sends a recorded refund to Razorpay and books the outcome.
 *
 * A refunds row is written first (begin_refund / record_out_of_stock_payment),
 * so the amount is already reserved before any money moves. This is the only
 * place that talks to Razorpay about it, and it is safe to call again for the
 * same row — after a crash, a timeout, a webhook retry or a double click:
 *
 *   1. Already processed?  Nothing to do.
 *   2. Ask Razorpay whether a refund carrying this row's id already exists.
 *      If it does, the earlier attempt reached Razorpay and we never heard
 *      back; book that one instead of sending a second.
 *   3. Otherwise ask for the refund, then book it.
 *
 * Booking (complete_refund) moves money, stock, statuses and the n8n outbox in
 * one transaction. If Razorpay refuses, fail_refund releases the reservation.
 * If Razorpay succeeds but booking fails, the row stays pending and the next
 * call finds the refund at step 2.
 */

export type IssueRefundResult =
  | { ok: true; alreadyProcessed: boolean; razorpayRefundId: string | null; skipped: SkippedLine[] }
  | { ok: false; error: string; pending: boolean };

export interface SkippedLine {
  title: string;
  quantity: number;
}

function matches(refund: RazorpayRefund, refundId: string): boolean {
  if (refund.receipt === refundId) return true;
  const notes = Array.isArray(refund.notes) ? {} : refund.notes;
  return notes?.refund_id === refundId;
}

export async function issueRefund(refundId: string, actor: string): Promise<IssueRefundResult> {
  const db = createAdminClient();

  const { data: refund } = await db
    .from("refunds")
    .select("id, status, amount_paise, razorpay_payment_id, razorpay_refund_id, order_id, checkout_id, kind")
    .eq("id", refundId)
    .maybeSingle();

  if (!refund) return { ok: false, error: "That refund no longer exists.", pending: false };
  if (refund.status === "processed") {
    return { ok: true, alreadyProcessed: true, razorpayRefundId: refund.razorpay_refund_id, skipped: [] };
  }

  let razorpayRefund: RazorpayRefund | undefined;
  try {
    const existing = await fetchRefunds(refund.razorpay_payment_id);
    razorpayRefund = existing.find((r) => matches(r, refund.id));
  } catch (err) {
    // Without this check a retry could refund twice, so an unreachable
    // Razorpay means "try later", not "send it anyway".
    const error = err instanceof Error ? err.message : "Could not reach Razorpay.";
    return { ok: false, error: `Could not check Razorpay before refunding: ${error}`, pending: true };
  }

  // A failed order refund has released its reservation, so it is only ever
  // looked up, never re-sent: to try again the admin starts a new refund, which
  // checks the amount afresh. An out-of-stock refund has no order to start
  // from, and is always the full captured amount — Razorpay itself refuses to
  // refund more than was captured — so that one may be sent again.
  if (!razorpayRefund && refund.status === "failed" && refund.kind !== "out_of_stock") {
    return {
      ok: false,
      error: "Razorpay has no record of this refund. Start a new refund to try again.",
      pending: false,
    };
  }

  if (!razorpayRefund) {
    try {
      razorpayRefund = await createRefund({
        paymentId: refund.razorpay_payment_id,
        amountPaise: refund.amount_paise,
        receipt: refund.id,
        notes: {
          refund_id: refund.id,
          kind: refund.kind,
          ...(refund.order_id ? { order_id: refund.order_id } : {}),
          ...(refund.checkout_id ? { checkout_id: refund.checkout_id } : {}),
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : "Razorpay refused the refund.";
      const { error: failError } = await db.rpc("fail_refund", {
        p_refund_id: refund.id,
        p_error: error,
        p_actor: actor,
      });
      if (failError) console.error(`Could not mark refund ${refund.id} failed`, failError);
      return { ok: false, error, pending: false };
    }
  }

  const { data, error } = await db.rpc("complete_refund", {
    p_refund_id: refund.id,
    p_razorpay_refund_id: razorpayRefund.id,
    p_actor: actor,
  });

  if (error) {
    // The money has gone back but our books don't show it yet. Leave the row
    // pending; the next attempt finds this refund at Razorpay and books it.
    console.error(`Razorpay refund ${razorpayRefund.id} succeeded but could not be booked`, error);
    return {
      ok: false,
      error: `Razorpay refunded ${razorpayRefund.id}, but recording it failed: ${error.message}. Use “Check with Razorpay” to finish.`,
      pending: true,
    };
  }

  kickOutbox();

  const result = (data ?? {}) as {
    already_processed?: boolean;
    skipped?: SkippedLine[];
  };

  return {
    ok: true,
    alreadyProcessed: Boolean(result.already_processed),
    razorpayRefundId: razorpayRefund.id,
    skipped: result.skipped ?? [],
  };
}
