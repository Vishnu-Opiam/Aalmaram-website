import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server-side pricing.
 *
 * The browser never decides an amount. It sends variant ids, quantities and
 * possibly a discount code; everything else — unit prices, what the discount is
 * worth, whether it is even valid, shipping — is computed here from the
 * database and nowhere else.
 */

export interface RequestedLine {
  variantId: string;
  quantity: number;
}

export interface PricedLine {
  variantId: string;
  productId: string;
  title: string;
  variantTitle: string;
  sku: string | null;
  unitPricePaise: number;
  quantity: number;
  totalPaise: number;
  weightGrams: number;
}

export interface PricedCart {
  lines: PricedLine[];
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  taxPaise: number;
  totalPaise: number;
  discountCode: string | null;
  /** Why a submitted code was not applied, for showing the buyer. */
  discountMessage: string | null;
}

export class PricingError extends Error {}

const MAX_QUANTITY_PER_LINE = 20;

export async function priceCart({
  lines,
  discountCode,
  email,
}: {
  lines: RequestedLine[];
  discountCode?: string | null;
  email?: string | null;
}): Promise<PricedCart> {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new PricingError("Your basket is empty.");
  }

  const db = createAdminClient();

  // Collapse duplicates before pricing, so ten of the same line cannot be used
  // to sneak past the per-line quantity cap.
  const wanted = new Map<string, number>();
  for (const line of lines) {
    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new PricingError("Quantities must be whole numbers.");
    }
    wanted.set(line.variantId, (wanted.get(line.variantId) ?? 0) + quantity);
  }

  for (const quantity of wanted.values()) {
    if (quantity > MAX_QUANTITY_PER_LINE) {
      throw new PricingError(`We can only sell ${MAX_QUANTITY_PER_LINE} copies at a time.`);
    }
  }

  const { data: variants, error } = await db
    .from("product_variants")
    .select(
      "id, title, sku, price_paise, inventory_quantity, weight_grams, product_id, products ( id, title, status, tags )"
    )
    .in("id", [...wanted.keys()]);

  if (error) throw new PricingError(`Could not price the basket: ${error.message}`);

  const priced: PricedLine[] = [];
  for (const [variantId, quantity] of wanted) {
    const variant = variants?.find((v) => v.id === variantId);
    // An unknown id, or one whose product is not published, is treated the
    // same way: it is not for sale.
    if (!variant || !variant.products || variant.products.status !== "active") {
      throw new PricingError("Something in your basket is no longer available.");
    }
    if (variant.inventory_quantity < quantity) {
      throw new PricingError(
        variant.inventory_quantity === 0
          ? `${variant.products.title} has just sold out.`
          : `Only ${variant.inventory_quantity} of ${variant.products.title} left.`
      );
    }

    priced.push({
      variantId: variant.id,
      productId: variant.product_id,
      title: variant.products.title,
      variantTitle: variant.title,
      sku: variant.sku,
      unitPricePaise: variant.price_paise,
      quantity,
      totalPaise: variant.price_paise * quantity,
      weightGrams: variant.weight_grams,
    });
  }

  const subtotalPaise = priced.reduce((sum, line) => sum + line.totalPaise, 0);

  const { discountPaise, freeShipping, appliedCode, message } = await applyDiscount({
    code: discountCode,
    lines: priced,
    subtotalPaise,
    email,
    variants: variants ?? [],
  });

  const shippingPaise = freeShipping
    ? 0
    : await shippingFor(subtotalPaise - discountPaise);

  return {
    lines: priced,
    subtotalPaise,
    discountPaise,
    shippingPaise,
    // Books are HSN 4901 and GST-exempt; Zoho remains the invoice system of
    // record. The column exists so a taxable product later has somewhere to go.
    taxPaise: 0,
    totalPaise: subtotalPaise - discountPaise + shippingPaise,
    discountCode: appliedCode,
    discountMessage: message,
  };
}

