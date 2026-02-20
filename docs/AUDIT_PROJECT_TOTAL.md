# Auditoría total – Cellarium (prod readiness)

**Alcance:** Inventario, seguridad, multi-tenant, Stripe, performance, integridad. Sin cambiar patrón Auth (optimistic + hydrate, no getSession manual, no quitar optimistic auth).

---

## 1. Resumen ejecutivo

- **Contexto:** App Expo RN + Supabase (Auth/Postgres/RLS/Edge) + Stripe; webhook vía proxy Vercel. Multi-tenant (owners/staff, branches). Auth con `onAuthStateChange`, `optimisticUserFromAuth` + `hydrateProfile`, `profileReady` y `useAdminGuard`.
- **Hallazgos críticos (P0):** 1) RLS `cocktail_menu_insert_owner`: condición staff siempre verdadera (`u.owner_id = u.owner_id`), permite INSERT cross-tenant. 2) Sin otros P0 de seguridad confirmados; RPC `delete_user_account` no valida `auth.uid()` (mitigado porque solo la Edge con token del usuario llama con `user.id`).
- **Hallazgos P1/P2:** Endurecer RPC con `auth.uid()`; revisar subscriptions INSERT/UPDATE solo vía service_role; observabilidad y pequeños fixes de UX/performance.
- **Recomendación:** Aplicar fix RLS cocktail_menu (P0), luego PRs de endurecimiento, multi-branch, performance y observabilidad.

---

## 2. FASE 1 – Inventario (mapa del sistema)

### 2.1 Contexts

| Contexto | Archivo | Rol |
|----------|---------|-----|
| AuthContext | `src/contexts/AuthContext.tsx` | Sesión, user, optimisticUserFromAuth, hydrateProfile, refreshUser, profileReady (userDataStatus === 'ok') |
| BranchContext | `src/contexts/BranchContext.tsx` | currentBranch, availableBranches, loadBranchesFromDB (owner_id/staff branch_id), refreshBranches, isInitialized |
| LanguageContext | `src/contexts/LanguageContext.tsx` | i18n (es/en) |
| GuestContext | `src/contexts/GuestContext.tsx` | Sesión invitado, currentBranch para QR guest |

### 2.2 Navegación

- **AppNavigator:** `src/screens/AppNavigator.tsx` – un solo `createStackNavigator`, rutas: WineCatalog, QrProcessor, AdminDashboard, UserManagement, TastingNotes, QrGeneration, BranchManagement, WineManagement, GlobalWineCatalog, AddWineToCatalog, QrScanner, InventoryManagement, FichaExtendidaScreen, TastingExamsList, CreateTastingExam, TakeTastingExam, TastingExamResults, Settings, CocktailManagement, Subscriptions. `initialRouteName="WineCatalog"`.

### 2.3 Pantallas críticas

- Subscriptions, BranchManagement, AdminDashboard, GlobalWineCatalog, InventoryAnalytics, TastingExamsList/Create/Take/Results, UserManagement, QrGeneration/QrProcessor/QrScanner, WineManagement, AddWineToCatalog, CocktailManagement, Settings.

### 2.4 Servicios

- SubscriptionService, PaymentService, GlobalWineCatalogService, SubscriptionEnforcement, WineService, TastingExamService, AnalyticsService, etc.

### 2.5 Edge Functions (Supabase)

- stripe-webhook, create-checkout-session, update-subscription, create-portal-session, get-addon-price, delete-user-account, user-created, user-onboarding, rate-limiter.

### 2.6 Tablas core (schema)

- **users** (id, email, role, status, branch_id, owner_id, subscription_plan, subscription_active, subscription_expires_at, subscription_branches_count, subscription_branch_addons_count, stripe_customer_id, …)
- **branches** (id, name, address, owner_id, is_main, is_locked, lock_reason, locked_at)
- **subscriptions** (owner_id, user_id, plan_id, stripe_subscription_id, current_period_start/end, metadata, status)
- **wines_canonical** (global), **wines** (por owner), **wine_branch_stock** (por branch)
- **inventory_movements**, **cocktail_menu**, **tasting_exams**, **tasting_exam_wines**, **tasting_responses**, **tasting_wine_responses**, **qr_tokens**, **invoices**, **payments**, **sales**, **sale_items**, **rate_limits**

### 2.7 Fuentes de verdad

- **Plan efectivo:** `getEffectivePlan(user)` (effectivePlan.ts) + BD users/subscriptions.
- **Límite branches:** `get_branch_limit_for_owner(p_owner)`, `reconcile_branch_locks(p_owner_id)`, trigger `enforce_branch_limit` en INSERT branches.
- **Current branch:** BranchContext + users.branch_id + branches.owner_id; staff filtrado por branch_id.
- **Permisos:** subscriptionPermissions (checkSubscriptionFeature, checkSubscriptionLimit) + useAdminGuard (loading/profile_loading/pending/denied/allowed).
- **Multi-tenant:** RLS por auth.uid(), users.owner_id, users.branch_id, branches.owner_id.

