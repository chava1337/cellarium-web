# Impacto de endurecer RLS en public.qr_tokens

**Objetivo del cambio (simulado):** Quitar SELECT público por `expires_at > now()` en `qr_tokens`; dejar SELECT solo para owner/staff (por ejemplo `auth.uid() = owner_id` o equivalente por rol).  
**Este documento:** Solo análisis y plan; no se implementa SQL ni deploy.

---

## 1. Mapa exacto: pantallas y servicios afectados

### 1.1 validateQrToken

| Archivo | Uso | Cliente (anon/authenticated) | Snippet relevante |
|---------|-----|-------------------------------|-------------------|
| **src/services/QrTokenService.ts** | Definición | Mismo cliente que invoca (anon si usuario no logueado) | `const { data: qrToken, error } = await supabase.from('qr_tokens').select(\`*,\n        branches (id, name, address)\`).eq('token', token).single();` (líneas 34–45). Luego UPDATE qr_tokens por id (líneas 86–92). |
| **src/screens/QrProcessorScreen.tsx** | Invocación | Anon (comensal/staff que abre app y escanea sin estar logueado) o authenticated | `import { validateQrToken } from '../services/QrTokenService';` (línea 13). `const validation = await validateQrToken(tokenToValidate);` (línea 176). Tras validación, navega a WineCatalog (guest) o AdminRegistration (staff). |

**Conclusión:** Cualquier usuario que escanee el QR sin sesión (o con sesión de otro tenant) usa el cliente anon. Ese SELECT a `qr_tokens` por `token` depende de que anon pueda leer filas con `expires_at > now()`.

---

### 1.2 getUserQrTokens

| Archivo | Uso | Cliente | Snippet relevante |
|---------|-----|---------|-------------------|
| **src/services/QrGenerationService.ts** | Definición | Authenticated (owner/gerente) | `.from('qr_tokens').select(...).eq('created_by', userId).order('created_at', { ascending: false })` (líneas 180–205). |
| **src/screens/QrGenerationScreen.tsx** | Invocación | Authenticated | `import { ..., getUserQrTokens, ... } from '../services/QrGenerationService';` (línea 23). `const tokens = await getUserQrTokens(user.id);` (línea 69). |

**Conclusión:** Quien lista es el creador (owner); las filas tienen `owner_id = auth.uid()`. Con política “SELECT solo owner” (sin `expires_at`), el owner sigue viendo sus filas. **No se rompe** si la política queda `auth.uid() = owner_id`.

---

### 1.3 Lecturas directas de qr_tokens desde cliente (anon)

| Archivo | Operación | Cuándo se ejecuta | Snippet |
|---------|-----------|-------------------|---------|
| **src/services/QrTokenService.ts** | SELECT + UPDATE | Al validar QR (QrProcessor) | Ver 1.1. |
| **src/screens/AdminRegistrationScreen.tsx** | SELECT | Antes de registro staff: para obtener owner_id y generar email ficticio | `const { data: qrData, error: qrError } = await supabase.from('qr_tokens').select('owner_id').eq('token', qrToken).single();` (líneas 83–87). Si falla → Alert "Token QR inválido o expirado". |

**Conclusión:** Tanto la validación en QrProcessor como la lectura en AdminRegistration pueden ejecutarse como **anon** (usuario que aún no tiene cuenta o no ha hecho login). Ambas dejan de funcionar si anon ya no puede leer `qr_tokens`.

---

### 1.4 wine_branch_stock en modo guest

| Archivo | Uso | Cliente en modo guest | Snippet |
|---------|-----|------------------------|---------|
| **src/services/WineService.ts** | getWinesByBranch | Anon (guest sin sesión) | `let query = supabase.from('wine_branch_stock').select(...).eq('branch_id', branchId).eq('wines.owner_id', ownerId)` (líneas 9–45). |
| **src/screens/WineCatalogScreen.tsx** | Invocación | Guest: isGuest true, sin user o user no relevante | En modo guest obtiene ownerId de `branches` (líneas 396–401) y luego `const wineStocks = await WineService.getWinesByBranch(branchToUse.id, ownerId);` (línea 429). |

