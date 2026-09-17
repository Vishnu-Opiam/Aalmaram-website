import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { formatPaise } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { Notice, PageTitle, SectionTitle } from "../ui";
import RevenueChart, { type DailyPoint } from "./RevenueChart";

export const metadata = { title: "Analytics - Aalmaram admin" };

const RANGES = [7, 30, 90] as const;

interface Period {
  orders: number;
  gross_paise: number;
  refunded_paise: number;
  units: number;
  checkouts_started: number;
  checkouts_completed: number;
}

interface Analytics {
  days: number;
  from: string;
  to: string;
  low_stock_threshold: number;
  current: Period;
  previous: Period;
  daily: DailyPoint[];
  top_products: { title: string; units: number; revenue_paise: number; orders: number }[];
  discounts: { code: string; type: string | null; orders: number; discount_paise: number; revenue_paise: number }[];
  low_stock: { product_id: string; title: string; sku: string | null; available: number }[];
}

const net = (p: Period) => p.gross_paise - p.refunded_paise;
const aov = (p: Period) => (p.orders ? Math.round(p.gross_paise / p.orders) : 0);
const conversion = (p: Period) => (p.checkouts_started ? p.checkouts_completed / p.checkouts_started : null);

/** Signed change vs the previous period. Up is good for every figure on this page. */
function Delta({ now, before, format }: { now: number | null; before: number | null; format: "money" | "count" | "points" }) {
  if (now === null || before === null) return <span className="opacity-50">no comparison</span>;
  const diff = now - before;
  if (diff === 0) return <span className="opacity-60">same as before</span>;
  const up = diff > 0;
  const text =
    format === "money"
      ? formatPaise(Math.abs(diff))
      : format === "points"
        ? `${Math.abs(diff * 100).toFixed(1)} pts`
        : Math.abs(diff).toLocaleString("en-IN");
  return (
    <span style={{ color: up ? "#0c664b" : "var(--spice)" }}>
      {up ? "▲" : "▼"} {text}
    </span>
  );
}

