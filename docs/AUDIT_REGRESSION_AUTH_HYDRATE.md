# Auditoría de regresión: Auth bootstrap, optimistic user y profileReady

**Alcance:** Cambios recientes en AuthContext, AppAuthWrapper, AuthScreen (optimistic user, hydrateProfile, ensureUserRow, profileReady, intent-filter Android, fetch abortable).

**Fecha:** 2025-01-22

---

## 1. Resumen ejecutivo

### Qué puede romperse (riesgos altos)

| Área | Riesgo | Causa |
|------|--------|--------|
| **useAdminGuard** | Usuario recién logueado (optimistic: `status='loading'`, `role` undefined) es redirigido a AdminLogin al entrar a cualquier pantalla protegida (AdminDashboard, Settings, etc.). | El guard exige `user.status === 'active'` y `user.role` en `allowedRoles`; el usuario optimista no cumple. |
| **Staff recién registrado por QR** | Mismo efecto: tras registro con OAuth/email, el usuario tiene user optimista; si navega a una pantalla con useAdminGuard antes de que hydrate termine, es redirigido a AdminLogin. | Misma causa que arriba. Staff con `status='pending'` también falla `user.status !== 'active'` y sería redirigido. |
| **SubscriptionsScreen** | El banner "Reintentar perfil" solo se muestra cuando `userDataStatus === 'fallback'`. Con el nuevo flujo, el estado de fallback ya no se usa; el banner podría no mostrarse en escenarios de perfil no cargado. | `userDataStatus` ahora suele ser `'ok'` o `'loading'`; `'fallback'` no se asigna en el flujo actual. |

### Qué está OK

- **QR menú comensales:** No depende de auth ni de `profileReady`; usa `isGuest` y `GuestContext`/params; acceso por QR sin login sigue funcionando.
- **Android OAuth callback:** Intent-filter con `scheme="cellarium"` y `host="auth-callback"` matchea `cellarium://auth-callback`; `redirectTo` en AuthScreen coincide. Scheme de desarrollo `exp+cellarium-wine-catalog` sigue en un `<data>` separado.
- **global.fetch abortable:** Cliente Supabase usa `fetchWithTimeout` (12s) en `global.fetch`; requests se abortan correctamente.
- **ensureUserRow para staff:** Si `user_metadata.invitationType === 'admin_invite'` se inserta `role='personal'`, `status='pending'`; session guard evita insertar para otro uid.
- **Pantallas ya gateadas por profileReady:** AdminDashboard, UserManagementScreen, AddWineToCatalogScreen, SettingsScreen, BranchContext (carga branches solo con `profileReady`).

---

## 2. Riesgos por módulo

### 2.1 QR Staff (invitación admin)

- **Flujo:** Escaneo QR → AdminRegistration (email/pass o Google) → `invitationType: 'admin_invite'` en metadata → Edge Function / RPC crea fila en `public.users` con `owner_id`, `branch_id`, `status='pending'`.
- **Riesgo 1:** Tras registro, sesión activa y user optimista (`role` undefined, `status='loading'`). Si el usuario entra a una pantalla protegida por **useAdminGuard** antes de que **hydrateProfile** termine, el guard redirige a AdminLogin.
- **Riesgo 2:** **useAdminGuard** además exige `user.status === 'active'`. Un staff con `status='pending'` (pendiente de aprobación) también falla y sería redirigido a AdminLogin, impidiendo ver una pantalla de “pendiente aprobación”.
- **ensureUserRow:** Correcto. Session guard; para `admin_invite` inserta `role='personal'`, `status='pending'`. No asigna owner por defecto.
- **Referencias:** `src/hooks/useAdminGuard.ts` (líneas 65–68: `user.status`, `user.role`); `src/contexts/AuthContext.tsx` (ensureUserRow invitationType); `src/screens/AdminRegistrationScreen.tsx` (invitationType en signUp/signIn).

### 2.2 QR menú comensales (solo lectura)

