"use client";

import { useActionState, useState } from "react";
import { INDIAN_STATES } from "@/lib/india";
import { Notice, inputClass, labelClass } from "../ui";
import {
  saveFeatures,
  saveInventory,
  saveShipping,
  saveShiprocketPickup,
  saveStore,
  saveWebhooks,
  sendTestWebhook,
  testShiprocket,
  type ActionState,
} from "./actions";

const INITIAL: ActionState = { error: "" };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12.5px] opacity-55">{hint}</span>}
    </label>
  );
}

function SaveButton({ pending, children = "Save" }: { pending: boolean; children?: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-night px-4 py-2.5 text-[13px]"
    >
      {pending ? "Saving…" : children}
    </button>
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
        <Field label="Store name">
          <input name="name" defaultValue={values.name} required className={inputClass} />
        </Field>
        <Field label="Support email" hint="Reply-to on every email, and shown to buyers.">
          <input name="support_email" type="email" defaultValue={values.supportEmail} required className={inputClass} />
        </Field>
        <Field label="Site address" hint="Used in links inside emails.">
          <input name="site_url" defaultValue={values.siteUrl} required className={inputClass} />
        </Field>
        <Field label="GST number" hint="Optional. Books are GST-exempt; Zoho stays the invoice record.">
          <input name="gst_number" defaultValue={values.gstNumber} maxLength={15} className={inputClass} />
        </Field>
        <Field label="Invoice prefix" hint="Also the order-number prefix in Zoho.">
          <input name="invoice_prefix" defaultValue={values.invoicePrefix} maxLength={10} required className={inputClass} />
        </Field>
        <Field
          label="New-order alerts to"
          hint={values.envOverrides.notify ? "ADMIN_NOTIFY_EMAIL is set on the server and wins over this." : "Blank for none."}
        >
          <input name="admin_notify_email" type="email" defaultValue={values.adminNotifyEmail} className={inputClass} />
        </Field>
        <Field
          label="Order emails from"
          hint={values.envOverrides.fromOrders ? "EMAIL_FROM_ORDERS is set on the server and wins over this." : "The domain must be verified in Resend."}
        >
          <input name="from_orders" defaultValue={values.fromOrders} required className={inputClass} />
        </Field>
        <Field label="Letters from" hint="Used by the n8n newsletter and post-purchase flows.">
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
        <Field label="Flat rate (₹)" hint="Charged on every order below the threshold.">
          <input name="flat_rate" defaultValue={flatRate} inputMode="decimal" required className={inputClass} />
        </Field>
        <Field label="Free above (₹)" hint="After discounts. Blank for never free.">
          <input name="free_threshold" defaultValue={freeThreshold} inputMode="decimal" className={inputClass} />
        </Field>
      </div>

      <div>
        <span className={labelClass}>Rates for particular states</span>
        <p className="mt-1 text-[12.5px] opacity-55">
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
                className="qlink text-[12px]"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRows([...rows, { state: "", rate: "" }])}
            className="qlink text-[12px]"
          >
            + Add a state
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
          label="Low-stock threshold"
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
      <label className="flex items-start gap-3 text-[13.5px]">
        <input type="checkbox" name="checkout_enabled" defaultChecked={checkoutEnabled} className="mt-1" style={{ accentColor: "var(--night)" }} />
        <span>
          <strong className="font-normal">Taking orders.</strong> Untick to close the checkout — for a holiday, or
          while stock is counted. The site stays up and says orders are paused.
        </span>
      </label>
      <label className="flex items-start gap-3 text-[13.5px]">
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
            label="Pickup location nickname"
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
        <button type="submit" disabled={testing} className="qlink text-[12.5px]">
          {testing ? "Testing…" : "Test the Shiprocket login"}
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
              label={row.topic}
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
        className="qlink text-[12px] disabled:opacity-30"
      >
        {pending ? "Sending…" : "Send test"}
      </button>
      <Notice error={state.error} ok={state.ok} />
    </form>
  );
}
