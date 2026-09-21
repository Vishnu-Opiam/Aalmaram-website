"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAudit, requireAdmin, type AdminSession } from "@/lib/admin-auth";
import { kickOutbox } from "@/lib/outbox";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ActionState {
  error: string;
  ok?: string;
}

const IMAGE_BUCKET = "product-images";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif"];
const STATUSES = ["draft", "active", "archived"] as const;
type Status = (typeof STATUSES)[number];

/** Refreshes every page that renders catalogue data. */
function revalidateStorefront(handle?: string) {
  revalidatePath("/");
  revalidatePath("/shop");
  revalidatePath("/admin/products");
  if (handle) revalidatePath(`/products/${handle}`);
}

async function revalidateProduct(productId: string) {
  const { data } = await createAdminClient()
    .from("products")
    .select("handle")
    .eq("id", productId)
    .maybeSingle();
  revalidateStorefront(data?.handle);
  revalidatePath(`/admin/products/${productId}`);
}

const rupees = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d+(\.\d{1,2})?$/.test(v), "Use a number like 700 or 699.50");

const count = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d+$/.test(v), "Stock and weight are whole numbers.");

const measure = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d+(\.\d{1,2})?$/.test(v), "Dimensions are numbers like 21 or 21.5");

/** Rupees from a form field, stored as integer paise. Never a float in the database. */
function toPaise(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  return Math.round(Number(trimmed) * 100);
}

const variantFields = {
  price: rupees,
  compare_at: rupees,
  cost: rupees,
  sku: z.string().trim(),
  barcode: z.string().trim(),
  inventory_quantity: count,
  weight_grams: count,
  length_cm: measure,
  breadth_cm: measure,
  height_cm: measure,
};

const productSchema = z.object({
  title: z.string().trim().min(1, "A title is required."),
  handle: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Handle must be lowercase words joined by hyphens."),
  subtitle: z.string().trim(),
  description_md: z.string(),
  status: z.enum(STATUSES),
  tags: z.string(),
  product_type: z.string().trim(),
  vendor: z.string().trim(),
  hsn_code: z.string().trim(),
  seo_title: z.string().trim(),
  seo_description: z.string().trim(),
  ...variantFields,
});

const variantSchema = z.object({
  title: z.string().trim().min(1, "Give the variant a name, like Hardcover."),
  ...variantFields,
});

function read<T extends z.ZodObject>(schema: T, formData: FormData) {
  const raw = Object.fromEntries(
    Object.keys(schema.shape).map((k) => [k, String(formData.get(k) ?? "")])
  );
  return schema.safeParse(raw);
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "That didn't look right.";
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function splitTags(tags: string): string[] {
  return [...new Set(tags.split(",").map((t) => t.trim()).filter(Boolean))];
}

/** The variant columns every form shares. Stock is left out: it has its own path. */
function variantColumns(d: z.infer<typeof variantSchema> | z.infer<typeof productSchema>) {
  return {
    sku: d.sku || null,
    barcode: d.barcode || null,
    price_paise: toPaise(d.price) ?? 0,
    compare_at_paise: toPaise(d.compare_at),
    cost_paise: toPaise(d.cost),
    weight_grams: Number(d.weight_grams || 0),
    length_cm: Number(d.length_cm || 0),
    breadth_cm: Number(d.breadth_cm || 0),
    height_cm: Number(d.height_cm || 0),
  };
}

function uniqueError(error: { code?: string; message: string }, what: string): string {
  if (error.code === "23505") {
    return error.message.includes("sku") ? "Another variant already uses that SKU." : `${what} is already taken.`;
  }
  return `Could not save: ${error.message}`;
}

export async function createProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "A title is required." };
  const handle = String(formData.get("handle") ?? "").trim() || slugify(title);
  formData.set("handle", handle);

  const parsed = read(productSchema, formData);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;

  const db = createAdminClient();
  const { data: product, error } = await db
    .from("products")
    .insert({
      title,
      handle,
      subtitle: d.subtitle,
      description_md: d.description_md,
      status: d.status,
      tags: splitTags(d.tags),
      product_type: d.product_type,
      vendor: d.vendor,
      hsn_code: d.hsn_code || "4901",
      seo_title: d.seo_title || null,
      seo_description: d.seo_description || null,
    })
    .select("id, handle")
    .single();

  if (error) return { error: uniqueError(error, `The handle "${handle}"`) };

  // Every product needs at least one variant; a single-variant product edits
  // it through this form, and more can be added on the product page.
  const { error: variantError } = await db.from("product_variants").insert({
    product_id: product.id,
    title: "Default",
    ...variantColumns(d),
    inventory_quantity: Number(d.inventory_quantity || 0),
  });

  if (variantError) return { error: `Product saved, but the variant failed: ${variantError.message}` };

  await recordAudit(session, {
    action: "product.create",
    entityType: "product",
    entityId: product.id,
    diff: { title, handle },
  });

  revalidateStorefront(product.handle);
  redirect(`/admin/products/${product.id}?saved=1`);
}

