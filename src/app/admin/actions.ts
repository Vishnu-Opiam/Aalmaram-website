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
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (!adminUser && !adminAllowlist().includes(email)) {
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
