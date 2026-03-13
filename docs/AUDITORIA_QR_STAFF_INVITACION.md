# Auditoría QR Staff (Invitación) — Cellarium (Expo / RN)

**Objetivo:** Detectar por qué el QR de invitación de staff ya NO abre la pantalla de creación de cuenta / solicitud de acceso (join branch). El QR de comensales funciona en su flujo; el de staff falla en navegación/deep link.

---

## 1C) Backend / token (contrato y validación)

### Contrato de datos staff-invite

- **qr_tokens:** id, token (único), type (`'admin_invite'`), branch_id, owner_id, created_by, expires_at, used, used_at, used_by, max_uses, current_uses.
- **Validaciones en app:** Expiración (`expires_at > now`), para admin_invite `used === false`, `current_uses < max_uses`. Luego se registra escaneo en qr_scans y se incrementa current_uses; si admin_invite se marca used.
- **AdminRegistration espera:** qrToken (string), branchId (uuid), branchName (string). Los obtiene de `validation.data` tras `validateQrToken(token)`.

### Dónde se valida el token

- En la **app**, en **QrProcessorScreen**: se llama a `validateQrToken(tokenToValidate)` (QrTokenService). Ese servicio hace SELECT a `qr_tokens` (con join a branches) con el token; la app usa cliente Supabase (anon si el usuario no está logueado). La validación ocurre **al procesar el QR** en QrProcessor, no al “abrir” la pantalla; si no llegan params ni URL, nunca se llama a validateQrToken.

### RLS y riesgos

- **qr_tokens:** Política de SELECT: `(auth.uid() = owner_id) OR (expires_at > now())`. Con anon, auth.uid() es null, así que solo aplica `expires_at > now()` → anon puede leer tokens no expirados. No bloquea el flujo.
- **create_staff_user / user-created:** Lógica de negocio y asignación de rol; no RLS sobre qr_tokens. Sin cambios necesarios para que el deep link funcione.

---

## 2.1 Mapa de archivos

| Archivo | Rol |
|---------|-----|
| **App.tsx** | Define `linking` (prefixes + config.screens). Path `QrProcessor: { path: 'qr' }`. No hay segmento `:qrData`. Navegación a QrProcessor/AdminRegistration vía linking. |
| **app.config.js** | `scheme: "cellarium"`. intentFilters: https (cellarium.app/qr) y `{ scheme: "cellarium" }` (sin host). |
| **android/app/src/main/AndroidManifest.xml** | Intent-filters nativos: `cellarium` con **host "auth-callback"** y `exp+cellarium-wine-catalog`; https cellarium.app/qr. **No hay** filter explícito para `cellarium://qr` (sin host o host qr). |
| **src/services/QrTokenService.ts** | `validateQrToken(token)`, `generateUniversalQrUrl()` (URL web), `generateDeepLink()` → `cellarium://qr/${encodedData}`. Tipo `QrTokenData`: type guest|admin, token, branchId, branchName. |
| **src/services/QrGenerationService.ts** | `createGuestQrToken()` (RPC), `generateQrToken()` para admin_invite (insert en qr_tokens). Payload: type, branchId, createdBy, ownerId, expires, maxUses. |
| **src/screens/QrGenerationScreen.tsx** | UI tipo guest/admin. Genera QR con `generateUniversalQrUrl({ type: admin|guest, token, branchId, branchName })`. Mismo helper para ambos tipos. |
| **src/screens/QrProcessorScreen.tsx** | Recibe deep link; lee **solo** `route.params?.qrData` y `route.params?.token` y AsyncStorage `qrData`. **No usa** la URL guardada en estado (`deepLinkUrl`). Si no hay params ni AsyncStorage → error "Código QR inválido". Luego valida token y navega a WineCatalog (guest) o AdminRegistration (staff). |
| **src/screens/AdminRegistrationScreen.tsx** | Pantalla objetivo del QR staff. Params: `qrToken`, `branchName`, `branchId`. Crea cuenta con RPC create_staff_user / Supabase Auth con user_metadata.invitationType = 'admin_invite'. |
| **src/types/index.ts** | `RootStackParamList`: QrProcessor: `{ qrData?: any; token?: string }`; AdminRegistration: `{ qrToken?: string; branchName?: string; branchId?: string }`. |
| **supabase/functions/public-menu/index.ts** | Solo guest: rechaza si `qrRow.type !== 'guest'`. No usado por staff. |
| **supabase/functions/user-created/index.ts** | Asigna role staff si qr_tokens token presente o invitationType === 'admin_invite'. |
| **supabase/migrations (qr_tokens, RLS)** | qr_tokens: token, type (guest|admin_invite), branch_id, owner_id, expires_at, used, max_uses, current_uses. RLS "Owners can view their qr_tokens": `(auth.uid() = owner_id) OR (expires_at > now())` → anon puede ver filas no expiradas. |

