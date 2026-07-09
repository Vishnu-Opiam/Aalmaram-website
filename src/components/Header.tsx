"use client";

import { useCart } from "@/context/CartContext";

export default function Header() {
  const { openCart, totalCount } = useCart();

  return (
    <header className="relative z-20">
      <div className="max-w-[1480px] mx-auto px-6 md:px-14">
        <div className="grid grid-cols-3 items-center py-7">
          <nav className="flex items-center gap-6 lg:gap-8 text-[12px] tracking-[.2em] font-body font-light">
            <a href="#products" className="qlink whitespace-nowrap">Our work</a>
            <a href="#about" className="qlink hidden lg:inline">About</a>
            <a href="#news" className="qlink hidden lg:inline">Journal</a>
            <a href="#collaborate" className="qlink hidden lg:inline whitespace-nowrap">Collaborate</a>
          </nav>

          <a
            href="#top"
            className="flex items-center justify-center gap-3 font-display text-3xl md:text-4xl font-black text-night display-tight tracking-tight"
          >
            <img
              src="/books/Layer 5.png"
              alt="Aalmaram logo"
              className="h-9 w-9 md:h-11 md:w-11 object-contain"
            />
            Aalmaram
          </a>

          <div className="flex items-center justify-end gap-7 text-[12px] tracking-[.2em] font-body font-light">
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
