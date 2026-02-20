# Auditoría final post-optimistic auth (detección de riesgos)

**Alcance:** Detección de conflictos lógicos con usuario optimista, `profileReady`, `useAdminGuard` y `BranchContext`. Sin refactor ni cambios automáticos.

**Fecha:** 2025-01-22

---

## A) RIESGOS DETECTADOS

### R1 – UserManagementScreen: useEffect dispara queries con `user` sin esperar `profileReady`

| Archivo | Líneas | Detalle |
|---------|--------|---------|
| `src/screens/UserManagementScreen.tsx` | 38–84, 86–92 | `useEffect(() => { loadUsers(); }, [user])` corre en cuanto existe `user`. `loadUsers()` usa `user.owner_id || user.id` para queries a `users`. Con usuario optimista (staff), `owner_id` puede ser undefined y se usa `user.id`, dando datos incorrectos. La UI sí está protegida (`if (!user \|\| !profileReady) return loading`), pero **una ronda de queries ya se ejecutó** con posible `owner_id` erróneo. |

**Recomendación mínima:** Incluir `profileReady` en la dependencia del efecto y ejecutar `loadUsers()` solo cuando `profileReady === true` (o no ejecutar el efecto hasta `profileReady`).

---

### R2 – TastingExamsListScreen, CreateTastingExamScreen: sin gate explícito por `profileReady`

| Archivo | Líneas | Detalle |
|---------|--------|---------|
| `src/screens/TastingExamsListScreen.tsx` | 35–40, 57–58, 101, 130 | Usa `user?.role`, `user.owner_id \|\| user.id`, `currentBranch.id` sin comprobar `profileReady`. Acceso típico desde AdminDashboard (useAdminGuard → solo `allowed` cuando profileReady), por lo que en la práctica suele estar protegido. **Riesgo:** deep link o navegación futura a esta pantalla sin pasar por el guard podría ejecutar `loadExams()` con `owner_id` optimista. |
| `src/screens/CreateTastingExamScreen.tsx` | 45–46, 84–87 | Misma situación: `ownerId = user.owner_id \|\| user.id`, `currentBranch.id` sin `profileReady`. Depende de que la entrada sea siempre vía pantallas con guard. |

**Recomendación mínima:** Añadir gate: `if (!profileReady) return <Loading />` o condicionar la ejecución de `loadExams`/`loadAvailableWines` a `profileReady` para no asumir solo protección por navegación.

---

### R3 – TakeTastingExamScreen, TastingExamResultsScreen: queries con `owner_id` sin `profileReady`

| Archivo | Líneas | Detalle |
|---------|--------|---------|
| `src/screens/TakeTastingExamScreen.tsx` | 41–51 | `useEffect` depende de `[examId]`; `loadExam()` usa `user.owner_id \|\| user.id`. No hay gate por `profileReady`. Si el usuario llega a esta pantalla con sesión optimista (p. ej. tras registro por QR), la primera carga puede usar `ownerId = user.id` (incorrecto para staff). |
| `src/screens/TastingExamResultsScreen.tsx` | 34–44 | Mismo patrón: `loadData()` con `user.owner_id \|\| user.id` sin comprobar `profileReady`. |

**Recomendación mínima:** No ejecutar `loadExam`/`loadData` hasta `profileReady === true`, o mostrar loader hasta `profileReady` y entonces cargar.

---

### R4 – AnalyticsScreen, InventoryAnalyticsScreen: sin gate por `profileReady`

| Archivo | Líneas | Detalle |
|---------|--------|---------|
| `src/screens/AnalyticsScreen.tsx` | 38–65 | `user?.role`, `user.owner_id \|\| user.id`; `useEffect([branchId, viewMode])` llama a `loadAnalytics()`. No hay `profileReady`. Si se llega con sesión optimista, se pueden enviar queries con `owner_id`/branch incorrectos o vacíos (`branchId === ''` si no hay `currentBranch`). |
| `src/screens/InventoryAnalyticsScreen.tsx` | 49–54, 111–133 | Igual: `user`, `user.owner_id \|\| user.id`, `branchId = route.params?.branchId \|\| currentBranch?.id \|\| ''` sin `profileReady`. En la práctica suele abrirse desde InventoryManagement (guard), pero la pantalla no se protege a sí misma. |

