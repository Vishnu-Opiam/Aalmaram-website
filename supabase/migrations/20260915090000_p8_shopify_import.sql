-- P8: importing history from Shopify.
--
-- Every imported row remembers its Shopify id, so the import can be run again —
-- after a partial failure, or once more on cutover day for the last orders —
-- without creating anything twice.

alter table public.products add column shopify_id bigint;
alter table public.customers add column shopify_id bigint;
alter table public.orders add column shopify_id bigint;
alter table public.discounts add column shopify_id bigint;

create unique index products_shopify_id_key on public.products (shopify_id) where shopify_id is not null;
create unique index customers_shopify_id_key on public.customers (shopify_id) where shopify_id is not null;
create unique index orders_shopify_id_key on public.orders (shopify_id) where shopify_id is not null;
create unique index discounts_shopify_id_key on public.discounts (shopify_id) where shopify_id is not null;

comment on column public.orders.shopify_id is 'Set only on orders imported from Shopify (source = shopify-import).';

-- One historical order and its items, in one transaction, idempotently.
--
-- Deliberately *not* create_order_from_checkout: an order from last year must
-- not take stock off the shelf today, must not count against a discount's
-- limits, and above all must not queue order.paid — n8n would raise a second
-- Zoho invoice for a sale Shopify already invoiced. So this writes the order and
-- its items and nothing else. Customer totals are recomputed separately, once,
-- after the whole import (recompute_customer_totals).
create or replace function public.import_shopify_order(p_order jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shopify_id bigint := (p_order ->> 'shopify_id')::bigint;
  v_existing public.orders;
  v_order public.orders;
  v_item jsonb;
begin
  if v_shopify_id is null then
    raise exception 'shopify_id is required' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'an order needs at least one line item' using errcode = '22023';
  end if;

  select * into v_existing from public.orders where shopify_id = v_shopify_id;
  if found then
    return jsonb_build_object('order_id', v_existing.id, 'order_number', v_existing.order_number, 'already_existed', true);
  end if;

  insert into public.orders (
    order_number, email, phone, customer_id, payment_status, fulfillment_status, order_status,
    currency, subtotal_paise, discount_paise, shipping_paise, tax_paise, total_paise, refunded_paise,
    discount_code, shipping_address, billing_address, notes, cancel_reason, placed_at, created_at,
    source, shopify_id
  )
  values (
    p_order ->> 'order_number',
    p_order ->> 'email',
    nullif(p_order ->> 'phone', ''),
    (select c.id from public.customers c where c.email = (p_order ->> 'email')::extensions.citext),
    p_order ->> 'payment_status',
    p_order ->> 'fulfillment_status',
    p_order ->> 'order_status',
    'INR',
    (p_order ->> 'subtotal_paise')::integer,
    (p_order ->> 'discount_paise')::integer,
    (p_order ->> 'shipping_paise')::integer,
    (p_order ->> 'tax_paise')::integer,
    (p_order ->> 'total_paise')::integer,
    (p_order ->> 'refunded_paise')::integer,
    nullif(p_order ->> 'discount_code', ''),
    coalesce(p_order -> 'shipping_address', '{}'::jsonb),
    p_order -> 'billing_address',
    coalesce(p_order ->> 'notes', ''),
    nullif(p_order ->> 'cancel_reason', ''),
    (p_order ->> 'placed_at')::timestamptz,
    (p_order ->> 'created_at')::timestamptz,
    'shopify-import',
    v_shopify_id
  )
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.order_items (
      order_id, product_id, variant_id, title, variant_title, sku,
      unit_price_paise, quantity, total_paise, weight_grams
    )
    values (
      v_order.id,
      (select v.product_id from public.product_variants v where v.id = nullif(v_item ->> 'variant_id', '')::uuid),
      (select v.id from public.product_variants v where v.id = nullif(v_item ->> 'variant_id', '')::uuid),
      v_item ->> 'title',
      coalesce(v_item ->> 'variant_title', ''),
      nullif(v_item ->> 'sku', ''),
      (v_item ->> 'unit_price_paise')::integer,
      (v_item ->> 'quantity')::integer,
      (v_item ->> 'total_paise')::integer,
      coalesce((v_item ->> 'weight_grams')::integer, 0)
    );
  end loop;

  return jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'already_existed', false);
end;
$$;

-- Sets each customer's order count and spend from the orders on record, the
-- same way the order and refund functions keep them: cancelled orders don't
-- count, refunds come off the spend.
create or replace function public.recompute_customer_totals(p_emails text[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with totals as (
    select c.id,
           count(o.id) filter (where o.order_status <> 'cancelled' and o.payment_status <> 'failed') as orders,
           coalesce(sum(o.total_paise - o.refunded_paise) filter (where o.payment_status <> 'failed'), 0) as spent
    from public.customers c
    left join public.orders o on o.customer_id = c.id
    where c.email = any (p_emails::extensions.citext[])
    group by c.id
  ),
  updated as (
    update public.customers c
    set total_orders = t.orders, total_spent_paise = greatest(t.spent, 0)
    from totals t
    where c.id = t.id
    returning 1
  )
  select count(*)::integer from updated;
$$;

revoke execute on function public.import_shopify_order(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.recompute_customer_totals(text[]) from public, anon, authenticated;
grant execute on function public.import_shopify_order(jsonb, jsonb) to service_role;
grant execute on function public.recompute_customer_totals(text[]) to service_role;
