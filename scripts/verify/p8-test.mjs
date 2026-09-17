/**
 * P8: the Shopify import, end to end against the live database, from the
 * fixtures in scripts/verify/fixtures/shopify (Shopify REST shapes).
 *
 *     node --env-file=.env.local scripts/verify/p8-test.mjs
 *
 * Runs the real script three ways — dry run, apply, apply again — and checks
 * what landed, what didn't, and what must never happen on import: stock
 * moving, discount counters moving, events queued for n8n. Cleans up after
 * itself, including the Shopify ids it links onto the real product and code.
 */
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(64)} ${detail}`);
};
const section = (title) => console.log(`\n── ${title}`);

const FIXTURES = "scripts/verify/fixtures/shopify";
const ORDER_IDS = [990000501, 990000502, 990000503, 990000504, 990000505];
const EMAIL_PREFIX = "p8-fixture-";

function run(...extra) {
  return execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/migrate-from-shopify.ts", "--from-dir", FIXTURES, "--skip-images", "--since", "2025-09-17", ...extra],
    { encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"] }
  );
}

async function cleanup() {
  const { data: orders } = await db.from("orders").select("id").in("shopify_id", ORDER_IDS);
  for (const o of orders ?? []) {
    await db.from("audit_log").delete().eq("entity_id", o.id);
    await db.from("webhook_outbox").delete().eq("payload->>order_id", o.id);
  }
  await db.from("orders").delete().in("shopify_id", ORDER_IDS);
  await db.from("customers").delete().like("email", `${EMAIL_PREFIX}%`);
  await db.from("discounts").delete().in("code", ["P8SUMMER", "P8FREESHIP", "P8POSTCARD"]);
  await db.from("products").delete().eq("shopify_id", 990000002);
  await db.from("products").update({ shopify_id: null }).eq("shopify_id", 990000001);
  await db.from("discounts").update({ shopify_id: null }).eq("shopify_id", 990000404);
}

const snapshot = async () => {
  const { data: nandu } = await db
    .from("product_variants")
    .select("inventory_quantity, products!inner ( handle )")
    .eq("products.handle", "nandu-in-muziris")
    .single();
  const { data: nagma } = await db.from("discounts").select("used_count").eq("code", "NAGMA15").single();
  const { count: outbox } = await db.from("webhook_outbox").select("id", { count: "exact", head: true });
  const { count: redemptions } = await db.from("discount_redemptions").select("id", { count: "exact", head: true });
  return { stock: nandu?.inventory_quantity, nagmaUsed: nagma?.used_count, outbox, redemptions };
};

await cleanup();
const before = await snapshot();

try {
  section("Dry run");
  const dry = run();
  check("reports what it would do", /3 would import/.test(dry) && /1 skipped \(not INR\)/.test(dry), dry.split("\n").find((l) => l.includes("orders ")) ?? "");
  const { count: afterDry } = await db.from("orders").select("id", { count: "exact", head: true }).in("shopify_id", ORDER_IDS);
  check("writes nothing", afterDry === 0, `${afterDry}`);

  section("Apply");
  const applied = run("--apply");
  check("imports three orders", /orders\s+3 imported/.test(applied), applied.split("\n").find((l) => l.includes("orders ")) ?? "");

  const { data: orders } = await db
    .from("orders")
    .select("*, order_items ( * )")
    .in("shopify_id", ORDER_IDS)
    .order("created_at");
  const [o1, o2, o3] = orders ?? [];
  check("exactly the three in window, in INR", orders?.length === 3, `${orders?.length}`);
  check("an old order outside --since is left behind", !orders?.some((o) => o.shopify_id === 990000505));
  check("a USD order is left behind", !orders?.some((o) => o.shopify_id === 990000504));

  check("numbered SH + Shopify's number, source shopify-import", o1?.order_number === "SH1001" && o1?.source === "shopify-import");
  check(
    "money in paise: subtotal, discount, shipping, total",
    o1?.subtotal_paise === 140000 && o1?.discount_paise === 21000 && o1?.shipping_paise === 6000 && o1?.total_paise === 125000
  );
  check("paid, fulfilled, and archived because Shopify closed it", o1?.payment_status === "paid" && o1?.fulfillment_status === "fulfilled" && o1?.order_status === "archived");
  check("placed_at is Shopify's processed_at", new Date(o1?.placed_at).toISOString() === new Date("2026-03-10T11:00:05+05:30").toISOString());
  check("the code is kept, uppercased", o1?.discount_code === "P8SUMMER");
  check("the note is kept, with where it came from", o1?.notes?.includes("Gift wrap please") && o1?.notes?.includes("#1001"));
  check("the address uses our field names", o1?.shipping_address?.line1 === "1 Fixture Road" && o1?.shipping_address?.pincode === "682001" && o1?.shipping_address?.state === "Kerala");
  const item = o1?.order_items?.[0];
  check("a line matched by Shopify variant is linked to the real book", Boolean(item?.variant_id) && item?.sku === "AAL-NANDU-01" && item?.quantity === 2 && item?.total_paise === 140000);
  check("\"Default Title\" becomes an empty variant title", item?.variant_title === "");

  check("a partial refund: only successful transactions count", o2?.refunded_paise === 10000 && o2?.payment_status === "partially_refunded", `${o2?.refunded_paise} ${o2?.payment_status}`);
  check("an unfulfilled, unclosed order stays open", o2?.fulfillment_status === "unfulfilled" && o2?.order_status === "open");
  check("a line for a product created by the import is linked to it", Boolean(o2?.order_items?.[0]?.variant_id));

  check("a cancelled order is cancelled, fully refunded, with its reason", o3?.order_status === "cancelled" && o3?.fulfillment_status === "cancelled" && o3?.payment_status === "refunded" && o3?.refunded_paise === 76000 && o3?.cancel_reason === "customer");
  const tote = o3?.order_items?.find((i) => i.sku === "OLD-TOTE");
  check("a line for something no longer sold is kept as text", tote && tote.variant_id === null && tote.product_id === null && tote.title === "Old tote bag");

  section("What an import must never do");
  const after = await snapshot();
  check("no stock moves", after.stock === before.stock, `${before.stock} → ${after.stock}`);
  check("no event is queued for n8n (no second Zoho invoice)", after.outbox === before.outbox, `${before.outbox} → ${after.outbox}`);
  check("existing codes' counters don't move", after.nagmaUsed === before.nagmaUsed && after.redemptions === before.redemptions);

  section("Products, customers, codes");
  const { data: nandu } = await db.from("products").select("shopify_id, description_md, status").eq("handle", "nandu-in-muziris").single();
  check("the book already in the store is linked, not overwritten", nandu.shopify_id === 990000001 && nandu.description_md !== "Already in the store." && nandu.status === "active");
  const { data: postcards } = await db
    .from("products")
    .select("handle, status, description_md, tags, product_variants ( sku, price_paise, inventory_quantity, weight_grams, title )")
    .eq("shopify_id", 990000002)
    .single();
  check("a new product is created as a draft with a clean handle", postcards?.handle === "p8-postcards" && postcards?.status === "draft");
  check("its HTML becomes the storefront's markdown", postcards?.description_md === "Six **postcards** & an *envelope*.\n\nPrinted in Kochi.", JSON.stringify(postcards?.description_md));
  check("tags split", JSON.stringify(postcards?.tags) === JSON.stringify(["postcards", "stationery"]));
  const pv = postcards?.product_variants?.[0];
  check("its variant: price, stock, weight, Default", pv?.price_paise === 25000 && pv?.inventory_quantity === 12 && pv?.weight_grams === 80 && pv?.title === "Default");

  const { data: asha } = await db.from("customers").select("*").eq("email", "p8-fixture-asha@example.com").single();
  check("a Shopify customer is created, email lowercased", asha?.shopify_id === 990000301 && asha?.first_name === "Asha");
  check("…with their marketing consent and when it was given", asha?.accepts_marketing === true && Boolean(asha?.marketing_consent_at));
  check("…and totals from their imported orders", asha?.total_orders === 1 && asha?.total_spent_paise === 125000, `${asha?.total_orders} ${asha?.total_spent_paise}`);
  const { data: guest } = await db.from("customers").select("*").eq("email", "p8-fixture-guest@example.com").single();
  check("a guest buyer gets a customer row named from the address", guest?.first_name === "Ravi" && guest?.last_name === "Kumar" && guest?.accepts_marketing === false);
  check("…with spend net of the refund", guest?.total_orders === 1 && guest?.total_spent_paise === 21000, `${guest?.total_orders} ${guest?.total_spent_paise}`);
  const { data: cancelled } = await db.from("customers").select("total_orders, total_spent_paise").eq("email", "p8-fixture-cancel@example.com").single();
  check("a cancelled order counts for nothing", cancelled?.total_orders === 0 && cancelled?.total_spent_paise === 0);
  check("orders are linked to their customer", o1?.customer_id === asha?.id && o2?.customer_id === guest?.id);

  const { data: codes } = await db.from("discounts").select("*").in("code", ["P8SUMMER", "P8FREESHIP", "P8POSTCARD"]);
  const summer = codes?.find((c) => c.code === "P8SUMMER");
  check("a percentage code: value, minimum, limits, usage", Number(summer?.value) === 15 && summer?.min_subtotal_paise === 50000 && summer?.usage_limit === 5 && summer?.once_per_customer && summer?.used_count === 3);
  check("…and inactive, because it has ended", summer?.active === false);
  const free = codes?.find((c) => c.code === "P8FREESHIP");
  check("a shipping-line rule becomes free shipping", free?.type === "free_shipping" && free?.applies_to === "all" && free?.active === true);
  const postcard = codes?.find((c) => c.code === "P8POSTCARD");
  check("a product-scoped code points at the imported product", postcard?.type === "fixed_amount" && Number(postcard?.value) === 5000 && postcard?.applies_to === "products" && postcard?.product_ids?.length === 1);
  const { data: nagma } = await db.from("discounts").select("shopify_id, used_count").eq("code", "NAGMA15").single();
  check("a code already in the store is linked, not overwritten", nagma?.shopify_id === 990000404 && nagma?.used_count === before.nagmaUsed);

  section("Run it again");
  const again = run("--apply");
  check("the second run imports nothing new", /orders\s+3 already imported/.test(again) && /products\s+2 already imported|products\s+.*already imported/.test(again), again.split("\n").filter((l) => /^\s+(orders|products|customers|discounts)/.test(l)).join(" | "));
  const { count: twice } = await db.from("orders").select("id", { count: "exact", head: true }).in("shopify_id", ORDER_IDS);
  const { count: products } = await db.from("products").select("id", { count: "exact", head: true }).eq("shopify_id", 990000002);
  const { count: customers } = await db.from("customers").select("id", { count: "exact", head: true }).like("email", `${EMAIL_PREFIX}%`);
  check("still three orders, one new product, three customers", twice === 3 && products === 1 && customers === 3, `${twice} ${products} ${customers}`);

  section("Refunds and cancellation on an imported order");
  const { error: cancelError } = await db.rpc("cancel_order", { p_order_id: o2.id, p_restock: [], p_reason: "test", p_actor: "p8-test" });
  check("an imported order with money on it can be cancelled without Razorpay", !cancelError, cancelError?.message ?? "");
} finally {
  await cleanup();
  await db.from("audit_log").delete().eq("admin_email", "p8-test");
  console.log("\ncleaned up fixtures");
}

console.log(failures === 0 ? "\nAll P8 checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