**Recomendación mínima:** Comprobar `profileReady` (y opcionalmente `branchId`) antes de ejecutar `loadAnalytics`/`loadData`, o mostrar loader hasta tener perfil listo.

---

### R5 – WineCatalogScreen: cache de `owner_id` con usuario optimista

| Archivo | Líneas | Detalle |
|---------|--------|---------|
| `src/screens/WineCatalogScreen.tsx` | 976–986 | `useEffect` que hace `loadBranchOwnerId()` depende de `[activeBranch?.id, isGuest, user?.owner_id, user?.id]`. En modo admin/staff hace `ownerId = user?.owner_id \|\| user?.id`. Con usuario optimista (staff), `owner_id` puede ser undefined y se cachea `user.id` como `ownerId`, incorrecto para staff hasta que hidrate. Ese cache se usa en lógica posterior. |

**Recomendación mínima:** No escribir en `branchOwnerIdCacheRef` hasta que `profileReady` sea true, o no usar el cache para queries sensibles hasta tener perfil hidratado.

---

### R6 – BranchContext: no limpia branches cuando `user` existe pero `!profileReady`

| Archivo | Líneas | Detalle |
|---------|--------|---------|
| `src/contexts/BranchContext.tsx` | 77–85 | `useEffect`: solo carga branches cuando `user && profileReady`; solo limpia cuando `!user`. Si hay `user` pero `!profileReady` (p. ej. recién logueado, usuario optimista), **no se limpian** `currentBranch` ni `availableBranches`. Podrían quedar datos de la sesión anterior hasta que termine la hidratación. Riesgo de mostrar sucursales de otro usuario de forma transitoria. |

**Recomendación mínima:** Cuando `user` existe pero `!profileReady`, limpiar `availableBranches` y `currentBranch` (o no considerarlos válidos) hasta que `profileReady` sea true.

---

### R7 – FichaExtendidaScreen, WineCatalogScreen: uso de `user.role` sin `profileReady`

| Archivo | Líneas | Detalle |
|---------|--------|---------|
| `src/screens/FichaExtendidaScreen.tsx` | 45 | `canUpdateFicha = user && (user.role === 'owner' \|\| user.role === 'sommelier')`. Con `role` undefined es false; no hay escalación de permisos. **Riesgo bajo:** solo UX (el botón de editar puede no aparecer hasta hidratar). |
| `src/screens/WineCatalogScreen.tsx` | 151 | `canEditBranchName = !isGuest && user?.role === 'owner'`. Con `role` undefined es false. Mismo nivel de riesgo bajo. |

**Recomendación mínima:** Opcional: gate por `profileReady` para mostrar/ocultar acciones de edición de forma consistente; no crítico para seguridad.

---

### R8 – GlobalWineCatalogScreen: uso de `user.role` en callback antes del early return

| Archivo | Líneas | Detalle |
|---------|--------|---------|
| `src/screens/GlobalWineCatalogScreen.tsx` | 92, 107 | `ensureBranchNameConfigured` usa `user.role === 'owner'` y está en dependencias de `useCallback` como `user.role`. El componente tiene `if (!profileReady) return ...` **después** de los hooks, por lo que en el primer render con `profileReady === false` ese callback igual se crea con `user.role` undefined. Si en algún flujo se invocara ese callback antes del return (p. ej. desde un hijo), sería con role no hidratado. En uso actual el contenido que usa el callback está después del return cuando !profileReady, por lo que el riesgo es bajo. |

**Recomendación mínima:** Considerar usar `profileReady && user?.role === 'owner'` dentro del callback para ser explícitos; no crítico si el callback solo se usa cuando ya se pasó el gate.

---

### R9 – BranchManagementScreen: getBranchLimit(user) con user optimista

| Archivo | Líneas | Detalle |
|---------|--------|---------|
| `src/screens/BranchManagementScreen.tsx` | 108–110 | `getBranchLimit(user)` y `canCreateBranch(user, currentCount)`. BranchManagementScreen está detrás de useAdminGuard y solo muestra contenido cuando `guardStatus === 'allowed'` (implica profileReady). Por tanto **está protegido** por el guard. getBranchLimit con user optimista devolvería included/addons por defecto (plan free); no hay escalación de límite. Riesgo muy bajo. |

**Conclusión:** No se marca como riesgo crítico; el guard ya asegura profileReady al mostrar la pantalla.

---

