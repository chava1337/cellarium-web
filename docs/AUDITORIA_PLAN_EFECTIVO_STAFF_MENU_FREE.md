# Auditoría y fix: plan efectivo para staff (menú FREE)

**Problema:** Un gerente en una organización con plan FREE ve todos los menús/módulos como si tuviera acceso premium.  
**Regla correcta:** Las restricciones de suscripción para staff deben heredarse del **owner** (plan efectivo = owner cuando `role !== 'owner'`).

---

## 1. Dónde se calcula el plan efectivo

| Lugar | Archivo | Función / uso |
|-------|---------|----------------|
| Plan efectivo (sync, por fila) | `src/utils/effectivePlan.ts` | `getEffectivePlan(user)`: usa `user.subscription_plan`, `subscription_active`, `subscription_expires_at`. Solo tiene sentido para el **owner** (su fila tiene esos campos). |
| Plan efectivo del owner (async, para staff) | `src/utils/effectivePlan.ts` | `getOwnerEffectivePlan(user)`: si `user.owner_id`, llama RPC `get_plan_id_effective(p_owner)` o SELECT del owner en `users` y aplica `getEffectivePlan(ownerRow)`. Ya existía pero **no se usaba para el menú**. |
| Hydrate perfil | `src/contexts/AuthContext.tsx` | `hydrateProfile(authUser)`: SELECT `users` por `id = uid`; guarda en estado `subscription_plan`, `subscription_active`, `subscription_expires_at` de **esa fila**. Para un gerente, esa fila es la del gerente (suele tener subscription_* null). |
| Load user data | `src/contexts/AuthContext.tsx` | `loadUserData` / `loadUserDataImpl`: llama a `hydrateProfile(authUser)`. No calcula plan del owner para staff. |
| Gating por feature | `src/utils/subscriptionPermissions.ts` | `checkSubscriptionFeature(user, featureId)`: si `user.role !== 'owner'` **retorna true** (línea 43: "Solo owners tienen límites"). Por eso el staff nunca ve features bloqueados. |
| Límites numéricos | `src/utils/subscriptionPermissions.ts` | `checkSubscriptionLimit(user, limitType, currentCount)`: igual, si `user.role !== 'owner'` retorna true. |
| Construcción del menú | `src/screens/AdminDashboardScreen.tsx` | `useMemo` de `filteredMenuItems` (por rol con `canAccessFullAdminScreens`) y `useMemo` de `blockedFeatureIds` (llamaba a `checkSubscriptionFeature(user, featureId)`). |
| Helper “acceso completo” | `src/utils/rolePermissions.ts` | `canAccessFullAdminScreens(role)`: true para `owner`, `gerente`, `sommelier`, `supervisor`. No considera plan; solo rol. |

---

## 2. Uso incorrecto para staff

- **`checkSubscriptionFeature(user, featureId)`** en `src/utils/subscriptionPermissions.ts` (líneas 42-54):  
  `if (!user || user.role !== 'owner') return true;`  
  Para cualquier **no-owner** (gerente, supervisor, etc.) devuelve **siempre true**, por lo que **nunca** se marca ningún ítem del menú como bloqueado por plan.
- El menú se filtra primero por **rol** (`canAccessFullAdminScreens` → gerente tiene “full menu access”). Luego, para cada ítem visible, se llama `checkSubscriptionFeature(user, featureId)`; para gerente esa llamada retorna true, así que **no** se agrega ningún `item.id` a `blockedFeatureIds`. Resultado: gerente en plan FREE ve Inventario, Catas y Sucursales adicionales como si estuvieran permitidos.
- No se usa `user.id` vs `user.owner_id` para elegir la fila de suscripción en el menú: directamente se **excluye** a los no-owners del gating con `return true`. Tampoco se usa en ningún sitio el plan del owner para staff en esta pantalla.

---

## 3. Punto exacto donde se arma el menú

