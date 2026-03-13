# Auditoría: Pantalla de Suscripciones vs permisos reales de módulos premium

**Objetivo:** Validar que las promesas mostradas en la pantalla de Suscripciones coinciden con la lógica real de permisos por plan en el código.

**Alcance:** Solo diagnóstico. Sin cambios de código.

---

## 1. Dónde se definen permisos por plan

| Recurso | Archivo | Función / constante |
|--------|---------|----------------------|
| Límites por plan (blockedFeatureIds, maxManagers, etc.) | `src/utils/subscriptionPermissions.ts` | `PLAN_LIMITS` |
| Comprobar si un plan permite un feature | `src/utils/subscriptionPermissions.ts` | `checkSubscriptionFeature(user, featureId)`, `checkSubscriptionFeatureByPlan(plan, featureId)` |
| Comprobar límites numéricos (vinos, sucursales, gerentes) | `src/utils/subscriptionPermissions.ts` | `checkSubscriptionLimit(user, limitKey, currentCount)` |
| IDs de features (inventory, tastings, reports_*, etc.) | `src/constants/subscriptionFeatures.ts` | Tipo `FeatureId`, objeto por feature |
| Mapeo menú admin → featureId | `src/constants/adminMenuFeatureMap.ts` | `mapMenuItemIdToFeatureId(menuItemId)` |
| Plan efectivo del usuario | `src/utils/effectivePlan.ts` | `getEffectivePlan(user)`, `isBusiness(user)` |
| Acciones (create_wine, invite_manager, access_feature) | `src/services/SubscriptionEnforcement.ts` | `isActionAllowedForUser(user, action, context)`, `assertActionAllowed(...)` |
| Menú reducido (solo Catas + Config) | `src/screens/AdminDashboardScreen.tsx` | `canAccessFullAdminScreens(role)` → `hasFullMenuAccess`; `MENU_REDUCED_REASON` en logs __DEV__ |

**Definición clave en `subscriptionPermissions.ts`:**

- **Free:** `blockedFeatureIds: ['inventory', 'tastings', 'branches_additional']`, `maxManagers: 1`
- **basic (Pro):** `blockedFeatureIds: []`, `maxManagers: -1`
- **additional-branch (Business):** `blockedFeatureIds: []`, `maxManagers: -1`

Los FeatureIds `reports_basic` y `reports_full` existen en `subscriptionFeatures.ts` pero **no** están en `blockedFeatureIds` de ningún plan. El gating de “reportes” en la práctica es indirecto: vía acceso a Inventario (ver tabla más abajo).

---

## 2. Dónde se decide acceso a cada módulo

| Módulo | Archivo que decide acceso | Función / lógica |
|--------|----------------------------|-------------------|
| **Inventario y Análisis** | `src/screens/AdminDashboardScreen.tsx` | Menú: ítem `id: 'inventory'` → `adminMenuFeatureMap` → `featureId: 'inventory'`. `visibleMenuItems` filtra con `checkSubscriptionFeatureByPlan(effectivePlan, featureId)`. Si el plan es free, el ítem se marca bloqueado y no navega. Plan usado para staff: `ownerPlanForGating`. |
| **Catas y Degustaciones** | `src/screens/AdminDashboardScreen.tsx` | Ítem `id: 'tasting-exams'` → `featureId: 'tastings'`. Misma lógica que inventario; free → bloqueado. |
| **Reportes** | No hay ítem de menú propio. Los reportes están **dentro** de la pantalla Inventario (`InventoryAnalyticsScreen` / ruta `InventoryManagement`). | El acceso a reportes = acceso a Inventario. Free bloquea Inventario → Free no ve reportes. Pro/Business ven Inventario → ven reportes. No existe comprobación separada de `reports_basic` o `reports_full` en el código. |
| **Gestión de usuarios** | `src/screens/AdminDashboardScreen.tsx` | Ítem `id: 'users'` → `mapMenuItemIdToFeatureId('users')` = `null`. No hay gating por plan; solo por rol: `requiresOwner: false`, `requiresManager: true`. El límite de 1 gerente en Free se aplica en backend (trigger), no ocultando la pantalla. |
| **Branches (sucursales)** | `src/screens/AdminDashboardScreen.tsx` | Ítem `id: 'branches'` → `featureId: 'branches_additional'`. Free → bloqueado. Además `SubscriptionEnforcement`: `create_branch` usa `checkSubscriptionLimit(user, 'branches', currentBranchCount)`. |
| **Pantalla Subscriptions** | `src/screens/AdminDashboardScreen.tsx` | Ítem `id: 'subscriptions'` → featureId `null`, `requiresOwner: true`. Solo owner ve el ítem; no hay gating por plan. |

