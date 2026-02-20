# Auditoría: UI arranca como Free con Business en BD

## Causa raíz

1. **Bootstrap sin campos de suscripción**  
   `hydrateProfile` en AuthContext usaba `USERS_BOOTSTRAP_SELECT` con solo `id, email, name, role, status, owner_id, branch_id, created_at, updated_at`. No se pedían `subscription_plan`, `subscription_active` ni `subscription_expires_at`, y en el `setUser` del hydrate no se mergeaban. Tras INITIAL_SESSION el `user` del contexto quedaba con esos campos en `undefined` hasta que algo llamara a `refreshUser()` (p. ej. al entrar en SubscriptionsScreen).

2. **Sin “plan efectivo” unificado**  
   Varios sitios usaban solo `user.subscription_plan` (o `user?.subscription_active === true`) sin considerar expiración ni un único criterio. No había un helper que aplicara “activo + no expirado + plan” en toda la app.

## Lugares que determinan el plan o hacen gating

| Archivo | Uso |
|---------|-----|
| `src/utils/subscriptionPermissions.ts` | `checkSubscriptionFeature`, `checkSubscriptionLimit` → plan para límites y features. |
| `src/services/SubscriptionEnforcement.ts` | `isActionAllowedForUser` → usa subscriptionPermissions. |
| `src/utils/branchLimit.ts` | `getBranchLimit`, `canCreateBranch` → included = Business ? 3 : 1. |
| `src/screens/SubscriptionsScreen.tsx` | `hasActiveSub`, `planMode`, `currentPlanId`, `isBusinessPlan()`, menús por plan. |
| `src/screens/AdminDashboardScreen.tsx` | `checkSubscriptionFeature(user, featureId)` para ítems del menú. |
| `src/screens/BranchManagementScreen.tsx` | `getBranchLimit` / `canCreateBranch` (branchLimit). |

## Memoización revisada

- **SubscriptionsScreen:** `currentPlanId` y `planMode` ya dependían de `user?.subscription_plan` y `hasActiveSub`; ahora dependen de `effectivePlan` (derivado de `user`), por lo que se recalculan cuando cambia `user` (incluido el merge del hydrate).
- No se encontró estado local tipo “planState” desincronizado; el plan se deriva del `user` del contexto.
- **AuthContext:** el merge en `hydrateProfile` ahora incluye `subscription_plan`, `subscription_active`, `subscription_expires_at`, así que la primera pintura ya tiene plan correcto sin depender de entrar en SubscriptionsScreen.

## Logs __DEV__ añadidos

- **AuthContext (hydrateProfile):** al terminar el hydrate con datos, log con `uid`, `subscription_plan`, `subscription_active`, `subscription_expires_at`, `effectivePlan` (calculado en el log).
- **SubscriptionsScreen:** cuando `effectivePlan === 'free'` pero en BD `subscription_plan` es `basic` o `additional-branch` (inactivo/expirado), log con `userId`, `subscription_plan`, `subscription_active`, `subscription_expires_at`.

## Fix aplicado (resumen)

1. **`src/utils/effectivePlan.ts`** (nuevo): `getEffectivePlan(user)`, `isBusiness(user)`, `isPro(user)`, `isFree(user)` aplicando activo + no expirado + `subscription_plan`.
2. **AuthContext:** `USERS_BOOTSTRAP_SELECT` ampliado con `subscription_plan`, `subscription_active`, `subscription_expires_at`; en el `setUser` del hydrate se hace merge de esos campos; log __DEV__ en hydrate.
3. **subscriptionPermissions.ts:** `checkSubscriptionFeature` y `checkSubscriptionLimit` usan `getEffectivePlan(user)` en lugar de `user.subscription_plan || 'free'`; `isSubscriptionActive` alineado con la misma lógica.
4. **branchLimit.ts:** `getBranchLimit` usa `getEffectivePlan(user)` para decidir si el plan es Business (3 sucursales) o no.
5. **SubscriptionsScreen:** `hasActiveSub`, `planMode`, `currentPlanId`, `isBusinessPlan()` derivados de `getEffectivePlan`/`isBusiness`; log __DEV__ cuando se muestra Free con plan en BD.

Con esto, al reiniciar la app el hydrate ya trae los campos de suscripción y el plan efectivo se calcula igual en toda la app, por lo que la UI muestra Business desde el arranque cuando en BD el usuario tiene Business activo y no expirado.
