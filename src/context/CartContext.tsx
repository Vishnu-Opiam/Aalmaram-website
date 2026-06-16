"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { getFirstProduct, createCheckout } from "@/lib/shopify";

const STORAGE_KEY = "aalmaram_cart_v1";

export interface CartItem {
  id: string;
  title: string;
  subtitle: string;
  price: number;
  compareAt: number;
  qty: number;
  image: string;
}

interface CartContextType {
  items: CartItem[];
  isOpen: boolean;
  toastVisible: boolean;
  isCheckingOut: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: () => void;
  changeQty: (index: number, delta: number) => void;
  removeItem: (index: number) => void;
  dismissToast: () => void;
  checkout: () => void;
  buyNow: () => void;
  clearCart: () => void;
  totalCount: number;
  subtotal: number;
  productPrice: number;
  productImage: string;
}

const DEFAULT_PRODUCT: CartItem = {
  id: "nandu-01",
  title: "Nandu in Muziris",
  subtitle: "First edition · Numbered",
  price: 700,
  compareAt: 1400,
  qty: 1,
  image: "/books/Cover.png",
};

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastTimer, setToastTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [productTemplate, setProductTemplate] = useState<CartItem>(DEFAULT_PRODUCT);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, [items, hydrated]);

  useEffect(() => {
    getFirstProduct().then((prod) => {
      if (prod && prod.variants.edges[0]) {
        const variant = prod.variants.edges[0].node;
        // Handle both Admin API (string) and Storefront API (object with amount)
        const getPrice = (p: any) => parseFloat(typeof p === 'string' ? p : p?.amount || "0");
        
        const shopifyCompareAt = getPrice(variant.price);
        const shopifyImage = "/books/Cover.png";

        setProductTemplate({
          id: variant.id,
          title: prod.title,
          subtitle: "First edition · Numbered",
          price: 700,
          compareAt: shopifyCompareAt || 1400,
          qty: 1,
          image: shopifyImage,
        });

        // Update items if they were added before the fetch
        setItems(prev => prev.map(it => {
          if (it.id === "nandu-01") {
            return { ...it, id: variant.id, price: 700, compareAt: shopifyCompareAt || 1400, title: prod.title, image: shopifyImage };
          }
          return it;
        }));
      }
    }).catch(console.error);
  }, []);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);
  const dismissToast = useCallback(() => setToastVisible(false), []);

  const addItem = useCallback(() => {
    setItems((prev) => {
      const existing = prev.find((it) => it.id === productTemplate.id);
      if (existing) {
        return prev.map((it) => (it.id === productTemplate.id ? { ...it, qty: it.qty + 1 } : it));
      }
      return [...prev, { ...productTemplate }];
    });
    setToastVisible(true);
    if (toastTimer) clearTimeout(toastTimer);
    const t = setTimeout(() => setToastVisible(false), 2600);
    setToastTimer(t);
  }, [toastTimer, productTemplate]);

  const changeQty = useCallback((index: number, delta: number) => {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, qty: Math.max(1, it.qty + delta) } : it))
    );
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Create a Shopify draft order for the given line items and send the buyer to
  // Shopify's hosted checkout, where address + payment (Razorpay) are handled.
  const startCheckout = useCallback(
    async (lineItems: { variantId: string; quantity: number }[]) => {
      const valid = lineItems.filter((li) => li.quantity > 0);
      if (valid.length === 0) return;
      setIsCheckingOut(true);
      try {
        const url = await createCheckout(valid);
        window.location.href = url;
      } catch (err) {
        console.error("Checkout failed:", err);
        setIsCheckingOut(false);
        alert("Sorry — we couldn't reach secure checkout just now. Please try again in a moment.");
      }
    },
    []
  );

  const checkout = useCallback(() => {
    startCheckout(items.map((it) => ({ variantId: it.id, quantity: it.qty })));
  }, [items, startCheckout]);

  const buyNow = useCallback(() => {
    // Reflect the added copy in the cart, then check out the whole basket.
    const merged = new Map<string, number>();
    for (const it of items) merged.set(it.id, (merged.get(it.id) ?? 0) + it.qty);
    merged.set(productTemplate.id, (merged.get(productTemplate.id) ?? 0) + 1);

    setItems((prev) => {
      const existing = prev.find((it) => it.id === productTemplate.id);
      if (existing) {
        return prev.map((it) => (it.id === productTemplate.id ? { ...it, qty: it.qty + 1 } : it));
      }
      return [...prev, { ...productTemplate }];
    });

    startCheckout([...merged.entries()].map(([variantId, quantity]) => ({ variantId, quantity })));
  }, [items, productTemplate, startCheckout]);

  const clearCart = useCallback(() => setItems([]), []);

  const totalCount = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <CartContext.Provider
      value={{ items, isOpen, toastVisible, isCheckingOut, openCart, closeCart, addItem, changeQty, removeItem, dismissToast, checkout, buyNow, clearCart, totalCount, subtotal, productPrice: productTemplate.price, productImage: productTemplate.image }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