**RLS aplicable:** `guests_can_view_public_stock` en `wine_branch_stock`:

```text
using ((branch_id IN (
  SELECT qr_tokens.branch_id FROM qr_tokens
  WHERE qr_tokens.type = 'guest'
    AND qr_tokens.expires_at > now()
    AND (qr_tokens.used = false OR qr_tokens.used IS NULL)
)))
```

Ese subquery se ejecuta con el rol del cliente (anon). Si anon ya no puede leer `qr_tokens`, el subquery devuelve 0 filas → la policy no permite ninguna fila de `wine_branch_stock` para anon.

**Conclusión:** En modo guest, la app hace SELECT a `wine_branch_stock` como anon; esa consulta **depende** de que anon pueda leer `qr_tokens` a través del subquery de la policy.

---

### 1.5 Otros usos de qr_tokens en cliente (no anon o no SELECT)

- **QrGenerationService.ts:** INSERT (admin_invite) y UPDATE (revoke) con policy “owner only”; listado con getUserQrTokens (owner). No dependen de `expires_at > now()` para anon.
- **QrTokenService.markQrAsUsed:** UPDATE por token; típicamente en flujo ya validado. Si la validación pasa por Edge, este path puede no usarse.
- **QrService.ts:** Contiene otra clase con operaciones sobre `qr_tokens`; la app usa **QrTokenService** (validateQrToken) y **QrGenerationService** (getUserQrTokens, createGuestQrToken, generateQrToken). QrService no está referenciado en QrProcessorScreen ni QrGenerationScreen en los flujos analizados.
- **AdminRegistrationScreen:** Además del SELECT a qr_tokens, puede llamar a RPC create_staff_user o a signUp + user-created; ambos backend usan privilegios elevados y no dependen de RLS para leer qr_tokens.

---

## 2. Simulación del cambio: “qr_tokens SELECT solo owner/staff” (sin OR expires_at)

Se supone: política SELECT en `qr_tokens` restringida a algo como `auth.uid() = owner_id` (y si se añade, staff del branch). Se **quita** `OR (expires_at > now())`.

### A) Flujo Staff invite (app)

| Paso | Request / operación | Rol cliente | ¿Falla? | Error / comportamiento |
|------|---------------------|-------------|---------|-------------------------|
| 1. Escanear QR staff | QrProcessorScreen → validateQrToken(token) | anon | **Sí** | SELECT qr_tokens: anon no tiene filas; `error` o `data` null. Usuario ve: **"Código QR no encontrado o inválido"**. No llega a AdminRegistration. |
| 2. (Alternativa: si ya validó antes) | AdminRegistrationScreen → SELECT qr_tokens para owner_id | anon o recién registrado | **Sí** | Mismo SELECT por token; anon no ve la fila. **Alert "Token QR inválido o expirado"**; no puede completar el flujo de registro con email ficticio. |
| 3. Backend (create_staff_user o user-created) | RPC / Edge con service_role o SECURITY DEFINER | - | No | Siguen leyendo qr_tokens con privilegios elevados. El fallo es solo en cliente. |

**Resumen Staff:** El primer paso que toca `qr_tokens` desde el cliente (validateQrToken o el SELECT en AdminRegistration) **falla con anon**. El usuario no puede validar el QR ni obtener owner_id en pantalla; el flujo staff en app se rompe hasta que la validación (y el owner_id) se obtengan por Edge/RPC.

---

### B) Flujo Guest (app)

