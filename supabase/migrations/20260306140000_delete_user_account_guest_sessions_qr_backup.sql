-- Fase 1: Cerrar huecos del borrado total de cuenta owner.
-- Añade limpieza explícita de guest_sessions y qr_tokens_backup
-- cuyos branch_id pertenecen a branches del owner (antes de borrar branches).

CREATE OR REPLACE FUNCTION public.delete_user_account(p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_role TEXT;
  v_owner_id UUID;
  v_user_email TEXT;
  v_result JSON;
  v_deleted_count INTEGER := 0;
BEGIN
  SELECT role, COALESCE(owner_id, id), email INTO v_user_role, v_owner_id, v_user_email
  FROM public.users
  WHERE id = p_user_id
  LIMIT 1;

  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  IF v_user_role = 'owner' THEN
    -- 1. Eliminar exámenes de cata y respuestas
    DELETE FROM public.tasting_responses
    WHERE user_id IN (
      SELECT id FROM public.users WHERE owner_id = p_user_id
    );

    DELETE FROM public.tasting_wine_responses
    WHERE tasting_response_id IN (
      SELECT id FROM public.tasting_responses
      WHERE user_id IN (SELECT id FROM public.users WHERE owner_id = p_user_id)
    );

    DELETE FROM public.tasting_exam_wines
    WHERE tasting_exam_id IN (
      SELECT id FROM public.tasting_exams WHERE owner_id = p_user_id
    );

    DELETE FROM public.tasting_exam_pdfs
    WHERE tasting_exam_id IN (
      SELECT id FROM public.tasting_exams WHERE owner_id = p_user_id
    );

    DELETE FROM public.tasting_exams
    WHERE owner_id = p_user_id;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Eliminados % exámenes de cata', v_deleted_count;

    -- 2. Eliminar usuarios staff del owner
    DELETE FROM public.users
    WHERE owner_id = p_user_id;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Eliminados % usuarios staff', v_deleted_count;

    -- 3. Eliminar vinos del catálogo del owner
    DELETE FROM public.wine_branch_stock
    WHERE branch_id IN (
      SELECT id FROM public.branches WHERE owner_id = p_user_id
    );

    DELETE FROM public.inventory_movements
    WHERE branch_id IN (
      SELECT id FROM public.branches WHERE owner_id = p_user_id
    );

    DELETE FROM public.wines
    WHERE owner_id = p_user_id;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Eliminados % vinos', v_deleted_count;

    -- 3.5. Eliminar guest_sessions de branches del owner (antes de borrar branches)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'guest_sessions') THEN
      DELETE FROM public.guest_sessions
      WHERE branch_id IN (
        SELECT id FROM public.branches WHERE owner_id = p_user_id
      );
      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
      RAISE NOTICE 'Eliminados % guest_sessions', v_deleted_count;
    END IF;

    -- 3.6. Eliminar qr_tokens_backup de branches del owner (antes de borrar branches)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'qr_tokens_backup') THEN
      DELETE FROM public.qr_tokens_backup
      WHERE branch_id IN (
        SELECT id FROM public.branches WHERE owner_id = p_user_id
      );
      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
      RAISE NOTICE 'Eliminados % qr_tokens_backup', v_deleted_count;
    END IF;

    -- 4. Eliminar sucursales
    DELETE FROM public.branches
    WHERE owner_id = p_user_id;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Eliminados % sucursales', v_deleted_count;

    -- 5. Eliminar QR tokens
    DELETE FROM public.qr_tokens
    WHERE owner_id = p_user_id;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Eliminados % QR tokens', v_deleted_count;

    -- 6. Eliminar ventas (si existe tabla sales)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales' AND table_schema = 'public') THEN
      DELETE FROM public.sales
      WHERE branch_id IN (
        SELECT id FROM public.branches WHERE owner_id = p_user_id
      );
    END IF;

    -- 7. Eliminar rate limits (usar email guardado)
    IF v_user_email IS NOT NULL THEN
      DELETE FROM public.rate_limits
      WHERE identifier LIKE '%' || v_user_email || '%';
    END IF;
  ELSE
    DELETE FROM public.tasting_responses
    WHERE user_id = p_user_id;

    DELETE FROM public.tasting_wine_responses
    WHERE tasting_response_id IN (
      SELECT id FROM public.tasting_responses WHERE user_id = p_user_id
    );
  END IF;

  -- 8. Eliminar usuario de public.users
  DELETE FROM public.users
  WHERE id = p_user_id;

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
      'error', CASE WHEN COALESCE(current_setting('app.debug', true), '') = 'true' THEN SQLERRM ELSE NULL END,
      'sqlstate', CASE WHEN COALESCE(current_setting('app.debug', true), '') = 'true' THEN SQLSTATE ELSE NULL END
    );
END;
$function$;

COMMENT ON FUNCTION public.delete_user_account(uuid) IS
  'Elimina cuenta y datos relacionados. Owner: tasting_*, staff, wines, wine_branch_stock, inventory_movements, guest_sessions, qr_tokens_backup, branches, qr_tokens, sales, rate_limits, public.users. Fase 1: incluye guest_sessions y qr_tokens_backup por branches del owner.';
