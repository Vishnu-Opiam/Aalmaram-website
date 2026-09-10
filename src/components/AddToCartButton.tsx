"use client";

import { useCart } from "@/context/CartContext";
import type { StorefrontProduct } from "@/lib/commerce-types";

export default function AddToCartButton({
  product,
  variantId,
  className = "btn-night px-10 py-4 text-[12.5px] tracking-[.26em] font-body font-normal",
  label = "Add to basket",
}: {
  product: StorefrontProduct;
  variantId?: string;
  className?: string;
  label?: string;
}) {
  const { addVariant, openCart } = useCart();
  const variant = variantId
    ? product.variants.find((v) => v.id === variantId)
    : product.variants[0];
  const soldOut = !variant || variant.inventoryQuantity <= 0;

  return (
    <button
      type="button"
      disabled={soldOut}
      onClick={() => {
        addVariant(product, variantId);
        openCart();
      }}
      className={className}
    >
      {soldOut ? "Sold out" : label}
    </button>
  );
}
