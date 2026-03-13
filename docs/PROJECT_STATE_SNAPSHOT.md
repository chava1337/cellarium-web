# PROJECT_STATE_SNAPSHOT — Estado actual total del repo Cellarium

**Fecha auditoría:** 2026-01-22  
**Alcance:** Solo lectura y análisis. Sin cambios de código.

---

## 0. Resumen ejecutivo

- **Frontend:** Expo RN (React Navigation Stack). Navegación en `AppNavigator.tsx`; auth/hydrate en `AuthContext`; permisos en `utils/permissions.ts` y `utils/effectivePlan.ts`.
- **Backend:** 11 Edge Functions en `supabase/functions/`. Stripe (webhook, checkout, portal, update-subscription), delete-user-account, resolve-qr, public-menu, user-created, user-onboarding, rate-limiter, get-addon-price.
- **Base de datos:** Schema en `20260207213838_remote_schema.sql`; migraciones adicionales para RPCs, RLS y suscripciones. RPCs: `delete_user_account`, `get_plan_id_effective`, `is_subscription_effectively_active`, `get_branch_limit_for_owner`, `reconcile_branch_locks`, `create_guest_qr_token`.
- **QR:** Flujo actual sin `validateQrToken` en cliente: staff → `resolve-qr`; guest → `public-menu`; legacy → public-menu luego resolve-qr. Guards en WineCatalogScreen evitan SELECT a `wine_branch_stock` en guest sin token.
- **Riesgo principal:** Policy `qr_tokens` "Owners can view their qr_tokens" con `OR (expires_at > now())` permite SELECT a anon si no se endureció en migración posterior; `guests_can_view_public_stock` en `wine_branch_stock` sigue en schema (subquery a qr_tokens). RPC `enforce_subscription_expiry` **no está versionada** en migraciones del repo.

---

## 1. Contexto ya implementado (solo documentar)

### 1.1 QR y seguridad

- **validateQrToken:** Definido en `src/services/QrTokenService.ts` (líneas 31, 35, 87). **No se llama** desde el flujo QR actual; QrProcessorScreen usa solo `resolve-qr` y `public-menu` (comentario línea 246).
- **Staff invite:** Edge `resolve-qr` (POST, service_role) valida token tipo `admin_invite`, marca usado (1 uso), devuelve owner_id, branch_id, branch_name. App navega a AdminRegistration con esos params.
- **Guest menu:** App llama `PublicMenuService.getPublicMenuByToken(token)` → Edge `public-menu` (GET/POST, service_role). WineCatalogScreen en guest con `guestToken` **no** llama a `WineService.getWinesByBranch`; usa solo `loadGuestMenuByToken()`.
- **Guards WineCatalogScreen:** `loadWines` y `safeLoadWines` tienen guard `if (isGuest === true && !guestToken?.trim()) return;`. Efectos de carga con `canLoad = isGuest ? false : ...` para no disparar safeLoadWines en guest sin token.
- **RLS qr_tokens:** En schema base (`20260207213838_remote_schema.sql` líneas 3745–3746) policy "Owners can view their qr_tokens" con `(auth.uid() = owner_id) OR (expires_at > now())` → anon vería filas con expires_at > now(). Si en producción se aplicó migración que restringe anon, debe confirmarse en BD.
- **guests_can_view_public_stock:** Definida en mismo schema (4137–4144) en `wine_branch_stock` para SELECT to public con subquery a `qr_tokens` (type guest, expires_at > now(), used false/null). Si anon no puede leer qr_tokens, el subquery devuelve vacío y la policy no otorga filas. App guest ya no hace ese SELECT (solo public-menu).

### 1.2 Borrado de cuenta (Opción B)

- Edge `delete-user-account`: lee `users.subscription_active`, `stripe_subscription_id`; si `subscription_active === true` o hay `stripe_subscription_id` → responde **409** con `code: 'SUBSCRIPTION_ACTIVE'` y mensaje para cancelar desde Portal. App (SettingsScreen) muestra alert y navega a Suscripciones.

---

## 2. Inventario del repo

### 2.1 Frontend (Expo RN)

**Estructura relevante:**