export async function updateProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const variantId = String(formData.get("variant_id") ?? "");
  if (!id) return { error: "Missing product id." };

  const parsed = read(productSchema, formData);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;

  const db = createAdminClient();
  const { data: before } = await db.from("products").select("handle").eq("id", id).maybeSingle();
  const { data: product, error } = await db
    .from("products")
    .update({
      title: d.title,
      handle: d.handle,
      subtitle: d.subtitle,
      description_md: d.description_md,
      status: d.status,
      tags: splitTags(d.tags),
      product_type: d.product_type,
      vendor: d.vendor,
      hsn_code: d.hsn_code || "4901",
      seo_title: d.seo_title || null,
      seo_description: d.seo_description || null,
    })
    .eq("id", id)
    .select("handle")
    .single();

  if (error) return { error: uniqueError(error, `The handle "${d.handle}"`) };

  // Present only while the product has a single variant; with several, each
  // one is edited in the Variants panel.
  if (variantId) {
    const { error: variantError } = await db
      .from("product_variants")
      .update(variantColumns(d))
      .eq("id", variantId);

    if (variantError) return { error: uniqueError(variantError, "That value") };
  }

  await recordAudit(session, {
    action: "product.update",
    entityType: "product",
    entityId: id,
    diff: { title: d.title, handle: d.handle, status: d.status, price: d.price },
  });

  if (before?.handle && before.handle !== product.handle) revalidateStorefront(before.handle);
  revalidateStorefront(product.handle);
  revalidatePath(`/admin/products/${id}`);
  return { error: "", ok: "Saved." };
}

export async function setProductStatus(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !STATUSES.includes(status as Status)) return;

  const db = createAdminClient();
  const { data } = await db
    .from("products")
    .update({ status: status as Status })
    .eq("id", id)
    .select("handle")
    .single();

  await recordAudit(session, {
    action: `product.${status}`,
    entityType: "product",
    entityId: id,
    diff: { status },
  });
  revalidateStorefront(data?.handle);
  revalidatePath(`/admin/products/${id}`);
}

/**
 * A copy to start the next book from: same details, variants and images, no
 * stock, always a draft so nothing half-edited reaches the shop.
 */
export async function duplicateProduct(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const db = createAdminClient();
  const { data: source } = await db
    .from("products")
    .select("*, product_variants ( * ), product_images ( url, alt, position )")
    .eq("id", id)
    .single();
  if (!source) return;

  let handle = `${source.handle}-copy`;
  for (let n = 2; ; n++) {
    const { count } = await db
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("handle", handle);
    if (!count) break;
    handle = `${source.handle}-copy-${n}`;
  }

  const { data: copy, error } = await db
    .from("products")
    .insert({
      handle,
      title: `Copy of ${source.title}`,
      subtitle: source.subtitle,
      description_md: source.description_md,
      status: "draft",
      tags: source.tags,
      product_type: source.product_type,
      vendor: source.vendor,
      hsn_code: source.hsn_code,
      requires_shipping: source.requires_shipping,
      seo_title: source.seo_title,
      seo_description: source.seo_description,
    })
    .select("id")
    .single();
  if (error || !copy) throw new Error(`Could not duplicate: ${error?.message}`);

  const variants = source.product_variants.length
    ? source.product_variants
    : [{ title: "Default", price_paise: 0, position: 0 } as (typeof source.product_variants)[number]];
  await db.from("product_variants").insert(
    variants.map((v) => ({
      product_id: copy.id,
      title: v.title,
      sku: null, // SKUs are unique; the copy gets its own.
      barcode: null,
      price_paise: v.price_paise,
      compare_at_paise: v.compare_at_paise,
      cost_paise: v.cost_paise,
      inventory_quantity: 0,
      weight_grams: v.weight_grams,
      length_cm: v.length_cm,
      breadth_cm: v.breadth_cm,
      height_cm: v.height_cm,
      position: v.position,
    }))
  );

  if (source.product_images.length) {
    await db.from("product_images").insert(
      source.product_images.map((i) => ({ product_id: copy.id, url: i.url, alt: i.alt, position: i.position }))
    );
  }

  await recordAudit(session, {
    action: "product.duplicate",
    entityType: "product",
    entityId: copy.id,
    diff: { from: id },
  });
  revalidatePath("/admin/products");
  redirect(`/admin/products/${copy.id}?duplicated=1`);
}

