# Auditoría de robustez: guards de suscripción en pantallas premium

**Alcance:** Defensa en profundidad en `InventoryAnalyticsScreen`, `TastingExamsListScreen`, `BranchManagementScreen`. Solo identificación de riesgos y micro-ajustes sugeridos; sin refactors ni cambios de backend.

---

## 1️⃣ Alert duplicado

**Comportamiento actual:** En el camino `!allowed` se hace `setSubscriptionAllowed(false)`, `navigation.replace('AdminDashboard')` y `Alert.alert(t('subscription.feature_blocked'), ...)` dentro del mismo `useEffect`.

**Riesgo:** Teórico.

- El efecto depende de `[user?.id, user?.role, guardStatus, navigation, t]`. Tras `setSubscriptionAllowed(false)` el componente hace `return null` y suele desmontarse al hacer `replace`, así que en uso normal el efecto no vuelve a ejecutarse para el mismo “acceso denegado”.
- **Posible doble ejecución:** En React Strict Mode (doble invocación de efectos en dev) o si `t` o `navigation` cambian referencia y el efecto se vuelve a ejecutar antes de que termine el replace, se podría llamar a `Alert.alert` dos veces.
- No hay ningún guard que impida mostrar el alert solo una vez por ciclo “denegado”.

**Conclusión:** Riesgo bajo en producción; posible en dev con Strict Mode.

**Cambio mínimo sugerido:** Usar un ref para no mostrar el alert más de una vez por montaje, solo cuando realmente se deniega:

- **Archivos:** Los tres: `InventoryAnalyticsScreen.tsx`, `TastingExamsListScreen.tsx`, `BranchManagementScreen.tsx`.
- **Lógica:** Añadir `const alertedBlockedRef = useRef(false)`. Al inicio del efecto, si vamos a denegar: si `!alertedBlockedRef.current`, hacer `alertedBlockedRef.current = true` y luego `Alert.alert(...)`. En el cleanup del efecto (`return () => { ... }`) no resetear el ref (queremos “una vez por montaje”). Opcional: resetear `alertedBlockedRef.current = false` en el cleanup para que un segundo montaje de la misma pantalla pueda volver a mostrar el alert si aplica.

---

## 2️⃣ Spinner infinito

**Comportamiento actual:** El efecto async resuelve el plan (owner: `getEffectivePlan` síncrono; staff: `await getOwnerEffectivePlan(user)`), luego `checkSubscriptionFeatureByPlan(plan, featureId)` (síncrono) y según resultado hace `setSubscriptionAllowed(true)` o `setSubscriptionAllowed(false)`.

**Riesgo:** Ninguno en la práctica.

- `getOwnerEffectivePlan` (en `src/utils/effectivePlan.ts`) siempre resuelve: hace `try/catch` y en cualquier fallo o dato faltante devuelve `'free'`. No hace `rethrow` ni deja la promesa colgada.
- Por tanto el `run()` del efecto siempre llega a una de las dos ramas (`setSubscriptionAllowed(true)` o `setSubscriptionAllowed(false)`), salvo que el componente se desmonte antes (y entonces `cancelled` evita el setState).
- No hay camino en el que `subscriptionAllowed` se quede en `'pending'` por un error async.

**Conclusión:** No hace falta fallback adicional para spinner infinito.

---

## 3️⃣ Navegación segura

**Comportamiento actual:** Cuando el feature no está permitido se llama `navigation.replace('AdminDashboard')`.

**Verificación:**

- `AdminDashboard` está declarado en el mismo `Stack.Navigator` en `AppNavigator.tsx` (líneas 60–63). Todas las pantallas premium (InventoryManagement, TastingExamsList, BranchManagement) están en ese mismo stack, por lo que `replace('AdminDashboard')` es una ruta válida.
- No hay navegación condicional que vuelva a la misma pantalla premium desde el guard; el usuario queda en AdminDashboard y la pantalla premium se desmonta. No se genera loop.
- No se ha visto uso de APIs deprecadas; `replace` es la API estándar de React Navigation para sustituir la pantalla actual.