| Ruta | Descripción |
|------|-------------|
| `src/screens/AppNavigator.tsx` | Stack navigator; rutas: WineCatalog, QrProcessor, AdminLogin, AdminDashboard, UserManagement, TastingNotes, QrGeneration, BranchManagement, etc. |
| `src/contexts/AuthContext.tsx` | Session, hydrateProfile, refreshUser, user state; select `users` con subscription_* y role/owner_id/branch_id. |
| `src/contexts/BranchContext.tsx` | currentBranch, availableBranches, setCurrentBranch; multi-branch. |
| `src/contexts/GuestContext.tsx` | Mock guest session/branch (startSession con datos de prueba). |
| `src/utils/permissions.ts` | canGenerateGuestQr, canGenerateAdminInviteQr, hasPermission, etc. |
| `src/utils/effectivePlan.ts` | getEffectivePlan(user), getOwnerEffectivePlan(user) async; EffectivePlanId. |
| `src/services/PublicMenuService.ts` | getPublicMenuByToken(token) → fetch Edge public-menu. |
| `src/services/WineService.ts` | getWinesByBranch(branchId, ownerId) → SELECT wine_branch_stock + wines. |
| `src/services/QrGenerationService.ts` | createGuestQrToken (RPC create_guest_qr_token), getUserQrTokens, etc. |
| `src/services/QrTokenService.ts` | validateQrToken (no usado en flujo QR), generateUniversalQrUrl. |
| `src/services/QrService.ts` | Clase QrService con validateQrToken; **no importada en ningún otro archivo** (código muerto). |
| `src/types/index.ts` | User, Branch, Wine, RootStackParamList (WineCatalog: branchId?, isGuest?, guestToken?). |

**Pantallas principales (por nombre):**

- WineCatalogScreen: catálogo de vinos; guest con guestToken vía public-menu; staff/owner vía getWinesByBranch.
- QrProcessorScreen: procesa QR (deep link / params); staff → resolve-qr → AdminRegistration; guest → WineCatalog con guestToken; legacy → public-menu luego resolve-qr.
- QrGenerationScreen: genera QR comensales (createGuestQrToken) o admin (generateQrToken); gating por canGenerateGuestQr / canGenerateAdminInviteQr.
- AdminRegistrationScreen: registro staff con ownerId/branchId de resolve-qr; RPC create_staff_user.
- SubscriptionsScreen: checkout (create-checkout-session), portal (create-portal-session), enforce_subscription_expiry + refreshUser, update-subscription (add-ons).
- SettingsScreen: eliminar cuenta → invoke delete-user-account; maneja 409 SUBSCRIPTION_ACTIVE.
- BranchManagementScreen, UserManagementScreen, WineManagementScreen, InventoryManagementScreen, AnalyticsScreen, etc.: flujos propietarios/staff.

**Flujos mapeados:**

- **Auth:** AuthContext: getSession → loadUserData (select users) → setUser; profileReady; refreshUser re-reads users.
- **Roles/permisos:** `public.users.role` (owner, gerente, sommelier, supervisor, personal); owner_id/branch_id para staff. effectivePlan desde users.subscription_*; getOwnerEffectivePlan solo para lógica que ya no depende del plan para gerente (canGenerateGuestQr gerente ya no usa ownerEffectivePlan).
- **Multi-branch:** BranchContext; currentBranch; staff filtrado por user.branch_id.
- **Suscripciones:** SubscriptionsScreen → create-checkout-session / create-portal-session; stripe-webhook actualiza subscriptions y users; enforce_subscription_expiry (RPC) + refreshUser en mount/focus.
- **QR:** Generación en QrGenerationScreen (createGuestQrToken RPC). Consumo: QrProcessorScreen → resolve-qr (staff) o public-menu (guest); WineCatalog guest con guestToken solo loadGuestMenuByToken.

**Deep links:** QrProcessorScreen usa `Linking.getInitialURL()` y `Linking.addEventListener('url')`; patrones `cellarium://qr/...` y `?data=`.

### 2.2 Backend (Edge Functions)

| Función | Ruta | Método | Auth | Tablas/RPC | Códigos error |
|---------|------|--------|------|------------|----------------|
| stripe-webhook | `supabase/functions/stripe-webhook/index.ts` | POST | Stripe signature | users, subscriptions; reconcile_branch_locks | - |
| create-checkout-session | `supabase/functions/create-checkout-session/index.ts` | POST | Bearer | - | - |
| create-portal-session | `supabase/functions/create-portal-session/index.ts` | POST | Bearer | - | - |
| update-subscription | `supabase/functions/update-subscription/index.ts` | POST | Bearer | users, subscriptions; reconcile_branch_locks | - |
| get-addon-price | `supabase/functions/get-addon-price/index.ts` | GET/POST | - | - | - |
| delete-user-account | `supabase/functions/delete-user-account/index.ts` | POST | Bearer (anon key + JWT) | users (read), RPC delete_user_account, auth.admin.deleteUser | 401, 409 SUBSCRIPTION_ACTIVE, 500 |
| resolve-qr | `supabase/functions/resolve-qr/index.ts` | POST | No (anon key en header) | qr_tokens (SELECT + UPDATE) | 400 INVALID_BODY/INVALID_TOKEN/TOKEN_TYPE_NOT_ALLOWED, 404 TOKEN_NOT_FOUND, 410 TOKEN_EXPIRED, 409 TOKEN_USED, 500 |
| public-menu | `supabase/functions/public-menu/index.ts` | GET, POST | No | qr_tokens, branches, wine_branch_stock, wines (service_role) | 400 invalid_token, 404 token, 400 token_expired / token_limit_exceeded |
| user-created | `supabase/functions/user-created/index.ts` | - | Trigger / webhook | users, qr_tokens (read) | - |
| user-onboarding | `supabase/functions/user-onboarding/index.ts` | - | - | - | - |
| rate-limiter | `supabase/functions/rate-limiter/index.ts` | - | - | rate_limits (service) | - |

