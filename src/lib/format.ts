/** Money and date helpers. Safe on both sides of the client boundary. */

/** Paise in, rupees out. Storage and arithmetic stay in integer paise. */
export function formatPaise(paise: number): string {
  return "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/**
 * Rupees typed into a form ("700", "699.50") to integer paise. Null for blank
 * or anything that isn't a plain amount with at most two decimals.
 */
export function rupeesToPaise(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

/**
 * A message raised by one of our Postgres functions, made fit for the admin:
 * "… 136000 paise …" becomes "… ₹1,360 …", and it reads as a sentence.
 */
export function humaniseDbError(message: string): string {
  const withRupees = message.replace(/(\d+) paise/g, (_, p: string) => formatPaise(Number(p)));
  const sentence = withRupees.charAt(0).toUpperCase() + withRupees.slice(1);
  return sentence.endsWith(".") ? sentence : `${sentence}.`;
}

/** The store runs on Indian time; every date the admin sees is in it. */
export const STORE_TIME_ZONE = "Asia/Kolkata";

export function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-IN", {
    timeZone: STORE_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString("en-IN", {
    timeZone: STORE_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * A timestamp as the value of an <input type="datetime-local">, in Indian
 * time: "2026-09-11T14:30".
 */
export function toISTInputValue(value: string | null): string {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/**
 * The reverse: a datetime-local value typed in Indian time, as an ISO
 * timestamp. India has no daylight saving, so the offset is always +05:30.
 */
export function fromISTInputValue(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) return null;
  const date = new Date(`${trimmed}:00+05:30`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
