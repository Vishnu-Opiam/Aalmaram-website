-- claim_outbox could return more rows than p_limit.
--
-- `update … where id in (select … limit n for update skip locked)` lets the
-- planner turn the subquery into a semi-join it may evaluate more than once,
-- and with SKIP LOCKED each evaluation can lock a different set of rows. The
-- P6 suite caught a limit of 4 claiming 6. A MATERIALIZED CTE is evaluated
-- exactly once, so the limit holds.

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
  with due as materialized (
    select id
    from public.webhook_outbox
    where status = 'pending'
      and topic = any (p_topics)
      and next_attempt_at <= now()
    order by next_attempt_at, created_at
    limit p_limit
    for update skip locked
  )
  update public.webhook_outbox o
  set attempts = o.attempts + 1,
      last_attempt_at = now(),
      next_attempt_at = now() + make_interval(secs => p_lease_seconds)
  from due
  where o.id = due.id
  returning o.*;
end;
$$;
