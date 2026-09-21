-- Product editor: the fields a Shopify product page has that ours lacked, and
-- an unguessable link so an order confirmation email can open the order.

alter table public.products
  add column product_type text not null default '',
  add column vendor text not null default '';

alter table public.product_variants
  add column cost_paise integer,
  add column barcode text,
  add constraint product_variants_cost_check check (cost_paise is null or cost_paise >= 0);

comment on column public.product_variants.cost_paise is 'What one unit cost the store, in paise. Admin only, never shown to buyers.';

-- Cost is the store's margin, so the storefront's anon read loses it: swap the
-- table-wide grant for one that names every other column.
revoke select on public.product_variants from anon, authenticated;
grant select (
  id, product_id, title, sku, barcode, price_paise, compare_at_paise, inventory_quantity,
  weight_grams, length_cm, breadth_cm, height_cm, position, created_at, updated_at
) on public.product_variants to anon, authenticated;

-- The order email links to /order/view/<token>. Order numbers run in sequence,
-- so the link is keyed on a random uuid instead.
alter table public.orders
  add column view_token uuid not null default gen_random_uuid();

create unique index orders_view_token_key on public.orders (view_token);