**Navegación directa:** Las pantallas `InventoryAnalyticsScreen`, `TastingExamsListScreen` y `BranchManagementScreen` **no** vuelven a comprobar suscripción al montar. El control es solo en el dashboard (ocultar/deshabilitar ítems). Si el usuario llega por deep link o restauración de estado, teóricamente podría entrar; es un matiz de defensa en profundidad, no una incoherencia con la pantalla de Suscripciones.

---

## 3. Comportamiento por plan (resumen)

| Plan | Inventario y Análisis | Catas y Degustaciones | Reportes (dentro de Inventario) | Gestión de usuarios | Branches (adicionales) | Gerentes |
|------|------------------------|------------------------|----------------------------------|----------------------|-------------------------|----------|
| **Free** | Bloqueado (ítem bloqueado en menú) | Bloqueado | No accede (no puede abrir Inventario) | Permitido (límite 1 gerente en backend) | Bloqueado (solo 1 sucursal) | Máx 1 (trigger en backend) |
| **Pro (basic)** | Permitido | Permitido | Permitido | Permitido | Permitido 1 sucursal; más con add-on no implementado en esta auditoría | Ilimitado |
| **Business (additional-branch)** | Permitido | Permitido | Permitido | Permitido | 3 base + add-ons | Ilimitado |

**Staff:** En el dashboard se usa `ownerPlanForGating` (plan efectivo del owner) para calcular `blockedFeatureIds` y `visibleMenuItems`. Por tanto el staff hereda correctamente el plan del owner para el gating de inventario, catas y branches.

---

## 4. “Gerentes ilimitados” en planes de pago

- **Backend:** En `supabase/migrations/20260207213838_remote_schema.sql` (o equivalente), la función `enforce_free_user_limits_on_update` solo aplica el límite de gerentes cuando el plan efectivo del owner es `'free'` (`get_plan_id_effective(owner) = 'free'`). Para planes pagados (basic / additional-branch) no se aplica ese límite → gerentes ilimitados en backend.
- **Frontend:** `subscriptionPermissions.ts`: `maxManagers` es `1` para free y `-1` (ilimitado) para basic y additional-branch. `SubscriptionEnforcement.isActionAllowedForUser(..., 'invite_manager', { currentManagerCount })` usa `checkSubscriptionLimit(user, 'managers', currentManagerCount)`, que para paid no bloquea. No hay otro límite de gerentes para planes pagados en el frontend.

**Conclusión:** “Gerentes ilimitados” para Pro/Business es correcto en backend y en lógica de permisos del frontend.

---

## 5. Tabla módulo × plan (permiso real en código)

| Módulo | Free | Pro (basic) | Business (additional-branch) |
|--------|------|-------------|------------------------------|
| Inventario y Análisis | Bloqueado | Permitido | Permitido |
| Catas y Degustaciones | Bloqueado | Permitido | Permitido |
| Reportes (vía Inventario) | Bloqueado (sin acceso a Inventario) | Permitido | Permitido |
| Gestión de usuarios | Permitido (límite 1 gerente en DB) | Permitido | Permitido |
| Branches (gestión adicional) | Bloqueado | Permitido (1; más con add-on) | Permitido (3 + add-ons) |
| Suscripciones (pantalla) | Solo owner, sin gating por plan | Idem | Idem |
| Gerentes | Máx 1 | Ilimitado | Ilimitado |

---

## 6. Promesas de la pantalla de Suscripciones vs lógica real

