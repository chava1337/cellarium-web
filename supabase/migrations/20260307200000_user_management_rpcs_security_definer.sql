-- User Management via SECURITY DEFINER RPCs (versión endurecida)
-- Permite que owner y gerente gestionen usuarios sin depender de RLS amplia ni recursiva sobre public.users.
-- Gerente: solo usuarios de su misma sucursal. Owner: toda la organización.
-- Endurecimientos: row_security off, search_path, actor active, validaciones de estado/rol idéntico.

-- =============================================================================
-- 1) list_manageable_users()
-- Devuelve los usuarios que el actor puede gestionar (para Gestión de Usuarios).
-- Owner: todos los de su organización (owner_id = actor o id = actor), incluyéndose a sí mismo.
-- Gerente: solo usuarios de su misma sucursal, excluyendo explícitamente role = 'owner'.
-- Actor debe estar status = 'active'; si no, retorna vacío.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.list_manageable_users()
RETURNS SETOF public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  actor_role text;
  actor_status text;
  actor_owner_id uuid;
  actor_branch_id uuid;
BEGIN
  SELECT u.role, u.status, u.owner_id, u.branch_id
  INTO actor_role, actor_status, actor_owner_id, actor_branch_id
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1;

  IF actor_role IS NULL THEN
    RETURN;
  END IF;

  IF actor_status IS DISTINCT FROM 'active' THEN
    RETURN; -- actor inactivo: no puede gestionar, retornar vacío
  END IF;

  IF actor_role = 'owner' THEN
    RETURN QUERY
    SELECT *
    FROM public.users
    WHERE owner_id = auth.uid() OR id = auth.uid()
    ORDER BY created_at DESC;
    RETURN;
  END IF;

  IF actor_role = 'gerente' AND actor_owner_id IS NOT NULL AND actor_branch_id IS NOT NULL THEN
    RETURN QUERY
    SELECT *
    FROM public.users
    WHERE owner_id = actor_owner_id
      AND branch_id = actor_branch_id
      AND role IS DISTINCT FROM 'owner'
    ORDER BY created_at DESC;
    RETURN;
  END IF;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.list_manageable_users() IS
  'Lista usuarios que el actor puede gestionar. Owner: toda la org (incl. sí mismo); gerente: misma sucursal, excl. owner. Actor debe estar active. SECURITY DEFINER.';

