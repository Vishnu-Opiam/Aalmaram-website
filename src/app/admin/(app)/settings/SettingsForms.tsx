"use client";

import { useActionState, useState } from "react";
import { INDIAN_STATES } from "@/lib/india";
import { Notice, inputClass, labelClass } from "../ui";
import {
  inviteAdmin,
  removeAdmin,
  saveFeatures,
  saveInventory,
  saveShipping,
  saveShiprocketPickup,
  saveStore,
  saveWebhooks,
  sendPasswordLink,
  sendTestWebhook,
  setAdminRole,
  testShiprocket,
  type ActionState,
} from "./actions";

const INITIAL: ActionState = { error: "" };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] font-body font-light opacity-55">{hint}</span>}
    </label>
  );
}

function SaveButton({ pending, children = "Save" }: { pending: boolean; children?: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-night px-8 py-3 text-[11.5px] tracking-[.24em] font-body font-normal"
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

function CopyableLink({ link }: { link?: string }) {
  const [copied, setCopied] = useState(false);
  if (!link) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 text-[12px] font-body">
      <code className="px-2 py-1 rounded break-all" style={{ background: "rgba(35,47,72,.06)" }}>
        {link}
      </code>
      <button
        type="button"
        className="qlink text-[11px] tracking-[.2em]"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            window.prompt("Copy this link:", link);
          }
        }}
      >
        {copied ? "COPIED" : "COPY"}
      </button>
    </div>
  );
}

// ── Store ───────────────────────────────────────────────────────────────────

export interface StoreValues {
  name: string;
  supportEmail: string;
  siteUrl: string;
  gstNumber: string;
  invoicePrefix: string;
  adminNotifyEmail: string;
  fromOrders: string;
  fromMarketing: string;
  envOverrides: { fromOrders: boolean; notify: boolean };
}

export function StoreForm({ values }: { values: StoreValues }) {
  const [state, action, pending] = useActionState(saveStore, INITIAL);
  return (
    <form action={action} className="mt-6 space-y-6">
      <Notice error={state.error} ok={state.ok} />
      <div className="grid md:grid-cols-2 gap-6">
        <Field label="STORE NAME">
          <input name="name" defaultValue={values.name} required className={inputClass} />
        </Field>
        <Field label="SUPPORT EMAIL" hint="Reply-to on every email, and shown to buyers.">
          <input name="support_email" type="email" defaultValue={values.supportEmail} required className={inputClass} />
        </Field>
        <Field label="SITE ADDRESS" hint="Used in links inside emails.">
          <input name="site_url" defaultValue={values.siteUrl} required className={inputClass} />
        </Field>
        <Field label="GST NUMBER" hint="Optional. Books are GST-exempt; Zoho stays the invoice record.">
          <input name="gst_number" defaultValue={values.gstNumber} maxLength={15} className={inputClass} />
        </Field>
        <Field label="INVOICE PREFIX" hint="Also the order-number prefix in Zoho.">
          <input name="invoice_prefix" defaultValue={values.invoicePrefix} maxLength={10} required className={inputClass} />
        </Field>
        <Field
          label="NEW-ORDER ALERTS TO"
          hint={values.envOverrides.notify ? "ADMIN_NOTIFY_EMAIL is set on the server and wins over this." : "Blank for none."}
        >
          <input name="admin_notify_email" type="email" defaultValue={values.adminNotifyEmail} className={inputClass} />
        </Field>
        <Field
          label="ORDER EMAILS FROM"
          hint={values.envOverrides.fromOrders ? "EMAIL_FROM_ORDERS is set on the server and wins over this." : "The domain must be verified in Resend."}
        >
          <input name="from_orders" defaultValue={values.fromOrders} required className={inputClass} />
        </Field>
        <Field label="LETTERS FROM" hint="Used by the n8n newsletter and post-purchase flows.">
          <input name="from_marketing" defaultValue={values.fromMarketing} required className={inputClass} />
        </Field>
      </div>
      <SaveButton pending={pending} />
    </form>
  );
}

// ── Shipping ────────────────────────────────────────────────────────────────

