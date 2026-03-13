# Auditoría: Bloqueo de usuarios PENDING (App + Web)

**Objetivo:** Confirmar que un usuario con `public.users.status = 'pending'` no puede ver datos sensibles (vinos, inventario, analytics, usuarios, branches) hasta ser aprobado.

**Alcance:** Repo Cellarium (app). Repo cellarium-visualizador-web: conclusiones según documentación (el repo web no está en este workspace).

---

## 1) Referencias a status y pending (App)

### 1.1 Grep: `status === 'pending'`, `.status`, `'pending'`

| Archivo | Uso |
|--------|-----|
| **src/hooks/useAdminGuard.ts** | `user.status === 'loading'` → `profile_loading`; `user.status === 'pending'` → `'pending'`; `user.status === 'inactive'` → `denied`. Fuente central del guard. |
| **src/screens/UserManagementScreen.tsx** | Query `.eq('status', 'pending')` para listar usuarios pendientes. |
| **src/screens/InventoryManagementScreen.tsx** | `guardStatus === 'pending'` → muestra `<PendingApprovalMessage />`. |
| **src/screens/AdminDashboardScreen.tsx** | `guardStatus === 'pending'` → `<PendingApprovalMessage />`. |
| **src/screens/SettingsScreen.tsx** | `guardStatus === 'pending'` → `<PendingApprovalMessage />`. |
| **src/screens/WineManagementScreen.tsx** | `guardStatus === 'pending'` → `<PendingApprovalMessage />`. |
| **src/screens/BranchManagementScreen.tsx** | `guardStatus === 'pending'` → `<PendingApprovalMessage />`. |
| **src/screens/CocktailManagementScreen.tsx** | `guardStatus === 'pending'` → `<PendingApprovalMessage />`. |
| **src/screens/WineCatalogScreen.tsx** | Solo un uso: `user.status === 'active'` para decidir si el botón ⚙️ va a AdminDashboard o AdminLogin (línea ~2453). **No** bloquea la carga de vinos para pending. |
| **src/contexts/AuthContext.tsx** | `optimisticUserFromAuth`: `status: 'loading'`. `ensureUserRow`: insert con `status: 'pending'` (admin_invite) o `'active'` (owner). `hydrateProfile`: asigna `status: (data.status as User['status']) ?? 'active'`. |
| **src/types/index.ts** | `User.status`: `'pending' | 'active' | 'inactive' | 'loading'`. |
| **src/screens/SubscriptionsScreen.tsx** | `user?.status === 'loading'` para mostrar loading overlay; no bloquea pending. |

### 1.2 Guards identificados

- **useAdminGuard** (`src/hooks/useAdminGuard.ts`):
  - Devuelve `'pending'` cuando `user.status === 'pending'`.
  - **No** redirige en ese caso: solo redirige cuando `status === 'denied'` (y `requireAuth`), mostrando Alert y `navigation.reset` a AdminLogin.
  - Las pantallas que usan el guard deben comprobar `guardStatus === 'pending'` y mostrar `<PendingApprovalMessage />`; si no lo hacen, el usuario pending podría ver contenido.

- **Pantallas que usan useAdminGuard y comprueban pending:**
  - AdminDashboardScreen
  - SettingsScreen
  - InventoryManagementScreen (el que tiene guard; ver nota en 2.1)
  - WineManagementScreen
  - BranchManagementScreen
  - CocktailManagementScreen

- **Navigation guard:** BootstrapScreen no comprueba `user.status` ni `profileReady`; si hay `user` (incl. pending), redirige a AppAuth. AppAuthWrapper tampoco filtra por status: si hay `user` renderiza `<AppNavigator />`. Por tanto, un usuario pending entra al stack con ruta inicial WineCatalog.

---

## 2) Pantallas bloqueadas vs no validadas

### 2.1 Pantallas que SÍ validan status pending (bloqueadas)

Todas usan `useAdminGuard` y, al recibir `guardStatus === 'pending'`, renderizan solo `<PendingApprovalMessage />` (sin datos sensibles):

