"use client";

import { useActionState } from "react";
import { createProduct, updateProduct, type ActionState } from "./actions";

const INITIAL: ActionState = { error: "" };

export interface ProductFormValues {
  id?: string;
  variantId?: string;
  title: string;
  handle: string;
  subtitle: string;
  descriptionMd: string;
  status: string;
  tags: string;
  hsnCode: string;
  seoTitle: string;
  seoDescription: string;
  price: string;
  compareAt: string;
  sku: string;
  inventoryQuantity: string;
  weightGrams: string;
  lengthCm: string;
  breadthCm: string;
  heightCm: string;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[10px] tracking-[.24em] font-body opacity-70">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] font-body font-light opacity-55">{hint}</span>}
    </label>
  );
}

const input = "preorder-input font-body text-[15px] w-full";

export default function ProductForm({
  mode,
  values,
}: {
  mode: "create" | "edit";
  values: ProductFormValues;
}) {
  const [state, formAction, pending] = useActionState(
    mode === "create" ? createProduct : updateProduct,
    INITIAL
  );

  return (
    <form action={formAction} className="mt-10 space-y-10">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      {values.variantId && <input type="hidden" name="variant_id" value={values.variantId} />}

      {state.error && (
        <p
          className="text-[13px] font-body p-3 rounded"
          style={{ color: "var(--spice)", background: "rgba(164,66,44,.08)" }}
        >
          {state.error}
        </p>
      )}
      {state.ok && (
        <p
          className="text-[13px] font-body p-3 rounded"
          style={{ color: "var(--kathakali)", background: "rgba(35,47,72,.05)" }}
        >
          {state.ok}
        </p>
      )}

      <section className="grid md:grid-cols-2 gap-6">
        <Field label="TITLE *">
          <input name="title" defaultValue={values.title} required className={input} />
        </Field>
        <Field label="HANDLE" hint="The URL: aalmaram.com/products/<handle>">
          <input
            name="handle"
            defaultValue={values.handle}
            placeholder="made-from-the-title"
            className={input}
          />
        </Field>
        <Field label="SUBTITLE">
          <input
            name="subtitle"
            defaultValue={values.subtitle}
            placeholder="First edition · Numbered"
            className={input}
          />
        </Field>
        <Field label="STATUS" hint="Only active products appear on the storefront.">
          <select name="status" defaultValue={values.status} className={input}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </Field>
      </section>

      <Field label="DESCRIPTION" hint="Markdown: **bold**, *italic*, blank line for a new paragraph.">
        <textarea
          name="description_md"
          defaultValue={values.descriptionMd}
          rows={7}
          className={input}
        />
      </Field>

      <section>
        <h2 className="font-display italic text-[20px]" style={{ color: "var(--night)" }}>
          Price and stock
        </h2>
        <div className="mt-5 grid md:grid-cols-4 gap-6">
          <Field label="PRICE (₹)">
            <input name="price" defaultValue={values.price} inputMode="decimal" className={input} />
          </Field>
          <Field label="COMPARE AT (₹)" hint="Shown struck through.">
            <input
              name="compare_at"
              defaultValue={values.compareAt}
              inputMode="decimal"
              className={input}
            />
          </Field>
          <Field label="SKU">
            <input name="sku" defaultValue={values.sku} className={input} />
          </Field>
          {mode === "create" ? (
            <Field label="STOCK">
              <input
                name="inventory_quantity"
                defaultValue={values.inventoryQuantity}
                inputMode="numeric"
                className={input}
              />
            </Field>
          ) : (
            <Field label="STOCK" hint="Adjust below, so the change is logged.">
              <input
                value={values.inventoryQuantity}
                readOnly
                disabled
                className={`${input} opacity-60`}
              />
              <input type="hidden" name="inventory_quantity" value={values.inventoryQuantity} />
            </Field>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-display italic text-[20px]" style={{ color: "var(--night)" }}>
          Shipping
        </h2>
        <p className="mt-2 text-[12px] font-body font-light opacity-60">
          Shiprocket needs weight and dimensions to book a courier.
        </p>
        <div className="mt-5 grid md:grid-cols-4 gap-6">
          <Field label="WEIGHT (G)">
            <input
              name="weight_grams"
              defaultValue={values.weightGrams}
              inputMode="numeric"
              className={input}
            />
          </Field>
          <Field label="LENGTH (CM)">
            <input
              name="length_cm"
              defaultValue={values.lengthCm}
              inputMode="decimal"
              className={input}
            />
          </Field>
          <Field label="BREADTH (CM)">
            <input
              name="breadth_cm"
              defaultValue={values.breadthCm}
              inputMode="decimal"
              className={input}
            />
          </Field>
          <Field label="HEIGHT (CM)">
            <input
              name="height_cm"
              defaultValue={values.heightCm}
              inputMode="decimal"
              className={input}
            />
          </Field>
        </div>
      </section>

      <section>
        <h2 className="font-display italic text-[20px]" style={{ color: "var(--night)" }}>
          Grouping and search
        </h2>
        <div className="mt-5 grid md:grid-cols-2 gap-6">
          <Field label="TAGS" hint="Comma separated, e.g. age-4-8, malayalam">
            <input name="tags" defaultValue={values.tags} className={input} />
          </Field>
          <Field label="HSN CODE" hint="Books are usually 4901.">
            <input name="hsn_code" defaultValue={values.hsnCode} className={input} />
          </Field>
          <Field label="SEO TITLE">
            <input name="seo_title" defaultValue={values.seoTitle} className={input} />
          </Field>
          <Field label="SEO DESCRIPTION">
            <input name="seo_description" defaultValue={values.seoDescription} className={input} />
          </Field>
        </div>
      </section>

      <button
        type="submit"
        disabled={pending}
        className="btn-night px-10 py-4 text-[12px] tracking-[.26em] font-body font-normal"
      >
        {pending ? "Saving…" : mode === "create" ? "Create product" : "Save changes"}
      </button>
    </form>
  );
}
