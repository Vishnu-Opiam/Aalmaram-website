-- Order creation.
--
-- The order row, the line items, the inventory decrement and the discount
-- counters all have to land together or not at all — otherwise a lost
-- connection at the wrong moment oversells the last copy of a book. One
-- function, one transaction.
--
-- Body lands in phase 3. The signature is fixed now so the route handler and
-- the generated types can be written against it.

create or replace function public.create_order_from_checkout(
  p_checkout_id uuid,
  p_razorpay_order_id text,
  p_razorpay_payment_id text,
  p_razorpay_signature text,
  p_source text default 'web'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Phase 3 will:
  --   1. lock the checkout row (for update) and bail if already completed,
  --      returning the existing order — the browser callback and the Razorpay
  --      webhook both call this and exactly one may win;
  --   2. re-price every line item from product_variants;
  --   3. decrement inventory with a guarded update and fail on oversell;
  --   4. insert orders + order_items;
  --   5. bump discounts.used_count and insert discount_redemptions;
  --   6. upsert the customer and their totals;
  --   7. mark the checkout completed;
  --   8. enqueue order.paid in webhook_outbox;
  --   9. return jsonb_build_object('order_id', …, 'order_number', …).
  raise exception 'create_order_from_checkout is not implemented yet (phase 3)'
    using errcode = '0A000';
end;
$$;

comment on function public.create_order_from_checkout(uuid, text, text, text, text) is
  'Atomic order creation from a checkout snapshot. Service role only — called by /api/checkout/confirm and the Razorpay webhook.';

revoke execute on function public.create_order_from_checkout(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_order_from_checkout(uuid, text, text, text, text) to service_role;