| Pantalla | Archivo | Condición exacta |
|----------|---------|-------------------|
| AdminDashboard | `src/screens/AdminDashboardScreen.tsx` | `if (guardStatus === 'pending') return <PendingApprovalMessage />` |
| Settings | `src/screens/SettingsScreen.tsx` | `if (guardStatus === 'pending') return <PendingApprovalMessage />` |
| WineManagement | `src/screens/WineManagementScreen.tsx` | `if (guardStatus === 'pending') return <PendingApprovalMessage />` |
| BranchManagement | `src/screens/BranchManagementScreen.tsx` | `if (guardStatus === 'pending') return <PendingApprovalMessage />` |
| CocktailManagement | `src/screens/CocktailManagementScreen.tsx` | `if (guardStatus === 'pending') return <PendingApprovalMessage />` |
| InventoryManagement (UI con guard) | `src/screens/InventoryManagementScreen.tsx` | `if (guardStatus === 'pending') return <PendingApprovalMessage />` |

Nota: En `AppNavigator.tsx`, la ruta **`InventoryManagement`** está asociada al componente **`InventoryAnalyticsScreen`**, no a `InventoryManagementScreen`. Por tanto, quien se monta al navegar a `InventoryManagement` es InventoryAnalyticsScreen.

### 2.2 Pantallas que NO validan status y deberían (riesgo de bypass)

| Pantalla | Archivo | Problema |
|----------|---------|----------|
| **WineCatalogScreen** | `src/screens/WineCatalogScreen.tsx` | No usa useAdminGuard. No comprueba `user.status === 'active'` antes de cargar vinos. En modo admin/staff la carga usa `user?.owner_id \|\| user?.id` (líneas ~410, ~976) y `canLoad = !!user && !!activeBranch && isInitialized` (líneas ~889, ~915). Un usuario **pending** tiene `profileReady` y típicamente `owner_id`/`branch_id` tras hydrate; BranchContext les da `currentBranch` e `isInitialized`, por lo que se cargan y muestran vinos del owner. **Bypass confirmado.** |
| **InventoryAnalyticsScreen** | `src/screens/InventoryAnalyticsScreen.tsx` | No usa useAdminGuard. Usa `user` y `currentBranch` para analytics/inventario. En la navegación actual solo se llega desde AdminDashboard (que sí bloquea a pending), pero si en el futuro hay otro punto de entrada o deep link a `InventoryManagement`, un pending podría ver datos. **Recomendable** añadir guard por defensa en profundidad. |
| **AddWineToCatalogScreen** | `src/screens/AddWineToCatalogScreen.tsx` | Comprueba `!user \|\| !profileReady \|\| !currentBranch` antes de enviar; no comprueba `user.status === 'active'`. Un usuario pending con perfil y sucursal podría intentar enviar el formulario (RLS/backend podría rechazarlo, pero la UI no bloquea). |
| **GlobalWineCatalogScreen** | `src/screens/GlobalWineCatalogScreen.tsx` | Solo comprueba `!profileReady` para mostrar loading; no comprueba status. Un pending podría ver el catálogo global. |
| **SubscriptionsScreen** | `src/screens/SubscriptionsScreen.tsx` | Muestra overlay cuando `!profileReady \|\| user?.status === 'loading'`; no oculta contenido para `status === 'pending'`. |
| **UserManagementScreen** | `src/screens/UserManagementScreen.tsx` | Comprueba `canManageUsers(user.role)`; para pending el rol suele ser personal/staff, por lo que no puede gestionar usuarios. No muestra datos sensibles de otros; **comportamiento aceptable** pero no hay comprobación explícita de status. |
| **QrGenerationScreen** | `src/screens/QrGenerationScreen.tsx` | Comprueba `profileReady` y permisos por rol; un pending no tendría permiso para generar QR admin. Aun así, no hay comprobación explícita de status. |

---

## 3) Flujo de login y carga de public.users

