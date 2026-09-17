import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { formatDateTime, formatPaise } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { FinishRefundButton } from "./orders/OrderPanels";
import { FulfilmentPill, Notice, PageTitle, PaymentPill, Pill, SectionTitle } from "./ui";

export const metadata = { title: "Admin - Aalmaram" };

interface PeriodSummary {
  orders: number;
  gross_paise: number;
  refunded_paise: number;
}

/**
 * The day's first look: what came in, what needs sending, what needs a human.
 * "Today" and "this week" are bucketed in Postgres in Indian time (see
 * admin_sales_summary). The full analytics arrive in phase 7.
 */
export default async function AdminHomePage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  await requireAdmin();
  const { denied } = await searchParams;
  const db = createAdminClient();

  const [
    { data: summary },
    { data: toShip, count: toShipCount },
    { data: recent },
    { data: openRefunds },
    { count: failedOutbox },
    { data: inventorySetting },
  ] = await Promise.all([
    db.rpc("admin_sales_summary"),
    db
      .from("orders")
      .select("id, order_number, email, shipping_address, total_paise, placed_at, created_at", { count: "exact" })
      .eq("order_status", "open")
      .eq("fulfillment_status", "unfulfilled")
      .in("payment_status", ["paid", "partially_refunded"])
      .order("placed_at", { ascending: true })
      .limit(8),
    db
      .from("orders")
      .select("id, order_number, shipping_address, total_paise, payment_status, fulfillment_status, placed_at, created_at")
      .order("created_at", { ascending: false })
      .limit(6),
    db
      .from("refunds")
      .select("id, kind, status, amount_paise, error, created_at, order_id, orders ( order_number ), checkouts ( email )")
      .neq("status", "processed")
      .order("created_at", { ascending: false })
      .limit(20),
    db.from("webhook_outbox").select("id", { count: "exact", head: true }).eq("status", "failed"),
    db.from("settings").select("value").eq("key", "inventory").maybeSingle(),
  ]);

  const lowStockThreshold = Number(
    (inventorySetting?.value as { low_stock_threshold?: number } | null)?.low_stock_threshold ?? 5
  );
  const { data: lowStock } = await db
    .from("product_variants")
    .select("id, title, inventory_quantity, products!inner ( id, title, status )")
    .lte("inventory_quantity", lowStockThreshold)
    .neq("products.status", "archived")
    .order("inventory_quantity", { ascending: true })
    .limit(10);

  const periods = (summary ?? {}) as { today?: PeriodSummary; week?: PeriodSummary };
  const attention = needsAttention(openRefunds ?? []);

  return (
    <div>
      <PageTitle>Today</PageTitle>
      {denied === "owner" && (
        <div className="mt-6">
          <Notice error="Settings and the team are for owners. Ask an owner if something there needs changing." />
        </div>
      )}

      {/* ── Figures ──────────────────────────────────────────── */}
      <section className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Figure label="ORDERS TODAY" value={String(periods.today?.orders ?? 0)} />
        <Figure
          label="REVENUE TODAY"
          value={formatPaise((periods.today?.gross_paise ?? 0) - (periods.today?.refunded_paise ?? 0))}
          note={periods.today?.refunded_paise ? `after ${formatPaise(periods.today.refunded_paise)} refunded` : undefined}
        />
        <Figure label="ORDERS THIS WEEK" value={String(periods.week?.orders ?? 0)} note="since Monday" />
        <Figure
          label="REVENUE THIS WEEK"
          value={formatPaise((periods.week?.gross_paise ?? 0) - (periods.week?.refunded_paise ?? 0))}
          note={periods.week?.refunded_paise ? `after ${formatPaise(periods.week.refunded_paise)} refunded` : "since Monday"}
        />
      </section>

      {/* ── Needs a human ────────────────────────────────────── */}
      {(attention.length > 0 || (failedOutbox ?? 0) > 0) && (
        <section className="mt-12 p-6 rounded-lg" style={{ background: "rgba(164,66,44,.06)" }}>
          <SectionTitle>Needs attention</SectionTitle>
          <ul className="mt-5 space-y-5">
            {attention.map((refund) => (
              <li key={refund.id} className="flex flex-wrap items-start justify-between gap-4 text-[13px] font-body">
                <div className="font-light max-w-[640px]">
                  {refund.kind === "out_of_stock" ? (
                    <>
                      <strong className="font-normal">Sold out after payment</strong> —{" "}
                      {formatPaise(refund.amount_paise)} owed back to {refund.checkouts?.email ?? "the buyer"}. No order
                      was created.
                    </>
                  ) : (
                    <>
                      <strong className="font-normal">Refund not finished</strong> — {formatPaise(refund.amount_paise)} on{" "}
                      {refund.order_id ? (
                        <Link href={`/admin/orders/${refund.order_id}`} className="qlink">
                          {refund.orders?.order_number ?? "an order"}
                        </Link>
                      ) : (
                        "an order"
                      )}
                      .
                    </>
                  )}
                  <div className="text-[11.5px] opacity-60">
                    {formatDateTime(refund.created_at)} · {refund.status}
                    {refund.error ? ` · ${refund.error}` : ""}
                  </div>
                </div>
                <FinishRefundButton
                  refundId={refund.id}
                  label={refund.kind === "out_of_stock" ? "Refund now" : "Check with Razorpay"}
                />
              </li>
            ))}
            {(failedOutbox ?? 0) > 0 && (
              <li className="text-[13px] font-body font-light">
                <strong className="font-normal">{failedOutbox} event(s) could not be delivered to n8n</strong> after ten
                tries.{" "}
                <Link href="/admin/settings/integrations?status=failed" className="qlink">
                  See why and retry
                </Link>
                .
              </li>
            )}
          </ul>
        </section>
      )}

      <div className="mt-12 grid lg:grid-cols-12 gap-12">
        {/* ── To send ────────────────────────────────────────── */}
        <section className="lg:col-span-7">
          <SectionTitle hint={toShipCount ? "Oldest first." : undefined}>
            Waiting to be sent{toShipCount ? ` · ${toShipCount}` : ""}
          </SectionTitle>
          {!toShip?.length ? (
            <p className="mt-4 text-[13px] font-body font-light opacity-60">Nothing waiting. Every paid order has gone out.</p>
          ) : (
            <ul className="mt-5 divide-y" style={{ borderColor: "rgba(35,47,72,.1)" }}>
              {toShip.map((order) => (
                <li key={order.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <Link href={`/admin/orders/${order.id}`} className="font-display italic text-[17px] qlink">
                      {order.order_number}
                    </Link>
                    <span className="ml-3 text-[12.5px] font-body font-light opacity-70">
                      {(order.shipping_address as { name?: string })?.name || order.email}
                    </span>
                  </div>
                  <span className="text-[12px] font-body font-light opacity-60 whitespace-nowrap">
                    paid {formatDateTime(order.placed_at ?? order.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {(toShipCount ?? 0) > (toShip?.length ?? 0) && (
            <Link
              href="/admin/orders?fulfillment=unfulfilled"
              className="mt-4 inline-block qlink text-[11.5px] tracking-[.22em] font-body font-light"
            >
              ALL {toShipCount} →
            </Link>
          )}

          <div className="mt-12">
            <SectionTitle>Latest orders</SectionTitle>
            {!recent?.length ? (
              <p className="mt-4 text-[13px] font-body font-light opacity-60">No orders yet.</p>
            ) : (
              <ul className="mt-5 divide-y" style={{ borderColor: "rgba(35,47,72,.1)" }}>
                {recent.map((order) => (
                  <li key={order.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <Link href={`/admin/orders/${order.id}`} className="font-display italic text-[17px] qlink">
                        {order.order_number}
                      </Link>
                      <span className="ml-3 text-[12.5px] font-body font-light opacity-70">
                        {(order.shipping_address as { name?: string })?.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <PaymentPill status={order.payment_status} />
                      <FulfilmentPill status={order.fulfillment_status} />
                      <span className="font-display text-[15px] w-20 text-right">{formatPaise(order.total_paise)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ── Stock ──────────────────────────────────────────── */}
        <aside className="lg:col-span-5">
          <SectionTitle hint={`${lowStockThreshold} or fewer left.`}>Low stock</SectionTitle>
          {!lowStock?.length ? (
            <p className="mt-4 text-[13px] font-body font-light opacity-60">Everything is well stocked.</p>
          ) : (
            <ul className="mt-5 space-y-3">
              {lowStock.map((variant) => (
                <li key={variant.id} className="flex items-center justify-between gap-4 text-[13.5px] font-body">
                  <Link href={`/admin/products/${variant.products.id}`} className="qlink font-light">
                    {variant.products.title}
                    {variant.title !== "Default" ? ` · ${variant.title}` : ""}
                  </Link>
                  {variant.inventory_quantity === 0 ? (
                    <Pill tone="bad">SOLD OUT</Pill>
                  ) : (
                    <Pill tone="warn">{variant.inventory_quantity} LEFT</Pill>
                  )}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

/**
 * A pending refund only needs a human once it has had a moment to finish on its
 * own. Failed order refunds were already reported to whoever pressed the
 * button; failed out-of-stock refunds have nobody watching, so they stay.
 */
function needsAttention<T extends { status: string; kind: string; created_at: string }>(refunds: T[]): T[] {
  const staleBefore = Date.now() - 2 * 60 * 1000;
  return refunds.filter(
    (r) =>
      (r.status === "pending" && new Date(r.created_at).getTime() < staleBefore) ||
      (r.status === "failed" && r.kind === "out_of_stock")
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="p-5 rounded-lg" style={{ background: "rgba(35,47,72,.04)" }}>
      <div className="text-[10px] tracking-[.24em] font-body opacity-60">{label}</div>
      <div className="mt-2 font-display text-[30px] leading-none" style={{ color: "var(--night)" }}>
        {value}
      </div>
      {note && <div className="mt-2 text-[11.5px] font-body font-light opacity-55">{note}</div>}
    </div>
  );
}