- **Flujo:** QR → QrProcessorScreen → `WineCatalog` con `isGuest: true` y params de branch; GuestContext puede tener sesión/branch de comensal.
- **Conclusión:** No depende de `profileReady` ni de sesión de usuario admin. Acceso a menú público por QR sin login está **OK**.
- **Referencias:** `src/screens/QrProcessorScreen.tsx` (navigate con `isGuest: true`); `src/screens/WineCatalogScreen.tsx` (ramas por `isGuest`, no por `user.role` para contenido público).

### 2.3 Catas / exámenes

- **Uso de owner_id / role:** TastingExamsListScreen, CreateTastingExamScreen, TakeTastingExamScreen, TastingExamResultsScreen usan `user.owner_id || user.id` y en algunos casos `user?.role`.
- **Riesgo:** Si el usuario llega a estas pantallas antes de que el perfil esté hidratado, `user.owner_id` puede ser solo el provisional (optimistic: `owner_id: authUser.id`). Para staff, `owner_id` real viene del perfil; hasta que hydrate termine, podría usarse el id del propio usuario como “owner” en queries. Depende de si la pantalla está detrás de **useAdminGuard**: si el guard redirige antes, nunca se ejecuta; si en algún flujo se evita el guard, podría haber queries con owner_id incorrecto.
- **Recomendación:** Asegurar que las pantallas de catas/exámenes estén protegidas por guard o por `profileReady` antes de hacer queries con `owner_id`/`branch_id`, o no mostrar contenido sensible hasta `profileReady`.
- **Referencias:** `src/screens/TastingExamsListScreen.tsx` (35, 57, 101, 130); `src/screens/CreateTastingExamScreen.tsx` (45, 84); `src/screens/TakeTastingExamScreen.tsx` (51); `src/screens/TastingExamResultsScreen.tsx` (44).

### 2.4 Inventario / ventas

- **Uso de currentBranch y owner_id:** InventoryManagementScreen, WineManagementScreen, etc. usan `user.owner_id || user.id` y `currentBranch`. BranchContext solo carga branches cuando `user && profileReady`, por tanto `currentBranch` será null hasta que el perfil esté listo.
- **Conclusión:** Si las pantallas que escriben inventario/ventas exigen `currentBranch` (o están detrás de AdminDashboard que ya está gateado por profileReady), no se ejecutan acciones con `branch_id` undefined. Riesgo bajo siempre que no se permita acceso a estas pantallas sin `profileReady` o sin `currentBranch`.
- **Referencias:** `src/screens/InventoryManagementScreen.tsx` (58, 135, 156, 291, 336, 389, 408, 429); `src/contexts/BranchContext.tsx` (79: carga solo si `user && profileReady`).

### 2.5 Gestión de usuarios

- **UserManagementScreen:** Ya gateado: `if (!user || !profileReady)` muestra “Cargando perfil…”; luego `if (!user.role || !canManageUsers(user.role))` muestra sin permisos. Correcto.
- **Riesgo:** Solo si se llegara a la pantalla sin pasar por profileReady (p. ej. guard deshabilitado en alguna ruta), pero actualmente la ruta pasa por guard/AdminDashboard que sí depende de auth.

### 2.6 Suscripciones y sucursales adicionales

- **SubscriptionsScreen:** Usa `user`, `refreshUser`, `userDataStatus`. Muestra banner cuando `userDataStatus === 'fallback'`; en el flujo actual ese estado ya no se asigna, por lo que el banner de “perfil en reintento” podría no aparecer.
- **Acceso owner:** La pantalla suele abrirse desde el menú admin; si useAdminGuard redirige a los recién logueados, el owner no llegaría hasta que hydrate termine. Cuando sí llega, `user.role === 'owner'` ya está definido.
- **SubscriptionEnforcement:** `user.role !== 'owner'` → con `role` undefined devuelve `allowed: true`, no bloquea. Correcto.
- **Recomendación:** Considerar mostrar un estado “Cargando perfil…” en SubscriptionsScreen cuando `!profileReady` (en lugar de depender solo de `userDataStatus === 'fallback'`).
- **Referencias:** `src/screens/SubscriptionsScreen.tsx` (425, 884); `src/services/SubscriptionEnforcement.ts` (51).

### 2.7 Android OAuth callback

