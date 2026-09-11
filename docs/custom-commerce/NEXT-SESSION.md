# Handoff — continue the Aalmaram custom commerce build (P4 onward)

Paste everything below the line into a fresh Claude Code session opened at the
repo root (`D:\Aalmaram`), on branch `feat/custom-commerce`.

---

You are continuing a build that is three phases into eight. A previous session
did P1–P3; your job is P4 onward. Do not restart, re-plan, or rewrite what is
already there — extend it.

## Read these first, in this order

1. `docs/custom-commerce/PROGRESS.md` — **the source of truth for where things
   stand**: what landed in each phase, how it was verified, every decision taken,
   additions to the schema, and the numbered open items. Read all of it.
2. `docs/custom-commerce/PLAN.md` — the architecture spec. §7 (admin sections),
   §11 (build order) and §12 (security checklist) matter most from here.
3. `docs/custom-commerce/OPUS-BUILD-PROMPT.md` — the working method and the
   per-phase acceptance criteria. It still applies in full.
4. `AGENTS.md` — this is Next.js 16.2.6. Read the relevant guide under
   `node_modules/next/dist/docs/` before using any App Router API.
5. Invoke the `supabase-postgres-best-practices` skill before writing any SQL,
   and the `dataviz` skill before building the P7 chart.

## Where things stand

- **Branch** `feat/custom-commerce`, 7 commits ahead of `master`, not pushed.
  Tree is clean apart from pre-existing untracked n8n files (`AUTOMATIONS.md`,
  `*-workflow.json`, `emails/`) — leave those alone, they are not ours to commit.
- **Supabase** project `xxjzoznruxknqnctgncw` (ap-south-1) is live and linked.
  11 migrations applied. `npx supabase db push` works from this machine.
  `npm run db:types` regenerates `src/lib/database.types.ts` — do it after every
  migration.
- **P1** schema + RLS + Supabase Auth admin. **P2** products admin + storefront
  reading Supabase. **P3** server-side pricing, Razorpay checkout, atomic order
  RPC, webhook, confirmation email. All committed and verified (see PROGRESS.md).
- **Razorpay test keys** are in `.env.local` and verified working. No test-mode
  payment has *completed* yet — see open item 1 in PROGRESS.md.
- **Not configured yet:** Resend (`RESEND_API_KEY`), Razorpay webhook secret,
  Shiprocket. Code paths that need them fail soft with a clear log line.

## What to build next — P4

Scope agreed with the owner, which is **wider than PLAN.md §11 says**:

1. **Orders admin** — list with filters (payment/fulfillment status), search
   (number, email, name), pagination; detail page with line items, address,
   Razorpay ids + dashboard link, a timeline built from `audit_log` /
   `inventory_adjustments` / `webhook_outbox`, and notes. Actions: cancel +
   restock, full and partial refund via `createRefund` in `src/lib/razorpay.ts`
   (update `refunded_paise` and `payment_status`, enqueue `order.refunded`),
   resend confirmation, edit address before fulfilment.
   Cancel/refund/restock must be a Postgres function, like the order RPC — the
   money and the stock move together or not at all.
2. **Discounts admin** — CRUD for every rule in PLAN §3 (the pricing side is
   already enforced in `src/lib/pricing.ts`), a generate-code button, copy the
   `aalmaram.com/?discount=CODE` link, deactivate, redemptions view.
3. **Customers** — list (name, email, orders, spend, marketing opt-in, search)
   and detail (order history, notes, marketing toggle). **PLAN §7 lists this
   section but no phase in §11 builds it — that is a gap in the plan, and it
   belongs in P4.**
4. **A real `/admin` home** — today's and this week's orders and revenue, orders
   awaiting fulfilment, low stock. `/admin` currently just redirects to
   Products, which is why the owner found the dashboard empty. The full
   analytics cards and chart stay in P7.

Then P5 (shipping — needs Shiprocket credentials, stop and ask), P6 (outbox
drain + n8n + events to Supabase), P7 (analytics + settings + admin users),
P8 (Shopify migration and cutover — never without an explicit go-ahead).

## How to work

