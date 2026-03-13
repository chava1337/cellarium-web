# Reporte técnico: Staff registration 100% web (contexto para implementación)

**Objetivo:** Documentar todo lo necesario para implementar el registro de staff 100% desde la web usando Supabase, **sin deep linking**. El staff se registraría en la web creando una solicitud en estado `pending`; owner/gerente aprueba y asigna rol desde la app.

**Repos:**  
- Repo 1: **cellarium** (Expo/React Native) — en este workspace.  
- Repo 2: **cellarium-visualizador-web** (Next.js) — **no está en este workspace**; la sección 2 se infiere de documentación y contrato de APIs.

---

## 1) Deep linking / QR (App — Cellarium)

### 1.1 Archivos y rutas donde se configura linking

| Archivo | Qué configura |
|--------|----------------|
| **App.tsx** | `linkingPrefixes`, `linking: LinkingOptions<RootStackParamList>` con `prefixes` y `config.screens`. `NavigationContainer linking={linking}`. |
| **app.config.js** | `expo.scheme: "cellarium"`, `expo.android.intentFilters` (no se sincroniza automáticamente si existe carpeta `android/`). |
| **android/app/src/main/AndroidManifest.xml** | Intent-filters nativos para MainActivity (LAUNCHER, VIEW con scheme/host). |
| **src/types/index.ts** | `RootStackParamList`: rutas y params (QrProcessor, AdminRegistration, etc.). |

Rutas de navegación con deep link mapping (App.tsx):

- `Login` → `login`
- `QrProcessor` → `qr/:qrData?`
- `WineCatalog` → `catalog`
- `AdminLogin` → `admin/login`
- `AdminRegistration` → `admin/register`
- `AdminDashboard` → `admin/dashboard`
- `UserManagement` → `admin/users`
- `TastingNotes` → `admin/tasting`
- `QrGeneration` → `admin/qr`
- `BranchManagement` → `admin/branches`

### 1.2 Prefixes y hosts configurados

**App.tsx — `linkingPrefixes`:**
- `'cellarium://'`
- `'cellarium:///'`
- `Linking.createURL('/')` (dev client)
- `'https://cellarium.app'`
- `'https://www.cellarium.app'`

**AndroidManifest.xml — intent-filters (MainActivity):**
- `scheme="cellarium"` **host="auth-callback"** (OAuth callback)
- `scheme="exp+cellarium-wine-catalog"` (Expo dev client)
- `scheme="cellarium"` **host="qr"**
- `scheme="cellarium"` **(sin host)** — acepta `cellarium:///qr/...`
- `scheme="https"` host="cellarium.app" pathPrefix="/qr"
- `scheme="https"` host="www.cellarium.app" pathPrefix="/qr"

### 1.3 Dónde se genera el QR staff y payload exacto

- **Pantalla:** `src/screens/QrGenerationScreen.tsx`  
  - Tipo "Invitación para nuevo staff" llama a `generateQrToken({ type: 'admin_invite', branchId, createdBy, ownerId, expiresInHours: 24*7, maxUses: 1 })` (QrGenerationService).  
  - El valor del `<QRCode>` y de compartir es **siempre** `generateUniversalQrUrl(...)` (URL web).

- **Servicio generación token:** `src/services/QrGenerationService.ts`  
  - `generateQrToken()`: insert en `qr_tokens` con `type: 'admin_invite'`, `branch_id`, `created_by`, `owner_id`, `expires_at`, `max_uses: 1`, etc.  
  - No usa RPC para admin_invite; usa `generateUniqueToken()` e insert directo.

- **Servicio URL:** `src/services/QrTokenService.ts`  
  - `generateUniversalQrUrl(qrData: QrTokenData)`:  
    - Payload: `{ type: 'admin' | 'guest', token, branchId, branchName }`.  
    - Para staff en UI se pasa `type: selectedQr.type === 'admin_invite' ? 'admin' : selectedQr.type` → **type en el JSON es `'admin'`**.  
  - URL generada: `https://cellarium-visualizador-web.vercel.app/qr?data=${encodeURIComponent(JSON.stringify(qrData))}`.  
  - `generateDeepLink(qrData)`: `cellarium://qr/${encodedData}` (mismo JSON encoded).