### 2.3 Base de datos (migraciones)

**Tablas public.*** (principales): users, branches, wines, wine_branch_stock, qr_tokens, qr_scans, qr_tokens_backup, subscriptions, payments, invoices, tasting_*, staff_join_requests, inventory_movements, sales, sale_items, rate_limits, cocktails, cocktail_menus, etc.

**Constraints:** CHECK subscriptions (plan_id), FKs users → auth.users, branches.owner_id → users, qr_tokens.branch_id → branches, etc. Unique qr_tokens.token.

**RPCs versionados en repo:**

- `get_plan_id_effective(p_owner uuid)` — `20260207213838_remote_schema.sql` (1811).
- `is_subscription_effectively_active(p_owner uuid)` — mismo schema (2020).
- `get_branch_limit_for_owner(p_owner uuid)` — `20250122130000_fix_branch_limit_plan_ids.sql`.
- `reconcile_branch_locks(p_owner_id uuid)` — `20250122120000`, `20250122130100_reconcile_branch_locks_business_base.sql`, `20260207213838`.
- `delete_user_account(p_user_id uuid)` — `20250122140000_delete_user_account_exception_debug.sql`.
- `create_guest_qr_token(p_branch_id, p_duration, p_max_uses)` — `20260222150000_create_guest_qr_token_rpc.sql`.
- `create_staff_user(...)` — en schema remoto.

**USED_BUT_NOT_VERSIONED:**  
- `enforce_subscription_expiry` — llamado desde `src/screens/SubscriptionsScreen.tsx` (línea 537); **no aparece en ninguna migración del repo**. Crear migración que la defina o documentar que existe solo en dashboard.

---

## 3. Búsquedas obligatorias — resumen por archivo

- **from('qr_tokens')** en código ejecutable: QrTokenService.ts (3), QrGenerationService.ts (3), QrService.ts (varias), user-created/index.ts (1), resolve-qr/index.ts (2), public-menu/index.ts (1). Cliente: QrTokenService (validateQrToken no usado), QrGenerationService (auth), QrService (no importado).
- **validateQrToken:** Definido en QrTokenService y QrService; **solo comentario** en QrProcessorScreen; no hay llamadas.
- **resolve-qr / public-menu:** Invocados desde QrProcessorScreen y PublicMenuService; Edges en supabase/functions.
- **from('wine_branch_stock')** en app: WineService, WineCatalogScreen (UPSERT), InventoryService, SalesService, AnalyticsService, GlobalWineCatalogService, TastingExamService, InventoryManagementScreen, InventoryAnalyticsScreen, GlobalWineCatalogScreen. Guest: solo WineCatalogScreen vía loadWines, que está bloqueado por guard cuando isGuest sin guestToken.
- **guests_can_view_public_stock:** En schema `20260207213838_remote_schema.sql` (4137); no eliminada en repo.
- **subscription_plan / stripe_subscription_id:** AuthContext, SubscriptionsScreen, SubscriptionService, effectivePlan, types; delete-user-account Edge lee stripe_subscription_id.

---

## 4. Verificaciones automáticas

- **TypeScript:** `npm run type-check` (tsc --noEmit) — ejecutado; salida sin errores en el fragmento capturado (comando puede haber tardado).
- **ESLint:** `npm run lint` — no ejecutado correctamente por PowerShell (separador `&&`). Recomendación: ejecutar en bash o `npm run lint` en raíz.
- **Tests:** `npm run test` (Jest) definido; no ejecutado en esta auditoría.
- **Imports muertos:** `QrService` solo está definido en `src/services/QrService.ts`; ningún otro archivo lo importa. **Confirmado sin uso.**  
  `validateQrToken` (QrTokenService) no se importa en QrProcessorScreen ni en ningún otro archivo; **confirmado sin uso** en flujo QR.

---

## 5. Fuentes de verdad