-- =============================================================================
-- 2) approve_staff_request_managed(p_target_user_id, p_new_role)
-- Aprobar un usuario pendiente: activar y asignar rol.
-- Validaciones: actor active, owner o gerente; target status = 'pending'; mismo ámbito; rol permitido.
-- staff_join_requests: se asume columnas requester_user_id, owner_id, branch_id, status (ajustar si la tabla difiere).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.approve_staff_request_managed(
  p_target_user_id uuid,
  p_new_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  actor_id uuid;
  actor_role text;
  actor_status text;
  actor_owner_id uuid;
  actor_branch_id uuid;
  target_role text;
  target_owner_id uuid;
  target_branch_id uuid;
  target_status text;
  allowed_roles text[] := ARRAY['gerente','sommelier','supervisor','personal'];
BEGIN
  actor_id := auth.uid();
  IF actor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'No autenticado');
  END IF;

  SELECT u.role, u.status, u.owner_id, u.branch_id
  INTO actor_role, actor_status, actor_owner_id, actor_branch_id
  FROM public.users u
  WHERE u.id = actor_id
  LIMIT 1;

  IF actor_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Usuario no encontrado');
  END IF;

  IF actor_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Usuario inactivo');
  END IF;

  IF actor_role NOT IN ('owner', 'gerente') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Sin permiso para aprobar');
  END IF;

  SELECT u.role, u.owner_id, u.branch_id, u.status
  INTO target_role, target_owner_id, target_branch_id, target_status
  FROM public.users u
  WHERE u.id = p_target_user_id
  LIMIT 1;

  IF target_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Usuario objetivo no encontrado');
  END IF;

  IF target_role = 'owner' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'No se puede aprobar al owner');
  END IF;

  IF target_status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Solo se puede aprobar un usuario con estado pendiente');
  END IF;

  IF actor_role = 'gerente' THEN
    IF actor_owner_id IS NULL OR actor_branch_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'message', 'Gerente sin sucursal');
    END IF;
    IF target_owner_id IS DISTINCT FROM actor_owner_id OR target_branch_id IS DISTINCT FROM actor_branch_id THEN
      RETURN jsonb_build_object('ok', false, 'message', 'Usuario no pertenece a tu sucursal');
    END IF;
    allowed_roles := ARRAY['sommelier','supervisor','personal'];
  ELSE
    IF target_owner_id IS DISTINCT FROM actor_id THEN
      RETURN jsonb_build_object('ok', false, 'message', 'Usuario no pertenece a tu organización');
    END IF;
  END IF;

  IF p_new_role IS NULL OR NOT (p_new_role = ANY (allowed_roles)) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Rol no permitido: ' || COALESCE(p_new_role, 'null'));
  END IF;

  -- staff_join_requests: asumido requester_user_id, owner_id, branch_id, status (ajustar si esquema difiere)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'staff_join_requests'
  ) THEN
    UPDATE public.staff_join_requests
    SET status = 'approved'
    WHERE requester_user_id = p_target_user_id
      AND status = 'pending'
      AND (actor_role = 'owner' OR (owner_id = actor_owner_id AND branch_id = actor_branch_id));
  END IF;

  UPDATE public.users
  SET
    status = 'active',
    role = p_new_role,
    approved_by = actor_id,
    approved_at = now(),
    updated_at = now()
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'No se pudo actualizar el usuario');
  END IF;

  RETURN jsonb_build_object('ok', true, 'message', 'Aprobado');
END;
$$;

COMMENT ON FUNCTION public.approve_staff_request_managed(uuid, text) IS
  'Aprobar usuario pendiente. Actor active, target status=pending, ámbito y rol validados. SECURITY DEFINER.';

-- =============================================================================
-- 3) change_staff_role_managed(p_target_user_id, p_new_role)
-- Cambiar rol de un usuario activo (no owner). Si ya tiene ese rol, no hace UPDATE.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.change_staff_role_managed(
  p_target_user_id uuid,
  p_new_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  actor_id uuid;
  actor_role text;
  actor_status text;
  actor_owner_id uuid;
  actor_branch_id uuid;
  target_role text;
  target_owner_id uuid;
  target_branch_id uuid;
  allowed_roles text[] := ARRAY['gerente','sommelier','supervisor','personal'];
BEGIN
  actor_id := auth.uid();
  IF actor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'No autenticado');
  END IF;

  SELECT u.role, u.status, u.owner_id, u.branch_id
  INTO actor_role, actor_status, actor_owner_id, actor_branch_id
  FROM public.users u
  WHERE u.id = actor_id
  LIMIT 1;

  IF actor_role IS NULL OR actor_role NOT IN ('owner', 'gerente') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Sin permiso para cambiar rol');
  END IF;

  IF actor_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Usuario inactivo');
  END IF;

  SELECT u.role, u.owner_id, u.branch_id
  INTO target_role, target_owner_id, target_branch_id
  FROM public.users u
  WHERE u.id = p_target_user_id
  LIMIT 1;

  IF target_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Usuario objetivo no encontrado');
  END IF;

  IF target_role = 'owner' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'No se puede cambiar el rol del owner');
  END IF;

  IF actor_role = 'gerente' THEN
    IF actor_owner_id IS NULL OR actor_branch_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'message', 'Gerente sin sucursal');
    END IF;
    IF target_owner_id IS DISTINCT FROM actor_owner_id OR target_branch_id IS DISTINCT FROM actor_branch_id THEN
      RETURN jsonb_build_object('ok', false, 'message', 'Usuario no pertenece a tu sucursal');
    END IF;
    allowed_roles := ARRAY['sommelier','supervisor','personal'];
  ELSE
    IF target_owner_id IS DISTINCT FROM actor_id THEN
      RETURN jsonb_build_object('ok', false, 'message', 'Usuario no pertenece a tu organización');
    END IF;
  END IF;

  IF p_new_role IS NULL OR NOT (p_new_role = ANY (allowed_roles)) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Rol no permitido: ' || COALESCE(p_new_role, 'null'));
  END IF;

  IF target_role = p_new_role THEN
    RETURN jsonb_build_object('ok', true, 'message', 'El usuario ya tiene ese rol');
  END IF;

  UPDATE public.users
  SET role = p_new_role, updated_at = now()
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'No se pudo actualizar el rol');
  END IF;

  RETURN jsonb_build_object('ok', true, 'message', 'Rol actualizado');
