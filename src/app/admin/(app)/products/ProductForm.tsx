"use client";

import { useActionState, useState } from "react";
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
  productType: string;
  vendor: string;
  hsnCode: string;
  seoTitle: string;
  seoDescription: string;
  price: string;
  compareAt: string;
  cost: string;
  sku: string;
  barcode: string;
  inventoryQuantity: string;
  weightGrams: string;
  lengthCm: string;
  breadthCm: string;
  heightCm: string;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12.5px] opacity-55">{hint}</span>}
    </label>
  );
}

export const input = "preorder-input font-body text-[15px] w-full";

/** Profit and margin from the price and cost fields, as Shopify shows under "Cost per item". */
export function marginHint(price: string, cost: string): string {
  const p = Number(price);
  const c = Number(cost);
  if (!cost.trim() || !price.trim() || !Number.isFinite(p) || !Number.isFinite(c) || p <= 0) {
    return "Buyers never see this.";
  }
  const profit = p - c;
  return `Profit ₹${profit.toLocaleString("en-IN", { maximumFractionDigits: 2 })} · Margin ${Math.round((profit / p) * 100)}%`;
}

export function SectionHeading({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <>
      <h2 className="font-semibold text-[20px]" style={{ color: "var(--night)" }}>
        {children}
      </h2>
      {hint && <p className="mt-2 text-[12px] opacity-60">{hint}</p>}
    </>
  );
}