export function ShippingForm({
  flatRate,
  freeThreshold,
  overrides,
}: {
  flatRate: string;
  freeThreshold: string;
  overrides: { state: string; rate: string }[];
}) {
  const [state, action, pending] = useActionState(saveShipping, INITIAL);
  const [rows, setRows] = useState(overrides.length ? overrides : []);

  return (
    <form action={action} className="mt-6 space-y-6">
      <Notice error={state.error} ok={state.ok} />
      <div className="grid md:grid-cols-2 gap-6">
        <Field label="FLAT RATE (₹)" hint="Charged on every order below the threshold.">
          <input name="flat_rate" defaultValue={flatRate} inputMode="decimal" required className={inputClass} />
        </Field>
        <Field label="FREE ABOVE (₹)" hint="After discounts. Blank for never free.">
          <input name="free_threshold" defaultValue={freeThreshold} inputMode="decimal" className={inputClass} />
        </Field>
      </div>

      <div>
        <span className={labelClass}>RATES FOR PARTICULAR STATES</span>
        <p className="mt-1 text-[11.5px] font-body font-light opacity-55">
          Replaces the flat rate for deliveries to that state. The free-shipping threshold still applies.
        </p>
        <div className="mt-4 space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="flex flex-wrap items-center gap-4">
              <select
                name="override_state"
                value={row.state}
                onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, state: e.target.value } : r)))}
                className={`${inputClass} max-w-[320px]`}
              >
                <option value="">Choose a state…</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                name="override_rate"
                value={row.rate}
                onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, rate: e.target.value } : r)))}
                placeholder="₹"
                inputMode="decimal"
                className={`${inputClass} max-w-[120px]`}
              />
              <button
                type="button"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
                className="qlink text-[11px] tracking-[.2em] font-body font-light"
              >
                REMOVE
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRows([...rows, { state: "", rate: "" }])}
            className="qlink text-[11px] tracking-[.2em] font-body font-light"
          >
            + ADD A STATE
          </button>
        </div>
      </div>

      <SaveButton pending={pending} />
    </form>
  );
}

// ── Inventory & features ────────────────────────────────────────────────────

export function InventoryForm({ threshold }: { threshold: number }) {
  const [state, action, pending] = useActionState(saveInventory, INITIAL);
  return (
    <form action={action} className="mt-6 space-y-6">
      <Notice error={state.error} ok={state.ok} />
      <div className="max-w-[320px]">
        <Field
          label="LOW-STOCK THRESHOLD"
          hint="At or below this many copies a product is flagged on the dashboard, and n8n sends a stock alert once."
        >
          <input
            name="low_stock_threshold"
            defaultValue={threshold}
            inputMode="numeric"
            required
            className={inputClass}
          />
        </Field>
      </div>
      <SaveButton pending={pending} />
    </form>
  );
}

export function FeaturesForm({
  checkoutEnabled,
  abandonedCheckoutEmail,
}: {
  checkoutEnabled: boolean;
  abandonedCheckoutEmail: boolean;
}) {
  const [state, action, pending] = useActionState(saveFeatures, INITIAL);
  return (
    <form
      action={action}
      className="mt-6 space-y-5"
      onSubmit={(e) => {
        const box = e.currentTarget.elements.namedItem("checkout_enabled") as HTMLInputElement | null;
        if (checkoutEnabled && box && !box.checked && !window.confirm("Stop taking orders? The checkout will refuse payment until you switch it back on.")) {
          e.preventDefault();
        }
      }}
    >
      <Notice error={state.error} ok={state.ok} />
      <label className="flex items-start gap-3 text-[13.5px] font-body font-light">
        <input type="checkbox" name="checkout_enabled" defaultChecked={checkoutEnabled} className="mt-1" style={{ accentColor: "var(--night)" }} />
        <span>
          <strong className="font-normal">Taking orders.</strong> Untick to close the checkout — for a holiday, or
          while stock is counted. The site stays up and says orders are paused.
        </span>
      </label>
      <label className="flex items-start gap-3 text-[13.5px] font-body font-light">
        <input
          type="checkbox"
          name="abandoned_checkout_email"
          defaultChecked={abandonedCheckoutEmail}
          className="mt-1"
          style={{ accentColor: "var(--night)" }}
        />
        <span>
          <strong className="font-normal">Remind buyers who stopped at payment.</strong> One email, an hour later,
          with a link back to their basket. Never twice, never after two days, never if they have since ordered.
        </span>
      </label>
      <SaveButton pending={pending} />
    </form>
  );
}

// ── Shiprocket ──────────────────────────────────────────────────────────────

export function ShiprocketForm({ pickupLocation, envPickup }: { pickupLocation: string; envPickup: string | null }) {
  const [state, action, pending] = useActionState(saveShiprocketPickup, INITIAL);
  const [testState, testAction, testing] = useActionState(testShiprocket, INITIAL);
  return (
    <div className="mt-6 space-y-5">
      <form action={action} className="space-y-5">
        <Notice error={state.error} ok={state.ok} />
        <div className="max-w-[420px]">
          <Field
            label="PICKUP LOCATION NICKNAME"
            hint={
              envPickup
                ? `Blank uses SHIPROCKET_PICKUP_LOCATION from the server (“${envPickup}”).`
                : "Exactly as the pickup address is named in Shiprocket → Settings → Pickup Addresses."
            }
          >
            <input name="pickup_location" defaultValue={pickupLocation} className={inputClass} />
          </Field>
        </div>
        <SaveButton pending={pending} />
      </form>
      <form action={testAction} className="space-y-3">
        <Notice error={testState.error} ok={testState.ok} />
        <button type="submit" disabled={testing} className="qlink text-[11.5px] tracking-[.22em] font-body font-light">
          {testing ? "TESTING…" : "TEST THE SHIPROCKET LOGIN"}
        </button>
      </form>
    </div>
  );
}