---

## 3. FASE 2 – Auditoría de seguridad (P0/P1)

### 3.1 RLS por tabla crítica

- **users:** SELECT (auth.uid() = id OR auth.uid() = owner_id); INSERT (auth.uid() = id); UPDATE (auth.uid() = id o auth.uid() = owner_id para staff). Sin cross-tenant si se usan bien.
- **branches:** INSERT/UPDATE (auth.uid() = owner_id); SELECT (owner o staff con users.branch_id = branches.id). Correcto.
- **subscriptions:** Solo SELECT (owner_id/user_id o users.owner_id); INSERT/UPDATE solo desde Edge (service_role). Correcto.
- **wines / wine_branch_stock / inventory_movements:** Owner y staff por owner_id/branch_id. Coherente con tenants.
- **cocktail_menu:** **P0 – BUG.** Policy `cocktail_menu_insert_owner`: para staff usa `EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.owner_id = u.owner_id AND u.branch_id = u.branch_id)`. Las condiciones `u.owner_id = u.owner_id` y `u.branch_id = u.branch_id` son siempre true; no se compara con `cocktail_menu.owner_id` ni `cocktail_menu.branch_id`. Cualquier autenticado puede INSERT en cualquier owner_id/branch_id.

**Evidencia:** `docs/audit_snippets/rls_cocktail_menu_insert_bug.sql`

**Repro:** Usuario staff (u.owner_id y u.branch_id no nulos) hace INSERT en `cocktail_menu` con owner_id/branch_id de otro tenant; la policy permite el INSERT.

**Fix mínimo (diff):**

```sql
-- Migración: 20260222130000_fix_cocktail_menu_insert_rls.sql
DROP POLICY IF EXISTS "cocktail_menu_insert_owner" ON public.cocktail_menu;
CREATE POLICY "cocktail_menu_insert_owner" ON public.cocktail_menu FOR INSERT TO public
WITH CHECK (
  (auth.uid() = owner_id)
  OR (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.owner_id IS NOT NULL
        AND u.branch_id IS NOT NULL
        AND u.owner_id = cocktail_menu.owner_id
        AND u.branch_id = cocktail_menu.branch_id
    )
  )
);
```

### 3.2 RPCs SECURITY DEFINER

- **delete_user_account(p_user_id):** No comprueba `auth.uid()`. La Edge solo invoca con `user.id` del token. **P2:** Añadir al inicio del RPC: si `p_user_id != auth.uid()` y el usuario no es owner del `p_user_id`, RAISE EXCEPTION. Ver `docs/audit_snippets/rpc_delete_user_account.sql`.
- **reconcile_branch_locks(p_owner_id):** SECURITY DEFINER; usa search_path y owner_id para lock/unlock branches. No expone datos de otros owners.
- **get_plan_id_effective / is_subscription_effectively_active / get_branch_limit_for_owner:** Leen users/subscriptions por p_owner; no modifican otros tenants.

### 3.3 Edge Functions

- **stripe-webhook:** Bearer obligatorio; opcional x-internal-webhook-secret; verificación de firma Stripe con raw body. Idempotente por event.id. Ver `docs/audit_snippets/edge_stripe_webhook_auth.ts`.
- **create-checkout-session / update-subscription:** Bearer del usuario; validan role owner y plan; no filtran secretos en respuestas de error.
- **delete-user-account:** Bearer; getUser(); llama RPC con user.id. Seguro por diseño; RPC sin auth.uid() es P2.

**Salida FASE 2:** P0 = fix RLS cocktail_menu. P1 = ninguno adicional. P2 = validación auth.uid() en delete_user_account RPC.

---

## 4. FASE 3 – Consistencia multi-branch / multi-tenant

### 4.1 BranchContext + selector

- **Estado actual:** Carga con `user && profileReady`; limpia al `!user`. Owner: todas las branches por owner_id; staff: filtro `branch.id === ownerUser.branch_id`. RLS branches SELECT: owner o users.branch_id = branches.id. No se filtra por is_locked en la query; el negocio de is_locked es límite de suscripción (reconcile_branch_locks), no visibilidad.
- **Riesgo:** Si un staff tiene branch_id nulo o desincronizado, podría ver lista vacía; no cross-tenant.
- **Fix sugerido:** Ninguno obligatorio; opcional: en UI no permitir acciones de escritura sobre branch con is_locked si se quiere reflejar el lock.

### 4.2 Creación de branches

- Trigger `enforce_branch_limit` llama a `get_branch_limit_for_owner(owner_id)`. Frontend usa `getBranchLimit` (effectivePlan) y `canCreateBranch`. Coherencia Business=3+addons, Free/Pro=1.
- **Conclusión:** Sin cambios necesarios para coherencia.

