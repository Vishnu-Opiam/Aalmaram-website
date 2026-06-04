"use client";

import { useMemo, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import type { CartItem } from "@/context/CartContext";
import { useCart } from "@/context/CartContext";

interface Buyer {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  pincode: string;
}

const UPI_VPA = process.env.NEXT_PUBLIC_UPI_VPA || "";
const UPI_NAME = process.env.NEXT_PUBLIC_UPI_NAME || "Aalmaram";
const QR_IMAGE = "/QrCode.jpeg";

function fmt(n: number) {
  return "₹ " + n.toLocaleString("en-IN");
}

export default function CheckoutPay({
  buyer,
  items,
  subtotal,
  onBack,
}: {
  buyer: Buyer;
  items: CartItem[];
  subtotal: number;
  onBack: () => void;
}) {
  const orderId = useMemo(
    () => "AAL-" + Date.now().toString(36).toUpperCase(),
    []
  );
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { clearCart } = useCart();

  const upiLink = UPI_VPA
    ? `upi://pay?pa=${encodeURIComponent(UPI_VPA)}&pn=${encodeURIComponent(
        UPI_NAME
      )}&am=${subtotal}&tn=${encodeURIComponent(orderId)}&cu=INR`
    : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!screenshot) {
      setError("Please attach a screenshot of your payment.");
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      const fd = new FormData();
      fd.append("orderId", orderId);
      fd.append("buyer", JSON.stringify(buyer));
      fd.append(
        "items",
        JSON.stringify(items.map((i) => ({ id: i.id, title: i.title, qty: i.qty, price: i.price })))
      );
      fd.append("subtotal", String(subtotal));
      fd.append("screenshot", screenshot);

      const res = await fetch("/api/order", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setDone(true);
      clearCart();
    } catch (err) {
      console.error(err);
      setError("Couldn't send the order. Please try once more, or email hello@aalmaram.com.");
    } finally {
      setSubmitting(false);
    }
  }

  // animated spinner → tick overlay
  function CheckoutAnim({ done }: { done: boolean }) {
    return (
      <div className="relative" style={{ width: 96, height: 96 }}>
        <style>{`
          @keyframes aal-spin { to { transform: rotate(360deg); } }
          @keyframes aal-draw { to { stroke-dashoffset: 0; } }
          @keyframes aal-pop { 0% { transform: scale(.6); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
          .aal-spinner { animation: aal-spin 1s linear infinite; transform-origin: 50% 50%; }
          .aal-ring { stroke-dasharray: 180; stroke-dashoffset: 60; }
          .aal-tick-circle { stroke-dasharray: 200; stroke-dashoffset: 200; animation: aal-draw .55s ease-out forwards; }
          .aal-tick-check { stroke-dasharray: 50; stroke-dashoffset: 50; animation: aal-draw .35s .45s ease-out forwards; }
          .aal-tick-wrap { animation: aal-pop .5s ease-out both; }
        `}</style>
        {!done && (
          <svg className="aal-spinner" viewBox="0 0 64 64" width="96" height="96" aria-hidden>
            <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(35,47,72,.12)" strokeWidth="4" />
            <circle
              className="aal-ring"
              cx="32"
              cy="32"
              r="28"
              fill="none"
              stroke="var(--burnt, #e07030)"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
        )}
        {done && (
          <svg className="aal-tick-wrap" viewBox="0 0 64 64" width="96" height="96" aria-hidden>
            <circle
              className="aal-tick-circle"
              cx="32"
              cy="32"
              r="28"
              fill="none"
              stroke="var(--burnt, #e07030)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              className="aal-tick-check"
              d="M20 33 L29 42 L45 24"
              fill="none"
              stroke="var(--burnt, #e07030)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    );
  }

  if (submitting || done) {
    return (
      <>
        <Header />
        <main className="max-w-[720px] mx-auto px-6 md:px-14 pt-24 pb-24 text-center min-h-[60vh] flex flex-col items-center justify-center">
          <CheckoutAnim done={done} />

          <div className="mt-10 text-[10.5px] tracking-[.28em] font-body font-light opacity-65">
            ORDER {orderId}
          </div>
          <h1
            className="mt-3 font-display font-black display-tight text-[40px] md:text-[56px] transition-opacity duration-500"
            style={{ color: "var(--night)" }}
          >
            {done ? "Order confirmed" : "Confirming your order…"}
          </h1>
          {done ? (
            <p className="mt-5 font-body font-light text-[16px] leading-loose opacity-85 max-w-[44ch] mx-auto">
              We have your details and your payment screenshot. Once we verify the
              transfer (usually within the day) we&rsquo;ll write to{" "}
              <span className="italic">{buyer.email}</span> with dispatch details.
            </p>
          ) : (
            <p className="mt-5 font-body font-light text-[14.5px] leading-loose opacity-70 max-w-[40ch] mx-auto">
              Sending your details &amp; screenshot. This takes a moment.
            </p>
          )}
          {done && (
            <a href="/" className="inline-block mt-10 btn-night px-8 py-3 text-[11px] tracking-[.28em]">
              BACK TO THE BOOK
            </a>
          )}
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="max-w-[980px] mx-auto px-6 md:px-14 pt-10 md:pt-14 pb-24">
        <button
          onClick={onBack}
          className="text-[11px] tracking-[.28em] font-body font-light opacity-70 qlink"
        >
          ← BACK TO DETAILS
        </button>
        <div className="mt-6 text-[10.5px] tracking-[.28em] font-body font-light opacity-65">
          AALMARAM · PAY · {orderId}
        </div>
        <h1
          className="mt-3 font-display font-black display-tight text-[40px] md:text-[56px]"
          style={{ color: "var(--night)" }}
        >
          Pay <span className="font-display italic">{fmt(subtotal)}</span> by UPI
        </h1>
        <div
          className="mt-6 h-px"
          style={{ background: "linear-gradient(to right, transparent, rgba(224,112,48,.5), transparent)" }}
        />

        <div className="mt-10 grid md:grid-cols-2 gap-12">
          <section>
            <div className="text-[10.5px] tracking-[.28em] opacity-65">STEP ONE</div>
            <h2 className="mt-2 font-display italic text-[24px]">Scan &amp; pay</h2>
            <p className="mt-4 font-body font-light text-[14.5px] leading-loose opacity-85">
              Save this QR, open it in any UPI app (GPay, PhonePe, Paytm, BHIM),
              scan, and pay{" "}
              <strong className="font-display not-italic">{fmt(subtotal)}</strong>.
              Add <span className="italic">{orderId}</span> as the note.
            </p>

            <div className="mt-6 p-4 bg-white inline-block" style={{ border: "1px solid rgba(35,47,72,.15)" }}>
              <img
                src={QR_IMAGE}
                alt="UPI QR code"
                className="block w-[320px] sm:w-[420px] h-auto"
                style={{ objectFit: "contain" }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.opacity = "0.2";
                }}
              />
            </div>

            {UPI_VPA && (
              <div className="mt-5 font-body text-[13px] opacity-80">
                UPI ID: <span className="font-display italic">{UPI_VPA}</span>
              </div>
            )}
            {upiLink && (
              <a
                href={upiLink}
                className="mt-3 inline-block md:hidden text-[11px] tracking-[.28em] qlink"
              >
                OPEN UPI APP →
              </a>
            )}
          </section>

          <section>
            <div className="text-[10.5px] tracking-[.28em] opacity-65">STEP TWO</div>
            <h2 className="mt-2 font-display italic text-[24px]">Send us a screenshot</h2>
            <p className="mt-4 font-body font-light text-[14.5px] leading-loose opacity-85">
              After paying, attach a screenshot of the success page from your
              UPI app. We&rsquo;ll match it against the transfer and confirm
              your order.
            </p>

            <form onSubmit={submit} className="mt-6 space-y-6">
              <div>
                <span className="text-[10.5px] tracking-[.28em] font-body font-light opacity-65 uppercase">
                  Payment screenshot
                </span>
                <div className="mt-3">
                  <label
                    htmlFor="screenshot-input"
                    className="btn-night inline-block cursor-pointer px-7 py-3 text-[11px] tracking-[.28em]"
                  >
                    {screenshot ? "REPLACE SCREENSHOT" : "UPLOAD SCREENSHOT"}
                  </label>
                  <input
                    id="screenshot-input"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)}
                    className="sr-only"
                    required
                  />
                </div>
                {screenshot && (
                  <div className="mt-3 text-[12px] opacity-70 font-body">
                    {screenshot.name} · {(screenshot.size / 1024).toFixed(0)} KB
                  </div>
                )}
              </div>

              {error && (
                <div className="text-[13px]" style={{ color: "#b3422a" }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !screenshot}
                className="btn-night w-full py-4 text-[12px] tracking-[.28em] disabled:opacity-40"
              >
                {submitting ? "SENDING…" : "I'VE PAID · SEND ORDER"}
              </button>

              <p className="text-[11.5px] font-body font-light opacity-65 leading-relaxed">
                By submitting you confirm the payment was made for the amount
                shown. We&rsquo;ll only dispatch once the transfer is visible
                in our account.
              </p>
            </form>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

