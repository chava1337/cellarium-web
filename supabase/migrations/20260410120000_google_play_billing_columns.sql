-- Fase 2: Google Play Billing — columnas en subscriptions + billing_provider google en users
-- Sin add-ons (solo planes base).

-- 1) Ampliar CHECK billing_provider en users
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_billing_provider_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_billing_provider_check
  CHECK (billing_provider IN ('none', 'stripe', 'apple', 'google'));

COMMENT ON COLUMN public.users.billing_provider IS 'none | stripe | apple | google — canal de facturación activo';

-- 2) Columnas Google en public.subscriptions (fuente de verdad del token en fila activa)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS google_purchase_token text;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS google_product_id text;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS google_order_id text;

COMMENT ON COLUMN public.subscriptions.google_purchase_token IS 'Purchase token de Google Play; único por suscripción cuando el proveedor es Google';
COMMENT ON COLUMN public.subscriptions.google_product_id IS 'Product ID de Play (ej. cellarium_bistro_monthly)';
COMMENT ON COLUMN public.subscriptions.google_order_id IS 'latestOrderId u orden equivalente devuelta por la API';

-- 3) Índice único parcial: un token solo puede asociarse a una fila
DROP INDEX IF EXISTS subscriptions_google_purchase_token_unique;
CREATE UNIQUE INDEX subscriptions_google_purchase_token_unique
  ON public.subscriptions (google_purchase_token)
  WHERE google_purchase_token IS NOT NULL;
