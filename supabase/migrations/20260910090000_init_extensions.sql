-- Extensions, private helper schema, and shared trigger functions.
--
-- Everything the app writes goes through the service-role key, so the private
-- schema is locked away from anon/authenticated entirely.

create extension if not exists citext with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

-- Keeps updated_at honest without the application having to remember.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Order numbers are AAL1001, AAL1002, … The sequence owns uniqueness so two
-- concurrent checkouts can never land on the same number.
create sequence if not exists private.order_number_seq as bigint start with 1001 increment by 1;

create or replace function private.next_order_number()
returns text
language sql
set search_path = ''
as $$
  select 'AAL' || nextval('private.order_number_seq')::text;
$$;