- **Archivo:** `src/screens/AdminDashboardScreen.tsx`
- **Funciones / bloques:**
  - **`menuItems`** (useMemo, ~líneas 156-232): lista fija de ítems con `id`, `title`, `onPress`, `requiresOwner`, `requiresManager`.
  - **`filteredMenuItems`** (useMemo, ~235-264): filtra por `canAccessFullAdminScreens(currentUserRole)` y por `requiresOwner` / `requiresManager`. Condiciones:
    - Si `!hasFullMenuAccess` → solo `tasting-exams` y `settings`.
    - Si no: se quitan ítems con `requiresOwner && !isOwner` o `requiresManager && !isManager`.
  - **`blockedFeatureIds`** (useMemo, ~267-279): para cada ítem en `filteredMenuItems`, obtiene `featureId` con `mapMenuItemIdToFeatureId(item.id)`; si hay `featureId`, llamaba a `checkSubscriptionFeature(user, featureId)` y, si bloqueado, añade `item.id` al set.

- **Condiciones por módulo (visibilidad y gating):**
  - **branches:** `requiresOwner: true` → solo owner lo ve; si se viera, gating por `branches_additional`.
  - **subscriptions:** `requiresOwner: true` → solo owner.
  - **inventory:** visible para gerente/owner/etc.; gating por feature `inventory` (plan FREE lo bloquea).
  - **tasting-exams:** visible; gating por feature `tastings` (FREE lo bloquea).
  - **users:** `requiresManager: true`; sin featureId en el mapa → no se bloqueaba por plan.
  - **global-catalog, cocktail-menu, wines, qr, settings:** sin featureId en `adminMenuFeatureMap` → no bloqueados por plan.

El único lugar que aplicaba (o debía aplicar) el plan al menú era **`blockedFeatureIds`** usando `checkSubscriptionFeature(user, …)`, que para staff siempre devolvía “no bloqueado”.

---

## 4. Cambio mínimo seguro aplicado

- **Objetivo:** Que el plan efectivo para gating del menú sea el del **owner** cuando el usuario es staff, sin refactor grande ni tocar SQL.
- **Enfoque:**
  1. Añadir una función que evalúe el gating **solo por plan** (sin rol): `checkSubscriptionFeatureByPlan(plan, featureId)` en `subscriptionPermissions.ts`.
  2. En **AdminDashboardScreen**: para staff, obtener el plan del owner con `getOwnerEffectivePlan(user)` (async) y guardarlo en estado; al calcular `blockedFeatureIds`, usar para **owner** `getEffectivePlan(user)` y para **staff** ese plan del owner (o `'free'` mientras carga).

---

## 5. Causa raíz más probable

**En `checkSubscriptionFeature(user, featureId)` se hace `if (user.role !== 'owner') return true`.** Así, todo el staff (gerente, sommelier, supervisor, etc.) queda exento del gating por suscripción y el menú nunca marca como bloqueados Inventario, Catas ni Sucursales adicionales, aunque la organización esté en plan FREE.

---

## 6. Archivos exactos involucrados

| Archivo | Cambio |
|---------|--------|
| `src/utils/subscriptionPermissions.ts` | Añadida `checkSubscriptionFeatureByPlan(plan, featureId)`. Comentario en `checkSubscriptionFeature` aclarando que el staff usa el plan del owner vía esta nueva función en la UI. |
| `src/screens/AdminDashboardScreen.tsx` | Import de `getEffectivePlan`, `getOwnerEffectivePlan`, `EffectivePlanId` y `checkSubscriptionFeatureByPlan`. Estado `ownerPlanForGating`. `useEffect` que, para staff con `owner_id`, llama a `getOwnerEffectivePlan(user)` y guarda el resultado. Cálculo de `blockedFeatureIds` usando plan efectivo: owner = `getEffectivePlan(user)`, staff = `ownerPlanForGating ?? 'free'`, y `checkSubscriptionFeatureByPlan(effectivePlan, featureId)`. |