### 4.3 Staff / invitación

- QR staff → user-created con qrToken; owner_id/branch_id desde qr_tokens. status pending; useAdminGuard maneja pending sin redirigir a login admin. Acceso a datos por RLS (owner_id/branch_id).
- **Conclusión:** Sin hallazgos de branch mismatch ni leakage; RLS ya restringe por owner/branch.

**Salida FASE 3:** Sin fixes obligatorios; opcional reflejar is_locked en UI.

---

## 5. FASE 4 – Payments / Subscriptions (Stripe)

- **create-checkout-session:** Guard ALREADY_SUBSCRIBED (subscription_active === true); mapping lookup_key; errores sin filtrar secretos.
- **stripe-webhook:** Actualiza users + subscriptions; period end (subscription + invoice fallback); customer.subscription.deleted; idempotencia por evento.
- **update-subscription:** Addons 0–50; price branch_addon_monthly; actualiza users.subscription_branch_addons_count y subscriptions.metadata; reconcile_branch_locks.
- **Reconciliación:** SubscriptionsScreen llama enforceExpiryAndRefresh (enforce_subscription_expiry + refreshUser).

**Pruebas sugeridas (manual/automatizables):** Upgrade/downgrade/cancel at period end; delete subscription; addons add/remove; creación de branches bajo límite; usuario con Business en BD al arranque muestra Business (effectivePlan + bootstrap con subscription_*).

**Salida FASE 4:** Checklists en docs existentes; sin cambios de código obligatorios.

---

## 6. FASE 5 – Performance / UX / Estabilidad

- **Queries:** Evitar N+1 en listados (catálogos, exámenes, movimientos); usar paginación por keyset donde aplique.
- **Caching:** No cachear antes de profileReady (ya respetado en flujos que usan profileReady).
- **FlatList:** keyExtractor estable; evitar inline functions en renderItem donde impacte.
- **useEffect:** Revisar dependencias (user, profileReady, refreshUser) para evitar loops; BranchContext y SubscriptionsScreen ya tienen deps correctas.
- **Errores:** Retry/backoff en hydrateProfile; stripe-webhook responde 200 en fallos de negocio para no reintentar indefinidamente.
- **Logs:** Usar logger; __DEV__ para logs verbosos; no loguear secretos.

**Top 10 mejoras (impacto/esfuerzo):** 1) Fix RLS cocktail_menu (P0). 2) Paginación keyset en GlobalWineCatalog / listados grandes. 3) Validación auth.uid() en delete_user_account RPC. 4) Logs estructurados en Edge (eventId, tipo). 5) Revisar payloads de select (evitar select('*') en listados grandes). 6) Offline: mensaje claro cuando no hay red. 7) Timeouts en fetch críticos. 8) Evitar re-renders por referencias inestables en context. 9) Rate limiting en endpoints públicos (QR/menú) si no existe. 10) Documentar pruebas manuales de Stripe y branches.

---

## 7. FASE 6 – Data integrity / migraciones

- **subscription_active:** Default false en migración 20260222120000; correcto.
- **Constraints:** subscription_plan CHECK; plan_id en subscriptions; coherentes.
- **Índices:** owner_id, branch_id, created_at en tablas críticas (presentes en remote_schema).
- **Triggers:** enforce_branch_limit, reconcile_branch_locks, enforce_free_user_limits_on_update; consecuencias documentadas.
- **delete_user_account:** Limpia tasting_*, users, wines, branches, qr_tokens, etc., por owner o por user_id.

**Migraciones recomendadas:**

- `20260222130000_fix_cocktail_menu_insert_rls.sql` – Fix P0 RLS cocktail_menu (ver diff arriba).
- (Opcional) `20260222140000_rpc_delete_user_account_auth.sql` – Añadir comprobación auth.uid() en delete_user_account.

---

## 8. Top 15 riesgos (severidad P0–P3)

| # | Severidad | Riesgo | Impacto | Repro | Fix |
|---|-----------|--------|---------|--------|-----|
| 1 | P0 | RLS cocktail_menu INSERT permite cross-tenant | Staff puede crear ítems en branch de otro owner | INSERT cocktail_menu con owner_id/branch_id ajenos | Nueva policy con owner_id/branch_id del row (ver diff Fase 2) |
| 2 | P2 | delete_user_account RPC no valida auth.uid() | Si alguien llamara RPC con otro id podría borrar otro usuario | Solo Edge llama con user.id; RPC no comprueba | Añadir IF p_user_id != auth.uid() AND no es owner del staff THEN RAISE |
| 3 | P2 | Subscriptions INSERT/UPDATE solo por Edge | Sin policy INSERT en subscriptions, anon/authenticated no puede escribir; correcto | N/A | Ninguno; documentar |
| 4 | P3 | Logs en prod sin nivel | Dificulta diagnóstico | - | Centralizar logger; __DEV__ para verbose |
| 5 | P3 | Paginación en catálogos | Listas muy grandes pueden ser lentas | Catálogos con muchos ítems | Keyset pagination donde aplique |
| 6 | P3 | Race owner_id optimista vs real | Poco probable; hydrate actualiza | - | Ya manejado con profileReady |
| 7 | P3 | Stripe webhook sin idempotencia por id | Reintentos podrían duplicar efectos | Stripe reenvía mismo evento | stripe-webhook ya usa event; idempotencia por lógica (upsert subscriptions) |
| 8–15 | P3 | Varios (timeouts, offline, rate limit público, deps useEffect, select * en listados) | Menor impacto | - | Ver Fase 5 y 6 |

