"use client";

import { useEffect, useState } from "react";
import { useCart } from "@/context/CartContext";

export default function StickyBar() {
  const { addItem, productPrice, productImage } = useCart();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const hero = document.getElementById("hero");
      if (hero) {
        setShow(hero.getBoundingClientRect().bottom < 60);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`stickybar fixed top-0 left-0 right-0 z-40 ${show ? "is-show" : ""}`}
      style={{ background: "var(--night)", color: "var(--ivory)" }}
    >
      <div className="max-w-[1480px] mx-auto px-6 md:px-14 py-3 flex items-center gap-6">
        <div className="hidden md:flex items-center gap-4 min-w-0">
          <div
            className="w-9 h-12 rounded-sm shrink-0 overflow-hidden"
            style={{ background: "linear-gradient(160deg,#2a3853,#0f1828)", boxShadow: "inset 1px 0 0 rgba(238,224,191,.12)" }}
          >
            <img src={productImage} alt="Thumbnail" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <div className="font-display italic text-[15px] truncate">Nandu in Muziris</div>
            <div className="text-[11px] tracking-[.22em] opacity-75 font-body">First edition · Signed</div>
          </div>
        </div>
        <div className="hidden sm:flex items-baseline gap-2 ml-auto font-body">
          <span className="font-display text-xl">₹ {productPrice.toLocaleString("en-IN")}</span>
          <span className="text-[11px] tracking-[.2em] opacity-60 line-through">₹ 1,650</span>
        </div>
        <button
          onClick={addItem}
          className="ml-auto sm:ml-0 px-6 py-2.5 text-[12px] tracking-[.22em] font-body"
          style={{ background: "var(--ivory)", color: "var(--night)" }}
        >
          Add to cart
        </button>
      </div>
    </div>
  );
}
