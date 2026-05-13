"use client";

import { useCart } from "@/context/CartContext";

export default function FinalCTA() {
  const { addItem, productPrice } = useCart();

  return (
    <section id="cta" className="relative">
      <div className="max-w-[1480px] mx-auto px-6 md:px-14 py-28 md:py-44 text-center">
        <div className="reveal">
          <div className="text-[11px] tracking-[.34em] font-body font-light opacity-70">07 · BRING THE STORY HOME</div>

          <h2
            className="mt-10 font-display font-black display-tight"
            style={{ fontSize: "clamp(56px, 9vw, 150px)", color: "var(--night)" }}
          >
            Bring the<br />
            <span className="font-display italic font-medium" style={{ color: "var(--kathakali)" }}>story</span> home.
          </h2>

          <p className="mt-10 max-w-[52ch] mx-auto font-body font-light leading-loose text-[17px]" style={{ color: "#2a3855" }}>
            First edition · Hand-numbered · Wrapped in khadi · Ships within Kerala in 48 hours, and
            anywhere a banyan can imagine.
          </p>

          <div className="mt-14 flex justify-center">
            <button onClick={addItem} className="btn-night px-14 py-5 text-[13px] tracking-[.3em] font-body font-normal">
              Add to cart · ₹ {productPrice.toLocaleString("en-IN")}
            </button>
          </div>


        </div>
      </div>
    </section>
  );
}
