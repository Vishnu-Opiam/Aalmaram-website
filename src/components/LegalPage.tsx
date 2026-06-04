"use client";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CartDrawer from "@/components/CartDrawer";
import Toast from "@/components/Toast";

export default function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main className="max-w-[880px] mx-auto px-6 md:px-14 pt-10 md:pt-16 pb-24">
        <div className="text-[10.5px] tracking-[.28em] font-body font-light opacity-65">
          AALMARAM · LEGAL
        </div>
        <h1
          className="mt-3 font-display font-black display-tight text-[44px] md:text-[64px]"
          style={{ color: "var(--night)" }}
        >
          {title}
        </h1>
        <div className="mt-3 font-display italic text-[15px] opacity-75">
          Last updated: {updated}
        </div>
        <div
          className="mt-8 h-px"
          style={{
            background:
              "linear-gradient(to right, transparent, rgba(224,112,48,.5), transparent)",
          }}
        />

        <article className="legal-prose mt-10 font-body font-light text-[15.5px] leading-loose opacity-90">
          {children}
        </article>
      </main>
      <Footer />
      <CartDrawer />
      <Toast />
    </>
  );
}
