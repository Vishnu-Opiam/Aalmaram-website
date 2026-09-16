import "server-only";

import { sendShippingConfirmation } from "@/lib/email";
import { kickOutbox } from "@/lib/outbox";
import {
  assignAwb,
  cancelAdhocOrder,
  checkServiceability,
  createAdhocOrder,
  generateLabel,
  pickupLocation,
  schedulePickup,
  ShiprocketError,
  trackByAwb,
  trackingUrl,
  type CourierOption,
  type ShipmentStatus,
} from "@/lib/shiprocket";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";

/**
 * Everything between an order and a parcel.
 *
 * Shiprocket cannot join a Postgres transaction, so the shape here is the one
 * refunds already use: talk to them, then book the result through an RPC that
 * moves our side all at once. Where the two can disagree — a Shiprocket order
 * created for a shipment we then fail to record — the mistake is undone rather
 * than left lying around.
 */

export type ShippingResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; transient: boolean };

/** Whatever Shiprocket sent back, on its way into a jsonb column. */
const asJson = (value: unknown): Json => (value ?? {}) as Json;

function failure(err: unknown, fallback: string): { ok: false; error: string; transient: boolean } {
  if (err instanceof ShiprocketError) return { ok: false, error: err.message, transient: err.transient };
  return {
    ok: false,
    error: err instanceof Error ? err.message : fallback,
    transient: false,
  };
}

// ── The parcel ──────────────────────────────────────────────────────────────

export interface Parcel {
  weightKg: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
}

/**
 * Box defaults, editable in the create-shipment form before anything is sent.
 * Shiprocket bills on volumetric weight, so these are the owner's to confirm —
 * the fallbacks are a single-book carton, not a measurement.
 */
export const DEFAULT_PARCEL: Parcel = { weightKg: 0.5, lengthCm: 25, breadthCm: 20, heightCm: 4 };

export async function parcelDefaultsFor(orderId: string): Promise<Parcel> {
  const db = createAdminClient();

  const [{ data: setting }, { data: items }] = await Promise.all([
    db.from("settings").select("value").eq("key", "shipping").maybeSingle(),
    db.from("order_items").select("quantity, weight_grams").eq("order_id", orderId),
  ]);

  const parcel = ((setting?.value ?? {}) as { parcel?: Partial<Record<keyof Parcel, number>> }).parcel ?? {};
  const grams = (items ?? []).reduce((sum, item) => sum + item.weight_grams * item.quantity, 0);

  return {
    // A book with no recorded weight would otherwise be booked at zero, which
    // Shiprocket refuses.
    weightKg: grams > 0 ? Math.max(0.05, Math.round(grams) / 1000) : (parcel.weightKg ?? DEFAULT_PARCEL.weightKg),
    lengthCm: parcel.lengthCm ?? DEFAULT_PARCEL.lengthCm,
    breadthCm: parcel.breadthCm ?? DEFAULT_PARCEL.breadthCm,
    heightCm: parcel.heightCm ?? DEFAULT_PARCEL.heightCm,
  };
}

// ── Serviceability ──────────────────────────────────────────────────────────

export async function couriersFor(orderId: string): Promise<ShippingResult<{ couriers: CourierOption[] }>> {
  const db = createAdminClient();
  const { data: order } = await db
    .from("orders")
    .select("id, total_paise, shipping_address")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { ok: false, error: "That order no longer exists.", transient: false };

  const address = (order.shipping_address ?? {}) as Record<string, string>;
  if (!address.pincode) {
    return { ok: false, error: "This order has no PIN code, so nothing can be quoted.", transient: false };
  }

  try {
    const nickname = await pickupLocation();
    const pickup = await pickupPincodeFor(nickname);
    const parcel = await parcelDefaultsFor(orderId);
    const couriers = await checkServiceability({
      pickupPincode: pickup,
      deliveryPincode: address.pincode,
      weightKg: parcel.weightKg,
      declaredValuePaise: order.total_paise,
    });
    return { ok: true, couriers };
  } catch (err) {
    return failure(err, "Could not check serviceability.");
  }
}

/**
 * Serviceability is quoted between two PIN codes, and Shiprocket's pickup
 * nickname does not carry one. It is kept alongside the nickname in settings.
 */
