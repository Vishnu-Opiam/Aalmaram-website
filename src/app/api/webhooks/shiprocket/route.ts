import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { applyShipmentStatus } from "@/lib/shipping";
import { mapShiprocketStatus, parseShiprocketDate } from "@/lib/shiprocket";

/**
 * Shiprocket's tracking webhook.
 *
 * They authenticate with a shared token in `x-api-key` — there is no signature
 * over the body, so the token is all there is; it is compared in constant time
 * and the route does nothing at all without it.
 *
 * Everything about how this is applied lives in `update_shipment_status`: a
 * repeat, a stale event, or one that would walk a finished parcel backwards is
 * recorded and ignored. Only a genuine change stamps a date, enqueues an event
 * or sends the tracking email.
 */

export const dynamic = "force-dynamic";

interface ShiprocketWebhook {
  awb?: string | number;
  awb_code?: string | number;
  current_status?: string;
  shipment_status?: string;
  current_status_id?: number | string;
  shipment_status_id?: number | string;
  status?: string;
  current_timestamp?: string;
  status_update_time?: string;
  order_id?: string;
  sr_order_id?: number | string;
  courier_name?: string;
  etd?: string;
  scans?: { activity?: string; date?: string; status?: string }[];
}

function authorised(request: Request): boolean {
  const expected = process.env.SHIPROCKET_WEBHOOK_TOKEN;
  if (!expected) {
    console.error("SHIPROCKET_WEBHOOK_TOKEN is not set — refusing every Shiprocket webhook.");
    return false;
  }

  const provided = request.headers.get("x-api-key") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which is itself a leak of
  // sorts; compare a fixed-length pair instead.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    console.error("Rejected a Shiprocket webhook with a bad or missing token");
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let event: ShiprocketWebhook;
  try {
    event = (await request.json()) as ShiprocketWebhook;
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  const awb = String(event.awb ?? event.awb_code ?? "").trim();
  if (!awb) {
    // Nothing to match on. Acknowledge, because retrying will not help.
    console.error("Shiprocket webhook arrived with no AWB", JSON.stringify(event).slice(0, 300));
    return NextResponse.json({ received: true, ignored: "no awb" });
  }

  const remote = String(event.current_status ?? event.shipment_status ?? event.status ?? "");
  const status = mapShiprocketStatus(remote, event.current_status_id ?? event.shipment_status_id);

  if (!status) {
    // Their vocabulary is wider than ours and grows. An unknown status is not
    // a failure; it just isn't something we model.
    console.warn(`Shiprocket webhook for ${awb}: unmapped status "${remote}"`);
    return NextResponse.json({ received: true, ignored: "unmapped", status: remote });
  }

  const latest = event.scans?.[event.scans.length - 1];
  const result = await applyShipmentStatus({
    awbCode: awb,
    status,
    remoteStatus: remote,
    detail: latest?.activity ?? "",
    occurredAt: parseShiprocketDate(event.current_timestamp ?? event.status_update_time ?? latest?.date),
    raw: { webhook: event },
    actor: "shiprocket-webhook",
  });

  if (!result.ok) {
    // An AWB we have never heard of is a human problem, not a retry: say yes so
    // Shiprocket stops, and log it. Anything else may be transient.
    if (!result.transient) {
      console.error(`Shiprocket webhook for ${awb} could not be applied: ${result.error}`);
      return NextResponse.json({ received: true, ignored: result.error });
    }
    console.error(`Shiprocket webhook for ${awb} failed: ${result.error}`);
    return NextResponse.json({ error: "Could not record the update" }, { status: 500 });
  }

  return NextResponse.json({
    received: true,
    applied: result.applied,
    status: result.status,
    ...(result.reason ? { reason: result.reason } : {}),
  });
}
