# Informe técnico: Visualizador web (guest) del menú de vinos por QR

**Objetivo:** Construir un repo web (Next.js) para que un comensal escanee un QR y vea el menú de vinos de una sucursal (multi-tenant, solo lectura).

---

## 1. Resumen ejecutivo (1 página)

### Flujo actual del QR end-to-end

| Fase | Quién | Qué pasa |
|------|--------|----------|
| **Generación (admin)** | Owner/manager en app RN | En `QrGenerationScreen`: elige tipo "Comensales", llama `generateQrToken({ type: 'guest', branchId, createdBy, ownerId, expiresInHours: 24, maxUses: 100 })` → insert en `qr_tokens`. Luego `generateUniversalQrUrl({ type, token, branchId, branchName })` genera la URL que se codifica en el QR. |
| **Contenido del QR** | - | **URL universal:** `https://cellarium-visualizador-web.vercel.app/qr?data=<encoded>` donde `data` es `encodeURIComponent(JSON.stringify({ type, token, branchId, branchName }))`. El QR **no** abre la app directamente; abre esa página web. |
| **Lectura (comensal)** | Comensal escanea QR | Abre el **navegador** en la URL de Vercel. La ruta `/qr` (App Router en el repo web) puede redirigir a la app vía deep link `cellarium://qr/<encodedData>` o mostrar contenido. Si abre la app: `QrProcessorScreen` recibe la URL por deep link o por `route.params` / `AsyncStorage` (si la web guardó datos y lanzó la app). |
| **Validación** | App (QrProcessorScreen) | Extrae `token` (string) del objeto decodificado y llama `validateQrToken(token)` en `QrTokenService`: SELECT en `qr_tokens` por `token`, join `branches`; comprueba `expires_at`, `used`, `current_uses` vs `max_uses`; insert en `qr_scans` e incrementa `current_uses` en `qr_tokens`. Si es tipo `guest` → `navigation.replace('WineCatalog', { isGuest: true, branchId: data.branchId })`. |
| **Catálogo (guest)** | WineCatalogScreen | Recibe `isGuest: true` y `branchId`. `activeBranch` en guest viene de `GuestContext.currentBranch` (en el código actual el GuestContext es **mock**; no se rellena con el branch de la validación). Para cargar vinos: obtiene `owner_id` de `branches` (SELECT por `branch_id`) y llama `WineService.getWinesByBranch(branchId, ownerId)`: query a `wine_branch_stock` con join a `wines` filtrado por `branch_id`, `wines.owner_id` y `stock_quantity >= 0`. Luego en batch consulta `wines_canonical` por label/winery para datos bilingües/sensoriales. |

### ¿El QR abre la app por deep link o se escanea dentro de la app?

- **Hoy:** El QR codifica una **URL web** (Vercel). El comensal **abre el enlace en el navegador**. La página web puede, opcionalmente, redirigir a la app con deep link `cellarium://qr/<encodedData>` (ver `QrProcessorScreen`: escucha `Linking.getInitialURL()` y `Linking.addEventListener('url', ...)` con `cellarium://qr`).
- **Dentro de la app:** No hay flujo “escanear QR con cámara” implementado para comensales. `QrScannerScreen` es un placeholder (solo texto “Escanear Código QR”); no hay uso de cámara ni navegación a QrProcessor con datos de QR.

### Información exacta en el QR

- **Formato:** URL con query: `https://cellarium-visualizador-web.vercel.app/qr?data=<encoded>`.
- **Payload (antes de encode):** Objeto JSON:
  - `type`: `'guest'` | `'admin'` (para invitación admin en el objeto se usa `'admin'` aunque en BD es `admin_invite`).
  - `token`: string (el valor de la columna `qr_tokens.token`).
  - `branchId`: UUID de la sucursal.
  - `branchName`: nombre de la sucursal (para mostrar).
- **Ejemplo de string final en el QR:**  
  `https://cellarium-visualizador-web.vercel.app/qr?data=%7B%22type%22%3A%22guest%22%2C%22token%22%3A%22Abc123xyz...%22%2C%22branchId%22%3A%22uuid-branch%22%2C%22branchName%22%3A%22Sucursal%20Centro%22%7D`

---

## 2. Archivos clave y responsabilidades

