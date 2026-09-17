import "server-only";

import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/database.types";
import type { ShippingSettings, StorefrontProduct } from "@/lib/commerce-types";

export { formatPaise } from "@/lib/format";
export type {
  ShippingSettings,
  StorefrontImage,
  StorefrontProduct,
  StorefrontVariant,
} from "@/lib/commerce-types";

/**
 * Storefront reads.
 *
 * Uses the anon key with no session attached — RLS is doing the work, so this
 * can only ever return active products, and a draft is invisible even to a
 * hand-crafted request. Nothing here needs cookies, which keeps these reads out
 * of the request-dynamic path.
 */
function publicClient() {
  return createClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const SELECT = `
  id, handle, title, subtitle, description_md, tags, seo_title, seo_description,
  product_images ( url, alt, position ),
  product_variants ( id, title, sku, price_paise, compare_at_paise, inventory_quantity, weight_grams, position )
`;

type ProductQueryRow = {
  id: string;
  handle: string;
  title: string;
  subtitle: string;
  description_md: string;
  tags: string[];
  seo_title: string | null;
  seo_description: string | null;
  product_images: { url: string; alt: string; position: number }[];
  product_variants: {
    id: string;
    title: string;
    sku: string | null;
    price_paise: number;
    compare_at_paise: number | null;
    inventory_quantity: number;
    weight_grams: number;
    position: number;
  }[];
};

function toProduct(row: ProductQueryRow): StorefrontProduct {
  const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;

  return {
    id: row.id,
    handle: row.handle,
    title: row.title,
    subtitle: row.subtitle,
    descriptionMd: row.description_md,
    tags: row.tags,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    images: [...row.product_images].sort(byPosition).map((i) => ({ url: i.url, alt: i.alt })),
    variants: [...row.product_variants].sort(byPosition).map((v) => ({
      id: v.id,
      title: v.title,
      sku: v.sku,
      pricePaise: v.price_paise,
      compareAtPaise: v.compare_at_paise,
      inventoryQuantity: v.inventory_quantity,
      weightGrams: v.weight_grams,
    })),
  };
}

export async function listActiveProducts(): Promise<StorefrontProduct[]> {
  const { data, error } = await publicClient()
    .from("products")
    .select(SELECT)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load products: ${error.message}`);
  return (data as unknown as ProductQueryRow[]).map(toProduct);
}

export async function getProductByHandle(handle: string): Promise<StorefrontProduct | null> {
  const { data, error } = await publicClient()
    .from("products")
    .select(SELECT)
    .eq("handle", handle)
    .maybeSingle();

  if (error) throw new Error(`Failed to load product: ${error.message}`);
  return data ? toProduct(data as unknown as ProductQueryRow) : null;
}

/**
 * The one book the homepage and sticky bar are built around. Falls back to the
 * first active product, so adding a second book does not need a code change.
 */
export async function getFeaturedProduct(): Promise<StorefrontProduct | null> {
  const products = await listActiveProducts();
  return products[0] ?? null;
}

/** Whether the owner has checkout switched on (Settings → Features). On unless explicitly off. */
export async function getCheckoutEnabled(): Promise<boolean> {
  const { data } = await publicClient().from("settings").select("value").eq("key", "features").maybeSingle();
  return (data?.value as { checkout_enabled?: boolean } | null)?.checkout_enabled !== false;
}

export async function getShippingSettings(): Promise<ShippingSettings> {
  const { data } = await publicClient()
    .from("settings")
    .select("value")
    .eq("key", "shipping")
    .maybeSingle();

  const value = (data?.value ?? {}) as Record<string, unknown>;
  return {
    flatRatePaise: Number(value.flat_rate_paise ?? 0),
    freeThresholdPaise: Number(value.free_threshold_paise ?? 0),
  };
}