**Payload exacto codificado en el QR (staff):**
```json
{
  "type": "admin",
  "token": "<qr_tokens.token>",
  "branchId": "<uuid>",
  "branchName": "<string>"
}
```
Keys: `type`, `token`, `branchId`, `branchName`. No se incluye `expiresAt` en este objeto (la validez se comprueba en backend con `qr_tokens.expires_at`).

### 1.4 Dónde se valida el token en la app

- **Función:** `validateQrToken(token: string)` en **src/services/QrTokenService.ts**.
- **Lógica:**  
  - Query a `qr_tokens` con join a `branches`: `.from('qr_tokens').select('*, branches(id,name,address)').eq('token', token).single()`.  
  - Comprueba: `expires_at > now`, para `admin_invite` que `used === false`, `current_uses < max_uses`.  
  - Inserta en `qr_scans` e incrementa `current_uses`; si `admin_invite` marca `used = true`.  
  - Devuelve `{ valid, data: { type: 'admin'|'guest', token, branchId, branchName }, branch }`.  
  - En BD el tipo es `admin_invite`; en la respuesta se mapea a `type: 'admin'`.
- **Cliente:** anon o autenticado (Supabase client desde `src/lib/supabase.ts`). RLS en `qr_tokens` permite SELECT anon cuando `expires_at > now()`.

### 1.5 Funciones/servicios usados (QR y linking)

- **QrTokenService.ts:** `validateQrToken`, `generateUniversalQrUrl`, `generateDeepLink`, `isGuestQr`, `isAdminInviteQr`, `markQrAsUsed`. Tipos: `QrTokenData`, `QrValidationResult`.
- **QrGenerationService.ts:** `createGuestQrToken` (RPC `create_guest_qr_token`), `generateQrToken` (insert `qr_tokens`), `getUserQrTokens`. Tipos: `GeneratedQrToken`, `QrGenerationData`, `GuestQrDuration`.
- **QrProcessorScreen.tsx:** Parsea payload desde `route.params`, URL (`cellarium://qr/...`, `cellarium:///qr/...`, `?data=`), AsyncStorage; llama a `validateQrToken`; navega a `WineCatalog` (guest) o `AdminRegistration` (staff).
- **BootstrapScreen.tsx:** Si `getInitialURL()` es un enlace cellarium qr, hace `navigation.reset` a `QrProcessor` con `params: { qrData: encoded }`.
- **expo-linking:** `Linking.getInitialURL()`, `Linking.addEventListener('url', ...)`.
- **App.tsx:** `LinkingOptions` con `prefixes` y `config.screens`; log __DEV__ de URL inicial.

---

## 2) QR Web flow (Next.js — cellarium-visualizador-web)

> El repo **cellarium-visualizador-web** no está en este workspace. Lo siguiente se infiere de la documentación (INFORME_VISUALIZADOR_WEB_MENU_QR.md, REPORTE_IMAGENES_MENU_UX.md, AUDITORIA_QR_STAFF_*, QR_STAFF_DEEP_LINK_FIX_Y_CHECKLIST.md) y del contrato de la URL/API.

### 2.1 Rutas y archivos involucrados (a confirmar en el repo web)

- **Ruta principal:** `/qr` con query `?data=<encoded>`. En App Router sería algo como `app/qr/page.tsx` (o `app/(public)/qr/page.tsx`).
- **Decodificación:** Algún helper tipo `decodeQrData(data: string)` que haga `decodeURIComponent` + `JSON.parse` para obtener `{ type, token, branchId, branchName }`.
- **Fetch menú (guest):** Llamada a `GET ${NEXT_PUBLIC_MENU_API_URL o SUPABASE_URL}/functions/v1/public-menu?token=<token>` cuando `type === 'guest'`; la Edge **public-menu** solo acepta tokens con `type === 'guest'`.
- **Vista staff:** Componente tipo **AdminInviteView** (o similar) cuando `type === 'admin'`; hoy muestra “Open in app” (deep link `cellarium://qr/<encoded>`).

