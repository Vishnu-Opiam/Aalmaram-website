-- Catalogue: products, their variants, and their images.

create table public.products (
  id uuid primary key default gen_random_uuid(),
  handle extensions.citext not null unique,
  title text not null,
  subtitle text not null default '',
  description_md text not null default '',
  status text not null default 'draft',
  tags text[] not null default '{}',
  hsn_code text not null default '4901',
  requires_shipping boolean not null default true,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_status_check check (status in ('draft', 'active', 'archived')),
  constraint products_handle_slug_check check (handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint products_title_not_blank check (length(btrim(title)) > 0)
);

comment on table public.products is 'Storefront catalogue. Only status = active is readable by anon.';

create index products_status_idx on public.products (status);
create index products_tags_idx on public.products using gin (tags);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function private.set_updated_at();

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  title text not null default 'Default',
  sku text,
  price_paise integer not null,
  compare_at_paise integer,
  inventory_quantity integer not null default 0,
  weight_grams integer not null default 0,
  length_cm numeric(6, 2) not null default 0,
  breadth_cm numeric(6, 2) not null default 0,
  height_cm numeric(6, 2) not null default 0,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variants_price_check check (price_paise >= 0),
  constraint product_variants_compare_at_check check (compare_at_paise is null or compare_at_paise >= 0),
  constraint product_variants_inventory_check check (inventory_quantity >= 0),
  constraint product_variants_weight_check check (weight_grams >= 0),
  constraint product_variants_dims_check check (length_cm >= 0 and breadth_cm >= 0 and height_cm >= 0)
);

comment on column public.product_variants.price_paise is 'Integer paise. Never a float, never rupees.';
comment on column public.product_variants.inventory_quantity is 'Single-location stock. Guarded against going negative by the check constraint and the order RPC.';

-- Foreign keys are not indexed automatically; this one carries every PDP read
-- and every ON DELETE CASCADE.
create index product_variants_product_id_idx on public.product_variants (product_id, position);
create unique index product_variants_sku_key on public.product_variants (sku) where sku is not null;

create trigger product_variants_set_updated_at
  before update on public.product_variants
  for each row execute function private.set_updated_at();

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  url text not null,
  alt text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index product_images_product_id_idx on public.product_images (product_id, position);
