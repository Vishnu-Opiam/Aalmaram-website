# Aalmaram Custom Commerce — Build Plan

Replacing Shopify end‑to‑end with a self‑hosted commerce system inside the existing
Next.js 16 app on Vercel. This document is the architecture spec. The companion file
[`OPUS-BUILD-PROMPT.md`](./OPUS-BUILD-PROMPT.md) is the build brief handed to Opus.

---

## 1. Decisions locked in

| Area | Choice |
|---|---|
| Database / backend | **Supabase** (Postgres + Auth + Storage + RLS) |
| Phase 1 scope | Admin dashboard **+** backend **+** full storefront checkout cutover — fully off Shopify at the end |
| Payments | **Razorpay, prepaid only** (UPI / card / netbanking / wallet). No COD in v1. |
| Automations | **Keep** n8n + NocoDB + Zoho Books. The new system emits events; the 7 existing flows are rewired to consume them. |
| Currency | INR only. All money stored as **integer paise**. |
| Customer accounts | None. Guest checkout only. Order lookup by email + order number. |
| Hosting | Same Vercel project (`aalmaram-website`), same repo. |

### Deliberately NOT built
Multi‑currency · multi‑location inventory · POS · gift cards / store credit · subscriptions ·
wishlist · product‑review UI · CMS/blog · themes/Liquid · tax engine (books are GST‑exempt;
Zoho stays the invoice system of record) · customer login · returns/RMA portal (handled
manually in Shiprocket) · granular staff permissions (owner/staff only) · public webhooks API
(n8n is fed through an internal outbox) · A/B testing · fraud scoring.

---

## 2. Architecture overview

```
                       ┌─────────────────────────────────────────────┐
  Storefront (public)  │  Next.js App Router — aalmaram.com           │
  ───────────────────  │                                             │
  / (one-page)         │  Server Components read products via        │
  /shop, /products/[h] │  Supabase anon client (RLS: status=active)  │
  /checkout            │                                             │
  /order/confirmed     │  Cart: localStorage (unchanged pattern)     │
                       └──────────────┬──────────────────────────────┘
                                      │  POST /api/checkout
                                      │  POST /api/checkout/confirm
                                      ▼
        ┌──────────────────────────────────────────────────────────────┐
        │  Route handlers + Server Actions (service-role Supabase)      │
        │                                                              │
        │  /api/checkout            create Razorpay order, price server │
        │  /api/checkout/confirm    verify signature, create order tx   │
        │  /api/webhooks/razorpay   authoritative payment state         │
        │  /api/webhooks/shiprocket shipment status                     │
        │  /api/cron/*              token poll, abandoned cart, outbox  │
        │  /admin/**                dashboard (Supabase Auth gated)     │
        └───────┬───────────────┬───────────────┬──────────────┬───────┘
                │               │               │              │
                ▼               ▼               ▼              ▼
          Supabase DB      Razorpay API    Shiprocket API   Resend API
          + Storage        (orders,        (adhoc order,    (txn email)
                            refunds,        AWB, label,
                            webhooks)       tracking)
                │
                ▼
         webhook_outbox ──► n8n (n8n.opiamanalytics.com)
                              Flow 1  order → Zoho invoice
                              Flow 2  order → NocoDB contact
                              Flow 2b order → NocoDB interaction
                              Flow 3  post-purchase email sequence
                              Flow 5/6/7, newsletter, events, collaborate (unchanged)
```

Key principle: **the browser never decides an amount.** Every price, discount, and shipping
figure is recomputed server‑side from the database. Razorpay's signed webhook — not the
browser redirect — is the source of truth for "paid".

---

## 3. Data model (Supabase Postgres)

SQL migrations live in `supabase/migrations/`. Generated types in `src/lib/database.types.ts`.

### products
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| handle | citext unique | slug, auto from title, editable |
| title | text | |
| subtitle | text | e.g. "First edition · Numbered" |
| description_md | text | markdown |
| status | text | `draft` \| `active` \| `archived` |
| tags | text[] | storefront grouping ("age-4-8", "malayalam") |
| hsn_code | text | books usually `4901` |
| requires_shipping | boolean | default true |
| seo_title, seo_description | text | |
| created_at, updated_at | timestamptz | |

