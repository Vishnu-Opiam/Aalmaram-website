/**
 * Imports Aalmaram's history from Shopify: products, customers, discount codes
 * and the last twelve months of orders (PLAN §9).
 *
 *     npm run migrate:shopify                      # dry run: fetch, map, report, write nothing
 *     npm run migrate:shopify -- --apply           # write to Supabase
 *
 * Options
 *   --apply               write (without it nothing is written)
 *   --since YYYY-MM-DD    orders created on or after this day (default: 12 months ago)
 *   --only a,b            any of products, customers, discounts, orders
 *   --skip-images         don't copy product images into Supabase Storage
 *   --from-dir DIR        read products.json, customers.json, price_rules.json and
 *                         orders.json from DIR (Shopify REST shapes) instead of the API
 *   --report FILE         write the mapped rows and every warning to FILE as JSON
 *
 * Env (from .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and
 * for the API: SHOPIFY_STORE_DOMAIN (xxxx.myshopify.com) and SHOPIFY_ADMIN_TOKEN
 * (shpat_…) from a custom app with read_products, read_customers, read_orders,
 * read_all_orders (orders older than 60 days) and read_price_rules/read_discounts.
 *
 * Safe to run again: every row keeps its Shopify id and is skipped the second
 * time. Things already in the store are never overwritten — a product or code
 * with the same handle, or a customer with the same email, is linked, not
 * replaced. Imported orders take no stock, count against no discount, and send
 * nothing to n8n: Shopify already invoiced them.
 */

import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

// ── Arguments ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const option = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const APPLY = flag("apply");
const SKIP_IMAGES = flag("skip-images");
const FROM_DIR = option("from-dir");
const REPORT = option("report");
const ONLY = new Set((option("only") ?? "products,customers,discounts,orders").split(",").map((s) => s.trim()));
const SINCE = option("since") ?? new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
const API_VERSION = "2024-10";
const IMAGE_BUCKET = "product-images";

if (!/^\d{4}-\d{2}-\d{2}$/.test(SINCE)) {
  console.error("--since must be YYYY-MM-DD");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (run with --env-file=.env.local).");
  process.exit(1);
}
const db = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Shopify shapes (REST, only the fields used) ─────────────────────────────

interface ShopifyVariant {
  id: number;
  title: string;
  sku: string | null;
  price: string;
  compare_at_price: string | null;
  inventory_quantity?: number;
  grams?: number;
  position?: number;
}
interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string | null;
  status: "active" | "draft" | "archived";
  tags: string;
  variants: ShopifyVariant[];
  images: { src: string; alt: string | null; position: number }[];
}
interface ShopifyCustomer {
  id: number;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  accepts_marketing?: boolean;
  email_marketing_consent?: { state?: string; consent_updated_at?: string | null } | null;
  created_at: string;
}
interface ShopifyAddress {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  zip?: string | null;
  country?: string | null;
  phone?: string | null;
}
interface ShopifyOrder {
  id: number;
  name: string;
  order_number: number;
  email: string | null;
  contact_email?: string | null;
  phone: string | null;
  created_at: string;
  processed_at: string | null;
  closed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  currency: string;
  financial_status: string | null;
  fulfillment_status: string | null;
  subtotal_price: string;
  total_discounts: string;
  total_tax: string;
  total_price: string;
  total_shipping_price_set?: { shop_money?: { amount?: string } };
  shipping_lines?: { price: string }[];
  discount_codes: { code: string }[];
  note: string | null;
  shipping_address: ShopifyAddress | null;
  billing_address: ShopifyAddress | null;
  customer?: { email?: string | null } | null;
  line_items: {
    title: string;
    variant_title: string | null;
    sku: string | null;
    quantity: number;
    price: string;
    grams?: number;
    variant_id: number | null;
    product_id: number | null;
  }[];
  refunds?: { transactions?: { kind: string; status: string; amount: string }[] }[];
}
interface ShopifyPriceRule {
  id: number;
  title: string;
  value_type: "percentage" | "fixed_amount";
  value: string;
  target_type: "line_item" | "shipping_line";
  target_selection: "all" | "entitled";
  allocation_method?: string;
  entitled_product_ids: number[];
  once_per_customer: boolean;
  usage_limit: number | null;
  starts_at: string;
  ends_at: string | null;
  prerequisite_subtotal_range?: { greater_than_or_equal_to?: string } | null;
  discount_codes?: { id: number; code: string; usage_count: number }[];
}

