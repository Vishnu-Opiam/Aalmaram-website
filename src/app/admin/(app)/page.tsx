import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { STORE_TIME_ZONE, formatDateTime, formatPaise } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import RevenueChart, { type DailyPoint } from "./analytics/RevenueChart";
import { FinishRefundButton } from "./orders/OrderPanels";
import { Card, Notice, PageTitle, PaymentPill, Pill, SectionTitle } from "./ui";

export const metadata = { title: "Admin - Aalmaram" };

/** How many days the sales card on the home screen looks back. */
const TREND_DAYS = 14;

interface PeriodSummary {
  orders: number;
  gross_paise: number;
  refunded_paise: number;
}

/**
 * The day's first look: what came in, what needs sending, what needs a human.
 * "Today" and "this week" are bucketed in Postgres in Indian time (see
 * admin_sales_summary); the sales trend comes from store_analytics.
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
    { data: trend },
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
    // Also carries the low-stock list and threshold, so stock needs no second
    // round trip after this one.
    db.rpc("store_analytics", { p_days: TREND_DAYS }),
  ]);

  const analytics = (trend ?? {}) as {
    daily?: DailyPoint[];
    low_stock_threshold?: number;
    low_stock?: { product_id: string; variant_id: string; title: string; available: number }[];
  };
  const lowStockThreshold = analytics.low_stock_threshold ?? 5;
  const lowStock = (analytics.low_stock ?? []).slice(0, 10);

  const periods = (summary ?? {}) as { today?: PeriodSummary; week?: PeriodSummary };
  const attention = needsAttention(openRefunds ?? []);

  const daily = analytics.daily ?? [];
  const trendNet = daily.reduce((sum, d) => sum + d.net_paise, 0);
  const trendOrders = daily.reduce((sum, d) => sum + d.orders, 0);
  const trendGross = daily.reduce((sum, d) => sum + d.gross_paise, 0);

  const now = new Date();
  const hour = Number(now.toLocaleString("en-GB", { timeZone: STORE_TIME_ZONE, hour: "2-digit", hour12: false }));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = now.toLocaleDateString("en-IN", {
    timeZone: STORE_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-6">
      <PageTitle
        subtitle={`${today} · here is how the store is doing.`}
        aside={
          <>
            <Link href="/admin/analytics" className="admin-card !shadow-none px-4 py-2 text-[13px] font-medium hover:bg-[var(--a-hover)]">
              View analytics
            </Link>
            <Link href="/admin/orders" className="btn-night px-4 py-2 text-[13px]">
              All orders
            </Link>
          </>
        }
      >
        {greeting}
      </PageTitle>

      {denied === "owner" && (
        <Notice error="Employees are managed by the store admin. Ask them if someone needs access changed." />
      )}

      {/* ── Figures ──────────────────────────────────────────── */}
      <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Figure icon="bag" tint="#3a6b7a" label="Orders today" value={String(periods.today?.orders ?? 0)} note="paid today" />
        <Figure
          icon="rupee"
          tint="#0c664b"
          label="Revenue today"
          value={formatPaise((periods.today?.gross_paise ?? 0) - (periods.today?.refunded_paise ?? 0))}
          note={periods.today?.refunded_paise ? `after ${formatPaise(periods.today.refunded_paise)} refunded` : "net of refunds"}
        />
        <Figure icon="stack" tint="#e07030" label="Orders this week" value={String(periods.week?.orders ?? 0)} note="since Monday" />
        <Figure
          icon="trend"
          tint="#b08a3e"
          label="Revenue this week"
          value={formatPaise((periods.week?.gross_paise ?? 0) - (periods.week?.refunded_paise ?? 0))}
          note={periods.week?.refunded_paise ? `after ${formatPaise(periods.week.refunded_paise)} refunded` : "since Monday"}
        />
      </section>

      {/* ── Needs a human ────────────────────────────────────── */}
      {(attention.length > 0 || (failedOutbox ?? 0) > 0) && (
        <div className="admin-card p-5 sm:p-6" style={{ borderLeft: "4px solid var(--spice)" }}>
          <SectionTitle hint="These won't sort themselves out.">
            <span style={{ color: "var(--spice)" }}>Needs attention</span>
          </SectionTitle>
          <ul className="mt-3">
            {attention.map((refund) => (
              <li
                key={refund.id}
                className="py-3 flex flex-wrap items-start justify-between gap-4 text-[13.5px]"
                style={{ borderTop: "1px solid var(--a-border)" }}
              >
                <div className="max-w-[640px]">
                  {refund.kind === "out_of_stock" ? (
                    <>
                      <strong className="font-medium">Sold out after payment</strong> —{" "}
                      {formatPaise(refund.amount_paise)} owed back to {refund.checkouts?.email ?? "the buyer"}. No order
                      was created.
                    </>
                  ) : (
                    <>
                      <strong className="font-medium">Refund not finished</strong> — {formatPaise(refund.amount_paise)} on{" "}
                      {refund.order_id ? (
                        <Link href={`/admin/orders/${refund.order_id}`} className="qlink font-medium">
                          {refund.orders?.order_number ?? "an order"}
                        </Link>
                      ) : (
                        "an order"
                      )}
                      .
                    </>
                  )}
                  <div className="mt-0.5 text-[12px]" style={{ color: "var(--a-muted)" }}>
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
              <li className="py-3 text-[13.5px]" style={{ borderTop: "1px solid var(--a-border)" }}>
                <strong className="font-medium">{failedOutbox} event(s) could not be delivered to n8n</strong> after ten
                tries.{" "}
                <Link href="/admin/settings/integrations?status=failed" className="qlink font-medium">
                  See why and retry
                </Link>
                .
              </li>
            )}
          </ul>
        </div>
      )}

      {/* ── Sales trend + recent orders ──────────────────────── */}
      <div className="grid xl:grid-cols-12 gap-4">
        <Card className="xl:col-span-8">
          <SectionTitle hint={`Net revenue by day, last ${TREND_DAYS} days.`} aside={<CardLink href="/admin/analytics">Details →</CardLink>}>
            Sales
          </SectionTitle>
          <div className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
            <Stat label="Net revenue" value={formatPaise(trendNet)} />
            <Stat label="Orders" value={trendOrders.toLocaleString("en-IN")} />
            <Stat label="Average order" value={trendOrders ? formatPaise(Math.round(trendGross / trendOrders)) : "—"} />
          </div>
          <div className="mt-4">
            {daily.length ? <RevenueChart daily={daily} table={false} /> : <Empty>No sales figures yet.</Empty>}
          </div>
        </Card>

        <Card className="xl:col-span-4 flex flex-col" padded={false}>
          <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-2">
            <SectionTitle aside={<CardLink href="/admin/orders">View all</CardLink>}>Recent orders</SectionTitle>
          </div>
          {!recent?.length ? (
            <div className="px-5 sm:px-6 pb-6">
              <Empty>No orders yet. They show up the moment a payment goes through.</Empty>
            </div>
          ) : (
            <ul className="px-2 pb-3">
              {recent.map((order) => {
                const name = (order.shipping_address as { name?: string })?.name || "Customer";
                return (
                  <li key={order.id}>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--a-hover)]"
                    >
                      <Avatar name={name} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-medium">{name}</div>
                        <div className="truncate text-[12px]" style={{ color: "var(--a-muted)" }}>
                          {order.order_number} · {formatDateTime(order.placed_at ?? order.created_at)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[13.5px] font-semibold tabular-nums">{formatPaise(order.total_paise)}</div>
                        <div className="mt-1">
                          <PaymentPill status={order.payment_status} />
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* ── To send + stock ──────────────────────────────────── */}
      <div className="grid xl:grid-cols-12 gap-4">
        <Card className="xl:col-span-7" padded={false}>
          <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-4">
            <SectionTitle
              hint={toShipCount ? "Paid and not yet shipped, oldest first." : "Paid orders that haven't shipped yet."}
              aside={
                toShipCount ? (
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold"
                    style={{ background: "rgba(224,112,48,.12)", color: "#a4501f" }}
                  >
                    {toShipCount} to send
                  </span>
                ) : undefined
              }
            >
              Waiting to be sent
            </SectionTitle>
          </div>
          {!toShip?.length ? (
            <div className="px-5 sm:px-6 pb-6">
              <Empty tone="good">Nothing waiting. Every paid order has gone out.</Empty>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13.5px]">
                <thead>
                  <tr className="text-[12px]" style={{ background: "var(--a-bg)" }}>
                    <th className="py-2.5 pl-5 sm:pl-6 pr-4">Order</th>
                    <th className="py-2.5 pr-4">Customer</th>
                    <th className="py-2.5 pr-4 text-right">Total</th>
                    <th className="py-2.5 pr-5 sm:pr-6 text-right">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {toShip.map((order) => (
                    <tr key={order.id} style={{ borderTop: "1px solid var(--a-border)" }}>
                      <td className="py-3 pl-5 sm:pl-6 pr-4">
                        <Link href={`/admin/orders/${order.id}`} className="font-medium qlink">
                          {order.order_number}
                        </Link>
                      </td>
                      <td className="py-3 pr-4">{(order.shipping_address as { name?: string })?.name || order.email}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{formatPaise(order.total_paise)}</td>
                      <td className="py-3 pr-5 sm:pr-6 text-right whitespace-nowrap" style={{ color: "var(--a-muted)" }}>
                        {formatDateTime(order.placed_at ?? order.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(toShipCount ?? 0) > (toShip?.length ?? 0) && (
            <div className="px-5 sm:px-6 py-3" style={{ borderTop: "1px solid var(--a-border)" }}>
              <Link href="/admin/orders?fulfillment=unfulfilled" className="text-[13px] font-medium qlink">
                See all {toShipCount} →
              </Link>
            </div>
          )}
        </Card>

        <Card className="xl:col-span-5">
          <SectionTitle hint={`${lowStockThreshold} or fewer left.`} aside={<CardLink href="/admin/products">Products</CardLink>}>
            Low stock
          </SectionTitle>
          {!lowStock?.length ? (
            <div className="mt-4">
              <Empty tone="good">Everything is well stocked.</Empty>
            </div>
          ) : (
            <ul className="mt-4 space-y-4">
              {lowStock.map((variant) => {
                const qty = Math.max(0, variant.available);
                const pct = Math.min(100, (qty / Math.max(1, lowStockThreshold)) * 100);
                return (
                  <li key={variant.variant_id}>
                    <div className="flex items-center justify-between gap-4 text-[13.5px]">
                      <Link href={`/admin/products/${variant.product_id}`} className="qlink font-medium truncate">
                        {variant.title}
                      </Link>
                      {qty === 0 ? <Pill tone="bad">Sold out</Pill> : <Pill tone="warn">{qty} left</Pill>}
                    </div>
                    <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--a-hover)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: qty === 0 ? "var(--spice)" : "#c6a15b" }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
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

const FIGURE_ICONS = {
  bag: <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" />,
  rupee: <path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a5 5 0 0 0 0-10" />,
  stack: <path d="M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />,
  trend: <path d="M22 7 13.5 15.5l-5-5L2 17M16 7h6v6" />,
};

function Figure({
  icon,
  tint,
  label,
  value,
  note,
}: {
  icon: keyof typeof FIGURE_ICONS;
  tint: string;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[13px] font-medium" style={{ color: "var(--a-muted)" }}>
          {label}
        </div>
        <span className="grid place-items-center w-9 h-9 rounded-lg" style={{ background: `${tint}1a`, color: tint }} aria-hidden>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            {FIGURE_ICONS[icon]}
          </svg>
        </span>
      </div>
      <div className="mt-1 text-[28px] font-semibold tracking-tight tabular-nums leading-tight">{value}</div>
      {note && (
        <div className="mt-1 text-[12.5px]" style={{ color: "var(--a-muted)" }}>
          {note}
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[12px]" style={{ color: "var(--a-muted)" }}>
        {label}
      </div>
      <div className="text-[20px] font-semibold tracking-tight tabular-nums">{value}</div>
    </div>
  );
}

function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-[13px] font-medium qlink" style={{ color: "var(--a-muted)" }}>
      {children}
    </Link>
  );
}

const AVATAR_TINTS = ["#3a6b7a", "#e07030", "#0c664b", "#b08a3e", "#6b4a2e", "#232f48"];

/** Initials on a colour picked from the name, so the same customer always gets the same one. */
function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
  const tint = AVATAR_TINTS[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % AVATAR_TINTS.length];
  return (
    <span
      className="grid place-items-center w-9 h-9 shrink-0 rounded-full text-[12.5px] font-semibold"
      style={{ background: `${tint}1f`, color: tint }}
      aria-hidden
    >
      {initials || "·"}
    </span>
  );
}

function Empty({ children, tone }: { children: React.ReactNode; tone?: "good" }) {
  const good = tone === "good";
  return (
    <div
      className="flex items-center gap-3 rounded-lg px-4 py-4 text-[13.5px]"
      style={{ background: "var(--a-bg)", color: "var(--a-muted)" }}
    >
      <span
        className="grid place-items-center w-7 h-7 shrink-0 rounded-full"
        style={{ background: good ? "rgba(12,102,75,.12)" : "rgba(35,47,72,.08)", color: good ? "#0c664b" : "var(--a-muted)" }}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {good ? <path d="M20 6 9 17l-5-5" /> : <path d="M5 12h14" />}
        </svg>
      </span>
      {children}
    </div>
  );
}
