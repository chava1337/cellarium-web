# Diagnóstico: Stripe Checkout no retorna a la app después del pago

**Objetivo:** Causa raíz de que, tras pagar en Stripe (test), el flujo se quede en la pantalla de pago y no vuelva a la app.

**Reglas aplicadas:** Solo inspección; no se implementaron cambios.

---

## 1) Mapa del flujo real

| Paso | Acción UI | Función JS | Request | Endpoint | Respuesta | Apertura navegador |
|------|-----------|------------|---------|----------|-----------|--------------------|
| 1 | Usuario toca "Suscribirse" a un plan (Pro/Business) | `handleSubscribe()` en SubscriptionsScreen | `invokeAuthedFunction('create-checkout-session', { planLookupKey })` con Bearer token | Supabase Edge Function `create-checkout-session` (POST) | `{ url: string, sessionId: string }` (Stripe Checkout URL) | — |
| 2 | Tras recibir `data.url` | Misma función, línea 726 | — | — | — | `WebBrowser.openBrowserAsync(data.url)` |
| 3 | Después de abrir navegador | Misma función, línea 727 | — | — | — | `await refreshUserWithBackoffUntilUpdated(expectedPlan)` (polling en background) |

**Archivos y líneas:**

- **Inicio del flujo (UI → invoke):** `src/screens/SubscriptionsScreen.tsx` ~697–727 (Alert.alert con onPress que llama a `invokeAuthedFunction('create-checkout-session', …)` y luego `WebBrowser.openBrowserAsync(data.url)`).
- **Helper de invoke:** `src/screens/SubscriptionsScreen.tsx` 61–66 (`invokeAuthedFunction`), 75–76 (headers con `authorization: Bearer ${session.access_token}`).
- **Endpoint que crea la sesión:** `supabase/functions/create-checkout-session/index.ts` (Edge Function); entrada POST ~135; construcción de Checkout Session ~457–495; URLs de éxito/cancelación 457–462.
- **Apertura del navegador:** `src/screens/SubscriptionsScreen.tsx` 726: `await WebBrowser.openBrowserAsync(data.url)` (expo-web-browser).
- **Portal (gestión de suscripción):** `src/screens/SubscriptionsScreen.tsx` 765: también usa `WebBrowser.openBrowserAsync(data.url)` para la URL del portal; mismo patrón.

**Diferencia crítica con el flujo de auth:** En login/registro (AuthScreen, AdminRegistrationScreen) se usa **`WebBrowser.openAuthSessionAsync(data.url, redirectTo)`** con `redirectTo = 'cellarium://auth-callback'`, de modo que cuando el navegador redirige a esa URL, la sesión se cierra y la promesa resuelve con la URL. En checkout **no** se usa `openAuthSessionAsync` ni ningún `returnUrl`; solo `openBrowserAsync`, por lo que no hay “vuelta” automática a la app al producirse un redirect.

---

## 2) URLs detectadas (valores exactos y dónde se construyen)

### success_url y cancel_url (Checkout – servidor)

**Archivo:** `supabase/functions/create-checkout-session/index.ts`  
**Líneas:** 457–462

```ts
const successUrl = Deno.env.get('STRIPE_SUCCESS_URL') || 'https://example.com/success';
const cancelUrl = Deno.env.get('STRIPE_CANCEL_URL') || 'https://example.com/cancel';

if (!Deno.env.get('STRIPE_SUCCESS_URL') || !Deno.env.get('STRIPE_CANCEL_URL')) {
  console.warn('⚠️ STRIPE_SUCCESS_URL o STRIPE_CANCEL_URL no configuradas, usando fallback');
}
```

- **success_url en runtime:**  
  - Si está definida la variable de entorno `STRIPE_SUCCESS_URL` en la Edge (Supabase secrets), se usa tal cual.  
  - Si **no** está definida: **`https://example.com/success`** (literal en código).
- **cancel_url en runtime:**  
  - Si está definida `STRIPE_CANCEL_URL`: ese valor.  
  - Si no: **`https://example.com/cancel`**.
