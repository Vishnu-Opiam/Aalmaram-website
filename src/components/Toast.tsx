"use client";

import { useCart } from "@/context/CartContext";

export default function Toast() {
  const { toastVisible, openCart, dismissToast } = useCart();

  return (
    <div
      className="fixed bottom-8 left-1/2 z-[60] transition-all duration-500"
      style={{
        background: "var(--night)",
        color: "var(--ivory)",
        opacity: toastVisible ? 1 : 0,
        transform: toastVisible ? "translate(-50%, -8px)" : "translate(-50%, 0)",
        pointerEvents: toastVisible ? "auto" : "none",
      }}
    >
      <div className="px-7 py-4 flex items-center gap-5">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <div className="font-display italic text-[16px]">Added — Nandu in Muziris</div>
        <button
          onClick={() => { openCart(); dismissToast(); }}
          className="ml-4 text-[11px] tracking-[.26em] qlink"
          style={{ color: "var(--gold)" }}
        >
          VIEW BASKET →
        </button>
      </div>
    </div>
  );
}
