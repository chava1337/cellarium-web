# Auditoría y repro: flujo QR Staff Invite (post fix P0)

**Objetivo:** Detectar por qué al escanear un QR de invitación staff NO abre la pantalla AdminRegistration.  
**Contexto:** Fix P0 ya aplicado (linking `qr/:qrData?` + fallback parse URL en QrProcessorScreen). Repo tiene carpeta `android/` (non-CNG).

---

## 1) Mapping y nombres confirmados

### RootStackParamList (src/types/index.ts)

- **QrProcessor:** `{ qrData?: any; token?: string }`
- **AdminRegistration:** `{ qrToken?: string; branchName?: string; branchId?: string }`

Nombres exactos de screens: `QrProcessor`, `AdminRegistration`.

### App.tsx (linking config)

- **QrProcessor:** `path: 'qr/:qrData?'` ✅
- **AdminRegistration:** `path: 'admin/register'` ✅

No hay error en nombres ni paths de linking.

---

## 2) Generación del QR staff

### Dónde se genera

| Archivo | Rol |
|---------|-----|
| **QrGenerationScreen.tsx** | Al generar admin invite llama `generateQrToken({ type: 'admin_invite', ... })`; el valor del componente `<QRCode value={...}>` es `generateUniversalQrUrl({ type: 'admin', token, branchId, branchName })`. |
| **QrGenerationService.ts** | `generateQrToken()` inserta en `qr_tokens` con `type: 'admin_invite'`. Devuelve `GeneratedQrToken` con type `'admin_invite'`. |
| **QrTokenService.ts** | `generateUniversalQrUrl(qrData)` y `generateDeepLink(qrData)` reciben `QrTokenData` con `type: 'guest' | 'admin'`. |

### JSON real que se codifica para staff

En **QrGenerationScreen** (líneas 157–162 y 424–429) se llama:

```ts
generateUniversalQrUrl({
  type: selectedQr.type === 'admin_invite' ? 'admin' : selectedQr.type,
  token: selectedQr.token,
  branchId: selectedQr.branchId,
  branchName: selectedQr.branchName,
})
```

- **Keys del payload:** `type`, `token`, `branchId`, `branchName`.
- **Valor de type en el JSON:** `'admin'` (no `'admin_invite'`). Coherente con la API de la web y con `validateQrToken`, que devuelve `type: 'admin'` cuando en BD es `admin_invite`.

### Qué se imprime en el QR

El componente `<QRCode value={...}>` usa **solo** `generateUniversalQrUrl(...)`, es decir la **URL web**:

- **Formato:** `https://cellarium-visualizador-web.vercel.app/qr?data=<ENCODED>`
- **ENCODED:** `encodeURIComponent(JSON.stringify({ type: 'admin', token, branchId, branchName }))`.

No se usa `generateDeepLink()` para el valor del QR; el deep link `cellarium://qr/<ENCODED>` solo se usaría si algo (p. ej. la web) redirige o enlaza a la app.

---

## 3) Recepción en la app (QrProcessorScreen)

### Punto donde se decide el destino

En **QrProcessorScreen.tsx** (aprox. líneas 185–204), tras `validateQrToken(tokenToValidate)`:

- Si `data.type === 'guest'` → `navigation.replace('WineCatalog', { isGuest: true, branchId })`.
- Si `data.type === 'admin' || data.type === 'admin_invite'` → `navigation.replace('AdminRegistration', { qrToken: data.token, branchName: data.branchName, branchId: data.branchId })`.

### Comparación de type

- **validateQrToken** (QrTokenService, línea 96): devuelve `type: qrToken.type === 'admin_invite' ? 'admin' : 'guest'`. Es decir, para staff siempre devuelve **`'admin'`**.
- **QrProcessorScreen** comprueba `data.type === 'admin' || data.type === 'admin_invite'`. Acepta ambos; no hay desalineación.

### Params a AdminRegistration

Se pasan exactamente: `qrToken: data.token`, `branchName: data.branchName`, `branchId: data.branchId` (los de `validation.data`). Correcto.

### Guards

No hay en QrProcessorScreen comprobación de usuario logueado que redirija antes de validar o navegar. El flujo no se corta por auth en esta pantalla.

---

## 4) Validación del token (backend / RLS)

### validateQrToken (QrTokenService.ts)

- **Tabla:** `qr_tokens` con join a `branches`.
- **Filtro:** `.eq('token', token)` y `.single()`.
- **Sesión:** Usa `supabase` del cliente (anon o authenticated). Para usuario que abre por QR sin sesión, es **anon**.
- **Devuelve:** `validation.data`: `type` ('admin'|'guest'), `token`, `branchId`, `branchName`; `validation.branch`: id, name, address.

### Posibles fallas

