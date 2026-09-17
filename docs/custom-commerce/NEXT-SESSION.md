# Handoff — the Aalmaram custom commerce build is complete

Paste everything below the line into a fresh Claude Code session opened at the
repo root (`D:\Aalmaram`), on branch `feat/custom-commerce`.

---

All eight phases of the build (PLAN.md §11) are done, committed and verified.
There is nothing left to build from the plan. What remains is configuration only
the owner can do, listed step by step in `docs/custom-commerce/GO-LIVE.md`.

## Read these first

1. `docs/custom-commerce/PROGRESS.md` — what landed in every phase, how it was
   verified, every decision, the open items.
2. `docs/custom-commerce/GO-LIVE.md` — the remaining owner steps, in order.
3. `docs/custom-commerce/EVENTS.md` — store events → n8n.
4. `AGENTS.md` — Next.js 16.2.6: read `node_modules/next/dist/docs/` before using
   an App Router API.

## Likely work from here

- **Helping the owner through GO-LIVE.md.** Walk them through it; never type a
  key, password or card number yourself, even if they paste one and ask. Check
  `RAZORPAY_KEY_ID` starts with `rzp_test_` in `.env.local` before starting a dev
  server — live keys belong only in Vercel Production.
- **The Shopify import** (GO-LIVE §8) has only run against fixtures; the API path
  is unexercised because the old credential is dead. Run the dry run with the
  owner's new token first and read every warning before `--apply`.
- **Fixes after the ₹1 live order.** The admin UI has still never been used with
  a real signed-in session by anyone but the owner.
- Open items in PROGRESS.md: an RTO email to buyers, the real parcel weight.

## How to work

- Every change: `npx tsc --noEmit`, `npm run lint` (0 errors), `npm run build`.
- Anything touching SQL: invoke `supabase-postgres-best-practices` first; write
  migrations with the Write tool; `npx supabase db push`, `npm run db:types`;
  explicit `service_role` grants and revoked `public/anon/authenticated`.
- Re-run the suites in `scripts/verify/` that cover what you touched (README
  lists them). They run against the live database and clean up after themselves;
  the app suites need a dev server and a throwaway `.env.development.local` —
  delete it afterwards.
- One conventional commit per change. Don't push or open a PR unless asked.
