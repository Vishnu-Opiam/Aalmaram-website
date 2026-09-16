# Store events → n8n

How the store tells n8n that something happened, what it sends, and how to wire
the existing flows to it. Code: [`src/lib/outbox.ts`](../../src/lib/outbox.ts).

---

## How delivery works

1. Postgres writes a row to `webhook_outbox` **in the same transaction** as the
   thing it describes. An order cannot exist without its `order.paid` row.
2. Straight after the response, the app drains the outbox (`after()` in Next),
   so n8n normally hears within a second or two.
3. `/api/cron/outbox` runs every hour as the fallback: retries that have come
   due, and anything the immediate drain missed.
4. Each row is POSTed to the webhook URL for its topic. Any 2xx is success.
   Anything else — a non-2xx, a timeout (10 s), a refused connection — is
   retried after 1, 3, 9, 27, 81, 243 minutes, then every 12 hours, and marked
   **failed** after 10 attempts (about two days). Failed rows show on the admin
   home and in **Settings → Integrations**, where they can be retried.
5. A topic with **no URL configured is not attempted at all**. Its rows wait,
   pending, and are delivered once a URL is set — so wiring n8n up late loses
   nothing.

Delivery is **at least once**. If the app dies between n8n answering and the
row being marked sent, that row goes again. Every body carries `event.id`;
de-duplicate on it if a flow must never run twice (Zoho invoices: Flow 1
already looks up the customer first, but would create a second invoice).

## Configuration

| Topic | URL setting | Env var fallback |
|---|---|---|
| `order.paid` | Settings → Integrations | `N8N_ORDER_PAID_WEBHOOK_URL` |
| `order.shipped` | Settings → Integrations | `N8N_ORDER_SHIPPED_WEBHOOK_URL` |
| `order.delivered` | Settings → Integrations | `N8N_ORDER_DELIVERED_WEBHOOK_URL` |
| `order.refunded` | Settings → Integrations | `N8N_ORDER_REFUNDED_WEBHOOK_URL` |
| `order.cancelled` | Settings → Integrations | `N8N_ORDER_CANCELLED_WEBHOOK_URL` |
| `inventory.low` | Settings → Integrations | `N8N_INVENTORY_LOW_WEBHOOK_URL` |

A URL saved in the admin wins over the env var. `N8N_WEBHOOK_SECRET` (env only)
is the shared secret — see Authentication.

## Authentication

Every request carries:

| Header | Value |
|---|---|
| `x-aalmaram-token` | `N8N_WEBHOOK_SECRET`, verbatim |
| `x-aalmaram-signature` | `sha256=` + hex HMAC-SHA256 of the raw body, keyed with `N8N_WEBHOOK_SECRET` |
| `x-aalmaram-topic` | e.g. `order.paid` |
| `x-aalmaram-event-id` | the outbox row id (same as `event.id`) |

n8n's Webhook node can only compare a header to a stored value, so protect each
webhook with **Header Auth**: name `x-aalmaram-token`, value the secret. The
same credential authenticates n8n calling the store (`/api/integrations/summary`).

## Body

Every body has:

```jsonc
{
  "event": { "id": "uuid", "topic": "order.paid", "created_at": "ISO", "attempt": 1 },
  "data": { /* the row's payload, exactly as Postgres wrote it — per topic below */ }
}
```

### Order topics — a Shopify-shaped order at the top level

For `order.*`, the order **as it stands at send time** is spread across the top
level in the field names of a Shopify order webhook. The existing flows read
`order = $json.body ?? $json` and then `order.line_items`, `order.customer`,
`order.total_price`…, so they work unchanged.