### product_variants
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| product_id | uuid fk → products | cascade |
| title | text | "Default" / "Hardcover" / "English" |
| sku | text | |
| price_paise | integer | |
| compare_at_paise | integer null | strike-through price |
| inventory_quantity | integer | single-location stock |
| weight_grams | integer | for Shiprocket |
| length_cm, breadth_cm, height_cm | numeric | Shiprocket package dims |
| position | integer | |
Every product has ≥1 variant. Admin defaults to a single "Default" variant; a product with
one variant hides the variant UI.

### product_images
`id, product_id fk, url (Supabase Storage), alt, position`

### customers
`id, email citext unique, phone, first_name, last_name, accepts_marketing bool, notes,
total_orders int, total_spent_paise bigint, created_at, updated_at`

### discounts
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| code | citext unique | stored uppercase |
| title | text | |
| type | text | `percentage` \| `fixed_amount` \| `free_shipping` |
| value | numeric | percent (0–100) or paise |
| applies_to | text | `all` \| `products` \| `tag` |
| product_ids | uuid[] null | when `applies_to = products` |
| tag | text null | when `applies_to = tag` |
| min_subtotal_paise | integer null | |
| usage_limit | integer null | total redemptions |
| usage_limit_per_customer | integer null | |
| once_per_customer | boolean | |
| combinable | boolean | default false |
| used_count | integer | default 0 |
| starts_at | timestamptz | |
| ends_at | timestamptz null | |
| active | boolean | manual kill switch |

### discount_redemptions
`id, discount_id fk, order_id fk, customer_email citext, amount_paise, created_at`
Drives per‑customer limits and reporting.

### checkouts  (pre‑payment, authoritative cart snapshot)
| column | type | notes |
|---|---|---|
| id | uuid pk | also the client cart token |
| email | text null | |
| line_items | jsonb | `[{variant_id, quantity}]` |
| discount_code | text null | |
| subtotal_paise, discount_paise, shipping_paise, tax_paise, total_paise | integer | server-computed |
| shipping_address | jsonb null | |
| razorpay_order_id | text null | |
| status | text | `active` \| `completed` \| `abandoned` |
| completed_order_id | uuid fk null | |
| created_at, updated_at | timestamptz | |

### orders
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| order_number | text unique | `AAL` + sequence starting 1001 |
| email, phone | text | |
| customer_id | uuid fk null | |
| payment_status | text | `pending` \| `paid` \| `failed` \| `refunded` \| `partially_refunded` |
| fulfillment_status | text | `unfulfilled` \| `fulfilled` \| `cancelled` \| `returned` |
| order_status | text | `open` \| `archived` \| `cancelled` |
| currency | text | `INR` |
| subtotal_paise, discount_paise, shipping_paise, tax_paise, total_paise | integer | |
| discount_code | text null | |
| shipping_address | jsonb | snapshot `{name,phone,line1,line2,city,state,pincode,country}` |
| billing_address | jsonb null | |
| razorpay_order_id | text unique | idempotency key |
| razorpay_payment_id | text null | |
| razorpay_signature | text null | |
| notes | text | |
| cancel_reason | text null | |
| placed_at | timestamptz | payment captured time |
| source | text | `web` \| `shopify-import` |
| created_at, updated_at | timestamptz | |

### order_items
`id, order_id fk, product_id fk null, variant_id fk null, title (snapshot),
variant_title (snapshot), sku (snapshot), unit_price_paise, quantity, total_paise,
weight_grams (snapshot)`

### shipments
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| order_id | uuid fk | |
| provider | text | `shiprocket` |
| shiprocket_order_id, shiprocket_shipment_id | text | |
| awb_code | text null | |
| courier_name | text null | |
| label_url, manifest_url | text null | |
| status | text | `pending` \| `awb_assigned` \| `pickup_scheduled` \| `in_transit` \| `delivered` \| `rto` \| `cancelled` |
| tracking_url | text null | |
| shipped_at, delivered_at | timestamptz null | |
| raw | jsonb | last status payload |
| created_at, updated_at | timestamptz | |

### inventory_adjustments  (audit)
`id, variant_id fk, delta int, reason text (order|restock|manual|cancellation|refund),
order_id uuid null, note, created_by, created_at`

### webhook_outbox  (durable feed to n8n)
`id, topic text (order.paid|order.shipped|order.delivered|order.refunded|order.cancelled),
payload jsonb, status text (pending|sent|failed), attempts int, last_error, created_at, sent_at`

### events  (author events — replaces Shopify metaobject + data/events.json)
`id, title, date, location, description, link, published bool, created_at, updated_at`