**Duplicados / dos lugares:** La “URL” del QR se construye en un solo lugar (`generateUniversalQrUrl` en QrTokenService). El deep link alternativo está en `generateDeepLink` (mismo servicio) pero el QR que se muestra/comparte usa la URL web (universal). No hay lógica duplicada de generación; el posible fallo está en recepción y parseo del deep link.

---

## 2.2 Estado actual

### URL que produce el QR staff (y guest)

- **En el código del QR (compartir / imagen):** Siempre la **URL web**:
  - `https://cellarium-visualizador-web.vercel.app/qr?data=<encoded>`
  - `<encoded> = encodeURIComponent(JSON.stringify({ type: 'admin'|'guest', token, branchId, branchName }))`.
- **Deep link (solo si algo redirige a la app):** `cellarium://qr/<encoded>` (mismo encoded). Generado por `generateDeepLink()` pero el QR impreso/compartido usa la URL web.

### Prefixes y scheme

- **Scheme (app.config.js):** `"cellarium"`.
- **Prefixes (App.tsx linking):** `['cellarium://', Linking.createURL('/'), 'https://cellarium.app', 'https://www.cellarium.app']`.

### Rutas con deep link mapping (App.tsx config)

- Login: `login`
- **QrProcessor: `qr`** (sin parámetro de path)
- WineCatalog: `catalog`
- AdminLogin: `admin/login`
- **AdminRegistration: `admin/register`**
- AdminDashboard: `admin/dashboard`
- UserManagement: `admin/users`
- TastingNotes: `admin/tasting`
- QrGeneration: `admin/qr`
- BranchManagement: `admin/branches`

### Pantalla que debe abrir el QR staff

- **Nombre exacto:** **AdminRegistration** (crear cuenta / solicitar acceso staff con token y branch).

### Flujo real del deep link (1)→(2)→(3)→(4)

1. **URL entra:** Usuario abre `cellarium://qr/ENCODED` (p. ej. desde web que redirige tras abrir el QR, o desde un QR que apunte directo a ese deep link).
2. **Linking parse:** NavigationContainer (useLinking) recibe la URL, hace match por prefix `cellarium://` y path `qr`. Config actual: **path es solo `qr`**, no `qr/:qrData`. En React Navigation 6 el segmento tras `qr/` **no** se asigna a ningún param por defecto cuando el path es `qr`.
3. **Ruta:** Se navega a **QrProcessor** con **params vacíos** (no se pasa ENCODED como `qrData`).
4. **Pantalla:** QrProcessor monta; `processQrCode()` lee `route.params?.qrData` y `route.params?.token` → vacíos; luego AsyncStorage `qrData` → en flujo “abre app desde link” no lo escribe nadie → falla con “Código QR inválido”.

Además, en **Android**, el AndroidManifest actual solo declara:

- `cellarium` con **host "auth-callback"**
- `exp+cellarium-wine-catalog`
- `https` cellarium.app y www.cellarium.app con pathPrefix `/qr`

No hay un intent-filter que acepte **cellarium sin host** o **cellarium con host qr**. En app.config.js sí existe `{ scheme: "cellarium" }` (sin host); si el build nativo se generó con una versión anterior o sin ese filter, **cellarium://qr/...** podría no abrir la app en absoluto.

---

## 2.3 Root cause probable

### P0 – Parámetros del deep link no llegan a QrProcessor

- **Evidencia:** App.tsx tiene `QrProcessor: { path: 'qr' }` sin segmento param. La URL es `cellarium://qr/ENCODED`; el segundo segmento (ENCODED) no se mapea a `route.params`.
- **Archivo:** `App.tsx` (linking config).
- **Snippet:**
  ```ts
  QrProcessor: {
    path: 'qr',
  },
  ```
- **Explicación:** Con path `qr`, React Navigation no inyecta el resto del path como param. Debería ser algo como `path: 'qr/:qrData'` (o el nombre que use el tipo) para que `ENCODED` llegue como `params.qrData`.

### P0 – QrProcessor no usa la URL del deep link cuando params están vacíos

- **Evidencia:** En QrProcessorScreen se hace `setDeepLinkUrl(url)` con `getInitialURL` y `addEventListener('url')`, pero **processQrCode()** solo usa `route.params` y AsyncStorage; nunca lee `deepLinkUrl` para extraer el payload de la URL.
- **Archivo:** `src/screens/QrProcessorScreen.tsx`.
- **Snippet:** Líneas 61–89: obtiene `qrData`/`token` de params o AsyncStorage; si no hay, error. No hay `else { parse deepLinkUrl }`.
- **Explicación:** Aun si el SO entrega bien la URL, el payload está en la ruta (path); si el linking no lo pasa como param, la única forma de recuperarlo es parsear la URL en QrProcessor y extraer el segmento después de `cellarium://qr/`.