### Lista de archivos (ruta completa)

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/screens/QrGenerationScreen.tsx` | UI para elegir tipo (guest / admin_invite), llamar a `generateQrToken`, mostrar/listar QRs, compartir URL vía `generateUniversalQrUrl` y Share. |
| `src/screens/QrProcessorScreen.tsx` | Recibir datos del QR (route.params o AsyncStorage o deep link), extraer token, llamar `validateQrToken`, redirigir a WineCatalog (guest) o AdminRegistration (admin_invite). |
| `src/screens/QrScannerScreen.tsx` | Placeholder: solo texto “Escanear Código QR”; no genera token ni consulta. |
| `src/services/QrTokenService.ts` | `validateQrToken(token)`: SELECT qr_tokens + branches, comprobar expiración/uso, insert qr_scans, update current_uses; `generateUniversalQrUrl`, `generateDeepLink`; tipos `QrTokenData`, `QrValidationResult`. |
| `src/services/QrGenerationService.ts` | `generateQrToken(data)`: insert en `qr_tokens` (token vía RPC `generate_qr_token` o fallback random), `getUserQrTokens`, `revokeQrToken`, `getTokenScanStats`. |
| `src/contexts/GuestContext.tsx` | Estado de “sesión invitado” (session, currentBranch, qrToken); **actualmente mock**: no se alimenta con el resultado de `validateQrToken` ni con branch real. |
| `src/screens/WineCatalogScreen.tsx` | Si `route.params.isGuest` y `branchId`: usa `activeBranch` (guestBranch o currentBranch), obtiene `owner_id` de `branches` por branch id, carga vinos con `WineService.getWinesByBranch(branchId, ownerId)` y opcionalmente `wines_canonical`. |
| `src/services/WineService.ts` | `getWinesByBranch(branchId, ownerId)`: SELECT `wine_branch_stock` con join `wines`, filtros `branch_id`, `wines.owner_id`, `stock_quantity >= 0`. |
| `src/types/index.ts` | `RootStackParamList`: `WineCatalog: { branchId?: string; isGuest?: boolean }`, `QrProcessor: { qrData?: any; token?: string }`. |

### Otros archivos relacionados (búsqueda global)

- `src/screens/AdminRegistrationScreen.tsx`: usa `branchId`/`qrToken` para registro por QR admin.
- `src/screens/LoginScreen.tsx`: texto “Escanea el QR que te proporcionaron”.
- `src/contexts/BranchContext.tsx`: `currentBranch`, `setCurrentBranch`, carga de branches para owner/staff (no para guest).
- `src/contexts/AuthContext.tsx`: usuario; no crea sesión anónima para guest.
- `supabase/functions/user-created/index.ts`: referencia a `qr_tokens` en otro flujo.

**Resumen de responsabilidades:** Generar token = QrGenerationService + QrGenerationScreen. Persistir = insert en `qr_tokens` (y `qr_scans` en validación). Validar = QrTokenService.validateQrToken. Navegar = QrProcessorScreen (WineCatalog o AdminRegistration). Consultar menú = WineCatalogScreen + WineService.getWinesByBranch + branches (owner_id) + wines_canonical (batch).

---

## 3. Contrato de datos del QR

### Tablas involucradas

- **qr_tokens** (principal).
- **qr_scans** (registro de escaneos en validación).
- **branches** (join en validación y para owner_id en catálogo).

### Schema `qr_tokens` (from `supabase/migrations/20260207213838_remote_schema.sql`)

```sql
create table "public"."qr_tokens" (
    "id" uuid not null default gen_random_uuid(),
    "token" text not null,
    "type" text not null,                    -- 'guest' | 'admin_invite'
    "branch_id" uuid not null,
    "created_by" uuid not null,
    "created_at" timestamp with time zone default now(),
    "expires_at" timestamp with time zone not null,
    "used" boolean default false,
    "used_at" timestamp with time zone,
    "used_by" uuid,
    "max_uses" integer default 1,
    "current_uses" integer default 0,
    "owner_id" uuid
);
-- UNIQUE(qr_tokens.token), FK branch_id -> branches, created_by -> users, owner_id -> users
-- CHECK type IN ('guest', 'admin_invite')
```

- **PK:** `id` (uuid). **Token público:** columna `token` (text, único); es lo que va en el QR y se valida.
- **Expiración:** `expires_at` (obligatorio). **Revocación:** no hay columna “revoked”; se puede simular poniendo `expires_at` en el pasado o actualizando `current_uses`/`used`.
- **Tipo/scope:** `type`: `'guest'` (menú comensal) o `'admin_invite'` (invitación admin, un solo uso). No hay más tipos ni scopes adicionales.

### Ejemplo de payload que genera el QR (objeto antes de encode)

```json
{
  "type": "guest",
  "token": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "branchId": "550e8400-e29b-41d4-a716-446655440000",
  "branchName": "Sucursal Centro"
}
```

El string final en el QR es la URL con ese JSON codificado en `data=` (ej. anterior en §1).

---

## 4. Queries que usa el “guest” para ver el menú de vinos

### Orden lógico

1. **Validar token y obtener branch:**  
   `qr_tokens` filtrado por `token`, con join a `branches` (id, name, address). Condiciones: `expires_at > now()`, para `admin_invite` además `used = false`, y `current_uses < max_uses`.  
   De ahí se obtienen `branch_id`, `branch_name` (y en app también `owner_id` vía branch, ver abajo).

2. **Owner de la sucursal (para filtrar vinos):**  
   `branches` → `select('owner_id').eq('id', branch_id).single()`.

3. **Menú de vinos (stock + precios por sucursal):**  
   `WineService.getWinesByBranch(branchId, ownerId)` hace:

```ts
supabase
  .from('wine_branch_stock')
  .select(`
    id, wine_id, branch_id, stock_quantity, price_by_glass, price_by_bottle, created_at, updated_at,
    wines ( id, name, grape_variety, region, country, vintage, alcohol_content, description, image_url,
            body_level, sweetness_level, acidity_level, intensity_level, fizziness_level, type,
            food_pairings, serving_temperature, winery, created_at, updated_at, owner_id )
  `)
  .eq('branch_id', branchId)
  .eq('wines.owner_id', ownerId)
  .gte('stock_quantity', 0)