async function pickupPincodeFor(nickname: string): Promise<string> {
  const fromEnv = process.env.SHIPROCKET_PICKUP_PINCODE?.trim();
  if (fromEnv) return fromEnv;

  const db = createAdminClient();
  const { data } = await db.from("settings").select("value").eq("key", "shiprocket").maybeSingle();
  const value = (data?.value ?? {}) as { pickup_pincode?: string };
  if (value.pickup_pincode) return value.pickup_pincode;

  throw new ShiprocketError(
    `No PIN code is recorded for the pickup location "${nickname}". Add SHIPROCKET_PICKUP_PINCODE to .env.local.`,
    0
  );
}

// ── Create ──────────────────────────────────────────────────────────────────

export async function createShipmentForOrder(params: {
  orderId: string;
  actor: string;
  parcel?: Partial<Parcel>;
}): Promise<ShippingResult<{ shipmentId: string; shiprocketShipmentId: string }>> {
  const db = createAdminClient();

  const { data: order } = await db
    .from("orders")
    .select(
      "id, order_number, email, phone, placed_at, created_at, subtotal_paise, order_status, payment_status, fulfillment_status, shipping_address, order_items ( title, variant_title, sku, quantity, unit_price_paise )"
    )
    .eq("id", params.orderId)
    .maybeSingle();

  if (!order) return { ok: false, error: "That order no longer exists.", transient: false };

  const address = (order.shipping_address ?? {}) as Record<string, string>;
  for (const field of ["line1", "city", "state", "pincode"]) {
    if (!address[field]) {
      return { ok: false, error: `The shipping address has no ${field}. Fix it before shipping.`, transient: false };
    }
  }

  // Cheap checks first, so an order that could never ship does not leave a
  // stray order behind at Shiprocket. The RPC checks all of this again, under
  // a lock — this is only about not wasting the call.
  const { data: existing } = await db
    .from("shipments")
    .select("id, status")
    .eq("order_id", order.id)
    .neq("status", "cancelled")
    .maybeSingle();
  if (existing) {
    return { ok: false, error: "This order already has a shipment.", transient: false };
  }
  if (order.order_status === "cancelled" || order.fulfillment_status === "cancelled") {
    return { ok: false, error: "This order is cancelled.", transient: false };
  }
  if (!["paid", "partially_refunded"].includes(order.payment_status)) {
    return { ok: false, error: `This order is ${order.payment_status}, so it cannot be shipped.`, transient: false };
  }

  const defaults = await parcelDefaultsFor(order.id);
  const parcel: Parcel = { ...defaults, ...params.parcel };
  if (!(parcel.weightKg > 0) || !(parcel.lengthCm > 0) || !(parcel.breadthCm > 0) || !(parcel.heightCm > 0)) {
    return { ok: false, error: "Weight and all three dimensions must be above zero.", transient: false };
  }

  let created;
  try {
    created = await createAdhocOrder({
      orderNumber: order.order_number,
      placedAt: order.placed_at ?? order.created_at,
      pickupLocation: await pickupLocation(),
      billing: {
        name: address.name ?? "",
        line1: address.line1,
        line2: address.line2 ?? "",
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        phone: address.phone ?? order.phone ?? "",
        email: order.email,
      },
      items: order.order_items.map((item) => ({
        name: item.title,
        sku: item.sku ?? "",
        units: item.quantity,
        sellingPriceRupees: Math.round(item.unit_price_paise) / 100,
      })),
      subTotalRupees: Math.round(order.subtotal_paise) / 100,
      ...parcel,
    });
  } catch (err) {
    return failure(err, "Shiprocket would not create the shipment.");
  }

  const { data, error } = await db.rpc("create_shipment", {
    p_order_id: order.id,
    p_shiprocket_order_id: created.shiprocketOrderId,
    p_shiprocket_shipment_id: created.shipmentId,
    p_raw: asJson({ adhoc: created.raw, parcel }),
    p_actor: params.actor,
  });

  if (error) {
    // The shipment exists at Shiprocket but not here. Undo it, so the owner is
    // not left with a phantom order in their dashboard.
    await cancelAdhocOrder(created.shiprocketOrderId).catch((err) =>
      console.error(
        `Shiprocket order ${created.shiprocketOrderId} could not be recorded and could not be cancelled either`,
        err
      )
    );
    return { ok: false, error: error.message, transient: false };
  }

  const result = data as { shipment_id: string };
  return { ok: true, shipmentId: result.shipment_id, shiprocketShipmentId: created.shipmentId };
}

// ── AWB ─────────────────────────────────────────────────────────────────────

