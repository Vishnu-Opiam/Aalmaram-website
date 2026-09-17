/**
 * P7 against the live database: settings edits, the team guards, abandoned
 * checkouts, the analytics figures, and the Supabase invite link the team page
 * is built on.
 *
 *     node --env-file=.env.local scripts/verify/p7-test.mjs
 *
 * Settings and the real owner's row are snapshotted first and restored in
 * `finally`, whatever happens.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const db = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anonClient = () =>
  createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const ACTOR = "p7-test";
const RUN = Date.now();
let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(64)} ${detail}`);
};
const section = (title) => console.log(`\n── ${title}`);
const rid = (p) => `${p}_${Math.random().toString(36).slice(2, 12)}`;
const emails = [];
const newEmail = (tag) => {
  const e = `p7-${tag}-${RUN}@example.com`;
  emails.push(e);
  return e;
};

const { data: settingsSnapshot } = await db.from("settings").select("key, value");
const { data: adminSnapshot } = await db.from("admin_users").select("id, email, role");
const authUserIds = [];
// Checkouts with no email can't be found by email at cleanup.
const anonymousCheckoutIds = [];

const { data: product } = await db
  .from("products")
  .insert({ handle: `p7-test-${RUN}`, title: "P7 test book", status: "active" })
  .select("id")
  .single();
const { data: variant } = await db
  .from("product_variants")
  .insert({ product_id: product.id, title: "Default", sku: `P7-${RUN}`, price_paise: 50000, inventory_quantity: 100 })
  .select("id")
  .single();

async function makeOrder(tag, { quantity = 1, discountCode = null, discountPaise = 0 } = {}) {
  const email = newEmail(tag);
  const subtotal = 50000 * quantity;
  const { data: checkout, error } = await db
    .from("checkouts")
    .insert({
      email,
      line_items: [{ variant_id: variant.id, quantity, unit_price_paise: 50000 }],
      subtotal_paise: subtotal,
      discount_paise: discountPaise,
      discount_code: discountCode,
      shipping_paise: 6000,
      total_paise: subtotal - discountPaise + 6000,
      shipping_address: { name: "Test Buyer", phone: "9999999999", line1: "1", city: "Kochi", state: "Kerala", pincode: "682001" },
    })
    .select("id")
    .single();
  if (error) throw error;
  const { data, error: orderError } = await db.rpc("create_order_from_checkout", {
    p_checkout_id: checkout.id,
    p_razorpay_order_id: rid("order_p7"),
    p_razorpay_payment_id: rid("pay_p7"),
    p_razorpay_signature: "sig",
  });
  if (orderError) throw new Error(orderError.message);
  return { orderId: data.order_id, checkoutId: checkout.id, email };
}

try {
  // ── Settings ──────────────────────────────────────────────────────────────
  section("merge_setting");

  const merge = (key, patch) => db.rpc("merge_setting", { p_key: key, p_patch: patch, p_actor: ACTOR });
  const setting = async (key) => (await db.from("settings").select("value").eq("key", key).single()).data.value;

  // A token in the Shiprocket row that the pickup form must not wipe.
  await db.from("settings").update({ value: { token: "keep-me", token_expires_at: "2099-01-01T00:00:00Z", pickup_location: "" } }).eq("key", "shiprocket");
  const { error: pickupError } = await merge("shiprocket", { pickup_location: "Kochi Studio" });
  const shiprocket = await setting("shiprocket");
  check("the pickup location saves", !pickupError && shiprocket.pickup_location === "Kochi Studio", pickupError?.message ?? "");
  check("…and the cached token survives", shiprocket.token === "keep-me");

  const { error: tokenError } = await merge("shiprocket", { token: "evil" });
  check("the token itself cannot be written from the admin", tokenError?.code === "22023", tokenError?.code ?? "no error!");

  const { error: unknownKey } = await merge("rate_limits", { x: 1 });
  check("an unlisted key is refused", unknownKey?.code === "22023", unknownKey?.code ?? "no error!");
  const { error: notObject } = await merge("inventory", [1, 2]);
  check("a patch that isn't an object is refused", notObject?.code === "22023", notObject?.code ?? "no error!");

  const before = await setting("shipping");
  await merge("shipping", { state_overrides: { Kerala: 4000 } });
  const after = await setting("shipping");
  check("a patch merges, keeping the other fields", after.flat_rate_paise === before.flat_rate_paise && after.state_overrides.Kerala === 4000);

  const { data: audits } = await db
    .from("audit_log")
    .select("diff")
    .eq("admin_email", ACTOR)
    .eq("action", "settings.update")
    .eq("entity_id", "shipping");
  check(
    "the audit row holds only what changed, from and to",
    audits?.length === 1 && Object.keys(audits[0].diff).join() === "state_overrides" && audits[0].diff.state_overrides.to.Kerala === 4000,
    JSON.stringify(audits?.[0]?.diff ?? {})
  );
  await merge("shipping", { state_overrides: { Kerala: 4000 } });
  const { count: noopAudits } = await db
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("admin_email", ACTOR)
    .eq("entity_id", "shipping");
  check("saving the same values writes no audit row", noopAudits === 1, `${noopAudits}`);

  const { data: integrations } = await db.from("settings").select("value, is_public").eq("key", "integrations").single();
  check("the integrations row exists and is private", integrations && integrations.is_public === false && typeof integrations.value.webhooks === "object");
  const features = await setting("features");
  check("abandoned_checkout_email defaults on", features.abandoned_checkout_email === true || settingsSnapshot.find((s) => s.key === "features").value.abandoned_checkout_email === false);

  // ── Team ──────────────────────────────────────────────────────────────────
  section("Team");

  const owner = (adminSnapshot ?? []).find((a) => a.role === "owner");
  const { data: staff } = await db.from("admin_users").insert({ email: newEmail("staff"), role: "staff" }).select("id").single();

  const { error: promote } = await db.rpc("set_admin_role", { p_admin_id: staff.id, p_role: "owner", p_actor: ACTOR });
  check("staff can be made an owner", !promote, promote?.message ?? "");
  const { error: demote } = await db.rpc("set_admin_role", { p_admin_id: staff.id, p_role: "staff", p_actor: ACTOR });
  check("…and back, while another owner exists", !demote, demote?.message ?? "");
  const { error: badRole } = await db.rpc("set_admin_role", { p_admin_id: staff.id, p_role: "god", p_actor: ACTOR });
  check("an unknown role is refused", badRole?.code === "22023", badRole?.code ?? "no error!");

  const { count: owners } = await db.from("admin_users").select("id", { count: "exact", head: true }).eq("role", "owner");
  if (owner && owners === 1) {
    const { error: lastDemote } = await db.rpc("set_admin_role", { p_admin_id: owner.id, p_role: "staff", p_actor: ACTOR });
    check("the last owner cannot be demoted", lastDemote?.code === "23514", lastDemote?.code ?? "no error!");
    const { error: lastRemove } = await db.rpc("remove_admin_user", { p_admin_id: owner.id, p_actor: ACTOR });
    check("the last owner cannot be removed", lastRemove?.code === "23514", lastRemove?.code ?? "no error!");
  } else {
    console.log("SKIP  last-owner guards (the store has more than one owner)");
  }

  const { error: selfRemove } = await db.rpc("remove_admin_user", { p_admin_id: staff.id, p_actor: emails[emails.length - 1] });
  check("nobody can remove themselves", selfRemove?.code === "55000", selfRemove?.code ?? "no error!");

  const { data: removed, error: removeError } = await db.rpc("remove_admin_user", { p_admin_id: staff.id, p_actor: ACTOR });
  check("staff can be removed", !removeError && removed?.email === emails[emails.length - 1], removeError?.message ?? "");
  const { count: roleAudits } = await db
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("admin_email", ACTOR)
    .in("action", ["admin.role", "admin.remove"]);
  check("role changes and removals are audited", roleAudits === 3, `${roleAudits}`);

  // ── The invite link ───────────────────────────────────────────────────────
  section("Invite link (Supabase)");
  {
    const email = newEmail("invitee");
    const { data: stale, error: linkError } = await db.auth.admin.generateLink({ type: "invite", email });
    check("an invite link is generated with signups off", !linkError && Boolean(stale?.properties?.hashed_token), linkError?.message ?? "");
    if (stale?.user?.id) authUserIds.push(stale.user.id);

    // Inviting again before they accept issues a fresh link and retires the first,
    // so the most recent link the owner sent is the one that works.
    const { data: link, error: reissueError } = await db.auth.admin.generateLink({ type: "invite", email });
    check("re-inviting before acceptance issues a new link", !reissueError && link?.properties?.hashed_token !== stale.properties.hashed_token, reissueError?.message ?? "");
    const { error: staleError } = await anonClient().auth.verifyOtp({ token_hash: stale.properties.hashed_token, type: "invite" });
    check("…and the earlier link no longer works", Boolean(staleError), staleError?.message ?? "no error!");

    const browser = anonClient();
    const { data: verified, error: verifyError } = await browser.auth.verifyOtp({
      token_hash: link.properties.hashed_token,
      type: "invite",
    });
    check("the current token verifies into a session", !verifyError && verified?.user?.email === email, verifyError?.message ?? "");

    const password = randomBytes(18).toString("base64url");
    const { error: pwError } = await browser.auth.updateUser({ password });
    check("the new user can set a password", !pwError, pwError?.message ?? "");

    const { error: replay } = await anonClient().auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "invite" });
    check("the token cannot be used twice", Boolean(replay), replay?.message ?? "no error!");

    const { error: signIn } = await anonClient().auth.signInWithPassword({ email, password });
    check("…and signs in with the password afterwards", !signIn, signIn?.message ?? "");

    const { error: again } = await db.auth.admin.generateLink({ type: "invite", email });
    check("inviting someone who has accepted is refused (the action falls back to a reset link)", Boolean(again) && /already|registered|exists/i.test(again.message), again?.message ?? "no error!");

    const { data: recovery, error: recoveryError } = await db.auth.admin.generateLink({ type: "recovery", email });
    check("a password-reset link is generated for them", !recoveryError && Boolean(recovery?.properties?.hashed_token), recoveryError?.message ?? "");
    const { error: recoverVerify } = await anonClient().auth.verifyOtp({ token_hash: recovery.properties.hashed_token, type: "recovery" });
    check("…and it verifies", !recoverVerify, recoverVerify?.message ?? "");
  }

  // ── Abandoned checkouts ───────────────────────────────────────────────────
  section("Abandoned checkouts");
  {
    const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
    const insertCheckout = async (tag, extra) => {
      const { data, error } = await db
        .from("checkouts")
        .insert({
          email: newEmail(tag),
          line_items: [{ variant_id: variant.id, quantity: 1, unit_price_paise: 50000 }],
          subtotal_paise: 50000,
          total_paise: 56000,
          shipping_paise: 6000,
          status: "active",
          ...extra,
        })
        .select("id, email")
        .single();
      if (error) throw error;
      return data;
    };

    const due = await insertCheckout("due", { created_at: ago(90) });
    const tooNew = await insertCheckout("new", { created_at: ago(20) });
    const tooOld = await insertCheckout("old", { created_at: ago(60 * 50) });
    const completed = await insertCheckout("done", { created_at: ago(90), status: "completed" });
    const noEmail = await insertCheckout("anon", { created_at: ago(90), email: null });
    anonymousCheckoutIds.push(noEmail.id);
    const since = await insertCheckout("since", { created_at: ago(120) });
    // The buyer came back and bought something else.
    await db.from("orders").insert({ email: since.email, payment_status: "paid", total_paise: 1000, created_at: ago(30) });

    const claim = () => db.rpc("claim_abandoned_checkouts", { p_after_minutes: 60, p_within_hours: 48, p_limit: 100 });
    const { data: first, error: claimError } = await claim();
    const ids = (first ?? []).map((c) => c.id);
    check("a basket left over an hour ago is claimed", !claimError && ids.includes(due.id), claimError?.message ?? "");
    check("…with its email and line items", (first ?? []).find((c) => c.id === due.id)?.line_items?.[0]?.variant_id === variant.id);
    check("one left twenty minutes ago is not", !ids.includes(tooNew.id));
    check("one older than two days is not", !ids.includes(tooOld.id));
    check("a completed checkout is not", !ids.includes(completed.id));
    check("one with no email is not", !ids.includes(noEmail?.id));
    check("one whose buyer has since ordered is not", !ids.includes(since.id));

    const { data: stamped } = await db.from("checkouts").select("recovery_email_sent_at").eq("id", due.id).single();
    check("claiming stamps recovery_email_sent_at", Boolean(stamped.recovery_email_sent_at));
    const { data: second } = await claim();
    check("a claimed basket is never claimed again", !(second ?? []).some((c) => c.id === due.id));

    const { error: badWindow } = await db.rpc("claim_abandoned_checkouts", { p_after_minutes: 1, p_within_hours: 48, p_limit: 10 });
    check("a window under fifteen minutes is refused", badWindow?.code === "22023", badWindow?.code ?? "no error!");
  }

  // ── Analytics with real orders ────────────────────────────────────────────
  section("store_analytics");
  {
    const read = async () => (await db.rpc("store_analytics", { p_days: 7 })).data;
    const base = await read();

    await db.from("discounts").insert({ code: `P7${RUN}`, title: "p7", type: "percentage", value: 10, starts_at: new Date(Date.now() - 60_000).toISOString() });
    const a = await makeOrder("a1", { quantity: 2 });
    await makeOrder("a2",{ quantity: 1, discountCode: `P7${RUN}`, discountPaise: 5000 });

    // A partial refund processed today, restocking one copy of order a.
    const { data: items } = await db.from("order_items").select("id").eq("order_id", a.orderId);
    const { data: begun, error: beginError } = await db.rpc("begin_refund", {
      p_order_id: a.orderId,
      p_amount_paise: 20000,
      p_restock: [{ order_item_id: items[0].id, quantity: 1 }],
      p_cancel: false,
      p_reason: "p7",
      p_actor: ACTOR,
    });
    if (beginError) throw new Error(beginError.message);
    await db.rpc("complete_refund", { p_refund_id: begun.refund_id, p_razorpay_refund_id: rid("rfnd_p7"), p_actor: ACTOR });

    const now = await read();
    const d = (k) => now.current[k] - base.current[k];
    check("two more orders", d("orders") === 2, `${d("orders")}`);
    check("gross adds both totals", d("gross_paise") === 106000 + 51000, `${d("gross_paise")}`);
    check("the refund counts on the day it was processed", d("refunded_paise") === 20000, `${d("refunded_paise")}`);
    check("copies sold are net of the restocked one", d("units") === 2, `${d("units")}`);
    const today = now.daily[now.daily.length - 1];
    const baseToday = base.daily[base.daily.length - 1];
    check(
      "today's point carries the orders, gross, refund and net",
      today.orders - baseToday.orders === 2 && today.net_paise - baseToday.net_paise === 157000 - 20000,
      JSON.stringify(today)
    );
    const code = now.discounts.find((x) => x.code === `P7${RUN}`);
    check("the code shows one use and what it gave away", code?.orders === 1 && code?.discount_paise === 5000 && code?.type === "percentage", JSON.stringify(code ?? {}));
    const top = now.top_products.find((x) => x.title === "P7 test book");
    check("the product tops the list with its copies and revenue", top?.units === 2 && top?.orders === 2 && top?.revenue_paise === 150000, JSON.stringify(top ?? {}));
    check(
      "both checkouts count as completed",
      now.current.checkouts_completed - base.current.checkouts_completed === 2
    );
  }

  // ── Anon ──────────────────────────────────────────────────────────────────
  section("Anon");
  {
    const anon = anonClient();
    const uuid = "00000000-0000-0000-0000-000000000000";
    for (const [fn, args] of Object.entries({
      merge_setting: { p_key: "features", p_patch: { checkout_enabled: false }, p_actor: "anon" },
      set_admin_role: { p_admin_id: uuid, p_role: "owner", p_actor: "anon" },
      remove_admin_user: { p_admin_id: uuid, p_actor: "anon" },
      claim_abandoned_checkouts: { p_after_minutes: 60, p_within_hours: 48, p_limit: 10 },
    })) {
      const { error } = await anon.rpc(fn, args);
      check(`anon cannot call ${fn}`, error?.code === "42501", error?.code ?? "no error!");
    }
    const { data: privateSettings } = await anon.from("settings").select("key").in("key", ["integrations", "store", "inventory"]);
    check("anon cannot read the private settings rows", (privateSettings ?? []).length === 0);
    const { data: publicFeatures } = await anon.from("settings").select("key").eq("key", "features");
    check("anon can read the features row checkout needs", (publicFeatures ?? []).length === 1);
  }
} finally {
  for (const row of settingsSnapshot ?? []) {
    await db.from("settings").update({ value: row.value }).eq("key", row.key);
  }
  for (const row of adminSnapshot ?? []) {
    await db.from("admin_users").update({ role: row.role }).eq("id", row.id);
  }
  await db.from("admin_users").delete().in("email", emails);
  for (const id of authUserIds) await db.auth.admin.deleteUser(id);

  const { data: orders } = await db.from("orders").select("id").in("email", emails);
  const orderIds = (orders ?? []).map((o) => o.id);
  if (orderIds.length) {
    await db.from("refunds").delete().in("order_id", orderIds);
    await db.from("discount_redemptions").delete().in("order_id", orderIds);
    for (const id of orderIds) {
      await db.from("webhook_outbox").delete().eq("payload->>order_id", id);
      await db.from("audit_log").delete().eq("entity_id", id);
      await db.from("inventory_adjustments").delete().eq("order_id", id);
    }
    await db.from("orders").delete().in("id", orderIds);
  }
  await db.from("checkouts").delete().in("email", emails);
  if (anonymousCheckoutIds.length) await db.from("checkouts").delete().in("id", anonymousCheckoutIds);
  await db.from("customers").delete().in("email", emails);
  await db.from("discounts").delete().eq("code", `P7${RUN}`);
  await db.from("webhook_outbox").delete().eq("topic", "inventory.low").eq("payload->>product_id", product.id);
  await db.from("inventory_adjustments").delete().eq("variant_id", variant.id);
  await db.from("audit_log").delete().eq("admin_email", ACTOR);
  await db.from("products").delete().eq("id", product.id);
  console.log("\ncleaned up fixtures");
}

console.log(failures === 0 ? "\nAll P7 checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
