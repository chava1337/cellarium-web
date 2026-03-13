-- Add cancel_at_period_end flag to users so UI can show "Cancelada. Se desactiva el {date}"
-- when user cancelled in Stripe Portal (customer.subscription.updated sets this in Stripe).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.subscription_cancel_at_period_end IS 'True when Stripe subscription has cancel_at_period_end; UI shows "Se desactiva el {date}" instead of "Se renueva".';
