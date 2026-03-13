# AUDITORÍA DE USO – wine_branch_stock y qr_tokens

**Objetivo:** Confirmar si existe algún flujo que haga SELECT directo a `public.wine_branch_stock` como anon/guest o a `public.qr_tokens` desde el cliente (fuera de resolve-qr).  
**Alcance:** Solo análisis; no se modificó código.

---

## 1. Búsqueda realizada

Patrones buscados en todo el proyecto:

- `from('wine_branch_stock')` / `from("wine_branch_stock")` / `wine_branch_stock`
- `getWinesByBranch(`
- `validateQrToken(`
- `from('qr_tokens')` / `from("qr_tokens")` / `qr_tokens`

---

## 2. Coincidencias por archivo (código ejecutable; excl. solo docs/migrations)

### 2.1 wine_branch_stock

| Archivo | Línea aprox. | Contexto | ¿Guest? | ¿Anon client? | ¿Tras public-menu? | ¿Legacy? | ¿Muerto? |
|---------|--------------|----------|---------|---------------|--------------------|----------|----------|
| **src/services/WineService.ts** | 10, 242, 353 | `getWinesByBranch` y otros métodos: SELECT/update stock | Solo si lo invoca guest (ver WineCatalogScreen) | Sí (cuando lo llama cliente anon) | No aplica (servicio) | No | No |
| **src/screens/WineCatalogScreen.tsx** | 314, 320 | UPSERT `wine_branch_stock` (precio por copa) en handler de configuración | No (solo admin/staff) | No (requiere auth) | N/A | No | No |
| **src/screens/WineCatalogScreen.tsx** | 474 | `WineService.getWinesByBranch(branchToUse.id, ownerId)` dentro de `loadWines()` | Puede ser guest solo en path sin guestToken (ver §3) | Sí en ese path | No (ese path no usa public-menu) | Sí (guest sin token / mock) | No |
| **src/services/InventoryService.ts** | 52, 117, 143 | Consultas de stock por branch | No (pantallas staff/owner) | No | N/A | No | No |
| **src/services/SalesService.ts** | 50, 205, 375 | Ventas y stock | No (auth) | No | N/A | No | No |
| **src/services/AnalyticsService.ts** | 77, 217, 328 | Analytics por branch/stock | No (auth) | No | N/A | No | No |
| **src/services/GlobalWineCatalogService.ts** | 1091, 1100, 1123 | Insert/update en `wine_branch_stock` al vincular vino a sucursal | No (owner) | No | N/A | No | No |
| **src/services/TastingExamService.ts** | 632 | Stock para exámenes | No (auth) | No | N/A | No | No |
| **src/screens/InventoryManagementScreen.tsx** | 359, 464 | Gestión de inventario | No (auth) | No | N/A | No | No |
| **src/screens/InventoryAnalyticsScreen.tsx** | 460, 515, 522 | Analytics de inventario | No (auth) | No | N/A | No | No |
| **src/screens/GlobalWineCatalogScreen.tsx** | 130 | Catálogo global (vinculación) | No (owner) | No | N/A | No | No |
| **src/services/supabase.ts** | 84 | Solo tipado/alias en schema | N/A | N/A | N/A | No | No |
| **supabase/functions/public-menu/index.ts** | 126 | Edge: SELECT con `createClient(..., serviceRoleKey)` | N/A (Edge) | No (service_role) | Sí (es la Edge) | No | No |

### 2.2 getWinesByBranch

| Archivo | Línea aprox. | Contexto | ¿Guest? | ¿Anon? | ¿Tras public-menu? | ¿Legacy? | ¿Muerto? |
|---------|--------------|----------|--------|--------|--------------------|----------|----------|
| **src/services/WineService.ts** | 7 | Definición del método | N/A | N/A | N/A | No | No |
| **src/screens/WineCatalogScreen.tsx** | 474 | Única llamada: dentro de `loadWines()` | Solo si isGuest sin guestToken y activeBranch set (guestBranch mock) | Sí en ese caso | No | Sí (path teórico/mock) | No |

### 2.3 validateQrToken

| Archivo | Línea aprox. | Contexto | ¿Guest? | ¿Anon? | ¿En flujo QR actual? | ¿Legacy? | ¿Muerto? |
|---------|--------------|----------|--------|--------|----------------------|----------|----------|
| **src/services/QrTokenService.ts** | 31, 35, 87 | `validateQrToken`: SELECT + UPDATE `qr_tokens`, INSERT `qr_scans` | Sí (cuando se usaba para guest) | Sí | **No** (QrProcessorScreen ya no lo importa ni llama) | Sí | **Sí** (sin llamadas desde app) |
| **src/screens/QrProcessorScreen.tsx** | 246 | Solo comentario: "no usar validateQrToken" | N/A | N/A | N/A | N/A | N/A |
| **src/services/QrService.ts** | 41, 44, 75, 93, etc. | Clase `QrService`, otro `validateQrToken` (SELECT `qr_tokens`) | N/A | Sí si se usara | No (nadie importa QrService) | N/A | **Sí** (no referenciado en el proyecto) |