### 2.2 Lógica actual (inferida)

- **type === 'guest':** Mostrar **MenuView** (lista de vinos); datos vía `public-menu?token=...`.
- **type === 'admin' (staff invite):** Mostrar **AdminInviteView**; actualmente intenta abrir la app vía deep link; no hay flujo de registro 100% en web.

### 2.3 Auth en web (a confirmar en repo)

- Documentación menciona `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` para llamar a la Edge desde cliente.
- No se ha verificado en este workspace si el visualizador usa `@supabase/supabase-js`, `signIn`, `signUp`, `signInWithOtp` (magic link), etc. Para “staff 100% web” hará falta un cliente Supabase en la web y flujo de registro (p. ej. signUp con email o magic link).

### 2.4 i18n (a confirmar en repo)

- Docs citan “LocaleToggle”, diccionarios; mantener i18n en cualquier nueva pantalla de registro staff en web.

---

## 3) Supabase Data Model (desde el código)

### 3.1 Tablas y columnas referenciadas

**branches**  
- **Archivo schema:** `supabase/migrations/20260207213838_remote_schema.sql` (create table branches).  
- **Columnas usadas:** `id`, `name`, `address`, `owner_id`, `created_at`, `updated_at`, `is_main`, `is_locked`, `lock_reason`, `locked_at`.  
- **Uso en código:** BranchContext, UserManagementScreen, QrTokenService (join en validateQrToken), public-menu (branch name/address), BranchManagementScreen, etc.

**users**  
- **Schema:** `20260207213838_remote_schema.sql` — `id`, `email`, `name`, `role`, `branch_id`, `owner_id`, `created_at`, `updated_at`, `status`, `approved_by`, `approved_at`, `subscription_plan`, `subscription_expires_at`, `subscription_branches_count`, `subscription_active`, `username`, `subscription_id`, `stripe_customer_id`, `payment_method_id`, `billing_email`, `subscription_branch_addons_count`.  
- **Uso:** AuthContext, UserManagementScreen (select/update), AdminRegistrationScreen (verify, update username), create_staff_user (insert), user-created (insert), permissions (owner_id, branch_id, role), useAdminGuard (status pending).

**qr_tokens**  
- **Schema:** `id`, `token`, `type`, `branch_id`, `created_by`, `created_at`, `expires_at`, `used`, `used_at`, `used_by`, `max_uses`, `current_uses`, `owner_id`.  
- **Uso:** QrTokenService (validateQrToken, markQrAsUsed), QrGenerationService (insert, select), AdminRegistrationScreen (select owner_id por token), user-created (select owner_id, branch_id), create_staff_user (select owner_id, branch_id), public-menu (solo type guest).  
- **Constraint:** `type = ANY (ARRAY['guest','admin_invite'])`.

**qr_scans**  
- Referenciada en QrTokenService (insert al validar token). No se listó create table en el fragmento leído; existe por uso en código.

**guest_sessions**  
- Schema: `id`, `qr_token_id`, `branch_id`, `session_start`, `session_end`, `created_at`. Uso: flujo comensal/guest.

**subscriptions / plan_id / branch limits**  
- **subscription_plan** en `users`: valores vistos en código como `'free' | 'basic' | 'additional-branch'` (src/utils/subscriptionPermissions.ts, planLabels).  
- **Branch limits:** `branchLimit.ts`, `get_branch_limit_for_owner`, políticas de límite por plan; migraciones `20250122130100_reconcile_branch_locks_*`, `20250122130000_fix_branch_limit_plan_ids.sql`.

