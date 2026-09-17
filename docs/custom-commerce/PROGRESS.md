# Custom commerce — progress

Running log for the build described in [`PLAN.md`](./PLAN.md), executed per
[`OPUS-BUILD-PROMPT.md`](./OPUS-BUILD-PROMPT.md). Branch: `feat/custom-commerce`.

---

## Phase status

- [x] **P1 Foundation** — schema, RLS, clients, admin auth, seed script
- [x] **P2 Products + storefront read** — admin CRUD, Supabase Storage, /shop + PDP
- [x] **P3 Checkout + payments** — pricing, Razorpay, atomic order creation
- [x] **P4 Orders admin + discounts** — plus customers and a real `/admin` home
- [x] **P5 Shipping** — Shiprocket client, shipment RPCs, admin panels, webhook, tracking cron
- [x] **P6 Events feed + n8n** — outbox drain + cron, events in Supabase, n8n workflows rebuilt, low-stock event
- [x] **P7 Analytics + settings** — analytics + chart, store/shipping/integrations/team settings, invites, abandoned-checkout email
- [x] **P8 Migration + cutover** — Shopify import script, Shopify code removed, store.aalmaram.com redirects, [GO-LIVE.md](./GO-LIVE.md)

**The build is complete.** What remains is configuration only the owner can do — keys, DNS, n8n, the import run and a ₹1 live order — in [`GO-LIVE.md`](./GO-LIVE.md).

---

## P1 — what landed

**Migrations** (`supabase/migrations/`, 9 files, 113 statements)

| File | Contents |
|---|---|
| `…090000_init_extensions` | `citext`, `private` schema, `set_updated_at()`, order-number sequence |
| `…090100_catalog` | `products`, `product_variants`, `product_images` |
| `…090200_customers_discounts` | `customers`, `discounts` |
| `…090300_orders` | `orders`, `order_items`, `checkouts`, `discount_redemptions`, `inventory_adjustments` |
| `…090400_shipping` | `shipments` |
| `…090500_platform` | `webhook_outbox`, `events`, `settings`, `admin_users`, `audit_log`, `rate_limits` + `rate_limit_hit()` |
| `…090600_rls` | grants revoked from anon/authenticated, RLS on all 17 tables, 5 public-read policies |
| `…090700_order_rpc` | `create_order_from_checkout()` signature, body stubbed to raise |
| `…090800_seed_settings` | the `settings` singleton rows |
| `…091000_service_role_grants` | privileges for `service_role` (see below) |

**App**

- `src/lib/supabase/{server,client,admin}.ts` — request-scoped anon clients and
  a service-role client fenced off with `server-only`.
- `src/lib/database.types.ts` — hand-written stand-in (see Open items).
- `src/lib/env.ts` — one place where env vars are read and validated.
- `src/lib/admin-auth.ts` — `getAdminSession` / `requireAdmin` / `requireAdminApi`
  / `recordAudit`.
- `src/proxy.ts` — session refresh + optimistic `/admin` redirect.
- `src/app/admin/login/` — Supabase Auth sign-in, brand styling unchanged.
- `src/app/admin/(app)/` — route group; its layout is the real gate.
- Deleted: `src/lib/auth.ts`, `/api/admin/login`, the `ADMIN_PASSWORD` cookie flow.
- `scripts/seed.ts` + `npm run db:seed` — Nandu in Muziris, its variant and
  cover, plus `NAGMA15` and `TKHP`.

**Gates:** `npm run lint` 0 errors (13 pre-existing `<img>` warnings),
`npx tsc --noEmit` clean, `npm run build` green.

**Applied to the live project** (`xxjzoznruxknqnctgncw`, ap-south-1) and verified
with 17 checks against it: anon reads the active product and nothing else
(`42501` on orders, customers, discounts, checkouts, outbox, admin_users,
audit_log); a draft product and its variants stay invisible; anon cannot write;
`service_role` inserts an order and gets `AAL1001`; negative prices and
percentages over 100 are rejected (`23514`); the order RPC raises
not-implemented; the rate limiter allows 3 then blocks.

**Two bugs the push found**, both invisible until the SQL actually ran:

1. `service_role` had no privileges on any table. Supabase's default-privilege
   grants are attached to the `postgres` role, and `supabase db push` connects
   as its own migration login role, so nothing fired for it — the seed died on
   `permission denied for table products`.
2. `service_role` had no `usage` on the `private` schema, so the default on
   `orders.order_number` (`private.next_order_number()`) would have failed on the
   first real order in phase 3. `BYPASSRLS` bypasses row policies, not `GRANT`s.

Both fixed in `20260910091000_service_role_grants.sql`, which also sets default
privileges so later migrations inherit them.

---

## P2 — what landed

**Storefront now reads Supabase.**

- `src/lib/commerce.ts` — anon-key reads with no session, so RLS is the only
  thing deciding what comes back. `src/lib/commerce-types.ts` holds the shapes
  the client also needs, and `src/lib/format.ts` the money formatting.
- Homepage, new `/shop`, new `/products/[handle]` all render from the database.
  The PDP shows price, compare-at, the saving, markdown description, shipping
  from `settings`, SKU and tags.
- `src/components/Markdown.tsx` — paragraphs, bold, italic, rendered as React
  elements rather than `dangerouslySetInnerHTML`, so a description typed in the
  admin cannot inject markup into the storefront.
- `CartContext` carries Supabase variant ids and integer paise. Storage key
  bumped to `aalmaram_cart_v2`, because v1 carts held Shopify GIDs that mean
  nothing now. A stored cart is re-priced against the database on load.
- `/checkout` is a basket review with payment disabled — phase 3 fills it in.
- No storefront path reads `SHOPIFY_*` any more. `src/lib/shopify.ts` is now
  unreferenced and is deleted in phase 8.

**Products admin** at `/admin/products`, behind the new admin shell (nav +
signed-in email + sign out; events moved to `/admin/events`).

