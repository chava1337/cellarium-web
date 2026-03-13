-- Migración: crear sucursal por defecto para owner nuevo en handle_new_user
-- Garantiza que todo owner insertado sin branch_id reciba una branch "Sucursal Principal"
-- y que users.branch_id quede actualizado. No afecta a staff (admin_invite).

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
BEGIN
  -- Extraer datos del QR del metadata del usuario
  v_qr_token := NEW.raw_user_meta_data->>'qrToken';
  v_invitation_type := NEW.raw_user_meta_data->>'invitationType';
  
  -- Si hay invitación por QR, obtener el owner_id y branch_id del QR token
  IF v_qr_token IS NOT NULL THEN
    SELECT owner_id, branch_id INTO v_owner_id, v_branch_id
    FROM public.qr_tokens
    WHERE token = v_qr_token
    LIMIT 1;
  ELSE
    -- Si no hay QR token, es registro libre de owner - obtener branch_id del metadata
    v_branch_id := (NEW.raw_user_meta_data->>'branchId')::UUID;
  END IF;
  
  -- Insertar usuario en public.users
  INSERT INTO public.users (
    id,
    email,
    name,
    role,
    status,
    branch_id,
    owner_id,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    CASE 
      WHEN v_invitation_type = 'admin_invite' THEN 'staff'
      ELSE 'owner'
    END,
    CASE 
      WHEN v_invitation_type = 'admin_invite' THEN 'pending'
      ELSE 'active'
    END,
    v_branch_id,
    v_owner_id,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  
  -- Si es staff invitado, confirmar el email automáticamente (bloque EXACTO como antes)
  IF v_invitation_type = 'admin_invite' THEN
    UPDATE auth.users
    SET email_confirmed_at = NOW()
    WHERE id = NEW.id;
    RETURN NEW;
  END IF;
  
  -- Owner: si branch_id quedó NULL, asegurar sucursal por defecto (reutilizar existente o crear)
  IF v_invitation_type IS DISTINCT FROM 'admin_invite' AND v_branch_id IS NULL THEN
    BEGIN
      -- Buscar branch existente del owner (preferir is_main=true, sino la más antigua)
      SELECT id INTO v_branch_id
      FROM public.branches
      WHERE owner_id = NEW.id
      ORDER BY (CASE WHEN is_main = true THEN 0 ELSE 1 END), created_at ASC
      LIMIT 1;
      
      IF v_branch_id IS NULL THEN
        INSERT INTO public.branches (name, address, owner_id, is_main, created_at, updated_at)
        VALUES (
          'Sucursal Principal',
          'Dirección por definir',
          NEW.id,
          true,
          NOW(),
          NOW()
        )
        RETURNING id INTO v_branch_id;
      END IF;
      
      UPDATE public.users
      SET branch_id = v_branch_id, updated_at = NOW()
      WHERE id = NEW.id AND branch_id IS NULL;
      
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'handle_new_user: error creando/asignando branch por defecto para owner %: %', NEW.id, SQLERRM;
        -- No re-lanzar: el usuario ya fue insertado; la app puede crear branch por otro camino
    END;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- =============================================================================
-- Manual test SQL (validación tras aplicar migración)
-- =============================================================================
-- a) Ver últimos usuarios y su branch_id (tras crear un owner nuevo por signup):
--
--   SELECT id, email, role, branch_id, owner_id, created_at
--   FROM public.users
--   ORDER BY created_at DESC
--   LIMIT 5;
--
--   Reemplazar <owner_id> por el id del owner recién creado:
--
--   SELECT id, owner_id, name, is_main, created_at
--   FROM public.branches
--   WHERE owner_id = '<owner_id>';
--
--   Debe existir al menos una fila con name = 'Sucursal Principal', is_main = true,
--   y public.users.branch_id del owner debe coincidir con branches.id.
--
-- b) Confirmar que staff_invite NO crea branch:
--
--   Crear en auth un usuario con raw_user_meta_data: { "qrToken": "<token_admin_invite>", "invitationType": "admin_invite" }.
--   Tras el trigger, en public.users el nuevo usuario debe tener role = 'staff', status = 'pending',
--   branch_id = el branch_id del qr_tokens (no null si el token tiene branch_id).
--   No debe existir una branch nueva con owner_id = ese user.id (el staff no es owner).
-- =============================================================================
