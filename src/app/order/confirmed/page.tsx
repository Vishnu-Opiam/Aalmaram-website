import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import ClearCart from "./ClearCart";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { formatPaise } from "@/lib/format";
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
      "order_number, email, subtotal_paise, discount_paise, shipping_paise, total_paise, discount_code, shipping_address, placed_at, order_items ( title, variant_title, quantity, total_paise )"
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

        <ul
          className="mt-12 divide-y"
          style={{ borderTop: "1px solid rgba(35,47,72,.12)", borderColor: "rgba(35,47,72,.12)" }}
        >
          {order.order_items.map((item, i) => (
            <li key={i} className="py-5 flex justify-between gap-6">
              <div>
                <div className="font-display italic text-[18px]">{item.title}</div>
                <div className="mt-1 text-[11.5px] tracking-[.2em] font-body font-light opacity-60">
                  {item.variant_title.toUpperCase()} · ×{item.quantity}
                </div>
              </div>
              <div className="font-display text-[18px] whitespace-nowrap">
                {formatPaise(item.total_paise)}
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-8 space-y-3 text-[14px] font-body">
          <Row label="Subtotal" value={formatPaise(order.subtotal_paise)} />
          {order.discount_paise > 0 && (
            <Row
              label={`Discount${order.discount_code ? ` (${order.discount_code})` : ""}`}
              value={`− ${formatPaise(order.discount_paise)}`}
            />
          )}
          <Row
            label="Shipping"
            value={order.shipping_paise === 0 ? "Free" : formatPaise(order.shipping_paise)}
          />
          <div
            className="flex items-baseline justify-between pt-4"
            style={{ borderTop: "1px solid rgba(35,47,72,.15)" }}
          >
            <span className="text-[11px] tracking-[.28em] opacity-70">TOTAL PAID</span>
            <span className="font-display text-[26px]">{formatPaise(order.total_paise)}</span>
          </div>
        </div>

        <div className="mt-12">
          <div className="text-[10px] tracking-[.26em] font-body opacity-65">SHIPPING TO</div>
          <p className="mt-2 font-body font-light text-[14.5px] leading-relaxed">
            {[
              address.name,
              address.line1,
              address.line2,
              [address.city, address.state].filter(Boolean).join(", "),
              address.pincode,
            ]
              .filter(Boolean)
              .map((line, i) => (
                <span key={i}>
                  {line}
                  <br />
                </span>
              ))}
          </p>
        </div>

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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="font-light opacity-75">{label}</span>
      <span>{value}</span>
    </div>
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
