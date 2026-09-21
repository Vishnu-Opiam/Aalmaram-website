import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { formatDate, formatDateTime, formatPaise } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { CustomerNotesForm, MarketingToggle } from "../CustomerPanels";
import { BackLink, FulfilmentPill, PageTitle, PaymentPill, Pill, SectionTitle } from "../../ui";

export const metadata = { title: "Customer - Aalmaram admin" };

type Address = Record<string, string>;

/** Same place, however it was typed: compare on the parts that identify a door. */
const addressKey = (a: Address) =>
  [a.line1, a.line2, a.pincode].map((part) => (part ?? "").toLowerCase().replace(/\s+/g, " ").trim()).join("|");

export default async function AdminCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const db = createAdminClient();
  const [{ data: customer }, { data: orders }] = await Promise.all([
    db.from("customers").select("*").eq("id", id).maybeSingle(),
    db
      .from("orders")
      .select(
        "id, order_number, total_paise, refunded_paise, payment_status, fulfillment_status, order_status, placed_at, created_at, shipping_address, discount_code"
      )
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!customer) notFound();

  const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.email;

  // Distinct addresses, newest first.
  const addresses: Address[] = [];
  const seen = new Set<string>();
  for (const order of orders ?? []) {
    const address = (order.shipping_address ?? {}) as Address;
    const key = addressKey(address);
    if (!address.line1 || seen.has(key)) continue;
    seen.add(key);
    addresses.push(address);
  }

  const discountCodes = [...new Set((orders ?? []).map((o) => o.discount_code).filter(Boolean))];

  return (
    <div>
      <BackLink href="/admin/customers">Customers</BackLink>
      <div className="mt-5">
        <PageTitle aside={customer.accepts_marketing ? <Pill tone="good">Opted in</Pill> : undefined}>{name}</PageTitle>
        <p className="mt-2 text-[12.5px] opacity-60">
          Customer since {formatDate(customer.created_at)} · {customer.total_orders} order
          {customer.total_orders === 1 ? "" : "s"} · {formatPaise(Number(customer.total_spent_paise))} spent
          {discountCodes.length ? ` · used ${discountCodes.join(", ")}` : ""}
        </p>
      </div>

      <div className="mt-6 grid lg:grid-cols-12 gap-4">
        <section className="admin-card p-5 sm:p-6 lg:col-span-7">
          <SectionTitle>Orders</SectionTitle>
          {!orders?.length ? (
            <p className="mt-4 text-[13px] opacity-60">No orders.</p>
          ) : (
            <ul className="mt-5 divide-y" style={{ borderColor: "rgba(35,47,72,.1)" }}>
              {orders.map((order) => (
                <li key={order.id} className="py-4 flex flex-wrap items-center gap-4 justify-between">
                  <div>
                    <Link href={`/admin/orders/${order.id}`} className="font-semibold text-[14px] qlink">
                      {order.order_number}
                    </Link>
                    <div className="text-[12.5px] opacity-60">
                      {formatDateTime(order.placed_at ?? order.created_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <PaymentPill status={order.payment_status} />
                    <FulfilmentPill status={order.fulfillment_status} />
                    <span className="font-semibold text-[14px] w-24 text-right">{formatPaise(order.total_paise)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="lg:col-span-5 space-y-4">
          <section className="admin-card p-5 sm:p-6">
            <SectionTitle>Contact</SectionTitle>
            <div className="mt-4 text-[13.5px] space-y-1">
              <div>
                <a href={`mailto:${customer.email}`} className="qlink">
                  {customer.email}
                </a>
              </div>
              {customer.phone && <div>{customer.phone}</div>}
            </div>
          </section>

          <section className="admin-card p-5 sm:p-6">
            <SectionTitle>Marketing</SectionTitle>
            <div className="mt-4">
              <MarketingToggle
                id={customer.id}
                accepts={customer.accepts_marketing}
                consentAt={customer.marketing_consent_at}
              />
            </div>
          </section>

          {addresses.length > 0 && (
            <section className="admin-card p-5 sm:p-6">
              <SectionTitle>Addresses</SectionTitle>
              <ul className="mt-4 space-y-4 text-[13.5px] leading-relaxed">
                {addresses.map((a, i) => (
                  <li key={i}>
                    {[a.name, a.line1, a.line2, [a.city, a.state].filter(Boolean).join(", "), a.pincode]
                      .filter(Boolean)
                      .map((line, j) => (
                        <span key={j} className="block">
                          {line}
                        </span>
                      ))}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="admin-card p-5 sm:p-6">
            <SectionTitle>Notes</SectionTitle>
            <div className="mt-4">
              <CustomerNotesForm id={customer.id} notes={customer.notes} />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
