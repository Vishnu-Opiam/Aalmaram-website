"use client";

import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useCart } from "@/context/CartContext";
import CheckoutPay from "@/components/CheckoutPay";

interface Buyer {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  pincode: string;
}

const empty: Buyer = { name: "", phone: "", email: "", address: "", city: "", pincode: "" };

function fmt(n: number) {
  return "₹ " + n.toLocaleString("en-IN");
}

export default function CheckoutPage() {
  const { items, subtotal } = useCart();
  const [buyer, setBuyer] = useState<Buyer>(empty);
  const [step, setStep] = useState<"details" | "pay">("details");

  const update = (k: keyof Buyer) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setBuyer((b) => ({ ...b, [k]: e.target.value }));

  const canContinue =
    buyer.name.trim() &&
    buyer.phone.trim().length >= 10 &&
    /.+@.+\..+/.test(buyer.email) &&
    buyer.address.trim() &&
    buyer.city.trim() &&
    buyer.pincode.trim().length >= 6;

  if (items.length === 0) {
    return (
      <>
        <Header />
        <main className="max-w-[720px] mx-auto px-6 md:px-14 pt-16 pb-24 text-center">
          <h1 className="font-display font-black display-tight text-[44px] md:text-[56px]" style={{ color: "var(--night)" }}>
            Your basket is empty
          </h1>
          <p className="mt-5 font-body font-light opacity-75">
            Add a copy to begin checkout.
          </p>
          <a href="/" className="inline-block mt-8 btn-night px-8 py-3 text-[11px] tracking-[.28em]">
            BACK TO THE BOOK
          </a>
        </main>
        <Footer />
      </>
    );
  }

  if (step === "pay") {
    return <CheckoutPay buyer={buyer} items={items} subtotal={subtotal} onBack={() => setStep("details")} />;
  }

  return (
    <>
      <Header />
      <main className="max-w-[980px] mx-auto px-6 md:px-14 pt-10 md:pt-14 pb-24">
        <div className="text-[10.5px] tracking-[.28em] font-body font-light opacity-65">
          AALMARAM · CHECKOUT
        </div>
        <h1
          className="mt-3 font-display font-black display-tight text-[40px] md:text-[56px]"
          style={{ color: "var(--night)" }}
        >
          Where shall we send it?
        </h1>
        <div
          className="mt-6 h-px"
          style={{ background: "linear-gradient(to right, transparent, rgba(224,112,48,.5), transparent)" }}
        />

        <div className="mt-10 grid md:grid-cols-[1fr_360px] gap-12">
          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (canContinue) setStep("pay");
            }}
          >
            <Field label="Full name" value={buyer.name} onChange={update("name")} autoComplete="name" />
            <div className="grid sm:grid-cols-2 gap-6">
              <Field label="Phone" value={buyer.phone} onChange={update("phone")} type="tel" autoComplete="tel" inputMode="tel" />
              <Field label="Email" value={buyer.email} onChange={update("email")} type="email" autoComplete="email" />
            </div>
            <Field
              label="Address"
              value={buyer.address}
              onChange={update("address")}
              autoComplete="street-address"
              textarea
            />
            <div className="grid sm:grid-cols-2 gap-6">
              <Field label="City" value={buyer.city} onChange={update("city")} autoComplete="address-level2" />
              <Field
                label="Pincode"
                value={buyer.pincode}
                onChange={update("pincode")}
                autoComplete="postal-code"
                inputMode="numeric"
              />
            </div>

            <button
              type="submit"
              disabled={!canContinue}
              className="btn-night px-10 py-4 text-[12px] tracking-[.28em] disabled:opacity-40"
            >
              CONTINUE TO PAYMENT
            </button>
          </form>

          <aside className="font-body">
            <div className="text-[10.5px] tracking-[.28em] opacity-65">YOUR ORDER</div>
            <div className="mt-5 space-y-5">
              {items.map((it, i) => (
                <div key={it.id + i} className="flex gap-4 items-start">
                  <img
                    src={it.image}
                    alt={it.title}
                    className="w-14 rounded-sm"
                    style={{ aspectRatio: "3/4.3", objectFit: "cover" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-display italic text-[16px] leading-tight">{it.title}</div>
                    <div className="mt-1 text-[10.5px] tracking-[.26em] opacity-65">QTY {it.qty}</div>
                  </div>
                  <div className="font-display text-[15px] whitespace-nowrap">{fmt(it.price * it.qty)}</div>
                </div>
              ))}
            </div>
            <div className="mt-6 h-px" style={{ background: "rgba(35,47,72,.18)" }} />
            <div className="mt-5 flex items-baseline justify-between">
              <span className="text-[11px] tracking-[.28em] opacity-70">SUBTOTAL</span>
              <span className="font-display text-[22px]">{fmt(subtotal)}</span>
            </div>
            <div className="mt-2 text-[11px] tracking-[.22em] opacity-60">
              Shipping calculated at handover
            </div>
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}

function Field({
  label,
  textarea,
  ...rest
}: {
  label: string;
  textarea?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement> & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const cls =
    "w-full bg-transparent border-b border-[rgba(35,47,72,.25)] focus:border-[rgba(224,112,48,.7)] outline-none font-body text-[15.5px] py-2 transition-colors";
  return (
    <label className="block">
      <span className="text-[10.5px] tracking-[.28em] font-body font-light opacity-65 uppercase">
        {label}
      </span>
      {textarea ? (
        <textarea
          {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
          rows={3}
          className={cls + " resize-none"}
          required
        />
      ) : (
        <input {...(rest as React.InputHTMLAttributes<HTMLInputElement>)} className={cls} required />
      )}
    </label>
  );
}
