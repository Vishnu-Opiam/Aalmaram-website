import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { createAdminClient } from "@/lib/supabase/admin";
import OrderSummary, { ORDER_SUMMARY_SELECT } from "../../OrderSummary";

export const metadata: Metadata = {
  title: "Your order - Aalmaram",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SHIPMENT_WORDS: Record<string, string> = {
  pending: "Being packed",
  awb_assigned: "Packed, waiting for the courier",
  pickup_scheduled: "Courier pickup booked",
  in_transit: "On its way",
  delivered: "Delivered",
  rto: "Returning to us",
  cancelled: "Shipment cancelled",
};

/**
 * The page behind "View your order" in the confirmation email. The token is a
 * random uuid stored on the order, so the link opens exactly one order and
 * can't be guessed from an order number.
 */
export default async function OrderViewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!UUID.test(token)) notFound();

  const db = createAdminClient();
  const { data: order } = await db
    .from("orders")
    .select(
      `${ORDER_SUMMARY_SELECT}, fulfillment_status, order_status, shipments ( status, courier_name, awb_code, tracking_url, created_at )`
    )
    .eq("view_token", token)
    .maybeSingle();

  if (!order) notFound();

  const address = (order.shipping_address ?? {}) as Record<string, string>;
  const shipment = [...(order.shipments ?? [])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  )[0];
  const status =
    order.order_status === "cancelled"
      ? "Cancelled"
      : shipment
        ? (SHIPMENT_WORDS[shipment.status] ?? "Being prepared")
        : "Confirmed, being prepared";

  return (
    <>
      <Header />
      <main className="max-w-[720px] mx-auto px-6 md:px-10 pt-16 md:pt-24 pb-24">
        <div className="text-[11px] tracking-[.34em] font-body font-light opacity-70">
          ORDER {order.order_number}
          {order.placed_at &&
            ` · ${new Date(order.placed_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })}`}
        </div>
        <h1
          className="mt-6 font-display font-black display-tight text-night"
          style={{ fontSize: "clamp(30px, 4vw, 46px)" }}
        >
          Nanni,{" "}
          <span className="font-display italic font-medium" style={{ color: "var(--kathakali)" }}>
            {address.name?.split(" ")[0] || "friend"}
          </span>
          .
        </h1>

        <div
          className="mt-8 p-5 rounded-sm font-body text-[14.5px]"
          style={{ background: "rgba(35,47,72,.05)" }}
        >
          <div className="text-[10px] tracking-[.26em] opacity-65">STATUS</div>
          <div className="mt-1.5 text-[17px]">{status}</div>
          {shipment?.awb_code && (
            <div className="mt-2 font-light opacity-80">
              {shipment.courier_name ? `${shipment.courier_name} · ` : ""}AWB {shipment.awb_code}
              {shipment.tracking_url && (
                <>
                  {" · "}
                  <a href={shipment.tracking_url} target="_blank" rel="noreferrer" className="qlink">
                    Track parcel
                  </a>
                </>
              )}
            </div>
          )}
        </div>

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
