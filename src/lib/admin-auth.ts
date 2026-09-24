import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { adminAllowlist } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export interface AdminSession {
  userId: string;
  adminUserId: string | null;
  email: string;
  role: Tables<"admin_users">["role"];
  name: string;
}

/**
 * Who is signed in, if anyone. Two gates have to pass: a valid Supabase Auth
 * session, and an email that is either in `admin_users` or in
 * `ADMIN_ALLOWLIST` (the bootstrap path, before the first row exists).
 *
 * `getClaims()` verifies the access token's signature against the project's
 * published (asymmetric) signing keys, which are cached in memory — so unlike
 * `getUser()` it costs no round trip to Supabase Auth on every page. It never
 * trusts an unverified cookie the way `getSession()` would. Revoking someone is
 * still immediate: `admin_users.revoked_at` is read fresh below.
 *
 * Wrapped in `cache()` so the layout, a nested layout and the page share one
 * lookup per request instead of repeating it three times.
 */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const user = claims?.sub ? { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" } : null;

  if (!user?.email) return null;

  const email = user.email.toLowerCase();
  const admin = createAdminClient();
  const { data: adminUser } = await admin
    .from("admin_users")
    .select("id, email, role, name, revoked_at")
    .eq("email", email)
    .maybeSingle();

  // Revoked by an owner: the row stays for the record, but it opens nothing —
  // and it also stops the allowlist below from re-admitting them.
  if (adminUser?.revoked_at) return null;

  if (adminUser) {
    return {
      userId: user.id,
      adminUserId: adminUser.id,
      email,
      role: adminUser.role,
      name: adminUser.name,
    };
  }

  // Bootstrap: the first sign-in by an allowlisted email creates the row, so
  // the allowlist can be dropped once the team is set up.
  if (adminAllowlist().includes(email)) {
    const { data: created } = await admin
      .from("admin_users")
      .upsert(
        { email, user_id: user.id, role: "owner", last_login_at: new Date().toISOString() },
        { onConflict: "email" }
      )
      .select("id, email, role, name")
      .single();

    return {
      userId: user.id,
      adminUserId: created?.id ?? null,
      email,
      role: created?.role ?? "owner",
      name: created?.name ?? "",
    };
  }

  return null;
});

/** For admin pages. Sends anyone else to the login screen. */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}

/**
 * For the Employees page: owners (admins) only. Store managers ("staff" in the
 * database) have the same access to the store as owners, including settings —
 * the one thing they cannot do is decide who else gets in.
 */
export async function requireOwner(): Promise<AdminSession> {
  const session = await requireAdmin();
  if (session.role !== "owner") redirect("/admin?denied=owner");
  return session;
}

/** What the admin calls each role. The database keeps `owner` and `staff`. */
export const ROLE_LABELS: Record<string, string> = { owner: "Admin", staff: "Store manager" };

/** For route handlers, which answer with 401 rather than a redirect. */
export async function requireAdminApi(): Promise<AdminSession | null> {
  return getAdminSession();
}

/** Records an admin mutation. Never throws — an audit failure must not eat the action. */
export async function recordAudit(
  session: AdminSession,
  entry: {
    action: string;
    entityType: string;
    entityId?: string | null;
    diff?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      admin_user_id: session.adminUserId,
      admin_email: session.email,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      diff: (entry.diff ?? {}) as never,
    });
  } catch (err) {
    console.error("audit_log write failed", err);
  }
}