- **Placeholders Stripe:** En el código no se usa `{CHECKOUT_SESSION_ID}` ni otros placeholders; las URLs se pasan tal cual a `success_url` y `cancel_url` en el body de la API (líneas 489–490).

Conclusión: si en el proyecto no se han configurado `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` en Supabase Edge, Stripe redirige a **https** (example.com), no a un deep link. La app nunca recibe un “retorno” por scheme.

### return_url (Portal – servidor)

**Archivo:** `supabase/functions/create-portal-session/index.ts`  
**Líneas:** 109–116

```ts
const returnUrl = Deno.env.get('STRIPE_PORTAL_RETURN_URL');
if (!returnUrl) {
  console.error('[PORTAL] STRIPE_PORTAL_RETURN_URL not set');
  return jsonResponse(
    { code: 'CONFIG_MISSING', message: 'STRIPE_PORTAL_RETURN_URL is required' },
    500
  );
}
```

- **return_url:** Valor de la variable de entorno **`STRIPE_PORTAL_RETURN_URL`** (obligatoria para portal; si falta, la Edge devuelve 500). No hay fallback en código; el valor exacto depende de la config en Supabase.

### returnUrl / redirectTo en el cliente (solo auth)

- **AuthScreen.tsx** 149, 170–172: `redirectTo = 'cellarium://auth-callback'`; se pasa a `WebBrowser.openAuthSessionAsync(data.url, redirectTo)`.
- **AdminRegistrationScreen.tsx** 431, 457: mismo `redirectTo = 'cellarium://auth-callback'` y `openAuthSessionAsync(..., redirectTo)`.

En **SubscriptionsScreen** no existe ningún `returnUrl` ni segundo argumento en la apertura del navegador; solo `openBrowserAsync(data.url)` (checkout y portal).

### Scheme y linking (app)

- **app.config.js** 20, 29–30: `scheme: "cellarium"`, `linking.prefixes: ["cellarium://"]`.
- **App.tsx** 31–39, 45–62:  
  - `linkingPrefixes`: `cellarium://`, `cellarium:///`, `Linking.createURL('/')`, `https://cellarium.app`, `https://www.cellarium.app`.  
  - `linking.prefixes` = esos valores; `linking.config.screens` define rutas (Login, QrProcessor, WineCatalog, Admin*, etc.).  
  - **No hay** ruta configurada para “checkout/success” ni para la pantalla Subscriptions en el linking.

Resumen de URLs/retorno:

| Origen | URL / valor | Archivo:Líneas |
|--------|-------------|----------------|
| success_url (Edge) | `STRIPE_SUCCESS_URL` o `https://example.com/success` | create-checkout-session/index.ts:457 |
| cancel_url (Edge) | `STRIPE_CANCEL_URL` o `https://example.com/cancel` | create-checkout-session/index.ts:459 |
| return_url Portal (Edge) | `STRIPE_PORTAL_RETURN_URL` (obligatorio) | create-portal-session/index.ts:109 |
| returnUrl cliente (auth) | `cellarium://auth-callback` | AuthScreen.tsx:149, AdminRegistrationScreen.tsx:431 |
| returnUrl cliente (checkout) | No existe | SubscriptionsScreen usa solo openBrowserAsync |
| prefixes linking | cellarium://, cellarium:///, createURL('/'), https://cellarium.app, https://www.cellarium.app | App.tsx:32–39, app.config.js:20,29–30 |
| Deep links QR | cellarium:///qr/:qrData, cellarium://qr/... | App.tsx linking config, QrProcessor path |

---

## 3) Estado de deep linking (Android / iOS)

### Android (app.config.js)

**Archivo:** `app.config.js` 69–95

- **intentFilters:**
  1. **https + app links:**  
     - `scheme: "https"`, `host: "cellarium.app"`, `pathPrefix: "/qr"`.  
     - `scheme: "https"`, `host: "www.cellarium.app"`, `pathPrefix: "/qr"`.  
     - Categorías BROWSABLE, DEFAULT.
  2. **Scheme cellarium:**  
     - `{ scheme: "cellarium" }` (sin host/path).  
     - `{ scheme: "cellarium", host: "auth-callback", pathPrefix: "/" }`.  
     - Categorías BROWSABLE, DEFAULT.

