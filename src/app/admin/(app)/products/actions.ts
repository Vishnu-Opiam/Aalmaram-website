"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAudit, requireAdmin } from "@/lib/admin-auth";
import { kickOutbox } from "@/lib/outbox";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ActionState {
  error: string;
  ok?: string;
}

const IMAGE_BUCKET = "product-images";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif"];

/** Refreshes every page that renders catalogue data. */
function revalidateStorefront(handle?: string) {
  revalidatePath("/");
  revalidatePath("/shop");
  revalidatePath("/admin/products");
  if (handle) revalidatePath(`/products/${handle}`);
}

const rupees = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d+(\.\d{1,2})?$/.test(v), "Use a number like 700 or 699.50");

/** Rupees from a form field, stored as integer paise. Never a float in the database. */
function toPaise(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  return Math.round(Number(trimmed) * 100);
}

const productSchema = z.object({
  title: z.string().trim().min(1, "A title is required."),
  handle: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Handle must be lowercase words joined by hyphens."),
  subtitle: z.string().trim(),
  description_md: z.string(),
  status: z.enum(["draft", "active", "archived"]),
  tags: z.string(),
  hsn_code: z.string().trim(),
  seo_title: z.string().trim(),
  seo_description: z.string().trim(),
  price: rupees,
  compare_at: rupees,
  sku: z.string().trim(),
  inventory_quantity: z.string().trim(),
  weight_grams: z.string().trim(),
  length_cm: z.string().trim(),
  breadth_cm: z.string().trim(),
  height_cm: z.string().trim(),
});

function readForm(formData: FormData) {
  const raw = Object.fromEntries(
    Object.keys(productSchema.shape).map((k) => [k, String(formData.get(k) ?? "")])
  );
  return productSchema.safeParse(raw);
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "A title is required." };
  const handle = String(formData.get("handle") ?? "").trim() || slugify(title);

  const parsed = readForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "That didn't look right." };
  }

  const db = createAdminClient();
  const { data: product, error } = await db
    .from("products")
    .insert({
      title,
      handle,
      subtitle: parsed.data.subtitle,
      description_md: parsed.data.description_md,
      status: parsed.data.status,
      tags: parsed.data.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      hsn_code: parsed.data.hsn_code || "4901",
      seo_title: parsed.data.seo_title || null,
      seo_description: parsed.data.seo_description || null,
    })
    .select("id, handle")
    .single();

  if (error) {
    return {
      error:
        error.code === "23505"
          ? `The handle "${handle}" is already taken.`
          : `Could not save: ${error.message}`,
    };
  }

  // Every product needs at least one variant; the form hides the variant UI
  // until there is more than one.
  const { error: variantError } = await db.from("product_variants").insert({
    product_id: product.id,
    title: "Default",
    sku: parsed.data.sku || null,
    price_paise: toPaise(parsed.data.price) ?? 0,
    compare_at_paise: toPaise(parsed.data.compare_at),
    inventory_quantity: Number(parsed.data.inventory_quantity || 0),
    weight_grams: Number(parsed.data.weight_grams || 0),
    length_cm: Number(parsed.data.length_cm || 0),
    breadth_cm: Number(parsed.data.breadth_cm || 0),
    height_cm: Number(parsed.data.height_cm || 0),
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

  const parsed = readForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "That didn't look right." };
  }
  const d = parsed.data;

  const db = createAdminClient();
  const { data: product, error } = await db
    .from("products")
    .update({
      title: d.title,
      handle: d.handle,
      subtitle: d.subtitle,
      description_md: d.description_md,
      status: d.status,
      tags: d.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      hsn_code: d.hsn_code || "4901",
      seo_title: d.seo_title || null,
      seo_description: d.seo_description || null,
    })
    .eq("id", id)
    .select("handle")
    .single();

  if (error) {
    return {
      error:
        error.code === "23505"
          ? `The handle "${d.handle}" is already taken.`
          : `Could not save: ${error.message}`,
    };
  }

  if (variantId) {
    // Stock is deliberately not editable here — it moves through
    // adjustInventory so every change lands in inventory_adjustments.
    const { error: variantError } = await db
      .from("product_variants")
      .update({
        sku: d.sku || null,
        price_paise: toPaise(d.price) ?? 0,
        compare_at_paise: toPaise(d.compare_at),
        weight_grams: Number(d.weight_grams || 0),
        length_cm: Number(d.length_cm || 0),
        breadth_cm: Number(d.breadth_cm || 0),
        height_cm: Number(d.height_cm || 0),
      })
      .eq("id", variantId);

    if (variantError) return { error: `Could not save the variant: ${variantError.message}` };
  }

  await recordAudit(session, {
    action: "product.update",
    entityType: "product",
    entityId: id,
    diff: { title: d.title, handle: d.handle, status: d.status },
  });

  revalidateStorefront(product.handle);
  return { error: "", ok: "Saved." };
}

