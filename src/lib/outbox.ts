import "server-only";

import { createHmac } from "node:crypto";
import { after } from "next/server";
import type { Json, Tables } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Delivers `webhook_outbox` rows to n8n.
 *
 * Rows are written by Postgres in the same transaction as the thing they
 * describe, so an order can never exist without its `order.paid` row. This is
 * the other half: lease due rows, POST each one to the n8n webhook for its
 * topic, and record the result. Delivery is at least once — a drain that dies
 * between n8n answering and us recording it will send that row again — so every
 * body carries `event.id` for n8n to de-duplicate on if a flow ever needs to.
 *
 * Two things run it: `kickOutbox()` straight after anything that enqueues (so
 * n8n hears within seconds), and `/api/cron/outbox` as the fallback that picks
 * up retries and anything the kick missed.
 *
 * The body is documented in docs/custom-commerce/EVENTS.md.
 */

export type OutboxTopic = Tables<"webhook_outbox">["topic"];

export const OUTBOX_TOPICS = [
  "order.paid",
  "order.shipped",
  "order.delivered",
  "order.refunded",
  "order.cancelled",
  "inventory.low",
] as const;

const TOPIC_ENV: Record<(typeof OUTBOX_TOPICS)[number], string> = {
  "order.paid": "N8N_ORDER_PAID_WEBHOOK_URL",
  "order.shipped": "N8N_ORDER_SHIPPED_WEBHOOK_URL",
  "order.delivered": "N8N_ORDER_DELIVERED_WEBHOOK_URL",
  "order.refunded": "N8N_ORDER_REFUNDED_WEBHOOK_URL",
  "order.cancelled": "N8N_ORDER_CANCELLED_WEBHOOK_URL",
  "inventory.low": "N8N_INVENTORY_LOW_WEBHOOK_URL",
};

export function topicEnvName(topic: string): string | null {
  return TOPIC_ENV[topic as keyof typeof TOPIC_ENV] ?? null;
}

export type WebhookSource = "settings" | "env" | null;
export type WebhookUrls = Record<(typeof OUTBOX_TOPICS)[number], { url: string | null; source: WebhookSource }>;

/**
 * Where each topic is sent. A URL saved in the admin (settings key
 * `integrations`) wins over the env var, so the owner can wire n8n up without a
 * redeploy; the env var is the fallback and the way to configure previews.
 */
export async function resolveWebhookUrls(): Promise<WebhookUrls> {
  const { data } = await createAdminClient()
    .from("settings")
    .select("value")
    .eq("key", "integrations")
    .maybeSingle();
  const saved = ((data?.value as { webhooks?: Record<string, string> } | null)?.webhooks ?? {}) as Record<string, string>;

  return Object.fromEntries(
    OUTBOX_TOPICS.map((topic) => {
      const fromSettings = typeof saved[topic] === "string" ? saved[topic].trim() : "";
      if (fromSettings) return [topic, { url: fromSettings, source: "settings" }];
      const fromEnv = process.env[TOPIC_ENV[topic]]?.trim() ?? "";
      return [topic, { url: fromEnv || null, source: fromEnv ? "env" : null }];
    })
  ) as WebhookUrls;
}

const SEND_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 10;

// ── Body ────────────────────────────────────────────────────────────────────

type Address = {
  name?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
};

const rupees = (paise: number | null | undefined) => ((paise ?? 0) / 100).toFixed(2);

