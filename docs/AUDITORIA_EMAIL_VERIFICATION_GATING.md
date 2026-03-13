# Auditoría (solo lectura): Verificación de correo para OWNER + gating de funciones sensibles (Stripe/QR)

**Objetivo:** Inventario exacto para implementar verificación de correo en signup Owner manual y gating de Stripe/QR, sin modificar código.

---

## 1) Tabla / lista de archivos: ruta → propósito → funciones clave

| Ruta | Propósito | Funciones clave |
|------|-----------|-----------------|
| **Registro / Login** | | |
| `src/screens/AuthScreen.tsx` | Login/registro Owner (correo + Google) | `handleSubmit` (signUp/signInWithPassword), `handleGoogleAuth` (signInWithOAuth + openAuthSessionAsync) |
| `src/screens/AdminRegistrationScreen.tsx` | Registro staff por QR (admin_invite) | `handleSubmit` (signUp con qrToken, invitationType, username), `handleGoogleAuth` (OAuth), RPC `create_staff_user`, invoke `user-created` |
| `src/screens/OwnerRegistrationScreen.tsx` | Pantalla stub “Registro de Owner” (TODO OAuth) | No usa Supabase Auth; simula éxito y navega a AdminDashboard |
| **Auth / Perfil** | | |
| `src/contexts/AuthContext.tsx` | Sesión, hidratación de perfil desde public.users | `hydrateProfile`, `loadUserData` / `loadUserDataImpl`, `ensureUserRow`, `createOwnerUser`, `refreshUser` |
| **Stripe / Suscripciones** | | |
| `src/screens/SubscriptionsScreen.tsx` | UI suscripciones, checkout, portal, add-ons | `invokeAuthedFunction`, `handleSubscribe`, `handleManageSubscription`, `handleUpdateAddonBranches`, `enforceExpiryAndRefresh` |
| **QR / Invites** | | |
| `src/screens/QrGenerationScreen.tsx` | Generar QR comensales e invitación admin | `handleGenerateGuestQr`, `handleGenerateAdminQr`; usa `createGuestQrToken`, `generateQrToken` |
| `src/services/QrGenerationService.ts` | Creación de tokens QR | `createGuestQrToken` (RPC `create_guest_qr_token`), `generateQrToken` (insert `qr_tokens` + opcional RPC `generate_qr_token`) |
| `src/services/QrTokenService.ts` | Lectura/validación de tokens, URLs | `getQrTokenByToken`, `generateUniversalQrUrl`, `generateDeepLink` |
| `src/screens/QrProcessorScreen.tsx` | Escanear QR admin_invite y redirigir | Invoke `resolve-qr` (Edge), navegación a AdminRegistration con token |
| **Permisos / Gating existente** | | |
| `src/utils/permissions.ts` | Permisos por rol para QR | `canGenerateQr`, `canGenerateAdminInviteQr`, `canGenerateGuestQr` |
| `src/utils/rolePermissions.ts` | Rol → puede generar QR | `canGenerateAnyQr` |
| `src/constants/adminMenuFeatureMap.ts` | Mapeo ítem menú admin → FeatureId | `mapMenuItemIdToFeatureId` (inventory, tastings, branches_additional; qr/users/subscriptions = null) |
| `src/services/SubscriptionEnforcement.ts` | Enforcement por plan (create_wine, create_branch, invite_manager) | No usado por SubscriptionsScreen; gating por plan/suscripción |
| **Edge Functions** | | |
| `supabase/functions/create-checkout-session/index.ts` | Sesión Stripe Checkout | POST con Bearer; lee public.users; crea Stripe Customer/Session |
| `supabase/functions/create-portal-session/index.ts` | Sesión Stripe Billing Portal | POST con Bearer; `stripe_customer_id` desde users |
| `supabase/functions/update-subscription/index.ts` | Add-on sucursales | POST con Bearer; actualiza Stripe + users |
| `supabase/functions/user-created/index.ts` | Crear fila en public.users tras registro | Body: qrToken, invitationType, branchId, name; usa qr_tokens para owner_id/branch_id |
| `supabase/functions/resolve-qr/index.ts` | Validar token admin_invite y marcarlo usado | POST sin auth (service_role); lee/actualiza qr_tokens |
| `supabase/functions/rate-limiter/index.ts` | Rate limit login/registro | Invocado desde AuthScreen (login) y AdminRegistrationScreen (registro) |
| **DB / Triggers** | | |
| `supabase/migrations/20260227000100_create_default_branch_on_signup.sql` | Trigger al insertar en auth.users | `handle_new_user()`: lee `raw_user_meta_data->>'qrToken'`, `->>'invitationType'`, `->>'branchId'`; inserta en public.users; staff: email_confirmed_at = NOW(); owner: crea branch por defecto si no hay branch_id |

