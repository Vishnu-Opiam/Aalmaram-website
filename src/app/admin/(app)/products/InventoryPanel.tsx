"use client";

import { useActionState, useState } from "react";
import { adjustInventory, type ActionState } from "./actions";

const INITIAL: ActionState = { error: "" };

export interface Adjustment {
  id: string;
  variant_id: string;
  delta: number;
  reason: string;
  note: string;
  created_by: string;
  created_at: string;
}

export interface StockVariant {
  id: string;
  title: string;
  quantity: number;
}

export default function InventoryPanel({
  variants,
  history,
}: {
  variants: StockVariant[];
  history: Adjustment[];
}) {
  const [state, formAction, pending] = useActionState(adjustInventory, INITIAL);
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [mode, setMode] = useState<"set" | "add">("set");
  const variant = variants.find((v) => v.id === variantId) ?? variants[0];
  const total = variants.reduce((sum, v) => sum + v.quantity, 0);
  const shown = history.filter((h) => variants.length === 1 || h.variant_id === variant?.id);

  if (!variant) return null;

  return (
    <section className="admin-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[20px]" style={{ color: "var(--night)" }}>
            Stock
          </h2>
          <p className="mt-2 text-[12px] opacity-60">
            {total === 0 ? "Sold out everywhere. " : `${total} in stock in total. `}
            Every change is recorded, so counts can always be explained.
          </p>
        </div>
        {variant.quantity > 0 && (
          <form
            action={formAction}
            onSubmit={(e) => {
              if (!confirm(`Set ${variant.title === "Default" ? "stock" : variant.title} to 0? The shop will show it as sold out.`)) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="variant_id" value={variant.id} />
            <input type="hidden" name="mode" value="set" />
            <input type="hidden" name="delta" value="0" />
            <input type="hidden" name="reason" value="manual" />
            <input type="hidden" name="note" value="Marked sold out" />
            <button
              type="submit"
              disabled={pending}
              className="text-[13px] font-medium px-3 py-1.5 rounded-md border"
              style={{ color: "var(--spice)", borderColor: "rgba(164,66,44,.3)" }}
            >
              Mark sold out
            </button>
          </form>
        )}
      </div>

      <form action={formAction} className="mt-6 grid grid-cols-2 gap-4">
        {variants.length > 1 ? (
          <label className="block col-span-2">
            <span className="text-[13px] font-medium">Variant</span>
            <select
              name="variant_id"
              value={variant.id}
              onChange={(e) => setVariantId(e.target.value)}
              className="preorder-input text-[15px] w-full"
            >
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title} — {v.quantity} in stock
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="variant_id" value={variant.id} />
        )}
        <input type="hidden" name="mode" value={mode} />

        <div className="col-span-2 inline-flex w-fit rounded-md border border-[var(--a-border)] p-0.5 text-[12.5px]">
          {(["set", "add"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className="px-3 py-1 rounded"
              style={mode === m ? { background: "var(--night)", color: "#fff" } : undefined}
            >
              {m === "set" ? "Set exact count" : "Add or remove"}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="text-[13px] font-medium">{mode === "set" ? "New count" : "Change"}</span>
          <input
            key={`${mode}-${variant.id}`}
            name="delta"
            placeholder={mode === "set" ? String(variant.quantity) : "+10 or -2"}
            inputMode="numeric"
            required
            className="preorder-input text-[15px] w-full"
          />
        </label>
        <label className="block">
          <span className="text-[13px] font-medium">Reason</span>
          <select name="reason" className="preorder-input text-[15px] w-full">
            <option value="restock">Restock</option>
            <option value="manual">Manual correction</option>
            <option value="cancellation">Cancellation</option>
            <option value="refund">Refund / return</option>
            <option value="import">Import</option>
          </select>
        </label>
        <label className="block col-span-2">
          <span className="text-[13px] font-medium">Note</span>
          <input name="note" className="preorder-input text-[15px] w-full" />
        </label>

        {state.error && (
          <p className="col-span-2 text-[12.5px]" style={{ color: "var(--spice)" }}>
            {state.error}
          </p>
        )}
        {state.ok && (
          <p className="col-span-2 text-[12.5px]" style={{ color: "var(--kathakali)" }}>
            {state.ok}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="btn-night col-span-2 px-4 py-2.5 text-[13px] justify-self-start"
        >
          {pending ? "Saving…" : "Update stock"}
        </button>
      </form>

      {shown.length > 0 && (
        <ul className="mt-8 space-y-3">
          {shown.map((entry) => (
            <li key={entry.id} className="text-[12.5px] flex gap-3">
              <span
                className="font-semibold text-[14px] w-10 shrink-0"
                style={{ color: entry.delta > 0 ? "var(--kathakali)" : "var(--spice)" }}
              >
                {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
              </span>
              <span className="opacity-70">
                {entry.reason}
                {entry.note ? ` · ${entry.note}` : ""} · {entry.created_by} ·{" "}
                {new Date(entry.created_at).toLocaleDateString("en-IN")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
