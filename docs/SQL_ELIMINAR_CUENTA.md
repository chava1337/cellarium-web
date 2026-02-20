# 📋 SQL para Eliminar Cuenta - Ejecutar Manualmente

## ⚠️ IMPORTANTE
Ejecuta este SQL en el **Supabase SQL Editor**:

---

## 1️⃣ Crear Función delete_user_account

```sql
-- ========================================
-- Migración: Función para eliminar cuenta de usuario
-- Descripción: Elimina toda la información relacionada con un usuario
-- ========================================

-- Función para eliminar cuenta de usuario
CREATE OR REPLACE FUNCTION public.delete_user_account(
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role TEXT;
  v_owner_id UUID;
  v_result JSON;
  v_deleted_count INTEGER := 0;
BEGIN
  -- Verificar que el usuario existe
  SELECT role, COALESCE(owner_id, id) INTO v_user_role, v_owner_id
  FROM public.users
  WHERE id = p_user_id
  LIMIT 1;

  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  -- Si es owner, eliminar todo relacionado
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

    -- 7. Eliminar rate limits
    DELETE FROM public.rate_limits
    WHERE identifier LIKE '%' || (SELECT email FROM public.users WHERE id = p_user_id) || '%';
  ELSE
    -- Si no es owner, solo eliminar datos del usuario
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

  -- Retornar resultado
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
    -- Retornar error
    SELECT json_build_object(
      'success', false,
      'error', SQLERRM,
      'message', 'Error eliminando cuenta de usuario'
    ) INTO v_result;
    
    RETURN v_result;
END;
$$;
```

---

## 2️⃣ Dar Permisos

```sql
-- Dar permisos de ejecución
GRANT EXECUTE ON FUNCTION public.delete_user_account TO authenticated;

-- Comentario
COMMENT ON FUNCTION public.delete_user_account IS 
  'Elimina cuenta de usuario y todos los datos relacionados. Si es owner, elimina también staff, vinos, sucursales, etc.';
```

---

## 3️⃣ Verificación

```sql
-- Verificar que la función se creó
SELECT 
  routine_name,
  routine_type,
  data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'delete_user_account';

SELECT '✅ Función delete_user_account creada exitosamente' as status;
```

---

## 📝 Notas Importantes

1. **Edge Function**: Después de ejecutar este SQL, necesitas desplegar la Edge Function `delete-user-account` desde el archivo `supabase/functions/delete-user-account/index.ts`

2. **Eliminación de auth.users**: La Edge Function se encarga de eliminar también el usuario de `auth.users` usando la API de administración de Supabase.

3. **Cascada**: La función elimina en este orden:
   - Exámenes de cata y respuestas
   - Usuarios staff (si es owner)
   - Vinos y stock
   - Sucursales
   - QR tokens
   - Ventas (si existe)
   - Rate limits
   - Usuario de public.users
   - Usuario de auth.users (via Edge Function)

4. **Seguridad**: Solo el usuario autenticado puede eliminar su propia cuenta (verificado en la Edge Function).

---

## ✅ Checklist

- [ ] Ejecutar SQL 1 (Crear función)
- [ ] Ejecutar SQL 2 (Dar permisos)
- [ ] Ejecutar SQL 3 (Verificación)
- [ ] Desplegar Edge Function `delete-user-account`
- [ ] Probar eliminación de cuenta (owner)
- [ ] Probar eliminación de cuenta (staff)

---

**Después de ejecutar estos SQLs y desplegar la Edge Function, la funcionalidad de eliminar cuenta estará lista.**

