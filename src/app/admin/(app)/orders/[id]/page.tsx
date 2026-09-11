import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { formatDateTime, formatPaise } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AddressForm,
  CancelPanel,
  FinishRefundButton,
  OrderNotesForm,
  RefundPanel,
  ResendConfirmationButton,
  type RestockableLine,
} from "../OrderPanels";
import { BackLink, FulfilmentPill, PageTitle, PaymentPill, Pill, SectionTitle } from "../../ui";

export const metadata = { title: "Order - Aalmaram admin" };

interface TimelineEntry {
  at: string;
  title: string;
  detail?: string;
  who?: string;
}

const AUDIT_TITLES: Record<string, string> = {
  "order.refund.begin": "Refund started",
  "order.refund": "Refund processed",
  "order.cancel.begin": "Cancellation started",
  "order.cancel": "Order cancelled",
  "refund.failed": "Refund failed",
  "order.address.update": "Address changed",
  "order.notes.update": "Notes edited",
  "order.confirmation.resend": "Confirmation email resent",
};

type Diff = Record<string, unknown>;

function auditDetail(action: string, diff: Diff): string | undefined {
  const money = (key: string) => (typeof diff[key] === "number" ? formatPaise(diff[key] as number) : "");
  const lines = (key: string) =>
    Array.isArray(diff[key]) && (diff[key] as unknown[]).length
      ? (diff[key] as { title: string; quantity: number }[]).map((l) => `${l.quantity} × ${l.title}`).join(", ")
      : "";

  switch (action) {
    case "order.refund.begin":
    case "order.cancel.begin":
      return [money("amount_paise"), diff.reason ? `“${diff.reason}”` : ""].filter(Boolean).join(" · ");
    case "order.refund":
    case "order.cancel": {
      const parts = [money("amount_paise"), diff.razorpay_refund_id as string];
      if (lines("restocked")) parts.push(`restocked ${lines("restocked")}`);
      if (lines("skipped")) parts.push(`not restocked (product deleted): ${lines("skipped")}`);
      if (diff.reason) parts.push(`“${diff.reason}”`);
      return parts.filter(Boolean).join(" · ");
    }
    case "refund.failed":
      return String(diff.error ?? "");
    case "order.address.update":
      return Object.entries(diff)
        .map(([key, change]) => {
          const c = change as { from?: string; to?: string };
          return `${key}: ${c.from || "—"} → ${c.to || "—"}`;
        })
        .join(" · ");
    case "order.confirmation.resend":
      return diff.sent ? "Sent" : `Not sent: ${String(diff.error ?? "")}`;
    default:
      return undefined;
  }
}

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const db = createAdminClient();
  const { data: order } = await db
    .from("orders")
    .select(
      "*, order_items ( id, title, variant_title, sku, quantity, unit_price_paise, total_paise, restocked_quantity, variant_id ), customers ( id, first_name, last_name, total_orders, accepts_marketing )"
    )
    .eq("id", id)
    .maybeSingle();

  if (!order) notFound();

  const [{ data: refunds }, { data: audit }, { data: stockMoves }, { data: outbox }] = await Promise.all([
    db.from("refunds").select("*").eq("order_id", id).order("created_at", { ascending: false }),
    db
      .from("audit_log")
      .select("id, action, admin_email, diff, created_at")
      .eq("entity_type", "order")
      .eq("entity_id", id)
      .order("created_at", { ascending: false }),
    db
      .from("inventory_adjustments")
      .select("id, variant_id, delta, reason, created_by, created_at")
      .eq("order_id", id)
      .order("created_at", { ascending: false }),
    db
      .from("webhook_outbox")
      .select("id, topic, status, attempts, last_error, created_at, sent_at")
      .eq("payload->>order_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const items = [...order.order_items].sort((a, b) => a.title.localeCompare(b.title));
  const address = (order.shipping_address ?? {}) as Record<string, string>;
  const pendingRefunds = (refunds ?? []).filter((r) => r.status === "pending");
  const inFlight = pendingRefunds.reduce((sum, r) => sum + r.amount_paise, 0);
  const remaining = order.total_paise - order.refunded_paise - inFlight;
  const cancelled = order.order_status === "cancelled";
  const canRefund =
    !cancelled && Boolean(order.razorpay_payment_id) && remaining > 0 &&
    ["paid", "partially_refunded"].includes(order.payment_status);
  const canCancel = !cancelled && order.fulfillment_status === "unfulfilled" && inFlight === 0;
  const canEditAddress = !cancelled && order.fulfillment_status === "unfulfilled";

  // Copies reserved by refunds still in flight can't be offered again.
  const reserved = new Map<string, number>();
  for (const refund of pendingRefunds) {
    for (const line of (refund.restock ?? []) as { order_item_id: string; quantity: number }[]) {
      reserved.set(line.order_item_id, (reserved.get(line.order_item_id) ?? 0) + line.quantity);
    }
  }
  const restockable: RestockableLine[] = items.map((item) => ({
    id: item.id,
    title: item.title,
    variantTitle: item.variant_title,
    quantity: item.quantity,
    available: Math.max(0, item.quantity - item.restocked_quantity - (reserved.get(item.id) ?? 0)),
    variantGone: item.variant_id === null,
  }));

  const titleByVariant = new Map(items.map((i) => [i.variant_id, i.title]));
  const STOCK_REASON: Record<string, string> = {
    order: "Stock taken for this order",
    refund: "Restocked after a refund",
    cancellation: "Restocked after cancellation",
  };

  const timeline: TimelineEntry[] = [
    ...(audit ?? []).map((entry) => ({
      at: entry.created_at,
      title: AUDIT_TITLES[entry.action] ?? entry.action,
      detail: auditDetail(entry.action, (entry.diff ?? {}) as Diff),
      who: entry.admin_email,
    })),
    ...(stockMoves ?? []).map((move) => ({
      at: move.created_at,
      title: STOCK_REASON[move.reason] ?? `Stock ${move.reason}`,
      detail: `${move.delta > 0 ? "+" : ""}${move.delta} × ${titleByVariant.get(move.variant_id) ?? "item"}`,
      who: move.created_by,
    })),
    ...(outbox ?? []).map((row) => ({
      at: row.created_at,
      title: `Queued for n8n: ${row.topic}`,
      detail:
        row.status === "sent"
          ? `Delivered ${row.sent_at ? formatDateTime(row.sent_at) : ""}`
          : row.status === "failed"
            ? `Failed after ${row.attempts} attempt(s): ${row.last_error ?? ""}`
            : "Waiting to be delivered (delivery to n8n arrives in phase 6)",
    })),
    ...(order.placed_at
      ? [
          {
            at: order.placed_at,
            title: "Order placed and paid",
            detail: `${formatPaise(order.total_paise)} via Razorpay${order.discount_code ? ` · code ${order.discount_code}` : ""}`,
            who: order.email,
          },
        ]
      : []),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return (
    <div>
      <BackLink href="/admin/orders">ORDERS</BackLink>

      <div className="mt-5">
        <PageTitle
          aside={
            <>
              <PaymentPill status={order.payment_status} />
              <FulfilmentPill status={order.fulfillment_status} />
              {cancelled && <Pill tone="bad">CANCELLED</Pill>}
            </>
          }
        >
          {order.order_number}
        </PageTitle>
        <p className="mt-2 text-[12.5px] font-body font-light opacity-60">
          {order.placed_at ? `Placed ${formatDateTime(order.placed_at)}` : `Created ${formatDateTime(order.created_at)}`}
          {order.source !== "web" ? ` · ${order.source}` : ""}
          {order.cancel_reason ? ` · Cancelled: ${order.cancel_reason}` : ""}
        </p>
      </div>

      {pendingRefunds.length > 0 && (
        <div
          className="mt-8 p-4 rounded text-[13px] font-body"
          style={{ background: "rgba(198,161,91,.18)", color: "#6d4a0e" }}
        >
          <strong className="font-normal">A refund is in progress.</strong> We sent it to Razorpay but haven&rsquo;t
          recorded the outcome yet. Check with Razorpay to finish it — this never refunds twice.
        </div>
      )}

      <div className="mt-10 grid lg:grid-cols-12 gap-12">
        <div className="lg:col-span-7 space-y-12">
          {/* ── Items and totals ─────────────────────────────── */}
          <section>
            <SectionTitle>Items</SectionTitle>
            <ul className="mt-5 divide-y" style={{ borderColor: "rgba(35,47,72,.1)" }}>
              {items.map((item) => (
                <li key={item.id} className="py-4 flex items-start justify-between gap-6">
                  <div>
                    <div className="font-display italic text-[17px]">{item.title}</div>
                    <div className="text-[11.5px] font-body font-light opacity-60">
                      {[item.variant_title !== "Default" ? item.variant_title : "", item.sku, `${formatPaise(item.unit_price_paise)} × ${item.quantity}`]
                        .filter(Boolean)
                        .join(" · ")}
                      {item.restocked_quantity > 0 && ` · ${item.restocked_quantity} restocked`}
                      {item.variant_id === null && " · product since deleted"}
                    </div>
                  </div>
                  <div className="font-display text-[16px] whitespace-nowrap">{formatPaise(item.total_paise)}</div>
                </li>
              ))}
            </ul>

            <dl
              className="mt-4 pt-4 space-y-2 text-[13.5px] font-body"
              style={{ borderTop: "1px solid rgba(35,47,72,.15)" }}
            >
              <Row label="Subtotal" value={formatPaise(order.subtotal_paise)} />
              {order.discount_paise > 0 && (
                <Row
                  label={`Discount${order.discount_code ? ` (${order.discount_code})` : ""}`}
                  value={`− ${formatPaise(order.discount_paise)}`}
                />
              )}
              {order.discount_paise === 0 && order.discount_code && (
                <Row label={`Code ${order.discount_code}`} value="free shipping" />
              )}
              <Row label="Shipping" value={order.shipping_paise === 0 ? "Free" : formatPaise(order.shipping_paise)} />
              <Row label="Total paid" value={formatPaise(order.total_paise)} strong />
              {order.refunded_paise > 0 && (
                <>
                  <Row label="Refunded" value={`− ${formatPaise(order.refunded_paise)}`} />
                  <Row label="Kept" value={formatPaise(order.total_paise - order.refunded_paise)} strong />
                </>
              )}
            </dl>
          </section>

          {/* ── Refunds ──────────────────────────────────────── */}
          {(refunds?.length ?? 0) > 0 && (
            <section>
              <SectionTitle>Refunds</SectionTitle>
              <ul className="mt-5 space-y-4">
                {refunds!.map((refund) => (
                  <li key={refund.id} className="flex flex-wrap items-start justify-between gap-4 text-[13px] font-body">
                    <div className="font-light">
                      <span className="font-display text-[16px] mr-3">{formatPaise(refund.amount_paise)}</span>
                      {refund.kind === "cancel" ? "Cancellation" : "Refund"}
                      {refund.reason ? ` · “${refund.reason}”` : ""}
                      <div className="text-[11.5px] opacity-60">
                        {formatDateTime(refund.created_at)} · {refund.created_by}
                        {refund.razorpay_refund_id ? ` · ${refund.razorpay_refund_id}` : ""}
                      </div>
                      {refund.status === "failed" && refund.error && (
                        <div className="text-[11.5px]" style={{ color: "var(--spice)" }}>
                          {refund.error}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Pill tone={refund.status === "processed" ? "good" : refund.status === "failed" ? "bad" : "warn"}>
                        {refund.status.toUpperCase()}
                      </Pill>
                      {refund.status === "pending" && <FinishRefundButton refundId={refund.id} />}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── Actions ──────────────────────────────────────── */}
          {canRefund && (
            <section className="p-7 rounded-lg" style={{ background: "rgba(35,47,72,.04)" }}>
              <RefundPanel orderId={order.id} remainingPaise={remaining} lines={restockable} />
            </section>
          )}
          {canCancel && (
            <section className="p-7 rounded-lg" style={{ background: "rgba(164,66,44,.04)" }}>
              <CancelPanel orderId={order.id} remainingPaise={remaining} />
            </section>
          )}

          {/* ── Timeline ─────────────────────────────────────── */}
          <section>
            <SectionTitle>Timeline</SectionTitle>
            <ol className="mt-5 space-y-5">
              {timeline.map((entry, i) => (
                <li key={i} className="grid grid-cols-[150px_1fr] gap-4 text-[13px] font-body">
                  <span className="font-light opacity-60 text-[12px]">{formatDateTime(entry.at)}</span>
                  <div>
                    <div>{entry.title}</div>
                    {entry.detail && <div className="font-light opacity-70 text-[12.5px]">{entry.detail}</div>}
                    {entry.who && <div className="font-light opacity-50 text-[11.5px]">{entry.who}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="lg:col-span-5 space-y-12">
          {/* ── Customer ─────────────────────────────────────── */}
          <section>
            <SectionTitle>Customer</SectionTitle>
            <div className="mt-4 text-[13.5px] font-body font-light space-y-1">
              <div className="font-display italic text-[17px]">{address.name || "—"}</div>
              <div>
                <a href={`mailto:${order.email}`} className="qlink">
                  {order.email}
                </a>
              </div>
              {order.phone && <div>{order.phone}</div>}
              {order.customers && (
                <div className="pt-2">
                  <Link href={`/admin/customers/${order.customers.id}`} className="qlink text-[11.5px] tracking-[.2em]">
                    {order.customers.total_orders} ORDER{order.customers.total_orders === 1 ? "" : "S"} · VIEW CUSTOMER →
                  </Link>
                </div>
              )}
            </div>
          </section>

          {/* ── Address ──────────────────────────────────────── */}
          <section>
            <SectionTitle hint={canEditAddress ? "Editable until the order is fulfilled." : undefined}>
              Shipping address
            </SectionTitle>
            <div className="mt-4">
              {canEditAddress ? (
                <AddressForm
                  orderId={order.id}
                  values={{
                    name: address.name ?? "",
                    phone: address.phone ?? "",
                    line1: address.line1 ?? "",
                    line2: address.line2 ?? "",
                    city: address.city ?? "",
                    state: address.state ?? "",
                    pincode: address.pincode ?? "",
                  }}
                />
              ) : (
                <p className="text-[13.5px] font-body font-light leading-relaxed">
                  {[address.name, address.line1, address.line2, [address.city, address.state].filter(Boolean).join(", "), address.pincode, address.phone]
                    .filter(Boolean)
                    .map((line, i) => (
                      <span key={i} className="block">
                        {line}
                      </span>
                    ))}
                </p>
              )}
            </div>
          </section>

          {/* ── Payment ──────────────────────────────────────── */}
          <section>
            <SectionTitle>Payment</SectionTitle>
            <dl className="mt-4 space-y-2 text-[12.5px] font-body font-light break-all">
              <Row label="Razorpay order" value={order.razorpay_order_id ?? "—"} />
              <Row label="Razorpay payment" value={order.razorpay_payment_id ?? "—"} />
            </dl>
            {order.razorpay_payment_id && (
              <a
                href={`https://dashboard.razorpay.com/app/payments/${order.razorpay_payment_id}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block qlink text-[11.5px] tracking-[.22em] font-body font-light"
              >
                OPEN IN RAZORPAY ↗
              </a>
            )}
          </section>

          <section>
            <SectionTitle>Email</SectionTitle>
            <div className="mt-4">
              <ResendConfirmationButton orderId={order.id} />
            </div>
          </section>

          <section>
            <SectionTitle>Notes</SectionTitle>
            <div className="mt-4">
              <OrderNotesForm orderId={order.id} notes={order.notes} />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong ? "" : "opacity-70"}>{label}</dt>
      <dd className={strong ? "font-display text-[18px]" : ""}>{value}</dd>
    </div>
  );
}