// ── Integrations ────────────────────────────────────────────────────────────

export interface WebhookRow {
  topic: string;
  saved: string;
  envName: string;
  envSet: boolean;
  consumer: string;
  waiting: number;
}

export function WebhooksForm({ rows }: { rows: WebhookRow[] }) {
  const [state, action, pending] = useActionState(saveWebhooks, INITIAL);
  return (
    <form action={action} className="mt-6 space-y-6">
      <Notice error={state.error} ok={state.ok} />
      <div className="space-y-6">
        {rows.map((row) => (
          <div key={row.topic}>
            <Field
              label={row.topic.toUpperCase()}
              hint={[
                row.consumer,
                !row.saved && row.envSet ? `Using ${row.envName} from the server.` : "",
                row.waiting ? `${row.waiting} event(s) waiting to go.` : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <input
                name={`webhook:${row.topic}`}
                defaultValue={row.saved}
                placeholder={row.envSet ? `(from ${row.envName})` : "https://n8n.opiamanalytics.com/webhook/…"}
                className={inputClass}
              />
            </Field>
          </div>
        ))}
      </div>
      <SaveButton pending={pending} />
    </form>
  );
}

export function TestWebhookButton({ topic, disabled }: { topic: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(sendTestWebhook, INITIAL);
  return (
    <form
      action={action}
      className="space-y-2"
      onSubmit={(e) => {
        if (
          topic === "order.paid" &&
          !window.confirm("Flows 1, 2 and 2b act on this test: a Zoho invoice and a NocoDB contact for TEST0000. Send it?")
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="topic" value={topic} />
      <button
        type="submit"
        disabled={pending || disabled}
        className="qlink text-[11px] tracking-[.2em] font-body font-light disabled:opacity-30"
      >
        {pending ? "SENDING…" : "SEND TEST"}
      </button>
      <Notice error={state.error} ok={state.ok} />
    </form>
  );
}

// ── Team ────────────────────────────────────────────────────────────────────

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteAdmin, INITIAL);
  return (
    <form action={action} className="mt-6 space-y-5">
      <Notice error={state.error} ok={state.ok} />
      <CopyableLink link={state.link} />
      <div className="grid md:grid-cols-3 gap-6">
        <Field label="EMAIL *">
          <input name="email" type="email" required className={inputClass} />
        </Field>
        <Field label="NAME">
          <input name="name" className={inputClass} />
        </Field>
        <Field label="ROLE" hint="Staff run orders, shipping, products and events. Owners also change settings and the team.">
          <select name="role" defaultValue="staff" className={inputClass}>
            <option value="staff">Staff</option>
            <option value="owner">Owner</option>
          </select>
        </Field>
      </div>
      <SaveButton pending={pending}>Invite</SaveButton>
    </form>
  );
}

export function TeamMemberActions({
  id,
  email,
  role,
  isSelf,
}: {
  id: string;
  email: string;
  role: string;
  isSelf: boolean;
}) {
  const [roleState, roleAction, changingRole] = useActionState(setAdminRole, INITIAL);
  const [linkState, linkAction, sendingLink] = useActionState(sendPasswordLink, INITIAL);
  const [removeState, removeAction, removing] = useActionState(removeAdmin, INITIAL);
  const nextRole = role === "owner" ? "staff" : "owner";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-end gap-5">
        <form action={linkAction}>
          <input type="hidden" name="id" value={id} />
          <button type="submit" disabled={sendingLink} className="qlink text-[11px] tracking-[.2em] font-body font-light">
            {sendingLink ? "…" : "PASSWORD LINK"}
          </button>
        </form>
        {!isSelf && (
          <>
            <form
              action={roleAction}
              onSubmit={(e) => {
                if (!window.confirm(`Make ${email} ${nextRole === "owner" ? "an owner" : "staff"}?`)) e.preventDefault();
              }}
            >
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="role" value={nextRole} />
              <button type="submit" disabled={changingRole} className="qlink text-[11px] tracking-[.2em] font-body font-light">
                {nextRole === "owner" ? "MAKE OWNER" : "MAKE STAFF"}
              </button>
            </form>
            <form
              action={removeAction}
              onSubmit={(e) => {
                if (!window.confirm(`Remove ${email}? Their login is deleted and they lose access at once.`)) e.preventDefault();
              }}
            >
              <input type="hidden" name="id" value={id} />
              <button
                type="submit"
                disabled={removing}
                className="qlink text-[11px] tracking-[.2em] font-body font-light"
                style={{ color: "var(--spice)" }}
              >
                REMOVE
              </button>
            </form>
          </>
        )}
      </div>
      <div className="text-left">
        <Notice error={roleState.error || removeState.error || linkState.error} ok={roleState.ok || removeState.ok || linkState.ok} />
        <CopyableLink link={linkState.link} />
      </div>
    </div>
  );
}