export async function assignAwbForShipment(params: {
  shipmentId: string;
  courierId?: number | null;
  actor: string;
}): Promise<ShippingResult<{ awbCode: string; courierName: string; emailed: boolean }>> {
  const db = createAdminClient();
  const { data: shipment } = await db
    .from("shipments")
    .select("id, order_id, status, awb_code, shiprocket_shipment_id")
    .eq("id", params.shipmentId)
    .maybeSingle();

  if (!shipment) return { ok: false, error: "That shipment no longer exists.", transient: false };
  if (shipment.status === "cancelled") {
    return { ok: false, error: "That shipment is cancelled.", transient: false };
  }
  if (!shipment.shiprocket_shipment_id) {
    return { ok: false, error: "That shipment has no Shiprocket id.", transient: false };
  }

  let awb;
  try {
    awb = await assignAwb({
      shipmentId: shipment.shiprocket_shipment_id,
      courierId: params.courierId ?? null,
    });
  } catch (err) {
    return failure(err, "Shiprocket would not assign an AWB.");
  }

  // A label is a convenience, not part of the transaction.
  let labelUrl = awb.labelUrl;
  if (!labelUrl) {
    labelUrl = await generateLabel(shipment.shiprocket_shipment_id).catch(() => null);
  }

  const { data, error } = await db.rpc("assign_shipment_awb", {
    p_shipment_id: shipment.id,
    p_awb_code: awb.awbCode,
    p_courier_name: awb.courierName,
    p_tracking_url: trackingUrl(awb.awbCode),
    p_label_url: labelUrl ?? undefined,
    p_raw: asJson({ awb: awb.raw }),
    p_actor: params.actor,
  });

  if (error) {
    console.error(`AWB ${awb.awbCode} was assigned at Shiprocket but could not be recorded`, error);
    return {
      ok: false,
      error: `Shiprocket assigned AWB ${awb.awbCode}, but recording it failed: ${error.message}. Use “Refresh from Shiprocket”.`,
      transient: true,
    };
  }

  const result = data as { notify_shipped?: boolean };
  if (result.notify_shipped) kickOutbox();
  const emailed = result.notify_shipped ? await notifyShipped(shipment.order_id) : false;

  return { ok: true, awbCode: awb.awbCode, courierName: awb.courierName, emailed };
}

export async function schedulePickupForShipment(params: {
  shipmentId: string;
  actor: string;
}): Promise<ShippingResult<{ token: string | null }>> {
  const db = createAdminClient();
  const { data: shipment } = await db
    .from("shipments")
    .select("id, shiprocket_shipment_id, status")
    .eq("id", params.shipmentId)
    .maybeSingle();

  if (!shipment?.shiprocket_shipment_id) {
    return { ok: false, error: "That shipment no longer exists.", transient: false };
  }
  if (shipment.status === "cancelled") {
    return { ok: false, error: "That shipment is cancelled.", transient: false };
  }

  let pickup;
  try {
    pickup = await schedulePickup(shipment.shiprocket_shipment_id);
  } catch (err) {
    return failure(err, "Shiprocket would not schedule a pickup.");
  }

  const { error } = await db.rpc("record_shipment_pickup", {
    p_shipment_id: shipment.id,
    p_pickup_token: pickup.tokenNumber ?? "",
    p_scheduled_at: pickup.scheduledAt ? new Date(pickup.scheduledAt).toISOString() : undefined,
    p_raw: asJson({ pickup: pickup.raw }),
    p_actor: params.actor,
  });

  if (error) return { ok: false, error: error.message, transient: false };
  return { ok: true, token: pickup.tokenNumber };
}

// ── Status ──────────────────────────────────────────────────────────────────

export interface StatusUpdate {
  shipmentId?: string | null;
  awbCode?: string | null;
  status: ShipmentStatus;
  remoteStatus?: string;
  detail?: string;
  occurredAt?: string | null;
  raw?: unknown;
  actor: string;
}

/**
 * Books a status and, if this is the call that made the shipment trackable,
 * sends the one tracking email. Both the webhook and the cron come through
 * here so neither can send a second.
 */