**Otras tablas usadas en flujo staff/auth:**  
- **auth.users:** create_staff_user actualiza `email_confirmed_at`; user-created y Auth usan auth.  
- No existe tabla **branches_users** ni **branch_users** en las referencias buscadas; la asignación staff → branch es por **users.branch_id** y **users.owner_id**.

### 3.2 Roles existentes y dónde se decide el rol

- **En BD (users.role):** Valores vistos en RPC y políticas: `owner`, `staff`, `gerente`, `supervisor`, `sommelier`, `personal`.  
  - **create_staff_user** inserta `role = 'staff'`.  
  - **user-created** asigna `role = 'staff'` cuando hay `qrToken` o `invitationType === 'admin_invite'`.  
- **En app (types/index.ts):** `User.role`: `'owner' | 'gerente' | 'sommelier' | 'supervisor' | 'personal'`.  
  - **normalizeRole()** convierte `'staff'` (legacy) a `'personal'` para la UI.  
- **Decisión de rol:**  
  - **Global (owner):** En user-created cuando no hay qrToken (owner_register); también al crear branch principal para owner.  
  - **Por branch (staff):** En user-created/create_staff_user con qrToken: se setea `owner_id` y `branch_id` desde `qr_tokens`; `role = 'staff'` y `status = 'pending'`.  
  - **Rol final del staff:** Lo asigna owner/gerente en **UserManagementScreen** al aprobar: update `users` set `status = 'active'`, `role = <gerente|sommelier|supervisor|personal>`, `approved_by`, `approved_at`.

---

## 4) Supabase RPC / Edge Functions

### 4.1 Llamadas a supabase.rpc(...) (Cellarium)

| RPC | Args (nombre) | Archivo |
|-----|----------------|--------|
| **create_guest_qr_token** | `p_branch_id`, `p_duration`, `p_max_uses` | src/services/QrGenerationService.ts |
| **generate_qr_token** | (sin argumentos; devuelve token único) | src/services/QrGenerationService.ts |
| **create_staff_user** | `p_user_id`, `p_email`, `p_name`, `p_qr_token`, `p_username` (opcional) | src/screens/AdminRegistrationScreen.tsx |
| **get_user_email_by_username** | `p_username` | src/screens/AuthScreen.tsx |
| **enforce_subscription_expiry** | (ninguno en el fragmento) | src/screens/SubscriptionsScreen.tsx |

**Contrato create_staff_user (desde migración):**  
- `create_staff_user(p_user_id uuid, p_email text, p_name text, p_qr_token text, p_username text DEFAULT NULL)`  
- Valida token en `qr_tokens` (token, expires_at); obtiene `owner_id`, `branch_id`.  
- Inserta/actualiza en `public.users` (id, email, name, username, role='staff', status='pending', owner_id, branch_id).  
- Confirma email en `auth.users`.  
- Retorna JSON `{ success, user_id, owner_id, branch_id, username, message }` o `{ success: false, error, message }`.

### 4.2 Edge Functions invocadas (Cellarium)

| Función | Uso | Payload / contrato |
|--------|-----|---------------------|
| **public-menu** | Menú público por token guest (GET ?token=). No usada por staff. | N/A (invocación desde web o script). |
| **user-created** | Crear fila en `public.users` tras registro en auth (owner o staff). | Body: `{ qrToken?, invitationType?, branchId?, name?, username? }`. Requiere Authorization header (usuario recién registrado). |
| **rate-limiter** | Límite de intentos (p. ej. registro). | Body: `{ action: 'register', identifier }`. |
| **create-checkout-session** | Suscripciones (Stripe). | (No detallado aquí.) |
| **update-subscription** | Actualizar suscripción. | SubscriptionService. |
| **cancel-subscription** | Cancelar suscripción. | SubscriptionService. |
| **create-payment-intent** / **confirm-payment** | Pagos. | PaymentService. |
| **delete-user-account** | Borrado de cuenta (Settings). | (Referenciado en docs.) |

