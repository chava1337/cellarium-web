# QR Staff Invite — Deep link fix y checklist

## Resumen del problema

En Android, al tocar "Open in app" desde la web (staff invite), se abría la pantalla del **Development Build launcher** (conectar a Metro) en lugar de la app con QrProcessor → AdminRegistration.

## Causas abordadas

1. **Prefijo sin triple slash:** React Navigation solo tenía `cellarium://`. Si la web abre `cellarium:///qr/<encoded>` (triple slash), el path puede no coincidir bien. Se añadió el prefijo `cellarium:///`.
2. **Android no aceptaba triple slash:** Con `cellarium:///qr/xxx` el host en Android queda vacío; el intent-filter con `host="qr"` no hacía match. Se añadió un intent-filter con solo `scheme="cellarium"` (sin host) para aceptar cualquier URI cellarium, incluido triple slash.
3. **Cold start y launcher:** Con dev client, al abrir la app por deep link a veces se muestra primero la UI nativa (launcher). La ruta inicial la decide Bootstrap; si no se mira la URL inicial, se iba a Welcome/AppAuth. **BootstrapScreen** ahora comprueba `getInitialURL()` y, si es un enlace cellarium qr, hace `reset` a **QrProcessor** con `params.qrData` (encoded), de modo que el payload llegue aunque el linking no haya inyectado params al inicio.

## Cambios aplicados

### App.tsx
- **Prefixes:** Se añade `'cellarium:///'` para reconocer URLs con triple slash.
- **Log __DEV__:** `useEffect` que hace `Linking.getInitialURL()` y en __DEV__ loguea la URL inicial.

### android/app/src/main/AndroidManifest.xml
- **Nuevo intent-filter:** `VIEW` / `DEFAULT` / `BROWSABLE` con `<data android:scheme="cellarium"/>` (sin host), para aceptar `cellarium:///qr/...` y cualquier otro `cellarium://...`.
- Se mantienen: `cellarium` + `host="auth-callback"`, `exp+cellarium-wine-catalog`, `cellarium` + `host="qr"`, y los `https` de cellarium.app.

### BootstrapScreen.tsx
- **Helper:** `getQrEncodedFromUrl(url)` — extrae el segmento encoded de `cellarium://qr/...` o `cellarium:///qr/...`.
- **Flujo:** Cuando `!loading`, antes de ir a AppAuth/Welcome se llama a `Linking.getInitialURL()`. Si el resultado es un enlace qr cellarium, se hace `navigation.reset({ routes: [{ name: 'QrProcessor', params: { qrData: encoded } }] })`. Así, al abrir la app por deep link (incluido desde el launcher del dev client), se termina en QrProcessor con el payload.

### QrProcessorScreen.tsx (sin cambios)
- Ya soporta: `cellarium://qr/<encoded>`, `cellarium:///qr/<encoded>` y `https://...?data=<encoded>` en `extractQrPayloadFromUrl`.
- Obtiene payload de `route.params`, URL (ref + getInitialURL) y AsyncStorage; `processedRef` evita procesar dos veces.

---

## Formato de URL recomendado para la web (repo visualizador)

Para el botón "Abrir en app" en la página Staff Invite del visualizador web:

- **Recomendado (dos slashes):**  
  `cellarium://qr/<encoded>`  
  Ejemplo: `cellarium://qr/%7B%22type%22%3A%22admin%22%2C%22token%22%3A%22...%22%2C%22branchId%22%3A%22...%22%2C%22branchName%22%3A%22...%22%7D`

- **También soportado (triple slash):**  
  `cellarium:///qr/<encoded>`  
  La app acepta ambos gracias al prefijo `cellarium:///` y al intent-filter sin host.

- **encoded:**  
  `encodeURIComponent(JSON.stringify({ type: 'admin', token, branchId, branchName }))`  
  (mismo objeto que en `?data=` de la URL universal).

Requisito para el repo web: usar al menos uno de los dos formatos anteriores; preferible **cellarium://qr/<encoded>** (dos slashes) por compatibilidad y porque en Android el host `qr` queda explícito.

---

## Checklist de prueba (Android físico)

1. **Recompilar e instalar**
   - Ejecutar `npx expo run:android` (o `eas build --profile development --platform android` e instalar el APK).
   - Asegurarse de que Metro esté en marcha y la app conectada si usas dev client.

2. **Limpiar asociaciones (opcional)**
   - Ajustes → Aplicaciones → Cellarium → Abrir por defecto / Enlaces compatibles.
   - Si hay varias opciones para “cellarium”, quitar por defecto y volver a probar para que pregunte con qué app abrir.

3. **Abrir enlace manual desde Chrome**
   - En Chrome en el dispositivo, escribir o pegar:  
     `cellarium://qr/<encoded>`  
     (sustituir `<encoded>` por el valor real, p. ej. el mismo que en la URL web `?data=`).
   - Comprobar que se abre la app Cellarium (no solo el launcher) y que se muestra QrProcessor y luego AdminRegistration (para payload con `type: 'admin'`).

4. **Escanear QR staff y tocar "Open in app"**
   - Generar un QR staff en la app (Generación QR → Invitación staff).
   - Abrir la URL del QR en el navegador (o escanear con la cámara y abrir el enlace).
   - En la página Staff Invite del visualizador, tocar "Abrir en app" (o el enlace que use `cellarium://qr/...` o `cellarium:///qr/...`).
   - Comprobar que se abre la app y se llega a QrProcessor y después a AdminRegistration.

5. **No romper auth-callback**
   - Probar el flujo de login con OAuth que redirige a `cellarium://auth-callback`.
   - Comprobar que la app se abre y completa el login.

6. **No romper dev client**
   - Si usas dev client, abrir la app desde el launcher (conectar a Metro) y, en otra prueba, abrir `exp+cellarium-wine-catalog://...` si aplica; confirmar que sigue funcionando.

---

## Diagnóstico si sigue fallando

- En __DEV__, revisar en Metro:
  - `[App] initial URL (deep link)` — confirma que la app recibe la URL.
  - `[Bootstrap] initial URL is QR link, redirecting to QrProcessor` — confirma que Bootstrap redirige.
  - `[QrProcessor] route.params` / `parsed from URL` — confirma que llega el payload.
- Si no aparece `[App] initial URL`, el intent no está llegando a la app: revisar intent-filters y que el enlace que abre la web sea exactamente `cellarium://qr/...` o `cellarium:///qr/...`.
- Si aparece la URL pero no el redirect de Bootstrap, comprobar que la URL coincida con el patrón `cellarium:///qr/...` o `cellarium://qr/...` (por ejemplo que no tenga otro host o path).
