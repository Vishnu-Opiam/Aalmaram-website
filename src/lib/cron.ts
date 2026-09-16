import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * Shared-secret checks for machine callers.
 *
 * Every /api/cron/* route is guarded by CRON_SECRET. Vercel Cron sends it as
 * `Authorization: Bearer <secret>`; `?secret=` is accepted too, for running a
 * job by hand. No secret configured means every request is refused.
 */
export function isCronAuthorised(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("CRON_SECRET is not set — refusing every cron request.");
    return false;
  }

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const provided = bearer || new URL(request.url).searchParams.get("secret") || "";
  return safeEqual(provided, expected);
}

/**
 * n8n calling the store (the weekly digest). Same shared secret the outbox
 * sends to n8n, in the same header, so one n8n Header Auth credential serves
 * both directions.
 */
export function isN8nAuthorised(request: Request): boolean {
  const expected = process.env.N8N_WEBHOOK_SECRET;
  if (!expected) {
    console.error("N8N_WEBHOOK_SECRET is not set — refusing every integration request.");
    return false;
  }
  return safeEqual(request.headers.get("x-aalmaram-token") ?? "", expected);
}

function safeEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
