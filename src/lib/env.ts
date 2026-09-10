/**
 * Environment access in one place, so a missing variable fails loudly at the
 * point of use instead of turning into an undefined halfway down a request.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is not set. Add it to .env.local (see .env.local.example) and restart the dev server.`
    );
  }
  return value;
}

/** Safe to send to the browser. */
export const supabaseUrl = () =>
  required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);

/** Safe to send to the browser — RLS is what protects the data, not this key. */
export const supabaseAnonKey = () =>
  required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Server only. Bypasses RLS entirely. */
export const supabaseServiceRoleKey = () =>
  required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Emails allowed into /admin before anyone has been added to `admin_users`.
 * Lowercased, comma separated.
 */
export function adminAllowlist(): string[] {
  return (process.env.ADMIN_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