- **Intent-filter:** `android:scheme="cellarium"` y `android:host="auth-callback"`; matchea `cellarium://auth-callback` por scheme + host. OK.
- **Desarrollo:** `<data android:scheme="exp+cellarium-wine-catalog"/>` en el mismo intent-filter; no se rompe.
- **AuthScreen:** `redirectTo: 'cellarium://auth-callback'` y `WebBrowser.openAuthSessionAsync(..., 'cellarium://auth-callback')` coinciden con el intent-filter.
- **Referencias:** `android/app/src/main/AndroidManifest.xml` (26–31); `src/screens/AuthScreen.tsx` (217–218, 234–235).

---

## 3. Hallazgos con archivo y línea

| # | Archivo | Líneas aprox. | Hallazgo |
|---|---------|----------------|----------|
| H1 | `src/hooks/useAdminGuard.ts` | 65–68 | `hasValidAuth()` exige `user.status === 'active'` y `user.role` en `allowedRoles`. Usuario optimista (`status='loading'`, `role` undefined) y staff `pending` fallan y provocan redirect a AdminLogin. |
| H2 | `src/hooks/useAdminGuard.ts` | 99–118 | Cualquier pantalla que use este guard redirige a AdminLogin si `!hasValidAuth()`, sin distinguir “no logueado” de “perfil cargando” o “pendiente aprobación”. |
| H3 | `src/screens/SubscriptionsScreen.tsx` | 884 | Banner de reintento depende de `userDataStatus === 'fallback'`; en el flujo actual ese valor no se usa, el banner no se muestra. |
| H4 | `src/screens/WineCatalogScreen.tsx` | 2099 | `user.role !== 'personal'` con `role` undefined es true; la UI que depende de esto puede mostrarse u ocultarse de forma inesperada hasta que hydrate termine. Bajo impacto si la pantalla es mayormente de solo lectura para ese bloque. |
| H5 | `src/screens/QrGenerationScreen.tsx` | 122, 262 | Usa `user.role` sin comprobar `profileReady`; si se llega aquí con user optimista, las condiciones de rol pueden ser incorrectas. La pantalla suele estar detrás de AdminDashboard (useAdminGuard), por lo que en la práctica el guard ya habría redirigido antes. |
| H6 | `src/screens/GlobalWineCatalogScreen.tsx` | 92, 107, 125 | `user.role`, `user.owner_id` usados sin gate explícito por `profileReady`; si se accede antes de hidratar, tenantId podría ser el id del usuario (optimistic). Mitigado si la ruta pasa por guard. |
| H7 | `src/screens/FichaExtendidaScreen.tsx` | 45 | `canUpdateFicha = user && (user.role === 'owner' \|\| user.role === 'sommelier')`; con `role` undefined la condición es false; no hay escalación de permisos, solo que no podrá editar hasta hidratar. |
| H8 | `src/services/SubscriptionEnforcement.ts` | 51 | `user.role !== 'owner'` con `role` undefined → allowed: true; correcto, no bloquea. |

---

## 4. Recomendaciones y fixes mínimos

### 4.1 useAdminGuard (crítico)

**Objetivo:** No redirigir a AdminLogin cuando el usuario está logueado pero el perfil aún está cargando (`status === 'loading'` o `role == null`), ni cuando es staff con `status === 'pending'` que debe ver “pendiente aprobación”.

**Fix mínimo sugerido (sin re-arquitectura):**

- En `hasValidAuth()`:
  - Si `!user` → return false (sin sesión).
  - Si `user.status === 'loading'` o `user.role == null` → tratar como “perfil cargando” (p. ej. return un valor distinto o considerar “válido en espera”).
- En el `useFocusEffect` del guard:
  - Si el usuario existe pero “perfil cargando”, no redirigir a AdminLogin; opciones:
    - Mostrar un overlay/banner “Cargando perfil…” y no hacer redirect, o
    - Considerar válido temporalmente y dejar pasar (menos seguro), o
    - Redirigir a una pantalla intermedia “Esperando perfil” en lugar de AdminLogin.
- Para staff con `status === 'pending'`:
  - Permitir acceso a una pantalla concreta de “Pendiente de aprobación” (o lista blanca de rutas para `pending`) y seguir bloqueando el resto hasta aprobación.

