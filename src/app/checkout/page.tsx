import type { Metadata } from "next";
import CheckoutSummary from "./CheckoutSummary";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

export const metadata: Metadata = { title: "Checkout - Aalmaram" };

/**
 * Phase 2 leaves this as a basket review. Phase 3 adds the contact and address
 * form, `POST /api/checkout`, the Razorpay modal and `/order/confirmed`.
 *
 * Every figure shown here is display-only; the server re-prices the whole cart
 * from the database before a payment is ever created.
 */
export default function CheckoutPage() {
  return (
    <>
      <Header />
      <main className="max-w-[820px] mx-auto px-6 md:px-10 pt-16 md:pt-24 pb-24">
        <div className="text-[11px] tracking-[.34em] font-body font-light opacity-70">CHECKOUT</div>
        <h1
          className="mt-6 font-display font-black display-tight text-night"
          style={{ fontSize: "clamp(30px, 4vw, 46px)" }}
        >
          Your basket.
        </h1>
        <CheckoutSummary />
      </main>
      <Footer />
    </>
  );
}
