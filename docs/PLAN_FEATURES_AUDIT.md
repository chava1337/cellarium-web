# Cellarium – Auditoría de planes (Free, Pro, Business)

**Objetivo:** Especificación tipo “matriz de features” por plan basada **solo en el código actual** del repo. Sirve para QA y para detectar inconsistencias (app vs DB vs Edge vs Stripe).

---

## A) Plan definition table (matriz)

| Capacidad / Recurso | Free | Pro | Business |
|--------------------|------|-----|----------|
| **Sucursales incluidas (base)** | 1 | 1 | 3 |
| **Add-ons de sucursales** | No permitido | No permitido | Permitido (0–50) |
| **Límite total sucursales** | 1 | 1 | 3 + addons |
| **Límite vinos (UI/app)** | 5 | 100 | Ilimitado (-1) |
| **Límite vinos (DB trigger)** | 25* | 200* (si plan=pro) / 25 (si plan=basic)* | -1* (si plan=business) / 25 (si plan=additional-branch)* |
| **Límite usuarios total (owner + staff)** | 2 (owner + 1) | Ilimitado (no aplica trigger) | Ilimitado |
| **Límite gerentes** | 1 | Ilimitado | Ilimitado |
| **Generación QR (guest/admin)** | Permitido si `isSensitiveAllowed` (email verificado en owners password) | Igual | Igual |
| **Checkout / suscripción Stripe** | No (plan gratis) | Permitido (`pro_monthly`) | Permitido (`business_monthly` → `business_monthly_mxn`) |
| **Add-on branches (update-subscription)** | No permitido | No permitido | Permitido |
| **Inventario / análisis** | Bloqueado (blockedFeatureIds) | Permitido | Permitido |
| **Catas / degustaciones** | Bloqueado | Permitido | Permitido |
| **Sucursales adicionales (feature)** | Bloqueado | Bloqueado | Permitido |
| **Reportes básicos** | — | Permitido | Permitido |
| **Reportes completos** | — | — | — |
| **Exportaciones** | — | — | — |
| **Exámenes de cata** | No gating por plan en código buscado | No gating por plan | No gating por plan |
| **Branding "Powered by Cellarium"** | Feature ID existe; no gating por plan en lógica revisada | — | — |

\* Ver sección D (inconsistencias): la DB usa `get_wine_limit_for_owner` y `reconcile_branch_locks` con strings `pro`/`business` en parte del código; el resto del sistema usa `basic`/`additional-branch`.

### Referencias por celda

- **Sucursales base:** App `src/utils/branchLimit.ts` L33–34 (`additional-branch` → 3, sino 1). DB `supabase/migrations/20260227120000_get_branch_limit_at_least_one.sql` L22–27 (`additional-branch`/`business` → 3+addons, else 1).
- **Add-ons:** Edge `supabase/functions/update-subscription/index.ts` L96 (`subscription_plan !== 'additional-branch'` → 403). UI solo muestra add-ons en Business: `src/screens/SubscriptionsScreen.tsx` L1010–1011, L1298–1332.
- **Límite vinos (app):** `src/utils/subscriptionPermissions.ts` L14–36 (`PLAN_LIMITS`: free 5, basic 100, additional-branch -1). `src/screens/SubscriptionsScreen.tsx` L745, L767, L786 (limitations.wines).
- **Límite vinos (DB):** `supabase/migrations/20260207213838_remote_schema.sql` L1906–1921 (`get_wine_limit_for_owner`: free→25, pro→200, business→-1, else 25). No hay migración que use `basic`/`additional-branch` en esa función.
- **Límite usuarios/gerentes Free:** `supabase/migrations/20260207213838_remote_schema.sql` L1446–1512 (`enforce_free_user_limits_on_update`: plan <> 'free' skip; total_users > 2 → exception; manager_count > 1 → exception).
- **QR / isSensitiveAllowed:** `src/utils/sensitiveActionGating.ts` L9–15 (owner + password → requiere `owner_email_verified`; Google/staff no). `src/screens/QrGenerationScreen.tsx` L125, L174.
- **Checkout:** `supabase/functions/create-checkout-session/index.ts` L24–26 (`pro_monthly`, `business_monthly` → `business_monthly_mxn`). Planes permitidos: solo esos dos (no free).
- **Inventario/catas/sucursales bloqueados Free:** `src/utils/subscriptionPermissions.ts` L19–23 (`blockedFeatureIds`: inventory, tastings, branches_additional para free).

---

## B) Source of truth map

Para cada capacidad, dónde se aplica el gate y si hay divergencias.