Con un solo `data` con `scheme: "cellarium"` (sin host), Android suele considerar que cualquier URL con ese scheme coincide (p. ej. `cellarium://checkout/success`). El segundo `data` restringe a `cellarium://auth-callback/...`. Por tanto, **si** `STRIPE_SUCCESS_URL` fuera `cellarium://checkout/success`, el SO podría abrir la app con esa URL; el problema actual es que success_url no es ese deep link (es https o no está configurado como scheme).

### iOS

- **app.config.js** 44–55: `bundleIdentifier: "com.cellarium.winecatalog"`, `scheme: "cellarium"` a nivel expo.  
- **associatedDomains:** `applinks:cellarium.app`, `applinks:www.cellarium.app` (para Universal Links / QR).  
- No se ve en el repo configuración explícita de `CFBundleURLSchemes`; Expo genera a partir de `scheme: "cellarium"`, por lo que `cellarium://` debería abrir la app.  
- Conclusión: si success_url fuera `cellarium://checkout/success`, iOS también podría abrir la app; de nuevo el fallo es que la URL de éxito no es un deep link.

### Compatibilidad con el flujo actual

- **“El success_url intenta abrir cellarium://checkout/success pero Android solo acepta cellarium://auth-callback”**  
  **Falso en el código:** Android tiene `{ scheme: "cellarium" }` sin host, por lo que no se limita a auth-callback.  
- **“No se usa openAuthSessionAsync entonces el navegador no retorna”**  
  **Correcto:** Checkout (y portal) usan `openBrowserAsync`; no hay URL de retorno ni sesión que espere un redirect, por lo que el navegador no “vuelve” a la app al completar el pago.  
- **“success_url es https y no hace redirect a scheme”**  
  **Correcto:** Por defecto (y si no se configuran las env) success_url es `https://example.com/success`; Stripe redirige ahí y el usuario se queda en la web. No hay redirect a `cellarium://`.

---

## 4) Diferencia “no redirige” vs “redirige pero la app no abre”

- **Logs:** No hay en el repo logs específicos del resultado de `openBrowserAsync` (no devuelve URL de redirect). En App.tsx 74–76 solo se usa `Linking.getInitialURL()` en __DEV__ para log de URL inicial. No hay listener de `Linking.addEventListener('url')` asociado a checkout ni a una ruta “checkout/success”.
- **Escenarios:**
  - **A) Stripe sí redirige a success_url pero el SO no abre la app:** Ocurriría si success_url fuera un deep link (p. ej. `cellarium://...`) y el dispositivo no abriera la app. Con la config actual (scheme `cellarium` y, en Android, un intent sin host), es poco probable si la URL fuera correcta; el problema actual es que success_url no es deep link.
  - **B) Stripe nunca navega a un deep link (success_url no es deep link / mal construido):** Es lo que ocurre hoy: success_url es env o `https://example.com/success`, así que Stripe redirige a una página web y el usuario permanece en el navegador.
  - **C) Se abre la app pero no se navega a la pantalla correcta:** Si en el futuro success_url fuera `cellarium://checkout/success`, la app se abriría por el scheme, pero en `App.tsx` linking no hay ruta para `checkout/success` ni para Subscriptions, por lo que React Navigation no tendría una pantalla asociada a esa URL (comportamiento a comprobar: podría quedar en Bootstrap o en la última pantalla).

**Conclusión con probabilidad:**  
- **~95%:** Escenario **B**: success_url (y cancel_url) no son deep links; Stripe redirige a https (o a lo que tenga `STRIPE_SUCCESS_URL` si está en env), el usuario se queda en el navegador y la app no recibe ningún “retorno”.  
- **~5%:** Si en producción sí está configurado `STRIPE_SUCCESS_URL` con un deep link, podría ser A o C (SO no abre app o app no enruta a Suscripciones).

