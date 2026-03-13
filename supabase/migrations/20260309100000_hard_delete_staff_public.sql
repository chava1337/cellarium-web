-- RPC para limpieza en public de un staff (solo datos). Llamada desde Edge Function con service_role tras validar permisos.
-- NO valida permisos: la Edge hard-delete-staff ya validó actor (owner/gerente) y alcance.
-- Defensa en capas: rechaza si el target es owner o no existe.

CREATE OR REPLACE FUNCTION public.hard_delete_staff_public(p_target_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_role text;
  v_target_email text;
  v_response_ids uuid[];
  v_step text := 'init';
BEGIN
  -- Defensa: solo permitir borrar no-owner
  SELECT role, email INTO v_target_role, v_target_email
  FROM public.users
  WHERE id = p_target_user_id
  LIMIT 1;

  IF v_target_role IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Usuario no encontrado');
  END IF;

  IF v_target_role = 'owner' THEN
    RETURN json_build_object('success', false, 'message', 'No se puede eliminar al owner');
  END IF;

  -- 1. qr_tokens: created_by o used_by = target (FK a users)
  v_step := 'qr_tokens';
  DELETE FROM public.qr_tokens
  WHERE created_by = p_target_user_id OR used_by = p_target_user_id;

  -- 2. tasting: wine_responses (hijos) luego responses
  v_step := 'capture_response_ids';
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_response_ids
  FROM public.tasting_responses WHERE user_id = p_target_user_id;

  v_step := 'tasting_wine_responses';
  IF array_length(v_response_ids, 1) > 0 THEN
    DELETE FROM public.tasting_wine_responses WHERE response_id = ANY(v_response_ids);
  END IF;

  v_step := 'tasting_responses';
  DELETE FROM public.tasting_responses WHERE user_id = p_target_user_id;

  -- 3. staff_join_requests (si existe)
  v_step := 'staff_join_requests';
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'staff_join_requests') THEN
    DELETE FROM public.staff_join_requests WHERE requester_user_id = p_target_user_id;
  END IF;

  -- 4. rate_limits por email
  v_step := 'rate_limits';
  IF v_target_email IS NOT NULL AND trim(v_target_email) <> '' THEN
    DELETE FROM public.rate_limits WHERE identifier LIKE '%' || v_target_email || '%';
  END IF;

  -- 5. public.users (último)
  v_step := 'users';
  DELETE FROM public.users WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'No se pudo eliminar el usuario');
  END IF;

  RETURN json_build_object('success', true, 'message', 'Staff eliminado de la base de datos');

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Error eliminando staff',
      'step', v_step,
      'error', SQLERRM,
      'sqlstate', SQLSTATE
    );
END;
$$;

COMMENT ON FUNCTION public.hard_delete_staff_public(uuid) IS
  'Limpieza public de un staff: qr_tokens, tasting_*, staff_join_requests, rate_limits, users. Solo para uso desde Edge hard-delete-staff. No borra auth.users.';

-- Solo service_role debe invocarla (la Edge usa service_role). No grant a authenticated para evitar llamadas directas.
GRANT EXECUTE ON FUNCTION public.hard_delete_staff_public(uuid) TO service_role;
