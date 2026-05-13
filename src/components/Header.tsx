"use client";

import { useCart } from "@/context/CartContext";

export default function Header() {
  const { openCart, totalCount } = useCart();

  return (
    <header className="relative z-20">
      <div className="max-w-[1480px] mx-auto px-6 md:px-14">
        <div className="grid grid-cols-3 items-center py-7">
          <nav className="flex items-center gap-8 text-[12px] tracking-[.2em] font-body font-light">
            <a href="#story" className="qlink">The story</a>
            <a href="#craft" className="qlink hidden md:inline">The craft</a>
            <a href="#voices" className="qlink hidden md:inline">Voices</a>
          </nav>

          <a
            href="#top"
            className="font-display text-3xl md:text-4xl font-black text-night text-center display-tight tracking-tight"
          >
            Aalmaram
          </a>

          <div className="flex items-center justify-end gap-7 text-[12px] tracking-[.2em] font-body font-light">
            <a href="#" className="qlink hidden md:inline">Malayalam</a>
            <button onClick={openCart} className="flex items-center gap-2 qlink">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L21 8H6" />
                <circle cx="10" cy="20" r="1.2" />
                <circle cx="18" cy="20" r="1.2" />
              </svg>
              <span>Cart <span className="font-display italic">{String(totalCount).padStart(2, "0")}</span></span>
            </button>
          </div>
        </div>
      </div>
      <div
        className="h-px w-full"
        style={{ background: "linear-gradient(to right, transparent, rgba(224,112,48,.55) 18%, rgba(224,112,48,.55) 82%, transparent)" }}
      />
    </header>
  );
}
