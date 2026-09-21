"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "../actions";

const INITIAL: LoginState = { error: "" };

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, INITIAL);

  return (
    <form action={formAction}>
      <h1 className="text-[22px] font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-[14px]" style={{ color: "var(--a-muted)" }}>
        Use your Aalmaram admin account.
      </p>

      <label className="mt-6 block text-[13px] font-medium">
        Email
        <input type="email" name="email" autoComplete="email" autoFocus required className="preorder-input w-full" />
      </label>

      <label className="mt-4 block text-[13px] font-medium">
        Password
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          className="preorder-input w-full"
        />
      </label>

      {state.error && (
        <p
          role="alert"
          className="mt-4 rounded-lg px-3 py-2 text-[13px]"
          style={{ color: "var(--spice)", background: "rgba(164,66,44,.08)" }}
        >
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-night w-full py-2.5 text-[14px] mt-6 disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
