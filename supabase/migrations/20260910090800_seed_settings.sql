-- The settings singleton. Values are edited from /admin/settings later; these
-- are the defaults the app falls back to on a fresh database.

insert into public.settings (key, value, is_public) values
  (
    'store_public',
    jsonb_build_object(
      'name', 'Aalmaram',
      'support_email', 'foundersteam@aalmaram.com',
      'site_url', 'https://aalmaram.com'
    ),
    true
  ),
  (
    'store',
    jsonb_build_object(
      'gst_number', '',
      'invoice_prefix', 'AAL',
      'admin_notify_email', 'foundersteam@aalmaram.com',
      'from_orders', 'Aalmaram <foundersteam@aalmaram.com>',
      'from_marketing', 'Aalmaram <letters@aalmaram.com>'
    ),
    false
  ),
  (
    -- PLACEHOLDER RATES — confirm before phase 3 goes live.
    'shipping',
    jsonb_build_object(
      'flat_rate_paise', 6000,
      'free_threshold_paise', 99900,
      'state_overrides', '{}'::jsonb
    ),
    true
  ),
  (
    'inventory',
    jsonb_build_object('low_stock_threshold', 5),
    false
  ),
  (
    'shiprocket',
    jsonb_build_object('token', null, 'token_expires_at', null, 'pickup_location', ''),
    false
  ),
  (
    'features',
    jsonb_build_object('checkout_enabled', true),
    true
  )
on conflict (key) do nothing;
