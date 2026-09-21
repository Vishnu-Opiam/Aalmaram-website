import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import DiscountForm from "../DiscountForm";
import { BackLink, PageTitle } from "../../ui";

export const metadata = { title: "New discount - Aalmaram admin" };

export default async function NewDiscountPage() {
  await requireAdmin();
  const db = createAdminClient();
  const { data: products } = await db
    .from("products")
    .select("id, title, status, tags")
    .neq("status", "archived")
    .order("title");

  const tags = [...new Set((products ?? []).flatMap((p) => p.tags ?? []))].sort();

  return (
    <div>
      <BackLink href="/admin/discounts">Discounts</BackLink>
      <div className="mt-5">
        <PageTitle>New code</PageTitle>
      </div>
      <DiscountForm
        mode="create"
        products={products ?? []}
        tags={tags}
        values={{
          code: "",
          title: "",
          type: "percentage",
          value: "",
          appliesTo: "all",
          productIds: [],
          tag: "",
          minSubtotal: "",
          usageLimit: "",
          usageLimitPerCustomer: "",
          oncePerCustomer: false,
          startsAt: "",
          endsAt: "",
          active: true,
        }}
      />
    </div>
  );
}