---

## A) Registro / Login

### Archivos
- `src/screens/AuthScreen.tsx` (Owner: correo + Google)
- `src/screens/AdminRegistrationScreen.tsx` (Staff: correo + Google con QR)

### Componentes y métodos
- **AuthScreen:** formulario email/password; botón “Registrarse con correo” / “Inicia sesión”; “Continue with Google” → `handleGoogleAuth`.
- **AuthScreen signUp (Owner manual):**
  - `supabase.auth.signUp({ email, password, options: { data: { full_name: fullName || null } } })`
  - No se envía `signup_intent`, `intent`, `username`, ni `signup_method`. Solo `full_name`.
- **AuthScreen Google:** `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'cellarium://auth-callback' } })` + `WebBrowser.openAuthSessionAsync(data.url, redirectTo)`.
- **AdminRegistrationScreen signUp (staff con QR):**
  - `supabase.auth.signUp({ email: fakeEmail, password, options: { data: { qrToken, branchId, branchName, invitationType: 'admin_invite', username } } })`
  - Metadata: `qrToken`, `branchId`, `branchName`, `invitationType: 'admin_invite'`, `username`.
- **AdminRegistrationScreen Google:** mismo patrón OAuth + `openAuthSessionAsync` con `cellarium://auth-callback`.

### Validaciones actuales
- AuthScreen: rate-limiter solo en **login** (`action: 'login'`), no en signUp.
- AdminRegistrationScreen: rate-limiter antes de signUp (`action: 'register'`, `identifier: email`).
- No hay validación explícita de “email verificado” antes de usar funciones sensibles.

### Snippet AuthScreen signUp (metadata mínima)
```tsx
// AuthScreen.tsx ~69-77
const { data, error } = await supabase.auth.signUp({
  email: normalizedEmail,
  password: normalizedPassword,
  options: {
    data: {
      full_name: fullName || null,
    },
  },
});
```

### Snippet AdminRegistrationScreen signUp (metadata staff)
```tsx
// AdminRegistrationScreen.tsx ~137-148
const { data, error } = await supabase.auth.signUp({
  email: fakeEmail,
  password: normalizedPassword,
  options: {
    data: {
      qrToken,
      branchId,
      branchName,
      invitationType: 'admin_invite',
      username,
    },
  },
});
```

---

## B) Trigger / Onboarding (DB)

### handle_new_user
- **Definición:** `supabase/migrations/20260227000100_create_default_branch_on_signup.sql` (función `public.handle_new_user()`).
- **Disparador:** sobre `auth.users` (INSERT).
- **Lectura de metadata:**
  - `v_qr_token := NEW.raw_user_meta_data->>'qrToken'`
  - `v_invitation_type := NEW.raw_user_meta_data->>'invitationType'`
  - Owner sin QR: `v_branch_id := (NEW.raw_user_meta_data->>'branchId')::UUID` (solo si se mandara; en AuthScreen no se manda).
- **Lógica:** Si hay `qrToken`, obtiene `owner_id` y `branch_id` desde `public.qr_tokens`. Inserta en `public.users` con `role` = 'staff' si `invitationType = 'admin_invite'`, si no 'owner'; staff con `status = 'pending'`, owner `status = 'active'`. Para **admin_invite** hace `UPDATE auth.users SET email_confirmed_at = NOW() WHERE id = NEW.id`. Para owner sin branch_id crea “Sucursal Principal” y actualiza `users.branch_id`.

