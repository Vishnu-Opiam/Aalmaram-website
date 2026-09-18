# Go-live checklist

Everything in the build is done and tested (see [`PROGRESS.md`](./PROGRESS.md)).
What is left is configuration that only the owner can do — accounts, keys,
DNS — and one real payment to prove it. Work top to bottom; each step says how to
know it worked.

Secrets go into **Vercel → Project → Settings → Environment Variables**
(Production, and Preview if you test there), never into the repo. Redeploy after
changing them. `.env.local.example` lists every variable with a note.

---

## 0. Before anything else

- [ ] **Rotate the Supabase `service_role` key** (it passed through a chat during
  setup): Supabase → Project Settings → API Keys → roll. Put the new one in Vercel
  and `.env.local`.
- [ ] **Change your admin password** (also exposed in chat): Admin → Settings →
  Team → your row → *Password link*, then open the link.
- [x] **Vercel plan.** The project is on Hobby, which allows one run per day per
  cron, so `vercel.json` runs all three once a day (tracking 05:00, n8n event
  drain 05:15, abandoned-checkout reminders 05:45 UTC). Orders still reach n8n
  within seconds; only retries wait for the daily run, and reminders go out 1–25 h
  after the checkout instead of about an hour. On Pro, the drain and reminders can
  go back to hourly (`15 * * * *`, `45 * * * *`) and tracking to `0 5,13 * * *`.
- [ ] Set `NEXT_PUBLIC_SITE_URL=https://aalmaram.com` and a long random
  `CRON_SECRET` in Vercel.

## 1. Supabase

- [ ] All migrations are applied to `xxjzoznruxknqnctgncw` (they are, as of the
  P8 commit — `npx supabase migration list` shows none pending).
- [ ] Auth → URL Configuration → **Site URL** `https://aalmaram.com`; add
  `https://aalmaram.com/admin/accept-invite` to Redirect URLs.
- [ ] Auth → Providers → Email: **signups stay off**.
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` in Vercel.
- [ ] `ADMIN_ALLOWLIST=vishnu@opiamanalytics.com,nivedith@aalmaram.com` for now.

**Worked if** you can sign in at `https://aalmaram.com/admin/login` on the
deployed site.

## 2. Team

- [ ] Nivedith signs in once (their Supabase login exists). They appear in
  Settings → Team; make them **Owner** if they should manage settings.
- [ ] Once everyone who needs access is listed there, **delete
  `ADMIN_ALLOWLIST`** from Vercel — from then on only the Team page decides.

## 3. Resend (email)

- [ ] resend.com → Domains → add `aalmaram.com`, add the DNS records it shows,
  wait for **Verified**.
- [ ] API Keys → create one with *Sending access* → `RESEND_API_KEY` in Vercel.
- [ ] Optional overrides: `EMAIL_FROM_ORDERS`, `ADMIN_NOTIFY_EMAIL`. Otherwise
  Settings → Store is used.

**Worked if** Settings → Integrations shows *Resend: SET*, and an invite from
Settings → Team arrives by email instead of showing a link.

## 4. Razorpay — live

Do this last of the payment steps, once 5–7 are done in test mode if you prefer.

- [ ] Razorpay Dashboard → switch to **Live mode** → Settings → API Keys →
  generate. `RAZORPAY_KEY_ID` (starts `rzp_live_`) and `RAZORPAY_KEY_SECRET` in
  **Vercel Production only**. Keep test keys in `.env.local` and Preview.
- [ ] Live mode → Settings → Webhooks → Add:
  URL `https://aalmaram.com/api/webhooks/razorpay`,
  events **payment.captured** and **order.paid**,
  secret: a new random string → `RAZORPAY_WEBHOOK_SECRET` in Vercel.
- [ ] Payment methods: confirm UPI, cards, netbanking, wallets are enabled; COD off.

**Worked if** Settings → Integrations shows *Using LIVE keys* and the webhook
secret SET.

## 5. Shiprocket

- [ ] Shiprocket → Settings → **API** → Configure → create an API user (a
  different email from your login). `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD` in
  Vercel.
- [ ] Settings → Pickup Addresses: note the **nickname** exactly, and its PIN.
  Enter the nickname in Admin → Settings → Shiprocket; `SHIPROCKET_PICKUP_PINCODE`
  in Vercel.
- [ ] Settings → Webhooks (Tracking): URL `https://aalmaram.com/api/webhooks/shiprocket`,
  token: a new random string → `SHIPROCKET_WEBHOOK_TOKEN` in Vercel.
- [ ] Weigh and measure one packed book; the shipping panel's box defaults
  (400 g, 25 × 20 × 4 cm) are guesses and Shiprocket bills on volumetric weight.

**Worked if** Admin → Settings → *Test the Shiprocket login* says it accepted it.

## 6. Shipping rates

- [ ] Admin → Settings → Shipping: set the real flat rate and free-shipping
  threshold (they are placeholders: ₹60, free over ₹999). Add per-state rates if
  you charge differently for far states.

