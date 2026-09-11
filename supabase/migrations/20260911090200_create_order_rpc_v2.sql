-- create_order_from_checkout, revised for P4. Three changes from the P3 body:
--
-- 1. Running out of stock raises its own SQLSTATE, OOS01, instead of sharing
--    23514 with "checkout has no email". Callers auto-refund on OOS01 and on
--    nothing else; every other failure keeps retrying.
--    Once an out-of-stock refund is on record for a checkout, the checkout can
--    never become an order, even if stock comes back before a webhook retry —
--    otherwise the buyer could end up with both the book and the refund.
--
-- 2. A discount is recorded as used whenever a code was applied. Before, only
--    codes worth more than zero were counted, so free-shipping codes never hit
--    their usage limits or once-per-customer rule.
--
-- 3. Marketing consent from the checkout's opt-in box. A later order without
--    the box ticked never turns an existing yes into a no; withdrawing consent
--    is a deliberate act, not a side effect of buying another book.

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
declare
  v_checkout public.checkouts;
  v_order public.orders;
  v_existing public.orders;
  v_item jsonb;
  v_variant public.product_variants;
  v_product public.products;
  v_updated integer;
  v_discount public.discounts;
  v_customer_id uuid;
  v_address jsonb;
  v_email text;
  v_name text;
