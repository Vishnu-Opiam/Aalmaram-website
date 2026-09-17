import "server-only";

import { redirect } from "next/navigation";
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
 * `getUser()` rather than `getSession()` — the former revalidates the token
 * with Supabase, the latter trusts a cookie the browser handed us.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const email = user.email.toLowerCase();
  const admin = createAdminClient();
  const { data: adminUser } = await admin
    .from("admin_users")
    .select("id, email, role, name")
    .eq("email", email)
    .maybeSingle();

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
}

/** For admin pages. Sends anyone else to the login screen. */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}

/**
 * For settings and the team: owners only. Staff run the shop day to day but
 * cannot change what it charges, where it sends events, or who gets in.
 */
export async function requireOwner(): Promise<AdminSession> {
  const session = await requireAdmin();
  if (session.role !== "owner") redirect("/admin?denied=owner");
  return session;
}

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
