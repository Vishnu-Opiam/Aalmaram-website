import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/cron";
import { drainOutbox } from "@/lib/outbox";

/**
 * The fallback drain for webhook_outbox → n8n.
 *
 * Most rows are delivered seconds after they are written, by the kick that
 * follows every order, refund and shipment. This picks up everything else:
 * retries that have come due, rows whose kick never ran, and events queued
 * before a topic's webhook URL was configured. Guarded by CRON_SECRET.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  try {
    // Two batches at most: 40 sends at a 10s timeout each still fits the
    // function's wall clock, and a backlog larger than that drains next run.
    const first = await drainOutbox({ limit: 20 });
    const second = first.claimed === 20 ? await drainOutbox({ limit: 20 }) : null;
    const total = second
      ? {
          claimed: first.claimed + second.claimed,
          sent: first.sent + second.sent,
          retrying: first.retrying + second.retrying,
          failed: first.failed + second.failed,
          deferred: first.deferred + second.deferred,
          dropped: first.dropped + second.dropped,
          errors: [...first.errors, ...second.errors],
        }
      : first;
    return NextResponse.json(total);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
