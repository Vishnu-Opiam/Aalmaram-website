import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Shiprocket, over plain fetch — same reasoning as Razorpay: a handful of REST
 * calls, and the SDK would be more weight than it saves.
 *
 * The one piece of state is the bearer token. It lasts about ten days, so it
 * is cached in `settings.shiprocket` rather than fetched per request, and any
 * 401 refreshes it once and retries. Credentials are read from the environment
 * and never logged.
 */

const API = "https://apiv2.shiprocket.in/v1/external";

/** Their token is good for ~10 days; we treat it as expiring a day early. */
const TOKEN_LIFETIME_MS = 9 * 24 * 60 * 60 * 1000;

export function isShiprocketConfigured(): boolean {
  return Boolean(process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD);
}

/**
 * Thrown for anything Shiprocket refuses. `status` is the HTTP status, so a
 * caller can tell "they said no" (4xx, don't retry) from "they were down"
 * (5xx or 0, retry later).
 */
export class ShiprocketError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown
  ) {
    super(message);
    this.name = "ShiprocketError";
  }

  get transient(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

function credentials() {
  const email = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;
  if (!email || !password) {
    throw new ShiprocketError(
      "SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD are not set. Add the API user's credentials to .env.local.",
      0
    );
  }
  return { email, password };
}

/** The nickname of the pickup address, exactly as Shiprocket has it. */
export async function pickupLocation(): Promise<string> {
  const fromEnv = process.env.SHIPROCKET_PICKUP_LOCATION?.trim();
  if (fromEnv) return fromEnv;

  const db = createAdminClient();
  const { data } = await db.from("settings").select("value").eq("key", "shiprocket").maybeSingle();
  const value = (data?.value ?? {}) as { pickup_location?: string };
  const nickname = value.pickup_location?.trim();
  if (!nickname) {
    throw new ShiprocketError(
      "No Shiprocket pickup location is set. Add SHIPROCKET_PICKUP_LOCATION to .env.local, exactly as the nickname reads in Shiprocket.",
      0
    );
  }
  return nickname;
}

// ── Token ───────────────────────────────────────────────────────────────────

interface CachedToken {
  token?: string | null;
  token_expires_at?: string | null;
}

async function cachedToken(): Promise<string | null> {
  const db = createAdminClient();
  const { data } = await db.from("settings").select("value").eq("key", "shiprocket").maybeSingle();
  const value = (data?.value ?? {}) as CachedToken;
  if (!value.token || !value.token_expires_at) return null;
  return new Date(value.token_expires_at).getTime() > Date.now() ? value.token : null;
}

async function login(): Promise<string> {
  const { email, password } = credentials();

  let response: Response;
  try {
    response = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    throw new ShiprocketError(
      `Could not reach Shiprocket: ${err instanceof Error ? err.message : "network error"}`,
      0
    );
  }

  const text = await response.text();
  if (!response.ok) {
    // Never echo the request body back into a log line — it holds the password.
    throw new ShiprocketError(
      `Shiprocket refused the login (${response.status}). Check the API user's email and password.`,
      response.status
    );
  }

  const body = JSON.parse(text) as { token?: string };
  if (!body.token) throw new ShiprocketError("Shiprocket returned no token.", response.status);

  const db = createAdminClient();
  const { error } = await db.rpc("set_shiprocket_token", {
    p_token: body.token,
    p_expires_at: new Date(Date.now() + TOKEN_LIFETIME_MS).toISOString(),
  });
  if (error) console.error("Could not cache the Shiprocket token", error.message);

  return body.token;
}

/** Cached if it is still good, freshly logged in if not. */
export async function shiprocketToken(force = false): Promise<string> {
  if (!force) {
    const existing = await cachedToken();
    if (existing) return existing;
  }
  return login();
}

// ── Calls ───────────────────────────────────────────────────────────────────

async function call<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string | number> } = {},
  retryOn401 = true
): Promise<T> {
  const token = await shiprocketToken(!retryOn401);
  const { query, ...rest } = init;
  const url = new URL(`${API}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, String(value));

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...rest.headers,
      },
    });
  } catch (err) {
    throw new ShiprocketError(
      `Could not reach Shiprocket: ${err instanceof Error ? err.message : "network error"}`,
      0
    );
  }

  // The token expired early, or was revoked. One fresh login, one retry.
  if (response.status === 401 && retryOn401) {
    return call<T>(path, init, false);
  }

  const text = await response.text();
  if (!response.ok) {
    let detail = text.slice(0, 400);
    try {
      const parsed = JSON.parse(text) as { message?: string; errors?: unknown };
      detail = parsed.message ?? detail;
      if (parsed.errors) detail += ` ${JSON.stringify(parsed.errors).slice(0, 300)}`;
    } catch {}
    throw new ShiprocketError(`Shiprocket ${path} failed (${response.status}): ${detail}`, response.status);
  }

  return (text ? JSON.parse(text) : {}) as T;
}

// ── Serviceability ──────────────────────────────────────────────────────────

export interface CourierOption {
  courierCompanyId: number;
  courierName: string;
  ratePaise: number;
  estimatedDays: string;
  rating: number;
}

interface ServiceabilityResponse {
  data?: {
    available_courier_companies?: {
      courier_company_id: number;
      courier_name: string;
      rate: number;
      etd?: string;
      estimated_delivery_days?: string;
      rating?: number;
    }[];
  };
}

/** Cheapest first. An empty list means nobody delivers there at this weight. */
export async function checkServiceability(params: {
  pickupPincode: string;
  deliveryPincode: string;
  weightKg: number;
  declaredValuePaise: number;
}): Promise<CourierOption[]> {
  const body = await call<ServiceabilityResponse>("/courier/serviceability/", {
    method: "GET",
    query: {
      pickup_postcode: params.pickupPincode,
      delivery_postcode: params.deliveryPincode,
      weight: params.weightKg,
      cod: 0,
      declared_value: Math.round(params.declaredValuePaise / 100),
    },
  });

  return (body.data?.available_courier_companies ?? [])
    .map((courier) => ({
      courierCompanyId: courier.courier_company_id,
      courierName: courier.courier_name,
      ratePaise: Math.round(Number(courier.rate ?? 0) * 100),
      estimatedDays: String(courier.estimated_delivery_days ?? courier.etd ?? ""),
      rating: Number(courier.rating ?? 0),
    }))
    .sort((a, b) => a.ratePaise - b.ratePaise);
}

// ── Orders ──────────────────────────────────────────────────────────────────

export interface AdhocOrderInput {
  orderNumber: string;
  placedAt: string;
  pickupLocation: string;
  billing: {
    name: string;
    line1: string;
    line2: string;
    city: string;
    state: string;
    pincode: string;
    phone: string;
    email: string;
  };
  items: { name: string; sku: string; units: number; sellingPriceRupees: number; hsn?: string }[];
  subTotalRupees: number;
  weightKg: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
}

export interface AdhocOrderResult {
  shiprocketOrderId: string;
  shipmentId: string;
  status: string;
  raw: unknown;
}

export async function createAdhocOrder(input: AdhocOrderInput): Promise<AdhocOrderResult> {
  const [firstName, ...restOfName] = input.billing.name.trim().split(/\s+/);

  const payload = {
    order_id: input.orderNumber,
    order_date: input.placedAt.slice(0, 16).replace("T", " "),
    pickup_location: input.pickupLocation,
    billing_customer_name: firstName || input.billing.name || "Customer",
    billing_last_name: restOfName.join(" "),
    billing_address: input.billing.line1,
    billing_address_2: input.billing.line2,
    billing_city: input.billing.city,
    billing_pincode: input.billing.pincode,
    billing_state: input.billing.state,
    billing_country: "India",
    billing_email: input.billing.email,
    billing_phone: input.billing.phone.replace(/\D/g, "").slice(-10),
    shipping_is_billing: true,
    order_items: input.items.map((item) => ({
      name: item.name.slice(0, 120),
      sku: item.sku || item.name.slice(0, 40),
      units: item.units,
      selling_price: item.sellingPriceRupees,
      ...(item.hsn ? { hsn: item.hsn } : {}),
    })),
    payment_method: "Prepaid",
    sub_total: input.subTotalRupees,
    length: input.lengthCm,
    breadth: input.breadthCm,
    height: input.heightCm,
    weight: input.weightKg,
  };

  const body = await call<{
    order_id?: number | string;
    shipment_id?: number | string;
    status?: string;
    status_code?: number;
    message?: string;
  }>("/orders/create/adhoc", { method: "POST", body: JSON.stringify(payload) });

  if (!body.order_id || !body.shipment_id) {
    throw new ShiprocketError(
      `Shiprocket accepted the request but returned no shipment: ${body.message ?? JSON.stringify(body).slice(0, 300)}`,
      200,
      body
    );
  }

  return {
    shiprocketOrderId: String(body.order_id),
    shipmentId: String(body.shipment_id),
    status: String(body.status ?? "NEW"),
    raw: body,
  };
}

export async function cancelAdhocOrder(shiprocketOrderId: string): Promise<void> {
  await call("/orders/cancel", {
    method: "POST",
    body: JSON.stringify({ ids: [Number(shiprocketOrderId)] }),
  });
}

// ── AWB, label, pickup ──────────────────────────────────────────────────────

export interface AwbResult {
  awbCode: string;
  courierName: string;
  courierCompanyId: number | null;
  labelUrl: string | null;
  raw: unknown;
}

export async function assignAwb(params: {
  shipmentId: string;
  courierId?: number | null;
}): Promise<AwbResult> {
  const body = await call<{
    awb_assign_status?: number;
    response?: {
      data?: {
        awb_code?: string;
        courier_name?: string;
        courier_company_id?: number;
        label_url?: string;
      };
    };
    message?: string;
  }>("/courier/assign/awb", {
    method: "POST",
    body: JSON.stringify({
      shipment_id: Number(params.shipmentId),
      ...(params.courierId ? { courier_id: params.courierId } : {}),
    }),
  });

  const data = body.response?.data;
  if (!data?.awb_code) {
    throw new ShiprocketError(
      `Shiprocket did not assign an AWB: ${body.message ?? JSON.stringify(body).slice(0, 300)}`,
      200,
      body
    );
  }

  return {
    awbCode: String(data.awb_code),
    courierName: String(data.courier_name ?? ""),
    courierCompanyId: data.courier_company_id ?? null,
    labelUrl: data.label_url ?? null,
    raw: body,
  };
}

export async function generateLabel(shipmentId: string): Promise<string> {
  const body = await call<{ label_created?: number; label_url?: string; response?: string }>(
    "/courier/generate/label",
    { method: "POST", body: JSON.stringify({ shipment_id: [Number(shipmentId)] }) }
  );
  if (!body.label_url) {
    throw new ShiprocketError(`Shiprocket returned no label: ${body.response ?? "unknown reason"}`, 200, body);
  }
  return body.label_url;
}

export interface PickupResult {
  tokenNumber: string | null;
  scheduledAt: string | null;
  raw: unknown;
}

export async function schedulePickup(shipmentId: string): Promise<PickupResult> {
  const body = await call<{
    pickup_status?: number;
    response?: { pickup_token_number?: string; pickup_scheduled_date?: string; data?: string };
    message?: string;
  }>("/courier/generate/pickup", {
    method: "POST",
    body: JSON.stringify({ shipment_id: [Number(shipmentId)] }),
  });

  return {
    tokenNumber: body.response?.pickup_token_number ?? null,
    scheduledAt: body.response?.pickup_scheduled_date ?? null,
    raw: body,
  };
}

// ── Tracking ────────────────────────────────────────────────────────────────

export interface TrackingResult {
  /** Our canonical status, or null when Shiprocket says nothing we recognise. */
  status: ShipmentStatus | null;
  remoteStatus: string;
  detail: string;
  occurredAt: string | null;
  expectedDeliveryDate: string | null;
  raw: unknown;
}

export async function trackByAwb(awb: string): Promise<TrackingResult> {
  const body = await call<TrackAwbResponse>(`/courier/track/awb/${encodeURIComponent(awb)}`, {
    method: "GET",
  });

  const tracking = body.tracking_data ?? {};
  const track = tracking.shipment_track?.[0];
  const latest = tracking.shipment_track_activities?.[0];
  const remote = String(track?.current_status ?? tracking.shipment_status ?? latest?.status ?? "");

  return {
    status: mapShiprocketStatus(remote, tracking.shipment_status),
    remoteStatus: remote,
    detail: String(latest?.activity ?? ""),
    occurredAt: parseShiprocketDate(latest?.date ?? track?.updated_date ?? null),
    expectedDeliveryDate: track?.edd ? (parseShiprocketDate(track.edd) ?? "").slice(0, 10) || null : null,
    raw: body,
  };
}

interface TrackAwbResponse {
  tracking_data?: {
    track_status?: number;
    shipment_status?: number | string;
    shipment_track?: {
      current_status?: string;
      updated_date?: string;
      edd?: string;
      delivered_date?: string;
    }[];
    shipment_track_activities?: { date?: string; status?: string; activity?: string }[];
  };
}

// ── Status mapping ──────────────────────────────────────────────────────────

export type ShipmentStatus =
  | "pending"
  | "awb_assigned"
  | "pickup_scheduled"
  | "in_transit"
  | "out_for_delivery"
  | "undelivered"
  | "delivered"
  | "rto"
  | "rto_initiated"
  | "rto_delivered"
  | "lost"
  | "cancelled";

/**
 * Shiprocket's vocabulary is much wider than ours and it sends the same idea
 * under several names. Anything unrecognised returns null, which the callers
 * treat as "note it, change nothing" rather than guessing.
 */
const BY_NAME: [RegExp, ShipmentStatus][] = [
  [/^(new|invoiced|ready to ship|pickup error|pickup rescheduled|pickup queued)/i, "pending"],
  [/^(awb assigned|label generated)/i, "awb_assigned"],
  [/^(pickup scheduled|pickup generated|out for pickup|pickup booked)/i, "pickup_scheduled"],
  [/^(picked up|in transit|shipped|reached destination|misroute|custom cleared|in flight)/i, "in_transit"],
  [/^out for delivery/i, "out_for_delivery"],
  [/^(undelivered|delivery delayed|delayed|delivery rescheduled|failed delivery)/i, "undelivered"],
  [/^delivered/i, "delivered"],
  [/^(rto initiated|rto in transit|rto acknowledged|rto)/i, "rto_initiated"],
  [/^rto delivered/i, "rto_delivered"],
  [/^(lost|damaged|destroyed|disposed)/i, "lost"],
  [/^(cancell?ed|canceled)/i, "cancelled"],
];

/** The numeric codes, for the webhook payloads that send those instead. */
const BY_CODE: Record<number, ShipmentStatus> = {
  1: "pending", // NEW
  2: "pending", // INVOICED
  3: "pending", // READY TO SHIP
  4: "pending", // PICKUP SCHEDULED (before AWB)
  5: "cancelled",
  6: "in_transit", // SHIPPED
  7: "delivered",
  8: "cancelled",
  9: "rto_initiated",
  10: "rto_delivered",
  12: "lost",
  13: "pending", // PICKUP ERROR
  14: "rto_initiated", // RTO ACKNOWLEDGED
  15: "pending", // PICKUP RESCHEDULED
  16: "cancelled", // CANCELLATION REQUESTED
  17: "out_for_delivery",
  18: "in_transit",
  19: "pickup_scheduled", // OUT FOR PICKUP
  20: "pending", // PICKUP EXCEPTION
  21: "undelivered",
  22: "undelivered", // DELIVERY DELAYED
  23: "undelivered", // PARTIAL_DELIVERED
  24: "lost", // DESTROYED
  25: "lost", // DAMAGED
  38: "in_transit", // REACHED DESTINATION HUB
  42: "in_transit", // PICKED UP
  46: "pending", // PICKUP BOOKED
};

export function mapShiprocketStatus(
  name: string | null | undefined,
  code?: number | string | null
): ShipmentStatus | null {
  const text = (name ?? "").trim();
  if (text) {
    for (const [pattern, status] of BY_NAME) if (pattern.test(text)) return status;
  }
  const numeric = typeof code === "string" ? Number(code) : code;
  if (typeof numeric === "number" && Number.isFinite(numeric) && BY_CODE[numeric]) {
    return BY_CODE[numeric];
  }
  return null;
}

/**
 * Shiprocket sends "2026-09-12 14:05:00" with no zone, meaning Indian time,
 * and sometimes an ISO string. Returns an ISO instant, or null.
 */
export function parseShiprocketDate(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (!text) return null;

  const naive = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(:(\d{2}))?$/.exec(text);
  if (naive) {
    const date = new Date(
      `${naive[1]}-${naive[2]}-${naive[3]}T${naive[4]}:${naive[5]}:${naive[7] ?? "00"}+05:30`
    );
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const parsed = new Date(dateOnly ? `${text}T00:00:00+05:30` : text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Where a buyer can watch the parcel. */
export function trackingUrl(awb: string): string {
  return `https://shiprocket.co/tracking/${encodeURIComponent(awb)}`;
}
