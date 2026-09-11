import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { formatDate, formatPaise } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { Notice, PageTitle, Pagination, Pill, inputClass } from "../ui";

export const metadata = { title: "Customers - Aalmaram admin" };

const PAGE_SIZE = 30;

const SORTS = {
  recent: { column: "created_at", label: "Newest" },
  spend: { column: "total_spent_paise", label: "Most spent" },
  orders: { column: "total_orders", label: "Most orders" },
} as const;

type Search = { q?: string; sort?: string; marketing?: string; page?: string };

/** See orders/page.tsx: characters that would bend an or() filter are dropped. */
function cleanSearch(q: string): string {
  return q.replace(/[,()*%\\"':]/g, " ").trim().slice(0, 80);
}

export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const params = await searchParams;
  const q = cleanSearch(params.q ?? "");
  const sortKey = (Object.keys(SORTS) as (keyof typeof SORTS)[]).find((k) => k === params.sort) ?? "recent";
  const marketing = params.marketing === "yes" ? "yes" : undefined;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const db = createAdminClient();
  let query = db
    .from("customers")
    .select("id, email, first_name, last_name, phone, total_orders, total_spent_paise, accepts_marketing, created_at", {
      count: "exact",
    })
    .order(SORTS[sortKey].column, { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (q) query = query.or(`email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%`);
  if (marketing) query = query.eq("accepts_marketing", true);

  const { data: customers, count, error } = await query;
  const pageCount = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div>
      <PageTitle>Customers</PageTitle>
      <p className="mt-2 text-[12.5px] font-body font-light opacity-60">
        Everyone who has ordered. Spend is what they paid, less refunds.
      </p>

      <form action="/admin/customers" className="mt-8 flex flex-wrap items-end gap-5">
        <label className="block flex-1 min-w-[220px]">
          <span className="text-[10px] tracking-[.24em] font-body opacity-70">SEARCH</span>
          <input type="search" name="q" defaultValue={q} placeholder="Name, email or phone" className={inputClass} />
        </label>
        <label className="block">
          <span className="text-[10px] tracking-[.24em] font-body opacity-70">SORT</span>
          <select name="sort" defaultValue={sortKey} className={inputClass}>
            {Object.entries(SORTS).map(([key, s]) => (
              <option key={key} value={key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-3 text-[13px] font-body font-light">
          <input type="checkbox" name="marketing" value="yes" defaultChecked={Boolean(marketing)} style={{ accentColor: "var(--night)" }} />
          Opted in only
        </label>
        <button type="submit" className="btn-night px-7 py-3 text-[11.5px] tracking-[.24em] font-body font-normal">
          Filter
        </button>
      </form>

      {error && (
        <div className="mt-8">
          <Notice error={error.message} />
        </div>
      )}

      {!customers?.length ? (
        <p className="mt-12 font-body font-light text-[14px] opacity-60">
          {q || marketing ? "No customers match that." : "No customers yet. Each order creates one."}
        </p>
      ) : (
        <div className="mt-10 overflow-x-auto">
          <table className="w-full text-left font-body text-[13.5px]">
            <thead>
              <tr className="text-[10px] tracking-[.22em] opacity-60">
                <th className="py-3 pr-4 font-normal">NAME</th>
                <th className="py-3 pr-4 font-normal">EMAIL</th>
                <th className="py-3 pr-4 font-normal text-right">ORDERS</th>
                <th className="py-3 pr-4 font-normal text-right">SPENT</th>
                <th className="py-3 pr-4 font-normal">MARKETING</th>
                <th className="py-3 font-normal">SINCE</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} style={{ borderTop: "1px solid rgba(35,47,72,.1)" }}>
                  <td className="py-4 pr-4">
                    <Link href={`/admin/customers/${c.id}`} className="font-display italic text-[17px] qlink">
                      {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                    </Link>
                  </td>
                  <td className="py-4 pr-4 font-light">{c.email}</td>
                  <td className="py-4 pr-4 text-right font-light">{c.total_orders}</td>
                  <td className="py-4 pr-4 text-right font-display text-[16px] whitespace-nowrap">
                    {formatPaise(Number(c.total_spent_paise))}
                  </td>
                  <td className="py-4 pr-4">
                    {c.accepts_marketing ? <Pill tone="good">OPTED IN</Pill> : <span className="opacity-40">—</span>}
                  </td>
                  <td className="py-4 font-light opacity-80 whitespace-nowrap">{formatDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        basePath="/admin/customers"
        params={{ q: q || undefined, sort: sortKey === "recent" ? undefined : sortKey, marketing }}
        page={page}
        pageCount={pageCount}
      />
    </div>
  );
}