**Comprobación en ~1 minuto:**  
1) En Supabase Dashboard → Project → Edge Functions → Secrets, revisar si existen `STRIPE_SUCCESS_URL` y `STRIPE_CANCEL_URL` y qué valor tienen.  
2) Si no existen o son `https://...`: confirmado que Stripe no redirige a un scheme; el usuario siempre termina en una web.  
3) Si existen y son `cellarium://...`: hacer una prueba de pago test y ver si la app se abre al completar; si se abre, comprobar si la pantalla que se muestra es Suscripciones (hoy no hay ruta de linking para checkout/success).

---

## 5) Causa raíz (una frase + evidencia)

**Causa raíz:** El flujo de Checkout no vuelve a la app porque (1) la URL de éxito que recibe Stripe es una URL web (variable de entorno o fallback `https://example.com/success`), no un deep link `cellarium://`, y (2) la app abre Stripe con `WebBrowser.openBrowserAsync` sin usar `openAuthSessionAsync` ni ningún `returnUrl`, por lo que cuando Stripe redirige tras el pago, el usuario permanece en el navegador y la app no recibe ningún callback ni cierre de sesión que la traiga al frente.

**Evidencia:**  
- success_url/cancel_url: `supabase/functions/create-checkout-session/index.ts` 457–459 (env o `https://example.com/...`).  
- Apertura del navegador: `src/screens/SubscriptionsScreen.tsx` 726 `WebBrowser.openBrowserAsync(data.url)` (sin segundo argumento).  
- Comparación con auth: `src/screens/AuthScreen.tsx` 170–172 `openAuthSessionAsync(data.url, redirectTo)` con `redirectTo = 'cellarium://auth-callback'`.

---

## 6) Fix mínimo recomendado (sin implementar)

### Opción 1 (menor riesgo): Deep link en Edge + misma UX de navegador

- **Archivos a tocar:**  
  - **Supabase (secrets):** Configurar en el proyecto las variables de la Edge:  
    - `STRIPE_SUCCESS_URL` = `cellarium://checkout/success` (o `cellarium:///checkout/success` si se prefiere triple barra).  
    - `STRIPE_CANCEL_URL` = `cellarium://checkout/cancel` (o equivalente).  
  - **App.tsx:** Añadir en `linking.config.screens` una ruta que resuelva a la pantalla Subscriptions (o a una pantalla de “pago completado” que luego navegue a Subscriptions), por ejemplo:  
    - `CheckoutSuccess: 'checkout/success'` y/o registrar la pantalla que deba mostrarse (p. ej. Subscriptions con query o param `?success=1`).  
  - Opcional: en la pantalla que se abra por ese deep link, mostrar un breve mensaje de “Pago completado” y refrescar usuario (o navegar a Subscriptions si se usa una pantalla intermedia).

- **Cambio conceptual:**  
  - Stripe deja de redirigir a una página web y redirige a un deep link; el SO abre la app con esa URL; React Navigation enruta a la pantalla adecuada (Suscripciones o éxito).  
  - Se sigue usando `openBrowserAsync`; la “vuelta” a la app ocurre porque el usuario es redirigido a `cellarium://...` y el SO abre la app.

- **Riesgos:**  
  - Si en Android el intent-filter no acepta cualquier path bajo `cellarium://`, podría no abrir (en el repo actual `scheme: "cellarium"` sin host debería ser suficiente).  
  - Hay que asegurar que la ruta `checkout/success` esté bien definida y que la pantalla que se muestre refresque el usuario (refreshUser) para que se vea el plan actualizado.

- **Prueba:** Configurar las env en Supabase, hacer un checkout de prueba, completar el pago; comprobar que la app se abre y que se muestra Suscripciones (o la pantalla de éxito) con el plan actualizado.

---

### Opción 2: openAuthSessionAsync + returnUrl (cierra el navegador al volver)

