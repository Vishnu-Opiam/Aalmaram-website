# Custom commerce — progress

Running log for the build described in [`PLAN.md`](./PLAN.md), executed per
[`OPUS-BUILD-PROMPT.md`](./OPUS-BUILD-PROMPT.md). Branch: `feat/custom-commerce`.

---

## Phase status

- [x] **P1 Foundation** — schema, RLS, clients, admin auth, seed script
- [ ] P2 Products + storefront read
- [ ] P3 Checkout + payments
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

1. **A signed-in `/admin` render is still unverified.** Everything up to the
   password prompt is confirmed; the dashboard behind it has not been seen with a
   real session. Needs the owner to sign in once.
2. **`nivedith@aalmaram.com` has no Supabase Auth user.** Allowlisted, but
   cannot sign in until the account is created in the dashboard.
3. **Order numbering starts at `AAL1002`.** The verification probe consumed
   `AAL1001`. Cosmetic; the sequence can be reset on request.
4. **Roll the `service_role` key.** It passed through a chat transcript during
   setup. Never committed, but worth rotating before go-live.
5. **Shipping rates in `settings` are placeholders** (₹60 flat, free above ₹999).
   Confirm the real numbers before P3.
6. **The Shopify Admin API credential is dead.** Every page load logs
   `Oauth error app_not_installed` from `getFirstProduct()`. The storefront
   degrades gracefully to its hard-coded fallback, so nothing is visibly broken,
   but Shopify is no longer answering. P2 removes this call path.
7. PLAN §13 answers still wanted before P3: prepaid-only confirmed, markdown
   descriptions, no customer-facing tracking page.

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

Razorpay (test keys) is needed for P3, Resend for P3, Shiprocket for P5.
