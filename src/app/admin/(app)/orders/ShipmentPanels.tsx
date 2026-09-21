"use client";

import { useActionState } from "react";
import { Notice, Pill, SectionTitle, inputClass, labelClass, type Tone, sentence } from "../ui";
import type { ActionState } from "./actions";
import {
  assignShipmentAwb,
  cancelShipment,
  createShipment,
  quoteCouriers,
  refreshShipmentStatus,
  requestPickup,
} from "./shipping-actions";

const INITIAL: ActionState = { error: "" };

export interface ShipmentView {
  id: string;
  status: string;
  statusDetail: string;
  shiprocketOrderId: string | null;
  shiprocketShipmentId: string | null;
  awbCode: string | null;
  courierName: string | null;
  labelUrl: string | null;
  trackingUrl: string | null;
  pickupToken: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  lastStatusAt: string | null;
}

export const SHIPMENT_TONE: Record<string, Tone> = {
  pending: "warn",
  awb_assigned: "warn",
  pickup_scheduled: "warn",
  in_transit: "good",
  out_for_delivery: "good",
  undelivered: "bad",
  delivered: "good",
  rto: "bad",
  rto_initiated: "bad",
  rto_delivered: "bad",
  lost: "bad",
  cancelled: "quiet",
};

export function ShipmentPill({ status }: { status: string }) {
  return <Pill tone={SHIPMENT_TONE[status] ?? "quiet"}>{sentence(status)}</Pill>;
}

function confirmFirst(message: string) {
  return (event: React.FormEvent<HTMLFormElement>) => {
    if (!window.confirm(message)) event.preventDefault();
  };
}

// ── Before there is a shipment ──────────────────────────────────────────────

export function CreateShipmentPanel({
  orderId,
  parcel,
}: {
  orderId: string;
  parcel: { weightKg: number; lengthCm: number; breadthCm: number; heightCm: number };
}) {
  const [quote, quoteAction, quoting] = useActionState(quoteCouriers, INITIAL);
  const [state, formAction, pending] = useActionState(createShipment, INITIAL);

  return (
    <div className="space-y-5">
      <SectionTitle hint="Books the parcel with Shiprocket. Check the box size first — they bill on volume, and the order's address is frozen once this goes.">
        Shipping
      </SectionTitle>

      <form action={quoteAction}>
        <input type="hidden" name="order_id" value={orderId} />
        <button
          type="submit"
          disabled={quoting}
          className="qlink text-[12.5px]"
        >
          {quoting ? "Asking Shiprocket…" : "Who can carry it? ↗"}
        </button>
      </form>
      <Notice error={quote.error} ok={quote.ok} />

      <form
        action={formAction}
        onSubmit={confirmFirst("Create this shipment at Shiprocket? The order becomes fulfilled and its address can no longer be edited.")}
        className="space-y-5"
      >
        <input type="hidden" name="order_id" value={orderId} />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <label className="block">
            <span className={labelClass}>Weight (kg)</span>
            <input name="weight_kg" inputMode="decimal" defaultValue={parcel.weightKg} className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>Length (cm)</span>
            <input name="length_cm" inputMode="decimal" defaultValue={parcel.lengthCm} className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>Breadth (cm)</span>
            <input name="breadth_cm" inputMode="decimal" defaultValue={parcel.breadthCm} className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>Height (cm)</span>
            <input name="height_cm" inputMode="decimal" defaultValue={parcel.heightCm} className={inputClass} />
          </label>
        </div>

        <Notice error={state.error} ok={state.ok} />

        <button
          type="submit"
          disabled={pending}
          className="btn-night px-4 py-2.5 text-[13px]"
        >
          {pending ? "Creating…" : "Create shipment"}
        </button>
      </form>
    </div>
  );
}

// ── Once there is one ───────────────────────────────────────────────────────

