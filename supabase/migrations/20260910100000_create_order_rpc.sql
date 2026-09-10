-- The real body of create_order_from_checkout.
--
-- Everything here happens in one transaction: the order, its items, the
-- inventory decrement, the discount counters, the customer totals, the
-- checkout being marked done, and the outbox row for n8n. If any of it fails,
-- none of it happened — which is the only way to be sure a payment can never
-- leave a paid customer without an order, or sell the last copy twice.
--
-- Called by /api/checkout/confirm (the browser callback) and by
-- /api/webhooks/razorpay (Razorpay's own, authoritative call). Both race; the
-- checkout row lock and the unique razorpay_order_id decide, and the loser gets
-- the winner's order back rather than an error.
--
-- Money is never recomputed here. The amounts on the checkout row are what the
-- server quoted and what Razorpay actually charged; recomputing could disagree
-- with the captured payment if a price changed mid-flow.

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
  insert into public.customers (email, phone, first_name, last_name)
  values (
    v_email,
    v_address ->> 'phone',
    split_part(v_name, ' ', 1),
    coalesce(nullif(substring(v_name from position(' ' in v_name) + 1), v_name), '')
  )
  on conflict (email) do update
    set phone = coalesce(excluded.phone, public.customers.phone)
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
        using errcode = '23514';
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
  if v_checkout.discount_code is not null and v_checkout.discount_paise > 0 then
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
