# Handoff — continue the Aalmaram custom commerce build (P5 onward)

Paste everything below the line into a fresh Claude Code session opened at the
repo root (`D:\Aalmaram`), on branch `feat/custom-commerce`.

---

You are continuing a build that is four phases into eight. Previous sessions did
P1–P4; your job is P5 onward. Do not restart, re-plan, or rewrite what is
already there — extend it.

## Read these first, in this order

1. `docs/custom-commerce/PROGRESS.md` — **the source of truth for where things
   stand**: what landed in each phase, how it was verified, every decision
   taken, additions to the schema, and the numbered open items. Read all of it.
2. `docs/custom-commerce/PLAN.md` — the architecture spec. §5 (shipping), §6
   (email), §11 (build order) and §12 (security checklist) matter most now.
3. `docs/custom-commerce/OPUS-BUILD-PROMPT.md` — the working method and the
   per-phase acceptance criteria. It still applies in full.
4. `AGENTS.md` — this is Next.js 16.2.6. Read the relevant guide under
   `node_modules/next/dist/docs/` before using any App Router API.
5. Invoke the `supabase-postgres-best-practices` skill before writing any SQL,
   and the `dataviz` skill before building the P7 chart.

## Where things stand

- **Branch** `feat/custom-commerce`, 8 commits ahead of `master`, not pushed.
  Tree is clean apart from pre-existing untracked n8n files (`AUTOMATIONS.md`,
  `*-workflow.json`, `emails/`) — leave those alone, they are not ours to commit.
- **Supabase** project `xxjzoznruxknqnctgncw` (ap-south-1) is live and linked.
  15 migrations applied. `npx supabase db push` works from this machine.
  `npm run db:types` regenerates `src/lib/database.types.ts` — do it after every
  migration.
- **P1** schema + RLS + Supabase Auth admin. **P2** products admin + storefront.
  **P3** server-side pricing, Razorpay checkout, atomic order RPC, webhook,
  confirmation email. **P4** orders admin (refund / cancel / restock / address /
  notes / timeline), discounts CRUD + redemptions, customers, a real `/admin`
  home, the sold-out-after-payment auto-refund, and a marketing opt-in at
  checkout. All committed and verified — see PROGRESS.md.
- **Live data right now:** no orders at all, `Nandu in Muziris` stock 50, no
  refunds, no outbox rows, `NAGMA15` and `TKHP` seeded and unused. The owner's
  Razorpay test-mode payment has still not happened (open item 1), so **no
  order, refund or email has ever been exercised with real Razorpay money**.
- **Not configured yet:** Resend (`RESEND_API_KEY`), `RAZORPAY_WEBHOOK_SECRET`,
  Shiprocket. Code paths that need them fail soft with a clear log line. With no
  webhook secret the sold-out auto-refund cannot fire on its own; such payments
  appear on the admin home with a "Refund now" button instead.

## Four verification suites exist — run them, extend them

```bash
node --env-file=.env.local scripts/verify/rpc-test.mjs
node --env-file=.env.local scripts/verify/p4-test.mjs
node --env-file=.env.local --env-file=.env.development.local scripts/verify/p3-test.mjs
node --env-file=.env.local --env-file=.env.development.local scripts/verify/p4-app-test.mjs
```

25, 90, 33 and 20 checks. The last two need a dev server **and** a
`RAZORPAY_WEBHOOK_SECRET` that matches it; see the gotcha below. Every money- or
stock-moving function needs this kind of test, failure paths included. Re-run
`rpc-test` and `p4-test` after touching any SQL, and clean up fixtures in a
`finally` block as they do.

## What to build next — P5 shipping

**Shiprocket credentials are needed before any of it can be verified. Stop and
ask the owner for `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD` and the pickup
location nickname before you start, and never type them yourself.**

Per PLAN §5 and the P5 acceptance criteria: token cached in `settings` and
refreshed on 401; create the adhoc order from an order's detail page; check
serviceability and assign an AWB; label and pickup URLs; a shipments list with
live status; `/api/webhooks/shiprocket` updating status and stamping
`shipped_at` / `delivered_at`; `order.shipped` triggering the tracking email;
`/api/cron/track` as a fallback, guarded by `CRON_SECRET`; `npm run build` green.

Fulfilment status is currently only ever set by a refund or a cancel — P5 is
what makes an order `fulfilled`. Note that the P4 admin refuses to cancel a
fulfilled order and freezes its address, so shipment creation must be the thing
that flips it.

Then P6 (outbox drain + n8n + events into Supabase), P7 (analytics + settings +
admin users), P8 (Shopify migration and cutover — never without an explicit
go-ahead).

## How to work

- Follow the OPUS-BUILD-PROMPT working method: after each phase run
  `npx tsc --noEmit`, `npm run lint` (0 errors; 11 pre-existing warnings are
  fine) and `npm run build`; verify against the live database and the running
  app; update PROGRESS.md; one conventional commit per phase; **pause for review
  before the next phase**. Do not push or open a PR unless asked.
- Keep the admin's look: brand CSS in `src/app/globals.css`, the shell in
  `src/app/admin/(app)/layout.tsx`, the shared pieces in
  `src/app/admin/(app)/ui.tsx` (`PageTitle`, `SectionTitle`, `Notice`, `Pill`,
  `Pagination`, `inputClass`), and the patterns in `orders/` and `products/`
  (Server Actions + `useActionState`, `requireAdmin()` first line,
  `recordAudit()` on every mutation, `window.confirm` before anything
  irreversible).

