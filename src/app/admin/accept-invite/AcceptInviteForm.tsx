"use client";

import { useActionState } from "react";
import { acceptInvite, type LoginState } from "../actions";

const INITIAL: LoginState = { error: "" };

export default function AcceptInviteForm({ tokenHash, type }: { tokenHash: string; type: string }) {
  const [state, formAction, pending] = useActionState(acceptInvite, INITIAL);
  const invite = type === "invite";

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form action={formAction} className="w-full max-w-[360px]">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />

        <div className="text-[10.5px] tracking-[.34em] font-body font-light opacity-60">AALMARAM</div>
        <h1 className="mt-4 font-display font-black text-[30px] display-tight" style={{ color: "var(--night)" }}>
          {invite ? "Welcome" : "New password"}
        </h1>
        <p className="mt-3 font-body font-light text-[14px]" style={{ color: "#2a3855" }}>
          {invite
            ? "Choose a password for the Aalmaram admin. You'll use it with this email address from now on."
            : "Choose a new password for the Aalmaram admin."}
        </p>

        <input
          type="password"
          name="password"
          autoComplete="new-password"
          placeholder="New password (at least 10 characters)"
          minLength={10}
          autoFocus
          required
          className="preorder-input font-body text-[15px] mt-8 w-full"
        />
        <input
          type="password"
          name="confirm"
          autoComplete="new-password"
          placeholder="The same again"
          minLength={10}
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
          {pending ? "Saving…" : "Set password and sign in"}
        </button>
      </form>
    </main>
  );
}
