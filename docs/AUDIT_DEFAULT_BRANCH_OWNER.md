# Auditoría: creación de sucursal por defecto para owner nuevo

**Objetivo:** Encontrar el mecanismo que creaba la sucursal default para un owner nuevo y por qué ya no se crea.  
**Reglas:** Solo auditoría y propuesta; no implementar cambios.

---

## 1. Búsquedas realizadas — paths y snippets

### 1.1 Términos: "default branch", "Sucursal Principal", "create_default_branch", RPCs

| Búsqueda | Resultados (paths exactos) |
|----------|----------------------------|
| "default branch" / "Sucursal Principal" / "create_default_branch" | **BranchManagementScreen.tsx** línea 539: solo `export default` (falso positivo). **AUDIT_MULTI_BRANCH_IMPLEMENTATION.md** línea 105: texto "Sucursal Principal" y "user-created (owner, sin branchId) se inserta una branch …". |
| create_owner_branch / create_default_branch / user_onboarding (RPC) | **Ninguna migración** define RPC con esos nombres. No existe en repo. |

**Snippet relevante (doc):**

```105:106:docs/AUDIT_MULTI_BRANCH_IMPLEMENTATION.md
- **Creación de branch:** En `user-created` (owner, sin branchId) se inserta una branch "Sucursal Principal" y se actualiza `users.branch_id`. En `BranchManagementScreen` y `AuthContext` (ensureUserRow) no se crea branch; la creación explícita es en BranchManagementScreen vía `supabase.from('branches').insert(...)`.
```

### 1.2 Triggers sobre public.users o public.branches

| Archivo | Trigger | Tabla | Evento |
|---------|---------|--------|--------|
| **supabase/migrations/20260207213838_remote_schema.sql** | `trg_enforce_free_user_limits_on_update` | **public.users** | BEFORE UPDATE (línea 4316) |
| **supabase/migrations/20260207213838_remote_schema.sql** | `trg_enforce_branch_limit` | **public.branches** | BEFORE INSERT (línea 4304) |

**No hay en el repo** ningún `CREATE TRIGGER ... ON public.users ... AFTER INSERT` ni `ON INSERT ON public.users`.

Snippet (triggers en schema):

```4304:4316:supabase/migrations/20260207213838_remote_schema.sql
CREATE TRIGGER trg_enforce_branch_limit BEFORE INSERT ON public.branches FOR EACH ROW EXECUTE FUNCTION enforce_branch_limit();
...
CREATE TRIGGER trg_enforce_free_user_limits_on_update BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION enforce_free_user_limits_on_update();
```

### 1.3 Función handle_new_user (trigger sobre auth.users)

La **función** `handle_new_user()` sí está definida en migraciones; el **trigger** que la ejecuta no.

**Path:** `supabase/migrations/20260207213838_remote_schema.sql` líneas 1925–1986.

**Snippet (resumen):**

```1925:1976:supabase/migrations/20260207213838_remote_schema.sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_qr_token TEXT;
  v_branch_id UUID;
  v_invitation_type TEXT;
  v_owner_id UUID;
BEGIN
  v_qr_token := NEW.raw_user_meta_data->>'qrToken';
  v_invitation_type := NEW.raw_user_meta_data->>'invitationType';
  IF v_qr_token IS NOT NULL THEN
    SELECT owner_id, branch_id INTO v_owner_id, v_branch_id
    FROM public.qr_tokens WHERE token = v_qr_token LIMIT 1;
  ELSE
    v_branch_id := (NEW.raw_user_meta_data->>'branchId')::UUID;
  END IF;
  INSERT INTO public.users (
    id, email, name, role, status, branch_id, owner_id, created_at, updated_at
  ) VALUES (
    NEW.id, NEW.email, COALESCE(...), CASE WHEN v_invitation_type = 'admin_invite' THEN 'staff' ELSE 'owner' END,
    CASE WHEN v_invitation_type = 'admin_invite' THEN 'pending' ELSE 'active' END,
    v_branch_id,  -- para owner sin branchId en metadata = NULL
    v_owner_id, NOW(), NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  IF v_invitation_type = 'admin_invite' THEN
    UPDATE auth.users SET email_confirmed_at = NOW() WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;
```

- Esta función **solo inserta** en `public.users`; **no** inserta en `public.branches` ni hace `UPDATE public.users SET branch_id = ...`.
- Para owner sin `branchId` en metadata, `v_branch_id` es NULL → el owner queda con `branch_id = null`.
- En el repo **no** hay `CREATE TRIGGER ... ON auth.users ... EXECUTE FUNCTION handle_new_user()`. Ese trigger se suele crear en Dashboard (Auth → Hooks o Database). Si está creado en producción, el flujo es: signup → trigger en auth.users → handle_new_user → insert en public.users con branch_id null.

