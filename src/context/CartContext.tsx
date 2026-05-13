"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { getFirstProduct, createCheckout } from "@/lib/shopify";

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
  totalCount: number;
  subtotal: number;
  productPrice: number;
  productImage: string;
}

const DEFAULT_PRODUCT: CartItem = {
  id: "nandu-01",
  title: "Nandu in Muziris",
  subtitle: "First edition · Signed · Numbered",
  price: 1480,
  compareAt: 1650,
  qty: 1,
  image: "/books/Cover.png",
};

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastTimer, setToastTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [productTemplate, setProductTemplate] = useState<CartItem>(DEFAULT_PRODUCT);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  useEffect(() => {
    getFirstProduct().then((prod) => {
      if (prod && prod.variants.edges[0]) {
        const variant = prod.variants.edges[0].node;
        // Handle both Admin API (string) and Storefront API (object with amount)
        const getPrice = (p: any) => parseFloat(typeof p === 'string' ? p : p?.amount || "0");
        
        const shopifyPrice = getPrice(variant.price);
        const shopifyCompareAt = variant.compareAtPrice ? getPrice(variant.compareAtPrice) : shopifyPrice;
        const shopifyImage = "/books/Cover.png";
        
        setProductTemplate({
          id: variant.id,
          title: prod.title,
          subtitle: "First edition · Signed · Numbered",
          price: shopifyPrice,
          compareAt: shopifyCompareAt,
          qty: 1,
          image: shopifyImage,
        });

        // Update items if they were added before the fetch
        setItems(prev => prev.map(it => {
          if (it.id === "nandu-01") {
            return { ...it, id: variant.id, price: shopifyPrice, compareAt: shopifyCompareAt, title: prod.title, image: shopifyImage };
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

  const checkout = useCallback(async () => {
    if (items.length === 0) return;
    setIsCheckingOut(true);
    try {
      const checkoutUrl = await createCheckout(items[0].id, items[0].qty);
      window.location.href = checkoutUrl;
    } catch (e) {
      console.error(e);
      setIsCheckingOut(false);
    }
  }, [items]);

  const totalCount = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <CartContext.Provider
      value={{ items, isOpen, toastVisible, isCheckingOut, openCart, closeCart, addItem, changeQty, removeItem, dismissToast, checkout, totalCount, subtotal, productPrice: productTemplate.price, productImage: productTemplate.image }}
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