**Conclusión:** Navegación segura; no se requieren cambios.

---

## 4️⃣ Costo de resolver plan del owner

**Comportamiento actual:** En staff, en cada montaje de cada pantalla premium se llama `getOwnerEffectivePlan(user)`.

- **Implementación:** `getOwnerEffectivePlan` intenta primero `supabase.rpc('get_plan_id_effective', { p_owner: ownerId })` y, si falla, hace `supabase.from('users').select(...).eq('id', ownerId).single()`. Es decir, una llamada de red por montaje (por pantalla) para staff.
- **Duplicación:** En `AdminDashboardScreen` ya se obtiene el plan del owner para gating (`ownerPlanForGating` vía `getOwnerEffectivePlan`) al cargar el dashboard. Si el usuario pasa del dashboard a Inventario/Catas/Branches, se vuelve a pedir el mismo plan en esa pantalla. No se reutiliza el valor ni se cachea.
- Se ejecuta en cada mount (cada vez que el usuario entra a esa pantalla), no solo en el primer mount de la sesión.

**Conclusión:** Relevante para rendimiento/red (doble resolución dashboard + pantalla premium; posible futura caché o pasar el plan por parámetro). Solo reporte; no se pide optimizar en esta tarea.

---

## 5️⃣ Flicker de contenido premium

**Comportamiento actual:**

- **InventoryAnalyticsScreen / BranchManagementScreen:** Se hace `return` (spinner o `null`) cuando `guardStatus === 'allowed' && subscriptionAllowed === 'pending'` o `subscriptionAllowed === false`. El contenido “premium” (listas, datos, formularios) solo se pinta cuando ya no se cumple ninguno de esos returns, es decir, cuando `guardStatus === 'allowed'` y `subscriptionAllowed === true`. Hasta entonces solo se muestra el spinner de suscripción o null.
- **TastingExamsListScreen:** No usa `guardStatus`; se hace return por `subscriptionAllowed === 'pending'` (spinner) o `=== false` (null). El contenido (lista de exámenes, etc.) solo se renderiza cuando `subscriptionAllowed === true`.

En los tres casos, `subscriptionAllowed` solo pasa a `true` después de que el efecto haya resuelto el plan y `checkSubscriptionFeatureByPlan` haya devuelto true. Por tanto, ningún contenido premium se muestra antes de que `subscriptionAllowed === true`.

**Conclusión:** No hay flicker de contenido premium; el flujo “spinner → validación → contenido” se cumple.

---

## Resumen

| Punto                 | ¿Problema?   | Riesgo        | Cambio sugerido                          |
|-----------------------|-------------|---------------|------------------------------------------|
| Alert duplicado       | Posible     | Solo teórico  | Ref `alertedBlockedRef` en los 3 archivos |
| Spinner infinito      | No          | N/A           | Ninguno                                   |
| Navegación segura     | No          | N/A           | Ninguno                                   |
| Costo plan owner      | Duplicación | Solo reporte  | Ninguno (auditoría)                       |
| Flicker contenido     | No          | N/A           | Ninguno                                   |

**Archivos donde aplicar el único ajuste opcional (ref para alert):**

- `src/screens/InventoryAnalyticsScreen.tsx`
- `src/screens/TastingExamsListScreen.tsx`
- `src/screens/BranchManagementScreen.tsx`

**Implementación sugerida del ref (ejemplo en una pantalla):**  
Añadir `const alertedBlockedRef = useRef(false);`. Dentro del efecto, en el bloque `if (!allowed)`, antes de `Alert.alert(...)`:

```ts
if (!alertedBlockedRef.current) {
  alertedBlockedRef.current = true;
  Alert.alert(t('subscription.feature_blocked'), undefined, [{ text: 'OK' }]);
}
```

Y mantener `setSubscriptionAllowed(false)` y `navigation.replace('AdminDashboard')` como están (no dependen del ref).
