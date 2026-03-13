# Fix handle_new_user — signup owner con Google OAuth

## Causa del fallo

- En signup de **owner** con Google OAuth, `handle_new_user()` podía usar un `branchId` residual en `raw_user_meta_data` (sesión anterior, estado persistido, etc.).
- El INSERT en `public.users` con ese `branch_id` fallaba por FK `users_branch_id_fkey` si el UUID no existía en `branches` o no pertenecía al owner.
- Para owner nuevo, `branch_id` debe ser NULL; después la función crea "Sucursal Principal" y actualiza `users.branch_id`.

Además, con OAuth el cliente no siempre envía `signup_method` en `raw_user_meta_data`, por lo que la detección de Google debe poder hacerse con `raw_app_meta_data->>'provider'`.

---

## Diff SQL (fragmento relevante)

**1. Limpiar `v_branch_id` para owner normal**

```diff
  IF NOT v_is_staff_invite THEN
    v_owner_id := NEW.id;
+   v_branch_id := NULL;
  END IF;
```

**2. Detección Google por provider (después de leer signup_intent/intent, antes de v_is_staff_invite)**

```diff
  v_signup_method := NEW.raw_user_meta_data->>'signup_method';
  v_signup_intent := NEW.raw_user_meta_data->>'signup_intent';
  v_intent := NEW.raw_user_meta_data->>'intent';

+ -- Detección Google OAuth: provider en app metadata (no depende de signup_method en user_meta)
+ IF NULLIF(TRIM(COALESCE(NEW.raw_app_meta_data->>'provider', '')), '') = 'google' THEN
+   v_signup_method := 'google';
+ END IF;
+
  v_is_staff_invite := (
```

El resto de la función se mantiene (flujo QR/staff invite, ownerId/branchId cuando es staff, fallback de name).

---

## Por qué corrige el signup OAuth owner

1. **`v_branch_id := NULL` en owner**  
   Para todo usuario que no es staff invite se fuerza `branch_id` a NULL antes del INSERT. Así no se usa ningún `branchId` residual de metadata y se evita la violación de FK. Luego el bloque existente crea "Sucursal Principal" y hace UPDATE de `users.branch_id`.

2. **Detección de Google por `provider`**  
   Supabase Auth rellena `raw_app_meta_data->>'provider'` (p. ej. `'google'`) en login OAuth. Si coincide con `'google'`, se fija `v_signup_method := 'google'`, y más abajo `ELSIF v_signup_method = 'google'` hace `v_owner_email_verified := true`. El signup deja de depender de que el cliente envíe `signup_method` en user metadata.

---

## Checklist manual de validación

- [ ] **Signup nuevo owner con Google OAuth**  
  Registrar un owner nuevo solo con Google (sin QR, sin staff invite).  
  - [ ] No aparece "Database error saving new user"; el signup termina bien.  
  - [ ] Existe una fila en `public.users` con `id` = auth user, `role = 'owner'`, `signup_method = 'google'`, `owner_email_verified = true`.  
  - [ ] Existe una branch "Sucursal Principal" con `owner_id` = ese user y `is_main = true`.  
  - [ ] En `public.users`, `branch_id` del owner apunta a esa branch recién creada.

- [ ] **Staff invite por QR**  
  Flujo de invitación admin (QR con token).  
  - [ ] El nuevo usuario se crea en `public.users` con `role = 'staff'`, `status = 'pending'`, `owner_id` y `branch_id` correctos según el token.  
  - [ ] No se crea "Sucursal Principal" para ese usuario.  
  - [ ] Nombre sigue viniendo de name → username → email local part.

- [ ] **Owner con email/password**  
  Signup clásico con email y contraseña (sin Google).  
  - [ ] Se crea fila en `users`, se crea Sucursal Principal y se asigna `branch_id`.  
  - [ ] `signup_method = 'password'` (o el que envíe el cliente) y `owner_email_verified = false` (salvo que se verifique después).
