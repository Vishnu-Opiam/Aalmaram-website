"use client";

import { useEffect } from "react";
import { useCart } from "@/context/CartContext";

function fmt(n: number) {
  return "₹ " + n.toLocaleString("en-IN");
}

export default function CartDrawer() {
  const { items, isOpen, closeCart, addItem, changeQty, removeItem, subtotal, checkout, isCheckingOut } = useCart();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCart();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeCart]);

  return (
    <>
      {/* Scrim */}
      <div
        className={`scrim fixed inset-0 z-40 ${isOpen ? "is-open" : ""}`}
        style={{ background: "rgba(35,47,72,.42)" }}
        onClick={closeCart}
      />

      {/* Drawer */}
      <aside
        className={`drawer-transform fixed top-0 right-0 bottom-0 z-50 w-[min(440px,92vw)] paper flex flex-col ${isOpen ? "is-open" : ""}`}
        style={{ boxShadow: "-40px 0 80px -30px rgba(35,47,72,.35)" }}
      >
        <div className="flex items-center justify-between px-7 py-6">
          <div>
            <div className="font-display text-[22px] leading-none">Your basket</div>
            <div className="mt-1 text-[10.5px] tracking-[.28em] font-body font-light opacity-70">WRAPPED IN KHADI · SHIPS IN 48H</div>
          </div>
          <button onClick={closeCart} className="text-[12px] tracking-[.24em] qlink">CLOSE</button>
        </div>
        <div className="h-px mx-7" style={{ background: "linear-gradient(to right, transparent, rgba(224,112,48,.55), transparent)" }} />

        <div className="flex-1 overflow-auto no-bar px-7 py-8 space-y-7">
          {items.length === 0 ? (
            <div className="text-center py-16">
              <div className="font-display italic text-[22px] opacity-80">Your basket waits, quietly.</div>
              <p className="mt-3 text-[13px] font-body font-light opacity-70 max-w-[28ch] mx-auto leading-relaxed">
                When you are ready, add a copy and it will rest here until you decide.
              </p>
              <button onClick={addItem} className="mt-8 btn-night px-7 py-3 text-[11px] tracking-[.28em]">
                Add the book
              </button>
            </div>
          ) : (
            items.map((it, idx) => (
              <article key={it.id + idx} className="flex gap-5">
                <div
                  className="shrink-0 rounded-sm overflow-hidden"
                  style={{
                    aspectRatio: "3/4.3",
                    width: 64,
                    background: "linear-gradient(160deg,#2a3853,#0f1828)",
                    boxShadow: "inset 1px 0 0 rgba(238,224,191,.12)",
                  }}
                >
                  <img src={it.image} alt={it.title} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-display italic text-[17px] leading-tight">{it.title}</div>
                  <div className="mt-1 text-[10.5px] tracking-[.26em] font-body font-light opacity-65">{it.subtitle}</div>
                  <div className="mt-4 flex items-center gap-3">
                    <div className="qty flex items-center gap-2">
                      <button aria-label="decrease" onClick={() => changeQty(idx, -1)}>−</button>
                      <div className="w-7 text-center font-display text-[15px]">{it.qty}</div>
                      <button aria-label="increase" onClick={() => changeQty(idx, 1)}>+</button>
                    </div>
                    <button
                      className="ml-auto text-[11px] tracking-[.24em] font-body font-light opacity-70 qlink"
                      onClick={() => removeItem(idx)}
                    >
                      REMOVE
                    </button>
                  </div>
                </div>
                <div className="font-display text-[17px] whitespace-nowrap">{fmt(it.price * it.qty)}</div>
              </article>
            ))
          )}
        </div>

        <div className="px-7 pb-8 pt-4 space-y-5" style={{ borderTop: "1px solid rgba(35,47,72,.15)" }}>
          <div className="flex items-baseline justify-between font-body">
            <span className="text-[11px] tracking-[.28em] opacity-70">SUBTOTAL</span>
            <span className="font-display text-[24px]">{fmt(subtotal)}</span>
          </div>

          <button 
            className="btn-night w-full py-4 text-[12px] tracking-[.28em]"
            onClick={checkout}
            disabled={isCheckingOut}
          >
            {isCheckingOut ? "Connecting to Shopify..." : "Checkout · secure payment"}
          </button>
          <button onClick={closeCart} className="w-full py-2 text-[11px] tracking-[.28em] font-body font-light opacity-80 qlink">
            Continue browsing
          </button>
        </div>
      </aside>
    </>
  );
}
