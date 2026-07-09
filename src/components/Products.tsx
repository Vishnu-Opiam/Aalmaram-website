"use client";

import BookCover from "./BookCover";
import { useCart } from "@/context/CartContext";

export default function Products() {
  const { buyNow, isCheckingOut } = useCart();

  return (
    <section id="products" className="relative">
      <div className="max-w-[1480px] mx-auto px-6 md:px-14 py-24 md:py-32">
        <div className="grid md:grid-cols-12 gap-10 items-end mb-16 reveal">
          <div className="md:col-span-7">
            <div className="text-[11px] tracking-[.34em] font-body font-light opacity-70">01 · WHAT WE MAKE</div>
            <h2 className="mt-6 font-display font-black display-tight" style={{ fontSize: "clamp(34px, 4.6vw, 58px)" }}>
              Books and objects, <span className="font-display italic font-medium" style={{ color: "var(--kathakali)" }}>made slowly.</span>
            </h2>
          </div>
          <div className="md:col-span-5 md:pl-10 font-body font-light leading-loose text-[15.5px] opacity-90">
            One book out in the world, and more on the way, each one rooted in Kerala&apos;s history and
            made to be held, shared, and passed on.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          {/* Card 1 — Live: Nandu in Muziris */}
          <article className="product-card is-live reveal">
            <div className="product-tag font-body font-light" style={{ color: "var(--kathakali)" }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--kathakali)" }} />
              AVAILABLE NOW
            </div>

            <div className="product-book my-8">
              <BookCover />
            </div>

            <h3 className="font-display font-black text-[26px] leading-tight text-night">Nandu in Muziris</h3>
            <p className="mt-3 font-body font-light leading-relaxed text-[14px] opacity-85" style={{ color: "#2a3855" }}>
              A beautifully illustrated children&apos;s book about a young crow searching for home in the
              ancient port of Muziris, rooted in Kerala&apos;s history, culture, and memory.
            </p>

            <div className="mt-auto pt-8 flex flex-wrap items-end justify-between gap-x-4 gap-y-5">
              <div className="flex items-baseline gap-3">
                <span className="font-display text-[28px] text-night">₹700</span>
                <span className="font-body font-light text-[15px] line-through opacity-50">₹1,400</span>
              </div>
              <button
                onClick={buyNow}
                disabled={isCheckingOut}
                className="btn-night px-8 py-3.5 text-[12px] tracking-[.24em] font-body font-normal shrink-0"
              >
                {isCheckingOut ? "Placing order…" : "Order now"}
              </button>
            </div>
          </article>

          {/* Card 2 — Coming soon: A new book */}
          <article className="product-card is-soon reveal">
            <div className="product-tag font-body font-light opacity-60" style={{ color: "var(--night)" }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "rgba(35,47,72,.4)" }} />
              COMING SOON
            </div>

            <div className="flex-1 grid place-items-center my-8 min-h-[240px]">
              <div className="font-display italic text-[64px] md:text-[80px] opacity-15" style={{ color: "var(--night)" }}>
                02
              </div>
            </div>

            <h3 className="font-display font-black text-[26px] leading-tight text-night opacity-80">A new book</h3>
            <p className="mt-3 font-body font-light leading-relaxed text-[14px] opacity-60" style={{ color: "#2a3855" }}>
              The next volume is in the making. Join us and we&apos;ll share more soon.
            </p>
          </article>

          {/* Card 3 — Coming soon: A memory card game */}
          <article className="product-card is-soon reveal">
            <div className="product-tag font-body font-light opacity-60" style={{ color: "var(--night)" }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "rgba(35,47,72,.4)" }} />
              COMING SOON
            </div>

            <div className="flex-1 grid place-items-center my-8 min-h-[240px]">
              <div className="font-display italic text-[64px] md:text-[80px] opacity-15" style={{ color: "var(--night)" }}>
                03
              </div>
            </div>

            <h3 className="font-display font-black text-[26px] leading-tight text-night opacity-80">A memory card game</h3>
            <p className="mt-3 font-body font-light leading-relaxed text-[14px] opacity-60" style={{ color: "#2a3855" }}>
              A memory game drawn from the same world. Pictures coming soon.
            </p>
          </article>
        </div>
      </div>

      <div className="h-px mx-6 md:mx-14" style={{ background: "linear-gradient(to right, transparent, rgba(35,47,72,.18), transparent)" }} />
    </section>
  );
}
