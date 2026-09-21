"use client";

import { useActionState, useState } from "react";
import { Notice, inputClass, labelClass } from "../ui";
import {
  addEmployee,
  removeAdmin,
  sendPasswordLink,
  setAdminRole,
  setEmployeeAccess,
  setEmployeePassword,
  type ActionState,
} from "./actions";

const INITIAL: ActionState = { error: "" };

/** A readable random password: no look-alike characters, 14 long. */
function generatePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12.5px] opacity-55">{hint}</span>}
    </label>
  );
}

function CopyableLink({ link }: { link?: string }) {
  const [copied, setCopied] = useState(false);
  if (!link) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 text-[12px]">
      <code className="px-2 py-1 rounded break-all" style={{ background: "rgba(35,47,72,.06)" }}>
        {link}
      </code>
      <button
        type="button"
        className="qlink text-[12px]"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            window.prompt("Copy this:", link);
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** A password box with a Generate button, shown in plain text so the owner can pass it on. */
function PasswordInput({ required }: { required?: boolean }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex gap-2">
      <input
        name="password"
        type="text"
        autoComplete="new-password"
        spellCheck={false}
        minLength={10}
        required={required}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={inputClass}
      />
      <button type="button" className="qlink text-[12px] whitespace-nowrap" onClick={() => setValue(generatePassword())}>
        Generate
      </button>
    </div>
  );
}

export function AddEmployeeForm() {
  const [state, action, pending] = useActionState(addEmployee, INITIAL);
  const [method, setMethod] = useState<"password" | "invite">("password");

  return (
    <form action={action} className="mt-6 space-y-5">
      <Notice error={state.error} ok={state.ok} />
      <CopyableLink link={state.link} />
      <div className="grid md:grid-cols-3 gap-6">
        <Field label="EMAIL *">
          <input name="email" type="email" required className={inputClass} />
        </Field>
        <Field label="Name">
          <input name="name" className={inputClass} />
        </Field>
        <Field label="Role" hint="Store managers can do everything in the store. Admins can also manage employees.">
          <select name="role" defaultValue="staff" className={inputClass}>
            <option value="staff">Store manager</option>
            <option value="owner">Admin</option>
          </select>
        </Field>
      </div>

      <fieldset className="space-y-3">
        <legend className={labelClass}>How they sign in</legend>
        <div className="flex flex-wrap gap-6 text-[13.5px]">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="method"
              value="password"
              checked={method === "password"}
              onChange={() => setMethod("password")}
            />
            Set a password now
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="method"
              value="invite"
              checked={method === "invite"}
              onChange={() => setMethod("invite")}
            />
            Send an invite link so they choose one
          </label>
        </div>
        {method === "password" && (
          <div className="max-w-[420px]">
            <Field label="PASSWORD *" hint="At least 10 characters. They can sign in with it straight away.">
              <PasswordInput required />
            </Field>
          </div>
        )}
      </fieldset>

      <button type="submit" disabled={pending} className="btn-night px-4 py-2.5 text-[13px]">
        {pending ? "Adding…" : "Add employee"}
      </button>
    </form>
  );
}

export function EmployeeActions({
  id,
  email,
  role,
  revoked,
  isSelf,
}: {
  id: string;
  email: string;
  role: string;
  revoked: boolean;
  isSelf: boolean;
}) {
  const [roleState, roleAction, changingRole] = useActionState(setAdminRole, INITIAL);
  const [linkState, linkAction, sendingLink] = useActionState(sendPasswordLink, INITIAL);
  const [passwordState, passwordAction, settingPassword] = useActionState(setEmployeePassword, INITIAL);
  const [accessState, accessAction, changingAccess] = useActionState(setEmployeeAccess, INITIAL);
  const [removeState, removeAction, removing] = useActionState(removeAdmin, INITIAL);
  const [showPassword, setShowPassword] = useState(false);
  const nextRole = role === "owner" ? "staff" : "owner";

  const states = [roleState, linkState, passwordState, accessState, removeState];
  const error = states.find((s) => s.error)?.error;
  const ok = states.find((s) => s.ok)?.ok;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-end gap-x-5 gap-y-2">
        {!revoked && (
          <>
            <button type="button" className="qlink text-[12px]" onClick={() => setShowPassword((v) => !v)}>
              Set password
            </button>
            <form action={linkAction}>
              <input type="hidden" name="id" value={id} />
              <button type="submit" disabled={sendingLink} className="qlink text-[12px]">
                {sendingLink ? "…" : "Password link"}
              </button>
            </form>
          </>
        )}
        {!isSelf && (
          <>
            {!revoked && (
              <form
                action={roleAction}
                onSubmit={(e) => {
                  if (!window.confirm(`Make ${email} ${nextRole === "owner" ? "an admin" : "a store manager"}?`)) e.preventDefault();
                }}
              >
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="role" value={nextRole} />
                <button type="submit" disabled={changingRole} className="qlink text-[12px]">
                  {nextRole === "owner" ? "Make admin" : "Make store manager"}
                </button>
              </form>
            )}
            <form
              action={accessAction}
              onSubmit={(e) => {
                const question = revoked
                  ? `Give ${email} access again?`
                  : `Revoke access for ${email}? They are signed out and can't get back in until you restore them.`;
                if (!window.confirm(question)) e.preventDefault();
              }}
            >
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="revoke" value={revoked ? "0" : "1"} />
              <button
                type="submit"
                disabled={changingAccess}
                className="qlink text-[12px]"
                style={revoked ? undefined : { color: "var(--spice)" }}
              >
                {revoked ? "Restore access" : "Revoke access"}
              </button>
            </form>
            <form
              action={removeAction}
              onSubmit={(e) => {
                if (!window.confirm(`Remove ${email} for good? Their login is deleted.`)) e.preventDefault();
              }}
            >
              <input type="hidden" name="id" value={id} />
              <button type="submit" disabled={removing} className="qlink text-[12px]" style={{ color: "var(--spice)" }}>
                Remove
              </button>
            </form>
          </>
        )}
      </div>

      {showPassword && !revoked && (
        <form action={passwordAction} className="flex flex-wrap justify-end items-center gap-3">
          <input type="hidden" name="id" value={id} />
          <div className="w-[260px]">
            <PasswordInput required />
          </div>
          <button type="submit" disabled={settingPassword} className="btn-night px-3 py-2 text-[12px]">
            {settingPassword ? "Saving…" : "Save password"}
          </button>
        </form>
      )}

      <div className="text-left">
        <Notice error={error} ok={error ? undefined : ok} />
        <CopyableLink link={linkState.link} />
      </div>
    </div>
  );
}