### signup_intent / intent / signup_method
- No aparecen en el código actual. No se setean `signup_intent`, `intent` ni `signup_method` en `raw_user_meta_data` desde la app.
- El trigger solo usa `invitationType` (implícito por flujo: admin_invite vs owner).

### Email verification
- **Staff (admin_invite):** el trigger setea `email_confirmed_at = NOW()` en auth.users, por tanto no se exige verificación de correo para staff.
- **Owner manual (AuthScreen):** no se toca `email_confirmed_at`; depende de la configuración del proyecto Supabase (Confirm email). No hay mención explícita en código de “email verification desactivado”; el mensaje actual es “Revisa tu email para confirmar la cuenta” tras signUp.

---

## C) Stripe / Suscripciones (acciones sensibles)

### Archivos UI
- `src/screens/SubscriptionsScreen.tsx`

### Handlers y rutas
- **handleSubscribe** (líneas ~808–858): confirmación Alert → `invokeAuthedFunction('create-checkout-session', { planLookupKey })` → `WebBrowser.openAuthSessionAsync(data.url, 'cellarium://auth-callback')` → `refreshUserWithBackoffUntilUpdated`.
- **handleManageSubscription** (líneas ~860–901): `invokeAuthedFunction('create-portal-session', {})` → `openAuthSessionAsync(data.url, 'cellarium://auth-callback')` → refreshUser y opcional Alert.
- **handleUpdateAddonBranches** (líneas ~908–968): Alert de confirmación → `invokeAuthedFunction('update-subscription', { addonBranchesQty: qty })` → refreshUser.

### Servicios
- No hay `SubscriptionService` ni `PaymentService` usados por SubscriptionsScreen para checkout/portal. `SubscriptionService.ts` existe pero no se importa en SubscriptionsScreen (flujo actual: Edge create-checkout-session + create-portal-session + stripe-webhook).

### Invokes Edge (desde SubscriptionsScreen)
- **invokeAuthedFunction:** definido en el mismo archivo (líneas 63–~100). Hace `supabase.auth.refreshSession()` + `getSession()`, luego `supabase.functions.invoke(functionName, { body, headers: { authorization: 'Bearer ' + session.access_token } })`. Reintento en 401 una vez.
- **Edge invocadas:**
  - `create-checkout-session` (body: `{ planLookupKey }`)
  - `create-portal-session` (body: `{}`)
  - `update-subscription` (body: `{ addonBranchesQty: qty }`)
- **Otras:** `get-addon-price` (invoke sin Bearer en el snippet; línea 694), `enforce_subscription_expiry` (RPC, no Edge).

### Botones / acciones a gatear (recomendado)
1. **Suscribirse a plan (Pro/Business)** – botón que dispara `handleSubscribe` → crear sesión Checkout.
2. **Administrar suscripción** – botón que dispara `handleManageSubscription` → crear sesión Portal.
3. **Actualizar add-on sucursales** – `handleUpdateAddonBranches` → update-subscription.

Punto único de entrada para checkout y portal: `invokeAuthedFunction` dentro de SubscriptionsScreen; un gating podría ir antes de cada invoke o dentro de la Edge (por ejemplo exigir `email_confirmed_at` o un flag en public.users).

---

## D) Generación de QR / Invites (acciones sensibles)

### Flujos que crean QR / invites

| Flujo | Archivo UI | Servicio | Tabla / RPC | Edge invocada |
|-------|------------|----------|-------------|----------------|
| QR comensales (guest) | QrGenerationScreen | QrGenerationService.createGuestQrToken | RPC `create_guest_qr_token` | — |
| QR invitación admin (admin_invite) | QrGenerationScreen | QrGenerationService.generateQrToken | Insert en `qr_tokens` (y opcional RPC `generate_qr_token`) | — |
| Validar QR escaneado (admin_invite) | QrProcessorScreen | — | — | `resolve-qr` (POST body `{ token }`) |

