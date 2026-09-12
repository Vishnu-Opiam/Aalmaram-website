"use server";

import { revalidatePath } from "next/cache";
import { recordAudit, requireAdmin } from "@/lib/admin-auth";
import {
  assignAwbForShipment,
  cancelShipmentForOrder,
  couriersFor,
  createShipmentForOrder,
  refreshShipment,
  schedulePickupForShipment,
} from "@/lib/shipping";
import type { ActionState } from "./actions";

/**
 * The shipping half of the order screen. Same shape as the money actions next
 * door: `requireAdmin()` first, the work in `src/lib/shipping.ts`, and a
 * sentence the owner can act on either way.
 */

function refresh(orderId: string) {
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/shipments");
  revalidatePath("/admin");
}

const number = (value: FormDataEntryValue | null): number | undefined => {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

// ── Quote ───────────────────────────────────────────────────────────────────

export async function quoteCouriers(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return { error: "Missing order." };

  const result = await couriersFor(orderId);
  if (!result.ok) return { error: result.error };
  if (result.couriers.length === 0) {
    return { error: "No courier will carry this parcel to that PIN code at this weight." };
  }

  const best = result.couriers
    .slice(0, 4)
    .map((c) => `${c.courierName} ₹${(c.ratePaise / 100).toFixed(0)}${c.estimatedDays ? ` (${c.estimatedDays}d)` : ""}`)
    .join(" · ");

  return { error: "", ok: `${result.couriers.length} courier(s): ${best}` };
}

// ── Create ──────────────────────────────────────────────────────────────────

export async function createShipment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return { error: "Missing order." };

  const result = await createShipmentForOrder({
    orderId,
    actor: session.email,
    parcel: {
      weightKg: number(formData.get("weight_kg")),
      lengthCm: number(formData.get("length_cm")),
      breadthCm: number(formData.get("breadth_cm")),
      heightCm: number(formData.get("height_cm")),
    },
  });

  refresh(orderId);
  if (!result.ok) return { error: result.error };

  return {
    error: "",
    ok: "Shipment created at Shiprocket. The order is now fulfilled, so its address is frozen. Assign an AWB next.",
  };
}

// ── AWB ─────────────────────────────────────────────────────────────────────

export async function assignShipmentAwb(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const orderId = String(formData.get("order_id") ?? "");
  const shipmentId = String(formData.get("shipment_id") ?? "");
  if (!shipmentId) return { error: "Missing shipment." };

  const courierId = Number(String(formData.get("courier_id") ?? "").trim());

  const result = await assignAwbForShipment({
    shipmentId,
    courierId: Number.isFinite(courierId) && courierId > 0 ? courierId : null,
    actor: session.email,
  });

  if (orderId) refresh(orderId);
  if (!result.ok) return { error: result.error };

  return {
    error: "",
    ok: `AWB ${result.awbCode} with ${result.courierName}. ${
      result.emailed ? "The tracking email has gone to the customer." : "The tracking email was not sent — check the logs."
    }`,
  };
}

// ── Pickup ──────────────────────────────────────────────────────────────────

export async function requestPickup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const orderId = String(formData.get("order_id") ?? "");
  const shipmentId = String(formData.get("shipment_id") ?? "");
  if (!shipmentId) return { error: "Missing shipment." };

  const result = await schedulePickupForShipment({ shipmentId, actor: session.email });
  if (orderId) refresh(orderId);
  if (!result.ok) return { error: result.error };

  return {
    error: "",
    ok: result.token ? `Pickup booked (${result.token}).` : "Pickup requested.",
  };
}

// ── Refresh from Shiprocket ─────────────────────────────────────────────────

export async function refreshShipmentStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const orderId = String(formData.get("order_id") ?? "");
  const shipmentId = String(formData.get("shipment_id") ?? "");
  if (!shipmentId) return { error: "Missing shipment." };

  const result = await refreshShipment(shipmentId, session.email);
  if (orderId) refresh(orderId);
  if (!result.ok) return { error: result.error };

  if (!result.applied) {
    return { error: "", ok: `Nothing new — still ${result.status.replace(/_/g, " ")}.` };
  }
  return {
    error: "",
    ok: `Now ${result.status.replace(/_/g, " ")}.${result.emailed ? " The tracking email has gone out." : ""}`,
  };
}

// ── Cancel ──────────────────────────────────────────────────────────────────

export async function cancelShipment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const orderId = String(formData.get("order_id") ?? "");
  const shipmentId = String(formData.get("shipment_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  if (!shipmentId) return { error: "Missing shipment." };

  const result = await cancelShipmentForOrder({ shipmentId, reason, actor: session.email });
  if (orderId) refresh(orderId);
  if (!result.ok) return { error: result.error };

  await recordAudit(session, {
    action: "shipment.cancel.admin",
    entityType: "order",
    entityId: orderId,
    diff: { shipment_id: shipmentId, reason },
  });

  return {
    error: "",
    ok: `Shipment cancelled. ${result.orderNumber} is unfulfilled again, so it can be cancelled or re-addressed.`,
  };
}