async function shippingFor(payablePaise: number): Promise<number> {
  const db = createAdminClient();
  const { data } = await db.from("settings").select("value").eq("key", "shipping").maybeSingle();
  const value = (data?.value ?? {}) as { flat_rate_paise?: number; free_threshold_paise?: number };

  const flat = Number(value.flat_rate_paise ?? 0);
  const threshold = Number(value.free_threshold_paise ?? 0);

  if (threshold > 0 && payablePaise >= threshold) return 0;
  return flat;
}

type VariantRow = {
  id: string;
  product_id: string;
  products: { id: string; title: string; status: string; tags: string[] } | null;
};

async function applyDiscount({
  code,
  lines,
  subtotalPaise,
  email,
  variants,
}: {
  code?: string | null;
  lines: PricedLine[];
  subtotalPaise: number;
  email?: string | null;
  variants: VariantRow[];
}): Promise<{
  discountPaise: number;
  freeShipping: boolean;
  appliedCode: string | null;
  message: string | null;
}> {
  const none = { discountPaise: 0, freeShipping: false, appliedCode: null, message: null };
  const normalised = code?.trim().toUpperCase();
  if (!normalised) return none;

  const db = createAdminClient();
  const { data: discount } = await db
    .from("discounts")
    .select("*")
    .eq("code", normalised)
    .maybeSingle();

  const reject = (message: string) => ({ ...none, message });

  if (!discount) return reject("That code isn't recognised.");
  if (!discount.active) return reject("That code is no longer active.");

  const now = Date.now();
  if (new Date(discount.starts_at).getTime() > now) return reject("That code isn't active yet.");
  if (discount.ends_at && new Date(discount.ends_at).getTime() < now) {
    return reject("That code has expired.");
  }
  if (discount.min_subtotal_paise && subtotalPaise < discount.min_subtotal_paise) {
    return reject(
      `That code needs a basket of at least ₹${(discount.min_subtotal_paise / 100).toLocaleString("en-IN")}.`
    );
  }
  if (discount.usage_limit !== null && discount.used_count >= discount.usage_limit) {
    return reject("That code has been fully used.");
  }

  // Per-customer limits are answered from redemptions, keyed on email since
  // there are no customer accounts.
  if (email && (discount.once_per_customer || discount.usage_limit_per_customer !== null)) {
    const { count } = await db
      .from("discount_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("discount_id", discount.id)
      .eq("customer_email", email.toLowerCase());

    const used = count ?? 0;
    const limit = discount.once_per_customer ? 1 : (discount.usage_limit_per_customer ?? Infinity);
    if (used >= limit) return reject("You've already used that code.");
  }

  // Which lines the discount is allowed to touch.
  const eligible = lines.filter((line) => {
    if (discount.applies_to === "all") return true;
    if (discount.applies_to === "products") {
      return (discount.product_ids ?? []).includes(line.productId);
    }
    if (discount.applies_to === "tag") {
      const tags = variants.find((v) => v.id === line.variantId)?.products?.tags ?? [];
      return discount.tag !== null && tags.includes(discount.tag);
    }
    return false;
  });

  const eligiblePaise = eligible.reduce((sum, line) => sum + line.totalPaise, 0);

  if (discount.type === "free_shipping") {
    return { discountPaise: 0, freeShipping: true, appliedCode: discount.code, message: null };
  }

  if (eligiblePaise === 0) {
    return reject("That code doesn't apply to anything in your basket.");
  }

  const raw =
    discount.type === "percentage"
      ? Math.round((eligiblePaise * Number(discount.value)) / 100)
      : Math.round(Number(discount.value));

  // Never discount more than the eligible lines are worth — a fixed-amount code
  // must not turn into a refund.
  const discountPaise = Math.min(raw, eligiblePaise);

  return { discountPaise, freeShipping: false, appliedCode: discount.code, message: null };
}
