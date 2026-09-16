-- The drain only claims topics that have a webhook URL configured.
--
-- Without this, rows for an unconfigured topic (say order.refunded, which no
-- n8n flow consumes yet) were claimed and deferred on every run. Ordered by
-- next_attempt_at, a backlog of them would eventually fill the batch ahead of
-- rows that could actually be delivered. Now they sit untouched, still pending,
-- and go out once their URL is set.

drop function public.claim_outbox(integer, integer);

create or replace function public.claim_outbox(
  p_topics text[],
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
  if p_topics is null or cardinality(p_topics) = 0 then
    return;
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
      and topic = any (p_topics)
      and next_attempt_at <= now()
    order by next_attempt_at, created_at
    limit p_limit
    for update skip locked
  )
  returning o.*;
end;
$$;

comment on function public.claim_outbox(text[], integer, integer) is 'Leases due outbox rows for the given topics. Service role only.';

revoke execute on function public.claim_outbox(text[], integer, integer) from public, anon, authenticated;
grant execute on function public.claim_outbox(text[], integer, integer) to service_role;
