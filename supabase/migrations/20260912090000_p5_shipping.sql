-- P5: shipping.
--
-- Shiprocket is an outside system, so the same rule as refunds applies: our
-- side of a shipment — the shipment row, the order's fulfilment status, the
-- n8n outbox row and the audit trail — moves in one transaction, and every
-- function here is safe to call twice. Shiprocket's webhook retries, arrives
-- out of order, and repeats itself; none of that may double-stamp a date or
-- enqueue a second `order.shipped`.
--
-- Error codes, as in P4:
--   P0002  the thing named does not exist
--   22023  the request itself is wrong
--   55000  the shipment or order is in the wrong state for this

-- ── Shipment columns the flow needs ─────────────────────────────────────────

alter table public.shipments
  add column if not exists shiprocket_status text,
  add column if not exists status_detail text not null default '',
  add column if not exists last_status_at timestamptz,
  add column if not exists pickup_scheduled_at timestamptz,
  add column if not exists pickup_token_number text,
  add column if not exists expected_delivery_date date,
  add column if not exists cancelled_at timestamptz;

comment on column public.shipments.shiprocket_status is 'Shiprocket''s own wording for the status, kept because ours is a deliberate simplification of theirs.';
comment on column public.shipments.last_status_at is 'When the event we last applied happened at Shiprocket — not when we heard about it. This is what makes an out-of-order webhook detectable.';

-- Shiprocket's vocabulary is wider than the seven statuses P1 guessed at. We
-- keep a small canonical set and map theirs onto it; `raw` keeps everything.
alter table public.shipments drop constraint if exists shipments_status_check;
alter table public.shipments add constraint shipments_status_check check (
  status in (
    'pending', 'awb_assigned', 'pickup_scheduled', 'in_transit', 'out_for_delivery',
    'undelivered', 'delivered', 'rto', 'rto_initiated', 'rto_delivered', 'lost', 'cancelled'
  )
);

-- An order has at most one live shipment. A cancelled one may be replaced.
create unique index if not exists shipments_one_live_per_order
  on public.shipments (order_id)
  where status <> 'cancelled';

create index if not exists shipments_last_status_at_idx
  on public.shipments (last_status_at desc nulls last);

-- ── Helpers ─────────────────────────────────────────────────────────────────

