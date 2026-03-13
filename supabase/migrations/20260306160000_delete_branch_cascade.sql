-- RPC real: borrado total y seguro de sucursal adicional.
-- Solo branch no principal del owner autenticado. Todo amarrado a p_branch_id.

CREATE OR REPLACE FUNCTION public.delete_branch_cascade(p_branch_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id uuid;
  v_branch_id uuid;
  v_branch_name text;
  v_branch_owner_id uuid;
  v_is_main boolean;
  v_staff_ids uuid[] := '{}';
  v_staff_count int := 0;
  v_deleted_branch_count int := 0;
  v_result json;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Not authenticated'
    );
  END IF;

  -- Branch existe
  SELECT id, name, owner_id, COALESCE(is_main, false)
  INTO v_branch_id, v_branch_name, v_branch_owner_id, v_is_main
  FROM public.branches
  WHERE id = p_branch_id
  LIMIT 1;

  IF v_branch_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Branch not found'
    );
  END IF;

  IF v_branch_owner_id IS DISTINCT FROM v_caller_id THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Not authorized: branch belongs to another owner'
    );
  END IF;

  IF v_is_main THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Cannot delete main branch'
    );
  END IF;

  -- A. Obtener IDs del staff asignado a esta branch (excluir owner)
  SELECT COALESCE(array_agg(id), '{}')
  INTO v_staff_ids
  FROM public.users
  WHERE branch_id = p_branch_id
    AND COALESCE(role, '') <> 'owner';

  v_staff_count := array_length(v_staff_ids, 1);
  IF v_staff_count IS NULL THEN
    v_staff_count := 0;
  END IF;

  -- B. Borrar tablas no cubiertas por FK
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'guest_sessions') THEN
    DELETE FROM public.guest_sessions
    WHERE branch_id = p_branch_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'qr_tokens_backup') THEN
    DELETE FROM public.qr_tokens_backup
    WHERE branch_id = p_branch_id;
  END IF;

  -- C. Borrar usuarios staff de esta branch
  DELETE FROM public.users
  WHERE branch_id = p_branch_id
    AND COALESCE(role, '') <> 'owner';

  -- D. Borrar la branch (doble chequeo: id, owner, no principal)
  DELETE FROM public.branches
  WHERE id = p_branch_id
    AND owner_id = v_caller_id
    AND COALESCE(is_main, false) = false;

  GET DIAGNOSTICS v_deleted_branch_count = ROW_COUNT;

  IF v_deleted_branch_count <> 1 THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Branch could not be deleted (constraint or already removed)'
    );
  END IF;

  -- E. CASCADE elimina: cocktail_menu, inventory_movements, qr_tokens, sales, tasting_exams, wine_branch_stock

  v_result := json_build_object(
    'success', true,
    'branch_id', p_branch_id,
    'branch_name', v_branch_name,
    'deleted_staff_user_ids', v_staff_ids,
    'deleted_staff_count', v_staff_count,
    'message', 'Branch and related data deleted successfully'
  );

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.delete_branch_cascade(uuid) IS
  'Borra una sucursal adicional (is_main = false) del owner autenticado y todo lo relacionado. Staff de esa branch se elimina; devuelve sus IDs para que la Edge borre auth.users.';

GRANT EXECUTE ON FUNCTION public.delete_branch_cascade(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_branch_cascade(uuid) TO service_role;