- **Rol y tenant:** `public.users` (role, owner_id, branch_id). AuthContext hidrata desde users.
- **Plan efectivo:** `users.subscription_plan`, `subscription_active`, `subscription_expires_at`; app: `getEffectivePlan(user)` en `effectivePlan.ts`.
- **Límite de sucursales:** RPC `get_branch_limit_for_owner`; bloqueo: `reconcile_branch_locks`; trigger enforce_branch_limit en branches.
- **QR guest:** Generación RPC `create_guest_qr_token`; consumo Edge `public-menu`; app no toca qr_tokens ni wine_branch_stock en guest.
- **QR staff:** Edge `resolve-qr`; app no usa validateQrToken.

Este documento es el snapshot principal; los demás (SECURITY_RLS_AUDIT, BILLING_SUBSCRIPTIONS_AUDIT, QR_SYSTEM_AUDIT, KNOWN_RISKS_AND_FIX_QUEUE, ARCHITECTURE_MAP) detallan por área.

---

## 8. Resumen ejecutivo (salida final)

### Estado actual — qué funciona y qué está cerrado

- **Cerrado:** Flujo QR sin validateQrToken; staff vía resolve-qr; guest vía public-menu; guards en WineCatalogScreen para guest sin token; delete-user-account bloquea si suscripción activa (Opción B); gerente puede generar QR comensales sin depender del plan del owner.
- **Funciona:** Auth + hydrateProfile + refreshUser; multi-branch; suscripciones Stripe (checkout, portal, webhook, reconcile_branch_locks); generación QR (create_guest_qr_token); consumo QR (resolve-qr, public-menu).
- **Incierto:** Si RLS qr_tokens en producción ya restringe anon (schema base tiene OR expires_at > now()); si enforce_subscription_expiry existe en BD (no está en migraciones del repo).

### Top 10 riesgos

1. **anon puede leer qr_tokens** (policy con OR expires_at > now()) si no se endureció en migración posterior.
2. **enforce_subscription_expiry no versionada** — RPC usada por app pero no definida en repo.
3. **guests_can_view_public_stock** depende de subquery a qr_tokens; redundante para app actual pero sigue en schema.
4. **Código muerto:** QrService sin referencias; validateQrToken (QrTokenService) sin llamadas.
5. **reconcile_branch_locks** puede usar 'business' en vez de 'additional-branch' en alguna migración.
6. **AdminRegistrationScreen** podría hacer SELECT a qr_tokens (verificar y dejar de depender si se endurece RLS).
7. **Race/hydrateProfile** — profileReady y carga asíncrona pueden causar flashes de permisos.
8. **Validación branchId/ownerId** en servicios no exhaustiva.
9. **Loaders** en handlers de Edge (setLoading en todos los caminos).
10. **Inconsistencia plan_id** (pro/business vs basic/additional-branch) en distintos puntos del backend.

### Top 10 quick wins

1. Migración: restringir SELECT qr_tokens a authenticated (o eliminar OR expires_at para anon).
2. Añadir migración que defina enforce_subscription_expiry.
3. DROP o restringir policy guests_can_view_public_stock.
4. Eliminar clase QrService o marcar @deprecated; evaluar eliminar validateQrToken si no hay uso.
5. Confirmar en BD si anon ve qr_tokens y documentar resultado.
6. Revisar AdminRegistrationScreen: no depender de SELECT qr_tokens.
7. Revisar try/catch/finally en SettingsScreen (delete account) y QrGenerationScreen.
8. Unificar reconcile_branch_locks para plan_id IN ('business','additional-branch').
9. Ejecutar npm run lint y type-check en CI; corregir errores.
10. Documentar en README o runbook: RPCs que deben existir (enforce_subscription_expiry), flujo QR actual (sin validateQrToken).

### Checklist antes de tocar RLS/DB en producción

- [ ] Confirmar en BD si anon puede SELECT qr_tokens.
- [ ] Backup de policies de qr_tokens y wine_branch_stock.
- [ ] Probar en staging: QR staff (resolve-qr → AdminRegistration), QR guest (public-menu → WineCatalog), generación QR.
- [ ] Verificar que ningún cliente externo dependa de SELECT anon a qr_tokens o wine_branch_stock.
- [ ] Versionar enforce_subscription_expiry o documentar que existe solo en dashboard.

### Qué falta para considerar "v1 estable"

- RLS qr_tokens endurecido (anon sin SELECT).
- enforce_subscription_expiry en migraciones o documentada.
- Código muerto (QrService, validateQrToken) eliminado o documentado.
- reconcile_branch_locks alineado con plan_id additional-branch.
- Tests automatizados para flujos críticos (QR, suscripción, borrado cuenta).
- Runbook/README con fuentes de verdad y flujos end-to-end.
