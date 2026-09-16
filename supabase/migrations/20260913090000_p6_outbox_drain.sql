-- P6: the outbox drain, and a low-stock event.
--
-- Rows have been written to webhook_outbox since P3, inside the same
-- transactions that move money and stock. This adds the three functions the
-- drain needs to deliver them to n8n at least once without two drains sending
-- the same row at the same moment, and the retry schedule for when n8n is down.

-- ── Schema ──────────────────────────────────────────────────────────────────

alter table public.webhook_outbox
  drop constraint webhook_outbox_topic_check,
  add constraint webhook_outbox_topic_check check (
    topic in (
      'order.paid', 'order.shipped', 'order.delivered', 'order.refunded', 'order.cancelled',
      'inventory.low'
    )
  );

alter table public.webhook_outbox
  add column last_attempt_at timestamptz,
  add column last_response_status integer;

comment on column public.webhook_outbox.last_response_status is 'HTTP status n8n answered with on the last attempt; null when the request never got an answer.';

-- The admin lists recent rows newest first, filtered by status.
create index webhook_outbox_status_created_idx on public.webhook_outbox (status, created_at desc);

-- ── Claim ───────────────────────────────────────────────────────────────────
--
-- Takes a lease on up to p_limit due rows by pushing next_attempt_at into the
-- future, and counts the attempt. A second drain running at the same time
-- skips locked rows and, once this commits, no longer sees them as due. A drain
-- that dies mid-send leaves the row to come due again when the lease runs out —
-- which is what makes delivery at-least-once rather than at-most-once.

create or replace function public.claim_outbox(
  p_limit integer default 20,
  p_lease_seconds integer default 120
)
returns setof public.webhook_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'limit must be between 1 and 100' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 10 then
    raise exception 'lease must be at least 10 seconds' using errcode = '22023';
  end if;

  return query
  update public.webhook_outbox o
  set attempts = o.attempts + 1,
      last_attempt_at = now(),
      next_attempt_at = now() + make_interval(secs => p_lease_seconds)
  where o.id in (
    select id
    from public.webhook_outbox
    where status = 'pending'
      and next_attempt_at <= now()
    order by next_attempt_at, created_at
    limit p_limit
    for update skip locked
  )
  returning o.*;
end;
$$;

comment on function public.claim_outbox(integer, integer) is 'Leases due outbox rows for delivery. Service role only.';

-- ── Finish ──────────────────────────────────────────────────────────────────
--
-- p_outcome:
--   'sent'     n8n accepted it.
--   'retry'    it failed; back off and try again, or give up after p_max_attempts.
--   'deferred' nothing was tried (no URL configured for the topic). The attempt
--              the claim counted is handed back and the row waits, so events
--              queued before n8n is wired up are still delivered once it is.
--   'dropped'  deliberately not delivered (e.g. a low-stock alert for a product
--              that no longer exists). Marked sent so it leaves the queue, with
--              the reason kept in last_error.
--
-- Backoff after the nth failed attempt: 3^(n-1) minutes, capped at 12 hours —
-- 1, 3, 9, 27, 81, 243 minutes, then 12h. Ten attempts span about two days.

