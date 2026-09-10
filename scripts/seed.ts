/**
 * Seeds a Supabase project with the real catalogue and the live discount
 * codes, so local dev and staging have something genuine to click.
 *
 *     npm run db:seed
 *
 * Idempotent: run it as often as you like. It upserts on handle and code.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. " +
      "Run this through `npm run db:seed`, which loads .env.local."
  );
  process.exit(1);
}

const db = createClient<Database>(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const RUPEE = 100; // paise per rupee

async function main() {
  // ── Product ──────────────────────────────────────────────────────────────
  const { data: product, error: productError } = await db
    .from("products")
    .upsert(
      {
        handle: "nandu-in-muziris",
        title: "Nandu in Muziris",
        subtitle: "First edition · Numbered",
        description_md:
          "Set in the ancient port of Muziris, *Nandu in Muziris* follows a young crow " +
          "named Nandu after a storm destroys his home. A beautifully illustrated " +
          "children's book rooted in Kerala's history.",
        status: "active",
        tags: ["age-4-8", "english", "picture-book"],
        hsn_code: "4901",
        seo_title: "Nandu in Muziris — Aalmaram",
        seo_description:
          "A beautifully illustrated children's book rooted in Kerala's history, from Aalmaram.",
      },
      { onConflict: "handle" }
    )
    .select("id, handle, title")
    .single();

  if (productError) throw productError;
  console.log(`product  ${product.handle} → ${product.id}`);

  // ── Variant ──────────────────────────────────────────────────────────────
  const { data: existingVariant } = await db
    .from("product_variants")
    .select("id")
    .eq("product_id", product.id)
    .eq("title", "Default")
    .maybeSingle();

  const variantPayload = {
    product_id: product.id,
    title: "Default",
    sku: "AAL-NANDU-01",
    price_paise: 700 * RUPEE,
    compare_at_paise: 1400 * RUPEE,
    inventory_quantity: 50,
    weight_grams: 500,
    length_cm: 28,
    breadth_cm: 22,
    height_cm: 1.5,
    position: 0,
  };

  const { data: variant, error: variantError } = existingVariant
    ? await db
        .from("product_variants")
        .update(variantPayload)
        .eq("id", existingVariant.id)
        .select("id, price_paise")
        .single()
    : await db.from("product_variants").insert(variantPayload).select("id, price_paise").single();

  if (variantError) throw variantError;
  console.log(`variant  Default → ${variant.id} (₹${variant.price_paise / RUPEE})`);

  // ── Image ────────────────────────────────────────────────────────────────
  // Still the file already in /public. Phase 2 moves uploads to Supabase Storage.
  const { data: existingImage } = await db
    .from("product_images")
    .select("id")
    .eq("product_id", product.id)
    .eq("position", 0)
    .maybeSingle();

  if (!existingImage) {
    const { error } = await db.from("product_images").insert({
      product_id: product.id,
      url: "/books/Cover.png",
      alt: "Cover of Nandu in Muziris",
      position: 0,
    });
    if (error) throw error;
    console.log("image    /books/Cover.png");
  }

  // ── Discounts ────────────────────────────────────────────────────────────
  const { error: nagmaError } = await db.from("discounts").upsert(
    {
      code: "NAGMA15",
      title: "15% off the whole order",
      type: "percentage",
      value: 15,
      applies_to: "all",
      active: true,
    },
    { onConflict: "code" }
  );
  if (nagmaError) throw nagmaError;

  const { error: tkhpError } = await db.from("discounts").upsert(
    {
      code: "TKHP",
      title: "10% off Nandu in Muziris",
      type: "percentage",
      value: 10,
      applies_to: "products",
      product_ids: [product.id],
      active: true,
    },
    { onConflict: "code" }
  );
  if (tkhpError) throw tkhpError;
  console.log("discount NAGMA15, TKHP");

  console.log("\nSeed complete.");
}

main().catch((err) => {
  console.error("\nSeed failed:", err);
  process.exit(1);
});
