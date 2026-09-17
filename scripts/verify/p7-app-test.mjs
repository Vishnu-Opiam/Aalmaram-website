/**
 * P7 through the running app: per-state shipping, closing the checkout,
 * recovering an abandoned basket, the reminder cron's guards, and the new admin
 * routes staying shut to strangers.
 *
 *     node --env-file=.env.local --env-file=.env.development.local scripts/verify/p7-app-test.mjs
 *
 * Needs a dev server with the same CRON_SECRET. Settings are snapshotted and
 * restored in `finally`.
 */
import { createClient } from "@supabase/supabase-js";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const CRON = process.env.CRON_SECRET;
if (!CRON) {
  console.error("CRON_SECRET must be set for this suite.");
  process.exit(1);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(62)} ${detail}`);
};
const section = (title) => console.log(`\n── ${title}`);
const RUN = Date.now();
const email = `p7-app-${RUN}@example.com`;

const post = async (path, body) => {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const { data: settingsSnapshot } = await db.from("settings").select("key, value");
const setSetting = async (key, patch) => {
  const { data } = await db.from("settings").select("value").eq("key", key).single();
  await db.from("settings").update({ value: { ...data.value, ...patch } }).eq("key", key);
};

const { data: product } = await db
  .from("products")
  .insert({ handle: `p7-app-${RUN}`, title: "P7 app book", subtitle: "Test", status: "active" })
  .select("id")
  .single();
const { data: variant } = await db
  .from("product_variants")
  .insert({ product_id: product.id, title: "Default", sku: `P7APP-${RUN}`, price_paise: 50000, compare_at_paise: 90000, inventory_quantity: 3 })
  .select("id")
  .single();
const { data: draft } = await db
  .from("products")
  .insert({ handle: `p7-app-draft-${RUN}`, title: "P7 draft", status: "draft" })
  .select("id")
  .single();
const { data: draftVariant } = await db
  .from("product_variants")
  .insert({ product_id: draft.id, title: "Default", price_paise: 100, inventory_quantity: 5 })
  .select("id")
  .single();

const checkoutIds = [];

try {
  // ── Shipping by state ─────────────────────────────────────────────────────
  section("Shipping by state");

  await setSetting("shipping", { flat_rate_paise: 6000, free_threshold_paise: 99900, state_overrides: { Kerala: 4000, Ladakh: 15000 } });
  const quote = (state, quantity = 1) =>
    post("/api/checkout/quote", { lines: [{ variantId: variant.id, quantity }], state });

  const kerala = await quote("Kerala");
  check("Kerala gets its own rate", kerala.status === 200 && kerala.body.shippingPaise === 4000, `${kerala.body.shippingPaise}`);
  check("…and the total includes it", kerala.body.totalPaise === 54000, `${kerala.body.totalPaise}`);
  check("state names match in any case", (await quote("  kerala ")).body.shippingPaise === 4000);
  check("a dearer state gets its rate", (await quote("Ladakh")).body.shippingPaise === 15000);
  check("a state with no override pays the flat rate", (await quote("Goa")).body.shippingPaise === 6000);
  check("no state yet pays the flat rate", (await quote(null)).body.shippingPaise === 6000);
  check("something that isn't a state pays the flat rate", (await quote("Narnia")).body.shippingPaise === 6000);
  check("above the threshold it's free, even to an override state", (await quote("Ladakh", 2)).body.shippingPaise === 0);

  // ── Closing the checkout ──────────────────────────────────────────────────
  section("Closing the checkout");

  await setSetting("features", { checkout_enabled: false });
  const closed = await post("/api/checkout", {
    lines: [{ variantId: variant.id, quantity: 1 }],
    email,
    address: { name: "Test", phone: "9999999999", line1: "1 Road", city: "Kochi", state: "Kerala", pincode: "682001" },
  });
  check("POST /api/checkout refuses while closed", closed.status === 503 && /not taking orders/i.test(closed.body.error ?? ""), `${closed.status} ${closed.body.error}`);
  const { count: made } = await db.from("checkouts").select("id", { count: "exact", head: true }).eq("email", email);
  check("…and writes no checkout row", made === 0, `${made}`);
  check("quotes still work while closed", (await quote("Kerala")).status === 200);
  const page = await (await fetch(`${BASE_URL}/checkout`)).text();
  check("the checkout page tells buyers orders are paused", /checkoutEnabled\\?":false|not taking orders/i.test(page));
  await setSetting("features", { checkout_enabled: true });

  // ── Recovering a basket ───────────────────────────────────────────────────
  section("Recovering a basket");

  const insertCheckout = async (extra) => {
    const { data, error } = await db
      .from("checkouts")
      .insert({
        email,
        line_items: [
          { variant_id: variant.id, quantity: 5, unit_price_paise: 45000 },
          { variant_id: draftVariant.id, quantity: 1, unit_price_paise: 100 },
        ],
        discount_code: "NAGMA15",
        subtotal_paise: 1,
        total_paise: 1,
        shipping_address: { name: "Secret Name", line1: "Secret Street" },
        status: "active",
        ...extra,
      })
      .select("id")
      .single();
    if (error) throw error;
    checkoutIds.push(data.id);
    return data.id;
  };

  const live = await insertCheckout({});
  const recovered = await post("/api/checkout/recover", { id: live });
  const item = recovered.body.items?.[0];
  check("an active basket comes back", recovered.status === 200 && recovered.body.items?.length === 1, JSON.stringify(recovered.body).slice(0, 140));
  check("…at today's price, not the price it was left at", item?.pricePaise === 50000 && item?.compareAtPaise === 90000);
  check("…capped at the stock there is", item?.qty === 3, `${item?.qty}`);
  check("…in the cart's own shape", item?.variantId === variant.id && item?.handle === `p7-app-${RUN}` && typeof item?.image === "string");
  check("…with its discount code", recovered.body.discountCode === "NAGMA15");
  check("a product no longer on sale is left out", !recovered.body.items?.some((i) => i.variantId === draftVariant.id));
  check("the address and email are never returned", !JSON.stringify(recovered.body).includes("Secret") && !JSON.stringify(recovered.body).includes(email));

  const done = await insertCheckout({ status: "completed" });
  check("a completed basket is not", (await post("/api/checkout/recover", { id: done })).status === 404);
  const old = await insertCheckout({ created_at: new Date(Date.now() - 8 * 86_400_000).toISOString() });
  check("a basket over a week old is not", (await post("/api/checkout/recover", { id: old })).status === 404);
  check("an unknown id is not", (await post("/api/checkout/recover", { id: "00000000-0000-0000-0000-000000000000" })).status === 404);
  check("a malformed id is not", (await post("/api/checkout/recover", { id: "../../etc" })).status === 404);

  // ── The reminder cron ─────────────────────────────────────────────────────
  section("Abandoned-checkout cron");

  const cron = (secret) =>
    fetch(`${BASE_URL}/api/cron/abandoned`, { headers: secret ? { authorization: `Bearer ${secret}` } : {} });
  check("refuses no secret", (await cron(null)).status === 401);
  check("refuses a wrong secret", (await cron("nope")).status === 401);

  await setSetting("features", { abandoned_checkout_email: false });
  const off = await (await cron(CRON)).json();
  check("stands down when switched off in Settings", /switched off/.test(off.skipped ?? ""), JSON.stringify(off));
  await setSetting("features", { abandoned_checkout_email: true });

  if (!process.env.RESEND_API_KEY) {
    const due = await insertCheckout({ created_at: new Date(Date.now() - 90 * 60_000).toISOString() });
    const noEmail = await (await cron(CRON)).json();
    check("stands down without Resend", /RESEND_API_KEY/.test(noEmail.skipped ?? ""), JSON.stringify(noEmail));
    const { data: untouched } = await db.from("checkouts").select("recovery_email_sent_at").eq("id", due).single();
    check("…without spending anyone's one reminder", untouched.recovery_email_sent_at === null);
  } else {
    console.log("SKIP  Resend is configured; not sending a real reminder from a test");
  }

  // ── Routes ────────────────────────────────────────────────────────────────
  section("Routes");

  for (const path of ["/admin/analytics", "/admin/settings", "/admin/settings/integrations", "/admin/settings/team", "/admin/events/new"]) {
    const res = await fetch(`${BASE_URL}${path}`, { redirect: "manual" });
    check(`${path} sends a stranger to the login`, res.status === 307 && (res.headers.get("location") ?? "").includes("/admin/login"), `${res.status}`);
  }
  const invite = await fetch(`${BASE_URL}/admin/accept-invite?token_hash=abc&type=invite`, { redirect: "manual" });
  const inviteHtml = await invite.text();
  check("the invite page is reachable without a session", invite.status === 200 && inviteHtml.includes("Set password and sign in"), `${invite.status}`);
  const broken = await (await fetch(`${BASE_URL}/admin/accept-invite`)).text();
  check("…and says so when the link is incomplete", broken.includes("link isn"));
} finally {
  for (const row of settingsSnapshot ?? []) {
    await db.from("settings").update({ value: row.value }).eq("key", row.key);
  }
  if (checkoutIds.length) await db.from("checkouts").delete().in("id", checkoutIds);
  await db.from("checkouts").delete().eq("email", email);
  await db.from("products").delete().in("id", [product.id, draft.id]);
  console.log("\ncleaned up fixtures");
}

console.log(failures === 0 ? "\nAll P7 app checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