| Paso | Request / operación | Rol cliente | ¿Falla? | Error / comportamiento |
|------|---------------------|-------------|---------|-------------------------|
| 1. Escanear QR guest | validateQrToken(token) | anon | **Sí** | SELECT qr_tokens: anon sin filas. Usuario ve: **"Código QR no encontrado o inválido"**. No llega a WineCatalog. |
| 2. (Si por algún camino llegara a WineCatalog) | WineService.getWinesByBranch(branchId, ownerId) | anon | **Sí** | SELECT wine_branch_stock; RLS guests_can_view_public_stock ejecuta subquery a qr_tokens; anon no puede leer qr_tokens → subquery vacío → **0 filas** en wine_branch_stock. Pantalla de menú vacía o error al cargar. |

**Resumen Guest (app):** Se rompen tanto la **validación** del QR como la **carga del menú** (stock). El usuario no pasa de QrProcessor o ve menú vacío.

---

### C) Flujo Guest (web – public-menu)

| Paso | Request / operación | Rol | ¿Falla? | Error / comportamiento |
|------|---------------------|-----|---------|-------------------------|
| 1. GET /functions/v1/public-menu?token=... | Edge public-menu | service_role (dentro de la Edge) | **No** | La Edge usa `createClient(..., serviceRoleKey)` y hace SELECT qr_tokens y wine_branch_stock sin RLS de anon. Respuesta 200 y JSON con branch + wines. |

**Resumen Guest (web):** No hay impacto. El menú web sigue funcionando igual.

---

## 3. Plan mínimo para no romper

### 3.1 Migrar validación a Edge resolve-qr (service_role)

- **Acción:** Añadir Edge Function (o RPC con SECURITY DEFINER) `resolve-qr` que reciba el token, con **service_role** lea `qr_tokens`, valide type/expires/uses, opcionalmente registre uso (UPDATE current_uses/used) y devuelva `{ valid, branch_id, owner_id, type, branch_name, ... }` o error.
- **Cliente:** En QrProcessorScreen (y donde haga falta) sustituir la llamada a `validateQrToken(token)` por `invoke('resolve-qr', { body: { token } })` (o RPC equivalente). No hacer más SELECT/UPDATE directos a `qr_tokens` desde el cliente para validar.
- **AdminRegistrationScreen:** Dejar de hacer SELECT a `qr_tokens` para obtener owner_id; obtener owner_id desde la respuesta de resolve-qr (guardada en estado/navegación) o que resolve-qr devuelva owner_id y el cliente lo use al generar el email ficticio. Así ningún flujo depende de que anon lea qr_tokens.

### 3.2 Guest en app: (a) Menú vía Edge vs (b) guest_sessions + RLS

**Recomendación: (a) Cargar menú guest en app vía Edge (public-menu o equivalente).**

- **Justificación (menor riesgo):**
  - **Ya existe** public-menu con service_role que devuelve branch + wines para un token guest válido; no hay que diseñar nueva API ni nuevas tablas.
  - **Cero cambio de RLS** en `wine_branch_stock`: se puede eliminar o restringir `guests_can_view_public_stock` para anon sin afectar este flujo, porque el cliente ya no haría SELECT a wine_branch_stock en modo guest; solo llamaría a la Edge con el token (o con un session_id/nonce devuelto por resolve-qr si se quiere no reenviar el token).
  - No introduce **guest_sessions**: menos tablas, menos políticas y menos superficie de error (no hay que acotar SELECT anon en guest_sessions ni coordinar TTL/cleanup).
  - En **Expo/React Native** es trivial: en WineCatalogScreen con `isGuest`, en lugar de `WineService.getWinesByBranch(branchId, ownerId)` se llama a `fetch(SUPABASE_URL/functions/v1/public-menu?token=...)` (o con token en memoria desde resolve-qr) y se pinta el menú con la respuesta. El token ya se validó en QrProcessor; se puede guardar en estado/contexto para la sesión de guest y usarlo solo para esta llamada.
- **Opción (b) guest_sessions + RLS** implica: nueva tabla, policy en wine_branch_stock que dependa de guest_sessions, y que anon pueda leer guest_sessions de forma acotada (p. ej. por session_id en header/cookie); más pasos y más riesgo de errores de policy o de fugas.

