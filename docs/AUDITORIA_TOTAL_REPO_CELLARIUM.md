# Auditoría total — Repo Cellarium (Expo + Supabase + RLS + Multi-branch)

**Alcance:** Solo repo principal Cellarium (app). No incluye repo web viewer.  
**Fuente:** Inspección directa del código; todo referenciado con rutas de archivo.

---

## 0) Contexto y estado confirmado en repo

- **Roles y rango:** `src/utils/rolePermissions.ts`: owner(5), gerente(4), sommelier(3), supervisor(2), personal(1).
- **Permisos centrales:** `canAccessAdminPanel`, `canManageUsers`, `canGenerateAnyQr`, `canCreateTastingExam`, `canTakeTastingExam`, `canManageTastingExams`, `canAccessFullAdminScreens` (personal excluido de pantallas admin completas).
- **Trigger `handle_new_user`:** En `supabase/migrations/20260207213838_remote_schema.sql` (líneas ~1925–1992). Usa `raw_user_meta_data->>'invitationType' = 'admin_invite'` (no `signup_intent`). Si hay `qrToken` obtiene owner_id/branch_id de `qr_tokens`; inserta en `public.users` con role `staff`, status `pending`; confirma email en auth si admin_invite.
- **staff_join_requests / request_staff_access:** No aparecen en `supabase/migrations` ni en `supabase/functions`. En app sí se usan: `src/screens/UserManagementScreen.tsx` llama `approve_staff_request` y `reject_staff_request`. **Estado:** RPCs/tabla asumidos en BD; no versionados en este repo.
- **Login UI:** `src/screens/AuthScreen.tsx` label "Usuario o Email" (línea ~408); backend acepta email o username vía RPC `get_user_email_by_username` antes de `signInWithPassword`. Objetivo declarado: refactor a email-only sin romper Google OAuth.

---

## 1) Entregable 1 — Mapa de arquitectura (real)

### A) Entry points y navegación

```
App.tsx (root)
  └ SafeAreaProvider > LanguageProvider > AuthProvider > BranchProvider > GuestProvider > AppContent
       └ NavigationContainer (linking desde App.tsx)
            └ Stack.Navigator (initialRouteName="Bootstrap")
                 ├ Bootstrap       → src/screens/BootstrapScreen.tsx
                 ├ Welcome        → src/screens/WelcomeScreen.tsx
                 ├ AdminRegistration, QrProcessor, Subscriptions
                 ├ AppAuth        → src/screens/AppAuthWrapper.tsx  (AuthScreen | AppNavigator según user)
                 └ AppNavigator   → src/screens/AppNavigator.tsx    (stack interno con todas las pantallas admin/catálogo)
```

