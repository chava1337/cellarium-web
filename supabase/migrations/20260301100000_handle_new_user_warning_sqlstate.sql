-- Mejora diagnóstico: WARNING en handle_new_user incluye SQLSTATE para depurar fallos al crear branch por defecto.
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
    id, email, name, role, status, branch_id, owner_id,
    signup_method, owner_email_verified, created_at, updated_at
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
        RAISE WARNING 'handle_new_user: error creando/asignando branch por defecto para owner %: % (SQLSTATE: %)', NEW.id, SQLERRM, SQLSTATE;
    END;
  END IF;

  RETURN NEW;
END;
$function$;
