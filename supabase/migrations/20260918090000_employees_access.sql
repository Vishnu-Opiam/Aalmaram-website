-- Employees: an owner can revoke someone's access without deleting them, and
-- restore it later. A revoked row stays for the record (and the audit trail)
-- but no longer lets that email into the admin.

alter table public.admin_users
  add column revoked_at timestamptz,
  add column revoked_by text;

-- Only active owners keep the store reachable, so the "at least one owner"
-- guard now ignores revoked ones. Every function locks the owner rows first,
-- so two owners acting on each other at once can't both succeed.

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

  if v_admin.role = 'owner' and v_admin.revoked_at is null then
    select count(*) into v_owners from public.admin_users where role = 'owner' and revoked_at is null;
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
  if v_admin.role = 'owner' and v_admin.revoked_at is null then
    select count(*) into v_owners from public.admin_users where role = 'owner' and revoked_at is null;
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

-- Revokes (p_revoke = true) or restores access. Returns the row's email and
-- auth user id so the app can ban or unban the Supabase login to match.
create or replace function public.set_admin_access(p_admin_id uuid, p_revoke boolean, p_actor text)
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

  if p_revoke then
    if lower(v_admin.email::text) = lower(coalesce(p_actor, '')) then
      raise exception 'you cannot revoke your own access' using errcode = '55000';
    end if;
    if v_admin.revoked_at is not null then
      return jsonb_build_object('email', v_admin.email, 'user_id', v_admin.user_id);
    end if;
    if v_admin.role = 'owner' then
      select count(*) into v_owners from public.admin_users where role = 'owner' and revoked_at is null;
      if v_owners <= 1 then
        raise exception 'the store needs at least one owner' using errcode = '23514';
      end if;
    end if;
    update public.admin_users set revoked_at = now(), revoked_by = p_actor where id = p_admin_id;
  else
    if v_admin.revoked_at is null then
      return jsonb_build_object('email', v_admin.email, 'user_id', v_admin.user_id);
    end if;
    update public.admin_users set revoked_at = null, revoked_by = null where id = p_admin_id;
  end if;

  perform private.write_audit(
    p_actor, case when p_revoke then 'admin.revoke' else 'admin.restore' end,
    'admin_user', p_admin_id::text,
    jsonb_build_object('email', v_admin.email, 'role', v_admin.role)
  );
  return jsonb_build_object('email', v_admin.email, 'user_id', v_admin.user_id);
end;
$$;

revoke execute on function public.set_admin_access(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.set_admin_access(uuid, boolean, text) to service_role;
