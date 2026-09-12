import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { formatDateTime } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { ShipmentPill } from "../orders/ShipmentPanels";
import { Notice, PageTitle, Pagination, inputClass } from "../ui";

export const metadata = { title: "Shipments - Aalmaram admin" };

const PAGE_SIZE = 25;

const STATUSES = [
  "pending",
  "awb_assigned",
  "pickup_scheduled",
  "in_transit",
  "out_for_delivery",
  "undelivered",
  "delivered",
  "rto_initiated",
  "rto_delivered",
  "lost",
  "cancelled",
] as const;

/** Parcels the courier hasn't taken yet — the queue the owner works from. */
const WAITING = ["pending", "awb_assigned", "pickup_scheduled"];

type Search = { q?: string; status?: string; waiting?: string; page?: string };

function cleanSearch(q: string): string {
  return q.replace(/[,()*%\\"':]/g, " ").trim().slice(0, 80);
}

export default async function AdminShipmentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const params = await searchParams;
  const q = cleanSearch(params.q ?? "");
  const status = STATUSES.find((s) => s === params.status);
  const waiting = params.waiting === "1";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const db = createAdminClient();
  let query = db
    .from("shipments")
    .select(
      "id, order_id, status, status_detail, awb_code, courier_name, tracking_url, label_url, shipped_at, delivered_at, last_status_at, created_at, orders ( order_number, email, shipping_address )",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (status) query = query.eq("status", status);
  if (waiting) query = query.in("status", WAITING);
  if (q) query = query.ilike("awb_code", `%${q}%`);

  const { data: shipments, count, error } = await query;
  const pageCount = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const filtered = Boolean(q || status || waiting);

  return (
    <div>
      <PageTitle>Shipments</PageTitle>

      <form action="/admin/shipments" className="mt-8 flex flex-wrap items-end gap-5">
        <label className="block flex-1 min-w-[200px]">
          <span className="text-[10px] tracking-[.24em] font-body opacity-70">AWB</span>
          <input type="search" name="q" defaultValue={q} placeholder="Tracking number" className={inputClass} />
        </label>
        <label className="block">
          <span className="text-[10px] tracking-[.24em] font-body opacity-70">STATUS</span>
          <select name="status" defaultValue={status ?? ""} className={inputClass}>
            <option value="">Any</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-3 pb-3 text-[12.5px] font-body font-light">
          <input type="checkbox" name="waiting" value="1" defaultChecked={waiting} />
          Not picked up yet
        </label>
        <button type="submit" className="btn-night px-7 py-3 text-[11.5px] tracking-[.24em] font-body font-normal">
          Filter
        </button>
        {filtered && (
          <Link href="/admin/shipments" className="qlink text-[11.5px] tracking-[.22em] font-body font-light pb-3">
            CLEAR
          </Link>
        )}
      </form>

      {error && (
        <div className="mt-8">
          <Notice error={error.message} />
        </div>
      )}

      {!shipments?.length ? (
        <p className="mt-12 font-body font-light text-[14px] opacity-60">
          {filtered
            ? "No shipments match that."
            : "No shipments yet. One appears here when you book a parcel from an order."}
        </p>
      ) : (
        <div className="mt-10 overflow-x-auto">
          <table className="w-full text-left font-body text-[13.5px]">
            <thead>
              <tr className="text-[10px] tracking-[.22em] opacity-60">
                <th className="py-3 pr-4 font-normal">ORDER</th>
                <th className="py-3 pr-4 font-normal">GOING TO</th>
                <th className="py-3 pr-4 font-normal">COURIER</th>
                <th className="py-3 pr-4 font-normal">STATUS</th>
                <th className="py-3 pr-4 font-normal">LAST UPDATE</th>
                <th className="py-3 font-normal">LINKS</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((shipment) => {
                const address = (shipment.orders?.shipping_address ?? {}) as Record<string, string>;
                return (
                  <tr key={shipment.id} style={{ borderTop: "1px solid rgba(35,47,72,.1)" }}>
                    <td className="py-4 pr-4">
                      <Link
                        href={`/admin/orders/${shipment.order_id}`}
                        className="font-display italic text-[17px] qlink"
                      >
                        {shipment.orders?.order_number ?? "—"}
                      </Link>
                    </td>
                    <td className="py-4 pr-4 font-light">
                      <div>{address.name || "—"}</div>
                      <div className="text-[11.5px] opacity-60">
                        {[address.city, address.state, address.pincode].filter(Boolean).join(", ")}
                      </div>
                    </td>
                    <td className="py-4 pr-4 font-light">
                      <div>{shipment.courier_name || "—"}</div>
                      <div className="text-[11.5px] opacity-60">{shipment.awb_code ?? "no AWB yet"}</div>
                    </td>
                    <td className="py-4 pr-4">
                      <ShipmentPill status={shipment.status} />
                      {shipment.status_detail && (
                        <div className="mt-1 text-[11px] font-light opacity-60 max-w-[220px]">
                          {shipment.status_detail}
                        </div>
                      )}
                    </td>
                    <td className="py-4 pr-4 font-light whitespace-nowrap opacity-80">
                      {formatDateTime(shipment.last_status_at ?? shipment.created_at)}
                    </td>
                    <td className="py-4 text-[11px] tracking-[.2em] font-light">
                      <div className="flex gap-4">
                        {shipment.tracking_url && (
                          <a href={shipment.tracking_url} target="_blank" rel="noreferrer" className="qlink">
                            TRACK
                          </a>
                        )}
                        {shipment.label_url && (
                          <a href={shipment.label_url} target="_blank" rel="noreferrer" className="qlink">
                            LABEL
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        basePath="/admin/shipments"
        params={{ q: q || undefined, status, waiting: waiting ? "1" : undefined }}
        page={page}
        pageCount={pageCount}
      />
      {count !== null && count > 0 && (
        <p className="mt-3 text-[11.5px] font-body font-light opacity-50">
          {count} shipment{count === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}
