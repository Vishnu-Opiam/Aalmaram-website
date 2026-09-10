"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "../actions";

const INITIAL: LoginState = { error: "" };

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, INITIAL);

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form action={formAction} className="w-full max-w-[360px]">
        <div className="text-[10.5px] tracking-[.34em] font-body font-light opacity-60">AALMARAM</div>
        <h1
          className="mt-4 font-display font-black text-[30px] display-tight"
          style={{ color: "var(--night)" }}
        >
          Admin
        </h1>
        <p className="mt-3 font-body font-light text-[14px]" style={{ color: "#2a3855" }}>
          Sign in with your Aalmaram admin account.
        </p>

        <input
          type="email"
          name="email"
          autoComplete="email"
          placeholder="Email"
          autoFocus
          required
          className="preorder-input font-body text-[15px] mt-8 w-full"
        />

        <input
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="Password"
          required
          className="preorder-input font-body text-[15px] mt-3 w-full"
        />

        {state.error && (
          <p className="mt-3 text-[12.5px] font-body" style={{ color: "var(--spice)" }}>
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="btn-night w-full py-4 text-[12px] tracking-[.28em] font-body font-normal mt-6"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
