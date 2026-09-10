# Custom commerce — progress

Running log for the build described in [`PLAN.md`](./PLAN.md), executed per
[`OPUS-BUILD-PROMPT.md`](./OPUS-BUILD-PROMPT.md). Branch: `feat/custom-commerce`.

---

## Phase status

- [x] **P1 Foundation** — schema, RLS, clients, admin auth, seed script
- [x] **P2 Products + storefront read** — admin CRUD, Supabase Storage, /shop + PDP
- [x] **P3 Checkout + payments** — pricing, Razorpay, atomic order creation
- [ ] P4 Orders admin + discounts
- [ ] P5 Shipping
- [ ] P6 Events feed + n8n
- [ ] P7 Analytics + settings
- [ ] P8 Migration + cutover

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

### Additions to the PLAN §3 schema

- `orders.refunded_paise` — partial refunds need an amount, not just a label.
- `webhook_outbox.next_attempt_at` — retry backoff for the P6 drain.
- `checkouts.recovery_email_sent_at` — so the abandoned-cart cron sends once.
- `admin_users.user_id` → `auth.users` — lets an admin be invited before their
  auth user exists.
- `settings.is_public` — decides what the anon RLS policy exposes.
- `rate_limits` + `rate_limit_hit()` — PLAN §12 requires rate limiting and there
  is no Redis in this stack.

---

## Open items

1. **No real Razorpay payment has been taken.** Every path around it is
   verified with test secrets, but Razorpay's own API and the checkout modal
   have never run. Needs test keys (below) and one live test-mode order.
2. **No email has been sent.** `RESEND_API_KEY` is unset, so
   `sendOrderConfirmation` reports "skipped" and logs it.
3. **The whole admin UI is unverified.** Sign-in needs a password, which is the
   owner's to type. `/admin` correctly redirects (307) when signed out, and the
   server actions behind the screens are typed and build clean, but no admin
   screen has been rendered with a real session — including everything P2 added.
   This is the first thing to check on the next sign-in.
4. **`nivedith@aalmaram.com` has no Supabase Auth user.** Allowlisted, but
   cannot sign in until the account is created in the dashboard.
5. **Order numbering starts at `AAL1002`.** The verification probe consumed
   `AAL1001`. Cosmetic; the sequence can be reset on request.
6. **Roll the `service_role` key.** It passed through a chat transcript during
   setup. Never committed, but worth rotating before go-live.
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