### P1 – Android: intent-filter para cellarium://qr

- **Evidencia:** AndroidManifest tiene `cellarium` solo con `android:host="auth-callback"` (y exp+ en el mismo filter). No hay filter para `cellarium://qr` o `cellarium` sin host.
- **Archivo:** `android/app/src/main/AndroidManifest.xml`.
- **Snippet:**
  ```xml
  <data android:scheme="cellarium" android:host="auth-callback"/>
  ```
- **Explicación:** Si el usuario abre un enlace `cellarium://qr/...`, Android podría no entregarlo a la app si no hay un data que coincida (scheme + host opcional). app.config.js tiene `{ scheme: "cellarium" }`; hace falta que el build nativo refleje un filter que acepte `cellarium` sin host o con host `qr`.

### P2 – RLS qr_tokens para anon

- **Evidencia:** Política "Owners can view their qr_tokens": `(auth.uid() = owner_id) OR (expires_at > now())`. Con anon, `auth.uid()` es null; la segunda condición permite SELECT en filas no expiradas.
- **Archivo:** supabase/migrations (remote_schema).
- **Explicación:** Anon puede leer tokens no expirados; no es bloqueante para validar el token desde la app sin sesión. Solo mencionar por si en otro entorno la política fuera más restrictiva.

---

## 2.4 Plan de corrección

### Plan A – Mínimo (hacer que abra la pantalla)

1. **Pasar el payload por path (recomendado):**
   - En **App.tsx**, cambiar el path de QrProcessor para incluir el segmento opcional:
     ```ts
     QrProcessor: {
       path: 'qr/:qrData?',  // o 'qr/:qrData' si siempre viene
     },
     ```
   - Así, `cellarium://qr/ENCODED` rellena `route.params.qrData` con `ENCODED`. En QrProcessor, si `qrData` viene como string (encoded), decodear: `JSON.parse(decodeURIComponent(qrData))` y usar el objeto (o extraer `token`) para validar y navegar a AdminRegistration.

2. **Fallback en QrProcessor usando la URL:**
   - En **QrProcessorScreen**, cuando `!qrData && !token` y hay `deepLinkUrl` (o la URL inicial de Linking), parsear la URL:
     - Match `cellarium://qr/(.+)` o similar y extraer el segmento.
     - `decodeURIComponent(segment)` → string; si es JSON, `JSON.parse` → objeto; usar `token` (o el objeto) para validar.
   - Así, aunque el linking no inyecte el param, la pantalla sigue funcionando si el SO entrega la URL.

3. **Android:**
   - Asegurar que exista un intent-filter que acepte `cellarium` para cualquier path (o al menos `qr`). En app.config.js ya está `{ scheme: "cellarium" }`; regenerar android con `npx expo prebuild --platform android` o añadir a mano en AndroidManifest:
     ```xml
     <data android:scheme="cellarium" android:host="qr"/>
     ```
     (o un filter solo con `scheme="cellarium"` sin host, según documentación de Expo.)

### Plan B – Robusto

- Todo lo de Plan A, más:
  - **Sin app instalada:** Mantener QR con URL web; en la web, si detecta staff (`data.type === 'admin'`), mostrar CTA “Abrir en la app” con `cellarium://qr/...` y enlace a Play Store / App Store. Opcional: deferred deep link (Firebase / Branch, etc.) para abrir con el mismo token tras instalar.
  - **Validación de token:** Ya se hace en QrProcessor con `validateQrToken`. Opcional: en la web, antes de redirigir a la app, llamar a un endpoint que compruebe el token y devuelva branchName/branchId para mostrar “Serás agregado a [sucursal]” y luego abrir `cellarium://qr/...`.

### Diffs sugeridos (no aplicados)

**App.tsx (linking):**
```diff
-      QrProcessor: {
-        path: 'qr',
-      },
+      QrProcessor: {
+        path: 'qr/:qrData?',
+      },
```

**QrProcessorScreen.tsx (fallback desde URL):** Después de intentar AsyncStorage y antes de `if (!qrData && !token) { setStatus('error')... }`, añadir:
```ts
if (!qrData && !token && deepLinkUrl) {
  const match = deepLinkUrl.match(/cellarium:\/\/qr\/(.+)/);
  if (match && match[1]) {
    try {
      const decoded = decodeURIComponent(match[1]);
      qrData = decoded.startsWith('{') ? JSON.parse(decoded) : { token: decoded };
    } catch (e) {
      token = decodeURIComponent(match[1]);
    }
  }
}
```
Y asegurar que `processQrCode` se ejecute cuando `deepLinkUrl` se actualice (p. ej. dependencia en useEffect o re-ejecutar cuando `deepLinkUrl` pase a tener valor).

