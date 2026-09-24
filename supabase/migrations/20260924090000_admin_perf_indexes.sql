-- Indexes for the admin's search boxes and queue views.
--
-- The Orders and Customers searches are `ilike '%term%'` across several
-- columns. A B-tree cannot serve a leading wildcard, so without these every
-- search reads the whole table: O(n) rows per keystroke-and-submit. Trigram GIN
-- indexes let Postgres answer each column from the index and OR the results.
--
-- customers.email is citext, which has no trigram operator class; its ilike
-- stays a scan, but the table is small and the other three columns are covered.

create extension if not exists pg_trgm with schema extensions;

create index if not exists orders_order_number_trgm_idx
  on public.orders using gin (order_number extensions.gin_trgm_ops);
create index if not exists orders_email_trgm_idx
  on public.orders using gin (email extensions.gin_trgm_ops);
create index if not exists orders_ship_name_trgm_idx
  on public.orders using gin ((shipping_address ->> 'name') extensions.gin_trgm_ops);

create index if not exists customers_first_name_trgm_idx
  on public.customers using gin (first_name extensions.gin_trgm_ops);
create index if not exists customers_last_name_trgm_idx
  on public.customers using gin (last_name extensions.gin_trgm_ops);
create index if not exists customers_phone_trgm_idx
  on public.customers using gin (phone extensions.gin_trgm_ops);

-- The home screen's "waiting to be sent" queue: open, unfulfilled, oldest
-- first. A partial index keeps it small — it only ever holds unsent orders.
create index if not exists orders_to_ship_idx
  on public.orders (placed_at)
  where order_status = 'open' and fulfillment_status = 'unfulfilled';

-- Outbox counts and lists by status (home screen's failed count, the
-- Integrations page's pending tally and its status filter). The existing
-- partial index is on next_attempt_at, which none of those use.
create index if not exists webhook_outbox_status_idx
  on public.webhook_outbox (status, created_at desc);
