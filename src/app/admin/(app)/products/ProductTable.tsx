"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatPaise } from "@/lib/format";
import { Pill, sentence, type Tone } from "../ui";
import { bulkUpdateProducts } from "./actions";

const STATUS_TONE: Record<string, Tone> = { active: "good", draft: "quiet", archived: "bad" };

export interface ProductRow {
  id: string;
  title: string;
  handle: string;
  status: string;
  productType: string;
  image: string | null;
  minPricePaise: number | null;
  maxPricePaise: number | null;
  stock: number;
  variantCount: number;
}

const BULK: { op: string; label: string; confirm?: string }[] = [
  { op: "active", label: "Set active" },
  { op: "draft", label: "Set draft" },
  { op: "archived", label: "Archive" },
  { op: "sold_out", label: "Mark sold out", confirm: "Set stock to 0 for every selected product?" },
];

export default function ProductTable({ rows, lowStock }: { rows: ProductRow[]; lowStock: number }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const allSelected = rows.length > 0 && selected.size === rows.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = (op: string, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    const fd = new FormData();
    fd.set("op", op);
    selected.forEach((id) => fd.append("ids", id));
    startTransition(async () => {
      await bulkUpdateProducts(fd);
      setSelected(new Set());
      router.refresh();
    });
  };

  return (
    <div className="mt-4 admin-card overflow-hidden">
      <div className="px-5 py-3 flex flex-wrap items-center gap-3 border-b border-[var(--a-border)] text-[13px]">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
            aria-label="Select all"
          />
          {selected.size ? `${selected.size} selected` : "Select all"}
        </label>
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {BULK.map((b) => (
              <button
                key={b.op}
                type="button"
                disabled={pending}
                onClick={() => run(b.op, b.confirm)}
                className="px-3 py-1 rounded-md border border-[var(--a-border)] bg-white hover:bg-[var(--a-hover)] disabled:opacity-50"
                style={b.op === "sold_out" || b.op === "archived" ? { color: "var(--spice)" } : undefined}
              >
                {b.label}
              </button>
            ))}
            {pending && <span className="opacity-60">Working…</span>}
          </div>
        )}
      </div>

      <ul className="divide-y divide-[var(--a-border)]">
        {rows.map((p) => {
          const href = `/admin/products/${p.id}`;
          const price =
            p.minPricePaise === null
              ? "—"
              : p.minPricePaise === p.maxPricePaise
                ? formatPaise(p.minPricePaise)
                : `${formatPaise(p.minPricePaise)} – ${formatPaise(p.maxPricePaise!)}`;

          return (
            <li
              key={p.id}
              onClick={() => router.push(href)}
              className="px-5 py-4 flex items-center gap-4 sm:gap-5 cursor-pointer hover:bg-[var(--a-hover)] transition-colors"
            >
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={() => toggle(p.id)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select ${p.title}`}
              />
              <div
                className="w-11 shrink-0 rounded-md overflow-hidden"
                style={{ aspectRatio: "3/4.3", background: "rgba(35,47,72,.08)" }}
              >
                {p.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt="" className="w-full h-full object-cover" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <Link
                  href={href}
                  onClick={(e) => e.stopPropagation()}
                  className="font-semibold text-[14px] hover:underline"
                >
                  {p.title}
                </Link>
                <div className="mt-0.5 text-[12.5px] opacity-60 truncate">
                  {[p.productType, `/${p.handle}`, p.variantCount > 1 && `${p.variantCount} variants`]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>

              <div className="hidden sm:block w-24">
                <Pill tone={STATUS_TONE[p.status] ?? "quiet"}>{sentence(p.status)}</Pill>
              </div>

              <div className="font-semibold text-[14px] w-28 text-right tabular-nums">{price}</div>

              <div
                className="text-[13px] w-24 text-right"
                style={{ color: p.stock <= lowStock ? "var(--spice)" : undefined }}
              >
                {p.stock === 0 ? "Sold out" : `${p.stock} in stock`}
              </div>

              <span aria-hidden className="hidden sm:block opacity-40">
                ›
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