```jsonc
{
  "id": "uuid",                       // our order id
  "name": "#AAL1042",
  "order_number": "AAL1042",
  "email": "buyer@example.com",
  "phone": "9999999999",
  "created_at": "ISO",                // when the payment was captured
  "currency": "INR",
  "financial_status": "paid",         // our payment_status
  "fulfillment_status": "unfulfilled",
  "subtotal_price": "700.00",         // rupees, as strings — Shopify's convention
  "total_discounts": "105.00",
  "total_tax": "0.00",
  "total_price": "655.00",
  "discount_codes": [{ "code": "NAGMA15", "amount": "105.00" }],
  "buyer_accepts_marketing": true,
  "customer": { "first_name": "Asha", "last_name": "Menon", "email": "…", "phone": "…" },
  "shipping_address": {
    "name": "Asha Menon", "first_name": "Asha", "last_name": "Menon",
    "address1": "…", "address2": "…", "city": "Kochi", "province": "Kerala",
    "zip": "682001", "country": "India", "phone": "…"
  },
  "billing_address": { /* same shape; the shipping address when none was given */ },
  "line_items": [
    { "title": "Nandu in Muziris", "variant_title": "", "sku": "…", "quantity": 1, "price": "700.00" }
  ],
  "shipping_lines": [{ "title": "Shipping", "price": "60.00" }],
  "fulfillments": [{ "tracking_number": "AWB…", "tracking_company": "Delhivery", "tracking_url": "…" }],
  "shipment": { "awb_code": "…", "courier_name": "…", "tracking_url": "…", "status": "in_transit",
                "shipped_at": "ISO", "delivered_at": null }, // null before a shipment exists
  "event": { … },
  "data": { … }
}
```

Differences from Shopify worth knowing:

- **No `customer.id`.** Flow 2 matches NocoDB contacts on a Shopify customer id
  when one is present; ours would never match a contact imported from Shopify
  and would create a duplicate. Without it, Flow 2 matches on email.
- `variant_title` is `""` for the single "Default" variant.
- Money in `data` is **integer paise**; money at the top level is **rupee strings**.

### `data` per topic

**`order.paid`** — a payment was captured and the order created.
`order_id, order_number, email, phone, total_paise, subtotal_paise,
discount_paise, shipping_paise, discount_code, shipping_address, placed_at,
accepts_marketing, items[{title, variant_title, sku, quantity,
unit_price_paise, total_paise}]`

`accepts_marketing` is whether the buyer ticked the newsletter box **on this
checkout**. Use it, not `buyer_accepts_marketing` (the customer's standing
consent), to decide whether to subscribe them — otherwise a later order would
re-subscribe someone who had unsubscribed through n8n.

**`order.shipped`** — the AWB was assigned (or a courier update got there
first). Fires once per shipment. The store emails the buyer itself.
`order_id, order_number, email, shipment_id, awb_code, courier_name,
tracking_url, shipped_at`

**`order.delivered`** — the courier reported delivery. Fires once.
`order_id, order_number, email, shipment_id, awb_code, courier_name, delivered_at`

**`order.refunded`** — a refund was processed at Razorpay and booked. One per
refund; a partial refund and a later one are two events.
`order_id, order_number, email, refund_id, razorpay_refund_id, amount_paise,
refunded_paise (running total), total_paise, payment_status, reason, restocked`

**`order.cancelled`** — the order was cancelled (after refunding what was left,
if anything). Always preceded by `order.refunded` when money went back.
`order_id, order_number, email, reason, refunded_paise, total_paise`

### `inventory.low`

Fires when a variant's stock **crosses down** to the low-stock threshold
(Settings → Inventory) — once per crossing, not once per sale below it — and
only for active products. Not delivered (dropped, with the reason kept) if the
variant or product has gone by send time.

```jsonc
{
  "event": { … },
  "data": {
    "product_id": "uuid", "product_title": "Nandu in Muziris", "product_handle": "nandu-in-muziris",
    "variant_id": "uuid", "variant_title": "Default", "sku": "…",
    "available": 5, "previous": 6, "threshold": 5
  },
  "available": 5,             // copied up for the Flow 6 condition node
  "current_available": 4,     // stock at send time, which may have moved since
  "title": "Nandu in Muziris"
}
```

## The store's own endpoint for n8n