Las cadenas mostradas en la pantalla vienen de `LanguageContext` (keys `subscription.plan.*.features.*` y `subscription.plan.free.blocked.*`). Comparación:

| Promesa en UI | ¿Coincide con código? |
|---------------|------------------------|
| Free: “Inventario y Análisis” en bloqueados | Sí. `blockedFeatureIds` incluye `'inventory'`. |
| Free: “Catas y Degustaciones” en bloqueados | Sí. `blockedFeatureIds` incluye `'tastings'`. |
| Free: “Gestión de Sucursales adicionales” en bloqueados | Sí. `blockedFeatureIds` incluye `'branches_additional'`. |
| Pro: “Gerentes ilimitados” | Sí. Backend y frontend sin límite para basic. |
| Pro: “Acceso completo a todas las funciones” | Sí. Ningún feature bloqueado para basic. |
| Pro: “Inventario y Análisis” / “Catas y Degustaciones” / “Reportes completos” | Sí. Inventario (y con él reportes) y catas permitidos; reportes no tienen gating aparte. |
| Business: mismas promesas + sucursales | Sí. Coherente con `blockedFeatureIds` vacío y límites de branches. |

**Inconsistencia potencial (solo de modelo de datos, no de comportamiento):**  
En la UI se anuncia “Reportes completos” para Pro/Business. En código no existe un gating explícito por `reports_full` o `reports_basic`; el acceso a reportes es el mismo que a Inventario. Si en el futuro se añadiera un ítem de menú “Reportes” separado o planes con reportes básicos vs completos, habría que usar `reports_basic`/`reports_full` en `PLAN_LIMITS` y en el mapa de menú.

---

## 7. Archivos y funciones involucradas (lista)

- `src/utils/subscriptionPermissions.ts`: `PLAN_LIMITS`, `checkSubscriptionFeature`, `checkSubscriptionFeatureByPlan`, `checkSubscriptionLimit`
- `src/constants/subscriptionFeatures.ts`: `FeatureId`, definición de features (inventory, tastings, reports_basic, reports_full, branches_additional, etc.)
- `src/constants/adminMenuFeatureMap.ts`: `mapMenuItemIdToFeatureId`
- `src/utils/effectivePlan.ts`: `getEffectivePlan`, `isBusiness`
- `src/services/SubscriptionEnforcement.ts`: `isActionAllowedForUser`, `assertActionAllowed`
- `src/screens/AdminDashboardScreen.tsx`: `ownerPlanForGating`, `visibleMenuItems`, `menuItems` + filtrado por rol y por `checkSubscriptionFeatureByPlan`
- `src/screens/SubscriptionsScreen.tsx`: `mainPlans`, textos desde `t('subscription.plan.*')`
- `src/contexts/LanguageContext.tsx`: keys `subscription.plan.free|pro|business.features.*` y `subscription.plan.free.blocked.*`
- Backend: trigger `trg_enforce_free_user_limits_on_update` / función `enforce_free_user_limits_on_update` (límite 1 gerente solo en plan free)

---

## 8. Recomendaciones mínimas

1. **Defensa en profundidad (opcional):** En `InventoryAnalyticsScreen`, `TastingExamsListScreen` y `BranchManagementScreen`, considerar una comprobación al montar (p. ej. `checkSubscriptionFeatureByPlan(getEffectivePlan(user), featureId)`) y redirigir o mostrar mensaje si el plan no permite el feature. Así se cubre deep link y restauración de estado.
2. **Reportes:** Si más adelante se diferencia “reportes básicos” vs “completos” por plan, usar `reports_basic`/`reports_full` en `PLAN_LIMITS.blockedFeatureIds` y en el mapa de menú para un ítem “Reportes” si existe.
3. **Documentar:** Dejar claro en código o docs que “Reportes completos” en la pantalla de Suscripciones se cumple vía acceso a Inventario (mismo featureId `inventory`), sin uso actual de `reports_full`.

Con esto, la pantalla de Suscripciones queda alineada con los permisos reales de módulos premium y con el comportamiento de gerentes ilimitados en planes de pago.
