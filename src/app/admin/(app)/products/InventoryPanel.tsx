"use client";

import { useActionState } from "react";
import { adjustInventory, type ActionState } from "./actions";

const INITIAL: ActionState = { error: "" };

export interface Adjustment {
  id: string;
  delta: number;
  reason: string;
  note: string;
  created_by: string;
  created_at: string;
}

export default function InventoryPanel({
  variantId,
  quantity,
  history,
}: {
  variantId: string;
  quantity: number;
  history: Adjustment[];
}) {
  const [state, formAction, pending] = useActionState(adjustInventory, INITIAL);

  return (
    <section>
      <h2 className="font-display italic text-[20px]" style={{ color: "var(--night)" }}>
        Stock
      </h2>
      <p className="mt-2 text-[12px] font-body font-light opacity-60">
        {quantity} in stock. Every change is recorded, so counts can always be explained.
      </p>

      <form action={formAction} className="mt-6 grid grid-cols-2 gap-4">
        <input type="hidden" name="variant_id" value={variantId} />
        <label className="block">
          <span className="text-[10px] tracking-[.24em] font-body opacity-70">CHANGE</span>
          <input
            name="delta"
            placeholder="+10 or -2"
            inputMode="numeric"
            required
            className="preorder-input font-body text-[15px] w-full"
          />
        </label>
        <label className="block">
          <span className="text-[10px] tracking-[.24em] font-body opacity-70">REASON</span>
          <select name="reason" className="preorder-input font-body text-[15px] w-full">
            <option value="restock">Restock</option>
            <option value="manual">Manual correction</option>
            <option value="cancellation">Cancellation</option>
            <option value="refund">Refund</option>
            <option value="import">Import</option>
          </select>
        </label>
        <label className="block col-span-2">
          <span className="text-[10px] tracking-[.24em] font-body opacity-70">NOTE</span>
          <input name="note" className="preorder-input font-body text-[15px] w-full" />
        </label>

        {state.error && (
          <p className="col-span-2 text-[12.5px] font-body" style={{ color: "var(--spice)" }}>
            {state.error}
          </p>
        )}
        {state.ok && (
          <p className="col-span-2 text-[12.5px] font-body" style={{ color: "var(--kathakali)" }}>
            {state.ok}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="btn-night col-span-2 px-7 py-3 text-[11.5px] tracking-[.24em] font-body font-normal justify-self-start"
        >
          {pending ? "Adjusting…" : "Adjust stock"}
        </button>
      </form>

      {history.length > 0 && (
        <ul className="mt-8 space-y-3">
          {history.map((entry) => (
            <li key={entry.id} className="text-[12.5px] font-body font-light flex gap-3">
              <span
                className="font-display text-[15px] w-10 shrink-0"
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
