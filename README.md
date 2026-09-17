# Aalmaram

The Aalmaram website and store: a Next.js 16 app on Vercel with its own
commerce system — Supabase (Postgres, Auth, Storage), Razorpay (prepaid),
Shiprocket, Resend — feeding the existing n8n automations.

## Documentation

| | |
|---|---|
| [`docs/custom-commerce/PLAN.md`](docs/custom-commerce/PLAN.md) | Architecture and data model |
| [`docs/custom-commerce/PROGRESS.md`](docs/custom-commerce/PROGRESS.md) | What was built, how it was verified, decisions, open items |
| [`docs/custom-commerce/GO-LIVE.md`](docs/custom-commerce/GO-LIVE.md) | Configuration and the live smoke order |
| [`docs/custom-commerce/EVENTS.md`](docs/custom-commerce/EVENTS.md) | Store events → n8n, payloads, rewiring the flows |

## Develop

```bash
npm install
cp .env.local.example .env.local   # then fill it in — test Razorpay keys only
npm run dev
```

Open http://localhost:3000, and http://localhost:3000/admin for the dashboard.

| Script | |
|---|---|
| `npm run typecheck` / `npm run lint` / `npm run build` | the gates every change passes |
| `npm run db:push` | apply `supabase/migrations` to the linked project |
| `npm run db:types` | regenerate `src/lib/database.types.ts` after a migration |
| `npm run db:seed` | the catalogue and live discount codes, idempotently |
| `npm run migrate:shopify` | import Shopify history (dry run unless `--apply`) |

## Verify

The suites in `scripts/verify/` run against the live database and clean up after
themselves. The `*-app-test` ones also need `npm run dev` and a throwaway
`.env.development.local` (see each file's header; delete it afterwards).

```bash
node --env-file=.env.local scripts/verify/rpc-test.mjs
node --env-file=.env.local scripts/verify/p4-test.mjs
node --env-file=.env.local scripts/verify/p5-test.mjs
node --env-file=.env.local scripts/verify/p6-test.mjs
node --env-file=.env.local scripts/verify/p7-test.mjs
node --env-file=.env.local scripts/verify/p8-test.mjs
node --env-file=.env.local --env-file=.env.development.local scripts/verify/p3-test.mjs
node --env-file=.env.local --env-file=.env.development.local scripts/verify/p4-app-test.mjs
node --env-file=.env.local --env-file=.env.development.local scripts/verify/p5-app-test.mjs
node --env-file=.env.local --env-file=.env.development.local scripts/verify/p6-app-test.mjs
node --env-file=.env.local --env-file=.env.development.local scripts/verify/p7-app-test.mjs
```

This is Next.js 16: read the guides in `node_modules/next/dist/docs/` before
using an App Router API (see `AGENTS.md`).
