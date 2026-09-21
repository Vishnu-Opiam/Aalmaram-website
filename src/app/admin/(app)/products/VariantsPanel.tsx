"use client";

import { useActionState, useState } from "react";
import { formatPaise } from "@/lib/format";
import { deleteVariant, moveVariant, saveVariant, type ActionState } from "./actions";
import { Field, SectionHeading, input, marginHint } from "./ProductForm";

const INITIAL: ActionState = { error: "" };

export interface VariantRow {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  price_paise: number;
  compare_at_paise: number | null;
  cost_paise: number | null;
  inventory_quantity: number;
  weight_grams: number;
  length_cm: number;
  breadth_cm: number;
  height_cm: number;
  sold: boolean;
}

const rupees = (paise: number | null) => (paise === null ? "" : String(paise / 100));

export default function VariantsPanel({
  productId,
  variants,
}: {
  productId: string;
  variants: VariantRow[];
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <section className="admin-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionHeading hint="Versions of this product, such as Paperback and Hardcover, or Malayalam and English. Each has its own price and stock. The first one is shown first on the shop.">
            Variants
          </SectionHeading>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-[13px] font-medium px-3 py-1.5 rounded-md border border-[var(--a-border)] hover:bg-[var(--a-hover)]"
          >
            + Add variant
          </button>
        )}
      </div>

      <ul className="mt-5 divide-y divide-[var(--a-border)] border-y border-[var(--a-border)]">
        {variants.map((v, i) => (
          <li key={v.id} className="py-3">
            <div className="flex flex-wrap items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium">
                  {variants.length === 1 && v.title === "Default" ? "Default (only variant)" : v.title}
                </div>
                <div className="text-[12px] opacity-60">
                  {[v.sku && `SKU ${v.sku}`, v.barcode && `Barcode ${v.barcode}`, `${v.weight_grams} g`]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <div className="text-[14px] font-semibold tabular-nums w-24 text-right">
                {formatPaise(v.price_paise)}
              </div>
              <div
                className="text-[13px] w-24 text-right"
                style={{ color: v.inventory_quantity === 0 ? "var(--spice)" : undefined }}
              >
                {v.inventory_quantity === 0 ? "Sold out" : `${v.inventory_quantity} in stock`}
              </div>
              <div className="flex items-center gap-1">
                {variants.length > 1 && (
                  <>
                    <MoveButton id={v.id} direction="up" disabled={i === 0} label="↑" />
                    <MoveButton id={v.id} direction="down" disabled={i === variants.length - 1} label="↓" />
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setEditing(editing === v.id ? null : v.id)}
                  className="text-[13px] font-medium px-2.5 py-1 rounded-md hover:bg-[var(--a-hover)]"
                >
                  {editing === v.id ? "Close" : "Edit"}
                </button>
                {variants.length > 1 && !v.sold && (
                  <form
                    action={deleteVariant}
                    onSubmit={(e) => {
                      if (!confirm(`Delete the variant "${v.title}"?`)) e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="variant_id" value={v.id} />
                    <button
                      type="submit"
                      className="text-[13px] px-2.5 py-1 rounded-md hover:bg-[var(--a-hover)]"
                      style={{ color: "var(--spice)" }}
                    >
                      Delete
                    </button>
                  </form>
                )}
              </div>
            </div>
            {editing === v.id && (
              <VariantEditor productId={productId} variant={v} onDone={() => setEditing(null)} />
            )}
          </li>
        ))}
      </ul>

      {adding && (
        <div className="mt-5">
          <h3 className="text-[15px] font-semibold">New variant</h3>
          <VariantEditor productId={productId} onDone={() => setAdding(false)} />
        </div>
      )}
    </section>
  );
}

function MoveButton({
  id,
  direction,
  disabled,
  label,
}: {
  id: string;
  direction: string;
  disabled: boolean;
  label: string;
}) {
  return (
    <form action={moveVariant}>
      <input type="hidden" name="variant_id" value={id} />
      <input type="hidden" name="direction" value={direction} />
      <button
        type="submit"
        disabled={disabled}
        aria-label={`Move ${direction}`}
        className="w-7 h-7 rounded-md hover:bg-[var(--a-hover)] disabled:opacity-25"
      >
        {label}
      </button>
    </form>
  );
}

function VariantEditor({
  productId,
  variant,
  onDone,
}: {
  productId: string;
  variant?: VariantRow;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await saveVariant(prev, fd);
    if (!result.error) onDone();
    return result;
  }, INITIAL);
  const [price, setPrice] = useState(rupees(variant?.price_paise ?? null));
  const [cost, setCost] = useState(rupees(variant?.cost_paise ?? null));

  return (
    <form action={formAction} className="mt-4 grid md:grid-cols-4 gap-5 p-4 rounded-lg" style={{ background: "var(--a-bg)" }}>
      <input type="hidden" name="product_id" value={productId} />
      {variant && <input type="hidden" name="variant_id" value={variant.id} />}

      <div className="md:col-span-2">
        <Field label="Name *" hint="What the buyer picks, e.g. Hardcover">
          <input name="title" defaultValue={variant?.title ?? ""} required className={input} />
        </Field>
      </div>
      <Field label="SKU">
        <input name="sku" defaultValue={variant?.sku ?? ""} className={input} />
      </Field>
      <Field label="Barcode">
        <input name="barcode" defaultValue={variant?.barcode ?? ""} className={input} />
      </Field>

      <Field label="Price (₹)">
        <input name="price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={input} />
      </Field>
      <Field label="Compare-at (₹)">
        <input name="compare_at" defaultValue={rupees(variant?.compare_at_paise ?? null)} inputMode="decimal" className={input} />
      </Field>
      <Field label="Cost per item (₹)" hint={marginHint(price, cost)}>
        <input name="cost" value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" className={input} />
      </Field>
      {variant ? (
        <Field label="Stock" hint="Change it in the Stock panel.">
          <input value={variant.inventory_quantity} readOnly disabled className={`${input} opacity-60`} />
        </Field>
      ) : (
        <Field label="Opening stock">
          <input name="inventory_quantity" defaultValue="0" inputMode="numeric" className={input} />
        </Field>
      )}

      <Field label="Weight (g)">
        <input name="weight_grams" defaultValue={variant?.weight_grams ?? 0} inputMode="numeric" className={input} />
      </Field>
      <Field label="Length (cm)">
        <input name="length_cm" defaultValue={variant?.length_cm ?? 0} inputMode="decimal" className={input} />
      </Field>
      <Field label="Breadth (cm)">
        <input name="breadth_cm" defaultValue={variant?.breadth_cm ?? 0} inputMode="decimal" className={input} />
      </Field>
      <Field label="Height (cm)">
        <input name="height_cm" defaultValue={variant?.height_cm ?? 0} inputMode="decimal" className={input} />
      </Field>

      <div className="md:col-span-4 flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className="btn-night px-4 py-2 text-[13px] rounded-lg">
          {pending ? "Saving…" : variant ? "Save variant" : "Add variant"}
        </button>
        <button type="button" onClick={onDone} className="text-[13px] opacity-70">
          Cancel
        </button>
        {state.error && (
          <span role="alert" className="text-[13px]" style={{ color: "var(--spice)" }}>
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
