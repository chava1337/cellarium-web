-- Fix: owner signup (Google OAuth) fallaba por branch_id residual en metadata (FK users_branch_id_fkey).
-- 1) Para owner normal, forzar v_branch_id := NULL (luego se crea Sucursal Principal y se asigna).
-- 2) Detectar Google OAuth por raw_app_meta_data->>'provider' y setear signup_method/owner_email_verified.

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
  v_signup_intent TEXT;
  v_intent TEXT;
  v_is_staff_invite boolean;
  v_name TEXT;
BEGIN
  v_qr_token := NEW.raw_user_meta_data->>'qrToken';
  v_invitation_type := NEW.raw_user_meta_data->>'invitationType';
  v_signup_method := NEW.raw_user_meta_data->>'signup_method';
  v_signup_intent := NEW.raw_user_meta_data->>'signup_intent';
  v_intent := NEW.raw_user_meta_data->>'intent';

  -- Detección Google OAuth: provider en app metadata (no depende de signup_method en user_meta)
  IF NULLIF(TRIM(COALESCE(NEW.raw_app_meta_data->>'provider', '')), '') = 'google' THEN
    v_signup_method := 'google';
  END IF;

  v_is_staff_invite := (
    v_invitation_type = 'admin_invite'
    OR v_signup_intent = 'staff_invite'
    OR v_intent = 'staff_invite'
  );

  IF v_qr_token IS NOT NULL AND length(trim(v_qr_token)) > 0 THEN
    SELECT owner_id, branch_id INTO v_owner_id, v_branch_id
    FROM public.qr_tokens
    WHERE token = v_qr_token
    LIMIT 1;
  ELSE
    v_branch_id := (NULLIF(trim(NEW.raw_user_meta_data->>'branchId'), ''))::UUID;
    IF v_is_staff_invite THEN
      v_owner_id := (NULLIF(trim(NEW.raw_user_meta_data->>'ownerId'), ''))::UUID;
    END IF;
  END IF;

  IF NOT v_is_staff_invite THEN
    v_owner_id := NEW.id;
    v_branch_id := NULL;
  END IF;

  IF v_invitation_type = 'admin_invite' OR v_is_staff_invite THEN
    v_signup_method := COALESCE(v_signup_method, 'admin_invite');
    v_owner_email_verified := true;
  ELSIF v_signup_method = 'google' THEN
    v_owner_email_verified := true;
  ELSE
    v_signup_method := COALESCE(v_signup_method, 'password');
    v_owner_email_verified := false;
  END IF;

  v_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), ''),
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.users (
    id, email, name, role, status, branch_id, owner_id,
    signup_method, owner_email_verified, created_at, updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    v_name,
    CASE WHEN v_is_staff_invite THEN 'staff' ELSE 'owner' END,
    CASE WHEN v_is_staff_invite THEN 'pending' ELSE 'active' END,
    v_branch_id,
    v_owner_id,
    v_signup_method,
    COALESCE(v_owner_email_verified, false),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_is_staff_invite THEN
    UPDATE auth.users SET email_confirmed_at = NOW() WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  IF v_branch_id IS NULL THEN
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
        RAISE WARNING 'handle_new_user: error creando/asignando branch por defecto para owner %: % (SQLSTATE: %)', NEW.id, SQLERRM, SQLSTATE;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Trigger after insert auth.users: insert public.users. Owner: branch_id=NULL luego Sucursal Principal. Staff si admin_invite/signup_intent. Google OAuth vía raw_app_meta_data->>provider.';