export async function setProductStatus(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["draft", "active", "archived"].includes(status)) return;

  const db = createAdminClient();
  const { data } = await db
    .from("products")
    .update({ status: status as "draft" | "active" | "archived" })
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
    await setProductStatus(formData);
    return;
  }

  await db.from("products").delete().eq("id", id);
  await recordAudit(session, { action: "product.delete", entityType: "product", entityId: id });
  revalidateStorefront();
  redirect("/admin/products");
}

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

  const { count } = await db
    .from("product_images")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);

  const { error: rowError } = await db.from("product_images").insert({
    product_id: productId,
    url: publicUrl,
    alt: String(formData.get("alt") ?? ""),
    position: count ?? 0,
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

  const { data: product } = await db.from("products").select("handle").eq("id", productId).single();
  revalidateStorefront(product?.handle);
  revalidatePath(`/admin/products/${productId}`);
  return { error: "", ok: "Image added." };
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

  // Only remove the file when it lives in our bucket — the seeded cover is a
  // path in /public and must survive.
  const marker = `/${IMAGE_BUCKET}/`;
  const index = image.url.indexOf(marker);
  if (index !== -1) {
    await db.storage.from(IMAGE_BUCKET).remove([image.url.slice(index + marker.length)]);
  }

  await recordAudit(session, {
    action: "product.image.remove",
    entityType: "product",
    entityId: image.product_id,
  });

  const { data: product } = await db
    .from("products")
    .select("handle")
    .eq("id", image.product_id)
    .single();
  revalidateStorefront(product?.handle);
  revalidatePath(`/admin/products/${image.product_id}`);
}

const REASONS = ["restock", "manual", "cancellation", "refund", "import"] as const;

/**
 * The only way stock moves outside an order or a refund. adjust_inventory()
 * applies the change and writes its adjustment row in one guarded statement,
 * so a count can never go below zero, and a change that didn't happen is never
 * logged as if it had.
 */
export async function adjustInventory(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdmin();

  const variantId = String(formData.get("variant_id") ?? "");
  const delta = Number(String(formData.get("delta") ?? "0"));
  const reason = String(formData.get("reason") ?? "manual");
  const note = String(formData.get("note") ?? "");

  if (!variantId) return { error: "Missing variant." };
  if (!Number.isInteger(delta) || delta === 0) {
    return { error: "Enter a whole number, positive or negative." };
  }
  if (!REASONS.includes(reason as (typeof REASONS)[number])) {
    return { error: "Pick a reason." };
  }

  const db = createAdminClient();
  const { data: next, error: adjustError } = await db.rpc("adjust_inventory", {
    p_variant_id: variantId,
    p_delta: delta,
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
  // A sale-down past the threshold queues inventory.low.
  kickOutbox();

  const { data: variant } = await db
    .from("product_variants")
    .select("product_id")
    .eq("id", variantId)
    .single();

  await recordAudit(session, {
    action: "inventory.adjust",
    entityType: "product_variant",
    entityId: variantId,
    diff: { delta, reason, from: next - delta, to: next },
  });

  if (!variant) return { error: "", ok: `Stock is now ${next}.` };

  const { data: product } = await db
    .from("products")
    .select("handle")
    .eq("id", variant.product_id)
    .single();
  revalidateStorefront(product?.handle);
  revalidatePath(`/admin/products/${variant.product_id}`);
  return { error: "", ok: `Stock is now ${next}.` };
}
