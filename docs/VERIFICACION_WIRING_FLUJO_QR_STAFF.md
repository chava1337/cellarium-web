# Verificación de wiring real del flujo QR staff

**Objetivo:** Trazabilidad exacta de pantallas y funciones del flujo invitación/aprobación staff por QR, sin modificar lógica.

---

## 1. ¿Están conectadas al flujo actual?

| Pantalla / función | ¿Conectada? | Evidencia |
|--------------------|-------------|-----------|
| **`src/screens/QrProcessorScreen.tsx`** | **Sí** | Montada como ruta `QrProcessor` en el **Stack raíz** (`App.tsx`) y también dentro de **AppNavigator** (`AppNavigator.tsx`). Entrada por deep link (Bootstrap) o por `navigate('QrProcessor')` desde WineCatalogScreen. |
| **`src/screens/AdminRegistrationScreen.tsx`** | **Sí** | Montada como ruta `AdminRegistration` en el **Stack raíz** (`App.tsx`). QrProcessorScreen hace `navigation.replace('AdminRegistration', { qrToken, ownerId, branchId, branchName })` en éxito de resolve-qr (flujo staff y legacy). |
| **`approveUserWithRole()` en `src/screens/UserManagementScreen.tsx`** | **Sí** | UserManagementScreen está en AppNavigator como `UserManagement`. El botón "Aprobar" de un usuario pendiente llama `handleApproveUser(pendingUser)` → se abre modal de roles → al elegir rol se llama `approveUserWithRole(userPendingApproval, role)` (línea ~556). Esa función ejecuta `supabase.rpc('approve_staff_request_managed', ...)`. |

---

## 2. Respuestas exactas

### ¿Qué pantalla se abre al escanear un QR staff?

- **Depende del punto de entrada:**
  - **App en frío con deep link** (ej. `cellarium:///qr/<encoded>`): **BootstrapScreen** decide; si la URL es de tipo QR, hace `navigation.reset({ routes: [{ name: 'QrProcessor', params: { qrData: qrEncoded } }] })`. La pantalla que se abre es **QrProcessorScreen** (instancia del **Stack raíz**).
  - **Usuario ya dentro de la app** (ej. en Catálogo): desde **WineCatalogScreen** hay un botón que hace `navigation.navigate('QrProcessor', {})`. En ese caso se abre **QrProcessorScreen** dentro del **navigator anidado** (AppNavigator).

En ambos casos la pantalla que se muestra es **`QrProcessorScreen`** (mismo componente); lo que cambia es en qué Stack está (raíz vs AppNavigator).

### ¿Qué pantalla se abre después de resolver el QR?

- **AdminRegistrationScreen.**  
  QrProcessorScreen, tras recibir `resolveData?.success === true` y `owner_id` y `branch_id`, hace:
  - `navigation.replace('AdminRegistration', { qrToken, ownerId: resolveData.owner_id, branchId: resolveData.branch_id, branchName: resolveData.branch_name ?? undefined })`.
- Ruta: **`AdminRegistration`**.  
  Parámetros: `qrToken`, `ownerId`, `branchId`, `branchName` (definidos en `RootStackParamList.AdminRegistration` en `src/types/index.ts`).

**Importante:** La ruta `AdminRegistration` está declarada **solo en el Stack raíz** (`App.tsx`). No existe en AppNavigator. Por tanto:
- Si el usuario llegó a QrProcessor por **deep link** (stack raíz), `replace('AdminRegistration', ...)` funciona correctamente.
- Si llegó a QrProcessor desde **WineCatalog** (dentro de AppNavigator), `replace('AdminRegistration', ...)` se ejecuta en el contexto del navigator anidado, donde **no** existe la pantalla `AdminRegistration`; el comportamiento puede ser indefinido o fallar según la versión de React Navigation.

### ¿Qué función exacta se ejecuta al aprobar un usuario pendiente?

- **`approveUserWithRole(userToApprove: User, selectedRole: UserRole)`** en `src/screens/UserManagementScreen.tsx` (aprox. líneas 99–163).
- Esa función llama a **`supabase.rpc('approve_staff_request_managed', { p_target_user_id: userToApprove.id, p_new_role: selectedRole })`**.
- Flujo en UI: lista de pendientes → botón "✓ Aprobar" → `handleApproveUser(pendingUser)` → modal con roles asignables → usuario elige un rol → `onPress` llama `approveUserWithRole(userPendingApproval, role)`.

### ¿Hay rutas o pantallas legacy/duplicadas que se usen en lugar de estas?