- List with search, status, price, stock, low-stock highlighting.
- Create and edit: title, handle, subtitle, markdown description, status, tags,
  HSN, SEO, price, compare-at, SKU, weight and dimensions.
- Images upload to the `product-images` bucket; an orphaned file is removed if
  its row fails to insert, and only files in our bucket are deleted from storage.
- Stock is not editable in the form. It moves through an adjust panel with a
  reason and note, guarded against going negative, and every change lands in
  `inventory_adjustments`. Every mutation writes `audit_log`.
- Archive always; hard delete only while nothing has ever been ordered.

**Verified in the browser** against the live database: `/shop` and the PDP
render the seeded book; adding to the basket stores the real Supabase variant id
(`39d5d5fc…`) and integer paise; `/checkout` shows the basket; `?discount=NAGMA15`
is still captured and stripped from the URL; a draft product inserted directly is
absent from `/shop` and its PDP 404s; changing `price_paise` to 71250 in the
database changed the homepage to ₹712.50, which is what proves the page is
reading Supabase rather than the old hard-coded figures.

**One bug found in the preview:** `Products.tsx` imported `StorefrontProduct`
from the `server-only` `commerce.ts`. A type-only import is erased by TypeScript
but Turbopack still puts the module in the client graph, so dev threw
"'server-only' cannot be imported from a Client Component module" on every
render. Types moved to `commerce-types.ts`.

---

## P3 — what landed

**The order RPC is real.** `create_order_from_checkout` now does the whole thing
in one transaction: order, items, guarded inventory decrement, discount counters
and redemption, customer totals, the checkout marked complete, and the
`order.paid` outbox row. It never recomputes money — the amounts on the checkout
row are what was quoted and what Razorpay actually charged, and recomputing could
disagree with a captured payment if a price moved mid-flow.

**Server-side pricing** in `src/lib/pricing.ts`. The browser sends variant ids,
quantities and maybe a code; unit prices, discount validity and worth, and
shipping all come from the database. Duplicate lines are collapsed before the
per-line quantity cap is applied, so the cap cannot be walked around by
repeating a line.

**Razorpay** over `fetch` + `node:crypto` (`src/lib/razorpay.ts`): order
creation, payment fetch, refunds, and both HMACs — the checkout signature over
`order_id|payment_id` with the key secret, and the webhook signature over the
raw request body with the webhook secret. Both compare in constant time.

**Routes**

| Route | Does |
|---|---|
| `POST /api/checkout/quote` | read-only price, so the page can show shipping and a discount before paying |
| `POST /api/checkout` | prices the basket, writes the `checkouts` row, creates the Razorpay order; rate limited |
| `POST /api/checkout/confirm` | verifies the signature, checks the ids belong to *this* checkout, creates the order, sets an httpOnly order cookie |
| `POST /api/webhooks/razorpay` | raw-body signature check, then the same RPC — authoritative, and creates the order even if the browser never came back |

**Pages** `/checkout` (contact, address, live server-priced summary, discount
box, Razorpay modal) and `/order/confirmed`, which finds the order from an
httpOnly cookie rather than the URL — order numbers run in sequence, so anything
keyed on one alone would let a stranger read someone else's order by counting.

**Email** via Resend and React Email (`src/emails/OrderConfirmation.tsx`), using
the same brand tokens as the hand-written templates in `/emails`. Only the caller
that actually created the order sends it, so the webhook does not send a second
receipt. A send failure is logged, never thrown — a customer who has paid has an
order whether or not the receipt lands.

**Verified.** Two suites now live in `scripts/verify/`.

`rpc-test.mjs` — 25 checks against the live database, including: an oversell
raises and rolls back completely (stock untouched, checkout still active, no
orphaned rows); replaying a checkout returns the same order without moving
stock; the same `razorpay_order_id` on a *different* checkout still returns the
first order.

`p3-test.mjs` — 33 checks through the running app: pricing and the free-shipping
threshold; a draft product cannot be bought even with its variant id; ten
discount rules (percentage, fixed capped at basket value, free shipping, minimum
subtotal, expiry, deactivation, usage limit, product scope, tag scope, unknown
code); a forged signature is rejected and creates nothing; a *valid* signature
cannot be replayed onto a different basket; the callback and webhook are
idempotent with each other; and the webhook alone creates the order when the
browser never returns.

Also confirmed in the browser: a `?discount=NAGMA15` link followed by add-to-basket
gives ₹700 − ₹105 + ₹60 = ₹655 on `/checkout`, priced entirely server-side.

---

## P4 — what landed

Scope agreed with the owner was wider than PLAN §11: orders, discounts,
**customers** (listed in PLAN §7 but built by no phase in §11), and a real
`/admin` home.

**Migrations** (4 files)

| File | Contents |
|---|---|
| `…20260911090000_p4_schema` | `refunds` table (RLS on, anon revoked, `service_role` granted); `order_items.restocked_quantity`; `checkouts.accepts_marketing` + `refunded` status; `customers.marketing_consent_at`; outbox index on `payload->>order_id` |
| `…090100_order_admin_rpcs` | `adjust_inventory`, `record_out_of_stock_payment`, `begin_refund`, `complete_refund`, `fail_refund`, `cancel_order`, and private helpers for restock checks, restocking and audit rows |
| `…090200_create_order_rpc_v2` | out of stock raises its own SQLSTATE `OOS01`; free-shipping codes now count as used; marketing consent that never flips yes → no |
| `…090300_admin_sales_summary` | today / this week, bucketed with `at time zone 'Asia/Kolkata'` (Monday weeks); `orders.placed_at` index |

**How money moves.** Stock, statuses, customer totals, the n8n outbox and the
audit row change together in one Postgres transaction or not at all. Razorpay
can't join that transaction, so a refund is two-phase: `begin_refund` reserves
the amount (a `pending` row, checked against total − refunded − in flight), the
app calls Razorpay with our refund id as the `receipt`, then `complete_refund`
books it atomically and idempotently (or `fail_refund` releases it).
`src/lib/refunds.ts#issueRefund` always asks Razorpay for the payment's refunds
first, so a retry after a crash or timeout books the existing refund instead of
sending a second one. Cancel = refund everything left + restock (+ `order.cancelled`);
refused once fulfilled. A variant deleted since the sale is skipped, reported,
and marked as dealt with, instead of failing the refund.

