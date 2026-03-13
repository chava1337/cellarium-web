-- Preview / dry-run para borrado de sucursal. NO borra nada.
-- Valida: branch existe, pertenece a auth.uid(), no es principal.
-- Devuelve conteos exactos de filas que serían afectadas por branch_id.
-- Uso: preparar validaciones para la futura delete_branch_cascade.

CREATE OR REPLACE FUNCTION public.preview_delete_branch_cascade(p_branch_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_branch_id uuid;
  v_branch_name text;
  v_branch_owner_id uuid;
  v_is_main boolean;
  v_caller_id uuid;
  v_users_count bigint := 0;
  v_guest_sessions_count bigint := 0;
  v_qr_tokens_backup_count bigint := 0;
  v_inventory_movements_count bigint := 0;
  v_wine_branch_stock_count bigint := 0;
  v_qr_tokens_count bigint := 0;
  v_sales_count bigint := 0;
  v_tasting_exams_count bigint := 0;
  v_cocktail_menu_count bigint := 0;
  v_result json;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Not authenticated'
    );
  END IF;

  -- 1. Branch existe
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

  -- 2. Solo el owner de la branch puede borrarla
  IF v_branch_owner_id IS DISTINCT FROM v_caller_id THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Not authorized: branch belongs to another owner'
    );
  END IF;

  -- 3. No se puede borrar la branch principal
  IF v_is_main THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Cannot delete main branch'
    );
  END IF;

  -- 4. Conteos estrictamente por p_branch_id (sin filtros por owner_id)
  SELECT COUNT(*) INTO v_users_count
  FROM public.users
  WHERE branch_id = p_branch_id;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'guest_sessions') THEN
    SELECT COUNT(*) INTO v_guest_sessions_count
    FROM public.guest_sessions
    WHERE branch_id = p_branch_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'qr_tokens_backup') THEN
    SELECT COUNT(*) INTO v_qr_tokens_backup_count
    FROM public.qr_tokens_backup
    WHERE branch_id = p_branch_id;
  END IF;

  SELECT COUNT(*) INTO v_inventory_movements_count
  FROM public.inventory_movements
  WHERE branch_id = p_branch_id;

  SELECT COUNT(*) INTO v_wine_branch_stock_count
  FROM public.wine_branch_stock
  WHERE branch_id = p_branch_id;

  SELECT COUNT(*) INTO v_qr_tokens_count
  FROM public.qr_tokens
  WHERE branch_id = p_branch_id;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales') THEN
    SELECT COUNT(*) INTO v_sales_count
    FROM public.sales
    WHERE branch_id = p_branch_id;
  END IF;

  SELECT COUNT(*) INTO v_tasting_exams_count
  FROM public.tasting_exams
  WHERE branch_id = p_branch_id;

  SELECT COUNT(*) INTO v_cocktail_menu_count
  FROM public.cocktail_menu
  WHERE branch_id = p_branch_id;

  v_result := json_build_object(
    'success', true,
    'data', json_build_object(
      'branch_id', v_branch_id,
      'branch_name', v_branch_name,
      'branch_owner_id', v_branch_owner_id,
      'is_main', v_is_main,
      'users_to_delete_count', v_users_count,
      'guest_sessions_to_delete_count', v_guest_sessions_count,
      'qr_tokens_backup_to_delete_count', v_qr_tokens_backup_count,
      'inventory_movements_count', v_inventory_movements_count,
      'wine_branch_stock_count', v_wine_branch_stock_count,
      'qr_tokens_count', v_qr_tokens_count,
      'sales_count', v_sales_count,
      'tasting_exams_count', v_tasting_exams_count,
      'cocktail_menu_count', v_cocktail_menu_count
    )
  );

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.preview_delete_branch_cascade(uuid) IS
  'Preview/dry-run: no borra nada. Valida que la branch exista, pertenezca a auth.uid() y no sea principal; devuelve conteos de filas que serían afectadas por branch_id. Para uso previo a delete_branch_cascade.';

GRANT EXECUTE ON FUNCTION public.preview_delete_branch_cascade(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_delete_branch_cascade(uuid) TO service_role;