```

- **Tablas:** `wine_branch_stock` (stock y precios por sucursal) + `wines` (datos del vino por tenant).
- **Filtros:** `branch_id`, `wines.owner_id`, `stock_quantity >= 0`. No hay filtro explícito “is_active” en esta query; la disponibilidad se refleja en stock/precios.

4. **Datos canónicos (opcional, bilingüe/sensorial):**  
   Batch sobre `wines_canonical`: `select('abv, taste_profile, label, winery, grapes, region, country, serving').in('label', labels)` y/o `.in('winery', wineries)` para enriquecer nombre/etiqueta e idioma.

### Resumen de queries y filtros

| Query | Tabla(s) | Filtros |
|-------|----------|---------|
| Validar token | qr_tokens, branches | token = ?, expires_at > now(), (used = false si admin_invite), current_uses < max_uses |
| Owner de branch | branches | id = branch_id |
| Menú vinos | wine_branch_stock + wines | branch_id, wines.owner_id, stock_quantity >= 0 |
| Enriquecimiento | wines_canonical | label IN (...) o winery IN (...) |

Precios por sucursal: `price_by_glass`, `price_by_bottle` en `wine_branch_stock`. Disponibilidad: `stock_quantity`. Categorías/tipo: `wines.type` (red, white, rose, etc.); no hay tabla “secciones” en el esquema actual; la agrupación es por tipo o por lógica en front.

---

## 5. Seguridad / RLS relevante

### ¿El guest requiere auth o es anónimo?

- **App actual:** La validación del token y la carga del catálogo usan el **cliente Supabase de la app** (anon o authenticated según si el usuario inició sesión). No hay “sesión anónima” explícita para guest en Auth; GuestContext es mock.
- **RLS:** Con rol **anon**:
  - **qr_tokens:** La policy “Owners can view their qr_tokens” permite SELECT con `(auth.uid() = owner_id) OR (expires_at > now())`. Para anon, `auth.uid()` es null, así que solo aplica `expires_at > now()` → **anon puede leer filas de qr_tokens no expiradas** (permite validar token sin auth).
  - **branches:** “Users can view own branches” usa `auth.uid() = owner_id` o usuario con `branch_id`; **anon no puede leer branches**.
  - **wines:** “wines_select_owner_staff” usa `owner_id = auth.uid()` o staff; **anon no puede leer wines**.
  - **wine_branch_stock:** Hay policy SELECT que permite filas donde `branch_id IN (SELECT branch_id FROM qr_tokens WHERE type = 'guest' AND expires_at > now() AND (used = false OR used IS NULL))`. Es decir, **anon puede leer wine_branch_stock** de sucursales que tengan al menos un QR guest válido (no atado al token concreto). Las otras policies de wine_branch_stock son para authenticated (owner/staff).

Conclusión: **anon puede** validar token (qr_tokens) y leer stock por branch con QR guest válido, **pero no puede** leer `branches` ni `wines`. Como el menú requiere join `wine_branch_stock` + `wines`, un cliente solo anon **no** puede montar el menú completo desde el navegador sin más cambios.

### Políticas RLS citadas (resumen)

- **qr_tokens:** SELECT con `(auth.uid() = owner_id) OR (expires_at > now())`. INSERT/UPDATE/DELETE solo owner.
- **branches:** SELECT solo owner o usuario con `users.branch_id = branches.id` (authenticated).
- **wines:** SELECT solo owner o staff (owner_id = auth.uid() o users.owner_id).
- **wine_branch_stock:** SELECT para anon si `branch_id` está en qr_tokens guest válidos; INSERT/UPDATE/DELETE solo owner/staff.

### Edge Functions

- No existe en el repo ninguna Edge tipo `public-menu` o `get-menu-by-token`. Las funciones listadas son stripe, delete-user-account, user-created, etc. **Ninguna expone menú público por token.**

Por tanto, **el visor web necesita un backend** (Edge Function o API con service_role) que, dado el token, valide y devuelva branch + menú (o al menos que devuelva datos que anon no puede leer: branch + wines + stock).

---

## 6. Recomendación de arquitectura para el repo web

### Opción recomendada: **B) Backend que valida token y devuelve menú**

- **Razón:** RLS no permite a anon leer `branches` ni `wines`. Para no relajar RLS (evitar exponer datos de otros tenants), lo más seguro y simple es un **único endpoint** que con **service_role** (o un RPC con SECURITY DEFINER que valide token y devuelva solo lo necesario) valide el token y devuelva branch + vinos con precios/stock.
- **Alternativa A)** “Web llama a Edge Function pública `GET /public-menu?token=...`” es justo eso: la Edge sería pública en URL pero internamente usaría service_role (o RPC) para leer qr_tokens, branches, wine_branch_stock y wines; no hay que exponer anon a tablas sensibles.

Implementación mínima viable:

- **B/Edge:** Crear Supabase Edge Function, por ejemplo `public-menu`, invocable sin Bearer (o con anon key):
  - Query: `?token=<qr_tokens.token>`.
  - Con service_role (o RPC): 1) Validar token en `qr_tokens` (type guest, expires_at > now(), current_uses < max_uses); 2) Opcional: insert qr_scans, incrementar current_uses; 3) Leer branch por branch_id; 4) Leer owner_id del branch; 5) Leer wine_branch_stock + wines para ese branch_id y owner_id; 6) Devolver JSON.

**Variables de entorno (web + backend):**

- **Next.js (público):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (si se llama a la Edge desde cliente).
- **Edge (Supabase):** Ya tiene `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en el proyecto.
- **Solo si la Edge está en otra URL:** `NEXT_PUBLIC_MENU_API_URL` (ej. `https://<project>.supabase.co/functions/v1/public-menu`).