**Android (app.config.js o AndroidManifest):** Añadir data para qr:
- En app.config.js, en intentFilters, en el objeto que tiene `data: [{ scheme: "cellarium" }]`, asegurar que no exija host, o añadir un filter adicional con `host: "qr"` si se quiere ser explícito. Si el manifest se genera con Expo, prebuild debe incluir el scheme cellarium sin host; si no, añadir en AndroidManifest un `<data android:scheme="cellarium" android:host="qr"/>` en un intent-filter VIEW/BROWSABLE/DEFAULT.

---

## Repro checklist (pasos concretos)

1. Generar un QR staff en la app (Admin → Generación QR → “Invitación para nuevo staff”).
2. El QR contiene la URL: `https://cellarium-visualizador-web.vercel.app/qr?data=...` (ver en “Copiar link” o compartir).
3. Para probar **solo deep link** (sin web): construir a mano la URL `cellarium://qr/<encoded>` donde `<encoded>` es el mismo valor que en `?data=`. Abrirla en el dispositivo (ej. desde otra app o nota con link).
4. **Esperado:** App abre y muestra QrProcessor y luego AdminRegistration.
5. **Actual (fallo):** App puede no abrir (Android si no hay intent para cellarium://qr), o abre QrProcessor y muestra “Código QR inválido” (params vacíos y no se usa la URL).
6. **Logs en Metro:** Buscar `🔍 QrProcessor - Parámetros recibidos:` → si sale `{ qrData: undefined, token: undefined }` y luego `❌ QrProcessor - No hay datos del QR`, confirma que los params no llegan y que no se está usando la URL.

**Dónde instrumentar (sugerido):**
- En el handler de `Linking.addEventListener('url', ...)` y en `getInitialURL`: log de la URL completa recibida.
- Al resolver la ruta (si se puede en el contenedor de navegación o en Bootstrap): log de la ruta y params con los que se monta QrProcessor.
- Al montar QrProcessor: log de `route.params` y de `deepLinkUrl` (estado) en el primer render y tras el timeout que llama a `processQrCode`.

---

## Diferencia con QR guest (que sí funciona)

- **Misma URL generada:** Tanto guest como staff usan `generateUniversalQrUrl` → misma forma `https://cellarium-visualizador-web.vercel.app/qr?data=...`; el contenido de `data` cambia (`type: 'guest'` vs `type: 'admin'`).
- **Mismo deep link:** `cellarium://qr/<encoded>`; el objeto dentro tiene `type` distinto.
- **Mismo handler y ruta:** QrProcessor para ambos; la diferencia está después de validar: guest → WineCatalog, staff → AdminRegistration.
- **Por qué guest “funciona” y staff no:** Si el comensal suele **quedarse en la web** (menú en el visualizador), nunca se usa el deep link a la app; el “flujo que funciona” es web. Para staff, el flujo esperado es **abrir la app** y llegar a AdminRegistration; ahí se depende del deep link y de que los params (o la URL parseada) lleguen a QrProcessor. Si el deep link no entrega params y QrProcessor no usa la URL, staff siempre falla. No hay colisión de path; hay **falta de entrega/uso del payload** en el path.

---

## 4) Datos obligatorios del repo

- **Scheme actual (de config):** `cellarium`
- **Lista de prefixes del linking config:** `['cellarium://', Linking.createURL('/'), 'https://cellarium.app', 'https://www.cellarium.app']`
- **Rutas (screens) con deep link mapping:** Login (`login`), **QrProcessor (`qr`)**, WineCatalog (`catalog`), AdminLogin (`admin/login`), **AdminRegistration (`admin/register`)**, AdminDashboard (`admin/dashboard`), UserManagement (`admin/users`), TastingNotes (`admin/tasting`), QrGeneration (`admin/qr`), BranchManagement (`admin/branches`)
- **Ejemplo URL generada por QR staff (string exacto):**
  - Web (la que va en el QR):  
    `https://cellarium-visualizador-web.vercel.app/qr?data=%7B%22type%22%3A%22admin%22%2C%22token%22%3A%22ABC123...%22%2C%22branchId%22%3A%22uuid-branch%22%2C%22branchName%22%3A%22Sucursal%20Centro%22%7D`
  - Deep link (si algo redirige a la app):  
    `cellarium://qr/%7B%22type%22%3A%22admin%22%2C%22token%22%3A%22ABC123...%22%2C%22branchId%22%3A%22uuid-branch%22%2C%22branchName%22%3A%22Sucursal%20Centro%22%7D`
- **Ejemplo URL generada por QR guest:** Misma forma, con `type: 'guest'` en el JSON dentro de `data`.
- **Nombre exacto del screen que debe abrir el QR staff:** **AdminRegistration**
