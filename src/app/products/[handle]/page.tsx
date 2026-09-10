import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AddToCartButton from "@/components/AddToCartButton";
import CartDrawer from "@/components/CartDrawer";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import Markdown from "@/components/Markdown";
import Toast from "@/components/Toast";
import { formatPaise, getProductByHandle, getShippingSettings } from "@/lib/commerce";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const product = await getProductByHandle(handle);
  if (!product) return { title: "Not found - Aalmaram" };

  return {
    title: product.seoTitle ?? `${product.title} - Aalmaram`,
    description: product.seoDescription ?? product.subtitle,
  };
}

export default async function ProductPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const [product, shipping] = await Promise.all([getProductByHandle(handle), getShippingSettings()]);

  // RLS returns nothing for a draft or archived product, so this covers both
  // "no such handle" and "not published" without a status check here.
  if (!product) notFound();

  const variant = product.variants[0];
  const inStock = Boolean(variant && variant.inventoryQuantity > 0);
  const saving =
    variant?.compareAtPaise && variant.compareAtPaise > variant.pricePaise
      ? variant.compareAtPaise - variant.pricePaise
      : null;

  return (
    <>
      <Header />
      <main className="max-w-[1480px] mx-auto px-6 md:px-14 pt-12 md:pt-20 pb-24 md:pb-32">
        <nav className="text-[11px] tracking-[.26em] font-body font-light opacity-65">
          <Link href="/shop" className="qlink">
            SHOP
          </Link>
          <span className="mx-3">·</span>
          <span>{product.title.toUpperCase()}</span>
        </nav>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-16">
          <div className="md:col-span-6 space-y-5">
            {(product.images.length > 0
              ? product.images
              : [{ url: "/books/Cover.png", alt: product.title }]
            ).map((image, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={image.url}
                alt={image.alt || product.title}
                className="w-full object-cover rounded-sm"
                style={{ boxShadow: "0 30px 60px -30px rgba(35,47,72,.4)" }}
              />
            ))}
          </div>

          <div className="md:col-span-6 md:pt-6">
            {product.subtitle && (
              <div className="text-[10.5px] tracking-[.3em] font-body font-light opacity-65">
                {product.subtitle.toUpperCase()}
              </div>
            )}
            <h1
              className="mt-4 font-display font-black display-tight text-night"
              style={{ fontSize: "clamp(32px, 4vw, 52px)" }}
            >
              {product.title}
            </h1>

            <div className="mt-8 flex items-baseline gap-4">
              <span className="font-display text-[34px] text-night">
                {variant ? formatPaise(variant.pricePaise) : "—"}
              </span>
              {variant?.compareAtPaise ? (
                <span className="font-body font-light text-[17px] line-through opacity-50">
                  {formatPaise(variant.compareAtPaise)}
                </span>
              ) : null}
              {saving ? (
                <span
                  className="text-[11px] tracking-[.22em] font-body"
                  style={{ color: "var(--kathakali)" }}
                >
                  SAVE {formatPaise(saving)}
                </span>
              ) : null}
            </div>

            <Markdown
              source={product.descriptionMd}
              className="mt-8 font-body font-light leading-loose text-[15.5px] max-w-[52ch]"
            />

            <div className="mt-10 flex flex-wrap items-center gap-6">
              <AddToCartButton product={product} />
              {inStock && variant && variant.inventoryQuantity <= 5 && (
                <span className="text-[12px] font-body font-light" style={{ color: "var(--spice)" }}>
                  Only {variant.inventoryQuantity} left
                </span>
              )}
            </div>

            <dl className="mt-12 grid grid-cols-2 gap-y-6 gap-x-8 text-[13px] font-body font-light">
              <div>
                <dt className="text-[10px] tracking-[.26em] opacity-65">SHIPPING</dt>
                <dd className="mt-1.5">
                  {shipping.freeThresholdPaise > 0
                    ? `Free over ${formatPaise(shipping.freeThresholdPaise)}, otherwise ${formatPaise(shipping.flatRatePaise)}`
                    : formatPaise(shipping.flatRatePaise)}
                </dd>
              </div>
              {variant?.sku && (
                <div>
                  <dt className="text-[10px] tracking-[.26em] opacity-65">SKU</dt>
                  <dd className="mt-1.5">{variant.sku}</dd>
                </div>
              )}
              {product.tags.length > 0 && (
                <div className="col-span-2">
                  <dt className="text-[10px] tracking-[.26em] opacity-65">TAGS</dt>
                  <dd className="mt-1.5">{product.tags.join(" · ")}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </main>
      <Footer />
      <CartDrawer />
      <Toast />
    </>
  );
}
