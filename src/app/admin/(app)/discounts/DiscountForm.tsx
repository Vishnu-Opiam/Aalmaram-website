"use client";

import { useActionState, useState } from "react";
import { Notice, SectionTitle, inputClass, labelClass } from "../ui";
import { createDiscount, deleteDiscount, updateDiscount, type ActionState } from "./actions";

const INITIAL: ActionState = { error: "" };

export interface DiscountFormValues {
  id?: string;
  code: string;
  title: string;
  type: "percentage" | "fixed_amount" | "free_shipping";
  /** Percent for percentage, rupees for fixed_amount. */
  value: string;
  appliesTo: "all" | "products" | "tag";
  productIds: string[];
  tag: string;
  minSubtotal: string;
  usageLimit: string;
  usageLimitPerCustomer: string;
  oncePerCustomer: boolean;
  startsAt: string;
  endsAt: string;
  active: boolean;
}

/** No 0/O or 1/I/L, so a code read aloud or off a printed card can't be mistyped. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateCode(length = 8): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
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

export default function DiscountForm({
  mode,
  values,
  products,
  tags,
}: {
  mode: "create" | "edit";
  values: DiscountFormValues;
  products: { id: string; title: string; status: string }[];
  tags: string[];
}) {
  const [state, formAction, pending] = useActionState(
    mode === "create" ? createDiscount : updateDiscount,
    INITIAL
  );
  const [code, setCode] = useState(values.code);
  const [type, setType] = useState(values.type);
  const [appliesTo, setAppliesTo] = useState(values.appliesTo);
  const [oncePerCustomer, setOncePerCustomer] = useState(values.oncePerCustomer);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <Notice error={state.error} ok={state.ok} />

      <section className="admin-card p-5 sm:p-6 grid md:grid-cols-2 gap-6">
        <Field label="CODE *" hint="What customers type. Stored in capitals.">
          <div className="flex items-center gap-4">
            <input
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, ""))}
              required
              maxLength={32}
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setCode(generateCode())}
              className="qlink text-[12px] shrink-0"
            >
              Generate
            </button>
          </div>
        </Field>
        <Field label="Title" hint="For you, not the customer. e.g. Nagma launch, 15% off">
          <input name="title" defaultValue={values.title} className={inputClass} />
        </Field>
      </section>

      <section className="admin-card p-5 sm:p-6">
        <SectionTitle>What it gives</SectionTitle>
        <div className="mt-5 grid md:grid-cols-2 gap-6">
          <Field label="Type">
            <select
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value as DiscountFormValues["type"])}
              className={inputClass}
            >
              <option value="percentage">Percentage off</option>
              <option value="fixed_amount">Fixed amount off</option>
              <option value="free_shipping">Free shipping</option>
            </select>
          </Field>
          {type !== "free_shipping" && (
            <Field
              label={type === "percentage" ? "Percent off *" : "Rupees off *"}
              hint={
                type === "fixed_amount"
                  ? "Never more than the eligible items are worth."
                  : "Of the eligible items, not shipping."
              }
            >
              <input name="value" defaultValue={values.value} inputMode="decimal" required className={inputClass} />
            </Field>
          )}
        </div>
      </section>

      <section className="admin-card p-5 sm:p-6">
        <SectionTitle>What it applies to</SectionTitle>
        <div className="mt-5 space-y-5">
          <div className="flex flex-wrap gap-6 text-[13.5px]">
            {(
              [
                ["all", "Everything"],
                ["products", "Chosen products"],
                ["tag", "Products with a tag"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="applies_to"
                  value={value}
                  checked={appliesTo === value}
                  onChange={() => setAppliesTo(value)}
                  style={{ accentColor: "var(--night)" }}
                />
                {label}
              </label>
            ))}
          </div>

          {appliesTo === "products" && (
            <fieldset className="space-y-2">
              {products.length === 0 && (
                <p className="text-[12.5px] opacity-60">No products yet.</p>
              )}
              {products.map((product) => (
                <label key={product.id} className="flex items-center gap-3 text-[13.5px]">
                  <input
                    type="checkbox"
                    name="product_ids"
                    value={product.id}
                    defaultChecked={values.productIds.includes(product.id)}
                    style={{ accentColor: "var(--night)" }}
                  />
                  {product.title}
                  {product.status !== "active" && <span className="opacity-50">({product.status})</span>}
                </label>
              ))}
            </fieldset>
          )}

          {appliesTo === "tag" && (
            <Field label="TAG *" hint={tags.length ? `In use: ${tags.join(", ")}` : undefined}>
              <input name="tag" defaultValue={values.tag} list="discount-tags" className={inputClass} />
              <datalist id="discount-tags">
                {tags.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
          )}
          {appliesTo !== "tag" && <input type="hidden" name="tag" value="" />}

          <div className="grid md:grid-cols-2 gap-6">
            <Field label="Minimum basket (₹)" hint="Blank for none.">
              <input name="min_subtotal" defaultValue={values.minSubtotal} inputMode="decimal" className={inputClass} />
            </Field>
          </div>
        </div>
      </section>

      <section className="admin-card p-5 sm:p-6">
        <SectionTitle hint="Checked when the buyer applies the code, and again when they go to pay.">Limits</SectionTitle>
        <div className="mt-5 grid md:grid-cols-2 gap-6">
          <Field label="Total uses" hint="Blank for unlimited.">
            <input name="usage_limit" defaultValue={values.usageLimit} inputMode="numeric" className={inputClass} />
          </Field>
          <Field label="Uses per customer" hint="By email. Blank for unlimited.">
            <input
              name="usage_limit_per_customer"
              defaultValue={values.usageLimitPerCustomer}
              inputMode="numeric"
              disabled={oncePerCustomer}
              className={`${inputClass} ${oncePerCustomer ? "opacity-50" : ""}`}
            />
          </Field>
          <label className="flex items-center gap-3 text-[13.5px] md:col-span-2">
            <input
              type="checkbox"
              name="once_per_customer"
              checked={oncePerCustomer}
              onChange={(e) => setOncePerCustomer(e.target.checked)}
              style={{ accentColor: "var(--night)" }}
            />
            Once per customer
          </label>
        </div>
      </section>

      <section className="admin-card p-5 sm:p-6">
        <SectionTitle hint="Indian time.">When</SectionTitle>
        <div className="mt-5 grid md:grid-cols-2 gap-6">
          <Field label="Starts" hint="Blank for now.">
            <input name="starts_at" type="datetime-local" defaultValue={values.startsAt} className={inputClass} />
          </Field>
          <Field label="Ends" hint="Blank for never.">
            <input name="ends_at" type="datetime-local" defaultValue={values.endsAt} className={inputClass} />
          </Field>
          <label className="flex items-center gap-3 text-[13.5px] md:col-span-2">
            <input type="checkbox" name="active" defaultChecked={values.active} style={{ accentColor: "var(--night)" }} />
            Active — untick to switch the code off without deleting it
          </label>
        </div>
      </section>

      <button
        type="submit"
        disabled={pending}
        className="btn-night px-4 py-2.5 text-[13px]"
      >
        {pending ? "Saving…" : mode === "create" ? "Create code" : "Save changes"}
      </button>
    </form>
  );
}

export function DeleteDiscountButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(deleteDiscount, INITIAL);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("Delete this code for good?")) e.preventDefault();
      }}
      className="space-y-3"
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="qlink text-[12.5px]"
        style={{ color: "var(--spice)" }}
      >
        Delete
      </button>
      <Notice error={state.error} />
    </form>
  );
}

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copy this link:", url);
        }
      }}
      className="qlink text-[12.5px]"
      title={url}
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