-- Once a shipment reaches one of these, a later event claiming something
-- earlier is noise. 'lost' can still follow anything.
create or replace function private.shipment_is_terminal(p_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('delivered', 'rto_delivered', 'lost', 'cancelled');
$$;

-- The statuses that mean the parcel has left us and can be tracked.
create or replace function private.shipment_has_shipped(p_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in (
    'in_transit', 'out_for_delivery', 'undelivered', 'delivered',
    'rto', 'rto_initiated', 'rto_delivered', 'lost'
  );
$$;

revoke execute on function private.shipment_is_terminal(text) from public;
revoke execute on function private.shipment_has_shipped(text) from public;

-- ── Shiprocket token cache ──────────────────────────────────────────────────
--
-- A merge, not a write of the whole row: the pickup location lives in the same
-- settings key and must survive a token refresh.
create or replace function public.set_shiprocket_token(
  p_token text,
  p_expires_at timestamptz
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.settings (key, value, is_public)
  values (
    'shiprocket',
    jsonb_build_object('token', p_token, 'token_expires_at', p_expires_at),
    false
  )
  on conflict (key) do update
  set value = public.settings.value
              || jsonb_build_object('token', p_token, 'token_expires_at', p_expires_at),
      updated_at = now();
$$;

-- ── Create the shipment ─────────────────────────────────────────────────────
--
-- Creating the shipment is what makes an order fulfilled. That is earlier than
-- the parcel actually moving, and deliberately so: from this moment the order
-- is committed to Shiprocket, so the P4 admin must stop offering to cancel it
-- or to edit the address it was booked with. Cancelling the shipment puts both
-- back.
create or replace function public.create_shipment(
  p_order_id uuid,
  p_shiprocket_order_id text,
  p_shiprocket_shipment_id text,
  p_raw jsonb default '{}'::jsonb,
  p_actor text default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_existing public.shipments;
  v_shipment public.shipments;
begin
  select * into v_order from public.orders where id = p_order_id for update;

  if not found then
    raise exception 'order % not found', p_order_id using errcode = 'P0002';
  end if;

  if v_order.order_status = 'cancelled' then
    raise exception 'order % is cancelled', v_order.order_number using errcode = '55000';
  end if;

  if v_order.payment_status not in ('paid', 'partially_refunded') then
    raise exception 'order % is %, so it cannot be shipped', v_order.order_number, v_order.payment_status
      using errcode = '55000';
  end if;

  if v_order.fulfillment_status in ('cancelled', 'returned') then
    raise exception 'order % is %, so it cannot be shipped', v_order.order_number, v_order.fulfillment_status
      using errcode = '55000';
  end if;

  if exists (select 1 from public.refunds where order_id = p_order_id and status = 'pending') then
    raise exception 'a refund on % is still in progress; resolve it before shipping', v_order.order_number
      using errcode = '55000';
  end if;

  select * into v_existing
  from public.shipments
  where order_id = p_order_id and status <> 'cancelled';

  if found then
    raise exception 'order % already has a shipment (%)', v_order.order_number, v_existing.status
      using errcode = '55000';
  end if;

  insert into public.shipments (
    order_id, provider, shiprocket_order_id, shiprocket_shipment_id,
    status, last_status_at, raw
  )
  values (
    p_order_id, 'shiprocket', p_shiprocket_order_id, p_shiprocket_shipment_id,
    'pending', now(), coalesce(p_raw, '{}'::jsonb)
  )
  returning * into v_shipment;

  update public.orders
  set fulfillment_status = 'fulfilled'
  where id = p_order_id;

  perform private.write_audit(
    p_actor, 'shipment.create', 'order', p_order_id::text,
    jsonb_build_object(
      'shipment_id', v_shipment.id,
      'shiprocket_order_id', p_shiprocket_order_id,
      'shiprocket_shipment_id', p_shiprocket_shipment_id
    )
  );

  return jsonb_build_object(
    'shipment_id', v_shipment.id,
    'order_number', v_order.order_number,
    'status', v_shipment.status
  );
end;
$$;

-- ── Shipped, once ───────────────────────────────────────────────────────────
--
-- Stamps shipped_at and enqueues order.shipped the first time a shipment
-- becomes trackable, whether that is the AWB being assigned or a webhook
-- arriving first. Returns true only for the call that actually did it, which
-- is what stops a second tracking email.
create or replace function private.mark_shipped(p_shipment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shipment public.shipments;
  v_order public.orders;
begin
  update public.shipments
  set shipped_at = now()
  where id = p_shipment_id and shipped_at is null
  returning * into v_shipment;

  if not found then
    return false;
  end if;

  select * into v_order from public.orders where id = v_shipment.order_id;

  update public.orders
  set fulfillment_status = 'fulfilled'
  where id = v_shipment.order_id
    and fulfillment_status = 'unfulfilled';

  insert into public.webhook_outbox (topic, payload)
  values (
    'order.shipped',
    jsonb_build_object(
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'email', v_order.email,
      'shipment_id', v_shipment.id,
      'awb_code', v_shipment.awb_code,
      'courier_name', v_shipment.courier_name,
      'tracking_url', v_shipment.tracking_url,
      'shipped_at', v_shipment.shipped_at
    )
  );

  return true;
end;
$$;

revoke execute on function private.mark_shipped(uuid) from public;

-- ── Assign the AWB ──────────────────────────────────────────────────────────
--
-- The point at which the buyer has something to track, so this is where the
-- tracking email is triggered from. Calling it again with the same AWB changes
-- nothing and reports no notification.
create or replace function public.assign_shipment_awb(
  p_shipment_id uuid,
  p_awb_code text,
  p_courier_name text,
  p_tracking_url text default null,
  p_label_url text default null,
  p_raw jsonb default '{}'::jsonb,
  p_actor text default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shipment public.shipments;
  v_order public.orders;
  v_notify boolean := false;
begin
  select * into v_shipment from public.shipments where id = p_shipment_id for update;

  if not found then
    raise exception 'shipment % not found', p_shipment_id using errcode = 'P0002';
  end if;

  if coalesce(p_awb_code, '') = '' then
    raise exception 'an AWB is required' using errcode = '22023';
  end if;

  if v_shipment.status = 'cancelled' then
    raise exception 'shipment % is cancelled' , p_shipment_id using errcode = '55000';
  end if;

  if coalesce(v_shipment.awb_code, '') <> '' and v_shipment.awb_code <> p_awb_code then
    raise exception 'shipment % already has AWB %', p_shipment_id, v_shipment.awb_code
      using errcode = '55000';
  end if;

  update public.shipments
  set awb_code = p_awb_code,
      courier_name = coalesce(nullif(p_courier_name, ''), courier_name),
      tracking_url = coalesce(
        nullif(p_tracking_url, ''), tracking_url,
        'https://shiprocket.co/tracking/' || p_awb_code
      ),
      label_url = coalesce(nullif(p_label_url, ''), label_url),
      status = case when status = 'pending' then 'awb_assigned' else status end,
      last_status_at = now(),
      raw = raw || coalesce(p_raw, '{}'::jsonb)
  where id = p_shipment_id
  returning * into v_shipment;

  v_notify := private.mark_shipped(p_shipment_id);

  select * into v_order from public.orders where id = v_shipment.order_id;

  perform private.write_audit(
    p_actor, 'shipment.awb', 'order', v_shipment.order_id::text,
    jsonb_build_object(
      'shipment_id', v_shipment.id,
      'awb_code', p_awb_code,
      'courier_name', v_shipment.courier_name,
      'notified', v_notify
    )
  );

  return jsonb_build_object(
    'shipment_id', v_shipment.id,
    'awb_code', v_shipment.awb_code,
    'courier_name', v_shipment.courier_name,
    'tracking_url', v_shipment.tracking_url,
    'status', v_shipment.status,
    'notify_shipped', v_notify,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'email', v_order.email
  );
end;
$$;

-- ── Pickup ──────────────────────────────────────────────────────────────────
create or replace function public.record_shipment_pickup(
  p_shipment_id uuid,
  p_pickup_token text,
  p_scheduled_at timestamptz default null,
  p_raw jsonb default '{}'::jsonb,
  p_actor text default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shipment public.shipments;
begin
  update public.shipments
  set pickup_token_number = coalesce(nullif(p_pickup_token, ''), pickup_token_number),
      pickup_scheduled_at = coalesce(p_scheduled_at, pickup_scheduled_at, now()),
      status = case when status in ('pending', 'awb_assigned') then 'pickup_scheduled' else status end,
      last_status_at = now(),
      raw = raw || coalesce(p_raw, '{}'::jsonb)
  where id = p_shipment_id and status <> 'cancelled'
  returning * into v_shipment;

  if not found then
    if exists (select 1 from public.shipments where id = p_shipment_id) then
      raise exception 'shipment % is cancelled', p_shipment_id using errcode = '55000';
    end if;
    raise exception 'shipment % not found', p_shipment_id using errcode = 'P0002';
  end if;

  perform private.write_audit(
    p_actor, 'shipment.pickup', 'order', v_shipment.order_id::text,
    jsonb_build_object('shipment_id', v_shipment.id, 'pickup_token', v_shipment.pickup_token_number)
  );

  return jsonb_build_object('shipment_id', v_shipment.id, 'status', v_shipment.status);
end;
$$;

-- ── Status updates (webhook and the tracking cron) ──────────────────────────
--
-- Either identifier will do: the webhook knows the AWB, the cron knows the row.
-- An event is ignored — reported, never raised — when it is older than the one
-- we last applied, when it says what we already believe, or when it would walk
-- a finished shipment backwards. Only a real change stamps a date, enqueues an
-- event or asks for an email.
create or replace function public.update_shipment_status(
  p_shipment_id uuid,
  p_awb_code text,
  p_status text,
  p_remote_status text default '',
  p_detail text default '',
  p_occurred_at timestamptz default null,
  p_raw jsonb default '{}'::jsonb,
  p_actor text default 'shiprocket-webhook'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shipment public.shipments;
  v_order public.orders;
  v_at timestamptz := coalesce(p_occurred_at, now());
  v_notify text := null;
  v_delivered boolean := false;
begin
  if p_status is null or p_status not in (
    'pending', 'awb_assigned', 'pickup_scheduled', 'in_transit', 'out_for_delivery',
    'undelivered', 'delivered', 'rto', 'rto_initiated', 'rto_delivered', 'lost', 'cancelled'
  ) then
    raise exception 'unknown shipment status "%"', coalesce(p_status, '') using errcode = '22023';
  end if;

  if p_shipment_id is not null then
    select * into v_shipment from public.shipments where id = p_shipment_id for update;
  elsif coalesce(p_awb_code, '') <> '' then
    select * into v_shipment from public.shipments where awb_code = p_awb_code for update;
  else
    raise exception 'a shipment id or an AWB is required' using errcode = '22023';
  end if;

  if not found then
    raise exception 'no shipment for %', coalesce(p_shipment_id::text, p_awb_code) using errcode = 'P0002';
  end if;

  -- Out of order. Shiprocket retries, and its retries are not ordered.
  if p_occurred_at is not null and v_shipment.last_status_at is not null
     and p_occurred_at < v_shipment.last_status_at then
    return jsonb_build_object(
      'shipment_id', v_shipment.id, 'applied', false, 'reason', 'stale',
      'status', v_shipment.status
    );
  end if;

  -- Already finished. 'lost' is the one thing that can still happen after.
  if private.shipment_is_terminal(v_shipment.status)
     and p_status <> v_shipment.status and p_status <> 'lost' then
    return jsonb_build_object(
      'shipment_id', v_shipment.id, 'applied', false, 'reason', 'terminal',
      'status', v_shipment.status
    );
  end if;

  -- Nothing new; keep the raw payload and the clock, say so.
  if p_status = v_shipment.status then
    update public.shipments
    set last_status_at = greatest(coalesce(last_status_at, v_at), v_at),
        shiprocket_status = coalesce(nullif(p_remote_status, ''), shiprocket_status),
        raw = raw || coalesce(p_raw, '{}'::jsonb)
    where id = v_shipment.id;

    return jsonb_build_object(
      'shipment_id', v_shipment.id, 'applied', false, 'reason', 'unchanged',
      'status', v_shipment.status
    );
  end if;

  update public.shipments
  set status = p_status,
      shiprocket_status = coalesce(nullif(p_remote_status, ''), shiprocket_status),
      status_detail = left(coalesce(p_detail, ''), 500),
      last_status_at = v_at,
      cancelled_at = case when p_status = 'cancelled' then coalesce(cancelled_at, v_at) else cancelled_at end,
      raw = raw || coalesce(p_raw, '{}'::jsonb)
  where id = v_shipment.id
  returning * into v_shipment;

  if private.shipment_has_shipped(p_status) then
    if private.mark_shipped(v_shipment.id) then
      v_notify := 'shipped';
      select * into v_shipment from public.shipments where id = v_shipment.id;
    end if;
  end if;

  if p_status = 'delivered' and v_shipment.delivered_at is null then
    update public.shipments set delivered_at = v_at where id = v_shipment.id
    returning * into v_shipment;
    v_delivered := true;
  end if;

  select * into v_order from public.orders where id = v_shipment.order_id;

  if v_delivered then
    insert into public.webhook_outbox (topic, payload)
    values (
      'order.delivered',
      jsonb_build_object(
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'email', v_order.email,
        'shipment_id', v_shipment.id,
        'awb_code', v_shipment.awb_code,
        'courier_name', v_shipment.courier_name,
        'delivered_at', v_shipment.delivered_at
      )
    );
    -- The post-purchase sequence in n8n hangs off this; the app sends no
    -- delivery email of its own.
    v_notify := coalesce(v_notify, 'delivered');
  end if;

  -- A parcel that came back is not a fulfilled order any more.
  if p_status = 'rto_delivered' and v_order.order_status <> 'cancelled' then
    update public.orders set fulfillment_status = 'returned' where id = v_order.id;
  end if;

  perform private.write_audit(
    p_actor, 'shipment.status', 'order', v_order.id::text,
    jsonb_build_object(
      'shipment_id', v_shipment.id,
      'status', p_status,
      'shiprocket_status', p_remote_status,
      'detail', left(coalesce(p_detail, ''), 500),
      'awb_code', v_shipment.awb_code
    )
  );

  return jsonb_build_object(
    'shipment_id', v_shipment.id,
    'applied', true,
    'status', p_status,
    'notify', v_notify,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'email', v_order.email,
    'awb_code', v_shipment.awb_code,
    'courier_name', v_shipment.courier_name,
    'tracking_url', v_shipment.tracking_url
  );
end;
$$;

-- ── Cancel a shipment ───────────────────────────────────────────────────────
--
-- Only before it moves. Once a parcel is with the courier the way back is an
-- RTO, not a cancellation. The order goes back to unfulfilled, which is what
-- re-opens cancelling it and editing its address.
create or replace function public.cancel_shipment(
  p_shipment_id uuid,
  p_reason text default '',
  p_actor text default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shipment public.shipments;
  v_order public.orders;
begin
  select * into v_shipment from public.shipments where id = p_shipment_id for update;

  if not found then
    raise exception 'shipment % not found', p_shipment_id using errcode = 'P0002';
  end if;

  if v_shipment.status = 'cancelled' then
    raise exception 'shipment % is already cancelled', p_shipment_id using errcode = '55000';
  end if;

  if v_shipment.shipped_at is not null then
    raise exception 'shipment % has already left; it can only come back as an RTO', p_shipment_id
      using errcode = '55000';
  end if;

  update public.shipments
  set status = 'cancelled',
      cancelled_at = now(),
      status_detail = left(coalesce(p_reason, ''), 500),
      last_status_at = now()
  where id = p_shipment_id
  returning * into v_shipment;

  select * into v_order from public.orders where id = v_shipment.order_id for update;

  if v_order.order_status <> 'cancelled' and v_order.fulfillment_status = 'fulfilled' then
    update public.orders set fulfillment_status = 'unfulfilled' where id = v_order.id;
  end if;

  perform private.write_audit(
    p_actor, 'shipment.cancel', 'order', v_order.id::text,
    jsonb_build_object('shipment_id', v_shipment.id, 'reason', coalesce(p_reason, ''))
  );

  return jsonb_build_object(
    'shipment_id', v_shipment.id,
    'order_number', v_order.order_number,
    'fulfillment_status', (select fulfillment_status from public.orders where id = v_order.id)
  );
end;
$$;

-- ── Privileges ──────────────────────────────────────────────────────────────
-- `supabase db push` connects as its own migration role, so Supabase's default
-- grants never fire for service_role. Everything it needs is explicit.
revoke execute on function public.set_shiprocket_token(text, timestamptz) from public, anon, authenticated;
revoke execute on function public.create_shipment(uuid, text, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.assign_shipment_awb(uuid, text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.record_shipment_pickup(uuid, text, timestamptz, jsonb, text) from public, anon, authenticated;
revoke execute on function public.update_shipment_status(uuid, text, text, text, text, timestamptz, jsonb, text) from public, anon, authenticated;
revoke execute on function public.cancel_shipment(uuid, text, text) from public, anon, authenticated;

grant execute on function public.set_shiprocket_token(text, timestamptz) to service_role;
grant execute on function public.create_shipment(uuid, text, text, jsonb, text) to service_role;
grant execute on function public.assign_shipment_awb(uuid, text, text, text, text, jsonb, text) to service_role;
grant execute on function public.record_shipment_pickup(uuid, text, timestamptz, jsonb, text) to service_role;
grant execute on function public.update_shipment_status(uuid, text, text, text, text, timestamptz, jsonb, text) to service_role;
grant execute on function public.cancel_shipment(uuid, text, text) to service_role;
