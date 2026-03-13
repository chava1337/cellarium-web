# Defensa en profundidad: módulos premium por suscripción

**Objetivo:** Verificación al montar en pantallas premium para que, si el plan no permite el módulo, el usuario sea redirigido y no vea contenido sensible (deep link, restauración de estado, etc.).

---

## 1. Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/screens/InventoryAnalyticsScreen.tsx` | Guard de suscripción para feature `inventory` |
| `src/screens/TastingExamsListScreen.tsx` | Guard de suscripción para feature `tastings` |
| `src/screens/BranchManagementScreen.tsx` | Guard de suscripción para feature `branches_additional` |

---

## 2. Función / punto donde está el guard

En las tres pantallas el guard se implementa igual:

- **Estado:** `subscriptionAllowed: 'pending' | true | false` (useState).
- **Efecto:** un `useEffect` que:
  - Solo corre cuando tiene sentido (en Inventario y Branches: cuando `guardStatus === 'allowed'` y hay `user`; en Catas: cuando hay `user`).
  - Resuelve el plan efectivo: **owner** → `getEffectivePlan(user)`; **staff** → `getOwnerEffectivePlan(user)` (async).
  - Usa `checkSubscriptionFeatureByPlan(plan, featureId)`.
  - Si no permitido: `setSubscriptionAllowed(false)`, `navigation.replace('AdminDashboard')`, `Alert.alert(t('subscription.feature_blocked'), ...)`.
  - Si permitido: `setSubscriptionAllowed(true)`.
- **Render:**
  - Mientras `subscriptionAllowed === 'pending'`: se muestra solo un `ActivityIndicator` (sin contenido sensible).
  - Si `subscriptionAllowed === false`: `return null` (la navegación ya llevó al usuario al dashboard).
  - Si `subscriptionAllowed === true`: se renderiza la pantalla normal.

Los hooks (useState, useEffect) se llaman siempre al inicio del componente, antes de cualquier `return` condicional, para cumplir las reglas de hooks.

---

## 3. FeatureId por pantalla

| Pantalla | FeatureId | Constante en código |
|----------|-----------|----------------------|
| Inventario y Análisis | `inventory` | `FEATURE_ID_INVENTORY` |
| Catas y Degustaciones | `tastings` | `FEATURE_ID_TASTINGS` |
| Gestión de sucursales | `branches_additional` | `FEATURE_ID_BRANCHES_ADDITIONAL` |

---

## 4. Helpers reutilizados

- `getEffectivePlan(user)` — `src/utils/effectivePlan.ts`
- `getOwnerEffectivePlan(user)` — `src/utils/effectivePlan.ts` (plan del owner para staff)
- `checkSubscriptionFeatureByPlan(plan, featureId)` — `src/utils/subscriptionPermissions.ts`
- `t('subscription.feature_blocked')` — `LanguageContext` (mensaje de la alerta)

Sin nueva lógica de permisos ni backend.

---

## 5. Comportamiento final esperado

- **Owner con plan Free** que llegue por deep link / restauración a Inventario, Catas o Branches:
  - Se resuelve el plan → free → el feature está bloqueado.
  - No se muestra el contenido; se muestra brevemente el spinner y luego se hace `replace('AdminDashboard')` y un `Alert` con “Esta función no está disponible en tu plan actual”.
- **Owner con plan Pro/Business** (o staff bajo ese owner):
  - Plan permite el feature → se muestra la pantalla con normalidad.
- **Staff** bajo owner Free:
  - Se usa el plan del owner vía `getOwnerEffectivePlan(user)` → mismo comportamiento que owner Free (redirección + alerta).
- **Sin flicker:** Mientras la comprobación es asíncrona (staff), solo se muestra el spinner; el contenido sensible no se pinta hasta que `subscriptionAllowed === true`.

---

## 6. Checklist de pruebas manuales

- [ ] **Inventario – Owner Free**  
  Cuenta owner con plan Free. Abrir la app, ir al dashboard, intentar abrir “Inventario y Análisis” (debería estar bloqueado en menú). Simular acceso directo a la ruta `InventoryManagement` (deep link o dev). Esperado: spinner breve, redirección a AdminDashboard y alerta de función no disponible.

- [ ] **Inventario – Owner Pro**  
  Owner con plan Pro. Ir a “Inventario y Análisis” desde el menú. Esperado: pantalla de inventario se muestra sin redirección.

- [ ] **Inventario – Staff (owner Free)**  
  Usuario staff de un owner Free. Intentar llegar a Inventario (si se puede por menú o simulación). Esperado: redirección a dashboard y alerta.

- [ ] **Inventario – Staff (owner Pro)**  
  Staff de owner Pro. Abrir Inventario desde el menú. Esperado: pantalla se muestra con normalidad.

- [ ] **Catas – Owner Free**  
  Owner Free. Intentar acceso a pantalla “Catas y Degustaciones” (menú bloqueado o simulación de ruta). Esperado: redirección a AdminDashboard y alerta.

- [ ] **Catas – Owner Pro**  
  Owner Pro. Abrir Catas desde el menú. Esperado: lista de exámenes se muestra bien.

- [ ] **Branches – Owner Free**  
  Owner Free. Intentar acceso a “Gestión de sucursales”. Esperado: redirección y alerta.

- [ ] **Branches – Owner Pro/Business**  
  Owner con plan que permite branches. Abrir gestión de sucursales. Esperado: pantalla normal.

- [ ] **Sin parpadeo**  
  En cada caso, comprobar que no se ve un flash del contenido premium antes del spinner o de la redirección.

- [ ] **Navegación normal**  
  Con plan que sí permite cada módulo, entrar por el menú del dashboard y usar la pantalla; no debe haber redirecciones ni alertas inesperadas.
