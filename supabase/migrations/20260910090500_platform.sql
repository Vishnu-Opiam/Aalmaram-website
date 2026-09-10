-- Platform tables: the n8n outbox, author events, settings, admin users,
-- the audit trail, and the checkout rate limiter.

-- Durable feed to n8n. Rows are written inside the same transaction as the
-- order, then drained by /api/cron/outbox, so a webhook can never be lost
-- because n8n happened to be down.
create table public.webhook_outbox (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  payload jsonb not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint webhook_outbox_topic_check check (
    topic in ('order.paid', 'order.shipped', 'order.delivered', 'order.refunded', 'order.cancelled')
  ),
  constraint webhook_outbox_status_check check (status in ('pending', 'sent', 'failed')),
  constraint webhook_outbox_attempts_check check (attempts >= 0)
);

comment on column public.webhook_outbox.next_attempt_at is 'Retry backoff. The drain only picks up rows that are due.';

-- Partial index: the drain only ever looks at rows that are not yet sent, and
-- sent rows will outnumber them for the life of the table.
create index webhook_outbox_due_idx on public.webhook_outbox (next_attempt_at)
  where status <> 'sent';

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  location text not null default '',
  description text not null default '',
  link text not null default '',
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_title_not_blank check (length(btrim(title)) > 0)
);

create index events_published_date_idx on public.events (published, date desc);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function private.set_updated_at();

-- Key/value settings. is_public decides what the storefront may read: shipping
-- thresholds yes, Shiprocket tokens absolutely not.
create table public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function private.set_updated_at();

-- Presence in this table is what grants access to /admin. A Supabase Auth user
-- with no row here (and not in ADMIN_ALLOWLIST) gets nothing.
create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  email extensions.citext not null unique,
  role text not null default 'staff',
  name text not null default '',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_users_role_check check (role in ('owner', 'staff'))
);

comment on column public.admin_users.user_id is 'Linked on first successful login, so an admin can be invited before the auth user exists.';

create trigger admin_users_set_updated_at
  before update on public.admin_users
  for each row execute function private.set_updated_at();

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.admin_users (id) on delete set null,
  admin_email text not null default '',
  action text not null,
  entity_type text not null,
  entity_id text,
  diff jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_created_at_idx on public.audit_log (created_at desc);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index audit_log_admin_user_id_idx on public.audit_log (admin_user_id);

-- Fixed-window rate limiter for /api/checkout*. Postgres rather than memory,
-- because serverless instances do not share memory.
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

create or replace function public.rate_limit_hit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count = case
          when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1
          else rl.count + 1
        end,
        window_start = case
          when rl.window_start < now() - make_interval(secs => p_window_seconds) then now()
          else rl.window_start
        end
  returning rl.count into v_count;

  return v_count <= p_limit;
end;
$$;

comment on function public.rate_limit_hit(text, integer, integer) is 'Returns true when the caller is still within the limit. Service role only.';

revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