### settings  (singleton key → jsonb)
store name · support email · from addresses · free‑shipping threshold paise · flat‑rate
shipping paise · per‑state rate overrides · Shiprocket pickup nickname · GST number · invoice
prefix · low‑stock threshold · n8n webhook URLs · feature flags.

### admin_users
`id, email citext unique, role text (owner|staff), name, last_login_at, created_at`
Login via Supabase Auth; access gated by presence in this table (or `ADMIN_ALLOWLIST`).

### audit_log
`id, admin_user_id, action, entity_type, entity_id, diff jsonb, created_at`

### RLS
- `anon`: `select` only on `products`, `product_variants`, `product_images` where the parent
  product `status = 'active'`; `select` on published `events`; `select` on a public subset of
  `settings`. Nothing else.
- Everything else: **service‑role only**. Admin dashboard and route handlers use a server‑side
  service‑role client that is never sent to the browser.
- Order creation, inventory decrement, and discount counters run inside a Postgres function
  (RPC) so they're one transaction and can't oversell.

---

## 4. Checkout & payment flow (Razorpay prepaid)

1. Customer fills contact + shipping address on `/checkout` (custom page, replaces Shopify's
   hosted checkout).
2. `POST /api/checkout` with `{ line_items, address, discount_code }`.
3. Server recomputes everything from the DB: variant prices, discount validity, shipping
   (flat rate, or free above threshold), total. Writes a `checkouts` row. Creates a
   **Razorpay Order** (`amount`, `currency: "INR"`, `receipt: checkout.id`). Returns
   `{ razorpay_order_id, key_id, amount, checkout_id }`.
4. Client opens the Razorpay Checkout modal with that order id.
5. On success the modal returns `razorpay_payment_id / order_id / signature` →
   `POST /api/checkout/confirm`.
6. Server verifies the signature (HMAC‑SHA256 with key secret). If valid, in **one
   transaction**: create `orders` (+ `order_items`), decrement inventory (guarded
   `inventory_quantity >= qty`), bump `discounts.used_count` + insert `discount_redemptions`,
   mark the checkout `completed`, enqueue `order.paid` in `webhook_outbox`. Send the order
   confirmation email via Resend. Return `order_number`; client redirects to
   `/order/confirmed?number=…`.
7. **`/api/webhooks/razorpay`** (`order.paid` / `payment.captured`) is the safety net —
   verify webhook signature, then idempotently upsert the order keyed on
   `razorpay_order_id` in case the browser callback was lost. Never rely on the redirect alone.
8. `order.paid` drains from the outbox to n8n → Flow 1 (Zoho invoice), Flow 2/2b (NocoDB).

**Refunds:** admin → Refund (full/partial) → Razorpay refund API → update `payment_status`
→ optional restock → enqueue `order.refunded`.

**Abandoned checkout:** cron over `checkouts` where `status='active'`, has an email, older
than ~1h → one Resend recovery email. (No further automation in v1.)

---

## 5. Shipping flow (Shiprocket)

- **Auth:** `POST /v1/external/auth/login` (email + password) → bearer token (~10‑day life).
  Cache in `settings`; refresh on 401.
- **Create shipment:** admin order detail → "Create shipment" →
  `POST /v1/external/orders/create/adhoc` with pickup nickname, items, weight, dimensions,
  `payment_method: "Prepaid"`. Store `shiprocket_order_id` + `shipment_id`.
- **Serviceability / AWB:** optional `courier/serviceability` to pick the cheapest courier,
  then `courier/assign/awb`. Store `awb_code`, `courier_name`.
- **Label / pickup:** `courier/generate/label`, `courier/generate/pickup`. Store URLs.
- **Tracking:** configure a Shiprocket webhook → `/api/webhooks/shiprocket` to update
  `shipments.status` and stamp `shipped_at` / `delivered_at`. Fallback: `/api/cron/track`
  polls `courier/track/awb/{awb}` a few times a day.
- On **shipped**: `orders.fulfillment_status = fulfilled`, enqueue `order.shipped` →
  Resend shipping‑confirmation email with tracking link + n8n.
- On **delivered**: enqueue `order.delivered` → n8n Flow 3 (delivery note, +3d check‑in,
  +10d review ask) — those delayed emails stay in n8n, just triggered by our event instead
  of Shopify's `orders/fulfilled`.

---

## 6. Email (Resend)

**Sent directly by the app** (instant, no n8n dependency), using the existing brand shell in
`emails/` (manuscript `#f8f5f0`, Playfair Display headers, Nunito body, gold `#c6a15b`).
Build with `@react-email/components`.

