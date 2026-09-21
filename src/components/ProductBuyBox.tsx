"use client";

import { useState } from "react";
import AddToCartButton from "@/components/AddToCartButton";
import type { StorefrontProduct } from "@/lib/commerce-types";
import { formatPaise } from "@/lib/format";

/**
 * Price, variant choice and the basket button on a product page. With one
 * variant it is just the price and the button; with several, the buyer picks,
 * and the price and stock follow the pick.
 */
export default function ProductBuyBox({ product }: { product: StorefrontProduct }) {
  const firstAvailable = product.variants.find((v) => v.inventoryQuantity > 0) ?? product.variants[0];
  const [variantId, setVariantId] = useState(firstAvailable?.id);
  const variant = product.variants.find((v) => v.id === variantId) ?? firstAvailable;
  const saving =
    variant?.compareAtPaise && variant.compareAtPaise > variant.pricePaise
      ? variant.compareAtPaise - variant.pricePaise
      : null;
  const inStock = Boolean(variant && variant.inventoryQuantity > 0);

  return (
    <>
      <div className="mt-8 flex items-baseline gap-4">
        <span className="font-display text-[34px] text-night">
          {variant ? formatPaise(variant.pricePaise) : "—"}
        </span>
        {saving ? (
          <>
            <span className="font-body font-light text-[17px] line-through opacity-50">
              {formatPaise(variant!.compareAtPaise!)}
            </span>
            <span className="text-[11px] tracking-[.22em] font-body" style={{ color: "var(--kathakali)" }}>
              SAVE {formatPaise(saving)}
            </span>
          </>
        ) : null}
      </div>

      {product.variants.length > 1 && (
        <fieldset className="mt-8">
          <legend className="text-[10px] tracking-[.26em] font-body opacity-65">CHOOSE</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {product.variants.map((v) => {
              const selected = v.id === variant?.id;
              const soldOut = v.inventoryQuantity <= 0;
              return (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setVariantId(v.id)}
                  className="px-4 py-2 text-[13px] font-body rounded-sm border transition-colors"
                  style={{
                    borderColor: selected ? "var(--night)" : "rgba(35,47,72,.25)",
                    background: selected ? "var(--night)" : "transparent",
                    color: selected ? "var(--ivory)" : "var(--night)",
                    textDecoration: soldOut ? "line-through" : undefined,
                    opacity: soldOut && !selected ? 0.55 : 1,
                  }}
                >
                  {v.title}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="mt-10 flex flex-wrap items-center gap-6">
        <AddToCartButton product={product} variantId={variant?.id} />
        {inStock && variant && variant.inventoryQuantity <= 5 && (
          <span className="text-[12px] font-body font-light" style={{ color: "var(--spice)" }}>
            Only {variant.inventoryQuantity} left
          </span>
        )}
      </div>
    </>
  );
}
