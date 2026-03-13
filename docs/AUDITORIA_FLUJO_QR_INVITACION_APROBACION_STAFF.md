# Auditoría técnica: flujo de invitación/aprobación de staff por QR

**Alcance:** Flujo completo QR staff (generación → escaneo → registro → aprobación). Sin cambios de código.  
**Problema reportado:** Al escanear el QR para nuevo usuario (owner con 1 branch), la app muestra que no es posible por permisos.  
**Sospecha:** No es límite FREE sino autorización, RLS, actor, owner_id/branch_id o mapper de error.

---

## 1. Hallazgos backend (SQL / RPC)

### 1.1 Funciones existentes y ubicación

| Función | Archivo | ¿Existe? |
|---------|---------|-----------|
| `approve_staff_request_managed` | `supabase/migrations/20260307200000_user_management_rpcs_security_definer.sql` | Sí |
| `change_staff_role_managed` | Idem | Sí |
| `reject_staff_request_managed` | Idem | Sí |
| `remove_staff_managed` | — | **No existe** en el repo |
| `create_staff_request_managed` | — | **No existe** en el repo |
| `create_staff_user` | `supabase/migrations/20260207213838_remote_schema.sql` (aprox. líneas 1148–1244) | Sí |
| `enforce_free_user_limits_on_update` | `supabase/migrations/20260207213838_remote_schema.sql` (aprox. 1446–1510) | Sí |
| `get_plan_id_effective` | `supabase/migrations/20260207213838_remote_schema.sql` (aprox. 1811–1832) | Sí |

---

### 1.2 `approve_staff_request_managed(p_target_user_id uuid, p_new_role text)`

- **Quién puede ejecutarla:** Cualquier `authenticated`; la lógica restringe a `role IN ('owner','gerente')` y `status = 'active'`.
- **auth.uid():** Sí. `actor_id := auth.uid()`; lee actor desde `public.users` por `actor_id`.
- **owner_id:** Del actor: `actor_owner_id` desde `users` donde `id = actor_id`. Del target: `target_owner_id` desde `users` donde `id = p_target_user_id`.
- **branch_id:** Idem: `actor_branch_id`, `target_branch_id` desde `users`.
- **UPDATE en public.users:**  
  `UPDATE public.users SET status = 'active', role = p_new_role, approved_by = actor_id, approved_at = now(), updated_at = now() WHERE id = p_target_user_id`.
- **Posibles fallos:**
  - Validación en RPC: retorna `jsonb_build_object('ok', false, 'message', '...')` (no excepción): "No autenticado", "Usuario no encontrado", "Usuario inactivo", "Sin permiso para aprobar", "Usuario no pertenece a tu organización", "Usuario no pertenece a tu sucursal", "Solo se puede aprobar un usuario con estado pendiente", "Rol no permitido", etc.
  - Si el UPDATE se ejecuta, dispara el trigger `trg_enforce_free_user_limits_on_update`. Si el plan del owner es FREE y no se cumple límite (auth.uid() ≠ owner, o total_users > 2, o manager_count > 1), el trigger lanza excepción (P0001). Esa excepción llega al cliente como error de Supabase, no como `result.ok === false`.

---

### 1.3 `change_staff_role_managed(p_target_user_id uuid, p_new_role text)`

- **Quién:** `authenticated`; restricción interna owner o gerente activo.
- **auth.uid():** Sí (actor desde `auth.uid()`).
- **owner_id / branch_id:** Resueltos desde `public.users` para actor y target.
- **UPDATE:** `UPDATE public.users SET role = p_new_role, updated_at = now() WHERE id = p_target_user_id`. Mismo trigger FREE que arriba.

---

### 1.4 `reject_staff_request_managed(p_target_user_id uuid)`

- **Quién:** owner o gerente activo (misma lógica de ámbito).
- **auth.uid():** Sí.
- **UPDATE:** `UPDATE public.users SET status = 'inactive', updated_at = now() WHERE id = p_target_user_id`. El trigger FREE podría ejecutarse; para rechazar (inactive) normalmente no cambia owner_id ni role, pero el trigger se ejecuta en todo UPDATE.

