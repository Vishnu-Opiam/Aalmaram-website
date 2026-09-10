import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { formatPaise } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Products - Aalmaram admin" };

const STATUS_COLOUR: Record<string, string> = {
  active: "var(--kathakali)",
  draft: "rgba(35,47,72,.45)",
  archived: "var(--spice)",
};

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const { q } = await searchParams;

  const db = createAdminClient();
  let query = db
    .from("products")
    .select(
      "id, handle, title, status, updated_at, product_variants ( price_paise, inventory_quantity ), product_images ( url, position )"
    )
    .order("created_at", { ascending: true });

  if (q) query = query.ilike("title", `%${q}%`);

  const { data: products, error } = await query;

  const { data: inventorySetting } = await db
    .from("settings")
    .select("value")
    .eq("key", "inventory")
    .maybeSingle();
  const lowStock = Number(
    (inventorySetting?.value as { low_stock_threshold?: number } | null)?.low_stock_threshold ?? 5
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h1
          className="font-display font-black text-[34px] display-tight"
          style={{ color: "var(--night)" }}
        >
          Products
        </h1>
        <div className="flex items-center gap-5">
          <form action="/admin/products" className="flex items-center gap-3">
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search titles"
              className="preorder-input font-body text-[14px]"
            />
          </form>
          <Link
            href="/admin/products/new"
            className="btn-night px-7 py-3 text-[12px] tracking-[.24em] font-body font-normal"
          >
            New product
          </Link>
        </div>
      </div>

      {error && (
        <p
          className="mt-8 text-[13px] font-body p-3 rounded"
          style={{ color: "var(--spice)", background: "rgba(164,66,44,.08)" }}
        >
          {error.message}
        </p>
      )}

      {!products?.length ? (
        <p className="mt-12 font-body font-light text-[14px] opacity-60">
          {q ? `Nothing matches “${q}”.` : "No products yet. Add the first one."}
        </p>
      ) : (
        <ul className="mt-10 divide-y" style={{ borderColor: "rgba(35,47,72,.12)" }}>
          {products.map((product) => {
            const variant = product.product_variants[0];
            const stock = product.product_variants.reduce(
              (sum, v) => sum + v.inventory_quantity,
              0
            );
            const image = [...product.product_images].sort((a, b) => a.position - b.position)[0];

            return (
              <li key={product.id} className="py-5 flex items-center gap-6">
                <div
                  className="w-12 shrink-0 rounded-sm overflow-hidden"
                  style={{ aspectRatio: "3/4.3", background: "rgba(35,47,72,.08)" }}
                >
                  {image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image.url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/products/${product.id}`}
                    className="font-display italic text-[19px] qlink"
                  >
                    {product.title}
                  </Link>
                  <div className="mt-1 text-[11.5px] font-body font-light opacity-60">
                    /{product.handle}
                    {product.product_variants.length > 1 &&
                      ` · ${product.product_variants.length} variants`}
                  </div>
                </div>

                <div
                  className="text-[10.5px] tracking-[.22em] font-body w-24"
                  style={{ color: STATUS_COLOUR[product.status] ?? "var(--night)" }}
                >
                  {product.status.toUpperCase()}
                </div>

                <div className="font-display text-[17px] w-24 text-right">
                  {variant ? formatPaise(variant.price_paise) : "—"}
                </div>

                <div
                  className="text-[13px] font-body font-light w-28 text-right"
                  style={{ color: stock <= lowStock ? "var(--spice)" : undefined }}
                >
                  {stock} in stock
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