**Esquema JSON de respuesta recomendado para el web**

```json
{
  "branch": {
    "id": "uuid",
    "name": "string",
    "address": "string | null"
  },
  "wines": [
    {
      "id": "uuid",
      "name": "string",
      "grape_variety": "string | null",
      "region": "string | null",
      "country": "string | null",
      "vintage": "string | null",
      "type": "string",
      "description": "string | null",
      "image_url": "string | null",
      "winery": "string | null",
      "body_level": 1-5,
      "sweetness_level": 1-5,
      "stock_quantity": 0,
      "price_by_glass": "number | null",
      "price_by_bottle": "number | null"
    }
  ]
}
```

Secciones: el esquema actual no tiene tabla “secciones”; el front puede agrupar por `type` (red, white, rose, etc.) o por categoría derivada.

---

## 7. Paquete de información final

### 7.1 Diagrama textual del flujo QR actual

```
[Admin] QrGenerationScreen
    → generateQrToken({ type: 'guest', branchId, ownerId, ... })  → INSERT qr_tokens
    → generateUniversalQrUrl({ type, token, branchId, branchName })
    → QR contiene: https://cellarium-visualizador-web.vercel.app/qr?data=<JSON encoded>

[Comensal] Escanea QR
    → Navegador abre URL (Vercel /qr)
    → (Opcional) Redirección a app: cellarium://qr/<encoded>

[App] QrProcessorScreen (si abre la app)
    → Obtiene token de route/AsyncStorage/deep link
    → validateQrToken(token) → SELECT qr_tokens+branches, INSERT qr_scans, UPDATE current_uses
    → navigation.replace('WineCatalog', { isGuest: true, branchId })

[App] WineCatalogScreen (guest)
    → activeBranch vía GuestContext (mock) o branchId
    → SELECT branches.owner_id por branch_id
    → WineService.getWinesByBranch(branchId, ownerId) → wine_branch_stock + wines
    → (Opcional) wines_canonical batch para i18n/sensorial
```

