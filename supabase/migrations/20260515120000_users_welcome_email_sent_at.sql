-- Idempotencia para correo de bienvenida (Resend vía Edge Function).
-- NULL = aún no enviado; timestamptz = primer envío exitoso registrado por backend.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamptz NULL;

COMMENT ON COLUMN public.users.welcome_email_sent_at IS
  'Marca de tiempo del primer envío exitoso del correo de bienvenida. NULL = pendiente. Lo actualiza la Edge send-welcome-email tras Resend OK.';

-- Búsquedas de pendientes (sweeps/colas) sin escanear toda la tabla.
CREATE INDEX IF NOT EXISTS idx_users_welcome_email_pending
  ON public.users (id)
  WHERE welcome_email_sent_at IS NULL;