**Plan concreto para guest en app:**

- Tras validar con resolve-qr, guardar en estado/contexto (o en params de navegación): `token` (o un session_id si la Edge lo devuelve) y `branch_id` / `branch_name`.
- En WineCatalogScreen con `isGuest`: no llamar a `WineService.getWinesByBranch`. Llamar a la Edge public-menu (o a una Edge “get-menu” que reciba token o session_id) y usar la respuesta para rellenar la lista de vinos. Opcionalmente cachear en memoria para la sesión.
- Con esto, anon **nunca** hace SELECT a `wine_branch_stock` ni depende del subquery a `qr_tokens` en RLS.

---

## 4. Orden de despliegue más seguro

| Paso | Contenido | Compatibilidad con RLS actual | Objetivo |
|------|-----------|-------------------------------|----------|
| **1** | Cambios cliente + Edge (sin tocar RLS) | Compatible | Validación y menú guest dejan de depender de SELECT anon a qr_tokens y de wine_branch_stock para anon. |
| 1a | Desplegar Edge **resolve-qr** (service_role). | - | Validar token y devolver branch_id, owner_id, type, branch_name; opcionalmente marcar uso. |
| 1b | Cliente: QrProcessorScreen usa resolve-qr en lugar de validateQrToken; guardar en estado/params lo necesario (token o session_id, branch_id, owner_id, branch_name). | Sí | Validación ya no hace SELECT qr_tokens desde anon. |
| 1c | Cliente: AdminRegistrationScreen deja de hacer SELECT a qr_tokens; usa owner_id (y lo que haga falta) que viene de resolve-qr (estado/params). | Sí | Ningún SELECT anon a qr_tokens en este flujo. |
| 1d | Cliente: WineCatalogScreen en modo guest deja de llamar a WineService.getWinesByBranch; llama a public-menu (o Edge equivalente) con el token guardado y pinta menú con la respuesta. | Sí | Anon ya no hace SELECT a wine_branch_stock en guest. |
| **2** | Cambiar RLS en qr_tokens | Tras 1 | Anon deja de poder leer qr_tokens. |
| 2a | Ajustar policy SELECT de qr_tokens: quitar `OR (expires_at > now())`; dejar solo owner (y si aplica staff), p. ej. `auth.uid() = owner_id`. | - | Cierra el leak; validateQrToken/getUserQrTokens ya no dependen de anon (validación por Edge; listado es owner). |
| **3** | Limpiar policy wine_branch_stock si ya no se usa para anon | Tras 2 | Reducir superficie. |
| 3a | Si el menú guest en app se sirve 100% por Edge, anon ya no necesita SELECT a wine_branch_stock para guest. Eliminar o restringir la policy **guests_can_view_public_stock** (o limitarla a roles que sigan necesitándola, si los hay). | - | Evitar policy que dependa de qr_tokens para anon. |

**Regla:** No ejecutar paso 2 hasta que 1a–1d estén desplegados y validados en pruebas (staff + guest). Así, al endurecer qr_tokens, ningún flujo en producción depende de SELECT anon a qr_tokens ni del subquery en wine_branch_stock.

---

## 5. Archivos afectados (resumen)

