import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Notice, PageTitle } from "../ui";
import ProductTable, { type ProductRow } from "./ProductTable";

export const metadata = { title: "Products - Aalmaram admin" };

const TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "draft", label: "Draft" },
  { key: "archived", label: "Archived" },
  { key: "sold_out", label: "Sold out" },
] as const;

const SORTS = {
  created: "Oldest first",
  newest: "Newest first",
  title: "Title A–Z",
  updated: "Recently updated",
  price_low: "Price, low to high",
  price_high: "Price, high to low",
  stock_low: "Stock, low to high",
} as const;
type Sort = keyof typeof SORTS;

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; sort?: string }>;
}) {
  await requireAdmin();
  const { q, status = "all", sort: sortParam } = await searchParams;
  const sort: Sort = sortParam && sortParam in SORTS ? (sortParam as Sort) : "created";

  const db = createAdminClient();
  let query = db
    .from("products")
    .select(
      "id, handle, title, status, product_type, vendor, tags, created_at, updated_at, product_variants ( price_paise, inventory_quantity, sku ), product_images ( url, position )"
    )
    .order("created_at", { ascending: true });

  // PostgREST filter syntax is built from this, so its punctuation is dropped.
  const term = (q ?? "").replace(/[%,(){}"\*:.]/g, " ").trim();
  if (term) {
    // Title, type, vendor or a tag; SKU is matched below, since it lives on the variants.
    query = query.or(
      `title.ilike.%${term}%,product_type.ilike.%${term}%,vendor.ilike.%${term}%,tags.cs.{"${term}"}`
    );
  }

  const [{ data: products, error }, { data: skuHits }, { data: inventorySetting }] = await Promise.all([
    query,
    term
      ? db.from("product_variants").select("product_id").ilike("sku", `%${term}%`)
      : Promise.resolve({ data: [] as { product_id: string }[] }),
    db.from("settings").select("value").eq("key", "inventory").maybeSingle(),
  ]);

  let all = products ?? [];
  const skuIds = new Set((skuHits ?? []).map((s) => s.product_id));
  const missing = [...skuIds].filter((id) => !all.some((p) => p.id === id));
  if (missing.length) {
    const { data: extra } = await db
      .from("products")
      .select(
        "id, handle, title, status, product_type, vendor, tags, created_at, updated_at, product_variants ( price_paise, inventory_quantity, sku ), product_images ( url, position )"
      )
      .in("id", missing);
    all = [...all, ...(extra ?? [])];
  }

  const lowStock = Number(
    (inventorySetting?.value as { low_stock_threshold?: number } | null)?.low_stock_threshold ?? 5
  );

  const rows: (ProductRow & { createdAt: string; updatedAt: string })[] = all.map((p) => {
    const prices = p.product_variants.map((v) => v.price_paise);
    return {
      id: p.id,
      title: p.title,
      handle: p.handle,
      status: p.status,
      productType: p.product_type,
      image: [...p.product_images].sort((a, b) => a.position - b.position)[0]?.url ?? null,
      minPricePaise: prices.length ? Math.min(...prices) : null,
      maxPricePaise: prices.length ? Math.max(...prices) : null,
      stock: p.product_variants.reduce((sum, v) => sum + v.inventory_quantity, 0),
      variantCount: p.product_variants.length,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    };
  });

  const counts = Object.fromEntries(
    TABS.map((t) => [
      t.key,
      rows.filter((r) =>
        t.key === "all" ? true : t.key === "sold_out" ? r.stock === 0 : r.status === t.key
      ).length,
    ])
  );

  const visible = rows
    .filter((r) =>
      status === "all" ? true : status === "sold_out" ? r.stock === 0 : r.status === status
    )
    .sort((a, b) => {
      switch (sort) {
        case "newest":
          return b.createdAt.localeCompare(a.createdAt);
        case "title":
          return a.title.localeCompare(b.title);
        case "updated":
          return b.updatedAt.localeCompare(a.updatedAt);
        case "price_low":
          return (a.minPricePaise ?? 0) - (b.minPricePaise ?? 0);
        case "price_high":
          return (b.maxPricePaise ?? 0) - (a.maxPricePaise ?? 0);
        case "stock_low":
          return a.stock - b.stock;
        default:
          return a.createdAt.localeCompare(b.createdAt);
      }
    });

  const href = (params: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { q, status, sort: sort === "created" ? undefined : sort, ...params };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "status" && v === "all")) sp.set(k, v);
    const s = sp.toString();
    return `/admin/products${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <PageTitle
        subtitle="Everything the storefront can sell. Click a product to edit it."
        aside={
          <Link href="/admin/products/new" className="btn-night px-4 py-2.5 text-[13px] rounded-lg">
            Add product
          </Link>
        }
      >
        Products
      </PageTitle>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1 text-[13px]" aria-label="Filter by status">
          {TABS.map((t) => {
            const active = status === t.key;
            return (
              <Link
                key={t.key}
                href={href({ status: t.key })}
                aria-current={active ? "page" : undefined}
                className="px-3 py-1.5 rounded-md font-medium"
                style={
                  active
                    ? { background: "var(--night)", color: "#fff" }
                    : { background: "rgba(35,47,72,.06)" }
                }
              >
                {t.label} <span className="opacity-60">{counts[t.key]}</span>
              </Link>
            );
          })}
        </nav>

        <form action="/admin/products" className="flex flex-wrap items-center gap-2">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search title, SKU, type, tag"
            aria-label="Search products"
            className="preorder-input !mt-0 w-[230px]"
          />
          <select name="sort" defaultValue={sort} aria-label="Sort" className="preorder-input !mt-0 w-[180px]">
            {Object.entries(SORTS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button type="submit" className="text-[13px] font-medium px-3 py-1.5 rounded-md border border-[var(--a-border)] bg-white">
            Apply
          </button>
        </form>
      </div>

      {error && (
        <div className="mt-6">
          <Notice error={error.message} />
        </div>
      )}

      {!visible.length ? (
        <p className="mt-4 admin-card px-6 py-10 text-center text-[14px] opacity-70">
          {q ? `Nothing matches “${q}”.` : status === "all" ? "No products yet. Add the first one." : "Nothing here."}
        </p>
      ) : (
        <ProductTable key={`${status}-${sort}-${q ?? ""}`} rows={visible} lowStock={lowStock} />
      )}
    </div>
  );
}
