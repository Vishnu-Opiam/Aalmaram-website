"use client";

import BookCover from "./BookCover";
import { useCart } from "@/context/CartContext";
import { usePreOrder } from "@/context/PreOrderContext";

export default function Hero() {
  const { productPrice, buyNow, isCheckingOut } = useCart();

  return (
    <section className="relative" id="hero">
      <div className="max-w-[1480px] mx-auto px-6 md:px-14 pt-16 md:pt-28 pb-24 md:pb-36">
        <div className="flex items-center gap-5 mb-16 md:mb-24 reveal">
          <span className="h-px w-12" style={{ background: "var(--kathakali)" }} />
          <span className="text-[11px] tracking-[.34em] font-body font-light">The Banyan Collection · Volume 01</span>
          <span className="h-px w-24" style={{ background: "rgba(35,47,72,.25)" }} />
          <span className="ml-auto text-[11px] tracking-[.28em] font-body font-light hidden md:inline">
            Printed in Kochi · Spring monsoon, 2026
          </span>
        </div>

        <div className="grid md:grid-cols-12 gap-14 md:gap-10 items-center">
          <div className="md:col-span-5 flex justify-center md:justify-end reveal">
            <BookCover />
          </div>

          <div className="md:col-span-7 reveal">
            <h1
              className="font-display font-black display-tight text-night"
              style={{ fontSize: "clamp(58px, 8.6vw, 132px)" }}
            >
              Nandu<br />
              <span className="font-display italic font-medium" style={{ color: "var(--spice)" }}>in</span> Muziris
            </h1>

            <div
              className="mt-10 md:mt-14 max-w-[44ch] font-body font-light leading-loose text-[17px] md:text-[18px]"
              style={{ color: "#2a3855" }}
            >
              <p>
                Set in the ancient port of Muziris, Nandu in Muziris follows a young crow named Nandu after a storm destroys his home. As he journeys through a world of traders, travellers, and many cultures, he begins searching not just for a new nest - but for a place to belong.
              </p>
              <p className="mt-4">
                A beautifully illustrated children's book rooted in Kerala's history, culture, and memory.
              </p>
            </div>

            <div className="mt-12 flex flex-wrap items-center gap-6">
              <button
                onClick={buyNow}
                disabled={isCheckingOut}
                className="btn-night px-10 py-4 text-[12.5px] tracking-[.26em] font-body font-normal"
              >
                {isCheckingOut ? "Placing order…" : "Order now"}
              </button>
              <a href="#story" className="qlink text-[12.5px] tracking-[.26em] font-body font-light">
                About Us
              </a>
            </div>

          </div>
        </div>
      </div>

      <div className="h-[1px] kasavu-band mx-6 md:mx-14" />
    </section>
  );
}