| Archivo | Cambio previsto (solo plan) |
|---------|-----------------------------|
| **Nueva Edge** resolve-qr (o RPC equivalente) | Validar token con service_role; devolver branch_id, owner_id, type, branch_name; opcional UPDATE uso. |
| src/screens/QrProcessorScreen.tsx | Sustituir validateQrToken por invoke resolve-qr; guardar en estado/params resultado (token/session_id, branch_id, owner_id, branch_name). |
| src/screens/AdminRegistrationScreen.tsx | Dejar de hacer SELECT a qr_tokens; usar owner_id (y datos) procedentes de resolve-qr (params/estado). |
| src/screens/WineCatalogScreen.tsx | En isGuest: no llamar a WineService.getWinesByBranch; llamar a public-menu (o Edge) con token guardado y renderizar con la respuesta. |
| src/services/QrTokenService.ts | validateQrToken puede quedar deprecado para el flujo de escaneo (o usarse solo en contextos donde el cliente sea owner). No eliminar aún hasta asegurar que ningún path lo use para anon. |
| Migración RLS qr_tokens | Modificar policy SELECT: quitar `OR (expires_at > now())`. |
| Migración RLS wine_branch_stock | Eliminar o restringir guests_can_view_public_stock según uso real tras paso 1. |

---

## 6. Riesgos P0 / P1 / P2

| ID | Riesgo | Severidad | Mitigación |
|----|--------|-----------|------------|
| P0 | Cambiar RLS qr_tokens (paso 2) antes de desplegar cliente + Edge (paso 1) | Crítico: validación y menú guest en app dejan de funcionar | Orden estricto: 1 completo y verificado, luego 2. |
| P0 | Olvidar AdminRegistrationScreen: sigue haciendo SELECT qr_tokens | Crítico: flujo staff se rompe al abrir registro | Incluir 1c en el mismo release que 1b. |
| P1 | resolve-qr no marca “used” / current_uses para admin_invite | Tokens staff reutilizables (objetivo es 1 uso) | Implementar en resolve-qr el UPDATE de used/current_uses igual que hoy en validateQrToken. |
| P1 | WineCatalogScreen guest no recibe token o lo pierde entre QrProcessor y catalog | Menú guest vacío o error | Pasar token (o session_id) por params/contexto y usarlo solo para la llamada a public-menu. |
| P2 | public-menu rechaza por CORS o por formato de token | Menú web o app falla | Mantener contrato actual de public-menu (GET ?token= o POST body); en app usar el mismo token que ya validó resolve-qr. |
| P2 | getUserQrTokens deja de ver filas si la policy nueva excluye por error a owner | Owner no ve lista de QRs generados | Policy SELECT debe incluir al menos `auth.uid() = owner_id` para las filas que el owner creó. |

---

## 7. Checklist de pruebas (staff + guest)

Ejecutar **después de paso 1** (antes de cambiar RLS) y **después de paso 2** (tras cambiar RLS).

### Staff invite (app)

- [ ] Owner/gerente genera QR invitación admin (1 uso).
- [ ] Usuario anon escanea QR en app → debe validar correctamente (vía resolve-qr) y llegar a AdminRegistration con sucursal correcta.
- [ ] Completar registro (email ficticio, nombre, etc.) → usuario creado con owner_id/branch_id correctos; token marcado used.
- [ ] Re-escanear el mismo QR → mensaje “ya utilizado” o equivalente (resolve-qr devuelve error).
- [ ] Token expirado → mensaje “expirado” o “inválido” (resolve-qr rechaza).

### Guest (app)

- [ ] Owner genera QR comensales (guest).
- [ ] Usuario anon escanea QR guest en app → valida (resolve-qr) y redirige a WineCatalog.
- [ ] WineCatalog en modo guest carga menú (llamada a public-menu con token) → se muestran vinos y precios del branch correcto.
- [ ] No se hace SELECT directo a wine_branch_stock como anon (verificar en red/logger si aplica).

### Guest (web)

- [ ] GET …/public-menu?token=<token_guest_válido> → 200 y JSON branch + wines.
- [ ] Token guest expirado o inválido → 400/404 según contrato.

### Listado y revocación (owner)

- [ ] En QrGenerationScreen, “Mis QRs” carga la lista (getUserQrTokens) → el owner ve sus tokens.
- [ ] Revocar un token → al escanearlo, resolve-qr o validación devuelve error (expirado/inválido).

---

*Documento solo de análisis y plan; no se ha modificado SQL, RLS ni código en producción.*
