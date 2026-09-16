import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/cron";
import { refreshShipment } from "@/lib/shipping";
import { isShiprocketConfigured } from "@/lib/shiprocket";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The fallback for the tracking webhook.
 *
 * Webhooks are lost, misconfigured, or never set up in the first place, and a
 * parcel that quietly stops updating is worse than an extra API call. This
 * polls the shipments that are still in flight, oldest news first, and books
 * whatever Shiprocket says through exactly the same path the webhook uses — so
 * a status it has already seen changes nothing and sends no second email.
 *
 * Guarded by CRON_SECRET, as every cron route is.
 */

export const dynamic = "force-dynamic";

/** Kept small: Vercel crons have a wall clock, and this runs a few times a day. */
const BATCH = 20;

const SETTLED = ["delivered", "rto_delivered", "lost", "cancelled"];

export async function GET(request: Request) {
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  if (!isShiprocketConfigured()) {
    return NextResponse.json({ skipped: "Shiprocket is not configured" });
  }

  const db = createAdminClient();
  const { data: shipments, error } = await db
    .from("shipments")
    .select("id, awb_code, status, last_status_at")
    .not("awb_code", "is", null)
    .not("status", "in", `(${SETTLED.join(",")})`)
    .order("last_status_at", { ascending: true, nullsFirst: true })
    .limit(BATCH);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const checked: { id: string; status: string; applied: boolean; note?: string }[] = [];
  let failures = 0;

  for (const shipment of shipments ?? []) {
    const result = await refreshShipment(shipment.id, "cron-track");
    if (!result.ok) {
      failures++;
      console.error(`Tracking ${shipment.awb_code} failed: ${result.error}`);
      checked.push({ id: shipment.id, status: shipment.status, applied: false, note: result.error });
      continue;
    }
    checked.push({
      id: shipment.id,
      status: result.status,
      applied: result.applied,
      ...(result.reason ? { note: result.reason } : {}),
    });
  }

  return NextResponse.json({
    checked: checked.length,
    changed: checked.filter((c) => c.applied).length,
    failures,
    shipments: checked,
  });
}