---

### 1.5 `create_staff_user(p_user_id, p_email, p_name, p_qr_token, p_username DEFAULT NULL)`

- **Archivo:** `20260207213838_remote_schema.sql` (aprox. 1148–1244).
- **Quién:** Cualquiera que pueda invocar la RPC (en la app: cliente autenticado tras `signUp` en AdminRegistrationScreen, como fallback cuando falla user-created).
- **auth.uid():** No se usa; recibe `p_user_id` y `p_qr_token`.
- **owner_id / branch_id:** `SELECT owner_id, branch_id FROM public.qr_tokens WHERE token = p_qr_token AND expires_at > NOW()`.
- **INSERT en public.users:**  
  `INSERT INTO public.users (id, email, name, username, role, status, owner_id, branch_id, created_at, updated_at) VALUES (...)'staff','pending', v_owner_id, v_branch_id,...) ON CONFLICT (id) DO UPDATE SET username = ..., updated_at = NOW()`.
- **Posibles fallos:** Token inválido/expirado → excepción `'Token QR inválido o expirado'`. Username duplicado (mismo owner_id, status active) → excepción. La función es SECURITY DEFINER; no depende de RLS para el INSERT.

---

### 1.6 `enforce_free_user_limits_on_update()`

- **Trigger:** `BEFORE UPDATE ON public.users` (nombre del trigger: `trg_enforce_free_user_limits_on_update`).
- **Cuándo actúa:** Solo si cambian `owner_id` o `role` (o se asigna owner_id); si `get_plan_id_effective(owner) <> 'free'` no hace nada.
- **owner:** `coalesce(new.owner_id, old.owner_id)`.
- **Comprobaciones en FREE:**
  1. `auth.uid() <> owner` → excepción `'Only owner can modify staff assignments in FREE plan.'` (P0001).
  2. Conteo `(id = owner) or (owner_id = owner)` > 2 → excepción `'FREE plan limit: max 2 users total (owner + 1).'` (P0001).
  3. Más de un gerente (`role = 'gerente'`) para ese owner → excepción `'FREE plan limit: max 1 gerente.'` (P0001).

---

### 1.7 `get_plan_id_effective(p_owner uuid)`

- **Archivo:** `20260207213838_remote_schema.sql` (aprox. 1811–1832).
- **auth.uid():** No.
- **Lógica:** Lee `subscription_plan` de `public.users` donde `id = p_owner`; si `is_subscription_effectively_active(p_owner) = false` retorna `'free'`; si no, `coalesce(plan, 'free')`.

---

### 1.8 `is_subscription_effectively_active(p_owner uuid)`

- **Archivo:** `20260207213838_remote_schema.sql` (aprox. 2020–2048).
- **Lógica:** Lee `subscription_active` y `subscription_expires_at` de `public.users` donde `id = p_owner`; retorna false si inactivo o expirado.

---

## 2. Hallazgos RLS y triggers sobre `public.users`

### 2.1 RLS

- **Habilitado:** Sí. `alter table "public"."users" enable row level security` en `20260207213838_remote_schema.sql` (aprox. línea 337).

### 2.2 Policies activas (tras migraciones)

- **"Owners can update their staff"** (remote_schema, aprox. 4071–4076):  
  `FOR UPDATE TO public USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id)`.  
  Solo permite actualizar filas donde el usuario actual es el **owner_id** del row (es decir, el dueño de ese staff).

- **"Owners can view their staff"** (remote_schema, aprox. 4079–4083):  
  `FOR SELECT USING (auth.uid() = id OR auth.uid() = owner_id)`.

- **"Gerente can view same-branch users"** (20260307100000_users_rls_staff_same_organization.sql):  
  SELECT solo si el actor es gerente y (es su fila o mismo owner_id y branch_id).

- **"Gerente can update same-branch users"** (ídem):  
  UPDATE solo para gerente, mismo owner_id y branch_id (USING y WITH CHECK).

- **"Users can insert own data"** / **"Users can update own data"** / **"Users can view own data"** / **"Users can update own record"**:  
  Restringen por `auth.uid() = id` (propia fila).