**Sold out after payment** (owner's decision). The RPC raises `OOS01`; whichever
caller sees it first records one `out_of_stock` refund against the checkout
(unique per checkout). The browser gets a 409 saying the payment will be
refunded; the **webhook** sends the refund, and on the call that books it,
emails the buyer (`src/emails/OutOfStockRefund.tsx`) and the founder. Transient
Razorpay failures → webhook 500 so Razorpay retries; a refusal → row `failed`,
webhook 200, shown on the admin home with **Refund now**. Once refunded, that
checkout can never become an order, even if stock returns before a retry. Every
other RPC failure still retries as before.

**Screens**

| Route | Does |
|---|---|
| `/admin` | orders + revenue today and this week (net of refunds), orders waiting to be sent (oldest first), latest orders, low stock, and "needs attention": stuck refunds, failed sold-out refunds, failed outbox rows |
| `/admin/orders` | filter by payment and fulfilment status, search number / email / name, 25 a page |
| `/admin/orders/[id]` | items, totals, refunds list with **Check with Razorpay**, refund panel (amount + per-line restock), cancel panel, address editable until fulfilled (guarded in the update itself), Razorpay ids + dashboard link, resend confirmation, notes, and a timeline built from `audit_log`, `inventory_adjustments` and `webhook_outbox` |
| `/admin/discounts`, `/new`, `/[id]` | every PLAN §3 rule, generate-code (no 0/O/1/I/L), copy the `?discount=` link, activate/deactivate, redemptions; delete only if never used. `combinable` hidden (column kept) |
| `/admin/customers`, `/[id]` | search, sort by newest / spend / orders, opted-in filter; order history, distinct addresses, notes, marketing toggle (opting in asks how they agreed, recorded in the audit log) |

**Checkout** gained an unticked opt-in box (DPDP: an active yes), stored on the
checkout and applied to the customer by the RPC.

**Also fixed:** `adjustInventory` in the products admin could report success
and log an adjustment when its optimistic update matched no row; it now goes
through `adjust_inventory()`. `createRefund` refuses any amount that isn't a
positive integer — Razorpay treats a missing amount as "refund everything".

**Verified.**

- `scripts/verify/p4-test.mjs` — 90 checks against the live database: refund
  larger than the order, zero/negative, over-restocking (including split across
  duplicate lines), another order's item, pending reservations counting against
  both money and stock, completing twice, reusing a Razorpay refund id, cancel
  twice, cancel a fulfilled order, restock a deleted variant, **a constraint
  firing mid-restock after the first line was already restocked rolls
  everything back**, a late completion that would over-refund rolls back,
  `cancel_order` guards, `OOS01` vs "no email", out-of-stock recorded once and
  never turned into an order after restocking, free-shipping redemptions,
  consent never flipping, and anon refused on every new function and on `refunds`.
- `scripts/verify/p4-app-test.mjs` — 20 checks through the running app:
  sold-out callback → 409 + one refund row; webhook retried on a transient
  Razorpay error without a second row; webhook alone records the refund, and a
  Razorpay refusal marks it failed and acknowledges; opt-in stored only for a
  real `true`; all six new admin routes 307 to login when signed out.
- `rpc-test.mjs` 25/25 and `p3-test.mjs` 33/33 still pass. `p3-test` needed its
  discount fixtures backdated a minute: this machine's clock runs ~2 s behind
  Supabase, so codes defaulting to the database's `now()` looked "not active
  yet" to the app. Codes made in the admin take their start time from the app's
  clock, so this was a fixture issue, not a pricing one.
- All new client components rendered in dev (Turbopack) through a temporary
  public page, since signed out the proxy redirects before a page compiles;
  no `server-only` leaks. Page deleted afterwards.
- The admin screens themselves have **not** been used with a real session —
  that needs the owner to sign in.

---

## P5 — what landed

**Built without Shiprocket credentials.** The owner has not supplied
`SHIPROCKET_EMAIL` / `SHIPROCKET_PASSWORD` / the pickup nickname yet, so
nothing here has spoken to Shiprocket. Everything on *our* side of the line is
built and tested against the live database and the running app; the HTTP
client itself is unexercised. See open item 13.

**Migrations** (3 files)

| File | Contents |
|---|---|
| `…20260912090000_p5_shipping` | widened `shipments_status_check` to Shiprocket's vocabulary; `shiprocket_status`, `status_detail`, `last_status_at`, `pickup_scheduled_at`, `pickup_token_number`, `expected_delivery_date`, `cancelled_at`; a one-live-shipment-per-order unique index; `set_shiprocket_token`, `create_shipment`, `assign_shipment_awb`, `record_shipment_pickup`, `update_shipment_status`, `cancel_shipment` and the private helpers |
| `…090100_shipment_status_signature` | `update_shipment_status` takes the status first and either identifier optionally — the generated client types read a parameter without a default as required and non-null |
| `…090200_shipment_event_clock` | `last_event_at`, so a Shiprocket event is only ever judged stale against another event (see the bug below) |

**How a parcel moves.** `create_shipment` books the order at Shiprocket and —
the decision the handoff asked for — is what makes the order `fulfilled`. That
is earlier than the parcel moving, deliberately: from that moment the order is
committed, and P4's guards must stop offering to cancel it or to edit the
address it was booked with. `cancel_shipment` puts both back, and refuses once
the parcel has left (the way back is an RTO, not a cancellation).

`shipped_at`, the `order.shipped` outbox row and the tracking email fire
**once**, from whichever came first: the AWB being assigned, or a webhook that
got there before we recorded it. That is `private.mark_shipped`, a guarded
`update … where shipped_at is null` whose return value is the permission to
send the email. `rto_delivered` marks the order `returned`.

**Shiprocket, over fetch** (`src/lib/shiprocket.ts`) — login, a token cached in
`settings.shiprocket` and refreshed once on a 401, serviceability, adhoc order,
AWB, label, pickup, track-by-AWB. Plus the two translations their API needs:
their status vocabulary (by name and by numeric code) onto our twelve, and
their naive `2026-09-12 14:05:00` — which means Indian time — into an instant.
A login failure never echoes the request body, because it holds the password.

`src/lib/shipping.ts` is the orchestration both the admin and the routes use.
Where Shiprocket and Postgres can disagree it compensates rather than leaving a
mess: if a shipment is created there but cannot be recorded here, the
Shiprocket order is cancelled again.

**Screens**

| Route | Does |
|---|---|
| `/admin/orders/[id]` | a shipping panel: quote the couriers, edit the box, create the shipment; then AWB (optionally naming a courier), book a pickup, refresh from Shiprocket, label and tracking links, and cancel while it still can be |
| `/admin/shipments` | every parcel with live status, AWB search, status filter, a "not picked up yet" queue, 25 a page |

The order timeline now shows shipment creation, the AWB, pickups, every status
change and cancellations, from the same `audit_log` it already read.

**Routes** — `POST /api/webhooks/shiprocket` (constant-time `x-api-key`
compare; they sign nothing, so the token is all there is) and
`GET /api/cron/track`, guarded by `CRON_SECRET` and scheduled twice a day in
`vercel.json`. Both go through the same `update_shipment_status`, so neither
can double-stamp a date or send a second email.

**Email** — `src/emails/ShippingConfirmation.tsx`, the same brand shell as the
others, sent only by the call that actually stamped `shipped_at`.

**Verified.**

- `scripts/verify/p5-test.mjs` — 59 checks against the live database: a second
  shipment on one order, an unknown order, an unpaid order, an order with a
  refund in flight, a cancelled order; the AWB assigned twice, with a different
  code, with no code; a status that repeats, one that arrives late, one that
  would walk a delivered parcel backwards, one that is not in our vocabulary,
  one naming no shipment at all; a webhook that lands before the AWB is
  recorded (and the AWB then asking for no second email); an RTO marking the
  order returned; cancelling before and after the parcel leaves, cancelling
  twice, replacing a cancelled shipment; P4's own guards still holding while a
  shipment is live and re-opening once it is gone; the token cache keeping the
  pickup location; and anon refused on all six functions, on `shipments`, and
  on the Shiprocket settings row.
- `scripts/verify/p5-app-test.mjs` — 24 checks through the running app: the
  webhook with no token, a wrong token, a token of another length, a malformed
  body, no AWB, an unknown AWB, an unmapped status; a real sequence of events
  including one sent only as a numeric code; the naive Indian timestamp read as
  the right instant; `order.shipped` queued once and `order.delivered` once;
  the cron refusing both a missing and a wrong secret and standing down while
  Shiprocket is unconfigured; and `/admin/shipments` redirecting a stranger.
- `rpc-test.mjs` 25/25 and `p4-test.mjs` 90/90 still pass.
- Both new client components rendered in dev (Turbopack) through a temporary
  public page — both states, before and after the AWB — with no console errors
  and no `server-only` leak. Page deleted afterwards.
- `npx tsc --noEmit` clean, `npm run lint` 0 errors (the same 11 pre-existing
  warnings), `npm run build` green with `/admin/shipments`,
  `/api/webhooks/shiprocket` and `/api/cron/track` in the manifest.

**The bug the suite found.** `last_status_at` was stamped both by our own
actions (creating the shipment, assigning the AWB) and by Shiprocket's events,
and the out-of-order check compared the two. So an ordinary event — "picked up
14:00", arriving after we assigned the AWB at 14:02 — was thrown away as stale,
and with it the tracking email. Remote events now sequence against
`last_event_at` alone. It failed on the first run of the suite, which is the
argument for writing the suite.

**The dev server on :3000 is not this app.** Every route there 404s, P3's
included. The app suites were run against our own dev server on another port
(`launch.json` has `autoPort`), passing `BASE_URL`.

---

## P6 — what landed

**Migrations** (4 files)

| File | Contents |
|---|---|
| `…20260913090000_p6_outbox_drain` | `inventory.low` topic; `last_attempt_at`, `last_response_status`; `finish_outbox`, `retry_outbox`; the low-stock trigger on `product_variants` |
| `…090100_claim_outbox_topics` | `claim_outbox(p_topics, …)` — only topics with a URL are ever claimed |
| `…090200_store_analytics` | `store_analytics(p_days)` — the one definition of revenue, for the dashboard and the n8n digest |
| `…090300_claim_outbox_materialized` | the claim's `limit` really is a limit (see the bug below) |

**The drain** (`src/lib/outbox.ts`). A claim leases due rows by pushing
`next_attempt_at` out, under `for update skip locked`, so two drains never send
the same row. Each is POSTed with `x-aalmaram-token`, an HMAC signature, the
topic and the event id. 2xx → sent. Anything else → back off 1, 3, 9, 27, 81,
243 min then 12 h, failed after 10 (~2 days). An order or variant that has gone
by send time → dropped, reason kept.

Two things run it: **`kickOutbox()`**, which uses Next's `after()` straight
after an order, refund, cancel, AWB, courier update or stock adjustment — so
n8n hears in about a second — and **`/api/cron/outbox`** hourly, guarded by
`CRON_SECRET`, for retries and anything the kick missed.

**What n8n receives** (`docs/custom-commerce/EVENTS.md`). Order events carry
the order *as it is at send time* in Shopify's field names at the top level,
with our payload under `data`. Every existing flow reads `$json.body ?? $json`
then `line_items`, `customer`, `total_price`, so they run unchanged.

**n8n workflows, rebuilt** (`docs/custom-commerce/n8n/`, generated by
`scripts/n8n/build-commerce-workflows.mjs` from the originals, which are left
untouched): `order.paid` → Flows 1 + 2 + 2b in one workflow, plus subscribing
buyers who ticked the box; `order.delivered` → Flow 3; `inventory.low` → Flow 6;
Flow 5 reads the new `GET /api/integrations/summary` instead of Shopify. The
setup steps are in EVENTS.md.

**Events** moved to Supabase: `/admin/events` list (coming up / past, publish
toggle), `/new`, `/[id]` with server actions, audit rows, and revalidation of
`/`. Deleted `AdminClient.tsx`, `/api/admin/events`, `data/events.json` (always
empty — nothing to migrate). `/api/events/register` keeps its contract, now
reading published events and refusing past ones.

**Found while wiring events:** the homepage had not shown events since the
pre-commerce redesign replaced `NewsletterEvents` with a hard-coded Updates
section. Upcoming published events now render there, in its style, under the
Kochi launch card; with none, the section is exactly as before.

**Also:** `/` and `/shop` are statically rendered, so stock sold through
checkout never reached them until an admin save. Both now revalidate every five
minutes. `isCronAuthorised` shared by both crons.

**Verified.**

- `scripts/verify/p6-test.mjs` — 54 checks against the live database: claims
  honour the topic filter, the lease and the limit; two concurrent claims never
  share a row; sent, retry (1 / 9 min / 12 h cap / failed at 10), deferred,
  dropped; a late failure can't un-send; retry from the admin, audited, refused
  once delivered; the low-stock trigger fires once per crossing, again after a
  restock, never for a draft; `store_analytics` shape and bounds; anon refused
  on all four functions, the outbox, and hidden events.
- `scripts/verify/p6-app-test.mjs` — 32 checks through the running app, with
  the suite itself playing n8n on :4599: a Razorpay webhook creates an order
  and **n8n receives it with no cron**, with the right headers, a valid HMAC
  over the exact bytes, and every Shopify-shaped field the flows read; the row
  marked sent with n8n's status; the cron doesn't send it twice; a 500 backs off
  with the body kept; an unconfigured topic is untouched; an orphaned stock
  alert is dropped without calling n8n; a real threshold crossing arrives with
  what Flow 6 reads; both crons and the summary refuse bad secrets.
- `rpc-test` 25/25, `p3-test` 33/33, `p4-test` 90/90, `p4-app-test` 20/20,
  `p5-test` 59/59, `p5-app-test` 24/24 still pass. Their cleanup now also
  removes the `inventory.low` rows their fixtures trigger.
- The event form rendered under Turbopack through a temporary public page; a
  published event rendered on the homepage and a hidden one did not (checked in
  the DOM). Both removed afterwards.
- `tsc` clean, `lint` 0 errors, `build` green.

**The bug the suite found.** `update … where id in (select … limit 4 for update
skip locked)` claimed **6** rows. Postgres may evaluate that subquery more than
once, and under `skip locked` each pass can lock different rows. Now a
`materialized` CTE. Harmless at our volume, but it's the kind of thing that
turns into a double-sent invoice under load.

---

## P7 — what landed

**Migration** `…20260914090000_p7_settings_team`: the `integrations` settings
row and the `abandoned_checkout_email` flag; `merge_setting` (an allowlisted,
atomic, audited merge — the Shiprocket row accepts only `pickup_location`, so
the cached token can't be touched); `admin_users.invited_at/invited_by`;
`set_admin_role` and `remove_admin_user`, which lock every owner row and refuse
to leave the store without one; `claim_abandoned_checkouts`. P6's
`store_analytics` is the dashboard's source.

**Screens**

| Route | Who | Does |
|---|---|---|
| `/admin/analytics` | everyone | 7 / 30 / 90 days: net revenue, orders, average order, copies sold, checkout → order, each against the period before; net revenue by day (line + crosshair tooltip + keyboard + table view); top products; discount codes with what they gave away; low stock |
| `/admin/settings` | owners | store details and from-addresses, GSTIN (validated), invoice prefix; flat rate, free threshold, **per-state rates**; Shiprocket pickup nickname and a login test; low-stock threshold; taking-orders and reminder switches |
| `/admin/settings/integrations` | owners | a webhook URL per topic (saved URL wins over env), a test send per topic, the last 50 events with status, error and **Retry now**, and which server keys are present (never their values) |
| `/admin/settings/team` | owners | who has access and when they last signed in; invite; make owner / make staff; password link; remove (also deletes their login) |
| `/admin/accept-invite` | public | set a password from an invite or reset link |

Staff never see the Settings link; sent there, they land on `/admin` with a
notice. The chart follows the dataviz method: one series, so no legend; brand
lagoon for the marks, checked at 3:1+ against the ivory surface; text in ink;
2px line, 10% wash, latest point marked; hover, arrow keys and a table view.

**Invites without email.** Supabase's admin API makes the one-time token; the
link points at our own page, which only spends it when the form is submitted, so
a mail scanner can't burn it. With Resend configured it is emailed; without, the
owner gets the link to copy. Inviting someone who already has a login falls back
to a reset link.

**Checkout**

- **Per-state shipping.** STATE is now a list of the 36 states and UTs, so the
  override can match; choosing one re-quotes. The free threshold still wins.
- **Taking orders off.** `/api/checkout` answers 503 before touching Razorpay;
  the page says orders are paused and disables Pay. Quotes still work.
- **Abandoned checkouts** (PLAN §4 and §6, never built until now).
  `/api/cron/abandoned` hourly: one email, an hour after the buyer pressed Pay
  and stopped, never after 48 h, never twice (stamped *before* sending), never
  to someone who has ordered since, not while switched off, and it doesn't spend
  anyone's reminder while Resend is missing. The link `/checkout?recover=<id>`
  rebuilds the basket at today's prices, capped at stock, without ever returning
  the address or email.

**Also:** a Shiprocket pickup nickname saved in Settings now wins over
`SHIPROCKET_PICKUP_LOCATION`; the admin home's failed-outbox line links to the
queue.

**Verified.**

- `scripts/verify/p7-test.mjs` — 60 checks against the live database: merges
  keep other fields and the cached token, only changed keys are audited and a
  no-op writes nothing; last-owner, self-removal and bad-role guards; the whole
  Supabase invite path (link with signups off, a re-invite retiring the old
  link, verify, set password, no replay, sign in, re-invite refused → reset link
  verifies); abandoned-checkout claims across every window and exclusion, once
  only; analytics against real orders — gross, a refund booked on its day,
  copies net of a restock, the day's point, code usage, top product,
  conversion; anon refused on all four functions and the private settings.
  Settings and the owner row are snapshotted and restored.
- `scripts/verify/p7-app-test.mjs` — 35 checks through the running app: state
  rates in any case, unknown states, the threshold beating an override; closed
  checkout refuses and writes nothing; recovery prices, stock cap, draft
  filtered, no personal data, completed / week-old / unknown / malformed refused;
  the reminder cron's secret, switch and no-Resend guards; five new admin routes
  redirect strangers; the invite page is public.
- In the browser: a recovery link restored the basket and cleaned the URL;
  choosing Kerala with a ₹40 override re-quoted ₹60 → ₹40 → ₹60 for Goa. Every
  new client component rendered under Turbopack through a temporary page; the
  chart was driven with 30 days of sample data (crosshair tooltip, clean ₹ ticks).
- All nine earlier suites still pass. `tsc` clean, `lint` 0 errors, `build` green.

**Two things the checks caught.** The chart sized itself only from a
ResizeObserver, which never fires in a hidden pane — it now measures once on
mount. And its last two date labels collided at the right edge; a regular tick
too close to the final one is now dropped.

---

## P8 — what landed

**Migration** `…20260915090000_p8_shopify_import`: `shopify_id` (unique when
set) on products, customers, orders and discounts; `import_shopify_order`,
which writes one historical order and its items atomically and idempotently and
nothing else; `recompute_customer_totals`.

**`scripts/migrate-from-shopify.ts`** (`npm run migrate:shopify`). Dry run by
default; `--apply` writes. Reads Shopify's REST API with pagination and rate
limiting, or `--from-dir` exports. `--since` (default 12 months), `--only`,
`--skip-images`, `--report`.

- **Orders** go in as `SH<number>`, `source = shopify-import`, placed at
  Shopify's processed time; payment and fulfilment mapped, refunds summed from
  successful transactions only, closed orders archived (so they don't sit in
  "waiting to be sent"), cancelled ones cancelled with the reason. Lines link to
  our variants by Shopify variant or SKU, else stay text. Non-INR orders are
  skipped and reported. **They take no stock, touch no discount counters and
  queue nothing for n8n** — Zoho already invoiced them.
- **Customers** created with consent and its date; an existing email is linked,
  not overwritten. Guest buyers get a row from their address. Totals are
  recomputed from the orders afterwards.
- **Products** already in the store (same handle) are linked; new ones arrive
  as **drafts**, HTML turned into the storefront's markdown, images copied into
  Supabase Storage.
- **Discount codes** mapped from price rules — percentage, fixed, free shipping,
  minimum, limits, usage, window, product scope; an existing code is linked.

**Shopify removed from the app.** Deleted `src/lib/shopify.ts` and
`test-shopify.js`; nothing in `src` reads a `SHOPIFY_*` variable. The two
the import needs are documented in `.env.local.example` as one-off.
`.env.local` itself was left alone — its dead `SHOPIFY_*`, `ADMIN_PASSWORD`,
`ADMIN_SESSION_SECRET` and `GOOGLE_SHEET_ORDER_WEBHOOK_URL` lines are the
owner's to delete (`GOOGLE_SHEET_WEBHOOK_URL` is still used by
`/api/preorder`).

**`store.aalmaram.com`** (PLAN §13 q5, the recommended answer): `next.config.ts`
308-redirects it to the apex once its DNS points here — product pages keep their
handle, collections go to `/shop`, the cart to `/checkout`, anything else home.

**Docs:** [`GO-LIVE.md`](./GO-LIVE.md), the ordered checklist with a "worked if"
for each step, including the ₹1 live order and an order-number reset guarded
against real orders; a real `README.md`.

**Verified.**

- `scripts/verify/p8-test.mjs` — 44 checks running the real script against the
  live database from fixtures in Shopify's REST shapes: the dry run writes
  nothing; apply imports exactly the in-window INR orders with correct paise,
  statuses, archive/cancel handling, placed time, code, note, address and line
  links; partial refunds count only successful transactions; **stock, discount
  counters and the outbox don't move**; the existing book and code are linked,
  not overwritten; the new product is a draft with converted markdown, split
  tags and its variant; customers get consent and correct totals (a refund
  netted off, a cancelled order counting for nothing); codes map type, value,
  minimum, limits, usage, expiry and product scope; a second run creates nothing;
  an imported order can be cancelled without Razorpay. Cleans up, including the
  ids it links onto real rows.
- `store.aalmaram.com` redirects checked against the dev server (308s to the
  right apex paths; the normal host still 200).
- All ten earlier suites pass again with the Shopify code gone. `tsc` clean,
  `lint` 0 errors (10 pre-existing warnings), `build` green.
- The throwaway `.env.development.local` used by the app suites is deleted.
- Live data left as found: no orders, stock 50, no events, settings unchanged.

**Not run: the import against Shopify itself.** The Shopify credential has been
dead since before P2, so the API path of the script (pagination, the real field
values) is unexercised; the fixtures follow Shopify's documented REST shapes.
Run the dry run first (GO-LIVE §8) and read its warnings.

---

## Decisions

1. **No Cache Components.** `use cache` needs `cacheComponents: true`, which
   changes the rendering model for every existing page. At 1–2 products and
   ~15–20 orders/month, uncached Supabase reads from Mumbai are cheap. Revisit
   in P7. (Approved.)
2. **`src/proxy.ts`, not `middleware.ts`.** Next 16 renamed Middleware to Proxy
   and states it is not an authorisation mechanism — so the proxy only refreshes
   cookies and does an optimistic redirect; `requireAdmin()` decides.
3. **No Razorpay/Shiprocket SDKs** — `fetch` + `node:crypto`.
4. **`zod`** for route-handler input validation, **`tsx`** for scripts,
   **`server-only`** to keep the service-role key out of client bundles.
5. **RLS enabled, not forced.** `force row level security` would also apply to
   the `postgres` owner role, breaking migrations and the Supabase SQL editor.
   `service_role` has `BYPASSRLS`, so forcing buys nothing here.
6. **Default privileges revoked** in `public` for `anon`/`authenticated`, so a
   table added later is invisible to PostgREST until explicitly granted.
7. **Sold out after payment is auto-refunded; nothing else is** (owner, P4).
   Its own SQLSTATE `OOS01`; the webhook refunds, recorded so a retry can't
   refund twice; buyer and founder emailed.
8. **Refunds are two-phase with a Razorpay lookup before every send** (P4). A
   failed *order* refund is never re-sent — the admin starts a new one, which
   re-checks the amount. A failed *out-of-stock* refund may be re-sent: it is
   always the full captured amount, which Razorpay itself won't exceed.
9. **Discount limits are checked when pricing, not re-checked in the order RPC.**
   The RPC runs after the money is captured; refusing there would leave a paid
   buyer with no order. Two simultaneous checkouts could overshoot a usage limit
   by one — acceptable at this volume. A cancelled order keeps its redemption
   (the slot is not given back).
10. **Marketing consent** (owner, P4): unticked by default; a later order never
    turns yes into no; `marketing_consent_at` records when; opting someone in
    from the admin asks how they agreed. n8n newsletter sync waits for P6.
11. **All admin dates in Indian time**; today/week bucketed in SQL with
    `at time zone 'Asia/Kolkata'`, Monday-start weeks (owner, P4).
13. **Creating the shipment is what fulfils the order** (P5), not the parcel
    moving. Fulfilling on despatch instead would leave a window in which an
    order already committed to Shiprocket could still be cancelled or
    re-addressed here. Cancelling the shipment reverses it.
14. **Our twelve statuses, not Shiprocket's forty** (P5). Theirs are mapped on
    by name and by code, the raw payload is always kept in `shipments.raw`, and
    an unrecognised status is logged and ignored rather than guessed at.
15. **One live shipment per order**, enforced by a partial unique index. A
    cancelled one may be replaced.
16. **The tracking cron is scheduled in `vercel.json`**, twice a day. Vercel's
    Hobby plan allows one cron run a day; on Hobby this needs trimming to one.
17. **Order events carry a Shopify-shaped order** (P6). The existing n8n flows
    read `order.line_items`, `order.customer`, `order.total_price`; putting those
    fields at the top level means only their trigger nodes change. Our own data
    rides alongside in `data`.
18. **One URL per topic; Flows 1, 2 and 2b merged** into one `order.paid`
    workflow (P6). Fanning one row out to three URLs would need per-destination
    delivery state, or a retry would re-send to the ones that succeeded.
19. **Unconfigured topics are never claimed** (P6). Their rows wait, pending,
    and deliver once a URL is set; a backlog of them can't crowd real deliveries
    out of a batch.
20. **A webhook URL saved in the admin wins over the env var** (P6), so n8n
    can be wired without a redeploy.
21. **Low stock is a trigger on `product_variants`** (P6), firing once per
    crossing, active products only — every stock path goes through that column.
22. **Events show in the homepage's existing Updates section** (P6). The
    pre-commerce redesign had dropped the old events feed; the launch card and
    the "more events soon" line stay exactly as they were until an event exists.
23. **Settings and the team are owner-only** (P7); staff run everything else.
    PLAN rules out finer permissions.
24. **Removing someone deletes their login** (P7), so a removed person holds no
    account that `ADMIN_ALLOWLIST` could quietly re-admit.
25. **Invite links are spent on submit, not on open** (P7), so link scanners in
    mail clients can't consume them.
26. **STATE became a dropdown** at checkout (P7). Per-state rates need a value
    that matches; a free-text field would silently miss "kerala" or "KL". The
    storefront otherwise looks the same.
27. **The abandoned-checkout reminder is on by default** (P7), as PLAN §4
    describes, with a switch in Settings. It's one email and says so.
28. **Imported orders never enter the outbox** (P8), and don't move stock or
    discount counters — Shopify and Zoho already accounted for them.
29. **Imported products arrive as drafts** (P8), so nothing goes on sale by
    accident; things already in the store are linked, never overwritten.
30. **`store.aalmaram.com` redirects to the apex** (P8), PLAN §13's recommended
    answer, keeping product links alive.
12. **`combinable` hidden** in the discount form; checkout takes one code, so it
    would do nothing. Column kept (owner, P4).

### Additions to the PLAN §3 schema

- `orders.refunded_paise` — partial refunds need an amount, not just a label.
- `webhook_outbox.next_attempt_at` — retry backoff for the P6 drain.
- `checkouts.recovery_email_sent_at` — so the abandoned-cart cron sends once.
- `admin_users.user_id` → `auth.users` — lets an admin be invited before their
  auth user exists.
- `settings.is_public` — decides what the anon RLS policy exposes.
- `rate_limits` + `rate_limit_hit()` — PLAN §12 requires rate limiting and there
  is no Redis in this stack.
- `refunds` (P4) — one row per attempt to send money back; the amount a
  partial refund reserves, the Razorpay id that makes booking idempotent, and
  the owner of an out-of-stock refund (a checkout, since no order exists).
- `order_items.restocked_quantity` (P4) — so partial refunds can't restock more
  copies than were sold.
- `checkouts.accepts_marketing`, `checkouts.status = 'refunded'`,
  `customers.marketing_consent_at` (P4).

---

## Open items

1. **No test-mode payment has completed yet.** Razorpay test keys are in and
   verified (`rzp_test_…`): `/api/checkout` creates a real Razorpay test order
   at the server-priced amount, and the modal opens with the buyer's name, email
   and phone prefilled. But no order row exists yet — the owner's attempt used
   the UPI QR, which a real UPI app cannot pay in test mode. Next step: pay with
   card `4111 1111 1111 1111` (any future expiry, any CVV, then "Success"), and
   confirm the order, items, stock 50 → 49 and the `order.paid` outbox row.
   An earlier paste of **live** keys (`rzp_live_…`) was caught before any call
   reached Razorpay; always check the prefix before starting the server.
2. **No email has been sent.** `RESEND_API_KEY` is unset, so
   `sendOrderConfirmation` reports "skipped" and logs it.
3. **The whole admin UI is unverified with a real session.** Sign-in needs a
   password, which is the owner's to type. Every admin route correctly
   redirects (307) when signed out; P4's client components render in dev and
   every money- and stock-moving function is tested against the live database,
   but no admin screen from P2 or P4 has been used signed in. Checklist for the
   owner, after the test payment: `/admin` shows the order under "Waiting to be
   sent"; open it and check the timeline; refund ₹1 with no restock (a real
   Razorpay test refund); edit the address; resend the confirmation (reports
   "not sent" until Resend is set up); create a discount with **Generate**, copy
   its link, open it in a private window, and check the basket applies it;
   `/admin/customers` lists you; then cancel the order with restock on and check
   stock goes back to 50.
