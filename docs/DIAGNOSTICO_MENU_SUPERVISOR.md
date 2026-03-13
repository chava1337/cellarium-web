# Diagnóstico: menú reducido para rol supervisor

## Objetivo
Identificar por qué un usuario con rol `supervisor` sigue viendo solo **Catas y degustación** y **Configuración** en el dashboard.

---

## 1. Valor real en BD del usuario supervisor

Ejecuta en Supabase (SQL Editor) o en tu cliente PostgreSQL:

```sql
-- Sustituye 'EMAIL_DEL_SUPERVISOR@ejemplo.com' por el email del usuario de prueba
SELECT
  id,
  email,
  name,
  role,
  status,
  owner_id,
  branch_id,
  created_at,
  length(role) AS role_length,
  role = 'supervisor' AS role_equals_supervisor,
  (role IS NULL OR trim(role) = '') AS role_empty_or_null
FROM public.users
WHERE email = 'EMAIL_DEL_SUPERVISOR@ejemplo.com'
   OR role = 'supervisor'
ORDER BY email;
```

Comprueba:
- Que existe **una sola fila** para ese usuario.
- Que `role` es exactamente `'supervisor'` (minúsculas, sin espacios).
- Que `role` no es `NULL` ni vacío.
- Que `status` es `'active'` para poder entrar al panel.

Si `role` viene en mayúsculas o con espacios en la BD, la normalización en front (`normalizeRole`) ya lo corrige; aun así conviene que en BD esté en minúsculas.

---

## 2. Valor real de `user.role` en AuthContext

Origen del rol en la app:

1. **Hidratación (login / sesión inicial)**  
   - `loadUserData` → `hydrateProfile(authUser)`.  
   - En `hydrateProfile`:  
     - Query: `supabase.from('users').select(USERS_BOOTSTRAP_SELECT).eq('id', uid).maybeSingle()`.  
     - `USERS_BOOTSTRAP_SELECT` incluye `role`.  
   - Se hace:  
     - `setUserDataStatus('ok')`  
     - `setUser(prev => ({ ...prev, role: normalizeRole(data.role) ?? prev.role, ... }))`.  
   - **Log añadido (solo __DEV__):**  
     `[hydrateProfile] done` con `data.role (raw from DB)` y `normalizeRole(data.role)`.

2. **Sobrescrituras de `user`**  
   - Al inicio de `loadUserDataImpl`: `setUser(optimisticUserFromAuth(authUser))` → `user.role = undefined`.  
   - Luego se pone `userDataStatus = 'loading'`, así que el guard devuelve `profile_loading` y no se pinta el menú hasta que `hydrateProfile` termine y vuelva a hacer `setUser` con `role` ya normalizado.

Con los logs en consola podrás ver:
- El valor crudo que llega de la BD (`data.role`).
- El valor ya normalizado que se guarda en estado (`normalizeRole(data.role)`).

---

## 3. Valor real de `currentUserRole` en AdminDashboard

En `AdminDashboardScreen.tsx`:

- `currentUserRole = normalizeRole(user?.role)` (siempre se usa el rol normalizado).
- Antes de eso se añadió un guard: si `profileReady && (user?.role == null || user?.role === undefined)` se muestra loading y no se calcula el menú (evita usar el fallback implícito a `'personal'`).

Log en __DEV__:

- `[AdminDashboard] menu role check` incluye:
  - `user?.role`, `currentUserRole`, `profileReady`, `roleReadyForMenu`, `hasFullMenuAccess`
  - `MENU_REDUCED_REASON`: solo si el menú se reduce (`hasFullMenuAccess === false`), con el `currentUserRole` en ese momento.
  - `menuItemIdsBefore` / `menuItemIdsAfter`, `menuReducedToTwo`.

Con eso puedes ver en runtime qué valor tiene `currentUserRole` y por qué el menú se reduce.

---

## 4. Lista exacta de `menuItems` base

En `AdminDashboardScreen.tsx`, `menuItems` es un `useMemo` que devuelve **siempre** estos 10 ítems (no hay filtro previo por rol/suscripción/branch):

1. `global-catalog`  
2. `cocktail-menu`  
3. `wines`  
4. `inventory`  
5. `qr`  
6. `tasting-exams`  
7. `users` (requiresManager: true)  
8. `branches` (requiresOwner: true)  
9. `subscriptions` (requiresOwner: true)  
10. `settings`  

Ningún otro código recorta `menuItems` antes de `filteredMenuItems`. El único filtrado es el de `filteredMenuItems` (por rol y por `requiresOwner`/`requiresManager`).

---

## 5. Lista exacta de `filteredMenuItems`

Se calcula en el `useMemo` que filtra `menuItems`:

- Si **`!hasFullMenuAccess`** (es decir, `canAccessFullAdminScreens(currentUserRole) === false`):  
  se dejan solo ítems con `item.id === 'tasting-exams' || item.id === 'settings'` → **2 ítems**.
- Si **`hasFullMenuAccess === true`**:  
  se aplican solo `requiresOwner` y `requiresManager`; para supervisor (no owner, no manager) se quitan `users`, `branches`, `subscriptions` → **7 ítems** (global-catalog, cocktail-menu, wines, inventory, qr, tasting-exams, settings).

Por tanto, si el supervisor solo ve 2 ítems, en ese render **`hasFullMenuAccess` fue `false`**, es decir **`currentUserRole` no estuvo en `ADMIN_FULL_ACCESS_ROLES`** (en la práctica, acabó siendo `'personal'` por fallback o por valor incorrecto).