export async function applyShipmentStatus(
  update: StatusUpdate
): Promise<ShippingResult<{ applied: boolean; reason?: string; status: string; emailed: boolean }>> {
  const db = createAdminClient();

  const { data, error } = await db.rpc("update_shipment_status", {
    p_shipment_id: update.shipmentId ?? undefined,
    p_awb_code: update.awbCode ?? undefined,
    p_status: update.status,
    p_remote_status: update.remoteStatus ?? "",
    p_detail: update.detail ?? "",
    p_occurred_at: update.occurredAt ?? undefined,
    p_raw: asJson(update.raw),
    p_actor: update.actor,
  });

  if (error) {
    return { ok: false, error: error.message, transient: error.code !== "P0002" && error.code !== "22023" };
  }

  const result = data as {
    applied: boolean;
    reason?: string;
    status: string;
    notify?: string | null;
    order_id?: string;
  };

  if (result.applied) kickOutbox();

  const emailed =
    result.applied && result.notify === "shipped" && result.order_id
      ? await notifyShipped(result.order_id)
      : false;

  return { ok: true, applied: result.applied, reason: result.reason, status: result.status, emailed };
}

/** Asks Shiprocket where the parcel is and books whatever comes back. */
export async function refreshShipment(
  shipmentId: string,
  actor = "system"
): Promise<ShippingResult<{ applied: boolean; status: string; reason?: string; emailed: boolean }>> {
  const db = createAdminClient();
  const { data: shipment } = await db
    .from("shipments")
    .select("id, awb_code, status")
    .eq("id", shipmentId)
    .maybeSingle();

  if (!shipment) return { ok: false, error: "That shipment no longer exists.", transient: false };
  if (!shipment.awb_code) {
    return { ok: false, error: "There is no AWB to track yet.", transient: false };
  }

  let tracking;
  try {
    tracking = await trackByAwb(shipment.awb_code);
  } catch (err) {
    return failure(err, "Could not reach Shiprocket for tracking.");
  }

  if (!tracking.status) {
    return {
      ok: true,
      applied: false,
      status: shipment.status,
      reason: tracking.remoteStatus ? `unmapped: ${tracking.remoteStatus}` : "nothing yet",
      emailed: false,
    };
  }

  if (tracking.expectedDeliveryDate) {
    await db
      .from("shipments")
      .update({ expected_delivery_date: tracking.expectedDeliveryDate })
      .eq("id", shipment.id);
  }

  return applyShipmentStatus({
    shipmentId: shipment.id,
    status: tracking.status,
    remoteStatus: tracking.remoteStatus,
    detail: tracking.detail,
    occurredAt: tracking.occurredAt,
    raw: { track: tracking.raw },
    actor,
  });
}

// ── Cancel ──────────────────────────────────────────────────────────────────

export async function cancelShipmentForOrder(params: {
  shipmentId: string;
  reason: string;
  actor: string;
}): Promise<ShippingResult<{ orderNumber: string }>> {
  const db = createAdminClient();
  const { data: shipment } = await db
    .from("shipments")
    .select("id, shiprocket_order_id, shipped_at, status")
    .eq("id", params.shipmentId)
    .maybeSingle();

  if (!shipment) return { ok: false, error: "That shipment no longer exists.", transient: false };

  // Ours first: if Shiprocket refuses, nothing here has moved yet.
  if (shipment.shiprocket_order_id) {
    try {
      await cancelAdhocOrder(shipment.shiprocket_order_id);
    } catch (err) {
      return failure(err, "Shiprocket would not cancel the shipment.");
    }
  }

  const { data, error } = await db.rpc("cancel_shipment", {
    p_shipment_id: params.shipmentId,
    p_reason: params.reason,
    p_actor: params.actor,
  });

  if (error) return { ok: false, error: error.message, transient: false };
  return { ok: true, orderNumber: (data as { order_number: string }).order_number };
}

// ── The tracking email ──────────────────────────────────────────────────────

async function notifyShipped(orderId: string): Promise<boolean> {
  const db = createAdminClient();
  const { data: order } = await db
    .from("orders")
    .select(
      "order_number, email, shipping_address, order_items ( title, variant_title, quantity ), shipments ( awb_code, courier_name, tracking_url, status )"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return false;

  const shipment = (order.shipments ?? []).find((s) => s.status !== "cancelled");
  if (!shipment?.awb_code) return false;

  const address = (order.shipping_address ?? {}) as Record<string, string>;
  const { sent, error } = await sendShippingConfirmation(order.email, {
    orderNumber: order.order_number,
    name: address.name ?? "",
    items: order.order_items.map((item) => ({
      title: item.title,
      variantTitle: item.variant_title,
      quantity: item.quantity,
    })),
    courierName: shipment.courier_name ?? "",
    awbCode: shipment.awb_code,
    trackingUrl: shipment.tracking_url ?? trackingUrl(shipment.awb_code),
    address,
  });

  if (!sent) console.error(`Shipping email for ${order.order_number} not sent: ${error}`);
  return sent;
}