function splitName(full: string | undefined): { first: string; last: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/**
 * The order as it stands now, with its items, customer and latest shipment.
 * Loaded at send time rather than trusted from the row's payload, so the
 * Shopify-shaped fields are complete for every topic — `order.delivered`'s own
 * payload, for instance, carries no line items, and n8n Flow 3 needs them.
 */
async function loadOrderSnapshot(orderId: string) {
  const db = createAdminClient();
  const { data: order } = await db
    .from("orders")
    .select(
      "id, order_number, email, phone, payment_status, fulfillment_status, order_status, currency, subtotal_paise, discount_paise, shipping_paise, tax_paise, total_paise, refunded_paise, discount_code, shipping_address, billing_address, placed_at, created_at, source, customer_id, order_items ( title, variant_title, sku, quantity, unit_price_paise, total_paise ), customers ( first_name, last_name, phone, accepts_marketing )"
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return null;

  const { data: shipment } = await db
    .from("shipments")
    .select("awb_code, courier_name, tracking_url, status, shipped_at, delivered_at")
    .eq("order_id", orderId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { order, shipment };
}

type OrderSnapshot = NonNullable<Awaited<ReturnType<typeof loadOrderSnapshot>>>;

/**
 * The fields of a Shopify order webhook that the existing n8n flows read
 * (`order = $json.body ?? $json`, then `order.line_items`, `order.customer`,
 * `order.total_price` …). Putting them at the top level of the body means those
 * flows keep working with only their trigger node swapped for a Webhook node.
 *
 * `customer.id` is deliberately absent: Flow 2 matches on a Shopify customer id
 * when one is present, and a uuid of ours would never match a contact imported
 * from Shopify, creating a duplicate. Without it, the flow matches on email.
 */
function shopifyCompatible({ order, shipment }: OrderSnapshot) {
  const ship = (order.shipping_address ?? {}) as Address;
  const bill = ((order.billing_address as Address | null) ?? ship) as Address;
  const customer = order.customers;
  const fromAddress = splitName(ship.name);
  const first = customer?.first_name || fromAddress.first;
  const last = customer?.last_name || fromAddress.last;

  const address = (a: Address) => {
    const n = splitName(a.name);
    return {
      name: a.name ?? "",
      first_name: n.first,
      last_name: n.last,
      address1: a.line1 ?? "",
      address2: a.line2 ?? "",
      city: a.city ?? "",
      province: a.state ?? "",
      zip: a.pincode ?? "",
      country: a.country ?? "India",
      phone: a.phone ?? "",
    };
  };

  return {
    id: order.id,
    name: `#${order.order_number}`,
    order_number: order.order_number,
    email: order.email,
    phone: order.phone ?? ship.phone ?? "",
    created_at: order.placed_at ?? order.created_at,
    currency: order.currency,
    financial_status: order.payment_status,
    fulfillment_status: order.fulfillment_status,
    subtotal_price: rupees(order.subtotal_paise),
    total_discounts: rupees(order.discount_paise),
    total_tax: rupees(order.tax_paise),
    total_price: rupees(order.total_paise),
    discount_codes: order.discount_code
      ? [{ code: order.discount_code, amount: rupees(order.discount_paise) }]
      : [],
    buyer_accepts_marketing: customer?.accepts_marketing ?? false,
    customer: {
      first_name: first,
      last_name: last,
      email: order.email,
      phone: customer?.phone || order.phone || ship.phone || "",
    },
    shipping_address: address(ship),
    billing_address: address(bill),
    line_items: (order.order_items ?? []).map((item) => ({
      title: item.title,
      variant_title: item.variant_title && item.variant_title !== "Default" ? item.variant_title : "",
      sku: item.sku ?? "",
      quantity: item.quantity,
      price: rupees(item.unit_price_paise),
    })),
    shipping_lines: [{ title: "Shipping", price: rupees(order.shipping_paise) }],
    fulfillments: shipment?.awb_code
      ? [
          {
            tracking_number: shipment.awb_code,
            tracking_company: shipment.courier_name ?? "",
            tracking_url: shipment.tracking_url ?? "",
          },
        ]
      : [],
  };
}

type BuiltBody =
  | { kind: "send"; body: Record<string, unknown> }
  | { kind: "drop"; reason: string };

export async function buildOutboxBody(row: Tables<"webhook_outbox">): Promise<BuiltBody> {
  const payload = (row.payload ?? {}) as Record<string, Json | undefined>;
  const event = {
    id: row.id,
    topic: row.topic,
    created_at: row.created_at,
    attempt: row.attempts,
  };

  if (row.topic === "inventory.low") {
    const db = createAdminClient();
    const variantId = typeof payload.variant_id === "string" ? payload.variant_id : "";
    const { data: variant } = await db
      .from("product_variants")
      .select("inventory_quantity, products ( status )")
      .eq("id", variantId)
      .maybeSingle();
    if (!variant) return { kind: "drop", reason: "variant no longer exists" };
    if (variant.products?.status !== "active") {
      return { kind: "drop", reason: "product is no longer on sale" };
    }
    return {
      kind: "send",
      body: {
        event,
        data: payload,
        // What it is now, which may be lower still (or restocked) since the alert fired.
        current_available: variant.inventory_quantity,
        // The n8n Flow 6 condition node reads `available` from the top level.
        available: payload.available,
        title: payload.product_title,
      },
    };
  }

  const orderId = typeof payload.order_id === "string" ? payload.order_id : "";
  const snapshot = orderId ? await loadOrderSnapshot(orderId) : null;
  if (!snapshot) return { kind: "drop", reason: "order no longer exists" };

  return {
    kind: "send",
    body: {
      ...shopifyCompatible(snapshot),
      event,
      data: payload,
      shipment: snapshot.shipment ?? null,
    },
  };
}

// ── Sending ─────────────────────────────────────────────────────────────────

export function signBody(rawBody: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
}

export type SendResult =
  | { outcome: "sent"; status: number }
  | { outcome: "retry"; status: number | null; error: string };

export async function postToWebhook(
  url: string,
  meta: { topic: string; id: string },
  body: Record<string, unknown>
): Promise<SendResult> {
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "aalmaram-outbox/1",
    "x-aalmaram-topic": meta.topic,
    "x-aalmaram-event-id": meta.id,
  };
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (secret) {
    // n8n's Header Auth can only compare a header to a stored value, so the
    // secret itself goes in one header; the signature is there for anything
    // that can verify an HMAC.
    headers["x-aalmaram-token"] = secret;
    headers["x-aalmaram-signature"] = signBody(raw, secret);
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: raw,
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.ok) return { outcome: "sent", status: res.status };
    const text = (await res.text().catch(() => "")).slice(0, 300);
    return { outcome: "retry", status: res.status, error: `n8n answered ${res.status}${text ? `: ${text}` : ""}` };
  } catch (err) {
    const message =
      err instanceof Error ? (err.name === "TimeoutError" ? "timed out after 10s" : err.message) : String(err);
    return { outcome: "retry", status: null, error: message };
  }
}

export interface DrainSummary {
  claimed: number;
  sent: number;
  retrying: number;
  failed: number;
  deferred: number;
  dropped: number;
  errors: { id: string; topic: string; error: string }[];
}

/** Delivers one leased row and records the outcome. */
async function deliver(row: Tables<"webhook_outbox">, url: string | null, summary: DrainSummary): Promise<void> {
  const db = createAdminClient();
  const finish = async (outcome: "sent" | "retry" | "deferred" | "dropped", error?: string, status?: number | null) => {
    const { data, error: finishError } = await db.rpc("finish_outbox", {
      p_id: row.id,
      p_outcome: outcome,
      p_error: error ?? undefined,
      p_response_status: status ?? undefined,
      p_max_attempts: MAX_ATTEMPTS,
    });
    if (finishError) {
      // The row keeps its lease and comes due again — a duplicate at worst.
      console.error(`outbox: could not record ${outcome} for ${row.id}: ${finishError.message}`);
      return null;
    }
    return data;
  };

  if (!url) {
    await finish("deferred", `${topicEnvName(row.topic) ?? "webhook URL"} is not set`);
    summary.deferred++;
    return;
  }

  let built: BuiltBody;
  try {
    built = await buildOutboxBody(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finish("retry", `could not build body: ${message}`);
    summary.retrying++;
    summary.errors.push({ id: row.id, topic: row.topic, error: message });
    return;
  }

  if (built.kind === "drop") {
    await finish("dropped", built.reason);
    summary.dropped++;
    return;
  }

  const result = await postToWebhook(url, row, built.body);
  if (result.outcome === "sent") {
    await finish("sent", undefined, result.status);
    summary.sent++;
    return;
  }

  const status = await finish("retry", result.error, result.status);
  if (status === "failed") summary.failed++;
  else summary.retrying++;
  summary.errors.push({ id: row.id, topic: row.topic, error: result.error });
  console.error(`outbox: ${row.topic} ${row.id} attempt ${row.attempts} failed: ${result.error}`);
}

/** Leases and delivers up to `limit` due rows, one at a time, oldest first. */
export async function drainOutbox({ limit = 20 }: { limit?: number } = {}): Promise<DrainSummary> {
  const summary: DrainSummary = {
    claimed: 0,
    sent: 0,
    retrying: 0,
    failed: 0,
    deferred: 0,
    dropped: 0,
    errors: [],
  };

  const urls = await resolveWebhookUrls();
  const topics = OUTBOX_TOPICS.filter((topic) => urls[topic].url);
  if (topics.length === 0) return summary;

  const db = createAdminClient();
  // Lease comfortably longer than the worst case for a whole batch, so a slow
  // batch never has its own rows come due under it.
  const { data: rows, error } = await db.rpc("claim_outbox", {
    p_topics: [...topics],
    p_limit: limit,
    p_lease_seconds: Math.max(60, Math.ceil((limit * SEND_TIMEOUT_MS) / 1000) + 30),
  });
  if (error) throw new Error(`claim_outbox failed: ${error.message}`);

  summary.claimed = rows?.length ?? 0;
  for (const row of rows ?? []) {
    await deliver(row, urls[row.topic as keyof WebhookUrls]?.url ?? null, summary);
  }
  return summary;
}

/**
 * Drains the outbox once the current response has gone out. Call it from any
 * route or action that has just caused rows to be written. Never throws — the
 * cron is the safety net.
 */
export function kickOutbox(): void {
  try {
    after(async () => {
      try {
        await drainOutbox({ limit: 10 });
      } catch (err) {
        console.error("outbox: kick failed", err);
      }
    });
  } catch (err) {
    // Outside a request scope (scripts, tests). The cron will pick it up.
    console.error("outbox: kick unavailable here", err);
  }
}
