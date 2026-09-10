"use client";

import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { formatPaise } from "@/lib/format";

export default function CheckoutSummary() {
  const { items, subtotalPaise, changeQty, removeItem } = useCart();

  if (items.length === 0) {
    return (
      <div className="mt-12">
        <p className="font-display italic text-[22px] opacity-80">Nothing here yet.</p>
        <Link
          href="/shop"
          className="mt-8 inline-block btn-night px-8 py-3.5 text-[12px] tracking-[.24em] font-body"
        >
          Back to the shop
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-12">
      <ul className="divide-y" style={{ borderColor: "rgba(35,47,72,.12)" }}>
        {items.map((it, idx) => (
          <li key={it.variantId} className="py-6 flex gap-5 items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={it.image}
              alt={it.title}
              className="w-16 rounded-sm object-cover"
              style={{ aspectRatio: "3/4.3" }}
            />
            <div className="flex-1 min-w-0">
              <div className="font-display italic text-[18px] leading-tight">{it.title}</div>
              <div className="mt-1 text-[10.5px] tracking-[.26em] font-body font-light opacity-65">
                {it.subtitle}
              </div>
              <div className="mt-4 flex items-center gap-3">
                <div className="qty flex items-center gap-2">
                  <button aria-label="decrease" onClick={() => changeQty(idx, -1)}>
                    −
                  </button>
                  <div className="w-7 text-center font-display text-[15px]">{it.qty}</div>
                  <button aria-label="increase" onClick={() => changeQty(idx, 1)}>
                    +
                  </button>
                </div>
                <button
                  className="ml-4 text-[11px] tracking-[.24em] font-body font-light opacity-70 qlink"
                  onClick={() => removeItem(idx)}
                >
                  REMOVE
                </button>
              </div>
            </div>
            <div className="font-display text-[18px] whitespace-nowrap">
              {formatPaise(it.pricePaise * it.qty)}
            </div>
          </li>
        ))}
      </ul>

      <div
        className="mt-8 pt-6 flex items-baseline justify-between font-body"
        style={{ borderTop: "1px solid rgba(35,47,72,.15)" }}
      >
        <span className="text-[11px] tracking-[.28em] opacity-70">SUBTOTAL</span>
        <span className="font-display text-[26px]">{formatPaise(subtotalPaise)}</span>
      </div>
      <p className="mt-2 text-[12px] font-body font-light opacity-60">
        Shipping is calculated at the next step.
      </p>

      <button
        disabled
        className="btn-night w-full mt-10 py-4 text-[12px] tracking-[.28em] font-body font-normal"
      >
        Payment arrives in the next phase
      </button>
      <p className="mt-3 text-[12px] font-body font-light opacity-60">
        Contact details, address and Razorpay land here in phase 3.
      </p>
    </div>
  );
}