function Tile({
  label,
  value,
  delta,
  note,
}: {
  label: string;
  value: string;
  delta: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="p-5 rounded-lg" style={{ background: "rgba(35,47,72,.04)" }}>
      <div className="text-[10px] tracking-[.24em] font-body opacity-60">{label}</div>
      <div className="mt-2 font-body text-[28px] leading-none" style={{ color: "var(--night)", fontWeight: 400 }}>
        {value}
      </div>
      <div className="mt-2 text-[11.5px] font-body font-light">{delta}</div>
      {note && <div className="mt-1 text-[11.5px] font-body font-light opacity-55">{note}</div>}
    </div>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireAdmin();
  const { days: rawDays } = await searchParams;
  const days = RANGES.find((r) => String(r) === rawDays) ?? 30;

  const { data, error } = await createAdminClient().rpc("store_analytics", { p_days: days });
  if (error || !data) {
    return (
      <div>
        <PageTitle>Analytics</PageTitle>
        <div className="mt-8">
          <Notice error={`Could not load analytics: ${error?.message ?? "no data"}`} />
        </div>
      </div>
    );
  }

  const a = data as unknown as Analytics;
  const cur = a.current;
  const prev = a.previous;
  const conv = conversion(cur);
  const totalDiscount = a.discounts.reduce((s, d) => s + d.discount_paise, 0);

  return (
    <div>
      <PageTitle>Analytics</PageTitle>

      {/* One row of filters, above everything it scopes. */}
      <div className="mt-6 flex flex-wrap items-center gap-6 text-[11.5px] tracking-[.22em] font-body">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={`/admin/analytics?days=${r}`}
            aria-current={r === days ? "page" : undefined}
            className="pb-1"
            style={{
              borderBottom: r === days ? "2px solid var(--night)" : "2px solid transparent",
              opacity: r === days ? 1 : 0.55,
            }}
          >
            LAST {r} DAYS
          </Link>
        ))}
        <span className="text-[11.5px] tracking-normal font-light opacity-55">
          Indian days, compared with the {days} before. Refunds count on the day the money went back.
        </span>
      </div>

      <section className="mt-8 grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Tile
          label="NET REVENUE"
          value={formatPaise(net(cur))}
          delta={<Delta now={net(cur)} before={net(prev)} format="money" />}
          note={cur.refunded_paise ? `${formatPaise(cur.gross_paise)} gross, ${formatPaise(cur.refunded_paise)} refunded` : undefined}
        />
        <Tile label="ORDERS" value={cur.orders.toLocaleString("en-IN")} delta={<Delta now={cur.orders} before={prev.orders} format="count" />} />
        <Tile
          label="AVERAGE ORDER"
          value={cur.orders ? formatPaise(aov(cur)) : "—"}
          delta={<Delta now={cur.orders ? aov(cur) : null} before={prev.orders ? aov(prev) : null} format="money" />}
        />
        <Tile label="COPIES SOLD" value={cur.units.toLocaleString("en-IN")} delta={<Delta now={cur.units} before={prev.units} format="count" />} note="less any restocked" />
        <Tile
          label="CHECKOUT → ORDER"
          value={conv === null ? "—" : `${Math.round(conv * 100)}%`}
          delta={<Delta now={conv} before={conversion(prev)} format="points" />}
          note={`${cur.checkouts_completed} of ${cur.checkouts_started} who pressed Pay`}
        />
      </section>

      <section className="mt-12">
        <SectionTitle hint={cur.orders === 0 ? "No paid orders in this period yet." : "Hover or use the arrow keys for a day's figures."}>
          Net revenue by day
        </SectionTitle>
        <div className="mt-5">
          <RevenueChart daily={a.daily} />
        </div>
      </section>

      <div className="mt-14 grid lg:grid-cols-2 gap-12">
        <section>
          <SectionTitle hint="By copies sold in the period.">Top products</SectionTitle>
          {a.top_products.length === 0 ? (
            <p className="mt-4 font-body font-light text-[13.5px] opacity-60">Nothing sold yet.</p>
          ) : (
            <table className="mt-4 w-full text-left font-body text-[13.5px]" style={{ fontVariantNumeric: "tabular-nums" }}>
              <thead>
                <tr className="text-[10px] tracking-[.22em] opacity-60">
                  <th className="py-2 pr-4 font-normal">PRODUCT</th>
                  <th className="py-2 pr-4 font-normal text-right">COPIES</th>
                  <th className="py-2 pr-4 font-normal text-right">ORDERS</th>
                  <th className="py-2 font-normal text-right">REVENUE</th>
                </tr>
              </thead>
              <tbody>
                {a.top_products.map((p) => (
                  <tr key={p.title} className="border-t border-black/10">
                    <td className="py-2 pr-4">{p.title}</td>
                    <td className="py-2 pr-4 text-right">{p.units}</td>
                    <td className="py-2 pr-4 text-right">{p.orders}</td>
                    <td className="py-2 text-right">{formatPaise(p.revenue_paise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <SectionTitle hint={totalDiscount ? `${formatPaise(totalDiscount)} given away in the period.` : "Codes used on paid orders in the period."}>
            Discount codes
          </SectionTitle>
          {a.discounts.length === 0 ? (
            <p className="mt-4 font-body font-light text-[13.5px] opacity-60">No codes used.</p>
          ) : (
            <table className="mt-4 w-full text-left font-body text-[13.5px]" style={{ fontVariantNumeric: "tabular-nums" }}>
              <thead>
                <tr className="text-[10px] tracking-[.22em] opacity-60">
                  <th className="py-2 pr-4 font-normal">CODE</th>
                  <th className="py-2 pr-4 font-normal text-right">ORDERS</th>
                  <th className="py-2 pr-4 font-normal text-right">DISCOUNT</th>
                  <th className="py-2 font-normal text-right">REVENUE</th>
                </tr>
              </thead>
              <tbody>
                {a.discounts.map((d) => (
                  <tr key={d.code} className="border-t border-black/10">
                    <td className="py-2 pr-4">{d.code}</td>
                    <td className="py-2 pr-4 text-right">{d.orders}</td>
                    <td className="py-2 pr-4 text-right">
                      {d.type === "free_shipping" && d.discount_paise === 0 ? "free shipping" : formatPaise(d.discount_paise)}
                    </td>
                    <td className="py-2 text-right">{formatPaise(d.revenue_paise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="mt-14">
        <SectionTitle hint={`At or below ${a.low_stock_threshold} copies. Change the threshold in Settings.`}>Low stock</SectionTitle>
        {a.low_stock.length === 0 ? (
          <p className="mt-4 font-body font-light text-[13.5px] opacity-60">Everything is above the threshold.</p>
        ) : (
          <ul className="mt-4 space-y-2 text-[13.5px] font-body">
            {a.low_stock.map((v) => (
              <li key={`${v.product_id}-${v.sku}-${v.title}`} className="flex gap-4">
                <Link href={`/admin/products/${v.product_id}`} className="qlink">
                  {v.title}
                </Link>
                <span className="font-light opacity-75">
                  {v.available} left{v.sku ? ` · ${v.sku}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
