import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/checkout/recover { id }
 *
 * Turns the link in an abandoned-checkout email back into a basket. The id is
 * the checkout's uuid, which only that email carries. What comes back is the
 * basket as it stands *now* — current prices, and only what is still for sale —
 * never the address or email typed last time; checkout prices it all again
 * anyway.
 */

const bodySchema = z.object({ id: z.string().uuid() });

const MAX_AGE_DAYS = 7;

export async function POST(request: Request) {
  const db = createAdminClient();

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { data: allowed } = await db.rpc("rate_limit_hit", {
    p_key: `recover:${ip}`,
    p_limit: 20,
    p_window_seconds: 60,
  });
  if (allowed === false) {
    return NextResponse.json({ error: "Too many attempts just now." }, { status: 429 });
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { data: checkout } = await db
    .from("checkouts")
    .select("id, status, line_items, discount_code, created_at")
    .eq("id", parsed.data.id)
    .maybeSingle();

  const tooOld =
    !checkout || Date.now() - new Date(checkout.created_at).getTime() > MAX_AGE_DAYS * 86_400_000;
  if (!checkout || checkout.status !== "active" || tooOld) {
    return NextResponse.json({ error: "That basket has expired." }, { status: 404 });
  }

  const wanted = ((checkout.line_items ?? []) as { variant_id?: string; quantity?: number }[]).filter(
    (line): line is { variant_id: string; quantity: number } =>
      typeof line.variant_id === "string" && Number.isInteger(line.quantity) && (line.quantity ?? 0) > 0
  );
  if (wanted.length === 0) return NextResponse.json({ items: [], discountCode: null });

  const { data: variants } = await db
    .from("product_variants")
    .select(
      "id, price_paise, compare_at_paise, inventory_quantity, products ( id, handle, title, subtitle, status, product_images ( url, position ) )"
    )
    .in(
      "id",
      wanted.map((line) => line.variant_id)
    );

  const items = wanted.flatMap((line) => {
    const variant = variants?.find((v) => v.id === line.variant_id);
    const product = variant?.products;
    if (!variant || !product || product.status !== "active" || variant.inventory_quantity < 1) return [];
    const image = [...(product.product_images ?? [])].sort((a, b) => a.position - b.position)[0]?.url;
    return [
      {
        variantId: variant.id,
        productId: product.id,
        handle: product.handle,
        title: product.title,
        subtitle: product.subtitle,
        pricePaise: variant.price_paise,
        compareAtPaise: variant.compare_at_paise,
        qty: Math.min(line.quantity, variant.inventory_quantity),
        image: image ?? "/books/Cover.png",
      },
    ];
  });

  return NextResponse.json({ items, discountCode: checkout.discount_code });
}