## Hard lines — these are not negotiable

- **Never type a password, API key, card number or other credential into
  anything**, even when the owner supplies it and asks you to. The owner once
  pasted their admin password into chat and asked a previous session to sign in;
  that was declined. The admin UI can only be exercised by the owner signing in
  themselves — say so and hand them what to check.
- **Before starting the dev server, check `RAZORPAY_KEY_ID` starts with
  `rzp_test_`.** The owner once pasted live keys by mistake; it was caught
  before any call reached Razorpay. Live keys must never be in `.env.local`
  before P8.
- Secrets go in `.env.local` (git-ignored), never `.env.local.example`
  (tracked). Never print a secret; mask it.
- Payments are prepaid only; money is integer paise; amounts are always
  recomputed server-side; nothing in PLAN.md's "Deliberately NOT built" list
  gets built without asking.

## P4 invariants you must not break

- **Refunds are two-phase.** `begin_refund` reserves an amount (a `pending`
  row), the app calls Razorpay, `complete_refund` books money, stock, statuses,
  customer totals, outbox and audit in one transaction; `fail_refund` releases
  the reservation. `src/lib/refunds.ts#issueRefund` always asks Razorpay for the
  payment's existing refunds first — that lookup is what stops a retry refunding
  twice. Do not add a path that calls Razorpay's refund API directly.
- **`OOS01`** is the SQLSTATE for "sold out after payment", and the only failure
  that is refunded rather than retried. One `out_of_stock` refund per checkout
  (unique index), and such a checkout can never become an order afterwards.
- **Custom SQLSTATEs** the actions rely on: `P0002` missing, `22023` bad
  request, `55000` wrong state, `23514` a guard fired, `OOS01` out of stock.
- Restock quantities are capped by `order_items.restocked_quantity` plus what
  pending refunds have reserved. A deleted variant is skipped and reported, not
  an error.

## Gotchas — save yourself the time

- **Next 16 renamed Middleware to Proxy** (`src/proxy.ts`). It only refreshes
  the session and redirects optimistically; `requireAdmin()` is the real gate.
- **Next 16 allows only one dev server per folder.** The owner often has one
  running on `:3000` already; `preview_start` will exit with "Another next dev
  server is already running". Test against theirs rather than killing it — it
  hot-reloads your changes and re-reads env files.
- **Signed out, admin pages never compile in dev**, because the proxy redirects
  first. To smoke-test new admin client components under Turbopack, render them
  from a temporary page outside `/admin`, then delete it.
- **A type-only import from a `server-only` module still breaks the client
  bundle** under Turbopack — `tsc` and `next build` stay green while dev throws
  on every render. Shared shapes go in client-safe files (`commerce-types.ts`,
  `format.ts`, `ui.tsx`, `discounts/status.ts`).
- **`.env.development.local` overrides `.env.local` in dev.** The app suites
  need a `RAZORPAY_WEBHOOK_SECRET`; put a throwaway one there, and **delete the
  file afterwards** so it cannot shadow the real secret once the owner sets one.
- **This machine's clock runs ~2 s behind Supabase.** Test fixtures that let
  `starts_at` default to the database's `now()` can look "not active yet" to the
  app. Backdate them, as `p3-test.mjs` now does.
- **`supabase db push` connects as its own migration role**, so Supabase's
  default grants do not fire. New tables and functions need explicit
  `service_role` grants, and functions need `execute` revoked from
  `public, anon, authenticated` — see `20260911090100_order_admin_rpcs.sql`.
  Then prove it: the anon-access section of `p4-test.mjs` is the pattern.
- **Bash heredocs choke on large SQL containing `$$`** on this Windows machine.
  Write migrations with the Write tool.
- The order-number sequence has been consumed by test runs; real orders start
  somewhere past `AAL1027`. That is fine.

## Open items you inherit (details in PROGRESS.md)

1. The owner still has to complete one test-mode payment with card
   `4111 1111 1111 1111`, then work through the signed-in checklist in open item
   3 of PROGRESS.md (order appears on `/admin`, timeline, ₹1 refund, address
   edit, resend confirmation, discount create + share link, customers list,
   cancel with restock back to 50). **No admin screen has ever been used with a
   real session.**
2. `nivedith@aalmaram.com` has no Supabase Auth user yet.
3. The owner should change their admin password (it was exposed in chat) and
   roll the `service_role` key.
4. Shipping rates in `settings` are placeholders (₹60 flat, free over ₹999).
5. Resend key, Razorpay webhook secret, Shiprocket credentials outstanding.
6. Free-shipping redemptions record ₹0 as their amount; P7's discount-usage card
   may want the waived shipping instead.
7. No link from a customer to their NocoDB record (PLAN §7) — best done in P6.

## First reply

Before writing code, reply with: (a) confirmation you've read PROGRESS.md,
PLAN.md, OPUS-BUILD-PROMPT.md and AGENTS.md; (b) the exact Shiprocket setup
steps and credentials you need from the owner; (c) your P5 plan — migrations,
routes, screens, emails and the verification suite you'll write, and how you'll
test it without live Shiprocket credentials; (d) anything in the current code
you think should change first. Then wait for the go-ahead.