## B) PUNTOS SEGUROS (YA PROTEGIDOS)

| Archivo / Área | Protección |
|----------------|------------|
| **useAdminGuard** | Devuelve `profile_loading` / `pending` sin redirigir; solo redirige cuando `denied` y `requireAuth`. No asume role/owner_id antes de profileReady. |
| **AdminDashboardScreen, SettingsScreen, BranchManagementScreen, WineManagementScreen, InventoryManagementScreen, CocktailManagementScreen** | Usan useAdminGuard; muestran loader en `loading`/`profile_loading`, PendingApproval en `pending`, y contenido solo en `allowed` (profileReady + permisos). |
| **SubscriptionsScreen** | Usa `profileReady`, `user?.status === 'loading'`, `user?.role === 'owner'` con gates; ya no depende de `userDataStatus === 'fallback'`. |
| **QrGenerationScreen, GlobalWineCatalogScreen** | Tienen early return con loader cuando `!profileReady`; las queries que usan `owner_id`/role corren solo con perfil listo. |
| **AddWineToCatalogScreen** | Comprueba `profileReady` y `currentBranch` antes de enviar; el useEffect de aviso de nombre usa `user?.role` (con undefined no escala permisos). |
| **UserManagementScreen (UI)** | `if (!user \|\| !profileReady) return loading`; luego `if (!user.role \|\| !canManageUsers(user.role))` sin permisos. La vulnerabilidad es solo el efecto que corre antes (R1). |
| **BranchContext (carga)** | Carga branches solo cuando `user && profileReady`; no ejecuta queries con user optimista. |
| **AuthContext: ensureUserRow (admin_invite)** | Inserta `role: 'personal'`, `status: 'pending'`. Staff pending no recibe redirect a AdminLogin gracias al estado `pending` del guard. |
| **hydrateProfile** | Actualiza `role`, `status`, `owner_id`, `branch_id` desde BD; tras aprobación, el siguiente hydrate refleja `status -> active`. |
| **getBranchLimit / canCreateBranch** | Llamados desde BranchManagementScreen, que solo se muestra con guard `allowed` (profileReady). Con user null devuelven valores por defecto seguros. |
| **FichaExtendidaScreen (permisos)** | `canUpdateFicha` con role undefined es false; no hay elevación de permisos. |
| **WineCatalogScreen (canEditBranchName)** | Con role undefined la condición es false; seguro. |
| **userDataStatus === 'fallback'** | No quedan usos en el proyecto; búsqueda grep sin resultados. |

---

## C) RECOMENDACIONES MÍNIMAS (SIN REFACTOR GRANDE)

1. **UserManagementScreen (R1):** En el `useEffect` que llama a `loadUsers()`, no ejecutar mientras `!profileReady` (p. ej. `if (!user \|\| !profileReady) return;` al inicio del efecto, y añadir `profileReady` a las dependencias).
2. **TastingExamsListScreen, CreateTastingExamScreen (R2):** Añadir gate por `profileReady`: mostrar loader hasta `profileReady` y solo entonces permitir cargar exámenes/vinos.
3. **TakeTastingExamScreen, TastingExamResultsScreen (R3):** No ejecutar `loadExam`/`loadData` hasta `profileReady`, o mostrar pantalla de carga hasta que `profileReady` sea true.
4. **AnalyticsScreen, InventoryAnalyticsScreen (R4):** Comprobar `profileReady` antes de llamar a `loadAnalytics`/`loadData`, o mostrar loader hasta tener perfil listo.
5. **WineCatalogScreen (R5):** No actualizar `branchOwnerIdCacheRef` con `ownerId` de usuario cuando `!profileReady`, o no usar ese cache para decisiones/querys hasta después de hidratar.
6. **BranchContext (R6):** Cuando `user` existe pero `!profileReady`, limpiar `currentBranch` y `availableBranches` (o marcarlos como no válidos) para evitar mostrar datos de sesión anterior.
7. **FichaExtendidaScreen / WineCatalogScreen (R7):** Opcional: usar `profileReady` para mostrar acciones de edición solo cuando el perfil esté listo; no obligatorio para seguridad.
8. **GlobalWineCatalogScreen (R8):** Opcional: en `ensureBranchNameConfigured`, usar `profileReady && user?.role === 'owner'` para consistencia; riesgo bajo.

