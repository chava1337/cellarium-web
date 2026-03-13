# handle_new_user — observabilidad temporal para diagnosticar signup OAuth owner

## Diff SQL exacto (vs 20260308100000)

**1. DECLARE: agregar variable de paso**

```diff
 DECLARE
+  v_step TEXT := 'init';
   v_qr_token TEXT;
```

**2. Inicio del cuerpo: marcar paso read_metadata**

```diff
 BEGIN
+  v_step := 'read_metadata';
   v_qr_token := NEW.raw_user_meta_data->>'qrToken';
```

**3. Antes del bloque QR/metadata: resolve_invite_context y normalize_owner_context**

```diff
   v_is_staff_invite := (...);

+  v_step := 'resolve_invite_context';
   IF v_qr_token IS NOT NULL AND length(trim(v_qr_token)) > 0 THEN
     ...
   END IF;

+  v_step := 'normalize_owner_context';
   IF NOT v_is_staff_invite THEN
```

**4. Envolver INSERT en public.users y re-raizar con contexto**

```diff
   v_name := COALESCE(...);

+  BEGIN
+    v_step := 'insert_public_user';
     INSERT INTO public.users (...)
     VALUES (...)
     ON CONFLICT (id) DO NOTHING;
+  EXCEPTION
+    WHEN OTHERS THEN
+      RAISE EXCEPTION 'handle_new_user failed at step=% | SQLERRM=% | SQLSTATE=% | email=% | provider=% | role=% | owner_id=% | branch_id=%',
+        v_step, SQLERRM, SQLSTATE, NEW.email, COALESCE(NEW.raw_app_meta_data->>'provider',''), CASE WHEN v_is_staff_invite THEN 'staff' ELSE 'owner' END, v_owner_id, v_branch_id;
+  END;
```

**5. Bloque Sucursal Principal: v_step y RAISE EXCEPTION en lugar de RAISE WARNING**

```diff
   IF v_branch_id IS NULL THEN
     BEGIN
+      v_step := 'create_default_branch';
       SELECT id INTO v_branch_id FROM public.branches ...
       IF v_branch_id IS NULL THEN
         INSERT INTO public.branches ...
       END IF;

+      v_step := 'assign_default_branch';
       UPDATE public.users SET branch_id = v_branch_id ...
     EXCEPTION
       WHEN OTHERS THEN
-        RAISE WARNING 'handle_new_user: error creando/asignando branch ...';
+        RAISE EXCEPTION 'handle_new_user failed at step=% | SQLERRM=% | SQLSTATE=% | user_id=% | email=%',
+          v_step, SQLERRM, SQLSTATE, NEW.id, NEW.email;
     END;
   END IF;

+  v_step := 'finish';
   RETURN NEW;
```

**6. Sin más cambios**

- Se mantiene: `v_branch_id := NULL` para owner normal, detección Google por `raw_app_meta_data->>'provider'`, flujo QR/staff invite (ownerId/branchId cuando aplica).

---

## Función completa (temporal instrumentada)

La función completa está en:

**`supabase/migrations/20260308200000_handle_new_user_observability.sql`**

Pasos usados: `init` → `read_metadata` → `resolve_invite_context` → `normalize_owner_context` → `insert_public_user` → (si owner y branch_id NULL) `create_default_branch` → `assign_default_branch` → `finish`.

---

## Prueba para obtener el error real

1. **Aplicar la migración**  
   Ejecutar la migración en el proyecto (por ejemplo `supabase db push` o aplicar solo `20260308200000_handle_new_user_observability.sql` en la BD).

2. **Reproducir signup owner con Google OAuth**  
   - Desde la app (o el flujo que estés usando), hacer signup de un **nuevo** owner solo con Google (cuenta que no exista en auth ni en `public.users`).  
   - No usar QR ni staff invite.

3. **Dónde ver el error**  
   - Si falla en el **INSERT** en `public.users`, el trigger propagará una excepción con mensaje:  
     `handle_new_user failed at step=insert_public_user | SQLERRM=... | SQLSTATE=... | email=... | provider=... | role=owner | owner_id=... | branch_id=...`  
   - Si falla al **crear o asignar** la Sucursal Principal, el mensaje será:  
     `handle_new_user failed at step=create_default_branch` o `step=assign_default_branch | SQLERRM=... | SQLSTATE=... | user_id=... | email=...`

4. **Dónde leerlo**  
   - En **Supabase Dashboard**: Logs de Postgres / extensión que muestre errores de triggers.  
   - O en **logs de Auth**: el mensaje "Database error saving new user" suele ir acompañado del detalle del error de la base (según configuración del proyecto).  
   - Con `supabase db push` o ejecución directa en SQL, el cliente que ejecute el insert en `auth.users` puede recibir el texto completo de la excepción (según cómo Supabase Auth propague el error).

5. **Interpretación**  
   - `step=insert_public_user`: fallo en el INSERT (constraint, tipo, null, etc.); usar `SQLERRM` y `SQLSTATE`.  
   - `step=create_default_branch`: fallo en SELECT o INSERT de `branches`.  
   - `step=assign_default_branch`: fallo en UPDATE de `public.users` (branch_id/updated_at).  
   Los valores `email`, `provider`, `role`, `owner_id`, `branch_id` (o `user_id`/`email` en el bloque de branch) permiten comprobar el contexto en el que falló.

Tras identificar la causa, se puede quitar la observabilidad (volver a RAISE WARNING en el bloque de branch y eliminar el BEGIN/EXCEPTION del INSERT si se prefiere no re-raizar con mensaje custom) y dejar solo el fix definitivo.