export default function ProductForm({
  mode,
  values,
  variantCount = 1,
}: {
  mode: "create" | "edit";
  values: ProductFormValues;
  /** With more than one variant, price, stock and shipping live in the Variants panel. */
  variantCount?: number;
}) {
  const [state, formAction, pending] = useActionState(
    mode === "create" ? createProduct : updateProduct,
    INITIAL
  );
  const [price, setPrice] = useState(values.price);
  const [cost, setCost] = useState(values.cost);
  const single = variantCount <= 1;

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      {single && values.variantId && <input type="hidden" name="variant_id" value={values.variantId} />}

      {state.error && (
        <p
          role="alert"
          className="text-[13px] p-3 rounded"
          style={{ color: "var(--spice)", background: "rgba(164,66,44,.08)" }}
        >
          {state.error}
        </p>
      )}
      {state.ok && (
        <p
          role="status"
          className="text-[13px] p-3 rounded"
          style={{ color: "var(--kathakali)", background: "rgba(35,47,72,.05)" }}
        >
          {state.ok}
        </p>
      )}

      <section className="admin-card p-5 sm:p-6 grid md:grid-cols-2 gap-6">
        <Field label="Title *">
          <input name="title" defaultValue={values.title} required className={input} />
        </Field>
        <Field label="Handle" hint="The URL: aalmaram.com/products/<handle>">
          <input
            name="handle"
            defaultValue={values.handle}
            placeholder="made-from-the-title"
            className={input}
          />
        </Field>
        <Field label="Subtitle">
          <input
            name="subtitle"
            defaultValue={values.subtitle}
            placeholder="First edition · Numbered"
            className={input}
          />
        </Field>
        <Field label="Status" hint="Only active products appear on the storefront.">
          <select name="status" defaultValue={values.status} className={input}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Description" hint="Markdown: **bold**, *italic*, blank line for a new paragraph.">
            <textarea
              name="description_md"
              defaultValue={values.descriptionMd}
              rows={7}
              className={input}
            />
          </Field>
        </div>
      </section>

      {single ? (
        <>
          <section className="admin-card p-5 sm:p-6">
            <SectionHeading>Pricing</SectionHeading>
            <div className="mt-5 grid md:grid-cols-3 gap-6">
              <Field label="Price (₹)">
                <input
                  name="price"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  inputMode="decimal"
                  className={input}
                />
              </Field>
              <Field label="Compare-at price (₹)" hint="The old price, shown struck through.">
                <input
                  name="compare_at"
                  defaultValue={values.compareAt}
                  inputMode="decimal"
                  className={input}
                />
              </Field>
              <Field label="Cost per item (₹)" hint={marginHint(price, cost)}>
                <input
                  name="cost"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  inputMode="decimal"
                  className={input}
                />
              </Field>
            </div>
          </section>

          <section className="admin-card p-5 sm:p-6">
            <SectionHeading>Inventory</SectionHeading>
            <div className="mt-5 grid md:grid-cols-3 gap-6">
              <Field label="SKU (stock keeping unit)">
                <input name="sku" defaultValue={values.sku} className={input} />
              </Field>
              <Field label="Barcode (ISBN, UPC, GTIN)">
                <input name="barcode" defaultValue={values.barcode} className={input} />
              </Field>
              {mode === "create" ? (
                <Field label="Quantity in stock">
                  <input
                    name="inventory_quantity"
                    defaultValue={values.inventoryQuantity}
                    inputMode="numeric"
                    className={input}
                  />
                </Field>
              ) : (
                <Field label="Quantity in stock" hint="Change it in the Stock panel below, so it's logged.">
                  <input
                    value={values.inventoryQuantity}
                    readOnly
                    disabled
                    className={`${input} opacity-60`}
                  />
                </Field>
              )}
            </div>
          </section>

          <section className="admin-card p-5 sm:p-6">
            <SectionHeading hint="Shiprocket needs weight and dimensions to book a courier.">
              Shipping
            </SectionHeading>
            <div className="mt-5 grid md:grid-cols-4 gap-6">
              <Field label="Weight (g)">
                <input name="weight_grams" defaultValue={values.weightGrams} inputMode="numeric" className={input} />
              </Field>
              <Field label="Length (cm)">
                <input name="length_cm" defaultValue={values.lengthCm} inputMode="decimal" className={input} />
              </Field>
              <Field label="Breadth (cm)">
                <input name="breadth_cm" defaultValue={values.breadthCm} inputMode="decimal" className={input} />
              </Field>
              <Field label="Height (cm)">
                <input name="height_cm" defaultValue={values.heightCm} inputMode="decimal" className={input} />
              </Field>
            </div>
          </section>
        </>
      ) : (
        <p className="admin-card p-5 sm:p-6 text-[13px] opacity-70">
          This product has {variantCount} variants. Price, stock, SKU and shipping are set for each
          one in the Variants panel below.
        </p>
      )}

      <section className="admin-card p-5 sm:p-6">
        <SectionHeading>Product organization</SectionHeading>
        <div className="mt-5 grid md:grid-cols-2 gap-6">
          <Field label="Product type" hint="e.g. Picture book, Tote bag">
            <input name="product_type" defaultValue={values.productType} className={input} />
          </Field>
          <Field label="Vendor" hint="Who makes or publishes it.">
            <input name="vendor" defaultValue={values.vendor} className={input} />
          </Field>
          <Field label="Tags" hint="Comma separated, e.g. age-4-8, malayalam">
            <input name="tags" defaultValue={values.tags} className={input} />
          </Field>
          <Field label="HSN code" hint="For GST. Books are usually 4901.">
            <input name="hsn_code" defaultValue={values.hsnCode} className={input} />
          </Field>
        </div>
      </section>

      <section className="admin-card p-5 sm:p-6">
        <SectionHeading hint="How it looks in Google results. Left blank, the title and subtitle are used.">
          Search engine listing
        </SectionHeading>
        <div className="mt-5 grid md:grid-cols-2 gap-6">
          <Field label="Page title">
            <input name="seo_title" defaultValue={values.seoTitle} maxLength={70} className={input} />
          </Field>
          <Field label="Meta description">
            <input
              name="seo_description"
              defaultValue={values.seoDescription}
              maxLength={320}
              className={input}
            />
          </Field>
        </div>
      </section>

      <div className="sticky bottom-4 z-10 flex items-center justify-end gap-4">
        {!pending && (state.ok || state.error) && (
          <span
            className="text-[13px] px-3 py-1.5 rounded-md bg-white shadow"
            style={{ color: state.error ? "var(--spice)" : "var(--kathakali)" }}
          >
            {state.error || state.ok}
          </span>
        )}
        <button
          type="submit"
          disabled={pending}
          className="btn-night px-5 py-2.5 text-[13px] rounded-lg shadow-lg"
        >
          {pending ? "Saving…" : mode === "create" ? "Create product" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
