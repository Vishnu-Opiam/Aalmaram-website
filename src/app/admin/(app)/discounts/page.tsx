import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { formatDate } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { CopyLinkButton } from "./DiscountForm";
import { describeValue, discountStatus, shareLink } from "./status";
import { Notice, PageTitle, Pill } from "../ui";

export const metadata = { title: "Discounts - Aalmaram admin" };

export default async function AdminDiscountsPage() {
  await requireAdmin();

  const db = createAdminClient();
  const { data: discounts, error } = await db
    .from("discounts")
    .select("id, code, title, type, value, applies_to, active, starts_at, ends_at, usage_limit, used_count")
    .order("created_at", { ascending: false });

  return (
    <div>
      <PageTitle
        aside={
          <Link
            href="/admin/discounts/new"
            className="btn-night px-4 py-2.5 text-[13px]"
          >
            New code
          </Link>
        }
      >
        Discounts
      </PageTitle>

      {error && (
        <div className="mt-8">
          <Notice error={error.message} />
        </div>
      )}

      {!discounts?.length ? (
        <p className="mt-6 admin-card px-6 py-10 text-center text-[14px] opacity-70">No codes yet.</p>
      ) : (
        <div className="mt-4 admin-card overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr>
                <th className="py-3 pr-4 font-normal">Code</th>
                <th className="py-3 pr-4 font-normal">Gives</th>
                <th className="py-3 pr-4 font-normal">On</th>
                <th className="py-3 pr-4 font-normal text-right">Used</th>
                <th className="py-3 pr-4 font-normal">Window</th>
                <th className="py-3 pr-4 font-normal">Status</th>
                <th className="py-3 font-normal" />
              </tr>
            </thead>
            <tbody>
              {discounts.map((d) => {
                const status = discountStatus(d);
                return (
                  <tr key={d.id} style={{ borderTop: "1px solid var(--a-border)" }}>
                    <td className="py-4 pr-4">
                      <Link href={`/admin/discounts/${d.id}`} className="font-semibold text-[14px] qlink">
                        {d.code}
                      </Link>
                      {d.title && <div className="text-[12.5px] opacity-60">{d.title}</div>}
                    </td>
                    <td className="py-4 pr-4">{describeValue(d)}</td>
                    <td className="py-4 pr-4 opacity-80">
                      {d.applies_to === "all" ? "Everything" : d.applies_to === "products" ? "Chosen products" : "Tagged products"}
                    </td>
                    <td className="py-4 pr-4 text-right whitespace-nowrap">
                      {d.used_count}
                      {d.usage_limit !== null && <span className="opacity-60"> / {d.usage_limit}</span>}
                    </td>
                    <td className="py-4 pr-4 whitespace-nowrap opacity-80">
                      {formatDate(d.starts_at)} – {d.ends_at ? formatDate(d.ends_at) : "no end"}
                    </td>
                    <td className="py-4 pr-4">
                      <Pill tone={status.tone}>{status.label}</Pill>
                    </td>
                    <td className="py-4 text-right">
                      <CopyLinkButton url={shareLink(d.code)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