### 1.4 Funciones / Edge que insertan en branches y actualizan users.branch_id

**A) Edge user-created**  
**Path:** `supabase/functions/user-created/index.ts`

- Inserta en `public.users` (líneas 179–184) y, **si** `role === 'owner' && !branchId` (líneas 209–244), inserta en `branches` y luego actualiza `users.branch_id`:

```209:243:supabase/functions/user-created/index.ts
    // Si es owner, crear sucursal principal si no hay branchId
    if (role === 'owner' && !branchId) {
      console.log('🏢 Creando sucursal principal para owner...');
      const { data: branch, error: branchError } = await supabaseAdmin
        .from('branches')
        .insert({
          name: `${userName} - Sucursal Principal`,
          address: 'Dirección por definir',
          owner_id: user.id,
          is_main: true,
          ...
        })
        .select()
        .single();
      ...
        const { error: updateError } = await supabaseAdmin
          .from('users')
          .update({ branch_id: branch.id })
          .eq('id', user.id);
```

- **Condición que corta la creación de branch:** antes de ese bloque, la Edge comprueba si ya existe fila en `public.users` (líneas 133–137). Si existe, hace **return temprano** (líneas 144–156) y **nunca** llega al bloque que crea la sucursal:

```133:156:supabase/functions/user-created/index.ts
    const { data: existingUser, error: checkError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();
    ...
    if (existingUser) {
      console.log('✅ Usuario ya existe en public.users, no se crea duplicado');
      return new Response(JSON.stringify({ success: true, message: 'Usuario ya existe', user: existingUser }), ...);
    }
```

Por tanto: si algo (p. ej. el trigger `handle_new_user`) ya insertó la fila en `public.users`, la Edge considera que el usuario “ya existe” y sale sin crear branch ni actualizar `branch_id`.

**B) Edge user-onboarding**  
**Path:** `supabase/functions/user-onboarding/index.ts`

- Pensada para evento `SIGNUP`: inserta en `users`, luego inserta en `branches` (`name: `${userData.name} - Sucursal Principal``), luego actualiza `users.branch_id` (líneas 55–79).
- Usa cliente con JWT (anon + Authorization). Si el trigger ya insertó en `public.users`, el segundo insert (users) fallaría por duplicado; además el flujo actual de la app no invoca esta Edge en el registro normal (AuthScreen no la usa; el bloque que invocaba user-created está comentado).

**C) AuthContext (app)**  
**Path:** `src/contexts/AuthContext.tsx`

- **createDefaultBranch** (líneas 468–525): insert en `branches` (“Sucursal Principal”), sin actualizar `users` en ese mismo trozo.
- **createOwnerUser** (líneas 360–466): insert en `users`, llama a `createDefaultBranch`, luego actualiza `users.branch_id` (líneas 437–441). Se usa desde **ensureDeepLinkUser** cuando no existe fila en `public.users` (línea 321, tras error PGRST116). En el flujo de registro “normal” (sin deep link), si el trigger ya creó la fila, no se llama a `createOwnerUser` y la app nunca crea la sucursal por defecto.

---

## 2. Trigger AFTER INSERT on public.users

- **En migraciones:** No existe ningún `CREATE TRIGGER ... AFTER INSERT ON public.users` (ni ON auth.users) en el repo. Solo existe el trigger **BEFORE UPDATE** en `public.users` (`trg_enforce_free_user_limits_on_update`).
- **Conclusión:** En este repo **no** hay trigger en SQL que se dispare AFTER INSERT en `public.users`. La creación de la branch por defecto para owner **no** estaba implementada en un trigger de BD en el repo; estaba (y sigue estando) en la Edge **user-created** y en la app (**AuthContext.createOwnerUser**), pero la Edge deja de crear la branch cuando el usuario ya existe en `public.users` (p. ej. por el trigger en auth.users).

---

## 3. Edge Functions: user-created, user-onboarding

| Edge | Crea branches / actualiza users.branch_id | Condición que impide crear branch para owner |
|------|-------------------------------------------|-----------------------------------------------|
| **user-created** | Sí: si `role === 'owner' && !branchId` (líneas 209–244). | **Sí.** Si ya existe fila en `public.users` (id = user.id), hace return antes (líneas 144–156) y no ejecuta el bloque que crea la sucursal. |
| **user-onboarding** | Sí: insert en branches y update users.branch_id (líneas 55–79). | Depende del orden: si antes se insertó en `users` (p. ej. por trigger), el insert de la Edge falla; además la app no invoca esta Edge en el flujo de registro actual. |