/**
 * Hard delete, allowed only while nothing has ever been ordered — order_items
 * keeps snapshots, but the foreign key would still null out and lose the trail.
 */
export async function deleteProduct(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const db = createAdminClient();
  const { count } = await db
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id);

  if (count && count > 0) {
    formData.set("status", "archived");
    await setProductStatus(formData);
    return;
  }

  const { data: images } = await db.from("product_images").select("url").eq("product_id", id);
  await db.from("products").delete().eq("id", id);
  for (const image of images ?? []) await removeStoredImage(image.url);

  await recordAudit(session, { action: "product.delete", entityType: "product", entityId: id });
  revalidateStorefront();
  redirect("/admin/products");
}

/** Sets stock to an exact number through adjust_inventory, so the change is logged. */
async function setStock(
  session: AdminSession,
  variantId: string,
  target: number,
  reason: string,
  note: string
): Promise<{ error?: string; next?: number }> {
  const db = createAdminClient();
  const { data: variant } = await db
    .from("product_variants")
    .select("inventory_quantity")
    .eq("id", variantId)
    .maybeSingle();
  if (!variant) return { error: "That variant no longer exists." };

  const delta = target - variant.inventory_quantity;
  if (delta === 0) return { next: target };

  const { data: next, error } = await db.rpc("adjust_inventory", {
    p_variant_id: variantId,
    p_delta: delta,
    p_reason: reason,
    p_note: note,
    p_actor: session.email,
  });
  if (error) {
    // A sale landed between the read and the write: the count moved under us.
    if (error.code === "23514") return { error: "Stock changed while saving. Try again." };
    return { error: `Could not set stock: ${error.message}` };
  }
  await recordAudit(session, {
    action: "inventory.adjust",
    entityType: "product_variant",
    entityId: variantId,
    diff: { delta, reason, from: next - delta, to: next },
  });
  return { next };
}

/** Selected rows on the product list, all at once. */
export async function bulkUpdateProducts(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  const op = String(formData.get("op") ?? "");
  if (!ids.length) return;

  const db = createAdminClient();

  if (STATUSES.includes(op as Status)) {
    await db.from("products").update({ status: op as Status }).in("id", ids);
    for (const id of ids) {
      await recordAudit(session, { action: `product.${op}`, entityType: "product", entityId: id, diff: { status: op, bulk: true } });
    }
  } else if (op === "sold_out") {
    const { data: variants } = await db.from("product_variants").select("id").in("product_id", ids);
    for (const v of variants ?? []) {
      await setStock(session, v.id, 0, "manual", "Marked sold out");
    }
    kickOutbox();
  } else {
    return;
  }

  revalidateStorefront();
  const { data: handles } = await db.from("products").select("handle").in("id", ids);
  for (const h of handles ?? []) revalidatePath(`/products/${h.handle}`);
}

// ── Variants ────────────────────────────────────────────────────────────────

/** Adds a variant (no id) or edits one (with id). */
export async function saveVariant(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const productId = String(formData.get("product_id") ?? "");
  const variantId = String(formData.get("variant_id") ?? "");
  if (!productId) return { error: "Missing product." };

  const parsed = read(variantSchema, formData);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;

  const db = createAdminClient();

  if (variantId) {
    const { error } = await db
      .from("product_variants")
      .update({ title: d.title, ...variantColumns(d) })
      .eq("id", variantId)
      .eq("product_id", productId);
    if (error) return { error: uniqueError(error, "That value") };
    await recordAudit(session, {
      action: "variant.update",
      entityType: "product_variant",
      entityId: variantId,
      diff: { title: d.title, price: d.price },
    });
  } else {
    const { data: last } = await db
      .from("product_variants")
      .select("position")
      .eq("product_id", productId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: created, error } = await db
      .from("product_variants")
      .insert({
        product_id: productId,
        title: d.title,
        ...variantColumns(d),
        inventory_quantity: 0,
        position: (last?.position ?? -1) + 1,
      })
      .select("id")
      .single();
    if (error) return { error: uniqueError(error, "That value") };

    // Opening stock goes through the log like every other change.
    const opening = Number(d.inventory_quantity || 0);
    if (opening > 0) await setStock(session, created.id, opening, "restock", "Opening stock");

    await recordAudit(session, {
      action: "variant.create",
      entityType: "product_variant",
      entityId: created.id,
      diff: { title: d.title, price: d.price },
    });
  }

  await revalidateProduct(productId);
  return { error: "", ok: variantId ? "Variant saved." : "Variant added." };
}

