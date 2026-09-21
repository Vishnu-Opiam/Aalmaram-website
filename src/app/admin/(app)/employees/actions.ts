"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit, requireOwner } from "@/lib/admin-auth";
import { sendAdminAccessLink } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { humaniseDbError } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

// Every action here is for owners (admins) only. Store managers can run the
// whole store but cannot see or change who has access to it.

export interface ActionState {
  error: string;
  ok?: string;
  /** A link the owner may need to copy by hand (an invite, when email is not set up). */
  link?: string;
}

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();
const emailish = z.string().email();
const MIN_PASSWORD = 10;
/** Long enough to be "until an owner restores them". */
const BANNED = "876000h";

function checkPassword(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters for the password.`;
  if (password.length > 72) return "That password is too long (72 characters at most).";
  return null;
}

async function findAuthUserId(email: string): Promise<string | null> {
  const db = createAdminClient();
  for (let page = 1; page <= 10; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    const users = data?.users ?? [];
    const match = users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match.id;
    if (users.length < 1000) break;
  }
  return null;
}

/**
 * Sets a login's password directly, creating the Supabase user if there is
 * none. Confirms the email too, so they can sign in straight away.
 */
async function setLoginPassword(email: string, password: string): Promise<{ userId: string } | { error: string }> {
  const db = createAdminClient();
  const existing = await findAuthUserId(email);
  if (existing) {
    const { error } = await db.auth.admin.updateUserById(existing, { password, email_confirm: true });
    return error ? { error: error.message } : { userId: existing };
  }
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) return { error: error?.message ?? "Supabase did not create the login." };
  return { userId: data.user.id };
}

/**
 * A one-time link to set a password. Supabase makes the token; the link points
 * at our own /admin/accept-invite, which verifies it only when the form is
 * submitted — so an email scanner following the link can't use it up.
 */
async function accessLink(email: string, kind: "invite" | "recovery"): Promise<{ link: string } | { error: string }> {
  const db = createAdminClient();
  const { data, error } = await db.auth.admin.generateLink({ type: kind, email });
  if (error || !data?.properties?.hashed_token) {
    return { error: error?.message ?? "Supabase did not return a link." };
  }
  const params = new URLSearchParams({ token_hash: data.properties.hashed_token, type: kind });
  return { link: `${siteUrl()}/admin/accept-invite?${params}` };
}

function done() {
  revalidatePath("/admin/employees");
}

export async function addEmployee(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireOwner();
  const email = text(formData, "email").toLowerCase();
  const name = text(formData, "name");
  const role = text(formData, "role");
  const method = text(formData, "method");
  const password = String(formData.get("password") ?? "");

  if (!emailish.safeParse(email).success) return { error: "That email doesn't look right." };
  if (role !== "owner" && role !== "staff") return { error: "Pick a role." };
  if (name.length > 80) return { error: "That name is too long." };
  if (method !== "password" && method !== "invite") return { error: "Choose how they will sign in." };
  if (method === "password") {
    const problem = checkPassword(password);
    if (problem) return { error: problem };
  }

  const db = createAdminClient();
  const { data: existing } = await db.from("admin_users").select("id").eq("email", email).maybeSingle();
  if (existing) return { error: `${email} is already an employee. Use the actions in the list instead.` };

  let userId: string | null;
  let link: { link: string; kind: "invite" | "recovery" } | null = null;

  if (method === "password") {
    const login = await setLoginPassword(email, password);
    if ("error" in login) return { error: `Could not create their login: ${login.error}` };
    userId = login.userId;
  } else {
    // An invite creates the Supabase user; if one already exists (they had an
    // account before), a recovery link does the same job.
    let result = await accessLink(email, "invite");
    let kind: "invite" | "recovery" = "invite";
    if ("error" in result && /already|registered|exists/i.test(result.error)) {
      result = await accessLink(email, "recovery");
      kind = "recovery";
    }
    if ("error" in result) return { error: `Could not create the invite: ${result.error}` };
    link = { link: result.link, kind };
    userId = await findAuthUserId(email);
  }

  const { data: row, error: insertError } = await db
    .from("admin_users")
    .insert({
      email,
      name,
      role,
      user_id: userId,
      invited_at: new Date().toISOString(),
      invited_by: session.email,
    })
    .select("id")
    .single();
  if (insertError) return { error: `Could not add them: ${insertError.message}` };

  await recordAudit(session, {
    action: "admin.invite",
    entityType: "admin_user",
    entityId: row.id,
    diff: { email, role, name, method },
  });
  done();

  if (!link) {
    return {
      error: "",
      ok: `${email} can now sign in at ${siteUrl()}/admin/login with the password you set. Share it with them privately.`,
    };
  }
  const sent = await sendAdminAccessLink(email, { link: link.link, invitedBy: session.name || session.email, kind: link.kind });
  return sent.sent
    ? { error: "", ok: `Invitation emailed to ${email}.`, link: link.link }
    : { error: "", ok: `${email} is added. Email isn't set up, so send them this link yourself — it works once and expires within the hour.`, link: link.link };
}