**Conclusión RLS:** Los RPCs `approve_staff_request_managed`, `change_staff_role_managed`, `reject_staff_request_managed` usan `SECURITY DEFINER` y `SET row_security = off`, por tanto el UPDATE que hacen **no** está sujeto a RLS. Si el problema fuera RLS, tendría que ser en otro camino (por ejemplo un UPDATE/INSERT directo desde el cliente). El trigger `enforce_free_user_limits_on_update` sí se ejecuta en cada UPDATE a `public.users`, incluido el que hace el RPC.

### 2.3 Triggers sobre `public.users`

- **trg_enforce_free_user_limits_on_update** (20260207213838_remote_schema.sql, aprox. 4316):  
  `BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION enforce_free_user_limits_on_update()`.

No hay más triggers sobre `public.users` en las migraciones revisadas. El trigger que inserta en `public.users` está en **auth.users** (handle_new_user), no en public.users.

---

## 3. Flujo frontend completo del QR (staff)

### 3.1 Generación del QR

| Paso | Dónde | Qué |
|------|--------|-----|
| Pantalla | `src/screens/QrGenerationScreen.tsx` | Tabs guest / admin; botón "Generar QR de Invitación" para admin. |
| Permisos | `canGenerateAdminInviteQr(role)` (solo owner o gerente), `user.status === 'active'`, y para gerente/supervisor `currentBranch.id === user.branch_id` (si no, `isWrongBranchForStaff` y no se muestra botón útil). |
| Servicio | `src/services/QrGenerationService.ts` → `generateQrToken()` | Recibe `type: 'admin_invite'`, `branchId`, `createdBy`, `ownerId` (en pantalla: `user.owner_id ?? user.id`). |
| Persistencia | `supabase.from('qr_tokens').insert({ token, type: 'admin_invite', branch_id, created_by, owner_id, expires_at, max_uses, current_uses: 0, used: false })` | Insert con cliente autenticado (RLS: políticas "Owners can ..." sobre qr_tokens). |
| Payload en QR / URL | `src/services/QrTokenService.ts` → `generateUniversalQrUrl()` | URL con tipo y token (y branchId/branchName según implementación). No se valida plan FREE antes de generar. |

### 3.2 Escaneo y consumo del QR

| Paso | Dónde | Qué |
|------|--------|-----|
| Pantalla que escanea | `src/screens/QrProcessorScreen.tsx` | Recibe `token` por deep link o datos del QR; decide si es staff (`type === 'admin'` o `'admin_invite'`) o guest. |
| Validación remota | `supabase.functions.invoke('resolve-qr', { body: { token: tokenToValidate } })` | Edge `supabase/functions/resolve-qr/index.ts`: usa **service_role**; lee `qr_tokens` por token; comprueba type `admin_invite`, no expirado, no usado, límite de usos; incrementa `current_uses` (y marca used si aplica); retorna `{ success: true, owner_id, branch_id, branch_name }` o `{ success: false, code: 'TOKEN_*' }`. No usa auth.uid(). |
| Navegación si éxito | `QrProcessorScreen.tsx` | `navigation.replace('AdminRegistration', { qrToken: tokenToValidate, ownerId: resolveData.owner_id, branchId: resolveData.branch_id, branchName: resolveData.branch_name })`. |
| Errores en escaneo | Mismos bloques en QrProcessorScreen | Alert específicos por código: TOKEN_USED, TOKEN_EXPIRED, TOKEN_NOT_FOUND, TOKEN_LIMIT_REACHED, TOKEN_TYPE_NOT_ALLOWED; si no coincide, `setMessage(resolveData?.code || resolveError?.message || 'Error al validar invitación')` o "Este QR expiró o ya no es válido". **No** se usa `mapSupabaseErrorToUi` en esta pantalla para resolve-qr. |

### 3.3 Registro del nuevo usuario (invitado)

