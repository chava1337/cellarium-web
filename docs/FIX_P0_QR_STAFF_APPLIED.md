# FIX P0 aplicado: QR Staff Invite → AdminRegistration

## 1) Diffs aplicados

### App.tsx
```diff
       QrProcessor: {
-        path: 'qr',
+        path: 'qr/:qrData?',
       },
```

### QrProcessorScreen.tsx
- **Helpers añadidos:** `decodeMaybeJson(encoded)`, `extractQrPayloadFromUrl(url)`, `maskToken(token)` (solo __DEV__).
- **Fuentes de payload (orden):** A) `route.params.qrData` / `route.params.token` (si qrData es string, se decodifica y se intenta JSON; si no, se usa como token). B) URL: `deepLinkUrlRef.current` o `Linking.getInitialURL()` → parse con `cellarium://qr/<encoded>`, `cellarium:///qr/<encoded>` o `?data=<encoded>`. C) AsyncStorage `qrData`.
- **Re-ejecución:** `processedRef` evita procesar dos veces. Se llama `processQrCode()` al mount (setTimeout 500 ms) y cuando `deepLinkUrl` cambia (setTimeout 300 ms) si aún no se ha procesado.
- **Logs:** Solo en `__DEV__`: URL inicial/event (recortada), params (hasQrData, hasToken, token enmascarado), resultado de parse desde URL, “from AsyncStorage”, “No payload”.

### Tipos (src/types/index.ts)
- Sin cambios. `QrProcessor: { qrData?: any; token?: string }` ya admite `qrData` como string (path segment) o objeto.

---

## 2) Mini checklist de prueba

- [ ] **Abrir `cellarium://qr/<encoded>` manualmente** (sustituir `<encoded>` por el valor de `data` de un QR staff, ej. `%7B%22type%22%3A%22admin%22%2C%22token%22%3A%22TOKEN_REAL%22%2C%22branchId%22%3A%22UUID%22%2C%22branchName%22%3A%22Sucursal%22%7D`): la app debe abrir, mostrar QrProcessor y luego **AdminRegistration** con sucursal y flujo de registro.
- [ ] **Probar con encoded = JSON (type admin):** Mismo enlace; verificar que llega a AdminRegistration.
- [ ] **Probar con encoded = JSON (type guest):** Cambiar `"type":"admin"` por `"type":"guest"` en el JSON; debe ir a **WineCatalog** en modo invitado.
- [ ] **Probar con token directo (no JSON):** Si en algún flujo se usa `cellarium://qr/TOKEN_LITERAL`, verificar que se valida y redirige según tipo en BD (admin_invite → AdminRegistration, guest → WineCatalog).
- [ ] **No romper:** QR comensal desde web (URL universal + visualizador) y OAuth `cellarium://auth-callback` siguen funcionando.

---

## 3) Android: carpeta `android/` y sync con app.config.js

- El repo **tiene carpeta `android/`** (build nativo “non-CNG”). Los intent-filters se generan desde **app.config.js** al hacer **`npx expo prebuild`**; si no se vuelve a ejecutar prebuild tras cambiar `app.config.js`, **AndroidManifest.xml no se actualiza** y puede no aceptar `cellarium://qr/...`.
- **Recomendación:** Ejecutar `npx expo prebuild --platform android --clean` (o sin --clean si se quiere conservar cambios manuales) y volver a compilar el dev client / APK. Así el manifest incluirá el intent-filter con `scheme: "cellarium"` (sin host) definido en app.config.js y el sistema aceptará `cellarium://qr/<encoded>`.
- **Corrección mínima manual** (solo si no quieres prebuild): En `android/app/src/main/AndroidManifest.xml`, en el `<activity>` de MainActivity, añadir un `<intent-filter>` que acepte el scheme cellarium para qr, por ejemplo:
  ```xml
  <intent-filter>
    <action android:name="android.intent.action.VIEW"/>
    <category android:name="android.intent.category.DEFAULT"/>
    <category android:name="android.intent.category.BROWSABLE"/>
    <data android:scheme="cellarium" android:host="qr"/>
  </intent-filter>
  ```
  O un filter con solo `<data android:scheme="cellarium"/>` (sin host) para aceptar cualquier `cellarium://...`. Tras editar, hacer rebuild del APK.