- Follow the OPUS-BUILD-PROMPT working method: after each phase run
  `npx tsc --noEmit`, `npm run lint` (0 errors; 11 pre-existing `<img>` warnings
  are fine) and `npm run build`; verify in the browser preview; update
  PROGRESS.md; one conventional commit per phase; **pause for review before the
  next phase**. Do not push or open a PR unless asked.
- **Verify against the live database, not just the compiler.** Two suites live
  in `scripts/verify/` (`rpc-test.mjs`, `p3-test.mjs`) — follow their pattern:
  create fixtures, assert, clean up in `finally`. Every money- or stock-moving
  function needs this kind of test, including the failure paths (a refund larger
  than the order, cancelling twice, restocking a deleted variant). Run
  `rpc-test.mjs` again after touching any SQL to make sure P3 still holds.
- Keep the admin's look: brand CSS in `src/app/globals.css`, the shell in
  `src/app/admin/(app)/layout.tsx`, and the patterns in
  `src/app/admin/(app)/products/` (Server Actions + `useActionState`,
  `requireAdmin()` first line, `recordAudit()` on every mutation).

## Hard lines — these are not negotiable

- **Never type a password, API key, card number or other credential into
  anything**, even when the owner supplies it and asks you to. The owner once
  pasted their admin password into chat and asked the previous session to sign
  in; that was declined. The admin UI can only be tested by the owner signing in
  themselves — say so and hand them what to check.
- **Before starting the dev server, check `RAZORPAY_KEY_ID` starts with
  `rzp_test_`.** The owner once pasted live keys by mistake; it was caught before
  any call reached Razorpay. Live keys must never be in `.env.local` before P8.
- Secrets go in `.env.local` (git-ignored), never `.env.local.example`
  (tracked). Never print a secret; mask it.
- Payments are prepaid only; money is integer paise; amounts are always
  recomputed server-side; nothing in PLAN.md's "Deliberately NOT built" list gets
  built without asking.

## Gotchas the last session hit — save yourself the time

- **Next 16 renamed Middleware to Proxy** (`src/proxy.ts`). It only refreshes the
  session and redirects optimistically; `requireAdmin()` is the real gate.
- **A type-only import from a `server-only` module still breaks the client
  bundle** under Turbopack — `tsc` and `next build` stay green while dev throws on
  every render. Shared shapes go in client-safe files (see
  `src/lib/commerce-types.ts`, `src/lib/format.ts`).
- **`supabase db push` connects as its own migration role**, so Supabase's
  default grants do not fire. New tables and functions need explicit
  `service_role` grants — see migration `20260910091000_service_role_grants.sql`,
  which also sets default privileges. Check the grants on anything new.
- **Bash heredocs choke on large SQL containing `$$`** on this Windows machine.
  Write migrations with the Write tool.
- **The browser preview's console buffer can go stale** across server restarts.
  Trust `preview_logs` and HTTP status codes over it.
- The seeded order-number sequence has been consumed by test runs; real orders
  start around `AAL1007`. That is fine.

## Open items you inherit (details in PROGRESS.md)

1. Complete one test-mode payment with card `4111 1111 1111 1111` — the owner's
   attempt used the UPI QR, which cannot be paid in test mode. Then confirm the
   order, items, stock 50 → 49 and the `order.paid` outbox row.
2. No admin screen from P2 has been exercised by the owner beyond loading the
   product edit page. Ask them to try create/edit/image upload/stock adjust.
3. `nivedith@aalmaram.com` has no Supabase Auth user yet.
4. The owner should change their admin password (it was exposed in chat) and
   roll the `service_role` key.
5. Shipping rates in `settings` are placeholders (₹60 flat, free over ₹999).
6. Resend key, Razorpay webhook secret, Shiprocket credentials outstanding.

## First reply

Before writing code, reply with: (a) confirmation you've read PROGRESS.md,
PLAN.md, OPUS-BUILD-PROMPT.md and AGENTS.md; (b) your P4 plan — migrations,
routes, screens, and the verification suite you'll write; (c) anything in the
current code you think should change first. Then wait for the go-ahead.