create or replace function public.finish_outbox(
  p_id uuid,
  p_outcome text,
  p_error text default null,
  p_response_status integer default null,
  p_max_attempts integer default 10
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.webhook_outbox;
  v_status text;
begin
  if p_outcome not in ('sent', 'retry', 'deferred', 'dropped') then
    raise exception 'unknown outcome %', p_outcome using errcode = '22023';
  end if;

  select * into v_row from public.webhook_outbox where id = p_id for update;
  if not found then
    raise exception 'outbox row % not found', p_id using errcode = 'P0002';
  end if;

  -- A row that was already delivered (a lease that expired while a slow send
  -- was still in flight, then succeeded twice) stays delivered.
  if v_row.status = 'sent' then
    return 'sent';
  end if;

  if p_outcome = 'sent' then
    update public.webhook_outbox
    set status = 'sent', sent_at = now(), last_error = null,
        last_response_status = p_response_status
    where id = p_id;
    return 'sent';
  end if;

  if p_outcome = 'dropped' then
    update public.webhook_outbox
    set status = 'sent', sent_at = now(), last_error = left(coalesce(p_error, 'dropped'), 1000),
        last_response_status = null
    where id = p_id;
    return 'sent';
  end if;

  if p_outcome = 'deferred' then
    update public.webhook_outbox
    set attempts = greatest(attempts - 1, 0),
        next_attempt_at = now() + interval '15 minutes',
        last_error = left(coalesce(p_error, 'deferred'), 1000),
        last_response_status = null
    where id = p_id;
    return 'pending';
  end if;

  -- retry
  if v_row.attempts >= p_max_attempts then
    v_status := 'failed';
  else
    v_status := 'pending';
  end if;

  update public.webhook_outbox
  set status = v_status,
      next_attempt_at = now() + least(
        make_interval(mins => power(3, greatest(v_row.attempts - 1, 0))::integer),
        interval '12 hours'
      ),
      last_error = left(coalesce(p_error, 'delivery failed'), 1000),
      last_response_status = p_response_status
  where id = p_id;

  return v_status;
end;
$$;

comment on function public.finish_outbox(uuid, text, text, integer, integer) is 'Records the result of one delivery attempt. Service role only.';

-- ── Retry from the admin ────────────────────────────────────────────────────

create or replace function public.retry_outbox(p_id uuid, p_actor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.webhook_outbox;
begin
  select * into v_row from public.webhook_outbox where id = p_id for update;
  if not found then
    raise exception 'outbox row % not found', p_id using errcode = 'P0002';
  end if;
  if v_row.status = 'sent' then
    raise exception 'this event was already delivered' using errcode = '55000';
  end if;

  update public.webhook_outbox
  set status = 'pending', attempts = 0, next_attempt_at = now()
  where id = p_id;

  perform private.write_audit(
    p_actor, 'outbox.retry', 'webhook_outbox', p_id::text,
    jsonb_build_object('topic', v_row.topic, 'previous_status', v_row.status,
                       'attempts', v_row.attempts, 'last_error', v_row.last_error)
  );
end;
$$;

comment on function public.retry_outbox(uuid, text) is 'Puts a failed outbox row back in the queue. Service role only.';

-- ── Low stock ───────────────────────────────────────────────────────────────
--
-- Replaces Shopify's inventory_levels/update trigger for n8n Flow 6. Fires once
-- when a variant's stock crosses down to the threshold (or lower), not on every
-- sale below it, so a slow sell-down doesn't send an alert per copy. Every path
-- that moves stock — orders, refunds, cancellations, manual adjustments — goes
-- through an update of this column, so a trigger catches them all.

create or replace function private.enqueue_low_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_threshold integer;
  v_product public.products;
begin
  select coalesce((value ->> 'low_stock_threshold')::integer, 5)
  into v_threshold
  from public.settings
  where key = 'inventory';
  v_threshold := coalesce(v_threshold, 5);

  if not (old.inventory_quantity > v_threshold and new.inventory_quantity <= v_threshold) then
    return new;
  end if;

  select * into v_product from public.products where id = new.product_id;
  -- Drafts and archived products aren't on sale; no alert.
  if v_product.status is distinct from 'active' then
    return new;
  end if;

  insert into public.webhook_outbox (topic, payload)
  values (
    'inventory.low',
    jsonb_build_object(
      'product_id', v_product.id,
      'product_title', v_product.title,
      'product_handle', v_product.handle,
      'variant_id', new.id,
      'variant_title', new.title,
      'sku', new.sku,
      'available', new.inventory_quantity,
      'previous', old.inventory_quantity,
      'threshold', v_threshold
    )
  );

  return new;
end;
$$;

revoke execute on function private.enqueue_low_stock() from public;

create trigger product_variants_low_stock
  after update of inventory_quantity on public.product_variants
  for each row
  when (new.inventory_quantity < old.inventory_quantity)
  execute function private.enqueue_low_stock();

-- ── Grants ──────────────────────────────────────────────────────────────────

revoke execute on function public.claim_outbox(integer, integer) from public, anon, authenticated;
revoke execute on function public.finish_outbox(uuid, text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.retry_outbox(uuid, text) from public, anon, authenticated;

grant execute on function public.claim_outbox(integer, integer) to service_role;
grant execute on function public.finish_outbox(uuid, text, text, integer, integer) to service_role;
grant execute on function public.retry_outbox(uuid, text) to service_role;
