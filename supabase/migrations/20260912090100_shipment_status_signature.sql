-- `update_shipment_status` takes either identifier: the webhook knows the AWB,
-- the cron and the admin know the row. Both were required positionally, which
-- the generated client types then read as "required and never null", so a
-- caller with only one of them could not type-check.
--
-- Same body; the two identifiers now default to null and the status — the one
-- thing every caller has — comes first.

drop function if exists public.update_shipment_status(uuid, text, text, text, text, timestamptz, jsonb, text);

create or replace function public.update_shipment_status(
  p_status text,
  p_shipment_id uuid default null,
  p_awb_code text default null,
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

revoke execute on function public.update_shipment_status(text, uuid, text, text, text, timestamptz, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.update_shipment_status(text, uuid, text, text, text, timestamptz, jsonb, text)
  to service_role;
