"use server";

import { redirect } from "next/navigation";
import { adminAllowlist } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  error: string;
}

/**
 * Sign in with Supabase Auth, then check the email is actually allowed in.
 * A valid Supabase user who is not an admin gets signed straight back out —
 * having an account must not imply having the dashboard.
 */
export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are both required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return { error: "Those details didn't match an account." };
  }

  const admin = createAdminClient();
  const { data: adminUser } = await admin
    .from("admin_users")
    .select("id, revoked_at")
    .eq("email", email)
    .maybeSingle();

  if (adminUser?.revoked_at || (!adminUser && !adminAllowlist().includes(email))) {
    await supabase.auth.signOut();
    return { error: "That account doesn't have admin access." };
  }

  await admin
    .from("admin_users")
    .upsert(
      {
        email,
        user_id: data.user.id,
        last_login_at: new Date().toISOString(),
        ...(adminUser ? {} : { role: "owner" as const }),
      },
      { onConflict: "email" }
    );

  redirect("/admin");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

/**
 * The end of an invite or password link: spend the one-time token, set the
 * password, and sign in. Verified here on submit rather than when the page
 * loads, so a link scanner can't use the token up first.
 */
export async function acceptInvite(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (type !== "invite" && type !== "recovery") return { error: "That link isn't valid." };
  if (password.length < 10) return { error: "Use at least 10 characters." };
  if (password !== confirm) return { error: "The two passwords don't match." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.user?.email) {
    return { error: "That link has expired or was already used. Ask the store owner for a new one." };
  }

  const email = data.user.email.toLowerCase();
  const admin = createAdminClient();
  const { data: adminUser } = await admin.from("admin_users").select("id, revoked_at").eq("email", email).maybeSingle();
  if (adminUser?.revoked_at || (!adminUser && !adminAllowlist().includes(email))) {
    await supabase.auth.signOut();
    return { error: "That account doesn't have admin access any more." };
  }

  const { error: passwordError } = await supabase.auth.updateUser({ password });
  if (passwordError) {
    return { error: `Couldn't set that password: ${passwordError.message}` };
  }

  await admin
    .from("admin_users")
    .upsert(
      {
        email,
        user_id: data.user.id,
        last_login_at: new Date().toISOString(),
        ...(adminUser ? {} : { role: "owner" as const }),
      },
      { onConflict: "email" }
    );

  redirect("/admin");
}
