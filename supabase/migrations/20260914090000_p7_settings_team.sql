-- P7: settings edited from the admin, the team, and abandoned checkouts.

-- ── Settings ────────────────────────────────────────────────────────────────

insert into public.settings (key, value, is_public) values
  ('integrations', jsonb_build_object('webhooks', '{}'::jsonb), false)
on conflict (key) do nothing;

-- New flags default to what PLAN §4 describes; existing values are kept.
update public.settings
set value = jsonb_build_object('abandoned_checkout_email', true) || value
where key = 'features';

-- Merges a patch into one settings row, atomically, and audits what changed.
--
-- A merge rather than a replace, because each admin form owns only some of a
-- row's fields — the Shiprocket row holds a cached token the pickup form must
-- not wipe. Only the keys the admin edits are allowed; the rest are written by
-- the app itself.
create or replace function public.merge_setting(p_key text, p_patch jsonb, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_changed jsonb;
begin
  if p_key not in ('store_public', 'store', 'shipping', 'inventory', 'features', 'integrations', 'shiprocket') then
    raise exception 'setting % cannot be edited here', p_key using errcode = '22023';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'patch must be an object' using errcode = '22023';
  end if;
  if p_key = 'shiprocket' and exists (
    select 1 from jsonb_object_keys(p_patch) k where k not in ('pickup_location')
  ) then
    raise exception 'only the pickup location can be edited' using errcode = '22023';
  end if;

  select value into v_before from public.settings where key = p_key for update;
  if not found then
    raise exception 'setting % does not exist', p_key using errcode = 'P0002';
  end if;

  v_after := v_before || p_patch;

  if v_after = v_before then
    return v_after;
  end if;

  update public.settings set value = v_after where key = p_key;

  select coalesce(jsonb_object_agg(k, jsonb_build_object('from', v_before -> k, 'to', p_patch -> k)), '{}'::jsonb)
  into v_changed
  from jsonb_object_keys(p_patch) k
  where (v_before -> k) is distinct from (p_patch -> k);

  perform private.write_audit(p_actor, 'settings.update', 'settings', p_key, v_changed);
  return v_after;
end;
$$;

-- ── Team ────────────────────────────────────────────────────────────────────

alter table public.admin_users
  add column invited_at timestamptz,
  add column invited_by text;

-- The store must always have an owner: nobody else can reach settings or the
-- team. Both functions lock every owner row first, so two owners demoting each
-- other at the same moment can't both succeed.

create or replace function public.set_admin_role(p_admin_id uuid, p_role text, p_actor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin public.admin_users;
  v_owners integer;
begin
  if p_role not in ('owner', 'staff') then
    raise exception 'role must be owner or staff' using errcode = '22023';
  end if;

  perform 1 from public.admin_users where role = 'owner' for update;

  select * into v_admin from public.admin_users where id = p_admin_id for update;
  if not found then
    raise exception 'admin % not found', p_admin_id using errcode = 'P0002';
  end if;
  if v_admin.role = p_role then
    return;
  end if;

  if v_admin.role = 'owner' then
    select count(*) into v_owners from public.admin_users where role = 'owner';
    if v_owners <= 1 then
      raise exception 'the store needs at least one owner' using errcode = '23514';
    end if;
  end if;

  update public.admin_users set role = p_role where id = p_admin_id;
  perform private.write_audit(
    p_actor, 'admin.role', 'admin_user', p_admin_id::text,
    jsonb_build_object('email', v_admin.email, 'from', v_admin.role, 'to', p_role)
  );
end;
$$;

create or replace function public.remove_admin_user(p_admin_id uuid, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin public.admin_users;
  v_owners integer;
begin
  perform 1 from public.admin_users where role = 'owner' for update;

  select * into v_admin from public.admin_users where id = p_admin_id for update;
  if not found then
    raise exception 'admin % not found', p_admin_id using errcode = 'P0002';
  end if;
  if lower(v_admin.email::text) = lower(coalesce(p_actor, '')) then
    raise exception 'you cannot remove yourself' using errcode = '55000';
  end if;
  if v_admin.role = 'owner' then
    select count(*) into v_owners from public.admin_users where role = 'owner';
    if v_owners <= 1 then
      raise exception 'the store needs at least one owner' using errcode = '23514';
    end if;
  end if;

  delete from public.admin_users where id = p_admin_id;
  perform private.write_audit(
    p_actor, 'admin.remove', 'admin_user', p_admin_id::text,
    jsonb_build_object('email', v_admin.email, 'role', v_admin.role)
  );
  return jsonb_build_object('email', v_admin.email, 'user_id', v_admin.user_id);
end;
$$;

-- ── Abandoned checkouts ─────────────────────────────────────────────────────
--
-- Stamps and returns checkouts that are due one recovery email: still active,
-- with an email, older than p_after_minutes, younger than p_within_hours, and
-- never emailed. Stamped *before* sending, so the email goes at most once even
-- if two crons overlap; a failed send is not retried, which is the right
-- failure for an unsolicited nudge.
--
-- A checkout whose buyer has since paid for another basket is skipped — the
-- email would be asking them to buy what they already bought.

create or replace function public.claim_abandoned_checkouts(
  p_after_minutes integer default 60,
  p_within_hours integer default 48,
  p_limit integer default 20
)
returns table (
  id uuid,
  email text,
  line_items jsonb,
  discount_code text,
  total_paise integer,
  shipping_address jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_after_minutes < 15 or p_within_hours < 1 or p_limit < 1 or p_limit > 100 then
    raise exception 'bad window or limit' using errcode = '22023';
  end if;

  return query
  with due as materialized (
    select c.id
    from public.checkouts c
    where c.status = 'active'
      and c.email is not null
      and c.recovery_email_sent_at is null
      and c.created_at <= now() - make_interval(mins => p_after_minutes)
      and c.created_at >= now() - make_interval(hours => p_within_hours)
      and not exists (
        select 1 from public.orders o
        where lower(o.email) = lower(c.email)
          and o.created_at >= c.created_at
      )
    order by c.created_at
    limit p_limit
    for update skip locked
  )
  update public.checkouts c
  set recovery_email_sent_at = now()
  from due
  where c.id = due.id
  returning c.id, c.email, c.line_items, c.discount_code, c.total_paise, c.shipping_address, c.created_at;
end;
$$;

create index if not exists checkouts_abandoned_idx on public.checkouts (created_at)
  where status = 'active' and recovery_email_sent_at is null and email is not null;

create index if not exists orders_email_lower_idx on public.orders (lower(email));

-- ── Grants ──────────────────────────────────────────────────────────────────

revoke execute on function public.merge_setting(text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.set_admin_role(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.remove_admin_user(uuid, text) from public, anon, authenticated;
revoke execute on function public.claim_abandoned_checkouts(integer, integer, integer) from public, anon, authenticated;

grant execute on function public.merge_setting(text, jsonb, text) to service_role;
grant execute on function public.set_admin_role(uuid, text, text) to service_role;
grant execute on function public.remove_admin_user(uuid, text) to service_role;
grant execute on function public.claim_abandoned_checkouts(integer, integer, integer) to service_role;
