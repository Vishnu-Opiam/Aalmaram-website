/**
 * P6: the outbox drain functions and the low-stock event, against the live
 * database.
 *
 *     node --env-file=.env.local scripts/verify/p6-test.mjs
 *
 * No dev server and no n8n needed. What is proven here is the queue itself:
 * that two drains can't claim the same row, that a lease hides a row until it
 * runs out, that failures back off and eventually give up, that a row for an
 * unconfigured topic is never touched, and that stock crossing the threshold
 * queues exactly one alert. The HTTP side is p6-app-test.mjs.
 */
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ACTOR = "p6-test";
const RUN = Date.now();
const MARK = `p6-test-${RUN}`;

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(64)} ${detail}`);
};
const section = (title) => console.log(`\n── ${title}`);
const rid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 12)}`;
const minutesFromNow = (iso) => (new Date(iso).getTime() - Date.now()) / 60000;

// This suite claims real rows. Refuse to run against a queue that has anything
// in it that isn't ours, rather than deliver or bury someone's real event.
const { count: foreign } = await db
  .from("webhook_outbox")
  .select("id", { count: "exact", head: true })
  .eq("status", "pending");
if (foreign) {
  console.error(`The outbox has ${foreign} pending row(s) that this suite did not create. Refusing to run.`);
  process.exit(1);
}

const insertRow = async (topic = "order.refunded", extra = {}) => {
  const { data, error } = await db
    .from("webhook_outbox")
    .insert({ topic, payload: { test: MARK, order_id: "00000000-0000-0000-0000-000000000000" }, ...extra })
    .select("*")
    .single();
  if (error) throw error;
  return data;
};
const loadRow = async (id) => (await db.from("webhook_outbox").select("*").eq("id", id).single()).data;
const claim = (topics, limit = 20, lease = 120) =>
  db.rpc("claim_outbox", { p_topics: topics, p_limit: limit, p_lease_seconds: lease });
const finish = (id, outcome, extra = {}) =>
  db.rpc("finish_outbox", { p_id: id, p_outcome: outcome, ...extra });

const emails = [];
let productId = null;
let draftProductId = null;

