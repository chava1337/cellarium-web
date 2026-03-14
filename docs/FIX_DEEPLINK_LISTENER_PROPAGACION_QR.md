# Fix: propagación deep link QR desde listener global a QrProcessor

## Causa raíz confirmada (logs en development build)

- **Linking.addEventListener('url')** en App recibe la URL real: `https://www.cellarium.net/qr?data=...`
- **QrProcessor** entra con **route.params vacíos** porque en dev-client la pantalla que se monta viene del estado de navegación inicial (Bootstrap → Welcome/AppAuth), no del intent con la URL del QR.
- **getInitialURL()** en dev-client devuelve la URL del expo development client (`exp+cellarium-wine-catalog://expo-development-client/?url=...`), no la URL del QR.
- **deepLinkUrlRef** en QrProcessor queda null porque solo se rellena con getInitialURL() o con el listener **dentro de QrProcessor**, que no está montado cuando el usuario aún está en Welcome/otra pantalla.
- Conclusión: el listener global solo logueaba; no parseaba ni navegaba. La URL del QR nunca se propagaba a QrProcessor con params.

## Dónde se registraba el listener y qué hacía

| Ubicación | Comportamiento anterior |
|-----------|-------------------------|
| **App.tsx** | `Linking.addEventListener('url', (event) => { console.log('[DEEPLINK RECEIVED]', event.url); })` solo en __DEV__. No parseaba, no navegaba, no guardaba la URL en estado/ref global. |

## Diff mínimo aplicado

**App.tsx**

1. **Imports:** `useNavigationContainerRef` desde `@react-navigation/native`, `parseQrLink` desde `./src/utils/parseQrLink`.
2. **Ref de navegación:** `const navigationRef = useNavigationContainerRef<RootStackParamList>();` y `ref={navigationRef}` en `NavigationContainer`.
3. **Listener global (siempre activo):**
   - Al recibir `event.url`: se llama `parseQrLink(url)`.
   - Si el resultado es un payload QR válido (`qrData` o `token`): se construyen params igual que en Bootstrap (`qrData` o `token`).
   - Si `navigationRef.isReady()`, se hace `navigationRef.reset({ index: 0, routes: [{ name: 'QrProcessor', params }] })`.
   - Con esto, QrProcessor se monta con **route.params** ya resueltos (qrData o token), sin depender de getInitialURL() en este caso.
4. **Logs (solo __DEV__):** listener recibió URL, resultado de parseQrLink, “navegación a QrProcessor desde listener” y keys de params; mount/remove del listener; initial URL.

**Sin cambios:** Bootstrap y QrProcessor siguen usando getInitialURL() como fallback para cold start real. QrProcessor no requiere cambios; sigue funcionando con route.params cuando el listener hace el reset.

## Explicación breve

En dev-client, la URL del QR llega por el evento `url` de Linking, pero getInitialURL() devuelve la URL del dev client. El listener global ahora parsea esa URL con parseQrLink y, si es un link QR válido, hace reset al root con la pantalla QrProcessor y los params correctos (qrData o token). Así la fuente principal cuando la app ya está abierta o cuando el dev-client recibe el enlace después del arranque es el listener; getInitialURL() sigue como fallback para cold start en producción.

## Checklist de prueba

### Development build (dev-client)

1. Abrir la app (dev client) y dejar en Welcome o cualquier pantalla.
2. Abrir desde otro dispositivo/navegador el enlace QR real: `https://www.cellarium.net/qr?data=...` (o el que uses).
3. En el dispositivo con la app, abrir ese enlace (por ejemplo “Abrir con Cellarium” o el intent que use el SO).
4. Ver en consola: `[DEEPLINK] listener recibió URL`, `parseQrLink(result)` con hasQrData/hasToken, `navegación a QrProcessor desde listener, params: ['qrData']` o `['token']`.
5. Comprobar que la pantalla actual pasa a **QrProcessor** con el flujo resuelto (sin “sin payload”).
6. Comprobar que QrProcessor muestra overlay/pasos correctos y, si aplica, navega a WineCatalog o AdminRegistration.

### Preview / producción (build sin dev client)