### 7.2 Contrato exacto del token

- **Tipo:** String en columna `qr_tokens.token` (único, no el PK).
- **Formato:** Generado por RPC `generate_qr_token` o fallback 32 caracteres alfanuméricos + `-_`.
- **Ejemplo:** `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`.  
- **En el QR:** Objeto `{ type: 'guest', token: '<ese string>', branchId: uuid, branchName: string }` → `encodeURIComponent(JSON.stringify(...))` en `?data=`.

### 7.3 Queries y tablas para construir el menú

- Validar: `qr_tokens` (token, type, expires_at, used, current_uses, max_uses) + `branches` (id, name, address).
- Owner: `branches` (owner_id) por branch_id.
- Menú: `wine_branch_stock` (branch_id, wine_id, stock_quantity, price_by_glass, price_by_bottle) + `wines` (campos listados en §4).
- Opcional: `wines_canonical` (label, winery, abv, taste_profile, grapes, region, country, serving) para i18n/sensorial.

### 7.4 Políticas RLS relevantes y si permiten anon

| Tabla | Permite anon SELECT |
|-------|----------------------|
| qr_tokens | Sí (filas con expires_at > now()) |
| branches | No |
| wines | No |
| wine_branch_stock | Sí (solo branch_id con QR guest válido; no incluye datos de wines en políticas anon útiles para join) |

Para menú completo (branch + vinos con nombres/precios) hace falta backend con privilegios (service_role o RPC).

### 7.5 Endpoint mínimo para web + ejemplo request/response

- **Request:** `GET /functions/v1/public-menu?token=<qr_tokens.token>` (o POST body `{ "token": "..." }` si se prefiere).
- **Response (200):** JSON como en §6 (branch + wines con stock y precios).
- **Response (400/404):** `{ "error": "invalid_token" }` o `{ "error": "token_expired" }` sin filtrar datos internos.

Ejemplo de respuesta (recorte):

```json
{
  "branch": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Sucursal Centro",
    "address": "Av. Principal 123"
  },
  "wines": [
    {
      "id": "wine-uuid-1",
      "name": "Malbec Reserve",
      "grape_variety": "Malbec",
      "type": "red",
      "stock_quantity": 12,
      "price_by_glass": 4.50,
      "price_by_bottle": 28.00
    }
  ]
}
```

---

**Resumen para el nuevo repo Next.js:** Misma URL que hoy tiene el QR (`/qr?data=...`). En esa ruta (o una tipo `/menu?token=...` si se pasa solo token): 1) Decodificar `data` y extraer `token` (y opcionalmente branchId para cache); 2) Llamar a la Edge (o API) `public-menu?token=<token>`; 3) Renderizar branch + lista de vinos con precios/stock en solo lectura. No se requiere auth en el navegador; la seguridad queda en la validación del token en el backend y en no exponer RLS anon a branches/wines.