### Detalle por flujo
- **Guest QR:** `QrGenerationScreen.handleGenerateGuestQr` → `createGuestQrToken(branchId, guestDuration, 100)` → `supabase.rpc('create_guest_qr_token', { p_branch_id, p_duration, p_max_uses })`. Tabla: `qr_tokens` (vía RPC).
- **Admin invite QR:** `QrGenerationScreen.handleGenerateAdminQr` → `generateQrToken({ type: 'admin_invite', branchId, createdBy, ownerId, expiresInHours, maxUses: 1 })` → `supabase.from('qr_tokens').insert({ token, type, branch_id, created_by, owner_id, expires_at, max_uses, current_uses, used })`. No hay Edge intermedia; RLS y tabla `qr_tokens`.
- **Resolución de QR (escaneo):** `QrProcessorScreen` llama `supabase.functions.invoke('resolve-qr', { body: { token } })`. La Edge `resolve-qr` usa service_role, lee/actualiza `qr_tokens` (marca usado para admin_invite).

### Puntos de gating recomendados (QR)
1. **Generar QR comensales** – antes de `createGuestQrToken` en `handleGenerateGuestQr` (o en RPC `create_guest_qr_token` si se quiere enforcement en backend).
2. **Generar QR invitación admin** – antes de `generateQrToken` en `handleGenerateAdminQr` (o en política RLS / trigger sobre `qr_tokens`).

---

## E) Perfil / permisos (para gating)

### Dónde se obtiene el perfil (public.users)
- **hydrateProfile:** `src/contexts/AuthContext.tsx` (líneas ~157–253). Select con `USERS_BOOTSTRAP_SELECT` desde `public.users` por `id = authUser.id`, reintentos con backoff; si no hay fila tras reintentos, `ensureUserRow` (y opcionalmente `createOwnerUser`) o signOut con mensaje.
- **loadUserData / loadUserDataImpl:** mismo archivo (~364–392). Tras cambio de sesión, setea usuario optimista y llama `ensureDeepLinkUser` (si deepLinkUrl) o directamente `hydrateProfile(authUser)`.
- **refreshUser:** mismo archivo (~623–670). Select con `USERS_SELECT_COLUMNS` desde `public.users` por `currentSession.user.id` y actualiza estado `user`.

### Columnas usadas
- **USERS_BOOTSTRAP_SELECT:** `id, email, name, role, status, owner_id, branch_id, created_at, updated_at, subscription_plan, subscription_active, subscription_expires_at, subscription_cancel_at_period_end`
- **USERS_SELECT_COLUMNS:** lo anterior + `subscription_branches_count`, `subscription_branch_addons_count`, `subscription_id`, `stripe_customer_id`
- No se leen `signup_method` ni `owner_email_verified` (no existen hoy en el esquema referenciado).

### Dónde sería natural agregar gating
- **signup_method:** podría setearse en trigger `handle_new_user` o en Edge `user-created` (ej. 'email' | 'google') y guardarse en `public.users` si se añade la columna.
- **owner_email_verified (o equivalente):** podría ser columna en `public.users` derivada de `auth.users.email_confirmed_at` (por trigger o por Edge) y leída en `hydrateProfile` / `refreshUser`. El gating en UI comprobaría `user.owner_email_verified` (o `user.role === 'owner' && email_confirmed_at`) antes de permitir Stripe o generación de QR.

---

## 2) Puntos de gating recomendados (ubicación exacta)