export async function setEmployeePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireOwner();
  const id = text(formData, "id");
  const password = String(formData.get("password") ?? "");
  const problem = checkPassword(password);
  if (problem) return { error: problem };

  const db = createAdminClient();
  const { data: admin } = await db.from("admin_users").select("id, email, user_id").eq("id", id).maybeSingle();
  if (!admin) return { error: "That person is no longer an employee." };

  const login = await setLoginPassword(admin.email, password);
  if ("error" in login) return { error: `Could not set the password: ${login.error}` };
  if (login.userId !== admin.user_id) {
    await db.from("admin_users").update({ user_id: login.userId }).eq("id", admin.id);
  }

  await recordAudit(session, { action: "admin.set_password", entityType: "admin_user", entityId: admin.id, diff: { email: admin.email } });
  done();
  return { error: "", ok: `Password changed for ${admin.email}. Share it with them privately.` };
}

export async function sendPasswordLink(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireOwner();
  const id = text(formData, "id");
  const db = createAdminClient();
  const { data: admin } = await db.from("admin_users").select("id, email").eq("id", id).maybeSingle();
  if (!admin) return { error: "That person is no longer an employee." };

  let result = await accessLink(admin.email, "recovery");
  let kind: "invite" | "recovery" = "recovery";
  // Invited but never signed in, and the Supabase user has gone: invite again.
  if ("error" in result) {
    result = await accessLink(admin.email, "invite");
    kind = "invite";
  }
  if ("error" in result) return { error: `Could not create a link: ${result.error}` };

  await recordAudit(session, { action: "admin.password_link", entityType: "admin_user", entityId: admin.id, diff: { email: admin.email } });
  const sent = await sendAdminAccessLink(admin.email, { link: result.link, invitedBy: session.name || session.email, kind });
  return sent.sent
    ? { error: "", ok: `Link emailed to ${admin.email}.`, link: result.link }
    : { error: "", ok: "Email isn't set up — send this link yourself. It works once and expires within the hour.", link: result.link };
}

export async function setAdminRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireOwner();
  const id = text(formData, "id");
  const role = text(formData, "role");
  const { error } = await createAdminClient().rpc("set_admin_role", { p_admin_id: id, p_role: role, p_actor: session.email });
  if (error) return { error: humaniseDbError(error.message) };
  done();
  return { error: "", ok: "Role changed." };
}

/**
 * Revokes or restores access. The row is kept; the Supabase login is banned
 * too, so a revoked person can't even refresh a session they already had.
 */
export async function setEmployeeAccess(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireOwner();
  const id = text(formData, "id");
  const revoke = text(formData, "revoke") === "1";
  const db = createAdminClient();

  const { data, error } = await db.rpc("set_admin_access", { p_admin_id: id, p_revoke: revoke, p_actor: session.email });
  if (error) return { error: humaniseDbError(error.message) };

  const target = data as { email: string; user_id: string | null };
  if (target.user_id) {
    const { error: banError } = await db.auth.admin.updateUserById(target.user_id, {
      ban_duration: revoke ? BANNED : "none",
    });
    if (banError) console.error(`${revoke ? "Revoked" : "Restored"} ${target.email} but could not update their login: ${banError.message}`);
  }

  done();
  return {
    error: "",
    ok: revoke ? `${target.email} can no longer get in.` : `${target.email} has access again.`,
  };
}

export async function removeAdmin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireOwner();
  const id = text(formData, "id");
  const db = createAdminClient();
  const { data, error } = await db.rpc("remove_admin_user", { p_admin_id: id, p_actor: session.email });
  if (error) return { error: humaniseDbError(error.message) };

  // Their sign-in goes too, so a removed person holds no account that could be
  // re-admitted by accident (for example through ADMIN_ALLOWLIST).
  const removed = data as { email: string; user_id: string | null };
  if (removed.user_id) {
    const { error: deleteError } = await db.auth.admin.deleteUser(removed.user_id);
    if (deleteError) console.error(`Removed ${removed.email} but could not delete their login: ${deleteError.message}`);
  }

  done();
  return { error: "", ok: `${removed.email} is removed and their login deleted.` };
}
