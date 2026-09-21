"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { StorefrontProduct } from "@/lib/commerce-types";

// v2: v1 carts held Shopify variant GIDs, which mean nothing now. Bumping the
// key drops them rather than carrying dead ids into checkout.
const STORAGE_KEY = "aalmaram_cart_v2";
const DISCOUNT_STORAGE_KEY = "aalmaram_discount_v1";

export interface CartItem {
  /** Supabase product_variants.id — the only id checkout will accept. */
  variantId: string;
  productId: string;
  handle: string;
  title: string;
  subtitle: string;
  /** Integer paise, matching the database. Never rupees, never a float. */
  pricePaise: number;
  compareAtPaise: number | null;
  qty: number;
  image: string;
}

interface CartContextType {
  items: CartItem[];
  isOpen: boolean;
  toastVisible: boolean;
  isCheckingOut: boolean;
  hasProduct: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: () => void;
  addVariant: (product: StorefrontProduct, variantId?: string) => void;
  changeQty: (index: number, delta: number) => void;
  removeItem: (index: number) => void;
  dismissToast: () => void;
  checkout: () => void;
  buyNow: () => void;
  clearCart: () => void;
  totalCount: number;
  /** Integer paise. */
  subtotalPaise: number;
  productPricePaise: number;
  productCompareAtPaise: number | null;
  productImage: string;
  productTitle: string;
}

const CartContext = createContext<CartContextType | null>(null);

function toCartItem(product: StorefrontProduct, variantId?: string): CartItem | null {
  const variant = variantId
    ? product.variants.find((v) => v.id === variantId)
    : product.variants[0];
  if (!variant) return null;

  return {
    variantId: variant.id,
    productId: product.id,
    handle: product.handle,
    title: product.title,
    // With more than one variant, the variant is what tells two lines apart.
    subtitle: product.variants.length > 1 ? variant.title : product.subtitle,
    pricePaise: variant.pricePaise,
    compareAtPaise: variant.compareAtPaise,
    qty: 1,
    image: product.images[0]?.url ?? "/books/Cover.png",
  };
}

export function CartProvider({
  product,
  children,
}: {
  /** The featured product, read from Supabase on the server. */
  product: StorefrontProduct | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastTimer, setToastTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const template = useMemo(() => (product ? toCartItem(product) : null), [product]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // localStorage is not readable during SSR, so hydrating here is the
      // only option; the cascade is one render on mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setItems(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);

  // A marketing link like aalmaram.com/?discount=NAGMA15 stashes the code here so
  // it survives browsing and gets applied automatically whenever checkout starts.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("discount");
      if (code) {
        localStorage.setItem(DISCOUNT_STORAGE_KEY, code);
        params.delete("discount");
        const rest = params.toString();
        window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, [items, hydrated]);

  // Prices live in the database, not in the basket. If a price changed while a
  // cart sat in localStorage, correct it on load — and checkout re-prices from
  // the database anyway, so this only keeps the displayed figure honest.
  useEffect(() => {
    if (!hydrated || !product) return;
    // Reconciling a stored cart against server prices is exactly what this
    // effect is for; the update is a no-op unless something actually moved.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems((prev) => {
      let changed = false;
      const next = prev.map((it) => {
        const variant = product.variants.find((v) => v.id === it.variantId);
        if (!variant) return it;
        if (variant.pricePaise === it.pricePaise && variant.compareAtPaise === it.compareAtPaise) {
          return it;
        }
        changed = true;
        return {
          ...it,
          pricePaise: variant.pricePaise,
          compareAtPaise: variant.compareAtPaise,
        };
      });
      return changed ? next : prev;
    });
  }, [hydrated, product]);

  // The buyer leaves for /checkout with isCheckingOut set. Coming back via the
  // bfcache would otherwise leave the button stuck on "Placing order…".
  useEffect(() => {
    const reset = () => setIsCheckingOut(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);
  const dismissToast = useCallback(() => setToastVisible(false), []);

  const flashToast = useCallback(() => {
    setToastVisible(true);
    if (toastTimer) clearTimeout(toastTimer);
    setToastTimer(setTimeout(() => setToastVisible(false), 2600));
  }, [toastTimer]);

  const push = useCallback((entry: CartItem) => {
    setItems((prev) => {
      const existing = prev.find((it) => it.variantId === entry.variantId);
      if (existing) {
        return prev.map((it) =>
          it.variantId === entry.variantId ? { ...it, qty: it.qty + 1 } : it
        );
      }
      return [...prev, entry];
    });
  }, []);

  /** Adds the featured product — what the homepage buttons call. */
  const addItem = useCallback(() => {
    if (!template) return;
    push(template);
    flashToast();
  }, [template, push, flashToast]);

  /** Adds a specific product/variant — what the shop and PDP call. */
  const addVariant = useCallback(
    (p: StorefrontProduct, variantId?: string) => {
      const entry = toCartItem(p, variantId);
      if (!entry) return;
      push(entry);
      flashToast();
    },
    [push, flashToast]
  );

  const changeQty = useCallback((index: number, delta: number) => {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, qty: Math.max(1, it.qty + delta) } : it))
    );
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const checkout = useCallback(() => {
    if (items.length === 0) return;
    setIsCheckingOut(true);
    setIsOpen(false);
    router.push("/checkout");
  }, [items.length, router]);

  const buyNow = useCallback(() => {
    if (!template) return;
    push(template);
    setIsCheckingOut(true);
    router.push("/checkout");
  }, [template, push, router]);

  const clearCart = useCallback(() => setItems([]), []);

  const totalCount = items.reduce((s, i) => s + i.qty, 0);
  const subtotalPaise = items.reduce((s, i) => s + i.pricePaise * i.qty, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        isOpen,
        toastVisible,
        isCheckingOut,
        hasProduct: Boolean(template),
        openCart,
        closeCart,
        addItem,
        addVariant,
        changeQty,
        removeItem,
        dismissToast,
        checkout,
        buyNow,
        clearCart,
        totalCount,
        subtotalPaise,
        productPricePaise: template?.pricePaise ?? 0,
        productCompareAtPaise: template?.compareAtPaise ?? null,
        productImage: template?.image ?? "/books/Cover.png",
        productTitle: template?.title ?? "",
      }}
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
