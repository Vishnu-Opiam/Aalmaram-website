"use client";

import { useActionState } from "react";
import { acceptInvite, type LoginState } from "../actions";

const INITIAL: LoginState = { error: "" };

export default function AcceptInviteForm({ tokenHash, type }: { tokenHash: string; type: string }) {
  const [state, formAction, pending] = useActionState(acceptInvite, INITIAL);
  const invite = type === "invite";

  return (
    <form action={formAction}>
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />

      <h1 className="text-[22px] font-semibold tracking-tight">{invite ? "Welcome" : "New password"}</h1>
      <p className="mt-1 text-[14px]" style={{ color: "var(--a-muted)" }}>
        {invite
          ? "Choose a password for the Aalmaram admin. You'll use it with this email address from now on."
          : "Choose a new password for the Aalmaram admin."}
      </p>

      <label className="mt-6 block text-[13px] font-medium">
        New password
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          placeholder="At least 10 characters"
          minLength={10}
          autoFocus
          required
          className="preorder-input w-full"
        />
      </label>
      <label className="mt-4 block text-[13px] font-medium">
        Confirm password
        <input
          type="password"
          name="confirm"
          autoComplete="new-password"
          placeholder="The same again"
          minLength={10}
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
        {pending ? "Saving…" : "Set password and sign in"}
      </button>
    </form>
  );
}