| Paso | Dónde | Qué |
|------|--------|-----|
| Pantalla | `src/screens/AdminRegistrationScreen.tsx` | Params: `qrToken`, `branchName`, `branchId`, `ownerId` (de resolve-qr). |
| Registro | `supabase.auth.signUp({ email: fakeEmail, password, options: { data: { qrToken, branchId, branchName, invitationType: 'admin_invite', username } } })` | Crea usuario en auth; metadata incluye qrToken e invitationType. |
| Trigger auth | `handle_new_user` (trigger AFTER INSERT en auth.users) | `supabase/migrations/20260308300000_handle_new_user_null_safe_staff_invite.sql`: SECURITY DEFINER; lee `qrToken` de raw_user_meta_data; si hay token, obtiene owner_id/branch_id de `qr_tokens`; si no, usa branchId/ownerId de metadata; determina `v_is_staff_invite` (admin_invite / staff_invite / intent); INSERT en `public.users` (id, email, name, role, status, branch_id, owner_id, signup_method, owner_email_verified, ...) ON CONFLICT (id) DO NOTHING. Si falla el INSERT, lanza excepción con step y SQLERRM. |
| Post-signUp (app) | AdminRegistrationScreen | Si hay sesión, tras 500 ms invoca `supabase.functions.invoke('user-created', { body: { qrToken, invitationType: 'admin_invite', branchId, name: username, username } })`. |
| Edge user-created | `supabase/functions/user-created/index.ts` | Requiere Authorization (usuario recién registrado). Con anon key + header lee usuario; si hay `payload.qrToken`, con **service_role** lee `qr_tokens` y obtiene owner_id, branch_id; si usuario no existe en public.users, INSERT con supabaseAdmin (bypass RLS). Si falla, devuelve 400 con mensaje en JSON. |
| Fallback si user-created falla | AdminRegistrationScreen | Llama `supabase.rpc('create_staff_user', { p_user_id, p_email, p_name, p_qr_token, p_username })` para crear/actualizar fila en public.users. |

### 3.4 Aprobación del staff (owner/gerente)

| Paso | Dónde | Qué |
|------|--------|-----|
| Listado | `UserManagementScreen` → `supabase.rpc('list_manageable_users')` | SECURITY DEFINER; retorna usuarios que el actor puede gestionar (owner: toda la org; gerente: misma sucursal). |
| Aprobar | `UserManagementScreen` → `approveUserWithRole()` → `supabase.rpc('approve_staff_request_managed', { p_target_user_id, p_new_role })` | Si hay `rpcError`, se usa `mapSupabaseErrorToUi(rpcError, t)` y `Alert.alert(errorUi.title, errorUi.message, ...)`. Si no hay rpcError pero `result.ok === false`, se muestra `result.message` (mensaje de validación del RPC). |

---

## 4. Error real vs error mostrado (mapping)

### 4.1 Dónde se captura y transforma

- **UserManagementScreen.tsx** (aprox. 108–119 y 130–140):  
  En `approveUserWithRole`, si `rpcError` existe se llama `mapSupabaseErrorToUi(rpcError, t)` y se muestra `errorUi.title` y `errorUi.message`. En el catch también se usa `mapSupabaseErrorToUi(error, t)`.

- **supabaseErrorMapper.ts** (`src/utils/supabaseErrorMapper.ts`):
  - **Límite suscripción / FREE:** Si en el error aparece `P0001`, "Subscription limit reached", "FREE plan limit", "subscription limit", "plan limit", etc. → devuelve `title: t('subscription.limit_title')`, `message: t('subscription.limit_message')`, CTA "Ver planes".
  - **Permisos RLS:** Si `code === '42501'` o mensaje contiene "permission denied", "permiso denegado", "new row violates row-level security policy", "viola la política de seguridad" → devuelve `title: t('auth.access_restricted')`, `message: t('auth.no_permission')` → **"No tienes permisos para realizar esta acción."**
  - **Solo owner:** Si mensaje contiene "Only owner can", "Solo el owner puede", "requires owner role", "requiere rol owner" → `title: t('subscription.restricted_title')`, `message: t('subscription.only_owner_msg')` → **"Esta función solo está disponible para el dueño de la cuenta."**

### 4.2 Colapso de errores distintos

