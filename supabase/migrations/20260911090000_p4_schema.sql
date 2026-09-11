-- P4 schema: refunds, restock tracking, marketing consent.

-- ── Refunds ─────────────────────────────────────────────────────────────────
--
-- One row per attempt to send money back. The Razorpay call cannot sit inside
-- a Postgres transaction, so a refund is two-phase:
--
--   pending    begin_refund() has reserved the amount against the order
--   processed  Razorpay accepted it and complete_refund() moved the money,
--              the stock and the statuses together
--   failed     Razorpay refused it, and the reservation is released
--
-- A row stuck in pending means the process died between the two phases; the
-- admin reconciles it against Razorpay rather than guessing.
--
-- out_of_stock refunds belong to a checkout, not an order: they exist because
-- a payment was captured for stock that had gone by the time the order RPC ran,
-- so no order was ever created.
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  order_id uuid references public.orders (id) on delete restrict,
  checkout_id uuid references public.checkouts (id) on delete restrict,
  amount_paise integer not null,
  status text not null default 'pending',
  razorpay_payment_id text not null,
  razorpay_refund_id text unique,
  restock jsonb not null default '[]'::jsonb,
  reason text not null default '',
  error text,
  created_by text not null default 'system',
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint refunds_kind_check check (kind in ('refund', 'cancel', 'out_of_stock')),
  constraint refunds_status_check check (status in ('pending', 'processed', 'failed')),
  constraint refunds_amount_check check (amount_paise > 0),
  constraint refunds_owner_check check (
    (kind = 'out_of_stock' and checkout_id is not null and order_id is null)
    or (kind <> 'out_of_stock' and order_id is not null and checkout_id is null)
  ),
  constraint refunds_restock_is_array check (jsonb_typeof(restock) = 'array')
);

comment on column public.refunds.restock is '[{order_item_id, quantity}] to put back on the shelf when the refund completes.';
comment on column public.refunds.razorpay_refund_id is 'Unique, so the same Razorpay refund can never be applied to our books twice.';

create index refunds_order_id_idx on public.refunds (order_id);

-- At most one out-of-stock refund per checkout: the webhook retries, and the
-- browser callback can record the same failure first. This index is what makes
-- the second attempt a no-op rather than a second refund.
create unique index refunds_one_out_of_stock_per_checkout
  on public.refunds (checkout_id)
  where kind = 'out_of_stock';

-- The admin home asks "what is still in flight?" on every load.
create index refunds_open_idx on public.refunds (created_at desc)
  where status <> 'processed';

create trigger refunds_set_updated_at
  before update on public.refunds
  for each row execute function private.set_updated_at();

alter table public.refunds enable row level security;
revoke all on public.refunds from anon, authenticated;
grant all on public.refunds to service_role;

-- ── Restock tracking ────────────────────────────────────────────────────────
-- Several partial refunds can each restock some copies; this stops the total
-- ever exceeding what was sold.
alter table public.order_items
  add column restocked_quantity integer not null default 0,
  add constraint order_items_restocked_check
    check (restocked_quantity >= 0 and restocked_quantity <= quantity);

-- ── Checkouts ───────────────────────────────────────────────────────────────
alter table public.checkouts
  add column accepts_marketing boolean not null default false;

comment on column public.checkouts.accepts_marketing is 'The buyer ticked the opt-in box. Unticked by default: DPDP needs an active yes.';

-- refunded: a payment was captured, the stock had gone, and the money went back.
alter table public.checkouts drop constraint checkouts_status_check;
alter table public.checkouts
  add constraint checkouts_status_check
    check (status in ('active', 'completed', 'abandoned', 'refunded'));

-- ── Customers ───────────────────────────────────────────────────────────────
alter table public.customers
  add column marketing_consent_at timestamptz;

comment on column public.customers.marketing_consent_at is 'When the current yes was given. Null while accepts_marketing is false.';

-- ── Outbox lookup by order ──────────────────────────────────────────────────
-- The order timeline reads the outbox by payload->>order_id.
create index webhook_outbox_order_id_idx on public.webhook_outbox ((payload ->> 'order_id'));
