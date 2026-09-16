-- Store analytics: the admin dashboard (P7) and the n8n weekly digest.
--
-- One function, one round trip, one definition of "revenue". The window is p_days
-- Indian calendar days ending today (so 7 = today and the six days before it),
-- compared against the p_days immediately before that.
--
-- Definitions
--   orders          paid orders by placed_at, including ones later refunded or
--                   cancelled — the sale happened; the refund is counted separately
--   gross           sum of order totals (items − discount + shipping)
--   refunded        refunds *processed* in the window, whichever order they
--                   belong to, so a refund lands in the week the money went back
--   net             gross − refunded
--   aov             gross / orders
--   units           copies sold on those orders, less copies restocked from them
--   conversion      checkouts that became orders / checkouts created, where a
--                   checkout exists only once the buyer pressed Pay

create or replace function public.store_analytics(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_start_date date;
  v_start timestamptz;
  v_prev_start timestamptz;
  v_threshold integer;
  v_result jsonb;
begin
  if p_days is null or p_days < 1 or p_days > 366 then
    raise exception 'days must be between 1 and 366' using errcode = '22023';
  end if;

  v_start_date := v_today - (p_days - 1);
  v_start := v_start_date::timestamp at time zone 'Asia/Kolkata';
  v_prev_start := (v_start_date - p_days)::timestamp at time zone 'Asia/Kolkata';

  select coalesce((value ->> 'low_stock_threshold')::integer, 5)
  into v_threshold
  from public.settings where key = 'inventory';
  v_threshold := coalesce(v_threshold, 5);

  with
  paid_orders as (
    select o.id, o.placed_at, o.total_paise, o.discount_paise, o.shipping_paise, o.discount_code,
           o.email, o.order_status,
           (o.placed_at at time zone 'Asia/Kolkata')::date as day
    from public.orders o
    where o.placed_at >= v_prev_start
      and o.payment_status in ('paid', 'partially_refunded', 'refunded')
  ),
  processed_refunds as (
    select r.amount_paise, r.processed_at,
           (r.processed_at at time zone 'Asia/Kolkata')::date as day
    from public.refunds r
    where r.status = 'processed'
      and r.order_id is not null
      and r.processed_at >= v_prev_start
  ),
  totals as (
    select
      period,
      count(*) filter (where o.id is not null) as orders,
      coalesce(sum(o.total_paise), 0) as gross_paise
    from (values ('current'), ('previous')) as p(period)
    left join paid_orders o
      on (p.period = 'current' and o.placed_at >= v_start)
      or (p.period = 'previous' and o.placed_at < v_start)
    group by period
  ),
  refund_totals as (
    select
      coalesce(sum(amount_paise) filter (where processed_at >= v_start), 0) as current_paise,
      coalesce(sum(amount_paise) filter (where processed_at < v_start), 0) as previous_paise
    from processed_refunds
  ),
  units as (
    select
      coalesce(sum(oi.quantity - oi.restocked_quantity) filter (where o.placed_at >= v_start), 0) as current_units,
      coalesce(sum(oi.quantity - oi.restocked_quantity) filter (where o.placed_at < v_start), 0) as previous_units
    from paid_orders o
    join public.order_items oi on oi.order_id = o.id
  ),
  checkout_counts as (
    select
      count(*) filter (where c.created_at >= v_start) as current_started,
      count(*) filter (where c.created_at >= v_start and c.status = 'completed') as current_completed,
      count(*) filter (where c.created_at < v_start) as previous_started,
      count(*) filter (where c.created_at < v_start and c.status = 'completed') as previous_completed
    from public.checkouts c
    where c.created_at >= v_prev_start
  ),
  days as (
    select d::date as day
    from generate_series(v_start_date, v_today, interval '1 day') as d
  ),
  daily as (
    select
      d.day,
      (select count(*) from paid_orders o where o.day = d.day) as orders,
      (select coalesce(sum(o.total_paise), 0) from paid_orders o where o.day = d.day) as gross_paise,
      (select coalesce(sum(r.amount_paise), 0) from processed_refunds r where r.day = d.day) as refunded_paise
    from days d
  ),
  top_products as (
    select
      coalesce(oi.product_id::text, oi.title) as key,
      max(oi.title) as title,
      sum(oi.quantity - oi.restocked_quantity) as units,
      sum(oi.total_paise) as revenue_paise,
      count(distinct o.id) as orders
    from paid_orders o
    join public.order_items oi on oi.order_id = o.id
    where o.placed_at >= v_start
    group by 1
    order by units desc, revenue_paise desc
    limit 5
  ),
  discount_usage as (
    select
      o.discount_code as code,
      max(d.type) as type,
      count(*) as orders,
      coalesce(sum(o.discount_paise), 0) as discount_paise,
      coalesce(sum(o.total_paise), 0) as revenue_paise
    from paid_orders o
    left join public.discounts d on d.code = o.discount_code
    where o.placed_at >= v_start
      and o.discount_code is not null
    group by o.discount_code
    order by orders desc, revenue_paise desc
    limit 10
  ),
  low_stock as (
    select p.id as product_id, p.title as product_title, v.id as variant_id, v.title as variant_title,
           v.sku, v.inventory_quantity as available
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where p.status = 'active'
      and v.inventory_quantity <= v_threshold
    order by v.inventory_quantity, p.title
  )
  select jsonb_build_object(
    'days', p_days,
    'from', v_start_date,
    'to', v_today,
    'starts_at', v_start,
    'low_stock_threshold', v_threshold,
    'current', jsonb_build_object(
      'orders', (select orders from totals where period = 'current'),
      'gross_paise', (select gross_paise from totals where period = 'current'),
      'refunded_paise', (select current_paise from refund_totals),
      'units', (select current_units from units),
      'checkouts_started', (select current_started from checkout_counts),
      'checkouts_completed', (select current_completed from checkout_counts)
    ),
    'previous', jsonb_build_object(
      'orders', (select orders from totals where period = 'previous'),
      'gross_paise', (select gross_paise from totals where period = 'previous'),
      'refunded_paise', (select previous_paise from refund_totals),
      'units', (select previous_units from units),
      'checkouts_started', (select previous_started from checkout_counts),
      'checkouts_completed', (select previous_completed from checkout_counts)
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', day, 'orders', orders, 'gross_paise', gross_paise,
        'refunded_paise', refunded_paise, 'net_paise', gross_paise - refunded_paise
      ) order by day), '[]'::jsonb)
      from daily
    ),
    'top_products', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'title', title, 'units', units, 'revenue_paise', revenue_paise, 'orders', orders
      ) order by units desc, revenue_paise desc), '[]'::jsonb)
      from top_products
    ),
    'discounts', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'code', code, 'type', type, 'orders', orders,
        'discount_paise', discount_paise, 'revenue_paise', revenue_paise
      ) order by orders desc, revenue_paise desc), '[]'::jsonb)
      from discount_usage
    ),
    'low_stock', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'product_id', product_id, 'variant_id', variant_id,
        'title', product_title || case when variant_title <> 'Default' then ' — ' || variant_title else '' end,
        'sku', sku, 'available', available
      )), '[]'::jsonb)
      from low_stock
    )
  )
  into v_result;

  return v_result;
end;
$$;

comment on function public.store_analytics(integer) is 'Dashboard and digest metrics over the last p_days Indian days. Service role only.';

revoke execute on function public.store_analytics(integer) from public, anon, authenticated;
grant execute on function public.store_analytics(integer) to service_role;

-- Refunds are bucketed by when the money went back.
create index if not exists refunds_processed_at_idx on public.refunds (processed_at)
  where status = 'processed';

-- Conversion counts checkouts by creation time.
create index if not exists checkouts_created_at_idx on public.checkouts (created_at);