---

## 7. Funciones exactas tocadas

- **`src/utils/subscriptionPermissions.ts`:** Nueva función `checkSubscriptionFeatureByPlan(plan, featureId)`. `checkSubscriptionFeature` solo comentario.
- **`src/screens/AdminDashboardScreen.tsx`:** Nuevo estado `ownerPlanForGating`, nuevo `useEffect` para cargar plan del owner cuando es staff, y `useMemo` de `blockedFeatureIds` reescrito para usar `effectivePlan` + `checkSubscriptionFeatureByPlan`.

---

## 8. Diff / código exacto propuesto (resumen)

**subscriptionPermissions.ts**

- Después de `checkSubscriptionFeature`, añadir:

```ts
/**
 * Comprueba si un plan permite un feature (para gating por plan sin depender del rol).
 * Usar cuando el plan efectivo ya fue resuelto (p. ej. plan del owner para staff).
 */
export function checkSubscriptionFeatureByPlan(
  plan: SubscriptionPlan,
  featureId: FeatureId | string
): boolean {
  const limits = PLAN_LIMITS[plan];
  return !limits.blockedFeatureIds.includes(featureId as FeatureId);
}
```

**AdminDashboardScreen.tsx**

- Import: `useEffect`, `checkSubscriptionFeatureByPlan`, `getEffectivePlan`, `getOwnerEffectivePlan`, `EffectivePlanId`.
- Estado: `const [ownerPlanForGating, setOwnerPlanForGating] = useState<EffectivePlanId | null>(null);`
- `useEffect`: si `user?.role === 'owner'` → `setOwnerPlanForGating(null)`; si `user?.owner_id` → `getOwnerEffectivePlan(user).then(setOwnerPlanForGating)`; si no → `setOwnerPlanForGating('free')`.
- `blockedFeatureIds`: `effectivePlan = isOwner ? getEffectivePlan(user) : (ownerPlanForGating ?? 'free')`; para cada ítem con `featureId`, `blocked = !checkSubscriptionFeatureByPlan(effectivePlan, featureId)`.

(El diff completo ya está aplicado en los archivos.)

---

## 9. Riesgos del cambio

| Riesgo | Mitigación |
|--------|------------|
| **Plan del owner no cargado aún (ownerPlanForGating null)** | Se trata como `'free'`: más restrictivo; al cargar el plan real puede pasar a básico/additional-branch y desbloquear ítems. No se desbloquea de más mientras carga. |
| **getOwnerEffectivePlan falla (red, RLS)** | El `useEffect` no hace catch; el estado queda en null y se usa `'free'`. Comportamiento seguro. |
| **Owner sin owner_id (casos raros)** | Solo aplica a staff; owner sigue usando `getEffectivePlan(user)`. |
| **Otros usos de checkSubscriptionFeature** | No modificados: SubscriptionEnforcement y cualquier otro siguen con la lógica actual (solo owners limitados). Solo el menú del dashboard usa el plan del owner para staff. |
| **Multi-branch** | No se toca navegación ni branches; solo qué ítems se marcan como bloqueados en el menú. |
| **Lógica de roles** | `filteredMenuItems` y `requiresOwner`/`requiresManager` no se cambian; solo el gating por plan en `blockedFeatureIds`. |

---

## 10. Comprobación rápida

- **Owner en plan FREE:** `getEffectivePlan(user)` = `'free'` → inventory, tastings, branches_additional bloqueados. Sin cambio de comportamiento.
- **Gerente en org FREE:** `ownerPlanForGating` = `'free'` (vía `getOwnerEffectivePlan`) → mismos ítems bloqueados que para el owner.
- **Gerente en org Pro/Business:** `ownerPlanForGating` = `'basic'` o `'additional-branch'` → ningún feature bloqueado por plan en el menú.
