import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { formatDateTime, formatPaise } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { FulfilmentPill, Notice, PageTitle, Pagination, PaymentPill, inputClass } from "../ui";

export const metadata = { title: "Orders - Aalmaram admin" };

const PAGE_SIZE = 25;

const PAYMENT = ["paid", "partially_refunded", "refunded", "pending", "failed"] as const;
const FULFILMENT = ["unfulfilled", "fulfilled", "cancelled", "returned"] as const;

type Search = { q?: string; payment?: string; fulfillment?: string; page?: string };

/**
 * Characters that would change the meaning of a PostgREST or() filter, or act
 * as wildcards, are dropped from the search rather than escaped: nobody's name,
 * email or order number needs them.
 */
function cleanSearch(q: string): string {
  return q.replace(/[,()*%\\"':]/g, " ").trim().slice(0, 80);
}

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const params = await searchParams;
  const q = cleanSearch(params.q ?? "");
  const payment = PAYMENT.find((p) => p === params.payment);
  const fulfillment = FULFILMENT.find((f) => f === params.fulfillment);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const db = createAdminClient();
  let query = db
    .from("orders")
    .select(
      "id, order_number, email, shipping_address, total_paise, refunded_paise, payment_status, fulfillment_status, order_status, placed_at, created_at, order_items ( quantity )",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (payment) query = query.eq("payment_status", payment);
  if (fulfillment) query = query.eq("fulfillment_status", fulfillment);
  if (q) {
    query = query.or(
      `order_number.ilike.%${q}%,email.ilike.%${q}%,shipping_address->>name.ilike.%${q}%`
    );
  }

  const { data: orders, count, error } = await query;
  const pageCount = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const filtered = Boolean(q || payment || fulfillment);

  return (
    <div>
      <PageTitle>Orders</PageTitle>

      <form action="/admin/orders" className="mt-6 admin-card p-4 flex flex-wrap items-end gap-4">
        <label className="block flex-1 min-w-[220px]">
          <span className="text-[13px] font-medium">Search</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Order number, email or name"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-[13px] font-medium">Payment</span>
          <select name="payment" defaultValue={payment ?? ""} className={inputClass}>
            <option value="">Any</option>
            {PAYMENT.map((p) => (
              <option key={p} value={p}>
                {p.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[13px] font-medium">Fulfilment</span>
          <select name="fulfillment" defaultValue={fulfillment ?? ""} className={inputClass}>
            <option value="">Any</option>
            {FULFILMENT.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-night px-4 py-2.5 text-[13px]">
          Filter
        </button>
        {filtered && (
          <Link href="/admin/orders" className="qlink text-[13px] font-medium pb-2.5">
            Clear
          </Link>
        )}
      </form>

      {error && (
        <div className="mt-8">
          <Notice error={error.message} />
        </div>
      )}

      {!orders?.length ? (
        <p className="mt-6 admin-card px-6 py-10 text-center text-[14px] opacity-70">
          {filtered ? "No orders match that." : "No orders yet. They appear here the moment a payment goes through."}
        </p>
      ) : (
        <div className="mt-4 admin-card overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr>
                <th className="py-3 pr-4 font-normal">Order</th>
                <th className="py-3 pr-4 font-normal">Date</th>
                <th className="py-3 pr-4 font-normal">Customer</th>
                <th className="py-3 pr-4 font-normal text-right">Items</th>
                <th className="py-3 pr-4 font-normal text-right">Total</th>
                <th className="py-3 pr-4 font-normal">Payment</th>
                <th className="py-3 font-normal">Fulfilment</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const address = (order.shipping_address ?? {}) as { name?: string };
                const units = order.order_items.reduce((sum, i) => sum + i.quantity, 0);
                return (
                  <tr key={order.id} style={{ borderTop: "1px solid var(--a-border)" }}>
                    <td className="py-4 pr-4">
                      <Link href={`/admin/orders/${order.id}`} className="font-semibold text-[14px] qlink">
                        {order.order_number}
                      </Link>
                    </td>
                    <td className="py-4 pr-4 whitespace-nowrap opacity-80">
                      {formatDateTime(order.placed_at ?? order.created_at)}
                    </td>
                    <td className="py-4 pr-4">
                      <div>{address.name || "—"}</div>
                      <div className="text-[12.5px] opacity-60">{order.email}</div>
                    </td>
                    <td className="py-4 pr-4 text-right">{units}</td>
                    <td className="py-4 pr-4 text-right font-semibold text-[14px] whitespace-nowrap">
                      {formatPaise(order.total_paise)}
                      {order.refunded_paise > 0 && (
                        <div className="text-[12px] opacity-60">
                          −{formatPaise(order.refunded_paise)} refunded
                        </div>
                      )}
                    </td>
                    <td className="py-4 pr-4">
                      <PaymentPill status={order.payment_status} />
                    </td>
                    <td className="py-4">
                      <FulfilmentPill status={order.fulfillment_status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        basePath="/admin/orders"
        params={{ q: q || undefined, payment, fulfillment }}
        page={page}
        pageCount={pageCount}
      />
      {count !== null && count > 0 && (
        <p className="mt-3 text-[12.5px] opacity-50">
          {count} order{count === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}