try {
  // ── Claiming ──────────────────────────────────────────────────────────────
  section("Claiming");

  const a = await insertRow("order.refunded");
  const b = await insertRow("order.refunded");
  const other = await insertRow("order.cancelled");

  const { data: claimed, error: claimError } = await claim(["order.refunded"]);
  check("claim returns due rows for the named topics", !claimError && claimed?.length === 2, claimError?.message ?? `${claimed?.length}`);
  check("rows for other topics are not claimed", !claimed?.some((r) => r.id === other.id));
  const otherAfter = await loadRow(other.id);
  check("an unclaimed topic's row is untouched", otherAfter.attempts === 0 && otherAfter.last_attempt_at === null);

  const aClaimed = await loadRow(a.id);
  check("claiming counts the attempt", aClaimed.attempts === 1, `${aClaimed.attempts}`);
  check("claiming stamps last_attempt_at", Boolean(aClaimed.last_attempt_at));
  check("the lease pushes next_attempt_at out", minutesFromNow(aClaimed.next_attempt_at) > 1.5);
  check("claimed rows stay pending", aClaimed.status === "pending");

  const { data: again } = await claim(["order.refunded"]);
  check("a leased row is not claimed again", (again ?? []).length === 0, `${again?.length}`);

  const { data: none } = await claim([]);
  check("no topics claims nothing", (none ?? []).length === 0);

  for (const [label, args] of [
    ["a limit of 0 is refused", { p_topics: ["order.paid"], p_limit: 0 }],
    ["a limit over 100 is refused", { p_topics: ["order.paid"], p_limit: 101 }],
    ["a lease under 10s is refused", { p_topics: ["order.paid"], p_lease_seconds: 5 }],
  ]) {
    const { error } = await db.rpc("claim_outbox", args);
    check(label, error?.code === "22023", error?.code ?? "no error!");
  }

  // Two drains at once must not share a row.
  const parallel = [];
  for (let i = 0; i < 6; i++) parallel.push(await insertRow("order.shipped"));
  const [left, right] = await Promise.all([claim(["order.shipped"], 4), claim(["order.shipped"], 4)]);
  const leftIds = (left.data ?? []).map((r) => r.id);
  const rightIds = (right.data ?? []).map((r) => r.id);
  const overlap = leftIds.filter((id) => rightIds.includes(id));
  check("two concurrent claims never share a row", overlap.length === 0, `overlap ${overlap.length}`);
  check("neither claims more than its limit", leftIds.length <= 4 && rightIds.length <= 4, `${leftIds.length}, ${rightIds.length}`);
  const { data: rest } = await claim(["order.shipped"], 10);
  const all = new Set([...leftIds, ...rightIds, ...(rest ?? []).map((r) => r.id)]);
  check("a third claim picks up whatever the first two left", all.size === 6, `${all.size}`);

  // ── Finishing ─────────────────────────────────────────────────────────────
  section("Finishing");

  const { data: sentStatus, error: sentError } = await finish(a.id, "sent", { p_response_status: 200 });
  const aSent = await loadRow(a.id);
  check("sent marks the row sent", !sentError && sentStatus === "sent" && aSent.status === "sent", sentError?.message ?? "");
  check("sent stamps sent_at and the response status", Boolean(aSent.sent_at) && aSent.last_response_status === 200);

  const { data: retryOnSent } = await finish(a.id, "retry", { p_error: "late failure" });
  const aStill = await loadRow(a.id);
  check("a late failure cannot un-send a sent row", retryOnSent === "sent" && aStill.status === "sent" && aStill.last_error === null);

  const { data: retried } = await finish(b.id, "retry", { p_error: "n8n answered 502", p_response_status: 502 });
  const bRetry = await loadRow(b.id);
  check("a first failure goes back to pending", retried === "pending" && bRetry.status === "pending");
  const wait1 = minutesFromNow(bRetry.next_attempt_at);
  check("…due again in about a minute", wait1 > 0.5 && wait1 < 1.5, `${wait1.toFixed(2)} min`);
  check("…with the error and status kept", bRetry.last_error === "n8n answered 502" && bRetry.last_response_status === 502);

  // Attempt 3 backs off 9 minutes.
  await db.from("webhook_outbox").update({ attempts: 3 }).eq("id", b.id);
  await finish(b.id, "retry", { p_error: "again" });
  const wait3 = minutesFromNow((await loadRow(b.id)).next_attempt_at);
  check("the third failure backs off about nine minutes", wait3 > 8.5 && wait3 < 9.5, `${wait3.toFixed(2)} min`);

  // Attempt 9 would be 3^8 minutes; capped at twelve hours.
  await db.from("webhook_outbox").update({ attempts: 9 }).eq("id", b.id);
  await finish(b.id, "retry", { p_error: "again" });
  const wait9 = minutesFromNow((await loadRow(b.id)).next_attempt_at);
  check("backoff is capped at twelve hours", wait9 > 715 && wait9 < 721, `${wait9.toFixed(0)} min`);

  await db.from("webhook_outbox").update({ attempts: 10 }).eq("id", b.id);
  const { data: gaveUp } = await finish(b.id, "retry", { p_error: "final" });
  check("the tenth failure gives up", gaveUp === "failed" && (await loadRow(b.id)).status === "failed");

  const { data: failedClaim } = await claim(["order.refunded"]);
  check("a failed row is never claimed", !(failedClaim ?? []).some((r) => r.id === b.id));

  const deferredRow = parallel[0];
  const { data: deferred } = await finish(deferredRow.id, "deferred", { p_error: "N8N_ORDER_SHIPPED_WEBHOOK_URL is not set" });
  const d = await loadRow(deferredRow.id);
  check("deferred hands the attempt back", deferred === "pending" && d.attempts === 0, `${d.attempts}`);
  const waitDeferred = minutesFromNow(d.next_attempt_at);
  check("…and waits about fifteen minutes", waitDeferred > 14 && waitDeferred < 16, `${waitDeferred.toFixed(1)} min`);

  const dropRow = parallel[1];
  const { data: dropped } = await finish(dropRow.id, "dropped", { p_error: "order no longer exists" });
  const dr = await loadRow(dropRow.id);
  check("dropped leaves the queue as sent, with the reason", dropped === "sent" && dr.status === "sent" && dr.last_error === "order no longer exists");

  const { error: badOutcome } = await finish(parallel[2].id, "maybe");
  check("an unknown outcome is refused", badOutcome?.code === "22023", badOutcome?.code ?? "no error!");
  const { error: missing } = await finish("00000000-0000-0000-0000-000000000000", "sent");
  check("finishing a row that doesn't exist is refused", missing?.code === "P0002", missing?.code ?? "no error!");

  // ── Retry from the admin ─────────────────────────────────────────────────
  section("Retry from the admin");

  const { error: retryError } = await db.rpc("retry_outbox", { p_id: b.id, p_actor: ACTOR });
  const bBack = await loadRow(b.id);
  check("a failed row can be put back", !retryError && bBack.status === "pending" && bBack.attempts === 0, retryError?.message ?? "");
  check("…due now", minutesFromNow(bBack.next_attempt_at) <= 0.1);
  const { count: retryAudit } = await db
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("entity_id", b.id)
    .eq("action", "outbox.retry");
  check("…and it is audited", retryAudit === 1, `${retryAudit}`);

  const { error: retrySent } = await db.rpc("retry_outbox", { p_id: a.id, p_actor: ACTOR });
  check("a delivered row cannot be retried", retrySent?.code === "55000", retrySent?.code ?? "no error!");

  // ── Low stock ─────────────────────────────────────────────────────────────
  section("Low stock");

  const { data: threshold } = await db.from("settings").select("value").eq("key", "inventory").single();
  const limit = Number(threshold.value.low_stock_threshold ?? 5);
  check("the threshold comes from settings", Number.isInteger(limit), `${limit}`);

  const { data: product } = await db
    .from("products")
    .insert({ handle: `p6-test-${RUN}`, title: "P6 test book", status: "active" })
    .select("id")
    .single();
  productId = product.id;
  const { data: variant } = await db
    .from("product_variants")
    .insert({ product_id: product.id, title: "Default", sku: `P6-${RUN}`, price_paise: 50000, inventory_quantity: limit + 3 })
    .select("id")
    .single();

  const lowRows = async () =>
    (
      await db
        .from("webhook_outbox")
        .select("id, payload")
        .eq("topic", "inventory.low")
        .eq("payload->>variant_id", variant.id)
    ).data ?? [];
  const adjust = (delta, reason = "manual") =>
    db.rpc("adjust_inventory", { p_variant_id: variant.id, p_delta: delta, p_reason: reason, p_note: MARK, p_actor: ACTOR });

  await adjust(-2);
  check("staying above the threshold queues nothing", (await lowRows()).length === 0);

  await adjust(-1);
  let rows = await lowRows();
  check("reaching the threshold queues one alert", rows.length === 1, `${rows.length}`);
  check(
    "…with the product, stock and threshold",
    rows[0]?.payload.product_title === "P6 test book" &&
      rows[0]?.payload.available === limit &&
      rows[0]?.payload.previous === limit + 1 &&
      rows[0]?.payload.threshold === limit,
    JSON.stringify(rows[0]?.payload ?? {})
  );

  await adjust(-1);
  check("selling further below it queues nothing more", (await lowRows()).length === 1);

  await adjust(10, "restock");
  check("restocking queues nothing", (await lowRows()).length === 1);

  await adjust(-(limit + 9));
  rows = await lowRows();
  check("crossing down again after a restock alerts again", rows.length === 2, `${rows.length}`);

  const { data: draft } = await db
    .from("products")
    .insert({ handle: `p6-draft-${RUN}`, title: "P6 draft", status: "draft" })
    .select("id")
    .single();
  draftProductId = draft.id;
  const { data: draftVariant } = await db
    .from("product_variants")
    .insert({ product_id: draft.id, title: "Default", price_paise: 100, inventory_quantity: limit + 1 })
    .select("id")
    .single();
  await db.rpc("adjust_inventory", { p_variant_id: draftVariant.id, p_delta: -2, p_reason: "manual", p_note: MARK, p_actor: ACTOR });
  const { count: draftAlerts } = await db
    .from("webhook_outbox")
    .select("id", { count: "exact", head: true })
    .eq("payload->>variant_id", draftVariant.id);
  check("a draft product never alerts", draftAlerts === 0, `${draftAlerts}`);

  // ── Analytics ─────────────────────────────────────────────────────────────
  section("Analytics");

  const { data: analytics, error: analyticsError } = await db.rpc("store_analytics", { p_days: 30 });
  check("store_analytics answers", !analyticsError && analytics?.days === 30, analyticsError?.message ?? "");
  check("…with one point per day", analytics?.daily?.length === 30, `${analytics?.daily?.length}`);
  check(
    "…and lists the low-stock test variant",
    (analytics?.low_stock ?? []).some((v) => v.variant_id === variant.id)
  );
  const { error: badDays } = await db.rpc("store_analytics", { p_days: 400 });
  check("a window over a year is refused", badDays?.code === "22023", badDays?.code ?? "no error!");

  // ── Anon ──────────────────────────────────────────────────────────────────
  section("Anon");
  {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const uuid = "00000000-0000-0000-0000-000000000000";
    const calls = {
      claim_outbox: { p_topics: ["order.paid"] },
      finish_outbox: { p_id: uuid, p_outcome: "sent" },
      retry_outbox: { p_id: uuid, p_actor: "anon" },
      store_analytics: { p_days: 7 },
    };
    for (const [fn, args] of Object.entries(calls)) {
      const { error } = await anon.rpc(fn, args);
      check(`anon cannot call ${fn}`, error?.code === "42501", error?.code ?? "no error!");
    }
    const { error: outboxRead } = await anon.from("webhook_outbox").select("id").limit(1);
    check("anon cannot read the outbox", outboxRead?.code === "42501", outboxRead?.code ?? "no error!");

    const { data: hidden } = await db
      .from("events")
      .insert({ title: `${MARK} hidden`, date: "2099-01-01", published: false })
      .select("id")
      .single();
    const { data: shown } = await db
      .from("events")
      .insert({ title: `${MARK} shown`, date: "2099-01-02", published: true })
      .select("id")
      .single();
    const { data: visible } = await anon.from("events").select("id").in("id", [hidden.id, shown.id]);
    check(
      "anon sees published events and not hidden ones",
      visible?.length === 1 && visible[0].id === shown.id,
      JSON.stringify(visible)
    );
    const { error: anonWrite } = await anon.from("events").insert({ title: "nope", date: "2099-01-01" });
    check("anon cannot create an event", Boolean(anonWrite), anonWrite?.code ?? "no error!");
  }
} finally {
  await db.from("webhook_outbox").delete().eq("payload->>test", MARK);
  if (productId || draftProductId) {
    const ids = [productId, draftProductId].filter(Boolean);
    const { data: variants } = await db.from("product_variants").select("id").in("product_id", ids);
    for (const v of variants ?? []) {
      await db.from("webhook_outbox").delete().eq("payload->>variant_id", v.id);
      await db.from("inventory_adjustments").delete().eq("variant_id", v.id);
      await db.from("audit_log").delete().eq("entity_id", v.id);
    }
    await db.from("products").delete().in("id", ids);
  }
  await db.from("events").delete().like("title", `${MARK}%`);
  await db.from("audit_log").delete().eq("admin_email", ACTOR);
  void emails;
  console.log("\ncleaned up fixtures");
}

console.log(failures === 0 ? "\nAll P6 checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
