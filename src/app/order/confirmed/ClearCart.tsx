"use client";

import { useEffect } from "react";
import { useCart } from "@/context/CartContext";

/**
 * Empties the basket once the order exists. The checkout flow already clears it
 * on success, but a buyer who lands here from the webhook path or a bfcache
 * restore would otherwise still be carrying what they just bought.
 */
export default function ClearCart() {
  const { items, clearCart } = useCart();

  useEffect(() => {
    if (items.length > 0) clearCart();
  }, [items.length, clearCart]);

  return null;
}