begin
  -- Serialise the two callers against each other.
  select * into v_checkout
  from public.checkouts
  where id = p_checkout_id
  for update;

  if not found then
    raise exception 'checkout % not found', p_checkout_id using errcode = 'P0002';
  end if;

  -- Already done: hand back the same order rather than making a second one.
  if v_checkout.status = 'completed' and v_checkout.completed_order_id is not null then
    select * into v_existing from public.orders where id = v_checkout.completed_order_id;
    return jsonb_build_object(
      'order_id', v_existing.id,
      'order_number', v_existing.order_number,
      'already_existed', true
    );
  end if;

  -- Belt and braces: the unique index on razorpay_order_id is the real
  -- guarantee, but catching it here avoids a pointless failed transaction.
  select * into v_existing
  from public.orders
  where razorpay_order_id = p_razorpay_order_id;

  if found then
    return jsonb_build_object(
      'order_id', v_existing.id,
      'order_number', v_existing.order_number,
      'already_existed', true
    );
  end if;

  -- This payment has already been judged out of stock and is being (or has
  -- been) refunded. Stay out of stock.
  if v_checkout.status = 'refunded' or exists (
    select 1 from public.refunds
    where checkout_id = p_checkout_id and kind = 'out_of_stock'
  ) then
    raise exception 'checkout % was out of stock and is being refunded', p_checkout_id
      using errcode = 'OOS01';
  end if;

  v_address := coalesce(v_checkout.shipping_address, '{}'::jsonb);
  v_email := lower(coalesce(nullif(v_checkout.email, ''), v_address ->> 'email', ''));
  v_name := coalesce(v_address ->> 'name', '');

  if v_email = '' then
    raise exception 'checkout % has no email', p_checkout_id using errcode = '23514';
  end if;

  if jsonb_array_length(coalesce(v_checkout.line_items, '[]'::jsonb)) = 0 then
    raise exception 'checkout % has no line items', p_checkout_id using errcode = '23514';
  end if;

  -- ── Customer ────────────────────────────────────────────────────────────
  insert into public.customers (email, phone, first_name, last_name, accepts_marketing, marketing_consent_at)
  values (
    v_email,
    v_address ->> 'phone',
    split_part(v_name, ' ', 1),
    coalesce(nullif(substring(v_name from position(' ' in v_name) + 1), v_name), ''),
    v_checkout.accepts_marketing,
    case when v_checkout.accepts_marketing then now() end
  )
  on conflict (email) do update
    set phone = coalesce(excluded.phone, public.customers.phone),
        -- A yes stays a yes. Only a fresh yes moves the consent timestamp.
        accepts_marketing = public.customers.accepts_marketing or excluded.accepts_marketing,
        marketing_consent_at = case
          when not public.customers.accepts_marketing and excluded.accepts_marketing then now()
          else public.customers.marketing_consent_at
        end
  returning id into v_customer_id;

  -- ── Order ───────────────────────────────────────────────────────────────
  insert into public.orders (
    email, phone, customer_id, payment_status, fulfillment_status, order_status,
    subtotal_paise, discount_paise, shipping_paise, tax_paise, total_paise,
    discount_code, shipping_address, razorpay_order_id, razorpay_payment_id,
    razorpay_signature, placed_at, source
  ) values (
    v_email,
    v_address ->> 'phone',
    v_customer_id,
    'paid',
    'unfulfilled',
    'open',
    v_checkout.subtotal_paise,
    v_checkout.discount_paise,
    v_checkout.shipping_paise,
    v_checkout.tax_paise,
    v_checkout.total_paise,
    v_checkout.discount_code,
    v_address,
    p_razorpay_order_id,
    p_razorpay_payment_id,
    p_razorpay_signature,
    now(),
    p_source
  )
  returning * into v_order;

  -- ── Line items and stock ────────────────────────────────────────────────
  for v_item in select * from jsonb_array_elements(v_checkout.line_items)
  loop
    select * into v_variant
    from public.product_variants
    where id = (v_item ->> 'variant_id')::uuid;

    if not found then
      raise exception 'variant % no longer exists', v_item ->> 'variant_id'
        using errcode = 'P0002';
    end if;

    select * into v_product from public.products where id = v_variant.product_id;

    -- Guarded decrement. The where clause is what stops an oversell: if two
    -- orders race for the last copy, the second matches no row.
    update public.product_variants
    set inventory_quantity = inventory_quantity - (v_item ->> 'quantity')::integer
    where id = v_variant.id
      and inventory_quantity >= (v_item ->> 'quantity')::integer;

    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'not enough stock for % (% left, % wanted)',
        v_product.title, v_variant.inventory_quantity, v_item ->> 'quantity'
        using errcode = 'OOS01';
    end if;

    insert into public.order_items (
      order_id, product_id, variant_id, title, variant_title, sku,
      unit_price_paise, quantity, total_paise, weight_grams
    ) values (
      v_order.id,
      v_variant.product_id,
      v_variant.id,
      v_product.title,
      v_variant.title,
      v_variant.sku,
      (v_item ->> 'unit_price_paise')::integer,
      (v_item ->> 'quantity')::integer,
      (v_item ->> 'unit_price_paise')::integer * (v_item ->> 'quantity')::integer,
      v_variant.weight_grams
    );

    insert into public.inventory_adjustments (variant_id, delta, reason, order_id, created_by)
    values (
      v_variant.id,
      -((v_item ->> 'quantity')::integer),
      'order',
      v_order.id,
      'checkout'
    );
  end loop;

  -- ── Discount ────────────────────────────────────────────────────────────
  -- Any applied code counts as a use, including free-shipping codes, whose
  -- discount_paise is zero.
  if v_checkout.discount_code is not null then
    select * into v_discount
    from public.discounts
    where code = v_checkout.discount_code
    for update;

    if found then
      update public.discounts
      set used_count = used_count + 1
      where id = v_discount.id;

      insert into public.discount_redemptions (discount_id, order_id, customer_email, amount_paise)
      values (v_discount.id, v_order.id, v_email, v_checkout.discount_paise);
    end if;
  end if;

  -- ── Customer totals ─────────────────────────────────────────────────────
  update public.customers
  set total_orders = total_orders + 1,
      total_spent_paise = total_spent_paise + v_order.total_paise
  where id = v_customer_id;

  -- ── Close the checkout ──────────────────────────────────────────────────
  update public.checkouts
  set status = 'completed',
      completed_order_id = v_order.id
  where id = v_checkout.id;

  -- ── Tell n8n, durably ───────────────────────────────────────────────────
  insert into public.webhook_outbox (topic, payload)
  values (
    'order.paid',
    jsonb_build_object(
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'email', v_order.email,
      'phone', v_order.phone,
      'total_paise', v_order.total_paise,
      'subtotal_paise', v_order.subtotal_paise,
      'discount_paise', v_order.discount_paise,
      'shipping_paise', v_order.shipping_paise,
      'discount_code', v_order.discount_code,
      'shipping_address', v_order.shipping_address,
      'placed_at', v_order.placed_at,
      'accepts_marketing', v_checkout.accepts_marketing,
      'items', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'title', oi.title,
          'variant_title', oi.variant_title,
          'sku', oi.sku,
          'quantity', oi.quantity,
          'unit_price_paise', oi.unit_price_paise,
          'total_paise', oi.total_paise
        )), '[]'::jsonb)
        from public.order_items oi
        where oi.order_id = v_order.id
      )
    )
  );

  return jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'already_existed', false
  );
end;
$$;

revoke execute on function public.create_order_from_checkout(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_order_from_checkout(uuid, text, text, text, text) to service_role;