10. **A real Razorpay refund has not run yet.** The refund path has reached
    Razorpay test mode (lookup and a refused refund for an unknown payment), but
    moving money needs a captured payment — see item 1 and the checklist in 3.
11. **Free-shipping redemptions record ₹0** as their amount, since the checkout
    doesn't store the shipping it waived. Analytics shows these as "free
    shipping" rather than a figure.
12. **No link from a customer to their NocoDB record** (PLAN §7). Still
    none: n8n owns the NocoDB write and nothing reports the row id back. The
    order payload carries the email NocoDB matches on.
4. **`nivedith@aalmaram.com` now has a Supabase Auth user** (seen 17 Sep), but
   no `admin_users` row until they first sign in. Once they have, set roles in
   Settings → Team and clear `ADMIN_ALLOWLIST`.
5. **Order numbers skip.** Test suites consume the sequence (after P4's runs,
   real orders start somewhere past `AAL1027`). Cosmetic; can be reset before go-live on request.
6. **Roll the `service_role` key.** It passed through a chat transcript during
   setup. Never committed, but worth rotating before go-live.
13. **Shiprocket is not configured.** `SHIPROCKET_EMAIL`,
    `SHIPROCKET_PASSWORD`, `SHIPROCKET_PICKUP_LOCATION`,
    `SHIPROCKET_PICKUP_PINCODE` and `SHIPROCKET_WEBHOOK_TOKEN` are all unset,
    so no call in `src/lib/shiprocket.ts` has ever run against their API. What
    is proven is our side of it. What is not: that the adhoc-order payload is
    shaped the way their account expects, that the pickup nickname matches, and
    that their real status strings all land somewhere in the map. The API user
    must be created under **Settings → API → Configure**; the normal dashboard
    login does not work for `/auth/login` on current accounts.