- **Navegación:** React Navigation (stack). No Expo Router. Linking en `App.tsx` (prefixes: cellarium://, cellarium:///, Linking.createURL('/'), https cellarium.app).
- **Providers (orden):** `App.tsx` líneas 156–168: SafeAreaProvider → LanguageProvider → AuthProvider → BranchProvider → GuestProvider → AppContent.

### B) Capas

| Capa | Rutas / archivos |
|------|-------------------|
| **UI screens** | `src/screens/*.tsx` (Bootstrap, Welcome, AuthScreen, AppAuthWrapper, AppNavigator, WineCatalog, AdminDashboard, UserManagement, QrGeneration, TastingExamsList, CreateTastingExam, TakeTastingExam, Settings, etc.) |
| **Services (API/Supabase)** | `src/services/*.ts` (QrGenerationService, QrTokenService, WineService, TastingExamService, SubscriptionService, PaymentService, InventoryService, AnalyticsService, etc.); `src/lib/supabase.ts` (cliente único), `src/config/supabase.ts` (getUser, getSession, signOut helpers) |
| **Utils / guards** | `src/utils/rolePermissions.ts`, `src/utils/permissions.ts`, `src/hooks/useAdminGuard.ts` |
| **Data models / types** | `src/types/index.ts` (User, Branch, RootStackParamList, etc.) |

### C) Fuentes de verdad

| Dato | Dónde se guarda | Cómo se carga | "Ready" |
|------|------------------|---------------|---------|
| **Perfil usuario** | `public.users` (Supabase). Auth en `auth.users`. | `AuthContext`: `onAuthStateChange` → `loadUserData` → `hydrateProfile` (select `public.users` por id). Si no hay fila, `ensureUserRow` (insert). | `profileReady = (userDataStatus === 'ok')`; `userDataStatus` se pone `'ok'` cuando hydrate devuelve datos. |
| **Branch actual** | Estado React: `BranchContext` (`currentBranch`, `availableBranches`). No persistido en AsyncStorage en el código visto. | `BranchContext`: cuando `user && profileReady`, `loadBranchesFromDB(user)` (select branches por owner_id; staff filtrado por branch_id). Owner: primera branch; staff: su branch. | `isInitialized` true tras cargar (o cuando !user). |
| **Rol** | `public.users.role`. En app se normaliza con `normalizeRole()` (staff → personal). | Viene en el select de hydrate; se guarda en estado `user.role`. | Cuando `profileReady` y hydrate ya corrió. |

Archivos: `src/contexts/AuthContext.tsx` (hydrateProfile, ensureUserRow, userDataStatus, profileReady); `src/contexts/BranchContext.tsx` (loadBranchesFromDB, currentBranch, isInitialized); `src/types/index.ts` (normalizeRole).

### D) Lugares donde se decide acceso (guards)

| Archivo | Mecanismo | Condición |
|---------|-----------|-----------|
| `src/hooks/useAdminGuard.ts` | Hook: status `loading` \| `profile_loading` \| `pending` \| `denied` \| `allowed`. useFocusEffect redirige (guest → WineCatalog; denied → AdminLogin). | Por defecto `canAccessAdminPanel(role)`; opcional `allowedRoles`. pending → no redirect, pantalla muestra PendingApprovalMessage. |
| Pantallas que usan useAdminGuard | AdminDashboard, Settings, UserManagement (no), InventoryManagement, InventoryAnalytics, WineManagement, BranchManagement, CocktailManagement, Subscriptions. | Varias pasan `allowedRoles` (ej. solo owner para Subscriptions; owner, gerente, sommelier, supervisor para inventario/vinos/branches/cocktails). |
| `src/screens/WineCatalogScreen.tsx` | Early return: si `user && user.status === 'pending' && !isGuest` → `<PendingApprovalMessage />`. Effects de carga exigen `user.status === 'active'` en modo no-guest. | Bloqueo explícito por status pending. |
| `src/screens/QrGenerationScreen.tsx` | Si `!canGenerateAnyQr(user.role)` → pantalla "Sin permiso". | Solo owner y gerente. |
| `src/screens/UserManagementScreen.tsx` | `if (!user.role \|\| !canManageUsers(user.role))` → "Sin permiso" (users.no_permissions). | canManageUsers en `permissions.ts`: owner, gerente. |
| `src/screens/CreateTastingExamScreen.tsx` | Si `!canCreateTastingExam(user.role)` → "Sin permiso" + Volver. | owner, gerente, sommelier. |

---

## 2) Entregable 2 — Inventario de autenticación y sesión

| Archivo | Función / uso | Tipo auth | Riesgo | Observaciones |
|---------|----------------|-----------|--------|----------------|
| `src/contexts/AuthContext.tsx` | `onAuthStateChange` (INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED) | Session bootstrap | - | Único listener; dispara loadUserData. |
| `src/contexts/AuthContext.tsx` | `signIn(email, password)` → `signInWithPassword({ email, password })` | Password | P1 | Email normalizado a trim+lowercase. |
| `src/contexts/AuthContext.tsx` | `signOut()` → `supabase.auth.signOut()` | Sign out | - | Limpia session y user. |
| `src/contexts/AuthContext.tsx` | `forcedSignOut`, `getSession` (en verifyUserProfile, hydrate, etc.) | Internal | - | signOut(scope: 'local'), clearSession. |
| `src/screens/AuthScreen.tsx` | Login: si no es email → `get_user_email_by_username` luego `signInWithPassword` | Password + username lookup | P1 | UI dice "Usuario o Email"; backend solo email; RPC expone email por username (enumeración si RPC no restringe). |
| `src/screens/AuthScreen.tsx` | `signInWithOAuth({ provider: 'google', redirectTo: 'cellarium://auth-callback' })` + WebBrowser.openAuthSessionAsync | Google OAuth | P2 | Redirect fijo; depende de intent-filter auth-callback en Android. |
| `src/screens/AuthScreen.tsx` | OAuth callback: parse hash, setSession(access_token, refresh_token) | OAuth callback | - | Tokens desde fragment. |
| `src/screens/AuthScreen.tsx` | signUp (registro) con email/password, options.data.full_name | Registro | - | Solo email. |
| `src/screens/AdminRegistrationScreen.tsx` | signUp con email (fake si staff), user_metadata; luego invoke user-created / create_staff_user | Staff invite | - | Flujo app para staff con QR. |
| `src/screens/AdminRegistrationScreen.tsx` | signInWithOAuth Google, setSession, luego user-created | Google OAuth staff | - | Mismo redirect cellarium://auth-callback. |
| `src/screens/AdminLoginScreen.tsx` | Llama `signIn(username, password)` (AuthContext) | Password | - | Parámetro llamado "username" pero AuthContext.signIn espera email. |
| `src/config/supabase.ts` | getSession, getUser, signOut | Helpers | - | Usado por SubscriptionsScreen para token en Edge. |
| `src/screens/SubscriptionsScreen.tsx` | refreshSession + getSession para Bearer en Edge | Session refresh | - | - |

**Configuración deep linking**

- `app.config.js`: scheme `cellarium`; associatedDomains cellarium.app; Android intentFilters (https cellarium.app/qr, scheme cellarium sin host).
- `App.tsx`: linking config con screens (Login, QrProcessor, WineCatalog, AdminLogin, etc.). Prefixes ya citados.
- **Android:** `app.config.js` líneas 69–91: VIEW, BROWSABLE, DEFAULT; https cellarium.app/qr y scheme cellarium. **auth-callback:** no aparece en app.config.js; si el build usa solo esto, `cellarium://auth-callback` podría no matchear (UNKNOWN: revisar android/app/src/main/AndroidManifest.xml tras prebuild).

---

## 3) Entregable 3 — Roles y permisos (intención vs realidad)

### 3.1) rolePermissions.ts — lógica exacta

- **Roles:** owner, gerente, sommelier, supervisor, personal.  
- **roleRank:** owner 5 … personal 1.  
- **canAccessAdminPanel(role):** `role != null && roleRank[role] >= roleRank.personal` → todos los roles.  
- **canManageUsers(role):** `role === 'owner' || role === 'gerente'`.  
- **canGenerateAnyQr(role):** `role === 'owner' || role === 'gerente'`.  
- **canCreateTastingExam(role):** owner, gerente, sommelier.  
- **canTakeTastingExam(role):** `roleRank[role] >= roleRank.personal` → todos.  
- **canManageTastingExams(role):** igual que canCreateTastingExam.  
- **canAccessFullAdminScreens(role):** role en `['owner','gerente','sommelier','supervisor']` (excluye personal).

### 3.2) Uso de cada canX en el repo

| Función | Archivo(s) |
|---------|------------|
| canAccessAdminPanel | `src/hooks/useAdminGuard.ts` (default cuando no hay allowedRoles). |
| canManageUsers | `src/utils/permissions.ts` (definición duplicada owner/gerente); `src/screens/UserManagementScreen.tsx` (import desde permissions). |
| canGenerateAnyQr | `src/screens/QrGenerationScreen.tsx` (bloqueo pantalla). |
| canCreateTastingExam | `src/screens/CreateTastingExamScreen.tsx`, `src/screens/TastingExamsListScreen.tsx`. |
| canManageTastingExams | `src/screens/TastingExamsListScreen.tsx`. |
| canTakeTastingExam | No referenciado en grep (permiso implícito: quien puede abrir TastingExamsList puede realizar). |
| canAccessFullAdminScreens | No usada por nombre; sí el patrón: pantallas con `allowedRoles: ['owner','gerente','sommelier','supervisor']`. |

### 3.3) Matriz en UI

- **Admin panel:** useAdminGuard sin allowedRoles → todos los roles (incl. sommelier, personal). Luego por pantalla: Subscriptions solo owner; UserManagement canManageUsers (owner/gerente); QrGeneration canGenerateAnyQr (owner/gerente); Inventory/Wine/Branch/Cocktail allowedRoles sin personal.  
- **Personal:** Solo ítem "tasting-exams" en AdminDashboard (`filteredMenuItems` por isPersonal); al entrar a otras rutas, useAdminGuard con allowedRoles sin personal → denied → AdminLogin.  
- **Tasting:** Crear solo owner/gerente/sommelier; listar/tomar todos (incl. supervisor/personal).  
Inconsistencia menor: UserManagement usa `canManageUsers` de `permissions.ts`, no de `rolePermissions.ts` (misma lógica, doble fuente).

### 3.4) Pending approval

- **WineCatalogScreen:** `user.status === 'pending' && !isGuest` → PendingApprovalMessage; effects no cargan vinos.  
- **useAdminGuard:** status `pending` → no redirect; pantallas que comprueban `guardStatus === 'pending'` muestran PendingApprovalMessage (AdminDashboard, Settings, Inventory, WineManagement, Branch, Cocktail, InventoryAnalytics).  
- **Confirmado:** pending no ve catálogo ni pantallas admin con contenido sensible.

---

## 4) Entregable 4 — Multi-branch: estado real

- **Elección de branch:** Owner: selector en AdminDashboard (`setCurrentBranch`). Staff: una sola branch (filtered por `user.branch_id`).  
- **Dónde se guarda:** `BranchContext`: estado React `currentBranch`, `availableBranches`. No persistido en storage en código visto.  
- **Reglas por rol:** Owner ve todas las branches del owner_id; staff solo la branch con `branch_id === user.branch_id`.  
- **Switch branch:** Owner cambia en AdminDashboard → `setCurrentBranch(branch)`; staff no tiene switch (una branch).  
- **Cache:** Solo estado React; no refs ni AsyncStorage para branch en BranchContext.  
- **Gating profileReady:** BranchContext hace `loadBranchesFromDB` cuando `user && profileReady`; si !user, inicializa vacío y isInitialized true. Pantallas que dependen de branch suelen usar `currentBranch` + a veces `isInitialized` (ej. WineCatalogScreen: canLoad exige activeBranch e isInitialized en modo no-guest).

**Pantallas que dependen de branch (currentBranch / route.params.branchId):** WineCatalogScreen, AdminDashboard, QrGenerationScreen, TastingExamsListScreen, CreateTastingExamScreen, TakeTastingExamScreen, InventoryAnalyticsScreen, WineManagementScreen, AddWineToCatalogScreen, BranchManagementScreen, CocktailManagementScreen.  
**Riesgo:** Si `profileReady` es true pero branches no cargaron (error de red), `currentBranch` puede ser null y algunas pantallas pueden fallar o no cargar datos; no hay fallback explícito de "sin sucursal" en todas.

---

## 5) Entregable 5 — Supabase backend en repo

### A) Migraciones SQL (por nombre)

| Migración | Relación con |
|-----------|---------------|
| `20260207213838_remote_schema.sql` | Schema base: branches, users, qr_tokens, RLS, triggers (handle_new_user), create_staff_user, get_user_email_by_username, delete_user_account, enforce_*, etc. |
| `20250122120000_fix_reconcile_branch_locks.sql` | Reconcile branch locks, SECURITY DEFINER. |
| `20250122130100_reconcile_branch_locks_business_base.sql` | Branch locks, SECURITY DEFINER. |
| `20250122130000_fix_branch_limit_plan_ids.sql` | Límites por plan. |
| `20250122140000_delete_user_account_exception_debug.sql` | delete_user_account, SECURITY DEFINER. |
| `20260217120000_storage_wine_bottles_policies.sql` | Storage RLS. |
| `20260222120000_users_subscription_active_default_false.sql` | users.subscription_active default. |
| `20260222130000_fix_cocktail_menu_insert_rls.sql` | RLS cocktail_menu. |
| `20260222150000_create_guest_qr_token_rpc.sql` | RPC create_guest_qr_token, SECURITY DEFINER. |

**staff_join_requests / request_staff_access / approve_staff_request / reject_staff_request:** No aparecen en migraciones de este repo (UNKNOWN si existen en BD remota).

### B) RPC / SQL functions críticas (del schema)

- **create_staff_user(p_user_id, p_email, p_name, p_qr_token, p_username DEFAULT NULL):** SECURITY DEFINER. Valida token en qr_tokens; obtiene owner_id, branch_id; insert/update public.users (role staff, status pending); confirma email en auth. Retorna json success/error.  
- **get_user_email_by_username(p_username):** SECURITY DEFINER. Retorna TABLE(email, user_id, status). Uso: login por “username” en AuthScreen.  
- **create_guest_qr_token(p_branch_id, p_duration, p_max_uses):** SECURITY DEFINER (migración 20260222150000). Valida caller (owner o gerente/supervisor del branch); insert qr_tokens type guest.  
- **handle_new_user():** Trigger on auth.users; SECURITY DEFINER. Lee raw_user_meta_data (qrToken, invitationType); si invitationType = 'admin_invite' insert users con role staff, status pending, owner_id/branch_id desde qr_tokens; confirma email.  
- **delete_user_account(p_user_id):** SECURITY DEFINER, search_path public. Borrado en cascada según rol.  
- **enforce_subscription_expiry** (referenciado en app): llamado desde SubscriptionsScreen; no leído el cuerpo en esta auditoría.

### C) Edge Functions

| Función | Handler | Auth | Contrato / notas |
|---------|----------|------|------------------|
| public-menu | GET/POST token en query o body | No | Solo tokens type guest; devuelve branch + wines. |
| user-created | POST JSON body | Bearer (usuario recién registrado) | Payload: qrToken?, invitationType?, branchId?, name?, username?. Crea/actualiza public.users. |
| rate-limiter | POST { action, identifier } | No (usa service role internamente) | Límites por acción (login, register, etc.). |
| create-checkout-session | POST { planLookupKey } | Bearer (owner) | Stripe Checkout Session. |
| update-subscription | - | Bearer | Actualización suscripción. |
| cancel-subscription | - | Bearer | Cancelación. |
| create-portal-session | - | Bearer | Portal Stripe. |
| get-addon-price | - | - | Precio addon branches. |
| stripe-webhook | POST (Stripe signature) | Stripe-Signature + secret | Sincroniza eventos Stripe con subscriptions/users. |
| delete-user-account | - | Bearer | Eliminación cuenta. |
| user-onboarding | - | - | No inspeccionado. |

Stripe: create-checkout-session crea sesión; usuario paga en Stripe; stripe-webhook recibe eventos y actualiza BD. Rate limiting en rate-limiter (KV o tabla); sin rate limit explícito en public-menu en el código visto.

---

## 6) Entregable 6 — Seguridad (P0/P1/P2/P3)

### Hallazgos

| ID | Severidad | Archivo | Repro / descripción | Fix sugerido |
|----|-----------|---------|---------------------|--------------|
| S1 | P1 | `src/screens/AuthScreen.tsx` | Login con "Usuario o Email": si se ingresa username, RPC `get_user_email_by_username` devuelve email. Permite enumerar usuarios por username si la RPC no restringe (ej. por tenant). | Refactor a email-only; o restringir RPC por tenant/rate. |
| S2 | P1 | `src/lib/supabase.ts` | console.log de supabaseUrl y primeros 20 caracteres de anon key en cada carga. | Quitar logs en producción o gate por __DEV__. |
| S3 | P2 | `src/contexts/AuthContext.tsx` | ensureUserRow crea fila en public.users desde metadata (invitationType admin_invite vs owner). Si un cliente manipula metadata podría intentar elegir rol (mitigado por RLS/trigger en signup). | Revisar que auth signUp no permita metadata arbitrario que anule trigger; preferir trigger como única fuente. |
| S4 | P2 | Varias Edge Functions | CORS `Access-Control-Allow-Origin: '*'`. | Restringir orígenes en producción. |
| S5 | P2 | `supabase/functions/user-created/index.ts` | Logs con payload y user id/email. | Evitar loguear datos personales en prod; usar niveles. |
| S6 | P2 | `src/screens/AdminLoginScreen.tsx` | Llama signIn(username, password): parámetro "username" pero AuthContext.signIn espera email; si se pasa username sin normalizar, login falla. | Unificar: aceptar solo email y documentar; o resolver username a email en AuthContext. |
| S7 | P0/P1 | UNKNOWN | RLS de tablas críticas (users, branches, qr_tokens): no se revisaron políticas una a una en esta auditoría. | Revisar RLS users (por owner_id, id), branches (owner_id), qr_tokens (insert/select por tipo y expiración). |
| S8 | P3 | `src/utils/permissions.ts` vs `rolePermissions.ts` | canManageUsers duplicado (misma lógica); UserManagement usa permissions. | Unificar en rolePermissions e importar desde ahí. |

### Top 10 por prioridad

1. **(P0)** Revisar RLS de `users`, `branches`, `qr_tokens` y tablas sensibles (cross-tenant, escalación de rol).  
2. **(P1)** Eliminar o condicionar logs que exponen URL/key en `src/lib/supabase.ts`.  
3. **(P1)** Refactor login a email-only y/o endurecer `get_user_email_by_username` (rate/tenant).  
4. **(P1)** Verificar que Android reciba `cellarium://auth-callback` (intent-filter) para OAuth.  
5. **(P2)** Unificar signIn( email ) y etiqueta "Email" en AuthScreen/AdminLogin.  
6. **(P2)** Restringir CORS en Edge Functions en producción.  
7. **(P2)** Reducir logs con PII en user-created (y otras Edge).  
8. **(P2)** Asegurar que `handle_new_user` sea la única vía de creación de fila en users en signup (no depender de ensureUserRow con metadata editable).  
9. **(P3)** Centralizar canManageUsers en rolePermissions.  
10. **(P3)** Documentar o implementar en repo las tablas/RPC de staff_join_requests y request_staff_access si ya existen en BD.

---

## 7) Entregable 7 — Observabilidad y debugging

- **Logging:** `src/utils/logger.ts`: solo loguea en `__DEV__`; nivel debug desactivado por defecto (DEBUG_SUBSCRIPTIONS). safeString trunca objetos. No se envían tokens.  
- **Supabase URL/Key:** `src/lib/supabase.ts` hace console.log de URL y key (primeros 20 chars) siempre → ver S2.  
- **Errores al usuario:** Alert.alert con mensajes de error; `mapSupabaseErrorToUi` en varios sitios (`src/utils/supabaseErrorMapper.ts`).  
- **Sentry/Crashlytics/Expo updates:** No referenciados en el código revisado (búsqueda rápida: no hay import de Sentry ni Crashlytics). app.config.js: updates.enabled = false.  
- **Manejo de errores en Supabase/Edge:** try/catch en llamadas; errores mostrados por Alert o estado local; en Edge (user-created, public-menu) respuestas JSON con error.  
- **Conclusión:** Estrategia basada en __DEV__ y Alert; sin servicio de errores remoto ni updates OTA en el código visto.

---

## 8) Entregable 8 — Recomendaciones inmediatas (3 PRs)

### PR 1 — Login email-only y limpieza de logs

- **Objetivo:** Refactor login a email-only sin romper Google OAuth; quitar logs sensibles en producción.  
- **Archivos:** `src/screens/AuthScreen.tsx`, `src/screens/AdminLoginScreen.tsx`, `src/lib/supabase.ts`, textos i18n si aplica (LanguageContext para "Email" / "Usuario o Email").  
- **Pasos:** (1) Cambiar label/placeholder a "Email" y validar formato email en login. (2) Eliminar rama que usa `get_user_email_by_username` para login (o dejarla solo para flujo interno si se documenta). (3) En supabase.ts, no loguear URL/key salvo en __DEV__. (4) AdminLoginScreen: asegurar que se pase email a signIn.  
- **Riesgos:** Usuarios que hoy inician sesión con username dejarán de poder hacerlo hasta que tengan email.  
- **Tests manuales:** Login con email; login con Google; intento de login con username (debe rechazarse o mostrar mensaje claro).

### PR 2 — Unificar permisos y asegurar pending en una sola fuente

- **Objetivo:** Una sola fuente de verdad para permisos por rol; confirmar que pending no ve nada sensible.  
- **Archivos:** `src/utils/rolePermissions.ts`, `src/utils/permissions.ts`, `src/screens/UserManagementScreen.tsx`.  
- **Pasos:** (1) En permissions.ts, re-exportar canManageUsers desde rolePermissions (o eliminar duplicado y cambiar import en UserManagementScreen). (2) Revisar que todas las pantallas que comprueban “puede gestionar usuarios” usen rolePermissions. (3) Revisión rápida: usuario pending solo ve PendingApprovalMessage en las pantallas ya modificadas.  
- **Riesgos:** Bajo si solo se unifican imports y lógica ya equivalente.  
- **Tests manuales:** Login como owner, gerente, sommelier, personal; comprobar acceso a Users, QR, Tasting; usuario pending no ve catálogo ni admin con datos.

### PR 3 — Documentar/versionar staff_join_requests y RPCs en repo

- **Objetivo:** Si la BD ya tiene tabla staff_join_requests y RPCs approve_staff_request/reject_staff_request (y opcionalmente request_staff_access), traerlas al repo como migraciones y documentar contrato.  
- **Archivos:** Nuevas migraciones en `supabase/migrations/`, `docs/STAFF_WEB_REGISTRATION_CONTEXT.md` o equivalente.  
- **Pasos:** (1) Exportar desde BD actual (si existe) definición de staff_join_requests y de las RPCs. (2) Añadir migración(es) al repo. (3) Documentar en docs contrato de request_staff_access (y too_many_pending, consumo atómico de token). (4) Revisar que la app (UserManagementScreen) siga alineada con las firmas.  
- **Riesgos:** Ninguno si solo se documenta y versiona; si se cambia firma de RPC, ajustar llamadas en app.  
- **Tests manuales:** Aprobar/rechazar solicitud desde app; verificar que BD quede consistente (users.status, staff_join_requests.status, qr_tokens.used).

---

**Fin del reporte.** Todo afirmado está soportado por rutas de archivo indicadas; donde no se encontró código (staff_join_requests, request_staff_access en migraciones) se marcó UNKNOWN.