- **Después de auth:**  
  - `onAuthStateChange` (INITIAL_SESSION / SIGNED_IN) → `setUser(optimisticUserFromAuth(authSession.user))` con `status: 'loading'` y `role: undefined`.  
  - Se llama `loadUserData(authSession.user)`, que termina en `hydrateProfile`: consulta `public.users` con `USERS_BOOTSTRAP_SELECT` por `id = uid`.  
  - Si hay fila: se actualiza `user` con `role`, `status`, `branch_id`, `owner_id`, etc., y `setUserDataStatus('ok')` → **profileReady = true**.  
  - Si no hay fila: tras al menos un reintento se llama `ensureUserRow(authUser)`, que inserta en `public.users` (según `invitationType`: admin_invite → role personal, status pending; si no → owner, status active). Luego se reintenta hydrate y se acaba teniendo perfil con status pending o active.

- **¿Qué pasa si no existe perfil?**  
  - Se crea con `ensureUserRow` (owner activo o staff pending). No se usa la Edge `user-created` en este camino de “sesión existente sin fila”; la creación es local en el cliente vía insert.

- **Orden efectivo:**  
  1. Sesión auth existe → user optimista (status loading).  
  2. hydrateProfile lee `public.users` (o crea fila con ensureUserRow).  
  3. profileReady pasa a true y user tiene status real (pending/active).  
  4. Un usuario **pending** tiene ya `owner_id`/`branch_id` si fueron seteados por user-created o create_staff_user; BranchContext carga branches cuando `user && profileReady`, así que el pending tiene `currentBranch` y puede usar WineCatalogScreen en modo staff y ver datos.

---

## 4) Queries con owner_id / user.id sin gate de profileReady o status

- **WineCatalogScreen** (`src/screens/WineCatalogScreen.tsx`):
  - Líneas ~409–410 (modo admin/staff): `ownerId = user?.owner_id || user?.id` sin comprobar `profileReady` ni `user.status`.
  - Líneas ~975–976: mismo uso en el efecto que cachea owner_id.
  - El `canLoad` para el efecto de carga (líneas ~889, ~915) es `!!user && !!activeBranch && isInitialized`. No exige `user.status === 'active'`.  
  **Riesgo:** Usuario pending con perfil hidratado y branch cargado dispara la carga y ve el catálogo del owner.

- **BranchContext** (`src/contexts/BranchContext.tsx`):  
  - Carga branches cuando `user && profileReady`; no comprueba status. Correcto para tener `currentBranch`, pero combinado con WineCatalogScreen permite el bypass anterior.

- Otras pantallas que usan `owner_id` o `user.id` (p. ej. UserManagementScreen, AdminDashboard) están detrás de useAdminGuard y bloquean a pending, por lo que no exponen datos sin el gate de status en el guard.

---

## 5) Bypass: repro paso a paso

**Caso: usuario PENDING ve catálogo de vinos del owner**

1. Crear usuario staff por flujo web o app (user-created/create_staff_user) con `status = 'pending'`, `owner_id` y `branch_id` seteados.
2. En la app, iniciar sesión con ese usuario (email/contraseña o magic link).
3. Bootstrap: hay `user` → redirección a AppAuth.
4. AppAuthWrapper: hay `user` (primero optimista con status loading, luego hidratado con status pending) → se renderiza `<AppNavigator />`.
5. Ruta inicial del stack: **WineCatalog**.
6. WineCatalogScreen se monta; no es guest; `user` tiene `owner_id` y `branch_id`; BranchContext ya cargó branches (`user && profileReady`) → `currentBranch` e `isInitialized` están disponibles.
7. El efecto de carga (líneas ~886–908) cumple `canLoad` (user, activeBranch, isInitialized) y llama a `safeLoadWines`.
8. En `safeLoadWines`, en modo admin/staff se usa `ownerId = user?.owner_id || user?.id` y se llama a `WineService.getWinesByBranch(branchToUse.id, ownerId)`.
9. **Resultado:** Se muestran vinos (e inventario asociado) del owner en esa sucursal al usuario pending.