---

## 9. Checklist go/no-go producción

- [ ] **P0:** Fix RLS cocktail_menu desplegado y verificado.
- [ ] **Auth:** No getSession manual; optimistic + hydrate en uso; profileReady y useAdminGuard en pantallas sensibles.
- [ ] **Stripe:** Webhook proxy (Vercel) con URL correcta; stripe-signature y body raw; logs [PROXY] y [BOOT] en stripe-webhook.
- [ ] **Env:** STRIPE_WEBHOOK_SECRET, STRIPE_SECRET_KEY, SUPABASE_INTERNAL_WEBHOOK_URL, Bearer token en Vercel.
- [ ] **RLS:** users, branches, subscriptions, wines, wine_branch_stock, inventory_movements con políticas correctas (tras fix cocktail_menu).
- [ ] **Effective plan:** getEffectivePlan usado en subscriptionPermissions, branchLimit, SubscriptionsScreen; bootstrap con subscription_* en hydrate.
- [ ] **Branches:** get_branch_limit_for_owner y reconcile_branch_locks; trigger enforce_branch_limit.
- [ ] **Tests manuales:** Al menos: login owner/staff, crear branch bajo límite, flujo Suscripciones, webhook test event, borrar cuenta (si aplica).

---

## 10. Archivos tocados y diffs propuestos

### 10.1 Único cambio obligatorio (P0)

**Archivo:** Migración Supabase ya creada.

**Nombre:** `supabase/migrations/20260222130000_fix_cocktail_menu_insert_rls.sql`

**Contenido:** DROP POLICY + CREATE POLICY con condición staff correcta (owner_id/branch_id del row vs users). Aplicar con `supabase db push` o en el flujo habitual de migraciones.

### 10.2 Opcionales

- **RPC delete_user_account:** Añadir al inicio del body (tras DECLARE): validación `IF p_user_id != auth.uid() AND NOT (SELECT (owner_id = auth.uid()) FROM users WHERE id = p_user_id) THEN RAISE EXCEPTION 'No autorizado'; END IF;`
- **Logs:** Revisar que logger y __DEV__ estén usados de forma consistente en edges y pantallas críticas.

---

## 11. PRs sugeridas

| PR | Contenido | Archivos | Riesgos | Rollback |
|----|------------|----------|---------|----------|
| **PR1 – Seguridad P0/P1** | Fix RLS cocktail_menu; opcional RPC delete_user_account auth | Nueva migración; opcional migración RPC | Bajo; policy más restrictiva | Revertir migración |
| **PR2 – Multi-branch** | Sin cambios obligatorios; doc y opcional is_locked en UI | Docs; opcional BranchContext/UI | Nulo | - |
| **PR3 – Performance + UX** | Paginación keyset donde aplique; timeouts; mensaje offline | Pantallas catálogo; lib/supabase o fetch | Medio si paginación mal hecha | Revertir commits |
| **PR4 – Observabilidad** | Logger en edges; __DEV__; requestId/correlation si aplica | Edge functions; logger | Bajo | Revertir |

---

## 12. Snippets y evidencia

- **RLS branches, users, subscriptions:** `docs/audit_snippets/rls_branches_users_subscriptions.sql`
- **RLS cocktail_menu bug:** `docs/audit_snippets/rls_cocktail_menu_insert_bug.sql`
- **RPC delete_user_account:** `docs/audit_snippets/rpc_delete_user_account.sql`
- **Edge stripe-webhook auth:** `docs/audit_snippets/edge_stripe_webhook_auth.ts`

**Estado actual observado:** AuthContext (optimisticUserFromAuth, hydrateProfile con USERS_BOOTSTRAP_SELECT incluyendo subscription_plan/active/expires_at), BranchContext (loadBranchesFromDB con owner_id/staff branch_id), RLS en `20260207213838_remote_schema.sql` (policy cocktail_menu_insert_owner líneas 3569–3576), delete_user_account en `20250122140000_delete_user_account_exception_debug.sql` sin comprobación auth.uid().