- Order confirmation — on payment captured
- Shipping confirmation + tracking — on AWB assigned / shipped
- Abandoned checkout — one email, from cron
- New‑order alert to the founder

**Stays in n8n** (already built): Flow 3 post‑purchase sequence, Flow 5 weekly digest,
Flow 6 low‑inventory (app can also surface this), Flow 7 monthly newsletter, Flow 4 event
registration, newsletter signup, collaborate form, Flow 1 Zoho, Flow 2 NocoDB.

Every marketing email keeps the existing unsubscribe webhook in the footer.

---

## 7. Admin dashboard

Auth: Supabase Auth (email + password), access gated by `admin_users` / `ADMIN_ALLOWLIST`,
all `/admin/**` behind middleware. Every mutation writes `audit_log`.

| Section | Contents |
|---|---|
| **Orders** | List (number, date, customer, total, payment + fulfillment status, filters, search, pagination). Detail: line items, address, Razorpay info + dashboard link, event timeline, notes. Actions: create shipment, assign AWB, download label, mark fulfilled, cancel + restock, refund (full/partial), resend confirmation, edit address pre‑fulfillment. |
| **Products** | List (thumb, title, status, price, stock, search). Create/edit: title, handle, markdown description, status, images (upload → Supabase Storage), price + compare‑at, SKU, stock, weight + dimensions, HSN, tags, SEO. Variants (add/remove rows). Archive; hard‑delete only if never ordered. Inventory quick‑adjust with reason + log. |
| **Discounts** | List (code, type, value, usage, status, window). Create/edit: code (+ generate button), type, value, applies‑to (all / products / tag), min subtotal, total + per‑customer limits, once‑per‑customer, combinable, start/end. Deactivate. Copy `aalmaram.com/?discount=CODE` link. Redemptions view. |
| **Customers** | List (name, email, orders, spend, marketing opt‑in, search). Detail: contact, order history, addresses, notes, marketing toggle, link to NocoDB record. |
| **Shipping** | Shiprocket connection + re‑auth. Pickup address. Rate config (flat rate, free threshold, per‑state overrides). Shipments list with AWB + live status + tracking; pending‑pickup queue. |
| **Analytics** | Cards: revenue 7/30/90d, order count, AOV, units, top products, low‑stock, discount usage, checkout→order conversion. One revenue/orders‑by‑day line chart (use the `dataviz` skill palette). |
| **Events** | The current events admin, moved here, backed by the Supabase `events` table. |
| **Settings** | Store info, support/from emails, GST number, invoice prefix, low‑stock threshold, n8n webhook URLs, feature flags, Razorpay/Resend/Shiprocket key status, admin users (owner adds staff). |

---

## 8. Storefront changes

- Delete `src/lib/shopify.ts`, `test-shopify.js`, all `SHOPIFY_*` / `NEXT_PUBLIC_SHOPIFY_*` env.
- New `src/lib/commerce.ts` — product reads from Supabase (anon client, RLS active‑only),
  cached with `use cache` + `revalidateTag('products')` on admin product save.
- `src/context/CartContext.tsx` — keep the localStorage cart and the `?discount=` capture;
  swap `getFirstProduct` / `createCheckout` for calls into `commerce.ts` + `/api/checkout`.
  Cart items carry a Supabase `variant_id`.
- Components reading the product (`Products.tsx`, `Hero.tsx`, `Specs.tsx`, `BookCover.tsx`,
  `PreOrderModal.tsx`, `StickyBar.tsx`) read from the new data. Add a real `/shop` list and
  `/products/[handle]` PDP.
- New `/checkout` page (contact + address → Razorpay modal → confirm) and
  `/order/confirmed`. Optional `/orders/lookup` (email + order number).
- `store.aalmaram.com` (Shopify checkout host) → 301 to the apex, or release the subdomain.
- Keep `/api/newsletter`, `/api/events/register`, `/api/collaborate`, `/api/preorder`
  (they forward to n8n). Move the events *admin* into the dashboard.
- Existing brand CSS, fonts, layout, copy, and page structure stay exactly as they are.

---

## 9. Migration from Shopify

Catalog is tiny (1–2 books), so products/discounts are fastest re‑entered by hand in the new
admin. Write `scripts/migrate-from-shopify.ts` mainly for **order + customer history**:

- Products → `products` + variants + images (download, re‑upload to Supabase Storage).
- Customers → `customers`.
- Orders (last ~12 months) → `orders` + `order_items`, `source='shopify-import'`,
  `payment_status='paid'`, fulfillment as‑is — for analytics continuity.
- Discount codes → `discounts` (best effort from price rules).

Cutover is gated behind an explicit go‑ahead and a live ₹1 smoke order.

---

## 10. Environment variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Razorpay
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
NEXT_PUBLIC_RAZORPAY_KEY_ID=
RAZORPAY_WEBHOOK_SECRET=

# Shiprocket
SHIPROCKET_EMAIL=
SHIPROCKET_PASSWORD=
SHIPROCKET_PICKUP_LOCATION=
SHIPROCKET_WEBHOOK_TOKEN=

# Resend
RESEND_API_KEY=
EMAIL_FROM_ORDERS="Aalmaram <foundersteam@aalmaram.com>"
EMAIL_FROM_MARKETING="Aalmaram <letters@aalmaram.com>"
ADMIN_NOTIFY_EMAIL=

# Admin
ADMIN_ALLOWLIST=nivedith@example.com,vishnu@opiamanalytics.com

# n8n (existing infra)
N8N_ORDER_PAID_WEBHOOK_URL=
N8N_ORDER_SHIPPED_WEBHOOK_URL=
N8N_ORDER_DELIVERED_WEBHOOK_URL=
N8N_NEWSLETTER_WEBHOOK_URL=
N8N_EVENT_WEBHOOK_URL=
N8N_COLLABORATE_WEBHOOK_URL=

# Misc
NEXT_PUBLIC_SITE_URL=https://aalmaram.com
CRON_SECRET=
```

---

## 11. Build order (all inside Phase 1)

1. **Foundation** — Supabase project, schema migrations, generated types, server/browser
   clients, admin auth + middleware, `settings` singleton, seed script.
2. **Products + storefront read** — product CRUD admin, image upload, storefront reads from
   Supabase, `/shop` + PDP, cart carries Supabase variant ids.
3. **Checkout + payments** — `/checkout`, `/api/checkout`, Razorpay order,
   `/api/checkout/confirm` (signature verify), `/api/webhooks/razorpay`, order‑creation RPC,
   inventory decrement, `/order/confirmed`, confirmation email.
4. **Orders admin + discounts** — orders list/detail, refund, cancel/restock, discount CRUD
   + server‑side validation in checkout, redemptions.
5. **Shipping** — Shiprocket token cache, create shipment / assign AWB / label, shipments
   list, `/api/webhooks/shiprocket`, shipping email, `/api/cron/track` fallback.
6. **Events feed + n8n rewire** — `webhook_outbox` + drain route/cron, repoint n8n Flows
   1 / 2 / 2b / 3 to the new events, move events admin in, migrate `events` to Supabase.
7. **Analytics + settings** — dashboard metrics + chart, settings screens, admin users.
8. **Migration + cutover** — import script, data check, delete Shopify code/env, retire
   `store.aalmaram.com` checkout, live ₹1 smoke order, go live.

---

## 12. Correctness & security checklist

- Amounts always recomputed server‑side; client figures are display‑only.
- Verify **both** the Razorpay checkout signature and the webhook signature; webhook wins.
- `orders.razorpay_order_id` unique → idempotent order creation.
- Order insert + inventory decrement + discount counters in one Postgres transaction; guard
  against negative stock.
- Discount checks server‑side: window, total + per‑customer limits, min subtotal, product/tag
  scope, combinability.
- RLS locks every non‑public table to service role; service‑role key server‑only.
- Webhook handlers read the raw body before parsing; constant‑time signature compare.
- Rate‑limit `/api/checkout` and `/api/checkout/confirm`.
- Cron routes require `CRON_SECRET`.
- Admin mutations → `audit_log`.
- Shiprocket credentials + tokens server‑only.
- `tax_paise = 0` (books, HSN 4901, GST‑exempt) but store HSN; Zoho Books stays the invoice
  system of record.

---

## 13. Open questions (not blockers)

1. Confirm launching **prepaid‑only** (COD deferred) is acceptable.
2. Customer‑facing "track my order" page, or is the tracking link in the email enough for v1?
   (Recommend: email link only.)
3. Product descriptions in **markdown** (recommended) vs a rich‑text editor.
4. Keep invoice numbering in **Zoho** (recommended) — no invoice PDF from the new system.
5. `store.aalmaram.com`: 301 to apex, or release it?
6. Product reviews: keep collecting via the external form / email reply for now?