/** Removes a variant, unless it is the last one or has been sold. */
export async function deleteVariant(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const variantId = String(formData.get("variant_id") ?? "");
  if (!variantId) return;

  const db = createAdminClient();
  const { data: variant } = await db
    .from("product_variants")
    .select("product_id")
    .eq("id", variantId)
    .maybeSingle();
  if (!variant) return;

  const [{ count: siblings }, { count: sold }] = await Promise.all([
    db.from("product_variants").select("id", { count: "exact", head: true }).eq("product_id", variant.product_id),
    db.from("order_items").select("id", { count: "exact", head: true }).eq("variant_id", variantId),
  ]);
  if ((siblings ?? 0) <= 1 || (sold ?? 0) > 0) return;

  await db.from("product_variants").delete().eq("id", variantId);
  await recordAudit(session, { action: "variant.delete", entityType: "product_variant", entityId: variantId });
  await revalidateProduct(variant.product_id);
}

/** Moves a variant one place up or down; the first one is what the shop shows first. */
export async function moveVariant(formData: FormData): Promise<void> {
  await requireAdmin();
  const variantId = String(formData.get("variant_id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const db = createAdminClient();
  const { data: variant } = await db
    .from("product_variants")
    .select("product_id")
    .eq("id", variantId)
    .maybeSingle();
  if (!variant) return;

  const { data: all } = await db
    .from("product_variants")
    .select("id, position, created_at")
    .eq("product_id", variant.product_id)
    .order("position")
    .order("created_at");
  await reorder(all ?? [], variantId, direction, (id, position) =>
    db.from("product_variants").update({ position }).eq("id", id)
  );
  await revalidateProduct(variant.product_id);
}

async function reorder(
  rows: { id: string }[],
  id: string,
  direction: string,
  write: (id: string, position: number) => PromiseLike<unknown>
) {
  const ids = rows.map((r) => r.id);
  const from = ids.indexOf(id);
  if (from === -1) return;
  const to = direction === "first" ? 0 : direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= ids.length || to === from) return;
  ids.splice(to, 0, ...ids.splice(from, 1));
  await Promise.all(ids.map((rowId, position) => write(rowId, position)));
}

// ── Images ──────────────────────────────────────────────────────────────────

export async function uploadImage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();

  const productId = String(formData.get("product_id") ?? "");
  const file = formData.get("file");
  if (!productId || !(file instanceof File) || file.size === 0) {
    return { error: "Choose an image first." };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { error: "Images must be PNG, JPEG, WebP or AVIF." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "That image is over 5 MB. Please shrink it first." };
  }

  const db = createAdminClient();
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const path = `${productId}/${randomUUID()}.${extension}`;

  const { error: uploadError } = await db.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

  const {
    data: { publicUrl },
  } = db.storage.from(IMAGE_BUCKET).getPublicUrl(path);

  const { data: last } = await db
    .from("product_images")
    .select("position")
    .eq("product_id", productId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error: rowError } = await db.from("product_images").insert({
    product_id: productId,
    url: publicUrl,
    alt: String(formData.get("alt") ?? ""),
    position: (last?.position ?? -1) + 1,
  });

  if (rowError) {
    // Don't leave an orphan in the bucket if the row didn't land.
    await db.storage.from(IMAGE_BUCKET).remove([path]);
    return { error: `Could not attach the image: ${rowError.message}` };
  }

  await recordAudit(session, {
    action: "product.image.add",
    entityType: "product",
    entityId: productId,
    diff: { path },
  });

  await revalidateProduct(productId);
  return { error: "", ok: "Image added." };
}

/**
 * Removes the stored file, but only when it lives in our bucket (the seeded
 * cover is a path in /public) and no other product — a duplicate — still uses it.
 */
