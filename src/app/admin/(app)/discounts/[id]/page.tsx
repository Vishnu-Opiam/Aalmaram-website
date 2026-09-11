import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { formatDateTime, formatPaise, toISTInputValue } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import DiscountForm, { CopyLinkButton, DeleteDiscountButton } from "../DiscountForm";
import { setDiscountActive } from "../actions";
import { describeValue, discountStatus, shareLink } from "../status";
import { BackLink, Notice, PageTitle, Pill, SectionTitle } from "../../ui";

export const metadata = { title: "Discount - Aalmaram admin" };

export default async function EditDiscountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { saved } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const db = createAdminClient();
  const [{ data: discount }, { data: products }, { data: redemptions }] = await Promise.all([
    db.from("discounts").select("*").eq("id", id).maybeSingle(),
    db.from("products").select("id, title, status, tags").order("title"),
    db
      .from("discount_redemptions")
      .select("id, amount_paise, customer_email, created_at, orders ( id, order_number, total_paise, order_status )")
      .eq("discount_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!discount) notFound();

  const status = discountStatus(discount);
  const tags = [...new Set((products ?? []).flatMap((p) => p.tags ?? []))].sort();
  const totalGiven = (redemptions ?? []).reduce((sum, r) => sum + r.amount_paise, 0);
  const link = shareLink(discount.code);

  return (
    <div>
      <BackLink href="/admin/discounts">DISCOUNTS</BackLink>

      <div className="mt-5">
        <PageTitle
          aside={
            <>
              <Pill tone={status.tone}>{status.label}</Pill>
              <CopyLinkButton url={link} />
              <form action={setDiscountActive}>
                <input type="hidden" name="id" value={discount.id} />
                <input type="hidden" name="active" value={discount.active ? "false" : "true"} />
                <button type="submit" className="qlink text-[11.5px] tracking-[.22em] font-body font-light">
                  {discount.active ? "DEACTIVATE" : "ACTIVATE"}
                </button>
              </form>
            </>
          }
        >
          {discount.code}
        </PageTitle>
        <p className="mt-2 text-[12.5px] font-body font-light opacity-60">
          {describeValue(discount)} · used {discount.used_count}
          {discount.usage_limit !== null ? ` of ${discount.usage_limit}` : ""} times · {link}
        </p>
      </div>

      {saved && (
        <div className="mt-8">
          <Notice ok="Code created." />
        </div>
      )}

      {discount.used_count > 0 && (
        <p className="mt-8 text-[12.5px] font-body font-light p-3 rounded" style={{ background: "rgba(198,161,91,.15)" }}>
          This code has been used. Changes apply to future orders only; past orders keep the discount they got.
        </p>
      )}

      <DiscountForm
        mode="edit"
        products={products ?? []}
        tags={tags}
        values={{
          id: discount.id,
          code: discount.code,
          title: discount.title,
          type: discount.type as "percentage" | "fixed_amount" | "free_shipping",
          value:
            discount.type === "fixed_amount"
              ? String(Number(discount.value) / 100)
              : discount.type === "percentage"
                ? String(Number(discount.value))
                : "",
          appliesTo: discount.applies_to as "all" | "products" | "tag",
          productIds: discount.product_ids ?? [],
          tag: discount.tag ?? "",
          minSubtotal: discount.min_subtotal_paise !== null ? String(discount.min_subtotal_paise / 100) : "",
          usageLimit: discount.usage_limit !== null ? String(discount.usage_limit) : "",
          usageLimitPerCustomer:
            discount.usage_limit_per_customer !== null ? String(discount.usage_limit_per_customer) : "",
          oncePerCustomer: discount.once_per_customer,
          startsAt: toISTInputValue(discount.starts_at),
          endsAt: toISTInputValue(discount.ends_at),
          active: discount.active,
        }}
      />

      <section className="mt-16">
        <SectionTitle
          hint={
            redemptions?.length
              ? `${redemptions.length} order${redemptions.length === 1 ? "" : "s"} · ${formatPaise(totalGiven)} given in discounts`
              : undefined
          }
        >
          Redemptions
        </SectionTitle>
        {!redemptions?.length ? (
          <p className="mt-4 text-[13px] font-body font-light opacity-60">Not used yet.</p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left font-body text-[13.5px]">
              <thead>
                <tr className="text-[10px] tracking-[.22em] opacity-60">
                  <th className="py-3 pr-4 font-normal">ORDER</th>
                  <th className="py-3 pr-4 font-normal">CUSTOMER</th>
                  <th className="py-3 pr-4 font-normal">DATE</th>
                  <th className="py-3 pr-4 font-normal text-right">DISCOUNT</th>
                  <th className="py-3 font-normal text-right">ORDER TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {redemptions.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid rgba(35,47,72,.1)" }}>
                    <td className="py-3 pr-4">
                      {r.orders ? (
                        <Link href={`/admin/orders/${r.orders.id}`} className="font-display italic text-[16px] qlink">
                          {r.orders.order_number}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {r.orders?.order_status === "cancelled" && (
                        <span className="ml-2 text-[11px] opacity-60">cancelled</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 font-light">{r.customer_email}</td>
                    <td className="py-3 pr-4 font-light opacity-80 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                    <td className="py-3 pr-4 text-right font-light">
                      {r.amount_paise > 0 ? formatPaise(r.amount_paise) : "free shipping"}
                    </td>
                    <td className="py-3 text-right font-display text-[15px]">
                      {r.orders ? formatPaise(r.orders.total_paise) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {discount.used_count === 0 && !redemptions?.length && (
        <section className="mt-16">
          <DeleteDiscountButton id={discount.id} />
        </section>
      )}
    </div>
  );
}