**Archivo:** `src/hooks/useAdminGuard.ts`.

### 4.2 SubscriptionsScreen

- Mostrar estado “Cargando perfil…” o banner de reintento cuando `userDataStatus !== 'ok'` o `!profileReady` (en lugar de depender solo de `userDataStatus === 'fallback'`), y opcionalmente llamar a `refreshUserData` al montar si hay sesión pero perfil no listo.
- **Archivo:** `src/screens/SubscriptionsScreen.tsx` (zona 884 y lógica de estado de perfil).

### 4.3 Pantallas que usan user.role / user.owner_id sin profileReady

- **QrGenerationScreen, GlobalWineCatalogScreen, FichaExtendidaScreen:** Si la navegación puede llegar sin pasar por guard (p. ej. deep link o flujo futuro), añadir comprobación `profileReady` antes de acciones sensibles o de queries por `owner_id`/branch; o asegurar que siempre estén detrás de useAdminGuard y que el guard trate “perfil cargando” como arriba.
- Opcional: en pantallas críticas que usan `user.owner_id` para RLS/queries, comprobar `profileReady` y mostrar loading o deshabilitar acciones hasta que sea true.

### 4.4 Catas / exámenes

- Confirmar que todas las pantallas de exámenes están protegidas por useAdminGuard (o equivalente) y que, tras el fix del guard, no se ejecutan queries con `owner_id`/branch hasta tener perfil hidratado. No requiere cambios adicionales si el guard se corrige y es la única puerta de entrada.

---

## 5. Checklist de pruebas manuales (QA – Android)

### 5.1 Login y bootstrap

- [ ] **Login Google – usuario nuevo (owner):** Crear cuenta con Google nueva → debe entrar a la app (WineCatalog o AdminDashboard según flujo); no debe redirigir a AdminLogin tras el callback; al navegar a Admin/Dashboard no debe sacar a login.
- [ ] **Login Google – usuario existente:** Cuenta ya en `public.users` → mismo comportamiento: entra, navegación a pantallas admin no redirige a AdminLogin una vez perfil cargado.
- [ ] **Login email/password – usuario existente:** Mismo flujo; verificar que no hay loop de “Entrando…” y que tras cargar el perfil se ve el menú correcto.

### 5.2 QR Staff (crítico)

- [ ] **Registro staff por QR – Google:** Escanear QR de invitación admin → Registrar con Google → Comprobar que se crea usuario con `owner_id`/`branch_id` del QR y `status='pending'`; no debe redirigir a AdminLogin de forma permanente; si hay pantalla “Pendiente aprobación”, debe ser accesible.
- [ ] **Registro staff por QR – email/pass:** Mismo flujo con usuario y contraseña; verificar creación en BD y que no se pierde la sesión ni se redirige a login de forma incorrecta.
- [ ] **Staff pending → owner aprueba → staff activo:** Owner aprueba al usuario pendiente → Staff cierra sesión y vuelve a entrar (o refresca) → Debe ver la sucursal correcta y permisos según rol asignado.

### 5.3 QR menú comensales

- [ ] **Acceso menú público por QR sin login:** Escanear QR de menú comensal → Abrir menú (solo lectura) sin iniciar sesión; no debe depender de `profileReady` ni de sesión admin.

### 5.4 Catas / exámenes

- [ ] **Crear examen:** Owner/gerente/sommelier crea examen con expiración; no debe fallar por `owner_id`/branch undefined.
- [ ] **Responder examen:** Staff accede y envía respuestas; ver resultados.
- [ ] **Ver resultados:** Listado y detalle de resultados por branch/owner; sin errores por perfil no hidratado.

### 5.5 Inventario y ventas

- [ ] **Crear vino manual (sin canónico) y agregar a menú:** Flujo de escaneo manual y agregar a catálogo de la sucursal; debe exigir sucursal seleccionada y no ejecutar con `branch_id` undefined.
- [ ] **Registrar movimiento de inventario y una venta:** Comprobar que currentBranch está definido y que las escrituras usan branch/owner correctos.

### 5.6 Suscripciones

- [ ] **Comprar suscripción y agregar sucursal:** Solo owner puede acceder; tras login (y hydrate) debe poder abrir Suscripciones y agregar sucursal; no debe quedar bloqueado por “perfil no listo” de forma indefinida.

