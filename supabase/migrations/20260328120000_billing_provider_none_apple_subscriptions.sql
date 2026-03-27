-- billing_provider: none | stripe | apple (NOT NULL default none)
-- Safe backfill for existing rows (Stripe customers, Apple-only, free)
-- subscriptions.apple_original_transaction_id: clave de upsert para IAP (Stripe sigue usando stripe_subscription_id)

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS apple_original_transaction_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_apple_original_transaction_id_key'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_apple_original_transaction_id_key UNIQUE (apple_original_transaction_id);
  END IF;
END $$;

COMMENT ON COLUMN public.subscriptions.apple_original_transaction_id IS 'Apple IAP original transaction id; único por fila cuando la suscripción es Apple';

-- Asegurar columnas en users (idempotente con migración previa)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS billing_provider text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS apple_original_transaction_id text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS apple_product_id text;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_billing_provider_check;

-- Backfill seguro (corrige default antiguo 'stripe' en usuarios sin Stripe real)
UPDATE public.users SET billing_provider = 'stripe' WHERE stripe_customer_id IS NOT NULL;
UPDATE public.users SET billing_provider = 'apple'
WHERE stripe_customer_id IS NULL AND apple_original_transaction_id IS NOT NULL;
UPDATE public.users SET billing_provider = 'none'
WHERE stripe_customer_id IS NULL AND apple_original_transaction_id IS NULL;

ALTER TABLE public.users ALTER COLUMN billing_provider SET DEFAULT 'none';
ALTER TABLE public.users ALTER COLUMN billing_provider SET NOT NULL;

ALTER TABLE public.users ADD CONSTRAINT users_billing_provider_check
  CHECK (billing_provider IN ('none', 'stripe', 'apple'));

COMMENT ON COLUMN public.users.billing_provider IS 'none | stripe | apple — canal de facturación de la suscripción activa';
COMMENT ON COLUMN public.users.apple_original_transaction_id IS 'Apple IAP original transaction id cuando billing_provider = apple';
COMMENT ON COLUMN public.users.apple_product_id IS 'Apple product id del plan activo cuando billing_provider = apple';