**user-created (contrato):**  
- Payload: `UserCreatedPayload`: `qrToken?: string`, `invitationType?: 'admin_invite' | 'owner_register'`, `branchId?: string`, `name?: string`, `username?`.  
- Si `payload.qrToken` existe: busca en `qr_tokens` por token, obtiene `owner_id`, `branch_id`; asigna `role = 'staff'`, `status = 'pending'`.  
- Si no qrToken pero `invitationType === 'admin_invite'`: `role = 'staff'`, `status = 'pending'`, `branchId` del payload.  
- Inserta en `public.users` (id, email, name, role, status, branch_id, owner_id, username si viene).  
- Si role === 'staff' && status === 'pending': confirma email con `auth.admin.updateUserById(..., { email_confirm: true })`.

### 4.3 RPC create_guest_qr_token (referencia)

- **Archivo migración:** `supabase/migrations/20260222150000_create_guest_qr_token_rpc.sql`.  
- **Firma:** `create_guest_qr_token(p_branch_id uuid, p_duration text DEFAULT '1w', p_max_uses int DEFAULT 100) RETURNS jsonb`.  
- Valida permisos (owner del branch o gerente/supervisor de ese branch); inserta en `qr_tokens` type `'guest'` con `owner_id` del branch.

---

## 5) Source of truth

- **Rol “real”:** En **public.users**: columna **role**. Valores en BD incluyen `owner`, `staff`, `gerente`, `sommelier`, `supervisor`, `personal`. La app normaliza `staff` → `personal` en UI.  
- **owner_id de un staff/gerente:** En **users.owner_id**. Para staff invitado por QR, lo setea **user-created** o **create_staff_user** desde `qr_tokens.owner_id`.  
- **Branch actual (staff):** **users.branch_id**. Lo setea user-created/create_staff_user desde `qr_tokens.branch_id`. La app usa **BranchContext** y **currentBranch** (por usuario y/o selección).  
- **Estado pendiente de aprobación:** **users.status = 'pending'**. Aprobación: update `status = 'active'`, `role = <rol asignado>`, `approved_by`, `approved_at` desde **UserManagementScreen**.

---

## 6) Recomendaciones para implementar staff join requests (solo análisis)

### 6.1 Tabla nueva propuesta: staff_join_requests (o equivalente)

- **Nombre sugerido:** `staff_join_requests` (o `staff_requests`, `branch_join_requests`).  
- **Propósito:** Guardar solicitudes de acceso staff hechas desde la web (sin depender de que el usuario abra la app). Cada fila = una solicitud pendiente asociada a un token QR y a un usuario (cuando exista).

**Columnas sugeridas (a refinar con migración real):**

- `id` uuid PK  
- `qr_token_id` uuid FK → qr_tokens(id) (opcional si se desvincula después de usar)  
- `token` text (redundante con qr_tokens pero útil para buscar por token sin join)  
- `branch_id` uuid FK → branches(id)  
- `owner_id` uuid FK → users(id) (owner del branch)  
- `email` text (email con el que se registró o solicita)  
- `name` text (opcional)  
- `user_id` uuid FK → auth.users / public.users, nullable (cuando ya exista usuario creado)  
- `status` text: `'pending' | 'approved' | 'rejected'`  
- `created_at`, `updated_at`  
- `approved_by` uuid, `approved_at` timestamptz (nullable)

**Alternativa:** Reutilizar **users** con `status = 'pending'` y que la web cree la fila vía un RPC que valide el token y cree el usuario en auth + fila en users (como create_staff_user pero invocable desde web con email real). No hace falta tabla nueva si el flujo es “web registra con Supabase Auth + user-created con qrToken” y la fila en users ya es la “solicitud” pendiente.

### 6.2 RPCs sugeridos (solo nombres y propósito)

