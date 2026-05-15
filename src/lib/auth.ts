import crypto from "crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "admin_session";

function sessionSecret(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s === "change-me-to-a-long-random-string") {
    throw new Error("ADMIN_SESSION_SECRET is not set. Add a long random string to .env.local.");
  }
  return s;
}

/** Creates a signed token: base64(payload).hmac — payload is just an issue timestamp. */
export function createSessionToken(): string {
  const payload = Buffer.from(JSON.stringify({ t: Date.now() })).toString("base64url");
  const sig = crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/** Constant-time verification of a session token. */
export function verifySessionToken(token: string | undefined): boolean {
  if (!token || !token.includes(".")) return false;
  const [payload, sig] = token.split(".");
  let expected: string;
  try {
    expected = crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  } catch {
    return false;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Checks the admin password from .env. Constant-time compare. */
export function checkPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || expected === "change-me-to-a-strong-secret") {
    throw new Error("ADMIN_PASSWORD is not set. Set a strong secret in .env.local.");
  }
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** For use in server components / route handlers — true if the request has a valid admin cookie. */
export async function isAuthed(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(ADMIN_COOKIE)?.value);
}
