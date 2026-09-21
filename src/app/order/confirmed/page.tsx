import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import ClearCart from "./ClearCart";
import OrderSummary, { ORDER_SUMMARY_SELECT } from "../OrderSummary";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Order confirmed - Aalmaram" };
export const dynamic = "force-dynamic";

/**
 * The order is found from an httpOnly cookie set by /api/checkout/confirm, not
 * from the URL. Order numbers run in sequence, so anything keyed on one alone
 * would let a stranger read somebody else's order by counting.
 */
export default async function OrderConfirmedPage() {
  const orderId = (await cookies()).get("aalmaram_order")?.value;

  if (!orderId) return <Fallback />;

  const db = createAdminClient();
  const { data: order } = await db
    .from("orders")
    .select(
      ORDER_SUMMARY_SELECT
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return <Fallback />;

  const address = (order.shipping_address ?? {}) as Record<string, string>;

  return (
    <>
      <Header />
      <ClearCart />
      <main className="max-w-[720px] mx-auto px-6 md:px-10 pt-16 md:pt-24 pb-24">
        <div className="text-[11px] tracking-[.34em] font-body font-light opacity-70">
          ORDER {order.order_number}
        </div>
        <h1
          className="mt-6 font-display font-black display-tight text-night"
          style={{ fontSize: "clamp(30px, 4vw, 46px)" }}
        >
          Thank you,{" "}
          <span className="font-display italic font-medium" style={{ color: "var(--kathakali)" }}>
            {address.name?.split(" ")[0] || "friend"}
          </span>
          .
        </h1>
        <p className="mt-6 font-body font-light text-[16px] leading-loose max-w-[46ch]">
          Your order is paid and confirmed. A receipt is on its way to{" "}
          <strong className="font-normal">{order.email}</strong>, and we&rsquo;ll write again the
          moment it ships, with a tracking link.
        </p>

        <OrderSummary order={order} />

        <Link
          href="/shop"
          className="mt-14 inline-block btn-night px-9 py-4 text-[12px] tracking-[.26em] font-body font-normal"
        >
          Back to the shop
        </Link>
      </main>
      <Footer />
    </>
  );
}

function Fallback() {
  return (
    <>
      <Header />
      <main className="max-w-[620px] mx-auto px-6 md:px-10 pt-24 pb-32">
        <h1 className="font-display font-black text-[34px] display-tight text-night">
          Thank you.
        </h1>
        <p className="mt-6 font-body font-light text-[16px] leading-loose">
          If you&rsquo;ve just paid, your order is confirmed and a receipt is on its way by email.
          This page can only show the details for a short while after checkout — do check your inbox,
          and write to us if anything looks wrong.
        </p>
        <Link
          href="/shop"
          className="mt-10 inline-block btn-night px-9 py-4 text-[12px] tracking-[.26em] font-body"
        >
          Back to the shop
        </Link>
      </main>
      <Footer />
    </>
  );
}