**Confirmación:** La condición que “corta” la creación de branch para owner en el flujo actual es el **return temprano cuando `existingUser`** en user-created. Ese `existingUser` pasa a true cuando el trigger `handle_new_user()` (sobre auth.users) ya insertó la fila en `public.users`.

---

## 4. Entregable

### 4.1 Diagnóstico

- **Antes** la sucursal por defecto para owner nuevo se creaba por la **Edge Function user-created**: al no existir fila en `public.users`, la Edge insertaba el usuario y luego, para `role === 'owner' && !branchId`, insertaba la branch “Sucursal Principal” y actualizaba `users.branch_id`.
- **Ahora** ya no se crea porque:
  1. En producción existe (o existió) un **trigger sobre auth.users** que ejecuta `handle_new_user()`. Ese trigger **no** está definido en las migraciones del repo (solo la función); se asume creado en Dashboard.
  2. Ese trigger inserta en `public.users` en el momento del signup, con `branch_id = null` para owner.
  3. Cuando después se invoca la Edge **user-created** (por Auth Hook o por cliente), la Edge ve que el usuario **ya existe** en `public.users` y hace **return temprano** (“Usuario ya existe”) y **nunca** llega al bloque que crea la sucursal y actualiza `users.branch_id`.
- Por tanto: **“Antes se creaba por la Edge user-created cuando no existía fila en public.users; ahora ya no porque el trigger handle_new_user crea antes esa fila y la Edge considera que el usuario ya existe y sale sin crear la branch.”**

### 4.2 Fix mínimo propuesto (una opción recomendada)

Se recomienda la opción **(a) Trigger en BD**, por una sola fuente de verdad y sin depender del orden entre trigger en auth y Edge.

- **(a) Trigger en BD (recomendado)**  
  - **Dónde:** Nueva migración en `supabase/migrations/`.  
  - **Qué:** Después de que `handle_new_user()` inserte en `public.users`, ejecutar lógica de “si es owner y branch_id es null, crear una fila en `public.branches` y actualizar `public.users.branch_id`”.  
  - **Cómo:**  
    - Opción A: Extender la función `handle_new_user()` para que, en el mismo bloque, tras el `INSERT INTO public.users ... ON CONFLICT DO NOTHING`, si `v_invitation_type IS DISTINCT FROM 'admin_invite'` y `v_branch_id IS NULL`, haga `INSERT INTO public.branches (...) RETURNING id` y luego `UPDATE public.users SET branch_id = ... WHERE id = NEW.id`.  
    - Opción B: Crear una función nueva, p. ej. `create_default_branch_for_owner()`, que se ejecute con un trigger **AFTER INSERT ON public.users** (FOR EACH ROW WHERE NEW.role = 'owner' AND NEW.branch_id IS NULL), y que dentro haga el insert en `branches` y el update de `users.branch_id`.  
  - Ventaja: Un solo lugar (BD) que garantiza branch por defecto para todo owner creado con branch_id null, con independencia de si se llama o no la Edge user-created.

- **(b) RPC SECURITY DEFINER**  
  - Crear una RPC, p. ej. `create_default_branch_for_owner(p_user_id uuid)`, que compruebe que el usuario es owner y tiene branch_id null, cree la branch y actualice `users.branch_id`. Llamarla desde la Edge user-created cuando `existingUser && existingUser.branch_id == null && role === 'owner'`, en lugar de hacer return temprano.  
  - Requiere tocar la Edge y acordar cuándo se invoca (Hook, cliente, etc.); además si el trigger sigue creando el usuario antes, la Edge tendría que detectar “usuario existe pero sin branch” y llamar a la RPC.

**Recomendación:** Opción **(a) Trigger en BD** (extender `handle_new_user()` o trigger AFTER INSERT en `public.users`) para que la sucursal por defecto se cree siempre en la BD cuando corresponda, sin depender de la Edge ni del orden de ejecución.

### 4.3 Checklist de pruebas

- [ ] Crear owner nuevo (signup por email o Google) sin branchId en metadata.
- [ ] Comprobar que existe exactamente una fila en `public.branches` con `owner_id = <id del owner>` y nombre tipo “Sucursal Principal” (o el que se defina).
- [ ] Comprobar que `public.users.branch_id` del owner queda igual al `id` de esa branch.
- [ ] En la app, con ese usuario logueado: no debe mostrarse “Sin sucursal seleccionada”; debe verse la sucursal por defecto y el flujo normal (catálogo, etc.).
- [ ] Owner con invitación staff (admin_invite) no debe recibir sucursal por defecto; debe conservar branch_id (y owner_id) del QR.
- [ ] (Opcional) Si se usa la Edge user-created en otro flujo, comprobar que no se duplican branches ni se rompe el flujo staff.

---

*Auditoría solo lectura; no se ha implementado ningún cambio.*