| Acción sensible | Archivo | Ubicación sugerida |
|----------------|---------|--------------------|
| Checkout (suscribirse) | SubscriptionsScreen.tsx | Dentro del `onPress` de handleSubscribe, antes de `invokeAuthedFunction('create-checkout-session', ...)` (~línea 824) |
| Portal (administrar suscripción) | SubscriptionsScreen.tsx | Dentro de handleManageSubscription, antes de `invokeAuthedFunction('create-portal-session', ...)` (~línea 867) |
| Update add-on sucursales | SubscriptionsScreen.tsx | Dentro del onPress de confirmación, antes de `invokeAuthedFunction('update-subscription', ...)` (~línea 948) |
| Generar QR comensales | QrGenerationScreen.tsx | Al inicio de handleGenerateGuestQr, después de comprobaciones de branch/user/permiso (~antes de línea 126 createGuestQrToken) |
| Generar QR invitación admin | QrGenerationScreen.tsx | Al inicio de handleGenerateAdminQr, después de comprobaciones (~antes de línea 166 generateQrToken) |

Opcional (más seguro): en Edge `create-checkout-session`, `create-portal-session` y `update-subscription`, comprobar que el usuario tenga email verificado (o flag en public.users) y devolver 403 si no.

---

## 3) Confirmación: gating o flags similares existentes

- **Gating por plan/suscripción:** Sí. `adminMenuFeatureMap` + `SubscriptionEnforcement` (create_wine, create_branch, invite_manager); `getEffectivePlan` / `effectivePlan.ts`; RPC `enforce_subscription_expiry`; SubscriptionsScreen solo muestra planes y botones según suscripción.
- **Gating por email verificado / owner:** No. No existe comprobación de `email_confirmed_at` ni de un flag tipo `owner_email_verified` antes de Stripe o de generación de QR.
- **Gating por rol (QR):** Sí. `canGenerateGuestQr`, `canGenerateAdminInviteQr`, `canGenerateAnyQr` restringen quién puede generar QR; no hay gating por verificación de correo.

---

## 4) Riesgos / edge cases

- **Staff flow:** Staff (admin_invite) tiene `email_confirmed_at = NOW()` en el trigger; no necesitan verificar correo. Cualquier gating por “email verificado” debe excluir a staff (por ejemplo solo aplicar a `role === 'owner'`) o usar un flag distinto para “owner con correo verificado”.
- **Multi-tenant:** Un owner puede tener varias sucursales y staff por sucursal. Las Edge de Stripe y la generación de QR están ligadas a `owner_id` / `stripe_customer_id`; el gating debe aplicarse al owner que realiza la acción, no al tenant en abstracto.
- **Owner registrado por correo sin verificar:** Si Supabase tiene “Confirm email” activo, el usuario puede existir en auth.users con `email_confirmed_at = null`. Hoy puede recibir sesión tras signUp en algunos flujos; si la app no comprueba verificación, podría llegar a Subscriptions o QrGeneration y llamar a las Edge. Recomendación: en owner manual, no considerar “listo” hasta tener email verificado (o flag en users) y bloquear Stripe/QR hasta entonces.
- **user-created invocado manualmente:** AdminRegistrationScreen (staff) y el bloque comentado de AuthScreen (owner) invocan `user-created` con body explícito. El trigger `handle_new_user` ya crea la fila en public.users; la Edge puede ser redundante o usada para casos donde el trigger no tuvo suficiente metadata. Cualquier campo nuevo (p. ej. signup_method, owner_email_verified) debería setearse de forma coherente en trigger y/o en user-created para no desincronizar.

---

**Resumen:** Registro Owner manual solo envía `full_name` en metadata; staff envía `qrToken`, `invitationType: 'admin_invite'`, `username`. No hay `signup_intent`/`intent`/`signup_method` en raw_user_meta_data. Stripe se usa vía `invokeAuthedFunction` en SubscriptionsScreen (create-checkout-session, create-portal-session, update-subscription). QR se genera en QrGenerationScreen vía QrGenerationService (RPC e insert en qr_tokens); resolve-qr es la única Edge relacionada con QR/invites. Perfil se hidrata en AuthContext (hydrateProfile, loadUserData, refreshUser) desde public.users; no hay campos de verificación de correo ni gating por email verificado hoy. Los puntos de gating recomendados están en los handlers de SubscriptionsScreen y QrGenerationScreen indicados arriba.