- Cualquier error que contenga "plan limit" o "FREE plan limit" se trata como **límite de suscripción** (mismo título/mensaje y CTA).
- Cualquier error 42501 o "permission denied" / "permiso denegado" se trata como **auth.no_permission** (acceso restringido / no permisos).
- El mensaje exacto del backend (por ejemplo "FREE plan limit: max 2 users total (owner + 1)." o "Only owner can modify staff assignments in FREE plan.") **no** se muestra al usuario; se reemplaza por el texto de la clave i18n correspondiente.

### 4.3 Ejemplos concretos

| Origen del error | Mensaje backend típico | Clave / mensaje UI |
|------------------|------------------------|---------------------|
| Trigger FREE (max 2 users) | `FREE plan limit: max 2 users total (owner + 1).` (P0001) | subscription.limit_title / subscription.limit_message + CTA planes |
| Trigger FREE (solo owner) | `Only owner can modify staff assignments in FREE plan.` (P0001) | subscription.restricted_title / subscription.only_owner_msg ("Esta función solo está disponible para el dueño de la cuenta.") |
| RLS (si hubiera UPDATE directo) | 42501, "new row violates row-level security policy" | auth.access_restricted / auth.no_permission ("No tienes permisos para realizar esta acción.") |
| RPC validación (no excepción) | — | Se muestra `result.message` tal cual, p. ej. "Usuario no pertenece a tu organización" (no pasa por mapSupabaseErrorToUi). |

El mensaje reportado "no es posible por permisos" coincide con la traducción de **auth.no_permission** ("No tienes permisos para realizar esta acción."), que solo se asigna cuando el mapper detecta **42501** o "permission denied" / "permiso denegado" / violación RLS. Los errores del trigger FREE (P0001) se mapean a límite de suscripción o "solo dueño", no a "no permisos".

---

## 5. Plan FREE vs permisos reales — conclusión técnica

- **¿El owner FREE debería poder aprobar 1 staff con el código actual?**  
  **Sí.** Con el código actual: límite FREE = 2 usuarios (owner + 1); solo el owner puede modificar staff en FREE; el RPC usa SECURITY DEFINER y row_security off, así que el UPDATE no está bloqueado por RLS. Si el target ya tiene `owner_id` y `branch_id` correctos (p. ej. seteados por handle_new_user o user-created/create_staff_user), el único requisito es que `auth.uid() = owner` (el owner sea quien aprueba). En ese caso el trigger no debería lanzar.

- **En qué capa puede estar el bloqueo real:**
  - **Si el mensaje es "No tienes permisos para realizar esta acción":** El mapper solo devuelve eso para 42501 / "permission denied" / RLS. Los RPCs de aprobación no pasan por RLS. Por tanto, ese mensaje podría venir de **otra** operación (por ejemplo un SELECT/UPDATE directo a `public.users` o a otra tabla con RLS), no necesariamente de `approve_staff_request_managed`. Falta confirmar en qué pantalla/acción exacta aparece el mensaje (escaneo, registro o aprobación).
  - **Si el mensaje es "Esta función solo está disponible para el dueño":** Sería el trigger "Only owner can modify staff assignments in FREE plan." — por ejemplo si un **gerente** intenta aprobar en una org con plan FREE (el trigger exige auth.uid() = owner).
  - **Si el mensaje es de límite de suscripción (Ver planes):** Sería el trigger FREE (max 2 users o max 1 gerente).
  - **Datos inconsistentes:** Si el usuario pendiente tiene `owner_id` NULL o distinto del owner (p. ej. fallo de handle_new_user o user-created y no se usó create_staff_user), el RPC devuelve "Usuario no pertenece a tu organización" (result.ok = false) y no se ejecuta el UPDATE; en ese caso no se llega al trigger. El mensaje mostrado sería el del RPC, no "no permisos".