- **request_staff_access** (o reutilizar/extender lógica de create_staff_user):  
  - Input: token (QR), email, name, opcional username.  
  - Validar token (qr_tokens, type admin_invite, no expirado, no usado o política de “un uso por solicitud”).  
  - Crear usuario en auth (signUp) y/o fila en public.users con status pending, owner_id/branch_id desde qr_tokens.  
  - Opcional: marcar token como usado o no según negocio.  
- **approve_staff_request** (o seguir con update directo a users desde la app):  
  - Hoy la app hace `update users set status='active', role=..., approved_by=..., approved_at=... where id = userToApprove.id`.  
  - Se puede encapsular en RPC `approve_staff_request(p_user_id uuid, p_role text)` con permisos (solo owner/gerente del owner_id).

### 6.3 Pantallas a tocar

- **Web (visualizador):**  
  - **AdminInviteView** (o equivalente): En vez de solo “Abrir en app”, ofrecer **formulario de registro en web**: email, nombre, contraseña (o magic link). Al enviar: llamar a Supabase Auth signUp (y opcionalmente invocar Edge user-created con qrToken + branchId) o un RPC/Edge que valide token y cree usuario con status pending. Mantener i18n.  
- **App (Cellarium):**  
  - **UserManagementScreen:** Ya lista usuarios con `status = 'pending'` y permite aprobar/asignar rol. No obligatorio cambiar si el flujo web solo crea la fila users con status pending.  
  - **AdminRegistrationScreen:** Sigue siendo el flujo “desde la app” con deep link; puede coexistir con el flujo 100% web.

### 6.4 Consideraciones

- No romper **QR guest** ni **public-menu** (solo tokens guest).  
- **create_staff_user** actual requiere `p_user_id` (ya creado en auth). En web, el flujo sería: signUp en auth → luego invocar user-created con qrToken (o un RPC que reciba email/name y cree auth user + fila users).  
- **RLS:** Asegurar que anon o usuario no privilegiado no pueda listar/approve requests; solo owner/gerente del branch (vía owner_id).  
- **Límites de suscripción:** Revisar si hay límite de “staff” o “usuarios pendientes” por plan (enforce_free_user_limits, etc.) para no exceder al aprobar desde la app.

---

## Referencia rápida

- **URL universal QR:** `https://cellarium-visualizador-web.vercel.app/qr?data=<encodeURIComponent(JSON.stringify({ type, token, branchId, branchName }))>`.  
- **Deep link app:** `cellarium://qr/<encoded>` o `cellarium:///qr/<encoded>`.  
- **type guest:** Menú; public-menu; no abre app obligatoriamente.  
- **type admin:** Staff invite; AdminInviteView en web; hoy “Open in app” → QrProcessor → AdminRegistration; objetivo futuro: registro 100% en web + pending → aprobación en app.  
- **Migraciones relevantes:** `20260207213838_remote_schema.sql`, `20260222150000_create_guest_qr_token_rpc.sql`, políticas RLS en ese mismo schema y en `20260217120000_storage_wine_bottles_policies.sql`, etc.  
- **Constantes/enums (app):**  
  - **User.role:** `'owner' | 'gerente' | 'sommelier' | 'supervisor' | 'personal'` (src/types/index.ts). normalizeRole: `'staff'` → `'personal'`.  
  - **SubscriptionPlan:** `'free' | 'basic' | 'additional-branch'` (src/utils/subscriptionPermissions.ts). PLAN_LIMITS: free (maxBranches 1, maxManagers 1), basic (maxBranches 1, maxManagers -1), additional-branch (ilimitado).  
- **Políticas RLS:** Referencia en docs: `docs/audit_snippets/rls_branches_users_subscriptions.sql`.  
- **Dudas / múltiples candidatos:** No hay tabla `branches_users`; la relación staff–branch es **users.branch_id** + **users.owner_id**. Rol en BD puede ser `staff`; en app se muestra como `personal` vía normalizeRole.
