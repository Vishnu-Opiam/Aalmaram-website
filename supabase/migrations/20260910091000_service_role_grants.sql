-- Grant service_role what it actually needs.
--
-- Supabase's default privileges for new tables in public are attached to the
-- postgres role. `supabase db push` connects as its own migration login role,
-- so nothing fired for service_role and every table came out unreachable —
-- "permission denied for table products" on the first seed.
--
-- The private schema is a second, quieter case: BYPASSRLS lets service_role
-- past row policies, but not past GRANTs. Without usage here, the default on
-- orders.order_number (private.next_order_number()) fails on insert.

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

grant usage on schema private to service_role;
grant execute on all functions in schema private to service_role;
grant usage on all sequences in schema private to service_role;

-- And for whatever later migrations add.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
alter default privileges in schema private grant execute on functions to service_role;
alter default privileges in schema private grant usage on sequences to service_role;

-- The dashboard SQL editor and future CLI pushes connect as postgres; keep it
-- able to see its own database.
grant usage on schema public to postgres;
grant all on all tables in schema public to postgres;
grant all on all sequences in schema public to postgres;
grant usage on schema private to postgres;
grant all on all sequences in schema private to postgres;
grant execute on all functions in schema private to postgres;
