# Fix handle_new_user — v_is_staff_invite null-safe (signup owner Google OAuth)

## Por qué ocurría el bug

Con **Google OAuth**, `raw_user_meta_data` no suele traer `invitationType`, `signup_intent` ni `intent`. Esas variables quedan **NULL**.

La expresión:

```sql
v_is_staff_invite := (
  v_invitation_type = 'admin_invite'
  OR v_signup_intent = 'staff_invite'
  OR v_intent = 'staff_invite'
);
```

con los tres NULL se evalúa como `(NULL OR NULL OR NULL)` → **NULL**.  
Entonces `v_is_staff_invite` es **NULL**, no `false`.

En SQL, `IF NOT NULL` no es verdadero: la condición no se cumple y el bloque **no se ejecuta**. Por tanto:

- No se hace `v_owner_id := NEW.id`
- No se hace `v_branch_id := NULL`
- El INSERT se hace con `role = 'owner'` (por el CASE cuando `v_is_staff_invite` es NULL) y `owner_id` sigue NULL.
- El constraint `users_owner_owner_id_required` exige que los owner tengan `owner_id` no NULL → **violación**.

---

## Diff SQL exacto

**1. Asignación de v_is_staff_invite: que nunca sea NULL**

```diff
-  v_is_staff_invite := (
-    v_invitation_type = 'admin_invite'
-    OR v_signup_intent = 'staff_invite'
-    OR v_intent = 'staff_invite'
-  );
+  -- Nunca NULL: en OAuth los campos pueden venir NULL y (NULL = 'x') es NULL
+  v_is_staff_invite := (
+    COALESCE(v_invitation_type, '') = 'admin_invite'
+    OR COALESCE(v_signup_intent, '') = 'staff_invite'
+    OR COALESCE(v_intent, '') = 'staff_invite'
+  );
```

**2. Bloque owner normal: condición explícita y null-safe**

```diff
  v_step := 'normalize_owner_context';
-  IF NOT v_is_staff_invite THEN
+  -- Explícito y null-safe: owner normal cuando no es staff invite (evita NOT NULL = no ejecutar)
+  IF COALESCE(v_is_staff_invite, false) = false THEN
     v_owner_id := NEW.id;
     v_branch_id := NULL;
   END IF;
```

Lo demás (detección Google, staff invite por QR, name, Sucursal Principal, observabilidad) se deja igual.

---

## Función final corregida

La función completa está en:

**`supabase/migrations/20260308300000_handle_new_user_null_safe_staff_invite.sql`**

---

## Checklist manual de validación

- [ ] **Signup nuevo owner con Google OAuth**
  - [ ] El signup termina sin "Database error saving new user".
  - [ ] En `public.users` hay una fila con `id` = auth user, `role = 'owner'`, `owner_id = id` (mismo que el usuario, no NULL).
  - [ ] `branch_id` queda primero NULL en el INSERT y luego se actualiza a la branch "Sucursal Principal" creada para ese owner.
  - [ ] Existe una branch "Sucursal Principal" con `owner_id` = ese user y `is_main = true`.

- [ ] **Staff invite por QR**
  - [ ] Flujo de invitación admin (QR con token) crea usuario con `role = 'staff'`, `status = 'pending'`, `owner_id` y `branch_id` correctos según el token.
  - [ ] No se crea Sucursal Principal para ese usuario.

- [ ] **Signup owner con email/password**
  - [ ] Signup clásico con email y contraseña crea fila en `users` con `role = 'owner'`, `owner_id = id`, se crea Sucursal Principal y se asigna `branch_id`.
  - [ ] Sin errores de constraint ni comportamiento distinto al esperado.