| Capacidad | App UI / cliente | DB (trigger/constraint/RLS) | Edge | Stripe (lookup_key → plan) |
|-----------|------------------|-----------------------------|------|----------------------------|
| **Sucursales (límite)** | `branchLimit.ts` (`getBranchLimit`), `BranchManagementScreen` (navegación a planes), `subscriptionPermissions` PLAN_LIMITS | `enforce_branch_limit` → `get_branch_limit_for_owner` (migración 20260227: basic/additional-branch). `reconcile_branch_locks` (remote_schema usa solo `business` → inconsistente) | — | — |
| **Add-ons sucursales** | `SubscriptionsScreen` (solo si Business), `update-subscription` invoke | `users.subscription_branch_addons_count`; `reconcile_branch_locks` lee subscriptions.metadata + users | `update-subscription`: exige `subscription_plan === 'additional-branch'` | Add-on: `branch_addon_monthly` (no define plan; solo Business puede llamar update-subscription) |
| **Vinos (límite)** | `subscriptionPermissions` PLAN_LIMITS (5/100/-1), `WineService` + `SubscriptionEnforcement` | `enforce_wine_limit` → `get_wine_limit_for_owner` (remote_schema: 25/200/-1 con pro/business; no basic/additional-branch) | — | — |
| **Usuarios/gerentes Free** | No hay UI que impida invitar; el backend rechaza | `enforce_free_user_limits_on_update` (solo plan 'free') | — | — |
| **QR / acciones sensibles** | `QrGenerationScreen`, `SubscriptionsScreen` (verificación antes de suscribir) | No (gating por email verificado en app/Edge) | `update-subscription` exige email verificado para owners password | — |
| **Plan efectivo (qué plan tiene)** | `effectivePlan.ts` (`getEffectivePlan`, isBusiness, isPro, isFree); `subscription_plan` + `subscription_active` + `subscription_expires_at` | `get_plan_id_effective(p_owner)` (users.subscription_plan + is_subscription_effectively_active) | stripe-webhook escribe `subscription_plan` (normalizePlanId) | lookup_key → plan_id en stripe-webhook `mapPlanFromLookupKey` |
| **Checkout (qué planes se pueden comprar)** | `SubscriptionsScreen`: pro_monthly, business_monthly | — | `create-checkout-session`: PLAN_LOOKUP_KEY_MAP (pro_monthly, business_monthly → business_monthly_mxn) | Prices con lookup_keys en Stripe |

**Divergencias detectadas:** ver sección D.

---

## C) Plan IDs y strings

| String | Dónde aparece | Uso / canónico |
|--------|----------------|-----------------|
| **free** | DB: `users.subscription_plan`, `subscriptions.plan_id` CHECK; Edge stripe-webhook ALLOWED_PLAN_IDS, normalizePlanId; App: effectivePlan, planLabels, subscriptionPermissions | Canónico para “sin suscripción activa” o plan gratis. |
| **basic** | DB: CHECK (plan_id / subscription_plan); Edge: stripe-webhook (Pro → basic); App: effectivePlan, planLabels (basic → “Pro”), subscriptionPermissions | Canónico para plan “Pro” en DB. |
| **additional-branch** | DB: CHECK; Edge: stripe-webhook (Business → additional-branch), update-subscription (solo este plan puede add-ons); App: effectivePlan, branchLimit, planLabels (“Business”) | Canónico para plan “Business” en DB. |
| **pro** | App: SubscriptionsScreen (id de plan en UI: 'pro', 'business', 'free'); Edge: normalizePlanId (pro → basic); DB: get_wine_limit_for_owner y reconcile_branch_locks en **remote_schema** (no en migraciones recientes) | Solo UI y normalización. En DB no es válido por CHECK; migraciones usan basic. |
| **business** | App: id de plan en UI; Edge: normalizePlanId (business → additional-branch); DB: **solo en remote_schema** (get_wine_limit_for_owner, reconcile_branch_locks) | Solo UI y normalización. En DB no es válido por CHECK; migraciones usan additional-branch. |

**CHECK en DB (fuente única de valores permitidos):**  
`subscriptions.plan_id` y `users.subscription_plan` ∈ `{'free', 'basic', 'additional-branch'}`.

- `supabase/migrations/20260207213838_remote_schema.sql` L913, L1045.

**Lookup keys Stripe → plan_id (Edge):**

- `stripe-webhook/index.ts` L216–221: `business_*` → additional-branch, Business; `pro_*` → basic, Pro; `basic_*` → basic, Basic; por defecto → free, Free.
- `create-checkout-session/index.ts` L24–26: interno `pro_monthly`, `business_monthly` → Stripe `pro_monthly`, `business_monthly_mxn`.
- Add-on: `branch_addon_monthly` (get-addon-price, update-subscription); no asigna plan, solo precio.

---

## D) Inconsistencias detectadas

### 1) `get_wine_limit_for_owner` (DB) usa 'pro' y 'business'

- **Dónde:** `supabase/migrations/20260207213838_remote_schema.sql` L1906–1921.
- **Qué hace:** `plan = 'free' → 25`; `plan = 'pro' → 200`; `plan = 'business' → -1`; `else → 25`.
- **Problema:** En la app y en el CHECK de la DB los valores son `basic` y `additional-branch`. Nunca se guarda `pro` ni `business`. Por tanto: usuarios Pro (basic) y Business (additional-branch) caen en `else` y reciben **25** vinos; Free recibe 25. La app en cambio muestra 5 (Free), 100 (Pro), ilimitado (Business) y `subscriptionPermissions` hace el gating con esos números.
- **Corrección mínima:** Añadir una migración que reemplace `get_wine_limit_for_owner` para usar los mismos criterios que `get_branch_limit_for_owner`: e.g. `basic` → 100 (o 200 si se quiere alinear con “pro”), `additional-branch` → -1, y free → 25 (o 5 si se alinea con la UI). Así el trigger `enforce_wine_limit` y la app coincidirían.