- **RLS SELECT qr_tokens:** Política "Owners can view their qr_tokens": `(auth.uid() = owner_id) OR (expires_at > now())`. Con anon, `auth.uid()` es null, así que solo aplica `expires_at > now()`. **Anon puede leer tokens no expirados.** No bloquea.
- **Token usado:** Si `type === 'admin_invite'` y `used === true`, devuelve error "Este código de invitación ya fue utilizado." Comportamiento esperado.
- **Expirado:** Si `expires_at < now()` devuelve error. Esperado.
- **Type en BD:** Es `'guest'` o `'admin_invite'`; el servicio lo traduce a `'admin'` en la respuesta. Sin conflicto.

---

## 5) Android intent-filter (crítico)

### Intent-filters actuales (android/app/src/main/AndroidManifest.xml)

```xml
<intent-filter>
  <action android:name="android.intent.action.MAIN"/>
  <category android:name="android.intent.category.LAUNCHER"/>
</intent-filter>
<intent-filter>
  <action android:name="android.intent.action.VIEW"/>
  <category android:name="android.intent.category.DEFAULT"/>
  <category android:name="android.intent.category.BROWSABLE"/>
  <data android:scheme="cellarium" android:host="auth-callback"/>
  <data android:scheme="exp+cellarium-wine-catalog"/>
</intent-filter>
<intent-filter android:autoVerify="true" data-generated="true">
  <action android:name="android.intent.action.VIEW"/>
  <data android:scheme="https" android:host="cellarium.app" android:pathPrefix="/qr"/>
  <data android:scheme="https" android:host="www.cellarium.app" android:pathPrefix="/qr"/>
  <category android:name="android.intent.category.BROWSABLE"/>
  <category android:name="android.intent.category.DEFAULT"/>
</intent-filter>
```

### ¿El manifest acepta `cellarium://qr/<anything>`?

- **No.** El único filter con `scheme="cellarium"` exige **`android:host="auth-callback"`**. La URL `cellarium://qr/ENCODED` tiene host **`qr`**, no `auth-callback`, por tanto **no hace match** con ese filter.
- Tampoco hay un filter con `scheme="cellarium"` sin host (que aceptaría cualquier `cellarium://...`).

### ¿Acepta `cellarium://` sin host?

- **No.** No existe ningún `<data android:scheme="cellarium"/>` sin host.

### Conclusión Android

En el estado actual del manifest, **Android no entrega a la app** el deep link `cellarium://qr/ENCODED`. El usuario puede quedarse en el navegador, ver “Abrir con…” sin la app, o que el sistema no ofrezca la app como manejadora. Por eso el flujo staff no llega a QrProcessor ni a AdminRegistration.

### app.config.js vs manifest