### 5.7 OAuth Android

- [ ] **Callback Google en dispositivo/emulador Android:** Login con Google → redirección a `cellarium://auth-callback` → app recibe el callback y completa setSession; no debe quedar en blanco ni en “Entrando…” infinito (salvo red de prueba lenta, con timeout/watchdog acotado).

---

## 6. Checklist resumido (copiar para QA)

```
[ ] Login Google – usuario nuevo (owner)
[ ] Login Google – usuario existente
[ ] Registro staff por QR (Google)
[ ] Registro staff por QR (email/pass)
[ ] Staff pending → owner aprueba → staff entra a sucursal correcta
[ ] Acceso menú público por QR sin login
[ ] Crear examen, responder, ver resultados
[ ] Crear vino manual por escaneo, agregar a menú
[ ] Registrar movimiento inventario y una venta
[ ] Comprar suscripción y agregar sucursal
[ ] OAuth Android: callback Google correcto, sin pantalla en blanco
```

---

## 7. Fixes Applied (post-audit, mínimos)

**Objetivo:** Evitar redirects/loops por guards que asumen `role`/`owner_id` listos; alinear UI con usuario optimista + hidratación en background.

### Archivos tocados

| Archivo | Cambio |
|---------|--------|
| `src/hooks/useAdminGuard.ts` | Devuelve `status`: `loading` \| `profile_loading` \| `pending` \| `denied` \| `allowed`. No redirige en loading/profile_loading/pending; solo redirect a AdminLogin cuando `denied` y `requireAuth`. |
| `src/components/PendingApprovalMessage.tsx` | Nuevo componente para estado "Pendiente de aprobación". |
| `src/screens/AdminDashboardScreen.tsx` | Usa `guardStatus`: loader en `loading`/`profile_loading`, `<PendingApprovalMessage />` en `pending`, `null` en `denied`, contenido en `allowed`. |
| `src/screens/SettingsScreen.tsx` | Idem. |
| `src/screens/BranchManagementScreen.tsx` | Idem (returns después de todos los hooks). |
| `src/screens/WineManagementScreen.tsx` | Idem. |
| `src/screens/InventoryManagementScreen.tsx` | Idem. |
| `src/screens/CocktailManagementScreen.tsx` | Idem. |
| `src/screens/SubscriptionsScreen.tsx` | Deja de usar `userDataStatus === 'fallback'`. Banner "Cargando perfil…" con `!profileReady \|\| user?.status === 'loading'`. Mensaje "Solo el owner…" con `profileReady && user?.role !== 'owner'`. Contenido owner solo con `profileReady && user?.role === 'owner'`. |
| `src/screens/QrGenerationScreen.tsx` | Gate por `profileReady`: loader hasta que perfil listo; `loadUserTokens` en `useCallback` + `useEffect` antes del return. |
| `src/screens/GlobalWineCatalogScreen.tsx` | Gate por `profileReady`: después de todos los hooks, `if (!profileReady) return <ActivityIndicator />`. |

### Resumen por fix

- **FIX 1 (useAdminGuard):** Estado explícito y sin redirect en loading/profile_loading/pending; callers muestran loader o PendingApproval en lugar de navegar.
- **FIX 2 (SubscriptionsScreen):** Condición por `profileReady` y `user?.role`; sin `userDataStatus === 'fallback'`.
- **FIX 3 (opcional):** QrGenerationScreen y GlobalWineCatalogScreen exigen `profileReady` antes de contenido que usa `owner_id`/rol.

No se ha modificado: AuthContext, RLS, RPCs, getSession manual ni listeners globales de Linking.

---

## 8. Notas

- No se ha cambiado arquitectura ni reintroducido un bootstrap global con getSession; la auditoría se limita a compatibilidad con el flujo actual (optimistic user + hydrate en background + profileReady).
- Cualquier bug detectado por `role`/`branch_id` undefined se ha propuesto con fix mínimo (gating o fallback) y archivo/línea en la sección 4.
- El checklist de pruebas (sección 5 y 6) puede copiarse a un documento aparte para QA si se desea.