No hacer: cambios en AuthContext (optimistic/hydrate), RLS, RPCs, reintroducir getSession manual ni listeners globales de Linking.

---

## D) CONFIRMACIÓN EXPLÍCITA

- **Conflictos críticos que rompan por diseño el flujo:** No se detecta ninguno que impida por completo el uso correcto del sistema. Los riesgos son sobre todo de **una ronda de queries con datos optimistas** (owner_id/role incorrectos o vacíos) o de **datos de sesión anterior** (BranchContext) hasta que `profileReady` sea true.
- **QR staff onboarding:**  
  - **A)** Staff con `status === 'pending' no es redirigido a AdminLogin: useAdminGuard devuelve `pending` y no redirige; los callers muestran PendingApprovalMessage.  
  - **B)** Staff pending puede entrar a la pantalla de “Pendiente de aprobación”: sí, vía el mismo guard y el componente de mensaje.  
  - **C)** Tras aprobación, hydrateProfile actualiza role/status: sí, al recargar perfil desde BD.  
  - **D)** No hay lógica que asuma `role === 'owner'` antes de hydrate en los guards; los callers que muestran contenido “solo owner” lo hacen tras `allowed` (profileReady) o con gates explícitos de `profileReady` y role.
- **Suscripciones y sucursales:** SubscriptionsScreen está protegida por `profileReady` y por role; no quedan usos de `userDataStatus === 'fallback'`. BranchLimit se usa desde BranchManagementScreen (protegido por guard).
- **Catas y exámenes:** Los riesgos (R2, R3) son que algunas pantallas ejecuten queries con owner_id optimista si se accede sin pasar por guard o antes de profileReady; la recomendación es gate por `profileReady` en esas pantallas.
- **Inventario y ventas:** Pantallas de gestión (Inventory, Wine, Cocktail) están detrás de useAdminGuard; BranchContext solo carga branches con `user && profileReady`. El riesgo de queries con branch/owner antes de hidratar está en pantallas que no usan el guard (Analytics, InventoryAnalytics, TastingExams, etc.) y se mitiga con las recomendaciones anteriores.
- **Permisos owner/staff:** No se detecta escalación de permisos por usar `user.role` o `user.owner_id` con valor undefined; en general las condiciones quedan en false o en valores por defecto seguros. Los puntos a reforzar son evitar **ejecutar** queries o **escribir caches** con esos valores hasta tener `profileReady`.

---

## Resumen de usos de user.role / owner_id / branch_id (referencia rápida)

| Archivo | user.role / owner_id / branch_id | Protección |
|---------|-----------------------------------|------------|
| GlobalWineCatalogScreen | 92, 125, 147 | profileReady early return |
| QrGenerationScreen | 80, 111, 126, 266 | profileReady early return |
| SubscriptionsScreen | 901, 894, 884 | profileReady + role gates |
| InventoryManagementScreen | 57, 150, 171, 306, 351, 404, 423, 444 | useAdminGuard (allowed) |
| SettingsScreen | 56, 211–215 | useAdminGuard + profileReady en isOwner |
| UserManagementScreen | 43, 93, 230, 330 | profileReady en UI; efecto sin profileReady (R1) |
| AddWineToCatalogScreen | 33, 59, 75, 97 | profileReady en submit; role en useEffect (safe) |
| FichaExtendidaScreen | 45 | Sin guard; canUpdateFicha con role undefined = false |
| WineCatalogScreen | 151, 410, 976, 986 | canEdit seguro; cache owner_id (R5) |
| TastingExamsListScreen | 35, 57, 101, 130 | Sin profileReady (R2) |
| CreateTastingExamScreen | 45, 84, 87 | Sin profileReady (R2) |
| TakeTastingExamScreen | 51 | Sin profileReady (R3) |
| TastingExamResultsScreen | 44 | Sin profileReady (R3) |
| InventoryAnalyticsScreen | 53–54, 133, 303, 342, 421, 483 | Sin profileReady (R4) |
| AnalyticsScreen | 38–40, 61, 65 | Sin profileReady (R4) |
| BranchManagementScreen | 125, 109–110 | useAdminGuard |
| WineManagementScreen | 617–618 | useAdminGuard |
| CocktailManagementScreen | 116, 334, 338, 341 | useAdminGuard |
| BranchContext | 50, 59, 79 | Carga solo user && profileReady; no limpia si user && !profileReady (R6) |

Fin del documento.