`GET /api/integrations/summary?days=7` with `x-aalmaram-token` → the same
numbers as the admin dashboard, for Flow 5:

```jsonc
{
  "days": 7, "from": "2026-09-10", "to": "2026-09-16",
  "orders": 4, "units": 5,
  "gross_revenue_paise": 331000, "refunded_paise": 0, "net_revenue_paise": 331000,
  "previous": { "orders": 2, "net_revenue_paise": 131000 },
  "top_products": [{ "title": "…", "units": 5, "revenue_paise": 350000, "orders": 4 }],
  "low_stock": [{ "title": "…", "sku": "…", "available": 3, "product_id": "…", "variant_id": "…" }]
}
```

Days are Indian calendar days ending today. Revenue counts orders by when they
were paid; refunds by when the money went back.

---

## Rewiring the n8n flows

Ready-to-import workflows are in [`n8n/`](./n8n/), generated from the
Shopify-era originals at the repo root by
`node scripts/n8n/build-commerce-workflows.mjs`. Only the triggers (and Flow 5
and 6's Shopify API calls) changed; every email template, NocoDB table and Zoho
call is as it was.

| File | Replaces | Topic → webhook path |
|---|---|---|
| `order-paid-workflow.json` | Flow 1 (Zoho invoice), Flow 2 (NocoDB contact), Flow 2b (NocoDB interaction) — all three were `orders/create` — plus a newsletter subscribe for buyers who ticked the box | `order.paid` → `/webhook/aalmaram-order-paid` |
| `order-delivered-workflow.json` | Flow 3 (post-purchase check-in +3 d, review +10 d), was `orders/fulfilled` | `order.delivered` → `/webhook/aalmaram-order-delivered` |
| `inventory-low-workflow.json` | Flow 6 (low-stock email), was `inventory_levels/update` + a Shopify GraphQL lookup | `inventory.low` → `/webhook/aalmaram-inventory-low` |
| `weekly-digest-workflow.json` | Flow 5 (Monday digest), was reading Shopify's orders API | calls `GET /api/integrations/summary?days=7` |

Flows 4 (event registration), 7 (monthly newsletter), newsletter signup and
collaborate never touched Shopify and are unchanged.

Small changes carried over: contacts created from an order are labelled
`source: 'Website'` instead of `'Shopify'`; interaction ids are `WEB-AAL1042`
instead of `SHOP-1042`.

### Steps in n8n

1. **Credentials → New → Header Auth.** Name `Aalmaram store token`; header
   name `x-aalmaram-token`; value = the store's `N8N_WEBHOOK_SECRET`.
2. **Import** each file (Workflows → Import from File). Open every node flagged
   with a credential warning and pick the real credential: `Aalmaram store
   token` on the Webhook nodes and on Flow 5's store call; the existing NocoDB,
   Zoho and Resend credentials elsewhere (the same placeholders as
   `AUTOMATIONS.md`). In the digest, set `REPLACE_ZOHO_ORG_ID` and
   `REPLACE_NIVEDITH_EMAIL`; in the stock alert, `REPLACE_NIVEDITH_EMAIL`; in
   Flow 3, the review link.
3. **Deactivate** the old Shopify-triggered Flows 1, 2, 2b, 3, 5 and 6, so
   nothing runs twice.
4. **Activate** the new ones. Copy each Webhook node's **Production URL**.
5. In the store admin, **Settings → Integrations**: paste the URLs for
   `order.paid`, `order.delivered` and `inventory.low`, save, and press
   **Send test** on each. `order.shipped`, `order.refunded` and
   `order.cancelled` have no consumer yet; leave them blank until one exists.
6. Check an execution appears in n8n for each test.

`Send test` posts a clearly-marked sample (`event.test = true`, order number
`TEST0000`, email `test@example.com`) directly — it does not go through the
outbox. Flows 1, 2 and 2b **will act on it** (a Zoho invoice, a NocoDB contact)
unless paused, so send the `order.paid` test while those branches are
disconnected, or delete the test records afterwards.