- **No** para el flujo staff actual. La app usa explícitamente:
  - **QrProcessorScreen** para procesar el QR (staff y guest/legacy).
  - **AdminRegistrationScreen** para el registro del invitado (ruta `AdminRegistration`).
  - **UserManagementScreen** y **approveUserWithRole** para aprobar pendientes.
- **Sí** hay archivos/pantallas que **no** participan en este flujo:
  - **`RegistrationScreen.tsx`**: usa el tipo de ruta `AdminRegistration` pero **no está montada** en la app (import y Stack.Screen comentados en `App.tsx`). No se usa.
  - **`OwnerRegistrationScreen.tsx`**: ruta `OwnerRegistration`; import y Stack.Screen comentados en `App.tsx`. No se usa en el flujo QR staff.
  - **QrProcessor** está **duplicada** como ruta: una en el Stack raíz (App.tsx) y otra dentro de AppNavigator (AppNavigator.tsx). Ambas usan el **mismo** componente `QrProcessorScreen.tsx`. No hay otra pantalla “legacy” que reemplace a QrProcessor en este flujo.

---

## 3. Versiones de pantallas y flujo realmente usadas

| Concepto | Archivo realmente usado | ¿Otra versión existe? |
|----------|--------------------------|-------------------------|
| Procesar QR (staff o guest) | **`src/screens/QrProcessorScreen.tsx`** | No. Solo este componente; montado en dos stacks (raíz y AppNavigator). |
| Registro admin/staff (tras QR) | **`src/screens/AdminRegistrationScreen.tsx`** | Sí. `RegistrationScreen.tsx` también tipa la ruta `AdminRegistration` pero **no está montado**; la app usa solo AdminRegistrationScreen. |
| Gestión de usuarios y aprobación | **`src/screens/UserManagementScreen.tsx`** (y su `approveUserWithRole`) | No. Una sola pantalla y una sola función de aprobación. |
| Dashboard / entrada a UserManagement | **`src/screens/AdminDashboardScreen.tsx`** | Navega a `UserManagement` con `navigation.navigate('UserManagement')`. No hay otra ruta para “gestión de usuarios”. |

**Resumen:** El flujo real usa **QrProcessorScreen** → **AdminRegistrationScreen** → (tras login del owner/gerente) **UserManagementScreen** con **approveUserWithRole**. Las únicas “otras versiones” son RegistrationScreen y OwnerRegistrationScreen, que **no** están montadas en la app.

---

## 4. Esquema de navegación (flujo staff)

```
[Deep link cellarium:///qr/<encoded>]
        ↓
  BootstrapScreen (getInitialURL → qrEncoded)
        ↓ navigation.reset
  QrProcessorScreen (Stack raíz) params: { qrData }
        ↓ resolve-qr OK → navigation.replace
  AdminRegistrationScreen (Stack raíz) params: { qrToken, ownerId, branchId, branchName }
        ↓ signUp + user-created / create_staff_user
  (usuario pendiente; luego login owner/gerente)
        ↓
  AppAuth → AppNavigator → AdminDashboard (o equivalente)
        ↓ navigation.navigate('UserManagement')
  UserManagementScreen
        ↓ lista list_manageable_users → pendientes
        ↓ "Aprobar" → handleApproveUser → modal rol → approveUserWithRole( user, role )
  supabase.rpc('approve_staff_request_managed', ...)
```

**Alternativa (usuario ya en app):** WineCatalogScreen → `navigate('QrProcessor')` → QrProcessorScreen **dentro de AppNavigator** → mismo `replace('AdminRegistration', ...)`. En este caso AdminRegistration no está en AppNavigator; solo existe en el Stack raíz, por lo que este camino puede no llevar correctamente a AdminRegistration según el comportamiento del nested navigator.

---

## 5. Archivos exactos de referencia

- **Rutas y parámetros:** `src/types/index.ts` (`RootStackParamList`: `AdminRegistration`, `QrProcessor`, `UserManagement`).
- **Stack raíz (Bootstrap, Welcome, AdminRegistration, QrProcessor, AppAuth, AppNavigator):** `App.tsx`.
- **Navigator anidado (WineCatalog, QrProcessor, UserManagement, …):** `src/screens/AppNavigator.tsx`.
- **Decisión “ir a QrProcessor” al arranque:** `src/screens/BootstrapScreen.tsx` (getQrEncodedFromUrl, reset a QrProcessor).
- **Navegación a AdminRegistration:** `src/screens/QrProcessorScreen.tsx` (replace en líneas ~206 y ~309).
- **Navegación a UserManagement:** `src/screens/AdminDashboardScreen.tsx` (handleUserManagement → navigate('UserManagement')).
- **Aprobación:** `src/screens/UserManagementScreen.tsx` (handleApproveUser, approveUserWithRole, RPC approve_staff_request_managed).