// ── Source ──────────────────────────────────────────────────────────────────

async function shopifyGetAll<T>(path: string, key: string): Promise<T[]> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  if (!domain || !token) {
    throw new Error("SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN must be set, or use --from-dir.");
  }
  const out: T[] = [];
  let url: string | null = `https://${domain}/admin/api/${API_VERSION}/${path}`;
  while (url) {
    const res: Response = await fetch(url, { headers: { "X-Shopify-Access-Token": token } });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    if (!res.ok) throw new Error(`Shopify ${res.status} on ${path}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as Record<string, T[]>;
    out.push(...(body[key] ?? []));
    const next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get("link") ?? "");
    url = next ? next[1] : null;
    await new Promise((r) => setTimeout(r, 550)); // 2 requests/second on the REST bucket
  }
  return out;
}

function readDir<T>(file: string): T[] {
  const raw = JSON.parse(readFileSync(join(FROM_DIR as string, file), "utf8"));
  return Array.isArray(raw) ? raw : (Object.values(raw)[0] as T[]);
}

async function load() {
  if (FROM_DIR) {
    return {
      products: ONLY.has("products") || ONLY.has("orders") ? readDir<ShopifyProduct>("products.json") : [],
      customers: ONLY.has("customers") ? readDir<ShopifyCustomer>("customers.json") : [],
      priceRules: ONLY.has("discounts") ? readDir<ShopifyPriceRule>("price_rules.json") : [],
      orders: ONLY.has("orders")
        ? readDir<ShopifyOrder>("orders.json").filter((o) => o.created_at.slice(0, 10) >= SINCE)
        : [],
    };
  }

  const products = ONLY.has("products") || ONLY.has("orders") ? await shopifyGetAll<ShopifyProduct>("products.json?limit=250", "products") : [];
  const customers = ONLY.has("customers") ? await shopifyGetAll<ShopifyCustomer>("customers.json?limit=250", "customers") : [];
  const priceRules = ONLY.has("discounts") ? await shopifyGetAll<ShopifyPriceRule>("price_rules.json?limit=250", "price_rules") : [];
  for (const rule of priceRules) {
    rule.discount_codes = await shopifyGetAll(`price_rules/${rule.id}/discount_codes.json?limit=250`, "discount_codes");
  }
  const orders = ONLY.has("orders")
    ? await shopifyGetAll<ShopifyOrder>(`orders.json?status=any&limit=250&created_at_min=${SINCE}T00:00:00Z`, "orders")
    : [];
  return { products, customers, priceRules, orders };
}

// ── Mapping ─────────────────────────────────────────────────────────────────

const warnings: string[] = [];
const warn = (message: string) => warnings.push(message);

export function toPaise(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : Number.parseFloat(value ?? "0");
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Shopify's product HTML to the markdown the storefront renders: paragraphs, bold, italic. */
export function htmlToMarkdown(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, "*$2*")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function slug(handle: string): string {
  return handle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function address(a: ShopifyAddress | null | undefined) {
  if (!a) return null;
  return {
    name: a.name || [a.first_name, a.last_name].filter(Boolean).join(" "),
    phone: a.phone ?? "",
    line1: a.address1 ?? "",
    line2: a.address2 ?? "",
    city: a.city ?? "",
    state: a.province ?? "",
    pincode: a.zip ?? "",
    country: a.country ?? "India",
  };
}

export function mapPayment(status: string | null): Database["public"]["Tables"]["orders"]["Row"]["payment_status"] {
  switch (status) {
    case "paid":
      return "paid";
    case "partially_refunded":
      return "partially_refunded";
    case "refunded":
      return "refunded";
    case "voided":
      return "failed";
    default:
      return "pending"; // pending, authorized, partially_paid, expired
  }
}

export function mapOrder(order: ShopifyOrder, variantBySku: Map<string, string>, variantByShopifyId: Map<number, string>) {
  const email = (order.email || order.contact_email || order.customer?.email || "").toLowerCase().trim();
  const total = toPaise(order.total_price);
  const refunded = Math.min(
    total,
    (order.refunds ?? [])
      .flatMap((r) => r.transactions ?? [])
      .filter((t) => t.kind === "refund" && t.status === "success")
      .reduce((sum, t) => sum + toPaise(t.amount), 0)
  );
  const shipping =
    order.total_shipping_price_set?.shop_money?.amount !== undefined
      ? toPaise(order.total_shipping_price_set.shop_money.amount)
      : (order.shipping_lines ?? []).reduce((sum, l) => sum + toPaise(l.price), 0);

  const cancelled = Boolean(order.cancelled_at);
  const fulfillment = cancelled
    ? "cancelled"
    : order.fulfillment_status === "fulfilled" || order.fulfillment_status === "partial"
      ? "fulfilled"
      : order.fulfillment_status === "restocked"
        ? "returned"
        : "unfulfilled";

  let payment = mapPayment(order.financial_status);
  // Our refunded/partially_refunded must agree with refunded_paise.
  if (refunded === 0 && (payment === "refunded" || payment === "partially_refunded")) payment = "paid";
  if (refunded > 0 && refunded >= total && total > 0) payment = "refunded";
  else if (refunded > 0 && payment === "paid") payment = "partially_refunded";

  const items = order.line_items
    .filter((li) => li.quantity > 0)
    .map((li) => {
      const unit = toPaise(li.price);
      const variantId =
        (li.variant_id ? variantByShopifyId.get(li.variant_id) : undefined) ??
        (li.sku ? variantBySku.get(li.sku.trim().toUpperCase()) : undefined) ??
        null;
      return {
        variant_id: variantId,
        title: li.title,
        variant_title: li.variant_title && li.variant_title !== "Default Title" ? li.variant_title : "",
        sku: li.sku ?? "",
        unit_price_paise: unit,
        quantity: li.quantity,
        total_paise: unit * li.quantity,
        weight_grams: Math.max(0, Math.round(li.grams ?? 0)),
      };
    });

  return {
    order: {
      shopify_id: order.id,
      order_number: `SH${order.order_number}`,
      email,
      phone: order.phone ?? order.shipping_address?.phone ?? "",
      payment_status: payment,
      fulfillment_status: fulfillment,
      // A closed Shopify order is done with; archived keeps it out of "waiting to be sent".
      order_status: cancelled ? "cancelled" : order.closed_at ? "archived" : "open",
      subtotal_paise: toPaise(order.subtotal_price),
      discount_paise: toPaise(order.total_discounts),
      shipping_paise: shipping,
      tax_paise: toPaise(order.total_tax),
      total_paise: total,
      refunded_paise: refunded,
      discount_code: order.discount_codes?.[0]?.code?.toUpperCase() ?? "",
      shipping_address: address(order.shipping_address) ?? {},
      billing_address: address(order.billing_address),
      notes: [order.note ?? "", `Imported from Shopify ${order.name}.`].filter(Boolean).join("\n"),
      cancel_reason: cancelled ? order.cancel_reason ?? "cancelled in Shopify" : "",
      placed_at: order.processed_at ?? order.created_at,
      created_at: order.created_at,
    },
    items,
    email,
  };
}

export function mapPriceRule(rule: ShopifyPriceRule, productIdByShopifyId: Map<number, string>) {
  const code = rule.discount_codes?.[0];
  if (!code) return null;

  const type = rule.target_type === "shipping_line" ? "free_shipping" : rule.value_type;
  const amount = Math.abs(Number.parseFloat(rule.value));
  const value = type === "percentage" ? Math.min(100, amount) : type === "fixed_amount" ? toPaise(amount) : 0;

  let appliesTo: "all" | "products" = "all";
  let productIds: string[] | null = null;
  if (rule.target_selection === "entitled" && rule.entitled_product_ids.length > 0) {
    productIds = rule.entitled_product_ids.map((id) => productIdByShopifyId.get(id)).filter((id): id is string => Boolean(id));
    if (productIds.length === 0) {
      warn(`Discount ${code.code} applies only to Shopify products that aren't in the store, so it was skipped.`);
      return { row: null, code: code.code };
    }
    appliesTo = "products";
  }

  const startsAt = rule.starts_at;
  const endsAt = rule.ends_at && rule.ends_at > startsAt ? rule.ends_at : null;
  const minSubtotal = rule.prerequisite_subtotal_range?.greater_than_or_equal_to;

  return {
    code: code.code,
    row: {
      shopify_id: rule.id,
      code: code.code.toUpperCase(),
      title: rule.title,
      type,
      value,
      applies_to: appliesTo,
      product_ids: appliesTo === "products" ? productIds : null,
      tag: null,
      min_subtotal_paise: minSubtotal ? toPaise(minSubtotal) : null,
      usage_limit: rule.usage_limit && rule.usage_limit > 0 ? rule.usage_limit : null,
      usage_limit_per_customer: null,
      once_per_customer: rule.once_per_customer,
      used_count: Math.max(0, code.usage_count ?? 0),
      starts_at: startsAt,
      ends_at: endsAt,
      active: !endsAt || new Date(endsAt).getTime() > Date.now(),
    },
  };
}