14. **The parcel's real weight and box size are unknown.** The create form is
    pre-filled from `order_items.weight_grams` (400 g for the seeded book) and a
    25 × 20 × 4 cm carton that is a guess, not a measurement. Shiprocket bills
    on volumetric weight, so the owner should confirm both; the form is
    editable at the moment of shipping either way.
15. **Nothing tells the buyer a parcel came back.** An RTO marks the order
    `returned` and shows in the admin, but sends no email — PLAN §6 lists no
    such message. Worth deciding before volume.
7. **Shipping rates in `settings` are placeholders** (₹60 flat, free above ₹999).
   Confirm the real numbers before P3.
8. **The Shopify Admin API credential is dead.** Every page load logs
   `Oauth error app_not_installed` from `getFirstProduct()`. The storefront
   degrades gracefully to its hard-coded fallback, so nothing is visibly broken,
   but Shopify is no longer answering. P2 removes this call path.
9. **PLAN §13 answers still wanted:** prepaid-only confirmed, markdown
   descriptions, no customer-facing tracking page. All three have been built the
   recommended way; say so if any should change.

---

## Setup still needed from the user

Before P1 can be verified against a real database:

1. Create the Supabase project (region **ap-south-1**), a public
   `product-images` storage bucket, email auth with signups **off**, and an auth
   user per admin.
2. Fill `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_PROJECT_REF` in `.env.local` — the
   keys are already there waiting for values, as is `ADMIN_ALLOWLIST`
   (`vishnu@opiamanalytics.com`, `nivedith@aalmaram.com`). Both need a Supabase
   Auth user created by hand, since signups are off.
3. `npx supabase login`, then:

   ```bash
   npm run db:link
   npm run db:push
   npm run db:types
   npm run db:seed
   ```

### Before a real payment can be taken (phase 3)

1. **Razorpay test keys** — Dashboard → Settings → API Keys → Generate Test Key.
   Put `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `.env.local`.
2. **Razorpay webhook** — Dashboard → Settings → Webhooks → Add. URL
   `https://<your-preview-or-domain>/api/webhooks/razorpay`, events
   `payment.captured` and `order.paid`, and a secret of your choosing which also
   goes in `.env.local` as `RAZORPAY_WEBHOOK_SECRET`. For local testing this
   needs a tunnel, or it can wait for the first Vercel preview deploy.
3. **Resend** — `RESEND_API_KEY`, and confirm `aalmaram.com` is a verified
   sending domain. Without it the order still succeeds; only the receipt is
   skipped, with a line in the logs.

Shiprocket is needed for phase 5.
