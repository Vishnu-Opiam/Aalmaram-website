-- Orders and everything hanging off them. An orders row exists only after a
-- Razorpay signature has verified, so there is no such thing as a draft order.

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default private.next_order_number(),
  email text not null,
  phone text,
  customer_id uuid references public.customers (id) on delete set null,
  payment_status text not null default 'pending',
  fulfillment_status text not null default 'unfulfilled',
  order_status text not null default 'open',
  currency text not null default 'INR',
  subtotal_paise integer not null default 0,
  discount_paise integer not null default 0,
  shipping_paise integer not null default 0,
  tax_paise integer not null default 0,
  total_paise integer not null default 0,
  refunded_paise integer not null default 0,
  discount_code text,
  shipping_address jsonb not null default '{}'::jsonb,
  billing_address jsonb,
  razorpay_order_id text unique,
  razorpay_payment_id text,
  razorpay_signature text,
  notes text not null default '',
  cancel_reason text,
  placed_at timestamptz,
  source text not null default 'web',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_payment_status_check check (
    payment_status in ('pending', 'paid', 'failed', 'refunded', 'partially_refunded')
  ),
  constraint orders_fulfillment_status_check check (
    fulfillment_status in ('unfulfilled', 'fulfilled', 'cancelled', 'returned')
  ),
  constraint orders_order_status_check check (order_status in ('open', 'archived', 'cancelled')),
  constraint orders_currency_check check (currency = 'INR'),
  constraint orders_source_check check (source in ('web', 'shopify-import')),
  constraint orders_money_check check (
    subtotal_paise >= 0 and discount_paise >= 0 and shipping_paise >= 0
    and tax_paise >= 0 and total_paise >= 0
    and refunded_paise >= 0 and refunded_paise <= total_paise
  )
);

comment on column public.orders.razorpay_order_id is 'Unique — the idempotency key. The browser callback and the webhook race to create the same order; the unique index decides.';
comment on column public.orders.refunded_paise is 'Running total of refunds, so partially_refunded is a fact rather than a label.';

create index orders_created_at_idx on public.orders (created_at desc);
create index orders_email_idx on public.orders (email);
create index orders_customer_id_idx on public.orders (customer_id);
create index orders_payment_status_idx on public.orders (payment_status, created_at desc);
create index orders_fulfillment_status_idx on public.orders (fulfillment_status, created_at desc);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function private.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  variant_id uuid references public.product_variants (id) on delete set null,
  title text not null,
  variant_title text not null default '',
  sku text,
  unit_price_paise integer not null,
  quantity integer not null,
  total_paise integer not null,
  weight_grams integer not null default 0,
  created_at timestamptz not null default now(),
  constraint order_items_quantity_check check (quantity > 0),
  constraint order_items_money_check check (
    unit_price_paise >= 0 and total_paise >= 0 and weight_grams >= 0
  )
);

comment on table public.order_items is 'Title, sku and price are snapshots. Editing a product later must never rewrite history.';

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);
create index order_items_variant_id_idx on public.order_items (variant_id);

-- The authoritative cart snapshot, written before Razorpay is called.
create table public.checkouts (
  id uuid primary key default gen_random_uuid(),
  email text,
  line_items jsonb not null default '[]'::jsonb,
  discount_code text,
  subtotal_paise integer not null default 0,
  discount_paise integer not null default 0,
  shipping_paise integer not null default 0,
  tax_paise integer not null default 0,
  total_paise integer not null default 0,
  shipping_address jsonb,
  razorpay_order_id text unique,
  status text not null default 'active',
  completed_order_id uuid references public.orders (id) on delete set null,
  recovery_email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checkouts_status_check check (status in ('active', 'completed', 'abandoned')),
  constraint checkouts_money_check check (
    subtotal_paise >= 0 and discount_paise >= 0 and shipping_paise >= 0
    and tax_paise >= 0 and total_paise >= 0
  )
);

create index checkouts_status_idx on public.checkouts (status, created_at desc);
create index checkouts_completed_order_id_idx on public.checkouts (completed_order_id);

create trigger checkouts_set_updated_at
  before update on public.checkouts
  for each row execute function private.set_updated_at();

create table public.discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  discount_id uuid not null references public.discounts (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  customer_email extensions.citext not null,
  amount_paise integer not null,
  created_at timestamptz not null default now(),
  constraint discount_redemptions_amount_check check (amount_paise >= 0),
  constraint discount_redemptions_once_per_order unique (discount_id, order_id)
);

-- Per-customer usage limits are answered straight off this index.
create index discount_redemptions_customer_idx on public.discount_redemptions (discount_id, customer_email);
create index discount_redemptions_order_id_idx on public.discount_redemptions (order_id);

create table public.inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  delta integer not null,
  reason text not null,
  order_id uuid references public.orders (id) on delete set null,
  note text not null default '',
  created_by text not null default 'system',
  created_at timestamptz not null default now(),
  constraint inventory_adjustments_reason_check check (
    reason in ('order', 'restock', 'manual', 'cancellation', 'refund', 'import')
  ),
  constraint inventory_adjustments_delta_check check (delta <> 0)
);

create index inventory_adjustments_variant_id_idx on public.inventory_adjustments (variant_id, created_at desc);
create index inventory_adjustments_order_id_idx on public.inventory_adjustments (order_id);