## 7. n8n

Follow **[`EVENTS.md` → Rewiring the n8n flows](./EVENTS.md#rewiring-the-n8n-flows)**. In short:

- [ ] `N8N_WEBHOOK_SECRET` (long, random) in Vercel.
- [ ] n8n: create the *Aalmaram store token* Header Auth credential with that
  secret; import the four files in `docs/custom-commerce/n8n/`; set their
  credentials and placeholders; **deactivate** the old Shopify-triggered Flows 1,
  2, 2b, 3, 5, 6; activate the new ones.
- [ ] Admin → Settings → Integrations: paste the production webhook URLs for
  `order.paid`, `order.delivered`, `inventory.low`; *Send test* for
  `order.delivered` and `inventory.low` (the `order.paid` test creates a real
  Zoho invoice and NocoDB contact for TEST0000 — send it only if you'll delete
  them).

**Worked if** each test shows an execution in n8n.

## 8. Shopify history

Needs a Shopify Admin API token — the old app credential is dead
(`app_not_installed`).

- [ ] Shopify admin → Settings → Apps → Develop apps → create *Aalmaram export*
  → Admin API scopes: `read_products`, `read_customers`, `read_orders`,
  `read_all_orders`, `read_price_rules`, `read_discounts` → install → copy the
  Admin API access token.
- [ ] In `.env.local` only: `SHOPIFY_STORE_DOMAIN=<store>.myshopify.com`,
  `SHOPIFY_ADMIN_TOKEN=shpat_…`.
- [ ] Dry run and read the summary and warnings:
  ```bash
  npm run migrate:shopify -- --report shopify-import-report.json
  ```
- [ ] Then:
  ```bash
  npm run migrate:shopify -- --apply
  ```
  Imported orders are numbered `SH1001`…, take no stock, and send nothing to n8n
  (Zoho already has them). New products arrive as **drafts**; the book already in
  the store is linked, not overwritten. It is safe to run again on cutover day to
  catch the last orders.
- [ ] Check Admin → Orders (search `SH`), Customers and Analytics look right.
- [ ] **Delete the Shopify app/token and remove both variables from `.env.local`.**

## 9. Clean up test data and number real orders from AAL1001

Test runs consumed order numbers. With no real web orders yet, reset them in
Supabase → SQL Editor:

```sql
do $$
begin
  if exists (select 1 from public.orders where source = 'web') then
    raise exception 'web orders exist — do not reset the order numbers';
  end if;
  perform setval('private.order_number_seq', 1000, true); -- next order is AAL1001
end $$;
```

- [ ] Delete leftover test checkouts (Supabase → Table Editor → `checkouts`,
  status `active`, your own test emails).

## 10. DNS

- [ ] `aalmaram.com` already serves this project.
- [ ] **`store.aalmaram.com`**: in Vercel → Domains, add it to this project; in
  your DNS, replace the Shopify CNAME with the one Vercel shows. The app then
  redirects old Shopify links (product pages keep their handle; collections go to
  /shop; the cart to /checkout).
- [ ] In Shopify, remove `store.aalmaram.com` from Settings → Domains *after* the
  DNS change, then pause or close the Shopify plan.

## 11. The ₹1 live order

With live Razorpay keys deployed:

1. [ ] Admin → Products → new product *Smoke test*, price ₹1, stock **6**, status
   **Active**.
2. [ ] Admin → Discounts → new code, type **Free shipping**, applies to everything,
   total uses 1 (so nobody else can use it).
3. [ ] In a private window, add *Smoke test* to the basket, apply the code,
   check out with your own details and pay ₹1 by UPI.
4. [ ] Check, in order:
   - `/order/confirmed` shows the order; the confirmation email arrives; the
     new-order alert reaches the founder address.
   - Admin → Today shows it under *Waiting to be sent*; Analytics counts it.
   - Settings → Integrations → event queue: `order.paid` **sent**; n8n shows the
     Zoho invoice, the NocoDB contact and interaction.
   - The stock alert fired (stock 6 → 5 reaches the default threshold of 5): `inventory.low`
     sent, alert email arrived.
5. [ ] Open the order → *Refund* ₹1 with restock → Razorpay shows the refund;
   `order.refunded` in the queue; stock back to 6.
6. [ ] Cancel the order. Archive the *Smoke test* product; deactivate the code.

If any step fails, the order's timeline and the event queue say where.

## 12. Go

- [ ] Remove the placeholder `REPLACE with the actual review link` in the n8n
  Flow 3 workflow.
- [ ] Watch Admin → Today for the first real orders; *Needs attention* lists
  anything stuck (refunds, failed events).

## After launch

- Open questions still worth an answer (PROGRESS.md → Open items): an email to
  the buyer when a parcel comes back (RTO), and the real parcel weight.
- `ADMIN_ALLOWLIST` gone, Shopify token gone, test keys only in `.env.local` and
  Preview.
