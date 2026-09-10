import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay, over plain fetch. Their REST surface here is three calls and two
 * HMACs; the SDK would be more weight than it saves and tends to lag the API.
 */

const API = "https://api.razorpay.com/v1";

function credentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error(
      "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not set. Add the test keys to .env.local."
    );
  }
  return { keyId, keySecret };
}

export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const { keyId, keySecret } = credentials();
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
      ...init.headers,
    },
  });

  const body = await response.text();
  if (!response.ok) {
    let detail = body;
    try {
      detail = JSON.parse(body)?.error?.description ?? body;
    } catch {}
    throw new Error(`Razorpay ${path} failed (${response.status}): ${detail}`);
  }
  return JSON.parse(body) as T;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

/** Amount is in paise, which is exactly how we store money. */
export function createRazorpayOrder(params: {
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  return call<RazorpayOrder>("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: "INR",
      receipt: params.receipt,
      payment_capture: 1,
      notes: params.notes ?? {},
    }),
  });
}

export interface RazorpayPayment {
  id: string;
  order_id: string;
  status: string;
  amount: number;
  method: string;
  email: string | null;
  contact: string | null;
}

export function fetchPayment(paymentId: string): Promise<RazorpayPayment> {
  return call<RazorpayPayment>(`/payments/${paymentId}`, { method: "GET" });
}

export function createRefund(params: {
  paymentId: string;
  amountPaise?: number;
  notes?: Record<string, string>;
}): Promise<{ id: string; amount: number; status: string }> {
  return call(`/payments/${params.paymentId}/refund`, {
    method: "POST",
    body: JSON.stringify({
      ...(params.amountPaise ? { amount: params.amountPaise } : {}),
      notes: params.notes ?? {},
    }),
  });
}

/** Constant-time compare that tolerates differing lengths without leaking them. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * The signature the Razorpay Checkout modal hands back: HMAC-SHA256 of
 * "<order_id>|<payment_id>" with the key secret.
 */
export function verifyCheckoutSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): boolean {
  const { keySecret } = credentials();
  const expected = createHmac("sha256", keySecret)
    .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
    .digest("hex");
  return safeEqual(expected, params.signature);
}

/**
 * The webhook signature: HMAC-SHA256 of the raw request body with the webhook
 * secret — a different secret from the key secret, and it must be computed on
 * the raw bytes, before any JSON parsing reorders or reformats anything.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}
