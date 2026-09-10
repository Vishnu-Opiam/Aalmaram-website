-- Row Level Security.
--
-- The rule for this store is simple: the browser may read active products,
-- published events and a whitelisted subset of settings. Everything else —
-- orders, customers, discounts, shipments, the outbox — is service-role only,
-- and the service-role key never leaves the server.

-- Supabase's default privileges hand anon/authenticated full DML on every new
-- table in public. Take it all back, then grant the few reads we want.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- Same for anything a later migration adds: opt in, never opt out.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

grant select on public.products to anon, authenticated;
grant select on public.product_variants to anon, authenticated;
grant select on public.product_images to anon, authenticated;
grant select on public.events to anon, authenticated;
grant select on public.settings to anon, authenticated;

alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images enable row level security;
alter table public.customers enable row level security;
alter table public.discounts enable row level security;
alter table public.discount_redemptions enable row level security;
alter table public.checkouts enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.inventory_adjustments enable row level security;
alter table public.shipments enable row level security;
alter table public.webhook_outbox enable row level security;
alter table public.events enable row level security;
alter table public.settings enable row level security;
alter table public.admin_users enable row level security;
alter table public.audit_log enable row level security;
alter table public.rate_limits enable row level security;

-- ── Public reads ──────────────────────────────────────────────────────────

create policy products_public_read on public.products
  for select to anon, authenticated
  using (status = 'active');

create policy product_variants_public_read on public.product_variants
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_variants.product_id and p.status = 'active'
    )
  );

create policy product_images_public_read on public.product_images
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_images.product_id and p.status = 'active'
    )
  );

create policy events_public_read on public.events
  for select to anon, authenticated
  using (published);

create policy settings_public_read on public.settings
  for select to anon, authenticated
  using (is_public);

-- Every other table has RLS on and no policy at all, which denies anon and
-- authenticated by default. service_role has BYPASSRLS and is unaffected.