END;
$$;

COMMENT ON FUNCTION public.change_staff_role_managed(uuid, text) IS
  'Cambiar rol de usuario activo. Si ya tiene el rol no hace update. Actor active. SECURITY DEFINER.';

-- =============================================================================
-- 4) reject_staff_request_managed(p_target_user_id)
-- Rechazar solicitud: solo si target está pendiente. Marcar inactivo y solicitud rechazada si aplica.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.reject_staff_request_managed(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  actor_id uuid;
  actor_role text;
  actor_status text;
  actor_owner_id uuid;
  actor_branch_id uuid;
  target_role text;
  target_owner_id uuid;
  target_branch_id uuid;
  target_status text;
BEGIN
  actor_id := auth.uid();
  IF actor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'No autenticado');
  END IF;

  SELECT u.role, u.status, u.owner_id, u.branch_id
  INTO actor_role, actor_status, actor_owner_id, actor_branch_id
  FROM public.users u
  WHERE u.id = actor_id
  LIMIT 1;

  IF actor_role IS NULL OR actor_role NOT IN ('owner', 'gerente') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Sin permiso para rechazar');
  END IF;

  IF actor_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Usuario inactivo');
  END IF;

  SELECT u.role, u.owner_id, u.branch_id, u.status
  INTO target_role, target_owner_id, target_branch_id, target_status
  FROM public.users u
  WHERE u.id = p_target_user_id
  LIMIT 1;

  IF target_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Usuario objetivo no encontrado');
  END IF;

  IF target_role = 'owner' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'No se puede rechazar al owner');
  END IF;

  IF target_status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Solo se puede rechazar un usuario con estado pendiente');
  END IF;

  IF actor_role = 'gerente' THEN
    IF actor_owner_id IS NULL OR actor_branch_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'message', 'Gerente sin sucursal');
    END IF;
    IF target_owner_id IS DISTINCT FROM actor_owner_id OR target_branch_id IS DISTINCT FROM actor_branch_id THEN
      RETURN jsonb_build_object('ok', false, 'message', 'Usuario no pertenece a tu sucursal');
    END IF;
  ELSE
    IF target_owner_id IS DISTINCT FROM actor_id THEN
      RETURN jsonb_build_object('ok', false, 'message', 'Usuario no pertenece a tu organización');
    END IF;
  END IF;

  -- staff_join_requests: asumido requester_user_id, owner_id, branch_id, status
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'staff_join_requests'
  ) THEN
    UPDATE public.staff_join_requests
    SET status = 'rejected'
    WHERE requester_user_id = p_target_user_id
      AND status = 'pending'
      AND (actor_role = 'owner' OR (owner_id = actor_owner_id AND branch_id = actor_branch_id));
  END IF;

  UPDATE public.users
  SET status = 'inactive', updated_at = now()
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'No se pudo actualizar');
  END IF;

  RETURN jsonb_build_object('ok', true, 'message', 'Rechazado');
END;
$$;

COMMENT ON FUNCTION public.reject_staff_request_managed(uuid) IS
  'Rechazar solicitud de staff. Actor active, target status=pending. SECURITY DEFINER.';

-- Permisos: solo usuarios autenticados pueden invocar (la lógica interna restringe por rol y status)
GRANT EXECUTE ON FUNCTION public.list_manageable_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_staff_request_managed(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_staff_role_managed(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_staff_request_managed(uuid) TO authenticated;
