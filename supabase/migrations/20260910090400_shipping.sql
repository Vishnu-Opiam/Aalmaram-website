-- Shipments (Shiprocket). One order can be shipped more than once if it is
-- ever split, so this is a child table rather than columns on orders.

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  provider text not null default 'shiprocket',
  shiprocket_order_id text,
  shiprocket_shipment_id text,
  awb_code text,
  courier_name text,
  label_url text,
  manifest_url text,
  status text not null default 'pending',
  tracking_url text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipments_provider_check check (provider in ('shiprocket')),
  constraint shipments_status_check check (
    status in ('pending', 'awb_assigned', 'pickup_scheduled', 'in_transit', 'delivered', 'rto', 'cancelled')
  )
);

create index shipments_order_id_idx on public.shipments (order_id);
create index shipments_status_idx on public.shipments (status, created_at desc);
-- The Shiprocket webhook arrives keyed on the AWB and nothing else.
create unique index shipments_awb_code_key on public.shipments (awb_code) where awb_code is not null;

create trigger shipments_set_updated_at
  before update on public.shipments
  for each row execute function private.set_updated_at();