async function removeStoredImage(url: string) {
  const db = createAdminClient();
  const marker = `/${IMAGE_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return;
  const { count } = await db
    .from("product_images")
    .select("id", { count: "exact", head: true })
    .eq("url", url);
  if (count) return;
  await db.storage.from(IMAGE_BUCKET).remove([url.slice(index + marker.length)]);
}

export async function deleteImage(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const imageId = String(formData.get("image_id") ?? "");
  if (!imageId) return;

  const db = createAdminClient();
  const { data: image } = await db
    .from("product_images")
    .select("id, url, product_id")
    .eq("id", imageId)
    .single();
  if (!image) return;

  await db.from("product_images").delete().eq("id", imageId);
  await removeStoredImage(image.url);

  await recordAudit(session, {
    action: "product.image.remove",
    entityType: "product",
    entityId: image.product_id,
  });

  await revalidateProduct(image.product_id);
}

/** Reorders images: up, down, or straight to first (the cover). */
export async function moveImage(formData: FormData): Promise<void> {
  await requireAdmin();
  const imageId = String(formData.get("image_id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const db = createAdminClient();
  const { data: image } = await db
    .from("product_images")
    .select("product_id")
    .eq("id", imageId)
    .maybeSingle();
  if (!image) return;

  const { data: all } = await db
    .from("product_images")
    .select("id, position, created_at")
    .eq("product_id", image.product_id)
    .order("position")
    .order("created_at");
  await reorder(all ?? [], imageId, direction, (id, position) =>
    db.from("product_images").update({ position }).eq("id", id)
  );
  await revalidateProduct(image.product_id);
}

export async function updateImageAlt(formData: FormData): Promise<void> {
  await requireAdmin();
  const imageId = String(formData.get("image_id") ?? "");
  const alt = String(formData.get("alt") ?? "").trim();
  const db = createAdminClient();
  const { data: image } = await db
    .from("product_images")
    .update({ alt })
    .eq("id", imageId)
    .select("product_id")
    .maybeSingle();
  if (image) await revalidateProduct(image.product_id);
}

// ── Stock ───────────────────────────────────────────────────────────────────

const REASONS = ["restock", "manual", "cancellation", "refund", "import"] as const;

/**
 * The only way stock moves outside an order or a refund. adjust_inventory()
 * applies the change and writes its adjustment row in one guarded statement,
 * so a count can never go below zero, and a change that didn't happen is never
 * logged as if it had.
 *
 * `mode` is "add" (a +/- change) or "set" (an exact count, turned into the
 * change that gets there).
 */
export async function adjustInventory(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdmin();

  const variantId = String(formData.get("variant_id") ?? "");
  const mode = String(formData.get("mode") ?? "add");
  const amount = Number(String(formData.get("delta") ?? "0").replace(/^\+/, ""));
  const reason = String(formData.get("reason") ?? "manual");
  const note = String(formData.get("note") ?? "");

  if (!variantId) return { error: "Missing variant." };
  if (!REASONS.includes(reason as (typeof REASONS)[number])) {
    return { error: "Pick a reason." };
  }

  const db = createAdminClient();
  let next: number;

  if (mode === "set") {
    if (!Number.isInteger(amount) || amount < 0) return { error: "Enter the new count, 0 or more." };
    const result = await setStock(session, variantId, amount, reason, note);
    if (result.error) return { error: result.error };
    next = result.next!;
  } else {
    if (!Number.isInteger(amount) || amount === 0) {
      return { error: "Enter a whole number, positive or negative." };
    }
    const { data, error: adjustError } = await db.rpc("adjust_inventory", {
      p_variant_id: variantId,
      p_delta: amount,
      p_reason: reason,
      p_note: note,
      p_actor: session.email,
    });

    if (adjustError) {
      if (adjustError.code === "P0002") return { error: "That variant no longer exists." };
      if (adjustError.code === "23514") {
        return { error: "That would take stock below zero. Nothing was changed." };
      }
      return { error: `Could not adjust stock: ${adjustError.message}` };
    }
    next = data;
    await recordAudit(session, {
      action: "inventory.adjust",
      entityType: "product_variant",
      entityId: variantId,
      diff: { delta: amount, reason, from: next - amount, to: next },
    });
  }

  // A sale-down past the threshold queues inventory.low.
  kickOutbox();

  const { data: variant } = await db
    .from("product_variants")
    .select("product_id")
    .eq("id", variantId)
    .single();
  if (variant) await revalidateProduct(variant.product_id);

  return { error: "", ok: next === 0 ? "Marked sold out. Stock is 0." : `Stock is now ${next}.` };
}