### 2) `reconcile_branch_locks` en remote_schema solo comprueba `v_plan_id = 'business'`

- **Dónde:** `supabase/migrations/20260207213838_remote_schema.sql` L2287–2291.
- **Qué hace:** `IF v_plan_id = 'business' THEN v_allowed_count := 3 + v_addon_qty`; si no, 1.
- **Problema:** En la DB el plan Business se guarda como `additional-branch`. Quien tenga `additional-branch` nunca entra en ese IF y se trata como 1 sucursal, pudiendo bloquear branches de más.
- **Corrección mínima:** En la migración que define/actualiza `reconcile_branch_locks`, usar `IF v_plan_id IN ('additional-branch', 'business')` (como en `20250122130100_reconcile_branch_locks_business_base.sql` y en `get_branch_limit_for_owner`). Si el archivo aplicado en producción es el de la migración 20250122130100, el comportamiento real puede ser correcto; confirmar qué versión está realmente desplegada.

### 3) Límite de vinos Free: 5 (app) vs 25 (DB)

- **App:** `src/utils/subscriptionPermissions.ts` free.maxWines = 5; SubscriptionsScreen muestra “5” para Free.
- **DB:** `get_wine_limit_for_owner` para free devuelve 25.
- **Problema:** El trigger de la DB permite hasta 25 vinos en Free; la app bloquea a 5. Comportamiento inconsistente si se inserta por otro canal (API/backend).
- **Corrección mínima:** Unificar: o bien migración que ponga free = 5 en `get_wine_limit_for_owner`, o bien cambiar la app a 25 y textos de la UI (según decisión de producto).

### 4) Pro (basic): 100 vinos en app vs 25 en DB

- Misma función `get_wine_limit_for_owner`: con `basic` cae en `else` y devuelve 25. App y PLAN_LIMITS dicen 100.
- **Corrección mínima:** Incluir en la migración de `get_wine_limit_for_owner` el caso `basic` con 100 (o el valor que se defina para Pro).

### 5) Nombres de plan en UI vs DB

- UI usa ids `'free' | 'pro' | 'business'` en SubscriptionsScreen (mainPlans, selectedPlan, currentPlanId).
- Al guardar o simular se mapea a DB: `pro` → `basic`, `business` → `additional-branch` (L1111–1116). No hay inconsistencia de guardado; la divergencia es solo de nombres para mostrar (Pro/Business) frente a valores internos (basic/additional-branch) y está documentada en planLabels y effectivePlan.

---

## Rutas exactas de archivos referidos

| Ámbito | Archivo |
|--------|---------|
| App – plan efectivo | `src/utils/effectivePlan.ts` |
| App – límite branches | `src/utils/branchLimit.ts` |
| App – límites y features | `src/utils/subscriptionPermissions.ts` |
| App – labels plan | `src/utils/planLabels.ts` |
| App – gating sensible (QR, etc.) | `src/utils/sensitiveActionGating.ts` |
| App – enforcement | `src/services/SubscriptionEnforcement.ts` |
| App – pantalla suscripciones | `src/screens/SubscriptionsScreen.tsx` |
| App – pantalla QR | `src/screens/QrGenerationScreen.tsx` |
| App – pantalla branches | `src/screens/BranchManagementScreen.tsx` |
| App – features IDs | `src/constants/subscriptionFeatures.ts` |
| App – tipos | `src/types/index.ts` |
| DB – get_branch_limit | `supabase/migrations/20260227120000_get_branch_limit_at_least_one.sql` |
| DB – get_wine_limit (legacy) | `supabase/migrations/20260207213838_remote_schema.sql` (L1906–1921) |
| DB – get_plan_id_effective | `supabase/migrations/20260207213838_remote_schema.sql` (L1811–1833) |
| DB – enforce_branch_limit | `supabase/migrations/20260207213838_remote_schema.sql` (L1414–1445) |
| DB – enforce_free_user_limits | `supabase/migrations/20260207213838_remote_schema.sql` (L1446–1512) |
| DB – reconcile_branch_locks | `supabase/migrations/20260207213838_remote_schema.sql` (L2247–2372); también `20250122120000_fix_reconcile_branch_locks.sql`, `20250122130100_reconcile_branch_locks_business_base.sql` |
| DB – CHECK plan_id | `supabase/migrations/20260207213838_remote_schema.sql` L913, L1045 |
| Edge – checkout | `supabase/functions/create-checkout-session/index.ts` |
| Edge – webhook Stripe | `supabase/functions/stripe-webhook/index.ts` |
| Edge – add-ons | `supabase/functions/update-subscription/index.ts` |
| Edge – precio add-on | `supabase/functions/get-addon-price/index.ts` |

---

*Documento generado a partir únicamente del código del repositorio; no se ha modificado ningún archivo.*
