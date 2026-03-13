-- Fix delete_user_account: orden de borrado correcto, IDs capturados antes de borrar, observabilidad (step, SQLERRM, SQLSTATE).
-- Causa raíz: se borraba tasting_responses antes que tasting_wine_responses (FK response_id), y branches antes que sales/guest_sessions/etc.

CREATE OR REPLACE FUNCTION public.delete_user_account(p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO public
AS $function$
DECLARE
  v_user_role TEXT;
  v_owner_id UUID;
  v_user_email TEXT;
  v_result JSON;
  v_deleted_count INTEGER := 0;
  v_step TEXT := 'init';

  -- IDs capturados antes de borrar (owner)
  v_staff_ids UUID[] := ARRAY[]::UUID[];
  v_branch_ids UUID[] := ARRAY[]::UUID[];
  v_exam_ids UUID[] := ARRAY[]::UUID[];
  v_response_ids UUID[] := ARRAY[]::UUID[];
  v_sale_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  v_step := 'select_user';
  SELECT role, COALESCE(owner_id, id), email INTO v_user_role, v_owner_id, v_user_email
  FROM public.users
  WHERE id = p_user_id
  LIMIT 1;

  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  IF v_user_role = 'owner' THEN
    -- Capturar todos los IDs antes de borrar nada
    v_step := 'capture_ids';
    SELECT COALESCE(array_agg(id), ARRAY[]::UUID[]) INTO v_staff_ids
    FROM public.users WHERE owner_id = p_user_id;

    SELECT COALESCE(array_agg(id), ARRAY[]::UUID[]) INTO v_branch_ids
    FROM public.branches WHERE owner_id = p_user_id;

    SELECT COALESCE(array_agg(id), ARRAY[]::UUID[]) INTO v_exam_ids
    FROM public.tasting_exams WHERE owner_id = p_user_id;

    SELECT COALESCE(array_agg(id), ARRAY[]::UUID[]) INTO v_response_ids
    FROM public.tasting_responses WHERE user_id = ANY(v_staff_ids);

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales') THEN
      SELECT COALESCE(array_agg(id), ARRAY[]::UUID[]) INTO v_sale_ids
      FROM public.sales WHERE branch_id = ANY(v_branch_ids);
    END IF;

    -- 1. Catas: primero hijos de responses, luego responses, luego hijos de exams, luego exams
    v_step := 'tasting_wine_responses';
    IF array_length(v_response_ids, 1) > 0 THEN
      DELETE FROM public.tasting_wine_responses WHERE response_id = ANY(v_response_ids);
    END IF;

    v_step := 'tasting_responses';
    DELETE FROM public.tasting_responses WHERE user_id = ANY(v_staff_ids);

    v_step := 'tasting_exam_pdfs';
    IF array_length(v_exam_ids, 1) > 0 THEN
      DELETE FROM public.tasting_exam_pdfs WHERE exam_id = ANY(v_exam_ids);
    END IF;

    v_step := 'tasting_exam_wines';
    IF array_length(v_exam_ids, 1) > 0 THEN
      DELETE FROM public.tasting_exam_wines WHERE exam_id = ANY(v_exam_ids);
    END IF;

    v_step := 'tasting_exams';
    DELETE FROM public.tasting_exams WHERE owner_id = p_user_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Eliminados % exámenes de cata', v_deleted_count;

    -- 2. Ventas: sale_items antes que sales (por FK)
    v_step := 'sale_items';
    IF array_length(v_sale_ids, 1) > 0 AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sale_items') THEN
      DELETE FROM public.sale_items WHERE sale_id = ANY(v_sale_ids);
    END IF;

    v_step := 'sales';
    IF array_length(v_branch_ids, 1) > 0 AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales') THEN
      DELETE FROM public.sales WHERE branch_id = ANY(v_branch_ids);
    END IF;

    -- 3. Resto por branch_id (antes de borrar branches)
    v_step := 'guest_sessions';
    IF array_length(v_branch_ids, 1) > 0 AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'guest_sessions') THEN
      DELETE FROM public.guest_sessions WHERE branch_id = ANY(v_branch_ids);
    END IF;

    v_step := 'qr_tokens_backup';
    IF array_length(v_branch_ids, 1) > 0 AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'qr_tokens_backup') THEN
      DELETE FROM public.qr_tokens_backup WHERE branch_id = ANY(v_branch_ids);
    END IF;

    v_step := 'wine_branch_stock';
    IF array_length(v_branch_ids, 1) > 0 THEN
      DELETE FROM public.wine_branch_stock WHERE branch_id = ANY(v_branch_ids);
    END IF;

    v_step := 'inventory_movements';
    IF array_length(v_branch_ids, 1) > 0 THEN
      DELETE FROM public.inventory_movements WHERE branch_id = ANY(v_branch_ids);
    END IF;

    -- 4. Vinos del owner
    v_step := 'wines';
    DELETE FROM public.wines WHERE owner_id = p_user_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Eliminados % vinos', v_deleted_count;

    -- 5. Sucursales (ya no tienen dependientes por branch_id)
    v_step := 'branches';
    DELETE FROM public.branches WHERE owner_id = p_user_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Eliminadas % sucursales', v_deleted_count;

    -- 6. QR tokens
    v_step := 'qr_tokens';
    DELETE FROM public.qr_tokens WHERE owner_id = p_user_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Eliminados % QR tokens', v_deleted_count;

    -- 7. Rate limits
    v_step := 'rate_limits';
    IF v_user_email IS NOT NULL THEN
      DELETE FROM public.rate_limits WHERE identifier LIKE '%' || v_user_email || '%';
    END IF;

    -- 8. Staff users
    v_step := 'users_staff';
    DELETE FROM public.users WHERE owner_id = p_user_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Eliminados % usuarios staff', v_deleted_count;
  ELSE
    -- Staff: capturar response_ids del usuario, borrar wine_responses luego responses
    v_step := 'capture_staff_response_ids';
    SELECT COALESCE(array_agg(id), ARRAY[]::UUID[]) INTO v_response_ids
    FROM public.tasting_responses WHERE user_id = p_user_id;

    v_step := 'tasting_wine_responses_staff';
    IF array_length(v_response_ids, 1) > 0 THEN
      DELETE FROM public.tasting_wine_responses WHERE response_id = ANY(v_response_ids);
    END IF;

    v_step := 'tasting_responses_staff';
    DELETE FROM public.tasting_responses WHERE user_id = p_user_id;
  END IF;

  -- 9. Usuario en public.users (owner o staff)
  v_step := 'users_self';
  DELETE FROM public.users WHERE id = p_user_id;

  SELECT json_build_object(
    'success', true,
    'message', CASE
      WHEN v_user_role = 'owner' THEN 'Cuenta de owner eliminada exitosamente. Todos los datos relacionados fueron eliminados.'
      ELSE 'Cuenta eliminada exitosamente.'
    END,
    'user_role', v_user_role
  ) INTO v_result;

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Error eliminando cuenta de usuario',
      'error', SQLERRM,
      'sqlstate', SQLSTATE,
      'step', v_step
    );
END;
$function$;

COMMENT ON FUNCTION public.delete_user_account(uuid) IS
  'Elimina cuenta y datos relacionados. Orden: captura IDs; tasting_wine_responses→tasting_responses→exam_pdfs/wines→exams; sale_items→sales; guest_sessions/qr_backup/wine_branch_stock/inventory_movements→wines→branches→qr_tokens→rate_limits→users. EXCEPTION devuelve step, SQLERRM, SQLSTATE.';
