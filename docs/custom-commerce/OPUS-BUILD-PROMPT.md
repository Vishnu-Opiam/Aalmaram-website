# Build brief for Opus — Aalmaram custom commerce system

Paste everything below the line into a fresh Opus session opened at the repo root
(`D:\Aalmaram`). It assumes `docs/custom-commerce/PLAN.md` is present.

---

## Role & goal

You are building a self‑hosted commerce system that **completely replaces Shopify** for
Aalmaram (a Kerala children's‑book publisher, ~15–20 orders/month, 1–2 products). Work
inside the existing Next.js 16 App Router app in this repo. At the end of this build the
site takes payments, creates orders, and pushes shipments with **no Shopify dependency
anywhere**.

The full architecture is specified in **`docs/custom-commerce/PLAN.md`**. Read it in full
before writing code. This brief tells you *how to execute* that plan; the plan tells you
*what to build*. If they ever conflict, stop and ask.

## Read first (do not skip)

1. `docs/custom-commerce/PLAN.md` — the spec.
2. `AGENTS.md` — this is a modified Next.js 16.2.6. **Read the relevant guides under
   `node_modules/next/dist/docs/` before using any App Router API** (route handlers, server
   actions, caching / `use cache`, `revalidateTag`, middleware, metadata). Heed the AI‑agent
   hints embedded in those docs (e.g. `unstable_instant` for instant navigation).
3. Invoke the **`supabase-postgres-best-practices`** skill before writing any SQL — schema,
   migrations, RLS, indexes, functions, triggers.
4. Invoke the **`dataviz`** skill before building the analytics chart.
5. Existing code to preserve and extend, not rewrite wholesale:
   `src/context/CartContext.tsx`, `src/lib/auth.ts`, `src/app/admin/*`,
   `src/app/api/{newsletter,events,collaborate,preorder}/route.ts`, `emails/`,
   `src/app/globals.css` (brand tokens), `src/components/*`.
6. `AUTOMATIONS.md` and the `*-workflow.json` files at repo root — the n8n flows you will
   feed. Do not edit the JSON; you only change which webhook URL fires them (via env).

## Hard constraints

- **Stack:** Next.js 16 App Router (already installed), React 19, Tailwind v4, TypeScript
  strict, Supabase (`@supabase/supabase-js`, `@supabase/ssr`), Razorpay, Resend
  (`resend` + `@react-email/components`), Shiprocket via `fetch`. Use the Supabase CLI for
  migrations (`supabase/migrations/*.sql`). No ORM unless you make the case for Drizzle
  first and get a yes.
- **Money:** integer paise everywhere. No floats for money. INR only.
- **Payments:** Razorpay **prepaid only**. An order row is created only after a payment
  signature verifies. No COD, no draft/pending orders from the storefront.
- **Security:** follow PLAN.md §12 exactly. Service‑role key is server‑only. Verify Razorpay
  checkout *and* webhook signatures; the webhook is authoritative. Order creation +
  inventory decrement + discount counters happen in **one** Postgres transaction (an RPC).
  `orders.razorpay_order_id` is unique for idempotency. Raw‑body parse in webhook handlers.
- **Do not build** anything in the PLAN.md "Deliberately NOT built" list. If you think an
  item there is actually needed, ask — don't just add it.
- **Storefront look stays identical.** Reuse existing components, brand CSS, fonts, copy,
  and page structure. You're swapping the data source and adding `/checkout`,
  `/order/confirmed`, `/shop`, `/products/[handle]` — not redesigning.
- **Keep n8n / NocoDB / Zoho.** The new system emits events into a `webhook_outbox` table
  that a drain route/cron delivers to the n8n webhook URLs from env. Existing flows are
  rewired by pointing them at the new event webhooks (a human does that in n8n; you just
  provide the URLs and payload shape, documented in a short `docs/custom-commerce/EVENTS.md`).
- **Windows dev environment.** Shell is PowerShell; a Bash tool is also available. Don't
  assume a POSIX‑only script works.

## Working method

- Build in the **8 phases from PLAN.md §11, in order.** After each phase:
  - run `npm run lint` and `npx tsc --noEmit` (and `npm run build` at the end of phases
    3, 5, and 8) and fix everything;
  - verify the change in the browser preview per the harness verification workflow
    (dev server, console, network, a real interaction) — never ask the user to check
    manually;
  - post a short summary of what landed, what's stubbed, and what env vars are now needed;
  - **pause for review before starting the next phase.**
- Commit at the end of each phase on a feature branch (`feat/custom-commerce`), one commit
  per phase, conventional‑commit messages. Do not push or open a PR unless asked.
- Keep a running `docs/custom-commerce/PROGRESS.md` (checklist + decisions + open items).
- When a secret/credential or an external dashboard action is required (create the Supabase
  project, add a Razorpay webhook, configure a Shiprocket pickup address, set Vercel env),
  **stop and hand the user exact step‑by‑step instructions**; don't fake it or block.
- Never enter credentials, tokens, or card details yourself. Never run the Shopify‑removal
  or data cutover (phase 8) without an explicit go‑ahead.
- Seed data: create a `scripts/seed.ts` that inserts the current catalogue
  ("Nandu in Muziris", ₹700, compare‑at ₹1400, cover at `/books/Cover.png`) plus the two
  live discount codes noted in memory (`NAGMA15` 15% off order, `TKHP` 10% off Nandu) so
  local dev and staging have something real to click.

## Phase acceptance criteria

**P1 Foundation** — `supabase/migrations` create every table in PLAN.md §3 with RLS
policies and the order‑creation RPC signature (body can be a stub that raises "not
implemented"); `src/lib/supabase/{server,client}.ts`; `src/lib/database.types.ts` generated;
`/admin` login now uses Supabase Auth gated by `ADMIN_ALLOWLIST`, old password cookie
removed; `settings` singleton seeded; `npm run build` green.

**P2 Products + storefront read** — admin can create/edit/archive a product with variants,
images (Supabase Storage), all fields from PLAN.md §7; storefront homepage, new `/shop`, and
`/products/[handle]` render from Supabase with RLS active‑only; `CartContext` uses Supabase
variant ids; `?discount=` capture still works; no `SHOPIFY_*` reads on any storefront path.

**P3 Checkout + payments** — `/checkout` collects contact + address; `/api/checkout`
server‑prices the cart, applies a discount, computes shipping from `settings`, creates a
Razorpay order, writes a `checkouts` row; Razorpay modal opens; `/api/checkout/confirm`
verifies the signature and creates the order via the RPC (order + items + inventory
decrement + discount counters, all atomic); `/api/webhooks/razorpay` idempotently
reconciles; `/order/confirmed` shows the order; confirmation email sends via Resend; a
Razorpay **test‑mode** end‑to‑end order works in the preview.

**P4 Orders admin + discounts** — orders list with filters/search/pagination; order detail
with timeline; cancel + restock; full/partial refund via Razorpay; discount CRUD with every
rule in PLAN.md §3 enforced server‑side at checkout; redemptions view; per‑customer limits
work.

**P5 Shipping** — Shiprocket token cached in `settings` and auto‑refreshed; from an order,
admin can create the adhoc shipment, assign AWB, and get the label URL; shipments list shows
live status; `/api/webhooks/shiprocket` updates status and stamps `shipped_at` /
`delivered_at`; `order.shipped` triggers the tracking email; `/api/cron/track` fallback
guarded by `CRON_SECRET`; `npm run build` green.

**P6 Events feed + n8n** — `webhook_outbox` rows are created for
`order.paid|shipped|delivered|refunded|cancelled`; a drain route/cron (`CRON_SECRET`)
POSTs them to the env webhook URLs with retry/backoff and marks them sent; `docs/custom-
commerce/EVENTS.md` documents each topic's payload; events admin moved into the dashboard
and backed by the `events` table; `/api/events/register` unchanged.

**P7 Analytics + settings** — dashboard cards (revenue 7/30/90d, orders, AOV, units, top
products, low‑stock, discount usage, checkout→order conversion) + one revenue‑by‑day chart
using the `dataviz` palette; settings screens for everything in PLAN.md §7; owner can invite
a staff admin.

**P8 Migration + cutover** — `scripts/migrate-from-shopify.ts` imports products, customers,
and ~12 months of orders (`source='shopify-import'`); after the user confirms, delete
`src/lib/shopify.ts`, `test-shopify.js`, all `SHOPIFY_*` env references, and Shopify‑only
code paths; `npm run build` + `npm run lint` + `tsc` all green; produce a go‑live checklist
(Vercel env, Razorpay live keys + webhook, Shiprocket pickup, Resend domain, DNS for
`store.aalmaram.com`, one ₹1 live smoke order).

## First reply

Before writing code, reply with: (a) confirmation you've read PLAN.md, AGENTS.md, and the
relevant `node_modules/next/dist/docs/` pages, naming which ones; (b) the exact list of
Supabase / Razorpay / Shiprocket / Resend / Vercel setup steps you need the user to do
before P1 can be verified; (c) any deviations from PLAN.md you want to propose. Then wait
for the go‑ahead on P1.