1. Cold start: abrir la app desde el enlace QR (getInitialURL con la URL del QR). Comprobar que Bootstrap o el flujo inicial llevan a QrProcessor con params (comportamiento actual).
2. Con la app en segundo plano: abrir de nuevo el enlace QR. Comprobar que el listener recibe la URL y que se hace reset a QrProcessor con params y el flujo completa correctamente.

### Regresión

- Abrir un deep link que **no** sea QR (por ejemplo Stripe return, auth callback). Comprobar que no se hace reset a QrProcessor (parseQrLink devuelve null para esas URLs).

---

## Fix 2: Pending QR payload (params no llegan en dev client)

### Nueva causa raíz confirmada

- El listener global **sí** recibe la URL QR y **sí** hace reset a QrProcessor con params.
- **QrProcessor sigue montando con route.params vacíos** en dev client: la propagación vía React Navigation params no es fiable en este flujo.
- getInitialURL() sigue devolviendo la URL del expo dev client; deepLinkUrlRef sigue null. Resultado: "sin payload".

### Mecanismo: almacenamiento temporal independiente de params

Se desacopla el transporte listener → QrProcessor usando un módulo de **pending payload** en memoria:

| API | Uso |
|-----|-----|
| `setPendingQrPayload({ rawUrl, qrData?, token? })` | Listener en App: guarda antes de reset. |
| `consumePendingQrPayload()` | QrProcessor: obtiene y borra en una llamada (evita doble uso). |
| `getPendingQrPayload()` / `clearPendingQrPayload()` | Lectura/limpieza si se necesita. |

### Diff mínimo (Fix 2)

1. **Nuevo:** `src/utils/pendingQrPayload.ts`  
   - Tipo `PendingQrPayload`: `rawUrl?`, `qrData?`, `token?`, `timestamp`.  
   - `setPendingQrPayload`, `getPendingQrPayload`, `consumePendingQrPayload`, `clearPendingQrPayload`.

2. **App.tsx**  
   - Antes de `navigationRef.reset(...)`: `setPendingQrPayload({ rawUrl: url, qrData: payload.qrData, token: payload.token })`.  
   - Log __DEV__: "payload guardado en pendingQrPayload".

3. **QrProcessorScreen.tsx**  
   - Tras usar route.params (bloque A), si sigue sin payload: `consumePendingQrPayload()`.  
   - Si hay resultado: usar `qrData`/`token` (misma normalización que params), opcionalmente `rawUrl` en deepLinkUrlRef; `setDebug({ source: 'pendingPayload' })`.  
   - Orden de fuentes: **route.params → pendingPayload → URL/getInitialURL → retry getInitialURL → AsyncStorage**.  
   - Logs __DEV__: "route.params vacíos, consumePendingQrPayload", "fuente final: route.params | pendingPayload | URL fallback | retryInitialURL | none".

### Explicación breve

En dev client, aunque el listener haga reset con params, QrProcessor puede montar con params vacíos. Al guardar el payload en un módulo en memoria antes del reset y consumirlo al inicio de processQrCode, QrProcessor obtiene el payload de forma fiable sin depender del comportamiento de React Navigation. Un solo consumo y borrado evita doble procesamiento. getInitialURL() se mantiene como fallback final (cold start / producción).

### Checklist de prueba (Fix 2)

**Dev client**

1. Abrir enlace QR con la app abierta (Welcome u otra pantalla).
2. Consola: `[DEEPLINK] payload guardado en pendingQrPayload`, `reset a QrProcessor disparado`.
3. QrProcessor: consola `[QrProcessor] route.params vacíos, consumePendingQrPayload` con hasQrData/hasToken, luego `fuente final: pendingPayload`.
4. Overlay/pantalla: flujo completo sin "sin payload"; si aplica, navegación a WineCatalog o AdminRegistration.

**Preview build**

1. Cold start desde enlace QR: puede usar getInitialURL (Bootstrap) o params si el SO los inyecta; no debe depender de pending.
2. App en segundo plano, abrir enlace QR: listener guarda pending y reset; QrProcessor puede recibir params o consumir pending; en ambos casos el flujo debe completarse.
3. Regresión: deep link no-QR no debe escribir pending ni llevar a QrProcessor.