### 2.4 qr_tokens (desde cliente)

| Archivo | Línea aprox. | Contexto | ¿Guest? | ¿Anon? | ¿Fuera resolve-qr? | ¿Legacy? | ¿Muerto? |
|---------|--------------|----------|--------|--------|--------------------|----------|----------|
| **src/services/QrTokenService.ts** | 35, 87, 169 | validateQrToken + otras funciones (SELECT/UPDATE qr_tokens) | Sí cuando se usaba | Sí | Sí (todo desde cliente) | Sí | validateQrToken: **sí** (no se llama); resto (generateUniversalQrUrl etc.) en uso |
| **src/services/QrGenerationService.ts** | 90, 181, 238 | Insert/select qr_tokens (generar/listar/revocar tokens) | No (owner/manager) | No (authenticated) | Sí (cliente, pero auth) | No | No |
| **src/services/QrService.ts** | 18, 44, 75, 93, 115, 132, 150, 189 | Varias operaciones sobre qr_tokens | N/A | Sí si se usara | Sí | N/A | **Sí** (clase no importada en ningún archivo) |
| **supabase/functions/public-menu/index.ts** | 60 | Edge: SELECT qr_tokens con service_role | N/A | No | N/A (Edge) | No | No |

---

## 3. Confirmaciones específicas

### A) Modo guest en WineCatalogScreen

- **¿WineCatalogScreen puede seguir ejecutando `WineService.getWinesByBranch(...)` cuando `isGuest === true`?**  
  **Sí, pero solo en un camino muy acotado:**
  - Condiciones: `isGuest === true`, **sin** `guestToken` (o vacío), y `activeBranch` definido.
  - `activeBranch` en guest viene de `guestBranchFromMenu` (cuando se cargó por public-menu) o de `guestBranch` (GuestContext). Cuando hay `guestToken`, el efecto de carga usa `loadGuestMenuByToken()` y el efecto que llama a `safeLoadWines` hace `if (isGuest && guestToken?.trim()) return`, por lo que **no** se ejecuta `getWinesByBranch`.
  - Cuando **no** hay `guestToken`, se muestra "Token guest faltante" y no se llama a `loadGuestMenuByToken`; `guestBranchFromMenu` se pone a null. Entonces `activeBranch` solo puede ser `guestBranch` (GuestContext). En el código actual, `guestBranch` solo se rellena en el mock de `GuestContext.startSession()` (datos de prueba); en el flujo real de QR la app navega con `guestToken` y no usa ese mock.
  - **Conclusión:** En flujo real (QR → WineCatalog con `guestToken`), **no** se ejecuta `getWinesByBranch`. Existe un **fallback teórico** (guest sin token pero con `guestBranch` set por mock) que sí llamaría a `getWinesByBranch`; en la práctica no se usa con el QR actual.

- **¿Existe algún fallback que ignore guestToken y cargue stock directo?**  
  El único camino que carga stock directo en guest es el que usa `activeBranch` (vía `guestBranch`) y llama a `safeLoadWines` → `loadWines` → `getWinesByBranch`. Ese camino **no** ignora guestToken: cuando hay `guestToken` se hace return y no se llama a `safeLoadWines`. El “fallback” que podría cargar stock directo es el caso “isGuest sin guestToken y guestBranch set” (mock). No hay fallback que teniendo `guestToken` lo ignore y vaya a stock directo.

### B) QR legacy y validateQrToken

- **¿Existe todavía algún path que use validateQrToken para guest?**  
  **No.** En `QrProcessorScreen` ya no se importa ni se llama a `validateQrToken`. Los paths son:
  - Payload con `type === 'guest'`: navegación directa a WineCatalog con `guestToken` (menú vía public-menu en WineCatalog).
  - Payload con `type === 'admin'/'admin_invite'`: solo Edge `resolve-qr`.
  - Legacy (sin type): primero `PublicMenuService.getPublicMenuByToken(token)`; si falla, `supabase.functions.invoke('resolve-qr', { body: { token } })`. En ningún caso se usa `validateQrToken`.

- **¿validateQrToken está completamente fuera del flujo QR actual?**  
  **Sí.** No hay ninguna llamada a `validateQrToken` en la app. La función sigue en `QrTokenService.ts` pero es código muerto para el flujo QR.

### C) Web

- **¿Algún archivo web (Next.js/Vercel/etc.) hace SELECT directo a wine_branch_stock con anon key?**  
  En este repositorio **no hay** proyecto Next.js ni otra app web separada. El proyecto es Expo (React Native) con opción `expo start --web`. No se encontró en el repo código web que haga SELECT directo a `wine_branch_stock` con anon.