// ── Apply ───────────────────────────────────────────────────────────────────

const summary: Record<string, Record<string, number>> = {};
const count = (section: string, outcome: string) => {
  summary[section] ??= {};
  summary[section][outcome] = (summary[section][outcome] ?? 0) + 1;
};

async function copyImage(productId: string, src: string): Promise<string | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`${res.status}`);
    const type = res.headers.get("content-type") ?? "image/jpeg";
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("avif") ? "avif" : "jpg";
    const path = `${productId}/${randomUUID()}.${ext}`;
    const { error } = await db.storage.from(IMAGE_BUCKET).upload(path, new Uint8Array(await res.arrayBuffer()), { contentType: type });
    if (error) throw new Error(error.message);
    return db.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  } catch (err) {
    warn(`Image ${src} was not copied: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function importProducts(products: ShopifyProduct[]) {
  const variantByShopifyId = new Map<number, string>();
  const productIdByShopifyId = new Map<number, string>();

  for (const p of products) {
    const handle = slug(p.handle);
    const { data: byShopify } = await db.from("products").select("id").eq("shopify_id", p.id).maybeSingle();
    const { data: byHandle } = byShopify ? { data: null } : await db.from("products").select("id, shopify_id").eq("handle", handle).maybeSingle();
    const existing = byShopify ?? byHandle;

    if (existing) {
      productIdByShopifyId.set(p.id, existing.id);
      // Link variants by SKU so order lines can point at them.
      const { data: ours } = await db.from("product_variants").select("id, sku").eq("product_id", existing.id);
      for (const v of p.variants) {
        const match = ours?.find((o) => o.sku && v.sku && o.sku.toUpperCase() === v.sku.toUpperCase()) ?? (ours?.length === 1 && p.variants.length === 1 ? ours[0] : undefined);
        if (match) variantByShopifyId.set(v.id, match.id);
      }
      if (APPLY && byHandle && !byHandle.shopify_id) {
        await db.from("products").update({ shopify_id: p.id }).eq("id", byHandle.id);
      }
      count("products", byShopify ? "already imported" : "kept (same handle already in the store)");
      continue;
    }

    if (!ONLY.has("products")) continue;
    if (!APPLY) {
      count("products", "would create");
      continue;
    }

    const { data: created, error } = await db
      .from("products")
      .insert({
        shopify_id: p.id,
        handle,
        title: p.title,
        description_md: htmlToMarkdown(p.body_html),
        // Nothing goes live on the new store by accident: active products come in as drafts.
        status: p.status === "archived" ? "archived" : "draft",
        tags: p.tags ? p.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      })
      .select("id")
      .single();
    if (error || !created) {
      warn(`Product ${p.handle} failed: ${error?.message}`);
      count("products", "failed");
      continue;
    }
    productIdByShopifyId.set(p.id, created.id);

    for (const [i, v] of p.variants.entries()) {
      const { data: variant, error: variantError } = await db
        .from("product_variants")
        .insert({
          product_id: created.id,
          title: v.title === "Default Title" ? "Default" : v.title,
          sku: v.sku || null,
          price_paise: toPaise(v.price),
          compare_at_paise: v.compare_at_price ? toPaise(v.compare_at_price) : null,
          inventory_quantity: Math.max(0, v.inventory_quantity ?? 0),
          weight_grams: Math.max(0, Math.round(v.grams ?? 0)),
          position: v.position ?? i,
        })
        .select("id")
        .single();
      if (variantError || !variant) warn(`Variant ${v.sku ?? v.title} of ${p.handle} failed: ${variantError?.message}`);
      else variantByShopifyId.set(v.id, variant.id);
    }

    if (!SKIP_IMAGES) {
      for (const image of [...p.images].sort((a, b) => a.position - b.position)) {
        const url = await copyImage(created.id, image.src);
        if (url) await db.from("product_images").insert({ product_id: created.id, url, alt: image.alt ?? p.title, position: image.position });
      }
    }
    count("products", "created as draft");
  }

  return { variantByShopifyId, productIdByShopifyId };
}

async function importCustomers(customers: ShopifyCustomer[]) {
  for (const c of customers) {
    const email = (c.email ?? "").toLowerCase().trim();
    if (!email) {
      count("customers", "skipped (no email)");
      continue;
    }
    const { data: existing } = await db.from("customers").select("id, shopify_id").eq("email", email).maybeSingle();
    if (existing) {
      if (APPLY && !existing.shopify_id) await db.from("customers").update({ shopify_id: c.id }).eq("id", existing.id);
      count("customers", "kept (already in the store)");
      continue;
    }
    if (!APPLY) {
      count("customers", "would create");
      continue;
    }
    const subscribed = c.email_marketing_consent?.state === "subscribed" || c.accepts_marketing === true;
    const { error } = await db.from("customers").insert({
      shopify_id: c.id,
      email,
      first_name: c.first_name ?? "",
      last_name: c.last_name ?? "",
      phone: c.phone,
      accepts_marketing: subscribed,
      marketing_consent_at: subscribed ? c.email_marketing_consent?.consent_updated_at ?? c.created_at : null,
      notes: "Imported from Shopify.",
      created_at: c.created_at,
    });
    if (error) {
      warn(`Customer ${email} failed: ${error.message}`);
      count("customers", "failed");
    } else count("customers", "created");
  }
}

async function importDiscounts(rules: ShopifyPriceRule[], productIdByShopifyId: Map<number, string>) {
  for (const rule of rules) {
    const mapped = mapPriceRule(rule, productIdByShopifyId);
    if (!mapped) {
      count("discounts", "skipped (no code)");
      continue;
    }
    const { data: existing } = await db.from("discounts").select("id, shopify_id").eq("code", mapped.code.toUpperCase()).maybeSingle();
    if (existing) {
      if (APPLY && !existing.shopify_id) await db.from("discounts").update({ shopify_id: rule.id }).eq("id", existing.id);
      count("discounts", "kept (same code already in the store)");
      continue;
    }
    if (!mapped.row) {
      count("discounts", "skipped (products not in the store)");
      continue;
    }
    if (!APPLY) {
      count("discounts", "would create");
      continue;
    }
    const { error } = await db.from("discounts").insert(mapped.row);
    if (error) {
      warn(`Discount ${mapped.code} failed: ${error.message}`);
      count("discounts", "failed");
    } else count("discounts", "created");
  }
}

async function importOrders(orders: ShopifyOrder[], variantByShopifyId: Map<number, string>) {
  const { data: variants } = await db.from("product_variants").select("id, sku");
  const variantBySku = new Map<string, string>();
  for (const v of variants ?? []) if (v.sku) variantBySku.set(v.sku.trim().toUpperCase(), v.id);

  const emails = new Set<string>();
  const mapped = [];
  for (const order of orders.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (order.currency !== "INR") {
      warn(`Order ${order.name} is in ${order.currency}; the store is INR only, so it was skipped.`);
      count("orders", "skipped (not INR)");
      continue;
    }
    const m = mapOrder(order, variantBySku, variantByShopifyId);
    if (!m.email) {
      warn(`Order ${order.name} has no email; skipped.`);
      count("orders", "skipped (no email)");
      continue;
    }
    if (m.items.length === 0) {
      warn(`Order ${order.name} has no line items; skipped.`);
      count("orders", "skipped (no items)");
      continue;
    }
    const unmatched = m.items.filter((i) => !i.variant_id).map((i) => i.sku || i.title);
    if (unmatched.length) warn(`Order ${order.name}: ${unmatched.join(", ")} kept as text only (no matching product in the store).`);
    mapped.push(m);

    if (!APPLY) {
      count("orders", "would import");
      continue;
    }

    // An imported customer row may not exist (guest checkout on Shopify): make one.
    const { data: customer } = await db.from("customers").select("id").eq("email", m.email).maybeSingle();
    if (!customer) {
      const name = (m.order.shipping_address as { name?: string }).name ?? "";
      const [first, ...rest] = name.split(/\s+/).filter(Boolean);
      await db.from("customers").insert({
        email: m.email,
        first_name: first ?? "",
        last_name: rest.join(" "),
        phone: m.order.phone || null,
        notes: "Created from an imported Shopify order.",
      });
    }

    const { data, error } = await db.rpc("import_shopify_order", { p_order: m.order, p_items: m.items });
    if (error) {
      warn(`Order ${order.name} failed: ${error.message}`);
      count("orders", "failed");
      continue;
    }
    count("orders", (data as { already_existed: boolean }).already_existed ? "already imported" : "imported");
    emails.add(m.email);
  }

  if (APPLY && emails.size) {
    const { error } = await db.rpc("recompute_customer_totals", { p_emails: [...emails] });
    if (error) warn(`Customer totals were not recomputed: ${error.message}`);
  }
  return mapped;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`${APPLY ? "APPLYING" : "DRY RUN — nothing will be written"} · orders since ${SINCE} · ${FROM_DIR ? `from ${FROM_DIR}` : "from the Shopify API"}`);
  const source = await load();
  console.log(
    `fetched ${source.products.length} products, ${source.customers.length} customers, ${source.priceRules.length} price rules, ${source.orders.length} orders`
  );

  const { variantByShopifyId, productIdByShopifyId } = await importProducts(source.products);
  if (ONLY.has("customers")) await importCustomers(source.customers);
  if (ONLY.has("discounts")) await importDiscounts(source.priceRules, productIdByShopifyId);
  const orders = ONLY.has("orders") ? await importOrders(source.orders, variantByShopifyId) : [];

  console.log("\nSummary");
  for (const [section, outcomes] of Object.entries(summary)) {
    console.log(`  ${section.padEnd(10)} ${Object.entries(outcomes).map(([k, v]) => `${v} ${k}`).join(", ")}`);
  }
  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s)`);
    for (const w of warnings.slice(0, 50)) console.log(`  - ${w}`);
    if (warnings.length > 50) console.log(`  … and ${warnings.length - 50} more (use --report)`);
  }
  if (REPORT) {
    writeFileSync(REPORT, JSON.stringify({ apply: APPLY, since: SINCE, summary, warnings, orders }, null, 2));
    console.log(`\nreport written to ${REPORT}`);
  }
  if (!APPLY) console.log("\nNothing was written. Re-run with --apply when the numbers look right.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
