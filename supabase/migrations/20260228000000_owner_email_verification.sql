-- Owner email verification: columns on users + email_verification_tokens + handle_new_user update
-- Staff (admin_invite) unchanged. Owner manual: signup_method='password', owner_email_verified=false.
-- Owner Google: signup_method='google', owner_email_verified=true (set by app/Edge post-login if not in metadata).

-- 1) Add columns to public.users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS signup_method text,
  ADD COLUMN IF NOT EXISTS owner_email_verified boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.signup_method IS 'password | google | admin_invite. Set by handle_new_user from raw_user_meta_data or by Edge ensure-owner-oauth-metadata.';
COMMENT ON COLUMN public.users.owner_email_verified IS 'For owners: true when email verified (Google) or after verify-owner-email. Staff irrelevant.';

-- Backfill: existing owners are treated as already verified so they are not locked out.
-- Disable free-plan limit trigger so the UPDATE does not raise (it only changes verification flags).
ALTER TABLE public.users DISABLE TRIGGER trg_enforce_free_user_limits_on_update;
UPDATE public.users
SET owner_email_verified = true, signup_method = COALESCE(signup_method, 'google')
WHERE role = 'owner' AND (owner_email_verified = false OR owner_email_verified IS NULL);
ALTER TABLE public.users ENABLE TRIGGER trg_enforce_free_user_limits_on_update;

-- 2) Table for one-time verification codes (only Edge with service_role should access)
CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_owner_id
  ON public.email_verification_tokens(owner_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at
  ON public.email_verification_tokens(expires_at);

-- RLS: block anon/authenticated from reading; only service_role (Edge) can insert/update/select
ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;

-- No policies: no select/insert/update/delete for anon or authenticated. Service role bypasses RLS.
CREATE POLICY "no_access_email_verification_tokens"
  ON public.email_verification_tokens
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- 3) Replace handle_new_user to set signup_method and owner_email_verified
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_qr_token TEXT;
  v_branch_id UUID;
  v_invitation_type TEXT;
  v_owner_id UUID;
  v_signup_method TEXT;
  v_owner_email_verified boolean;
BEGIN
  v_qr_token := NEW.raw_user_meta_data->>'qrToken';
  v_invitation_type := NEW.raw_user_meta_data->>'invitationType';
  v_signup_method := NEW.raw_user_meta_data->>'signup_method';

  IF v_qr_token IS NOT NULL THEN
    SELECT owner_id, branch_id INTO v_owner_id, v_branch_id
    FROM public.qr_tokens
    WHERE token = v_qr_token
    LIMIT 1;
  ELSE
    v_branch_id := (NEW.raw_user_meta_data->>'branchId')::UUID;
  END IF;

  -- signup_method and owner_email_verified by flow
  IF v_invitation_type = 'admin_invite' THEN
    v_signup_method := COALESCE(v_signup_method, 'admin_invite');
    v_owner_email_verified := true;
  ELSIF v_signup_method = 'google' THEN
    v_owner_email_verified := true;
  ELSE
    v_signup_method := COALESCE(v_signup_method, 'password');
    v_owner_email_verified := false;
  END IF;

  INSERT INTO public.users (
    id,
    email,
    name,
    role,
    status,
    branch_id,
    owner_id,
    signup_method,
    owner_email_verified,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    CASE WHEN v_invitation_type = 'admin_invite' THEN 'staff' ELSE 'owner' END,
    CASE WHEN v_invitation_type = 'admin_invite' THEN 'pending' ELSE 'active' END,
    v_branch_id,
    v_owner_id,
    v_signup_method,
    v_owner_email_verified,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_invitation_type = 'admin_invite' THEN
    UPDATE auth.users SET email_confirmed_at = NOW() WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  IF v_invitation_type IS DISTINCT FROM 'admin_invite' AND v_branch_id IS NULL THEN
    BEGIN
      SELECT id INTO v_branch_id
      FROM public.branches
      WHERE owner_id = NEW.id
      ORDER BY (CASE WHEN is_main = true THEN 0 ELSE 1 END), created_at ASC
      LIMIT 1;

      IF v_branch_id IS NULL THEN
        INSERT INTO public.branches (name, address, owner_id, is_main, created_at, updated_at)
        VALUES ('Sucursal Principal', 'Dirección por definir', NEW.id, true, NOW(), NOW())
        RETURNING id INTO v_branch_id;
      END IF;

      UPDATE public.users
      SET branch_id = v_branch_id, updated_at = NOW()
      WHERE id = NEW.id AND branch_id IS NULL;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'handle_new_user: error creando/asignando branch por defecto para owner %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;
