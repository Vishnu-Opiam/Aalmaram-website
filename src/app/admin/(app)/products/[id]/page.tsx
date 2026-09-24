import Link from "next/link";
import { BackLink, Pill, sentence, type Tone } from "../../ui";
import { notFound } from "next/navigation";
import ImagesPanel from "../ImagesPanel";
import InventoryPanel from "../InventoryPanel";
import ProductForm from "../ProductForm";
import VariantsPanel from "../VariantsPanel";
import { deleteProduct, duplicateProduct, setProductStatus } from "../actions";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Edit product - Aalmaram admin" };

const STATUS_TONE: Record<string, Tone> = { active: "good", draft: "quiet", archived: "bad" };

/** Paise back to a plain rupee string for the form. */
function toRupees(paise: number | null): string {
  if (paise === null) return "";
  return String(paise / 100);
}

const actionButton =
  "text-[13px] font-medium px-3 py-1.5 rounded-md border border-[var(--a-border)] bg-white hover:bg-[var(--a-hover)]";

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; duplicated?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { saved, duplicated } = await searchParams;

  const db = createAdminClient();
  // Product, its stock history and its order lines are all keyed on the id in
  // the URL, so they go out together instead of one after another. History is
  // filtered through its variant's product_id, which needs no variant ids first.
  const [{ data: product }, { data: history }, { data: soldLines }] = await Promise.all([
    db
      .from("products")
      .select(
        "id, handle, title, subtitle, description_md, status, tags, product_type, vendor, hsn_code, seo_title, seo_description, product_variants ( id, title, sku, barcode, price_paise, compare_at_paise, cost_paise, inventory_quantity, weight_grams, length_cm, breadth_cm, height_cm, position, created_at ), product_images ( id, url, alt, position, created_at )"
      )
      .eq("id", id)
      .maybeSingle(),
    db
      .from("inventory_adjustments")
      .select("id, variant_id, delta, reason, note, created_by, created_at, product_variants!inner ( product_id )")
      .eq("product_variants.product_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
    db.from("order_items").select("variant_id").eq("product_id", id),
  ]);

  if (!product) notFound();

  const variants = [...product.product_variants].sort(
    (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)
  );
  const images = [...product.product_images].sort(
    (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)
  );
  const variant = variants[0];

  const orderedCount = soldLines?.length ?? 0;
  const everOrdered = orderedCount > 0;
  const soldVariants = new Set((soldLines ?? []).map((l) => l.variant_id));
  const stock = variants.reduce((sum, v) => sum + v.inventory_quantity, 0);

  return (
    <div>
      <BackLink href="/admin/products">Products</BackLink>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-semibold text-[26px]" style={{ color: "var(--night)" }}>
            {product.title}
          </h1>
          <Pill tone={STATUS_TONE[product.status] ?? "quiet"}>{sentence(product.status)}</Pill>
          {stock === 0 && <Pill tone="bad">Sold out</Pill>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {product.status === "active" && (
            <Link href={`/products/${product.handle}`} target="_blank" className={actionButton}>
              View on site ↗
            </Link>
          )}
          {product.status !== "active" && (
            <form action={setProductStatus}>
              <input type="hidden" name="id" value={product.id} />
              <input type="hidden" name="status" value="active" />
              <button type="submit" className={actionButton} style={{ color: "#0c664b" }}>
                Publish
              </button>
            </form>
          )}
          <form action={duplicateProduct}>
            <input type="hidden" name="id" value={product.id} />
            <button type="submit" className={actionButton}>
              Duplicate
            </button>
          </form>
          {product.status !== "archived" ? (
            <form action={setProductStatus}>
              <input type="hidden" name="id" value={product.id} />
              <input type="hidden" name="status" value="archived" />
              <button type="submit" className={actionButton} style={{ color: "var(--spice)" }}>
                Archive
              </button>
            </form>
          ) : (
            <form action={setProductStatus}>
              <input type="hidden" name="id" value={product.id} />
              <input type="hidden" name="status" value="draft" />
              <button type="submit" className={actionButton}>
                Unarchive
              </button>
            </form>
          )}
          {!everOrdered && (
            <form action={deleteProduct}>
              <input type="hidden" name="id" value={product.id} />
              <button type="submit" className={actionButton} style={{ color: "var(--spice)" }}>
                Delete
              </button>
            </form>
          )}
        </div>
      </div>

      {saved && (
        <p className="mt-4 text-[13px]" style={{ color: "var(--kathakali)" }}>
          Product created.
        </p>
      )}
      {duplicated && (
        <p className="mt-4 text-[13px]" style={{ color: "var(--kathakali)" }}>
          This is a copy, saved as a draft with no stock. Rename it, set its stock, then publish.
        </p>
      )}
      {everOrdered && (
        <p className="mt-3 text-[12px] opacity-60">
          This product appears on {orderedCount} order line{orderedCount === 1 ? "" : "s"}, so it can
          be archived but not deleted.
        </p>
      )}

      <ProductForm
        key={`${product.id}-${variants.length}`}
        mode="edit"
        variantCount={variants.length}
        values={{
          id: product.id,
          variantId: variant?.id,
          title: product.title,
          handle: product.handle,
          subtitle: product.subtitle,
          descriptionMd: product.description_md,
          status: product.status,
          tags: product.tags.join(", "),
          productType: product.product_type,
          vendor: product.vendor,
          hsnCode: product.hsn_code,
          seoTitle: product.seo_title ?? "",
          seoDescription: product.seo_description ?? "",
          price: toRupees(variant?.price_paise ?? 0),
          compareAt: toRupees(variant?.compare_at_paise ?? null),
          cost: toRupees(variant?.cost_paise ?? null),
          sku: variant?.sku ?? "",
          barcode: variant?.barcode ?? "",
          inventoryQuantity: String(variant?.inventory_quantity ?? 0),
          weightGrams: String(variant?.weight_grams ?? 0),
          lengthCm: String(variant?.length_cm ?? 0),
          breadthCm: String(variant?.breadth_cm ?? 0),
          heightCm: String(variant?.height_cm ?? 0),
        }}
      />

      <div className="mt-4">
        <VariantsPanel
          productId={product.id}
          variants={variants.map((v) => ({ ...v, sold: soldVariants.has(v.id) }))}
        />
      </div>

      <div className="mt-4 grid md:grid-cols-2 gap-4">
        <ImagesPanel productId={product.id} images={images} />
        {variants.length > 0 && (
          <InventoryPanel
            variants={variants.map((v) => ({ id: v.id, title: v.title, quantity: v.inventory_quantity }))}
            history={history ?? []}
          />
        )}
      </div>
    </div>
  );
}