- **Resumen causa raíz más probable:**  
  Si la UI muestra literalmente "No tienes permisos para realizar esta acción", el backend está devolviendo un error que el mapper clasifica como RLS/42501/permission denied. Eso **no** es coherente con el flujo de aprobación vía RPC (SECURITY DEFINER). Por tanto es plausible que:
  1. El error ocurra en **otro flujo** (p. ej. al cargar listado, al leer usuario, o en otra pantalla), o  
  2. Haya **otra operación** en el mismo flujo que haga SELECT/UPDATE directo a una tabla con RLS y falle (p. ej. cliente leyendo `users` y una policy no permitiendo la fila), o  
  3. Que el usuario esté describiendo otro mensaje (p. ej. "Usuario no pertenece a tu organización" o "Esta función solo está disponible para el dueño") como "no es posible por permisos".

Para acotar: hace falta el **mensaje exacto** que muestra la app y en **qué paso** (al escanear, al enviar registro, o al aprobar desde UserManagement).

---

## 6. Riesgo de tocar cada capa

| Capa | Riesgo |
|------|--------|
| RPCs (approve/change/reject) | Medio: cambio de condiciones puede afectar a gerentes u otros planes. |
| Trigger enforce_free_user_limits_on_update | Alto: relajar condiciones puede permitir más usuarios/gerentes en FREE; endurecer puede bloquear flujos válidos. |
| RLS public.users | Alto: políticas compartidas por varias pantallas; relajar puede exponer datos. |
| Edge resolve-qr | Bajo: no usa auth; cambios suelen ser validaciones o payload. |
| Edge user-created | Medio: sincronización con handle_new_user y create_staff_user; duplicados o estados inconsistentes si se desincroniza. |
| handle_new_user | Alto: todo registro (owner y staff) pasa por aquí; owner_id/branch_id incorrectos afectan aprobación y FREE. |
| supabaseErrorMapper | Bajo: solo mensajes; riesgo de ocultar errores distintos si se unifican más. |
| QrProcessorScreen / AdminRegistrationScreen | Bajo: mejoras de mensajes o flujo sin tocar backend. |

---

## 7. Cambio mínimo seguro recomendado (solo diagnóstico por ahora)

- **No hacer cambios de lógica** hasta confirmar el paso exacto y el mensaje exacto.
- **Añadir observabilidad mínima:** En `approveUserWithRole` (UserManagementScreen), loguear `rpcError` completo (code, message, details) y `result` cuando `ok === false`, para ver si el fallo es validación RPC o excepción de BD (trigger). Opcional: mismo tratamiento en el catch de registro en AdminRegistrationScreen y en la invocación de user-created/create_staff_user.
- Si se confirma que el error es 42501/RLS: localizar la operación que falla (qué llamada Supabase y en qué pantalla) antes de tocar RLS o políticas.

---

## 8. Archivos exactos a modificar si se corrige (referencia)

- **Mensajes y diagnóstico:**  
  `src/screens/UserManagementScreen.tsx` (approveUserWithRole, bloques rpcError y result.ok).  
  `src/utils/supabaseErrorMapper.ts` (solo si se decide distinguir mejor P0001 "Only owner" de "FREE plan limit" para no colapsar mensajes).

- **Backend (solo si se confirma causa y se decide cambiar lógica):**  
  `supabase/migrations/20260307200000_user_management_rpcs_security_definer.sql` (RPCs).  
  `supabase/migrations/20260207213838_remote_schema.sql` (trigger enforce_free_user_limits_on_update — no recomendado tocar sin confirmar).  
  `supabase/migrations/20260307100000_users_rls_staff_same_organization.sql` (políticas gerente).  
  `supabase/migrations/20260207213838_remote_schema.sql` (políticas "Owners can view/update their staff").

- **Flujo QR / registro:**  
  `src/screens/QrProcessorScreen.tsx` (mensajes de error de resolve-qr).  
  `src/screens/AdminRegistrationScreen.tsx` (errores de signUp, user-created, create_staff_user).  
  `supabase/functions/user-created/index.ts`.  
  `supabase/functions/resolve-qr/index.ts`.  
  `supabase/migrations/20260308300000_handle_new_user_null_safe_staff_invite.sql` (solo si se confirma que owner_id/branch_id no se setean correctamente para staff).

- **No existen (no modificar):**  
  `create_staff_request_managed`, `remove_staff_managed` — no existen en el proyecto.
