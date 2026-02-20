-- Fix: subscription_active debe ser false por defecto para usuarios free.
-- Los inserts desde ensureUserRow, user-created y user-onboarding no setean el campo;
-- con default true todos los usuarios nuevos quedaban con subscription_active = true.

ALTER TABLE public.users
  ALTER COLUMN subscription_active SET DEFAULT false;

-- Corregir filas existentes: usuarios free con subscription_active = true
UPDATE public.users
SET subscription_active = false
WHERE (subscription_plan IS NULL OR subscription_plan = 'free')
  AND subscription_active = true;