- **app.config.js** (líneas 89–93) define un intent filter con `data: [{ scheme: "cellarium" }]` (sin host). Si se generara el manifest con `npx expo prebuild`, ese filter debería aparecer.
- El repo **tiene carpeta android/** y el manifest actual **no** incluye ese filter; es **non-CNG** y el manifest no está sincronizado con app.config.js en la parte de `cellarium` genérico. Hace falta **prebuild** o **edición manual** del manifest.

---

## 6) Root cause (priorizado)

### P0 – Android no recibe el deep link `cellarium://qr/...`

- **Evidencia:** AndroidManifest solo declara `cellarium` con `host="auth-callback"`. No hay filter para `cellarium://qr/...` ni para `cellarium://` sin host.
- **Archivo:** `android/app/src/main/AndroidManifest.xml`, segundo intent-filter (líneas 26–31).
- **Efecto:** Al escanear el QR staff se abre la URL web; si la web (o el usuario) intenta abrir la app con `cellarium://qr/ENCODED`, Android no asocia esa URL a la app y el deep link no llega. La app nunca recibe la URL, no se monta QrProcessor con payload y no se navega a AdminRegistration.

### P1 – Flujo real: QR abre web, no la app

- El QR impreso es la **URL web**, no el deep link. Para que la app se abra hace falta que la web redirija o enlace a `cellarium://qr/ENCODED`. Si la web no hace eso para staff, el usuario se queda en el navegador aunque el manifest se corrija después.

### P2 – (Descartado) Type o params en app

- Type en payload es `'admin'`; validateQrToken devuelve `'admin'`; QrProcessorScreen acepta `'admin'` y `'admin_invite'`. Params a AdminRegistration son los correctos. No hay guard de auth que corte el flujo en QrProcessor.

---

## 7) Fix recomendado (diff exacto)

### 7.1 AndroidManifest.xml

Añadir un intent-filter que acepte `cellarium://qr/...` (o cualquier `cellarium://`). Opción recomendada: aceptar **scheme cellarium con host qr** para no interferir con `auth-callback`:

```diff
--- android/app/src/main/AndroidManifest.xml
+++ android/app/src/main/AndroidManifest.xml
@@ -29,6 +29,13 @@
         <data android:scheme="cellarium" android:host="auth-callback"/>
         <data android:scheme="exp+cellarium-wine-catalog"/>
       </intent-filter>
+      <intent-filter>
+        <action android:name="android.intent.action.VIEW"/>
+        <category android:name="android.intent.category.DEFAULT"/>
+        <category android:name="android.intent.category.BROWSABLE"/>
+        <data android:scheme="cellarium" android:host="qr"/>
+      </intent-filter>
       <intent-filter android:autoVerify="true" data-generated="true">
```

Alternativa (aceptar cualquier `cellarium://`):

```xml
<data android:scheme="cellarium"/>
```

(sin `android:host`) en un nuevo intent-filter con las mismas action y categories. La opción con `host="qr"` es más restrictiva y evita capturar otros posibles usos de `cellarium://` en el futuro.

### 7.2 App.tsx / QrProcessorScreen / validateQrToken

No se requieren cambios para este fallo. El linking, el parse del payload y la validación están alineados; el problema es solo que en Android la app no recibe la URL.

### 7.3 Sincronización non-CNG

- Repo **non-CNG** (existe `android/`). Para que futuros cambios de `app.config.js` (p. ej. intentFilters) se reflejen en el manifest hay que:
  - Ejecutar **`npx expo prebuild --platform android`** (y si aplica, volver a compilar el dev client / APK), o
  - Mantener el manifest a mano y aplicar el diff anterior (o el de scheme sin host) y hacer rebuild.

---

## 8) Instrumentación de logs (solo DEV) – propuesta

Solo propuesta; no aplicada.

| Dónde | Log propuesto |
|-------|----------------|
| **QrProcessorScreen** – al recibir URL (getInitialURL + event) | `if (__DEV__) console.log('[QrProcessor] URL received', url);` (URL completa; en prod no loguear). |
| **QrProcessorScreen** – al entrar a processQrCode | `if (__DEV__) console.log('[QrProcessor] route.params', JSON.stringify({ hasQrData: !!route.params?.qrData, hasToken: !!route.params?.token }));` |
| **QrProcessorScreen** – tras parse (params / URL / AsyncStorage) | `if (__DEV__) console.log('[QrProcessor] payload source', source, 'type', parsedType, 'tokenMask', maskToken(token));` (sin token completo). |
| **QrProcessorScreen** – tras validateQrToken | `if (__DEV__) console.log('[QrProcessor] validation', validation.valid, 'type', validation.data?.type, 'error', validation.error);` |
| **QrProcessorScreen** – antes de replace | `if (__DEV__) console.log('[QrProcessor] navigating to', screenName, { branchId, hasQrToken });` |

Con eso se puede confirmar en dispositivo: si la URL llega, si hay params, si el payload se parsea, si la validación pasa y a qué pantalla se navega.

---

## 9) Checklist de prueba

### Android

- [ ] Aplicar el diff del intent-filter (cellarium + host qr) en AndroidManifest.xml y hacer **rebuild del APK** (o dev client).
- [ ] Generar un QR staff en la app y obtener el `data=` de la URL web (o construir a mano el JSON: `{ "type": "admin", "token": "<token_real>", "branchId": "<uuid>", "branchName": "Sucursal" }` y codificarlo).
- [ ] Abrir manualmente en el dispositivo: `cellarium://qr/<ENCODED>` (p. ej. desde una nota con el enlace o desde el navegador escribiendo la URL). Comprobar que la app se abre, se muestra QrProcessor y luego **AdminRegistration** con la sucursal.
- [ ] Probar con encoded = JSON type guest y comprobar que va a **WineCatalog** (modo invitado).
- [ ] Comprobar que `cellarium://auth-callback` sigue abriendo la app para OAuth.

### iOS

- [ ] Misma prueba de abrir `cellarium://qr/<ENCODED>` manualmente (si el proyecto tiene soporte iOS) y verificar QrProcessor → AdminRegistration para staff y WineCatalog para guest.
- [ ] Verificar que el scheme `cellarium` está declarado en Info.plist / configuración Expo y que no hay conflicto con otros schemes.

### Web → App (cuando el manifest esté corregido)

- [ ] Escanear el QR staff (que abre la web). En la web, si existe botón/enlace “Abrir en la app” que use `cellarium://qr/<ENCODED>`, pulsarlo y confirmar que la app se abre y llega a AdminRegistration.

---

## 10) Resumen

- **Mapping, tipos, generación de payload y recepción en QrProcessorScreen** están correctos; type `'admin'`/`'admin_invite'` y params a AdminRegistration son los esperados.
- **RLS y validateQrToken** permiten validar el token en anon; no son la causa del fallo.
- **Causa principal:** En **Android**, el manifest **no** declara un intent-filter que acepte `cellarium://qr/...`, por lo que el sistema no entrega ese deep link a la app. Corregir añadiendo un intent-filter con `scheme="cellarium"` y `host="qr"` (o solo `scheme="cellarium"`) y volver a compilar.
- **Fix:** Aplicar el diff en **AndroidManifest.xml** (nuevo intent-filter para `cellarium` + host `qr`) y rebuild. No es necesario tocar App.tsx, QrProcessorScreen ni validateQrToken para este problema.
