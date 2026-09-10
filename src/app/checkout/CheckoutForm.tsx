"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "@/context/CartContext";
import { formatPaise } from "@/lib/format";

const DISCOUNT_STORAGE_KEY = "aalmaram_discount_v1";

interface Quote {
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  totalPaise: number;
  discountCode: string | null;
  discountMessage: string | null;
}

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name: string; email: string; contact: string };
  theme: { color: string };
  handler: (response: RazorpayResponse) => void;
  modal: { ondismiss: () => void };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

const input = "preorder-input font-body text-[15px] w-full";
const label = "text-[10px] tracking-[.24em] font-body opacity-70";

export default function CheckoutForm() {
  const router = useRouter();
  const { items, clearCart } = useCart();

  const [discountCode, setDiscountCode] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const lines = useMemo(
    () => items.map((it) => ({ variantId: it.variantId, quantity: it.qty })),
    [items]
  );

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DISCOUNT_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setDiscountCode(stored);
    } catch {}
  }, []);

  /** The server prices the basket; nothing here is added up in the browser. */
  const refreshQuote = useCallback(
    async (code: string | null) => {
      if (lines.length === 0) return;
      setQuoting(true);
      try {
        const response = await fetch("/api/checkout/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines, discountCode: code }),
        });
        const data = await response.json();
        if (!response.ok) {
          setError(data.error ?? "Could not price your basket.");
          setQuote(null);
        } else {
          setError("");
          setQuote(data);
        }
      } catch {
        setError("Could not reach the server.");
      } finally {
        setQuoting(false);
      }
    },
    [lines]
  );

  useEffect(() => {
    // Fetching the server's price on mount is the point of this effect; the
    // pending flag it sets is what the button reads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshQuote(discountCode || null);
    // Re-quoting on every keystroke of the code would be noisy; the code is
    // applied explicitly with the Apply button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshQuote]);

  const pay = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const form = new FormData(event.currentTarget);
    const payload = {
      lines,
      discountCode: discountCode || null,
      email: String(form.get("email") ?? ""),
      address: {
        name: String(form.get("name") ?? ""),
        phone: String(form.get("phone") ?? ""),
        line1: String(form.get("line1") ?? ""),
        line2: String(form.get("line2") ?? ""),
        city: String(form.get("city") ?? ""),
        state: String(form.get("state") ?? ""),
        pincode: String(form.get("pincode") ?? ""),
        country: "India",
      },
    };

    setPaying(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not start checkout.");
        setPaying(false);
        return;
      }

      if (!window.Razorpay) {
        setError("The payment window could not load. Please refresh and try again.");
        setPaying(false);
        return;
      }

      const razorpay = new window.Razorpay({
        key: data.keyId,
        amount: data.amountPaise,
        currency: "INR",
        name: "Aalmaram",
        description: "Books & objects from Kerala",
        order_id: data.razorpayOrderId,
        prefill: {
          name: payload.address.name,
          email: payload.email,
          contact: payload.address.phone,
        },
        theme: { color: "#232f48" },
        handler: async (result) => {
          try {
            const confirmation = await fetch("/api/checkout/confirm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                checkoutId: data.checkoutId,
                razorpayOrderId: result.razorpay_order_id,
                razorpayPaymentId: result.razorpay_payment_id,
                razorpaySignature: result.razorpay_signature,
              }),
            });
            const confirmed = await confirmation.json();

            if (!confirmation.ok) {
              // A paid customer must never be told the payment failed.
              setError(confirmed.error ?? "Something went wrong after payment.");
              setPaying(false);
              return;
            }

            clearCart();
            try {
              localStorage.removeItem(DISCOUNT_STORAGE_KEY);
            } catch {}
            router.push("/order/confirmed");
          } catch {
            setError(
              "Your payment went through, but we couldn't confirm it here. We'll email you shortly."
            );
            setPaying(false);
          }
        },
        modal: {
          ondismiss: () => {
            setPaying(false);
          },
        },
      });

      razorpay.open();
    } catch {
      setError("Could not reach the payment provider.");
      setPaying(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="mt-12">
        <p className="font-display italic text-[22px] opacity-80">Nothing here yet.</p>
        <a
          href="/shop"
          className="mt-8 inline-block btn-night px-8 py-3.5 text-[12px] tracking-[.24em] font-body"
        >
          Back to the shop
        </a>
      </div>
    );
  }

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        onLoad={() => setScriptReady(true)}
      />

      <form ref={formRef} onSubmit={pay} className="mt-12 grid md:grid-cols-12 gap-12">
        <div className="md:col-span-7 space-y-8">
          <section>
            <h2 className="font-display italic text-[21px]" style={{ color: "var(--night)" }}>
              Where shall we write?
            </h2>
            <div className="mt-5 grid gap-5">
              <label className="block">
                <span className={label}>EMAIL *</span>
                <input name="email" type="email" required autoComplete="email" className={input} />
              </label>
            </div>
          </section>

          <section>
            <h2 className="font-display italic text-[21px]" style={{ color: "var(--night)" }}>
              Where shall we send it?
            </h2>
            <div className="mt-5 grid md:grid-cols-2 gap-5">
              <label className="block md:col-span-2">
                <span className={label}>FULL NAME *</span>
                <input name="name" required autoComplete="name" className={input} />
              </label>
              <label className="block md:col-span-2">
                <span className={label}>PHONE *</span>
                <input name="phone" required autoComplete="tel" inputMode="tel" className={input} />
              </label>
              <label className="block md:col-span-2">
                <span className={label}>ADDRESS *</span>
                <input name="line1" required autoComplete="address-line1" className={input} />
              </label>
              <label className="block md:col-span-2">
                <span className={label}>APARTMENT, LANDMARK</span>
                <input name="line2" autoComplete="address-line2" className={input} />
              </label>
              <label className="block">
                <span className={label}>CITY *</span>
                <input name="city" required autoComplete="address-level2" className={input} />
              </label>
              <label className="block">
                <span className={label}>STATE *</span>
                <input name="state" required autoComplete="address-level1" className={input} />
              </label>
              <label className="block">
                <span className={label}>PIN CODE *</span>
                <input
                  name="pincode"
                  required
                  inputMode="numeric"
                  autoComplete="postal-code"
                  className={input}
                />
              </label>
            </div>
          </section>
        </div>

        <aside className="md:col-span-5">
          <div className="p-7 rounded-lg" style={{ background: "rgba(35,47,72,.04)" }}>
            <h2 className="font-display italic text-[21px]" style={{ color: "var(--night)" }}>
              Your order
            </h2>

            <ul className="mt-6 space-y-4">
              {items.map((it) => (
                <li key={it.variantId} className="flex justify-between gap-4 text-[14px] font-body">
                  <span className="font-light">
                    {it.title}
                    <span className="opacity-60"> × {it.qty}</span>
                  </span>
                  <span className="font-display text-[15px] whitespace-nowrap">
                    {formatPaise(it.pricePaise * it.qty)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-7 flex gap-3">
              <input
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                placeholder="Discount code"
                className="preorder-input font-body text-[14px] flex-1"
              />
              <button
                type="button"
                onClick={() => refreshQuote(discountCode || null)}
                className="qlink text-[11.5px] tracking-[.2em] font-body font-light shrink-0"
              >
                APPLY
              </button>
            </div>
            {quote?.discountMessage && (
              <p className="mt-2 text-[12px] font-body" style={{ color: "var(--spice)" }}>
                {quote.discountMessage}
              </p>
            )}

            <div
              className="mt-7 pt-6 space-y-3 text-[13.5px] font-body"
              style={{ borderTop: "1px solid rgba(35,47,72,.15)" }}
            >
              <Line label="Subtotal" value={quote ? formatPaise(quote.subtotalPaise) : "…"} />
              {quote && quote.discountPaise > 0 && (
                <Line
                  label={`Discount${quote.discountCode ? ` (${quote.discountCode})` : ""}`}
                  value={`− ${formatPaise(quote.discountPaise)}`}
                />
              )}
              <Line
                label="Shipping"
                value={
                  quote ? (quote.shippingPaise === 0 ? "Free" : formatPaise(quote.shippingPaise)) : "…"
                }
              />
              <div className="flex items-baseline justify-between pt-3">
                <span className="text-[11px] tracking-[.28em] opacity-70">TOTAL</span>
                <span className="font-display text-[26px]">
                  {quote ? formatPaise(quote.totalPaise) : "…"}
                </span>
              </div>
            </div>

            {error && (
              <p
                className="mt-5 text-[13px] font-body p-3 rounded"
                style={{ color: "var(--spice)", background: "rgba(164,66,44,.08)" }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={paying || quoting || !quote || !scriptReady}
              className="btn-night w-full mt-7 py-4 text-[12px] tracking-[.28em] font-body font-normal"
            >
              {paying ? "Opening payment…" : scriptReady ? "Pay securely" : "Loading payment…"}
            </button>

            <p className="mt-3 text-[11.5px] font-body font-light opacity-60 leading-relaxed">
              Paid securely through Razorpay — UPI, card, netbanking or wallet. We never see your
              card details.
            </p>
          </div>
        </aside>
      </form>
    </>
  );
}

function Line({ label: text, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="font-light opacity-75">{text}</span>
      <span>{value}</span>
    </div>
  );
}
