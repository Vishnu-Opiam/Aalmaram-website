import Link from "next/link";
import { notFound } from "next/navigation";
import ImagesPanel from "../ImagesPanel";
import InventoryPanel from "../InventoryPanel";
import ProductForm from "../ProductForm";
import { deleteProduct, setProductStatus } from "../actions";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Edit product - Aalmaram admin" };

/** Paise back to a plain rupee string for the form. */
function toRupees(paise: number | null): string {
  if (paise === null) return "";
  return String(paise / 100);
}

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { saved } = await searchParams;

  const db = createAdminClient();
  const { data: product } = await db
    .from("products")
    .select(
      "id, handle, title, subtitle, description_md, status, tags, hsn_code, seo_title, seo_description, product_variants ( id, title, sku, price_paise, compare_at_paise, inventory_quantity, weight_grams, length_cm, breadth_cm, height_cm, position ), product_images ( id, url, alt, position )"
    )
    .eq("id", id)
    .maybeSingle();

  if (!product) notFound();

  const variant = [...product.product_variants].sort((a, b) => a.position - b.position)[0];
  const images = [...product.product_images].sort((a, b) => a.position - b.position);

  const { data: history } = variant
    ? await db
        .from("inventory_adjustments")
        .select("id, delta, reason, note, created_by, created_at")
        .eq("variant_id", variant.id)
        .order("created_at", { ascending: false })
        .limit(10)
    : { data: [] };

  const { count: orderedCount } = await db
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", product.id);

  const everOrdered = (orderedCount ?? 0) > 0;

  return (
    <div>
      <Link href="/admin/products" className="qlink text-[11px] tracking-[.26em] font-body font-light">
        ← PRODUCTS
      </Link>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-6">
        <h1
          className="font-display font-black text-[34px] display-tight"
          style={{ color: "var(--night)" }}
        >
          {product.title}
        </h1>
        <div className="flex items-center gap-5">
          {product.status === "active" && (
            <Link
              href={`/products/${product.handle}`}
              target="_blank"
              className="qlink text-[11.5px] tracking-[.22em] font-body font-light"
            >
              VIEW ON SITE
            </Link>
          )}
          {product.status !== "archived" ? (
            <form action={setProductStatus}>
              <input type="hidden" name="id" value={product.id} />
              <input type="hidden" name="status" value="archived" />
              <button
                type="submit"
                className="text-[11.5px] tracking-[.22em] font-body font-light"
                style={{ color: "var(--spice)" }}
              >
                ARCHIVE
              </button>
            </form>
          ) : (
            <form action={setProductStatus}>
              <input type="hidden" name="id" value={product.id} />
              <input type="hidden" name="status" value="draft" />
              <button type="submit" className="qlink text-[11.5px] tracking-[.22em] font-body font-light">
                UNARCHIVE
              </button>
            </form>
          )}
          {!everOrdered && (
            <form action={deleteProduct}>
              <input type="hidden" name="id" value={product.id} />
              <button
                type="submit"
                className="text-[11.5px] tracking-[.22em] font-body font-light opacity-70"
                style={{ color: "var(--spice)" }}
              >
                DELETE
              </button>
            </form>
          )}
        </div>
      </div>

      {saved && (
        <p className="mt-6 text-[13px] font-body" style={{ color: "var(--kathakali)" }}>
          Product created.
        </p>
      )}
      {everOrdered && (
        <p className="mt-3 text-[12px] font-body font-light opacity-60">
          This product appears on {orderedCount} order line{orderedCount === 1 ? "" : "s"}, so it can
          be archived but not deleted.
        </p>
      )}

      <ProductForm
        mode="edit"
        values={{
          id: product.id,
          variantId: variant?.id,
          title: product.title,
          handle: product.handle,
          subtitle: product.subtitle,
          descriptionMd: product.description_md,
          status: product.status,
          tags: product.tags.join(", "),
          hsnCode: product.hsn_code,
          seoTitle: product.seo_title ?? "",
          seoDescription: product.seo_description ?? "",
          price: toRupees(variant?.price_paise ?? 0),
          compareAt: toRupees(variant?.compare_at_paise ?? null),
          sku: variant?.sku ?? "",
          inventoryQuantity: String(variant?.inventory_quantity ?? 0),
          weightGrams: String(variant?.weight_grams ?? 0),
          lengthCm: String(variant?.length_cm ?? 0),
          breadthCm: String(variant?.breadth_cm ?? 0),
          heightCm: String(variant?.height_cm ?? 0),
        }}
      />

      <div className="mt-16 grid md:grid-cols-2 gap-14">
        <ImagesPanel productId={product.id} images={images} />
        {variant && (
          <InventoryPanel
            variantId={variant.id}
            quantity={variant.inventory_quantity}
            history={history ?? []}
          />
        )}
      </div>
    </div>
  );
}
