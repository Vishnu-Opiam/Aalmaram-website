-- P4: every admin action that moves money or stock.
--
-- The rule these follow: money, stock, statuses, customer totals, the n8n
-- outbox and the audit trail change in one transaction, or none of them do.
--
-- Refunds are the one place that rule meets an outside system. Razorpay cannot
-- join a Postgres transaction, so a refund is two-phase:
--
--   begin_refund     reserve the amount against the order (a pending row)
--   <Razorpay call>
--   complete_refund  apply everything, atomically, idempotently
--   fail_refund      release the reservation
--
-- Error codes, so callers can tell failures apart without parsing messages:
--   P0002  the thing named does not exist
--   22023  the request itself is wrong (bad amount, too many to restock)
--   55000  the order is in the wrong state for this (cancelled, fulfilled)
--   23514  a stock guard fired

-- ── Helpers ─────────────────────────────────────────────────────────────────

create or replace function private.write_audit(
  p_actor text,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_diff jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (admin_user_id, admin_email, action, entity_type, entity_id, diff)
  values (
    (select id from public.admin_users where email = p_actor),
    coalesce(p_actor, ''),
    p_action,
    p_entity_type,
    p_entity_id,
    coalesce(p_diff, '{}'::jsonb)
  );
$$;

-- Validates a restock request against what was sold, what is already back on
-- the shelf, and what other pending refunds have reserved. Raises; returns
-- nothing.
create or replace function private.check_restock(
  p_order_id uuid,
  p_restock jsonb,
  p_exclude_refund_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line record;
  v_item public.order_items;
  v_reserved integer;
begin
  if p_restock is null or jsonb_typeof(p_restock) <> 'array' then
    raise exception 'restock must be a list' using errcode = '22023';
  end if;

  -- Duplicate lines are summed first, so repeating a line cannot slip past the
  -- per-line check.
  for v_line in
    select (e ->> 'order_item_id')::uuid as item_id,
           sum((e ->> 'quantity')::integer) as quantity
    from jsonb_array_elements(p_restock) e
    group by 1
    order by 1
  loop
    if v_line.quantity is null or v_line.quantity <= 0 then
      raise exception 'restock quantities must be whole numbers above zero' using errcode = '22023';
    end if;

    select * into v_item
    from public.order_items
    where id = v_line.item_id and order_id = p_order_id;

    if not found then
      raise exception 'order item % is not on this order', v_line.item_id using errcode = '22023';
    end if;

    select coalesce(sum((e ->> 'quantity')::integer), 0) into v_reserved
    from public.refunds r
    cross join lateral jsonb_array_elements(r.restock) e
    where r.order_id = p_order_id
      and r.status = 'pending'
      and r.id is distinct from p_exclude_refund_id
      and (e ->> 'order_item_id')::uuid = v_line.item_id;

    if v_item.restocked_quantity + v_reserved + v_line.quantity > v_item.quantity then
      raise exception 'cannot restock % of "%": % sold, % already back or reserved',
        v_line.quantity, v_item.title, v_item.quantity, v_item.restocked_quantity + v_reserved
        using errcode = '22023';
    end if;
  end loop;
end;
$$;

-- Puts copies back on the shelf and logs each move. A line whose variant has
-- since been deleted cannot be restocked; it is counted as dealt with and
-- reported back, rather than failing the whole refund.
create or replace function private.apply_restock(
  p_order_id uuid,
  p_restock jsonb,
  p_reason text,
  p_actor text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line record;
  v_item public.order_items;
  v_skipped jsonb := '[]'::jsonb;
  v_restocked jsonb := '[]'::jsonb;
begin
  for v_line in
    select (e ->> 'order_item_id')::uuid as item_id,
           sum((e ->> 'quantity')::integer) as quantity
    from jsonb_array_elements(p_restock) e
    group by 1
    order by 1
  loop
    update public.order_items
    set restocked_quantity = restocked_quantity + v_line.quantity
    where id = v_line.item_id and order_id = p_order_id
    returning * into v_item;

    if not found then
      raise exception 'order item % is not on this order', v_line.item_id using errcode = '22023';
    end if;

    if v_item.variant_id is null then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.id, 'title', v_item.title, 'quantity', v_line.quantity
      );
      continue;
    end if;

    update public.product_variants
    set inventory_quantity = inventory_quantity + v_line.quantity
    where id = v_item.variant_id;

    if not found then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.id, 'title', v_item.title, 'quantity', v_line.quantity
      );
      continue;
    end if;

    insert into public.inventory_adjustments (variant_id, delta, reason, order_id, note, created_by)
    values (v_item.variant_id, v_line.quantity, p_reason, p_order_id, coalesce(p_note, ''), coalesce(p_actor, 'system'));

    v_restocked := v_restocked || jsonb_build_object(
      'order_item_id', v_item.id, 'title', v_item.title, 'quantity', v_line.quantity
    );
  end loop;

  return jsonb_build_object('restocked', v_restocked, 'skipped', v_skipped);
end;
$$;

revoke execute on function private.write_audit(text, text, text, text, jsonb) from public;
revoke execute on function private.check_restock(uuid, jsonb, uuid) from public;
revoke execute on function private.apply_restock(uuid, jsonb, text, text, text) from public;

-- ── Manual stock adjustment ─────────────────────────────────────────────────
--
-- Replaces a read-then-write in the products admin that could report success
-- without changing anything when an order landed in between. One guarded
-- update decides; the adjustment row is written only if it matched.
create or replace function public.adjust_inventory(
  p_variant_id uuid,
  p_delta integer,
  p_reason text,
  p_note text default '',
  p_actor text default 'system'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_after integer;
  v_before integer;
begin
  if p_delta is null or p_delta = 0 then
    raise exception 'adjust by a whole number other than zero' using errcode = '22023';
  end if;

  update public.product_variants
  set inventory_quantity = inventory_quantity + p_delta
  where id = p_variant_id
    and inventory_quantity + p_delta >= 0
  returning inventory_quantity into v_after;

  if not found then
    select inventory_quantity into v_before
    from public.product_variants
    where id = p_variant_id;

    if not found then
      raise exception 'variant % not found', p_variant_id using errcode = 'P0002';
    end if;

    raise exception 'only % in stock; adjusting by % would go below zero', v_before, p_delta
      using errcode = '23514';
  end if;

  insert into public.inventory_adjustments (variant_id, delta, reason, note, created_by)
  values (p_variant_id, p_delta, p_reason, coalesce(p_note, ''), coalesce(p_actor, 'system'));

  return v_after;
end;
$$;

-- ── Out-of-stock payments ───────────────────────────────────────────────────
--
-- A payment was captured, then the order RPC found the stock gone. Records the
-- refund that is owed, once per checkout, whichever caller gets here first.
-- Only the webhook (or an admin) then asks Razorpay for the money.
create or replace function public.record_out_of_stock_payment(
  p_checkout_id uuid,
  p_razorpay_payment_id text,
  p_actor text default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checkout public.checkouts;
  v_refund public.refunds;
  v_created boolean := false;
begin
  select * into v_checkout from public.checkouts where id = p_checkout_id for update;

  if not found then
    raise exception 'checkout % not found', p_checkout_id using errcode = 'P0002';
  end if;

  if v_checkout.status = 'completed' then
    raise exception 'checkout % already has an order', p_checkout_id using errcode = '55000';
  end if;

  insert into public.refunds (kind, checkout_id, amount_paise, razorpay_payment_id, reason, created_by)
  values (
    'out_of_stock',
    v_checkout.id,
    v_checkout.total_paise,
    p_razorpay_payment_id,
    'Sold out between payment and order creation',
    coalesce(p_actor, 'system')
  )
  on conflict (checkout_id) where kind = 'out_of_stock' do nothing
  returning * into v_refund;

  if found then
    v_created := true;
    perform private.write_audit(
      p_actor, 'checkout.out_of_stock', 'checkout', v_checkout.id::text,
      jsonb_build_object('refund_id', v_refund.id, 'amount_paise', v_refund.amount_paise,
                         'razorpay_payment_id', p_razorpay_payment_id)
    );
  else
    select * into v_refund
    from public.refunds
    where checkout_id = v_checkout.id and kind = 'out_of_stock';
  end if;

  return jsonb_build_object(
    'refund_id', v_refund.id,
    'status', v_refund.status,
    'amount_paise', v_refund.amount_paise,
    'razorpay_payment_id', v_refund.razorpay_payment_id,
    'email', v_checkout.email,
    'created', v_created
  );
end;
$$;

-- ── Refund, phase 1 ─────────────────────────────────────────────────────────
--
-- p_amount_paise null means "everything left". A cancel must refund everything
-- left and only applies to an unfulfilled order.
create or replace function public.begin_refund(
  p_order_id uuid,
  p_amount_paise integer,
  p_restock jsonb default '[]'::jsonb,
  p_cancel boolean default false,
  p_reason text default '',
  p_actor text default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_pending integer;
  v_remaining integer;
  v_amount integer;
  v_refund public.refunds;
begin
  select * into v_order from public.orders where id = p_order_id for update;

  if not found then
    raise exception 'order % not found', p_order_id using errcode = 'P0002';
  end if;

  if v_order.order_status = 'cancelled' then
    raise exception 'order % is already cancelled', v_order.order_number using errcode = '55000';
  end if;

  if coalesce(v_order.razorpay_payment_id, '') = '' then
    raise exception 'order % has no Razorpay payment to refund', v_order.order_number
      using errcode = '55000';
  end if;

  if v_order.payment_status not in ('paid', 'partially_refunded') then
    raise exception 'order % is %, so there is nothing to refund', v_order.order_number, v_order.payment_status
      using errcode = '55000';
  end if;

  if p_cancel and v_order.fulfillment_status <> 'unfulfilled' then
    raise exception 'order % is %; refund it instead of cancelling', v_order.order_number, v_order.fulfillment_status
      using errcode = '55000';
  end if;

  if p_cancel and exists (
    select 1 from public.refunds
    where order_id = p_order_id and kind = 'cancel' and status = 'pending'
  ) then
    raise exception 'a cancellation of % is already in progress', v_order.order_number
      using errcode = '55000';
  end if;

  select coalesce(sum(amount_paise), 0) into v_pending
  from public.refunds
  where order_id = p_order_id and status = 'pending';

  v_remaining := v_order.total_paise - v_order.refunded_paise - v_pending;
  v_amount := coalesce(p_amount_paise, v_remaining);

  if p_cancel and v_amount <> v_remaining then
    raise exception 'a cancellation refunds everything left (% paise), not %', v_remaining, v_amount
      using errcode = '22023';
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception 'refund amount must be above zero (% paise left to refund)', v_remaining
      using errcode = '22023';
  end if;

  if v_amount > v_remaining then
    raise exception 'a refund of % paise is more than the % paise left on %',
      v_amount, v_remaining, v_order.order_number
      using errcode = '22023';
  end if;

  perform private.check_restock(p_order_id, coalesce(p_restock, '[]'::jsonb), null);

  insert into public.refunds (kind, order_id, amount_paise, razorpay_payment_id, restock, reason, created_by)
  values (
    case when p_cancel then 'cancel' else 'refund' end,
    p_order_id,
    v_amount,
    v_order.razorpay_payment_id,
    coalesce(p_restock, '[]'::jsonb),
    coalesce(p_reason, ''),
    coalesce(p_actor, 'system')
  )
  returning * into v_refund;

  perform private.write_audit(
    p_actor, case when p_cancel then 'order.cancel.begin' else 'order.refund.begin' end,
    'order', p_order_id::text,
    jsonb_build_object('refund_id', v_refund.id, 'amount_paise', v_amount,
                       'restock', v_refund.restock, 'reason', v_refund.reason)
  );

  return jsonb_build_object(
    'refund_id', v_refund.id,
    'amount_paise', v_amount,
    'razorpay_payment_id', v_refund.razorpay_payment_id,
    'order_number', v_order.order_number
  );
end;
$$;

-- ── Refund, phase 2 ─────────────────────────────────────────────────────────
--
-- Razorpay has the money on its way back. Apply it. Calling this twice for the
-- same refund changes nothing the second time. A refund previously marked
-- failed can still be completed — Razorpay may have succeeded after a timeout —
-- in which case its restock is re-checked, since its reservation was released.
create or replace function public.complete_refund(
  p_refund_id uuid,
  p_razorpay_refund_id text,
  p_actor text default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund public.refunds;
  v_order public.orders;
  v_refunded integer;
  v_payment_status text;
  v_is_cancel boolean;
  v_stock jsonb := jsonb_build_object('restocked', '[]'::jsonb, 'skipped', '[]'::jsonb);
begin
  select * into v_refund from public.refunds where id = p_refund_id for update;

  if not found then
    raise exception 'refund % not found', p_refund_id using errcode = 'P0002';
  end if;

  if v_refund.status = 'processed' then
    return jsonb_build_object('refund_id', v_refund.id, 'already_processed', true);
  end if;

  if coalesce(p_razorpay_refund_id, '') = '' then
    raise exception 'a Razorpay refund id is required' using errcode = '22023';
  end if;

  -- Out of stock: there is no order. Close the refund and the checkout.
  if v_refund.kind = 'out_of_stock' then
    update public.refunds
    set status = 'processed', razorpay_refund_id = p_razorpay_refund_id,
        processed_at = now(), error = null
    where id = v_refund.id;

    update public.checkouts set status = 'refunded' where id = v_refund.checkout_id;

    perform private.write_audit(
      p_actor, 'checkout.out_of_stock.refunded', 'checkout', v_refund.checkout_id::text,
      jsonb_build_object('refund_id', v_refund.id, 'razorpay_refund_id', p_razorpay_refund_id,
                         'amount_paise', v_refund.amount_paise)
    );

    return jsonb_build_object('refund_id', v_refund.id, 'already_processed', false,
                              'kind', 'out_of_stock');
  end if;

  select * into v_order from public.orders where id = v_refund.order_id for update;

  if v_refund.status = 'failed' then
    perform private.check_restock(v_order.id, v_refund.restock, v_refund.id);
  end if;

  v_is_cancel := v_refund.kind = 'cancel';
  v_refunded := v_order.refunded_paise + v_refund.amount_paise;
  v_payment_status := case when v_refunded >= v_order.total_paise then 'refunded' else 'partially_refunded' end;

  update public.refunds
  set status = 'processed', razorpay_refund_id = p_razorpay_refund_id,
      processed_at = now(), error = null
  where id = v_refund.id;

  -- orders_money_check (refunded_paise <= total_paise) is the last line of
  -- defence if two refunds somehow both got through.
  update public.orders
  set refunded_paise = v_refunded,
      payment_status = v_payment_status,
      order_status = case when v_is_cancel then 'cancelled' else order_status end,
      fulfillment_status = case when v_is_cancel then 'cancelled' else fulfillment_status end,
      cancel_reason = case when v_is_cancel then nullif(v_refund.reason, '') else cancel_reason end
  where id = v_order.id;

  if jsonb_array_length(v_refund.restock) > 0 then
    v_stock := private.apply_restock(
      v_order.id, v_refund.restock,
      case when v_is_cancel then 'cancellation' else 'refund' end,
      p_actor, 'Refund ' || v_refund.id::text
    );
  end if;

  update public.customers
  set total_spent_paise = greatest(total_spent_paise - v_refund.amount_paise, 0),
      total_orders = case when v_is_cancel then greatest(total_orders - 1, 0) else total_orders end
  where id = v_order.customer_id;

  insert into public.webhook_outbox (topic, payload)
  values (
    'order.refunded',
    jsonb_build_object(
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'email', v_order.email,
      'refund_id', v_refund.id,
      'razorpay_refund_id', p_razorpay_refund_id,
      'amount_paise', v_refund.amount_paise,
      'refunded_paise', v_refunded,
      'total_paise', v_order.total_paise,
      'payment_status', v_payment_status,
      'reason', v_refund.reason,
      'restocked', v_stock -> 'restocked'
    )
  );

  if v_is_cancel then
    insert into public.webhook_outbox (topic, payload)
    values (
      'order.cancelled',
      jsonb_build_object(
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'email', v_order.email,
        'reason', v_refund.reason,
        'refunded_paise', v_refunded,
        'total_paise', v_order.total_paise
      )
    );
  end if;

  perform private.write_audit(
    p_actor, case when v_is_cancel then 'order.cancel' else 'order.refund' end,
    'order', v_order.id::text,
    jsonb_build_object(
      'refund_id', v_refund.id,
      'razorpay_refund_id', p_razorpay_refund_id,
      'amount_paise', v_refund.amount_paise,
      'refunded_paise', v_refunded,
      'payment_status', v_payment_status,
      'restocked', v_stock -> 'restocked',
      'skipped', v_stock -> 'skipped'
    )
  );

  return jsonb_build_object(
    'refund_id', v_refund.id,
    'already_processed', false,
    'kind', v_refund.kind,
    'refunded_paise', v_refunded,
    'payment_status', v_payment_status,
    'restocked', v_stock -> 'restocked',
    'skipped', v_stock -> 'skipped'
  );
end;
$$;

-- ── Refund, failure ─────────────────────────────────────────────────────────
create or replace function public.fail_refund(
  p_refund_id uuid,
  p_error text,
  p_actor text default 'system'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund public.refunds;
begin
  select * into v_refund from public.refunds where id = p_refund_id for update;

  if not found then
    raise exception 'refund % not found', p_refund_id using errcode = 'P0002';
  end if;

  if v_refund.status = 'processed' then
    raise exception 'refund % has already been processed', p_refund_id using errcode = '55000';
  end if;

  update public.refunds
  set status = 'failed', error = left(coalesce(p_error, ''), 1000)
  where id = p_refund_id;

  perform private.write_audit(
    p_actor, 'refund.failed',
    case when v_refund.kind = 'out_of_stock' then 'checkout' else 'order' end,
    coalesce(v_refund.order_id, v_refund.checkout_id)::text,
    jsonb_build_object('refund_id', v_refund.id, 'error', left(coalesce(p_error, ''), 1000))
  );
end;
$$;

-- ── Cancel with nothing left to refund ──────────────────────────────────────
--
-- For an order whose money has already gone back (or an imported order whose
-- payment was never ours). An order with money still on it is cancelled
-- through begin_refund(p_cancel => true) instead.
create or replace function public.cancel_order(
  p_order_id uuid,
  p_restock jsonb default '[]'::jsonb,
  p_reason text default '',
  p_actor text default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_stock jsonb := jsonb_build_object('restocked', '[]'::jsonb, 'skipped', '[]'::jsonb);
begin
  select * into v_order from public.orders where id = p_order_id for update;

  if not found then
    raise exception 'order % not found', p_order_id using errcode = 'P0002';
  end if;

  if v_order.order_status = 'cancelled' then
    raise exception 'order % is already cancelled', v_order.order_number using errcode = '55000';
  end if;

  if v_order.fulfillment_status <> 'unfulfilled' then
    raise exception 'order % is %, so it cannot be cancelled', v_order.order_number, v_order.fulfillment_status
      using errcode = '55000';
  end if;

  if exists (select 1 from public.refunds where order_id = p_order_id and status = 'pending') then
    raise exception 'a refund on % is still pending; resolve it first', v_order.order_number
      using errcode = '55000';
  end if;

  if v_order.total_paise - v_order.refunded_paise > 0 and v_order.source <> 'shopify-import' then
    raise exception '% paise is still paid on %; cancel it with a refund',
      v_order.total_paise - v_order.refunded_paise, v_order.order_number
      using errcode = '55000';
  end if;

  perform private.check_restock(p_order_id, coalesce(p_restock, '[]'::jsonb), null);

  update public.orders
  set order_status = 'cancelled',
      fulfillment_status = 'cancelled',
      cancel_reason = nullif(coalesce(p_reason, ''), '')
  where id = p_order_id;

  if jsonb_array_length(coalesce(p_restock, '[]'::jsonb)) > 0 then
    v_stock := private.apply_restock(p_order_id, p_restock, 'cancellation', p_actor, 'Cancelled');
  end if;

  update public.customers
  set total_orders = greatest(total_orders - 1, 0)
  where id = v_order.customer_id;

  insert into public.webhook_outbox (topic, payload)
  values (
    'order.cancelled',
    jsonb_build_object(
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'email', v_order.email,
      'reason', coalesce(p_reason, ''),
      'refunded_paise', v_order.refunded_paise,
      'total_paise', v_order.total_paise
    )
  );

  perform private.write_audit(
    p_actor, 'order.cancel', 'order', p_order_id::text,
    jsonb_build_object('reason', coalesce(p_reason, ''),
                       'restocked', v_stock -> 'restocked', 'skipped', v_stock -> 'skipped')
  );

  return jsonb_build_object(
    'order_number', v_order.order_number,
    'restocked', v_stock -> 'restocked',
    'skipped', v_stock -> 'skipped'
  );
end;
$$;

-- ── Privileges ──────────────────────────────────────────────────────────────
-- Functions are executable by PUBLIC by default. None of these may be.
revoke execute on function public.adjust_inventory(uuid, integer, text, text, text) from public, anon, authenticated;
revoke execute on function public.record_out_of_stock_payment(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.begin_refund(uuid, integer, jsonb, boolean, text, text) from public, anon, authenticated;
revoke execute on function public.complete_refund(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.fail_refund(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.cancel_order(uuid, jsonb, text, text) from public, anon, authenticated;

grant execute on function public.adjust_inventory(uuid, integer, text, text, text) to service_role;
grant execute on function public.record_out_of_stock_payment(uuid, text, text) to service_role;
grant execute on function public.begin_refund(uuid, integer, jsonb, boolean, text, text) to service_role;
grant execute on function public.complete_refund(uuid, text, text) to service_role;
grant execute on function public.fail_refund(uuid, text, text) to service_role;
grant execute on function public.cancel_order(uuid, jsonb, text, text) to service_role;