---

## 6. Qué condición elimina los ítems faltantes

La condición que deja solo **tasting-exams** y **settings** es:

```ts
if (!hasFullMenuAccess) {
  return item.id === 'tasting-exams' || item.id === 'settings';
}
```

Es decir: **cuando `hasFullMenuAccess` es false**, el menú se reduce a esos 2 ítems.  
`hasFullMenuAccess` es `canAccessFullAdminScreens(currentUserRole)`, y eso es true solo si `currentUserRole` está en `['owner','gerente','sommelier','supervisor']`.  
Si en runtime `currentUserRole` es `'personal'` (por `user?.role` undefined, null o valor no reconocido), entonces `hasFullMenuAccess` es false y se aplica el menú reducido.

---

## 7. Causa raíz exacta

El menú se reduce a 2 ítems **solo** cuando:

- `canAccessFullAdminScreens(currentUserRole)` devuelve `false`, es decir  
- `currentUserRole` no es uno de: `'owner' | 'gerente' | 'sommelier' | 'supervisor'`.

En la práctica, para un usuario que debería ser supervisor, eso implica que **en el momento del cálculo del menú**, `currentUserRole` está llegando como **`'personal'`** (o algo que no está en `ADMIN_FULL_ACCESS_ROLES`).  
Eso puede deberse a:

1. **Rol en BD:** `role` en `public.users` es `NULL`, vacío o distinto de `'supervisor'` (p. ej. `'personal'` o valor con mayúsculas/espacios que antes no se normalizaba bien).  
2. **Hidratación:** el `user` del contexto no tiene `role` asignado en el momento del render (p. ej. primera pintada con `optimisticUserFromAuth` antes de que `hydrateProfile` termine, o race entre `setUserDataStatus('ok')` y `setUser`).  
3. **Normalización:** un valor de `data.role` que antes no se normalizaba a `'supervisor'` (ya mitigado con `normalizeRole` que hace trim + toLowerCase y lista de roles canónicos).

Los cambios aplicados para fijar y diagnosticar:

- **AuthContext:** log en `hydrateProfile` con `data.role` (raw) y `normalizeRole(data.role)`; uso de `normalizedRole` al hacer `setUser`.  
- **AdminDashboardScreen:**  
  - No pintar el menú si `profileReady && user?.role == null/undefined` (loading hasta que el rol esté hidratado).  
  - `currentUserRole = normalizeRole(user?.role)`.  
  - Log detallado con `user?.role`, `currentUserRole`, `hasFullMenuAccess`, `MENU_REDUCED_REASON`, `menuItemIdsBefore/After`.  
- **normalizeRole (types):** insensible a mayúsculas y más defensivo (trim, toLowerCase).

Con los logs podrás ver **en tu entorno** cuál de los puntos anteriores se cumple (valor en BD, valor en `user.role`, valor de `currentUserRole` y por qué `hasFullMenuAccess` es false).

---

## 8. Archivos modificados

- `src/contexts/AuthContext.tsx`: log en `hydrateProfile` y uso de `normalizedRole` en `setUser`.
- `src/screens/AdminDashboardScreen.tsx`: guard de “rol no hidratado”, logs de diagnóstico, variable `roleReadyForMenu` en el log.
- `src/types/index.ts`: (ya aplicado antes) `normalizeRole` con trim + toLowerCase.

---

## 9. Diff mínimo aplicado (resumen)

- **AuthContext:** en `hydrateProfile`, se calcula `normalizedRole = normalizeRole(data.role)` y se loguea `data.role` y `normalizedRole` en __DEV__; en `setUser` se usa `normalizedRole ?? prev.role`.  
- **AdminDashboardScreen:**  
  - Después de `guardStatus === 'denied'`, si `profileReady && (user?.role == null || user?.role === undefined)` se muestra loading y se retorna (no se calcula el menú).  
  - `currentUserRole = normalizeRole(user?.role)`.  
  - En el `useMemo` de `filteredMenuItems`, log ampliado con `MENU_REDUCED_REASON`, `menuItemIdsBefore/After`, `menuReducedToTwo`, `user_id`, `user_email`, `roleReadyForMenu`.

---

## 10. Checklist manual de validación

1. **BD**  
   - [ ] Ejecutar el SQL de verificación con el email del supervisor.  
   - [ ] Confirmar que `role = 'supervisor'` y `status = 'active'`.

2. **Logs en consola (__DEV__)**  
   - [ ] Tras login como supervisor, buscar `[hydrateProfile] done` y anotar `data.role (raw from DB)` y `normalizeRole(data.role)`.  
   - [ ] En el dashboard, buscar `[AdminDashboard] menu role check` y anotar `user?.role`, `currentUserRole`, `hasFullMenuAccess`, `MENU_REDUCED_REASON`, `menuItemIdsAfter`.

3. **Comportamiento**  
   - [ ] Supervisor: ve los 7 ítems esperados (no solo Catas y Configuración).  
   - [ ] Personal: sigue viendo solo Catas y Configuración.  
   - [ ] Owner/gerente/sommelier: sin regresiones.

4. **Si el menú sigue reducido para supervisor**  
   - Revisar en los logs el valor exacto de `data.role` y `user?.role` y `currentUserRole`.  
   - Si `data.role` es null o incorrecto en BD → corregir datos o RLS.  
   - Si `user?.role` es undefined en el momento del log del dashboard → el problema es de hidratación/orden de actualizaciones (el guard de “rol no hidratado” debería evitar pintar el menú en ese frame).