export function ShipmentCard({ orderId, shipment }: { orderId: string; shipment: ShipmentView }) {
  const [awb, awbAction, assigning] = useActionState(assignShipmentAwb, INITIAL);
  const [pickup, pickupAction, picking] = useActionState(requestPickup, INITIAL);
  const [refresh, refreshAction, refreshing] = useActionState(refreshShipmentStatus, INITIAL);
  const [cancel, cancelAction, cancelling] = useActionState(cancelShipment, INITIAL);

  const hasAwb = Boolean(shipment.awbCode);
  const live = shipment.status !== "cancelled";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <SectionTitle>Shipment</SectionTitle>
        <ShipmentPill status={shipment.status} />
      </div>

      <dl className="space-y-2 text-[12.5px] break-all">
        <Line label="Courier" value={shipment.courierName ?? "—"} />
        <Line label="AWB" value={shipment.awbCode ?? "not assigned yet"} />
        <Line label="Shiprocket order" value={shipment.shiprocketOrderId ?? "—"} />
        {shipment.pickupToken && <Line label="Pickup token" value={shipment.pickupToken} />}
        {shipment.statusDetail && <Line label="Latest" value={shipment.statusDetail} />}
      </dl>

      <div className="flex flex-wrap items-center gap-5 text-[12.5px]">
        {shipment.trackingUrl && (
          <a href={shipment.trackingUrl} target="_blank" rel="noreferrer" className="qlink">
            TRACK ↗
          </a>
        )}
        {shipment.labelUrl && (
          <a href={shipment.labelUrl} target="_blank" rel="noreferrer" className="qlink">
            LABEL ↗
          </a>
        )}
      </div>

      {live && !hasAwb && (
        <form action={awbAction} className="space-y-4">
          <input type="hidden" name="order_id" value={orderId} />
          <input type="hidden" name="shipment_id" value={shipment.id} />
          <label className="block max-w-[220px]">
            <span className={labelClass}>Courier ID (optional)</span>
            <input name="courier_id" inputMode="numeric" placeholder="cheapest" className={inputClass} />
          </label>
          <Notice error={awb.error} ok={awb.ok} />
          <button
            type="submit"
            disabled={assigning}
            className="btn-night px-4 py-2.5 text-[13px]"
          >
            {assigning ? "Assigning…" : "Assign AWB"}
          </button>
          <p className="text-[12px] opacity-60">
            Leave the courier blank to take Shiprocket&rsquo;s recommendation. This is what sends the
            customer their tracking email.
          </p>
        </form>
      )}

      {live && hasAwb && (
        <div className="flex flex-wrap gap-6">
          <form action={pickupAction}>
            <input type="hidden" name="order_id" value={orderId} />
            <input type="hidden" name="shipment_id" value={shipment.id} />
            <button
              type="submit"
              disabled={picking}
              className="qlink text-[12.5px]"
            >
              {picking ? "Booking…" : "Book a pickup"}
            </button>
          </form>
          <form action={refreshAction}>
            <input type="hidden" name="order_id" value={orderId} />
            <input type="hidden" name="shipment_id" value={shipment.id} />
            <button
              type="submit"
              disabled={refreshing}
              className="qlink text-[12.5px]"
            >
              {refreshing ? "Checking…" : "Refresh from Shiprocket"}
            </button>
          </form>
        </div>
      )}

      <Notice error={pickup.error} ok={pickup.ok} />
      <Notice error={refresh.error} ok={refresh.ok} />

      {live && !shipment.shippedAt && (
        <form
          action={cancelAction}
          onSubmit={confirmFirst("Cancel this shipment at Shiprocket? The order goes back to unfulfilled.")}
          className="space-y-4 pt-2"
        >
          <input type="hidden" name="order_id" value={orderId} />
          <input type="hidden" name="shipment_id" value={shipment.id} />
          <label className="block">
            <span className={labelClass}>Reason</span>
            <input name="reason" placeholder="Booked the wrong box" className={inputClass} />
          </label>
          <Notice error={cancel.error} ok={cancel.ok} />
          <button
            type="submit"
            disabled={cancelling}
            className="px-7 py-3 text-[12.5px] font-normal rounded"
            style={{ color: "var(--spice)", border: "1px solid rgba(164,66,44,.4)" }}
          >
            {cancelling ? "Cancelling…" : "Cancel shipment"}
          </button>
        </form>
      )}

      {shipment.shippedAt && live && (
        <p className="text-[12px] opacity-60">
          This parcel has left us, so it can no longer be cancelled — a return comes back as an RTO.
        </p>
      )}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="opacity-70">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