**Conclusión:** Un usuario con `users.status = 'pending'` puede ver datos sensibles del catálogo/stock en WineCatalogScreen sin ser aprobado.

---

## 6) Recomendaciones (máximo 1–3 cambios)

1. **WineCatalogScreen (obligatorio):**  
   En modo no-guest, no cargar vinos ni mostrar catálogo si el usuario está pending. Opciones:
   - Opción A: Al inicio del render, si `user && user.status === 'pending'`, mostrar solo `<PendingApprovalMessage />` (y no ejecutar la lógica de carga de vinos para ese usuario).
   - Opción B: Incluir en la condición `canLoad` que `user.status === 'active'` cuando no sea guest; si es pending, no llamar a `safeLoadWines` y mostrar PendingApprovalMessage en la zona de contenido.

2. **InventoryAnalyticsScreen (recomendado):**  
   Añadir `useAdminGuard` y, si `guardStatus === 'pending'`, mostrar `<PendingApprovalMessage />`. Así se protege también ante futuros enlaces o rutas que abran directamente InventoryManagement.

3. **AddWineToCatalogScreen / GlobalWineCatalog (opcional):**  
   Para coherencia, exigir `user.status === 'active'` antes de permitir uso (o mostrar PendingApprovalMessage si status es pending). Menor prioridad si RLS ya restringe escritura y el daño de solo lectura en catálogo global se considera bajo.

---

## 7) Repo cellarium-visualizador-web (inferido de documentación)

El repo **cellarium-visualizador-web** no está en este workspace. Según documentación (STAFF_WEB_REGISTRATION_CONTEXT.md, INFORME_VISUALIZADOR_WEB_MENU_QR.md, AUDITORIA_QR_STAFF_*):

- **/qr guest:**  
  No requiere auth; se usa token en query y se llama a la Edge `public-menu` para el menú. No se expone datos internos de la organización.

- **/qr admin (staff invite):**  
  Debe limitarse a signUp + creación de solicitud (staff_join_requests / users pending). No debe exponer menú de vinos ni datos internos (inventario, analytics, usuarios). La vista tipo AdminInviteView solo debe permitir registro/solicitud y, si acaso, enlace “Abrir en app” (deep link), no acceso a datos sensibles.

- **Rutas privadas:**  
  Confirmar en el repo web que no existan rutas privadas (dashboard, usuarios, inventario, etc.) sin comprobación de auth y sin validar que el usuario tenga rol/status apropiado en backend. Idealmente, las rutas que requieran “staff activo” deben validar sesión Supabase y, si aplica, estado en `public.users` (p. ej. status active) vía API o RLS.

**Acción recomendada:** Cuando se abra el repo cellarium-visualizador-web, revisar:
- Que `/qr` con type guest no envíe credenciales de usuario.
- Que `/qr` con type admin no muestre menú ni datos internos; solo formulario de registro/solicitud.
- Que no existan rutas privadas accesibles sin auth o sin validación de status/rol en backend.

---

## 8) Resumen

| Área | Estado |
|------|--------|
| Guards centrales (useAdminGuard) | Correctos: devuelven `pending` y las pantallas admin muestran PendingApprovalMessage. |
| Navegación bootstrap/AppAuth | No filtran por status; usuario pending entra al stack. |
| WineCatalogScreen | **Bypass:** carga y muestra vinos con owner_id sin comprobar status. |
| InventoryAnalyticsScreen | Sin guard; recomendable añadirlo. |
| Otras pantallas (AddWine, GlobalCatalog, Subscriptions, UserManagement, QrGeneration) | Sin validación explícita de status; impacto bajo o mitigado por rol/RLS. |
| Web (inferido) | /qr guest sin auth; /qr admin solo signUp+request; rutas privadas por confirmar en repo. |

**Cambio prioritario:** Bloquear en WineCatalogScreen la carga y visualización de datos cuando `user.status === 'pending'` (mostrar PendingApprovalMessage en modo no-guest).
