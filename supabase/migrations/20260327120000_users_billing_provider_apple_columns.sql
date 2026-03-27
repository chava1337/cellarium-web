-- Billing provider + Apple IAP identifiers. Default 'none'; migración posterior ajusta Stripe/Apple.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS billing_provider text DEFAULT 'none';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS apple_original_transaction_id text;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS apple_product_id text;

COMMENT ON COLUMN public.users.billing_provider IS 'none | stripe | apple (constraint en migración posterior)';
COMMENT ON COLUMN public.users.apple_original_transaction_id IS 'Apple IAP original transaction id cuando billing_provider = apple';
COMMENT ON COLUMN public.users.apple_product_id IS 'Apple product id del plan activo cuando billing_provider = apple';
