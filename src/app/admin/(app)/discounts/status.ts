import { formatPaise } from "@/lib/format";
import type { Tone } from "../ui";

/** Enough of a discount row to describe it. Client-safe. */
export interface DiscountSummary {
  type: string;
  value: number;
  active: boolean;
  starts_at: string;
  ends_at: string | null;
  usage_limit: number | null;
  used_count: number;
}

/** One word for where a code stands right now, in the order that matters most. */
export function discountStatus(d: DiscountSummary, now = Date.now()): { label: string; tone: Tone } {
  if (!d.active) return { label: "OFF", tone: "quiet" };
  if (d.ends_at && new Date(d.ends_at).getTime() < now) return { label: "EXPIRED", tone: "quiet" };
  if (d.usage_limit !== null && d.used_count >= d.usage_limit) return { label: "USED UP", tone: "quiet" };
  if (new Date(d.starts_at).getTime() > now) return { label: "SCHEDULED", tone: "warn" };
  return { label: "LIVE", tone: "good" };
}

/**
 * The link that applies a code on arrival. Always the live store: a localhost
 * link is no use to a customer, so the fallback is the real domain.
 */
export function shareLink(code: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://")
    ? process.env.NEXT_PUBLIC_SITE_URL
    : "https://aalmaram.com";
  return `${base}/?discount=${encodeURIComponent(code)}`;
}

export function describeValue(d: Pick<DiscountSummary, "type" | "value">): string {
  if (d.type === "percentage") return `${Number(d.value)}% off`;
  if (d.type === "fixed_amount") return `${formatPaise(Number(d.value))} off`;
  return "Free shipping";
}