- **Archivos a tocar:**  
  - **src/screens/SubscriptionsScreen.tsx:**  
    - Sustituir `WebBrowser.openBrowserAsync(data.url)` por `WebBrowser.openAuthSessionAsync(data.url, returnUrl)` tanto en el flujo de checkout (línea 726) como en el de portal (línea 765).  
    - Definir `returnUrl` como deep link, por ejemplo `cellarium://checkout/success` para checkout y `cellarium://checkout/portal-return` (o el mismo) para portal.  
  - **supabase/functions/create-checkout-session/index.ts** (o secrets):  
    - `STRIPE_SUCCESS_URL` = mismo deep link que `returnUrl` (p. ej. `cellarium://checkout/success`).  
    - `STRIPE_CANCEL_URL` = p. ej. `cellarium://checkout/cancel`.  
  - **App.tsx:** Igual que en opción 1: ruta de linking para `checkout/success` (y opcionalmente cancel/portal) que lleve a Subscriptions (o pantalla de éxito).

- **Cambio conceptual:**  
  - La sesión del navegador espera que la carga sea a `returnUrl`; cuando Stripe redirige a esa URL, el SO abre la app y `openAuthSessionAsync` resuelve con esa URL, cerrando el navegador y volviendo a la app de forma explícita.  
  - Comportamiento más parecido al flujo de auth (Google).

- **Riesgos:**  
  - En algunas plataformas/versiones, `openAuthSessionAsync` puede comportarse distinto (cookies, ventana).  
  - Hay que asegurar que Stripe redirija exactamente a la misma URL que se pasa como `returnUrl` (incluyendo query si se usa).

- **Prueba:** Igual que opción 1; además comprobar que el navegador se cierra al completar el pago y que la app queda en primer plano en la pantalla correcta.

---

### Opción 3 (fallback web): Página web que redirige al deep link

- **Archivos a tocar:**  
  - **Backend/servidor (fuera del repo actual):** Una página accesible por https (p. ej. `https://cellarium.app/checkout/success` o bajo el dominio que use la app) que, al cargar, redirija con un redirect 302 o meta refresh a `cellarium://checkout/success` (y otra para cancel a `cellarium://checkout/cancel`).  
  - **Supabase (secrets):**  
    - `STRIPE_SUCCESS_URL` = esa URL https (ej. `https://cellarium.app/checkout/success`).  
    - `STRIPE_CANCEL_URL` = URL https de cancel que redirija a `cellarium://checkout/cancel`.  
  - **App:** Igual que opción 1: rutas de linking para `checkout/success` y `checkout/cancel` en App.tsx.

- **Cambio conceptual:**  
  - Stripe redirige primero a una web; esa web redirige al deep link; el dispositivo abre la app.  
  - Útil si en algún entorno no se puede usar directamente un custom scheme en Stripe (poco común) o se quiere una página intermedia “Gracias por tu pago” antes de abrir la app.

- **Riesgos:**  
  - Dependencia de un dominio/servidor y de que la web esté accesible.  
  - En iOS, Universal Links pueden interferir si el mismo dominio está en associatedDomains; hay que evitar que el primer redirect a https abra la app por applinks en lugar de cargar la página que hace el redirect al scheme.

- **Prueba:** Configurar las URLs en Stripe y la página de redirect, hacer checkout test y verificar que se llega a la web y luego se abre la app.

---

## Plan de prueba recomendado (después de aplicar una opción)

1. **Configurar env en Supabase** (opción 1 o 2):  
   `STRIPE_SUCCESS_URL` = `cellarium://checkout/success`, `STRIPE_CANCEL_URL` = `cellarium://checkout/cancel`.
2. **Añadir ruta de linking** en App.tsx para `checkout/success` (y opcionalmente `checkout/cancel`) hacia Subscriptions o pantalla de éxito.
3. **Ejecutar flujo:** Suscripciones → elegir plan → pagar en Stripe test (tarjeta 4242…).
4. **Comprobar:** Tras “Pay” en Stripe, la app vuelve al frente y muestra Suscripciones (o la pantalla definida) con el plan actualizado.
5. **Cancelar flujo:** Cancelar en Stripe y comprobar que se vuelve a la app en la pantalla acordada (p. ej. Subscriptions).

Si se elige la opción 2, además verificar que el navegador se cierra solo al redirigir a `cellarium://checkout/success`.
