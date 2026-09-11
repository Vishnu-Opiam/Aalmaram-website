-- Today's and this week's orders for the admin home.
--
-- Days and weeks are Indian ones. now() is converted to Kolkata wall-clock
-- time, truncated (date_trunc('week') starts on Monday), and converted back to
-- an instant — so "today" begins at midnight IST, not 05:30 IST as it would if
-- it were bucketed in UTC.
--
-- Revenue is shown gross and net of refunds. An order counts in the period in
-- which it was paid (placed_at), even if refunded later.

create or replace function public.admin_sales_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    select
      date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata' as today_start,
      date_trunc('week', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata' as week_start
  ),
  periods as (
    select 'today' as period, today_start as starts_at from bounds
    union all
    select 'week', week_start from bounds
  )
  select jsonb_object_agg(
    p.period,
    jsonb_build_object(
      'starts_at', p.starts_at,
      'orders', (select count(*) from public.orders o where o.placed_at >= p.starts_at),
      'gross_paise', (
        select coalesce(sum(o.total_paise), 0) from public.orders o where o.placed_at >= p.starts_at
      ),
      'refunded_paise', (
        select coalesce(sum(o.refunded_paise), 0) from public.orders o where o.placed_at >= p.starts_at
      )
    )
  )
  from periods p;
$$;

revoke execute on function public.admin_sales_summary() from public, anon, authenticated;
grant execute on function public.admin_sales_summary() to service_role;

-- placed_at is what the summary (and P7's analytics) filter on.
create index if not exists orders_placed_at_idx on public.orders (placed_at desc);
