-- Customers (no login — a record built from orders) and discount codes.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  email extensions.citext not null unique,
  phone text,
  first_name text not null default '',
  last_name text not null default '',
  accepts_marketing boolean not null default false,
  notes text not null default '',
  total_orders integer not null default 0,
  total_spent_paise bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_totals_check check (total_orders >= 0 and total_spent_paise >= 0)
);

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function private.set_updated_at();

create table public.discounts (
  id uuid primary key default gen_random_uuid(),
  code extensions.citext not null unique,
  title text not null default '',
  type text not null,
  value numeric(12, 2) not null,
  applies_to text not null default 'all',
  product_ids uuid[],
  tag text,
  min_subtotal_paise integer,
  usage_limit integer,
  usage_limit_per_customer integer,
  once_per_customer boolean not null default false,
  combinable boolean not null default false,
  used_count integer not null default 0,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discounts_type_check check (type in ('percentage', 'fixed_amount', 'free_shipping')),
  constraint discounts_applies_to_check check (applies_to in ('all', 'products', 'tag')),
  constraint discounts_value_check check (value >= 0),
  -- A percentage discount outside 0–100 is always a data-entry mistake.
  constraint discounts_percentage_range_check check (
    type <> 'percentage' or (value > 0 and value <= 100)
  ),
  constraint discounts_scope_check check (
    (applies_to = 'products' and product_ids is not null and cardinality(product_ids) > 0 and tag is null)
    or (applies_to = 'tag' and tag is not null and product_ids is null)
    or (applies_to = 'all' and product_ids is null and tag is null)
  ),
  constraint discounts_window_check check (ends_at is null or ends_at > starts_at),
  constraint discounts_limits_check check (
    (usage_limit is null or usage_limit > 0)
    and (usage_limit_per_customer is null or usage_limit_per_customer > 0)
    and (min_subtotal_paise is null or min_subtotal_paise >= 0)
    and used_count >= 0
  )
);

comment on column public.discounts.value is 'Percent (0–100) for percentage, integer paise for fixed_amount, ignored for free_shipping.';
comment on column public.discounts.code is 'citext, so NAGMA15 and nagma15 are the same code. The app normalises to uppercase on write.';

-- Every checkout looks a code up by its live window.
create index discounts_active_idx on public.discounts (active, starts_at, ends_at);

create trigger discounts_set_updated_at
  before update on public.discounts
  for each row execute function private.set_updated_at();
