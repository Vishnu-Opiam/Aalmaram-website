import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CartDrawer from "@/components/CartDrawer";
import Toast from "@/components/Toast";
import { formatPaise, listActiveProducts } from "@/lib/commerce";

export const metadata: Metadata = {
  title: "Shop - Aalmaram",
  description: "Books and objects from Aalmaram, made slowly in Kerala.",
};

export default async function ShopPage() {
  const products = await listActiveProducts();

  return (
    <>
      <Header />
      <main className="max-w-[1480px] mx-auto px-6 md:px-14 pt-16 md:pt-24 pb-24 md:pb-32">
        <div className="text-[11px] tracking-[.34em] font-body font-light opacity-70">THE SHOP</div>
        <h1
          className="mt-6 font-display font-black display-tight text-night"
          style={{ fontSize: "clamp(34px, 4.6vw, 58px)" }}
        >
          Everything we{" "}
          <span className="font-display italic font-medium" style={{ color: "var(--kathakali)" }}>
            make
          </span>
          .
        </h1>

        {products.length === 0 ? (
          <p className="mt-16 font-body font-light text-[15px] opacity-70">
            Nothing is on sale just now. Do come back.
          </p>
        ) : (
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            {products.map((product) => {
              const variant = product.variants[0];
              const soldOut = !variant || variant.inventoryQuantity <= 0;

              return (
                <article key={product.id} className="product-card is-live">
                  <div
                    className="product-tag font-body font-light"
                    style={{ color: soldOut ? "var(--night)" : "var(--kathakali)" }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: soldOut ? "rgba(35,47,72,.4)" : "var(--kathakali)" }}
                    />
                    {soldOut ? "SOLD OUT" : "AVAILABLE NOW"}
                  </div>

                  <Link href={`/products/${product.handle}`} className="block my-8">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={product.images[0]?.url ?? "/books/Cover.png"}
                      alt={product.images[0]?.alt ?? product.title}
                      className="w-full aspect-[3/4] object-cover rounded-sm"
                    />
                  </Link>

                  <h2 className="font-display font-black text-[26px] leading-tight text-night">
                    <Link href={`/products/${product.handle}`} className="qlink">
                      {product.title}
                    </Link>
                  </h2>
                  {product.subtitle && (
                    <div className="mt-2 text-[10.5px] tracking-[.26em] font-body font-light opacity-65">
                      {product.subtitle.toUpperCase()}
                    </div>
                  )}

                  <div className="mt-auto pt-8 flex flex-wrap items-end justify-between gap-x-4 gap-y-5">
                    <div className="flex items-baseline gap-3">
                      <span className="font-display text-[28px] text-night">
                        {variant ? formatPaise(variant.pricePaise) : "—"}
                      </span>
                      {variant?.compareAtPaise ? (
                        <span className="font-body font-light text-[15px] line-through opacity-50">
                          {formatPaise(variant.compareAtPaise)}
                        </span>
                      ) : null}
                    </div>
                    <Link
                      href={`/products/${product.handle}`}
                      className="btn-night px-8 py-3.5 text-[12px] tracking-[.24em] font-body font-normal shrink-0"
                    >
                      Look closer
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
      <CartDrawer />
      <Toast />
    </>
  );
}