- **Confirmar que el menú web usa exclusivamente public-menu (Edge).**  
  No existe en el repo una aplicación “web” de menú independiente. La documentación (p. ej. `INFORME_VISUALIZADOR_WEB_MENU_QR.md`) describe que la alternativa recomendada para el menú es la Edge `GET /public-menu?token=...`. No hay código en el repo que implemente un menú web con SELECT directo; la conclusión de docs es que el menú (app o web) debería usar public-menu. No se puede “confirmar en código” un front web propio que use solo public-menu porque no está en este repo.

---

## 4. Reporte estructurado final

### 1) wine_branch_stock – usos activos (riesgo anon/guest)

| Archivo | Tipo de cliente | Riesgo |
|---------|-----------------|--------|
| **src/screens/WineCatalogScreen.tsx** (línea 474, vía `WineService.getWinesByBranch`) | Cliente anon solo en path: isGuest, sin guestToken, activeBranch = guestBranch (mock). En flujo QR real con guestToken no se ejecuta. | **Bajo en práctica**: path teórico (mock); flujo guest real usa public-menu. |
| **src/services/WineService.ts** | Mismo cliente que quien invoque getWinesByBranch (staff: authenticated; guest: solo en path mock anterior). | Mismo que arriba. |
| **src/screens/WineCatalogScreen.tsx** (314, UPSERT) | Authenticated (config precio por copa). | Nulo (no anon). |
| **src/services/InventoryService.ts**, **SalesService.ts**, **AnalyticsService.ts**, **GlobalWineCatalogService.ts**, **TastingExamService.ts**, **InventoryManagementScreen.tsx**, **InventoryAnalyticsScreen.tsx**, **GlobalWineCatalogScreen.tsx** | Authenticated (owner/staff). | Nulo (no anon). |
| **supabase/functions/public-menu/index.ts** | Edge con service_role. | Nulo (no cliente anon). |

### 2) qr_tokens – usos activos desde cliente (fuera de resolve-qr)

| Archivo | Tipo | Riesgo |
|---------|------|--------|
| **src/services/QrTokenService.ts** – `validateQrToken` | SELECT/UPDATE qr_tokens desde cliente (anon si no logueado). | **Código muerto**: ya no se llama desde QrProcessorScreen ni desde ningún otro archivo. |
| **src/services/QrTokenService.ts** – resto (p. ej. generateUniversalQrUrl) | Usado por QrGenerationScreen (authenticated). | No validación de token desde anon. |
| **src/services/QrGenerationService.ts** | Insert/select qr_tokens por owner/manager (authenticated). | Nulo para anon (solo auth). |
| **src/services/QrService.ts** | SELECT/otros sobre qr_tokens. | **Código muerto**: clase no importada en el proyecto. |
| **supabase/functions/public-menu/index.ts** | Edge con service_role lee qr_tokens. | Nulo (no cliente). |

### 3) Flujos guest confirmados

| Ámbito | Comportamiento |
|--------|----------------|
| **App (guest con QR)** | Navegación a WineCatalog con `guestToken`. Carga de menú solo vía `PublicMenuService.getPublicMenuByToken(guestToken)` → Edge public-menu. No SELECT a `qr_tokens` ni a `wine_branch_stock` desde el cliente en este flujo. |
| **App (guest sin token, mock)** | Path teórico: isGuest, sin guestToken, guestBranch set por GuestContext mock → podría llamar a `getWinesByBranch` (SELECT wine_branch_stock como anon). No usado en flujo QR real. |
| **Web** | No hay app web de menú en el repo. Docs recomiendan menú vía public-menu (Edge). |

### 4) Conclusión

- **¿Se puede eliminar o restringir la policy `guests_can_view_public_stock` (wine_branch_stock) sin romper nada?**  
  En el **flujo guest real** (QR con token → WineCatalog con `guestToken`), el cliente **no** hace SELECT a `wine_branch_stock`; todo pasa por la Edge public-menu (service_role). Por tanto, **sí** se puede eliminar o restringir esa policy para anon sin afectar ese flujo.  
  El único path que aún podría depender de SELECT anon a `wine_branch_stock` es el **teórico** “guest sin guestToken pero con guestBranch set” (mock). Si ese path no se usa en producción (y en el código actual solo se rellena con mock), restringir/eliminar la policy no rompe el flujo real. Si en el futuro se rellenara `guestBranch` sin usar public-menu, ese path sí dependería de la policy antigua.

- **¿Existe algún path legacy que dependa de la RLS antigua?**  
  - **qr_tokens:** El flujo QR actual **no** usa `validateQrToken`; no hay path activo que dependa de SELECT/UPDATE anon a `qr_tokens` para validar.  
  - **wine_branch_stock:** El path guest “real” no usa SELECT anon a `wine_branch_stock`. El path que sí lo usaría (guest con guestBranch mock, sin guestToken) es legacy/teórico y actualmente no se activa en el flujo QR.

---

*Auditoría solo lectura; no se realizaron cambios en código, SQL, RLS ni Edges.*
