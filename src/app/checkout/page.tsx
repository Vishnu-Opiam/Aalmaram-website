import type { Metadata } from "next";
import CheckoutForm from "./CheckoutForm";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

export const metadata: Metadata = { title: "Checkout - Aalmaram" };

/**
 * Contact, address, and payment.
 *
 * Every figure the page shows comes from `POST /api/checkout/quote` — the
 * browser adds nothing up. The same pricing code runs again when the Razorpay
 * order is created, so what is displayed and what is charged cannot drift.
 */
export default function CheckoutPage() {
  return (
    <>
      <Header />
      <main className="max-w-[1120px] mx-auto px-6 md:px-10 pt-16 md:pt-24 pb-24">
        <div className="text-[11px] tracking-[.34em] font-body font-light opacity-70">CHECKOUT</div>
        <h1
          className="mt-6 font-display font-black display-tight text-night"
          style={{ fontSize: "clamp(30px, 4vw, 46px)" }}
        >
          Checkout.
        </h1>
        <CheckoutForm />
      </main>
      <Footer />
    </>
  );
}
