# Auditoría: Stripe return-to-app (Checkout + Billing Portal) en Cellarium (Expo RN)

**Objetivo:** Detectar por qué ya NO regresa automáticamente a la app después de contratar/cambiar/cancelar suscripción con Stripe. Antes funcionaba; hoy el flujo termina en navegador.

---

## 1) Mapa exacto del flujo

### A) Checkout (suscribirse a plan)

| Paso | Acción | Archivo:ubicación | Detalle |
|------|--------|-------------------|---------|
| 1 | Usuario toca "Suscribirse" (Pro/Business) | `src/screens/SubscriptionsScreen.tsx` ~797–848 | `handleSubscribe()` → Alert con onPress |
| 2 | Invoke Edge con Bearer | `src/screens/SubscriptionsScreen.tsx` 817–820 | `invokeAuthedFunction('create-checkout-session', { planLookupKey })` |
| 3 | Edge crea sesión Stripe | `supabase/functions/create-checkout-session/index.ts` 457–495 | `success_url = Deno.env.get('STRIPE_SUCCESS_URL') \|\| 'https://example.com/success'`, `cancel_url = Deno.env.get('STRIPE_CANCEL_URL') \|\| 'https://example.com/cancel'`; se pasan a Stripe API |
| 4 | Respuesta Edge → `data.url` | Misma Edge 515–524 | `{ url, sessionId }` |
| 5 | Apertura navegador | `src/screens/SubscriptionsScreen.tsx` 834–836 | `returnUrl = 'cellarium://checkout/success'`; **`WebBrowser.openAuthSessionAsync(data.url, returnUrl)`** |
| 6 | Usuario paga/cancela en Stripe | Stripe | Stripe redirige a `success_url` o `cancel_url` |
| 7 | Retorno esperado | — | Si Stripe redirige a `cellarium://checkout/success`, el SO abre la app y `openAuthSessionAsync` resuelve con esa URL |
| 8 | Tras resolución | `src/screens/SubscriptionsScreen.tsx` 837–838 | `refreshUserWithBackoffUntilUpdated(expectedPlan)` |

**URLs de retorno (Checkout):** Definidas en **servidor** (Edge). Valores reales = secrets de Supabase `STRIPE_SUCCESS_URL` y `STRIPE_CANCEL_URL`. Si no existen → `https://example.com/success` y `https://example.com/cancel` (código líneas 458–459). El **cliente** usa `returnUrl = 'cellarium://checkout/success'` solo como segundo argumento de `openAuthSessionAsync`; no controla a dónde redirige Stripe.

### B) Billing Portal (administrar suscripción)

| Paso | Acción | Archivo:ubicación | Detalle |
|------|--------|-------------------|---------|
| 1 | Usuario toca "Administrar suscripción" | `src/screens/SubscriptionsScreen.tsx` ~851–886 | `handleManageSubscription()` |
| 2 | Invoke Edge | `src/screens/SubscriptionsScreen.tsx` 858–861 | `invokeAuthedFunction('create-portal-session', {})` |
| 3 | Edge crea sesión Portal | `supabase/functions/create-portal-session/index.ts` 109–129 | `returnUrl = Deno.env.get('STRIPE_PORTAL_RETURN_URL')` (obligatorio); se envía a Stripe `billing_portal/sessions` |
| 4 | Respuesta → `data.url` | Misma Edge 154 | `{ url }` |
| 5 | Apertura navegador | `src/screens/SubscriptionsScreen.tsx` 876 | **`WebBrowser.openBrowserAsync(data.url)`** (sin returnUrl, sin openAuthSessionAsync) |
| 6 | Usuario cambia/cancela en Portal | Stripe | Al salir, Stripe redirige a `return_url` |
| 7 | Retorno actual | — | No hay sesión que espere deep link; el usuario se queda en el navegador o debe volver manualmente |

**URL de retorno (Portal):** Servidor usa `STRIPE_PORTAL_RETURN_URL`. Cliente **no** pasa ningún `returnUrl` porque no usa `openAuthSessionAsync`.

### C) Listener de deep link

| Dónde | Qué hace |
|-------|----------|
| `App.tsx` 86–88 | `Linking.addEventListener('url', (event) => console.log('[DEEPLINK RECEIVED]', event.url))` solo en __DEV__; no navega a ninguna pantalla |
| `App.tsx` 45–62 | `linking.config.screens`: Login, QrProcessor, WineCatalog, Admin*, UserManagement, etc. **No hay ruta para `checkout/success` ni `checkout/cancel` ni `portal-return`** |
| Navegación al volver | Si el SO abre la app vía `cellarium://checkout/success`, React Navigation no tiene screen con path `checkout/success`; la app abre en el estado actual (o cold start). Para **Checkout**, lo importante es que `openAuthSessionAsync` **resuelva** cuando Stripe cargue esa URL; entonces el código sigue con `refreshUserWithBackoffUntilUpdated`. No es estrictamente necesario tener una ruta dedicada para que el flujo “vuelva”, siempre que la promesa resuelva. |

---

## 2) Archivos y funciones involucradas

| Archivo | Función / bloque | Rol |
|---------|------------------|-----|
| `src/screens/SubscriptionsScreen.tsx` | `handleSubscribe` (onPress ~814–845) | Tap suscribirse → invoke create-checkout-session → **openAuthSessionAsync**(url, `cellarium://checkout/success`) → refreshUser |
| `src/screens/SubscriptionsScreen.tsx` | `handleManageSubscription` (~851–886) | Tap administrar → invoke create-portal-session → **openBrowserAsync**(url) → refreshUser |
| `src/screens/SubscriptionsScreen.tsx` | `invokeAuthedFunction` (61–66, 75–76) | Helper que llama Edge con Bearer |
| `supabase/functions/create-checkout-session/index.ts` | POST handler, 457–495 | Lee `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL`; crea Checkout Session con esas URLs |
| `supabase/functions/create-portal-session/index.ts` | POST handler, 109–129 | Lee `STRIPE_PORTAL_RETURN_URL`; crea Billing Portal session con `return_url` |
| `App.tsx` | linking 45–62, useEffect 80–98 | Prefixes `cellarium://`, config de screens (sin checkout/portal); listener __DEV__ de `Linking.addEventListener('url')` |
| `app.config.js` | scheme 20, linking 29–30, android intentFilters 69–95 | scheme `cellarium`; Android: https cellarium.app/qr + **cellarium** (sin host) y **cellarium** host **auth-callback** |
| `src/screens/AuthScreen.tsx` | 149, 170–172 | OAuth: `redirectTo = 'cellarium://auth-callback'` + **openAuthSessionAsync**(url, redirectTo) (patrón que sí regresa) |
| `src/screens/AdminRegistrationScreen.tsx` | 431, 455–457 | Mismo patrón OAuth con openAuthSessionAsync + cellarium://auth-callback |

---

## 3) Diferencias críticas vs patrón recomendado

- **Patrón recomendado para “volver a la app”:** Usar **`WebBrowser.openAuthSessionAsync(url, returnUrl)`** con `returnUrl` = deep link (ej. `cellarium://checkout/success`). Configurar en **servidor** (Stripe) que success/cancel/return apunten al **mismo** deep link. Así, cuando Stripe redirige, el navegador carga esa URL, el SO abre la app y la sesión de `openAuthSessionAsync` resuelve.
- **Checkout en Cellarium:** Ya usa **openAuthSessionAsync** con `returnUrl = 'cellarium://checkout/success'`. La inconsistencia está en el **servidor**: si `STRIPE_SUCCESS_URL` y `STRIPE_CANCEL_URL` **no** son `cellarium://checkout/success` y `cellarium://checkout/cancel`, Stripe nunca redirige al scheme y la promesa puede no resolver (usuario queda en página https).
- **Portal en Cellarium:** Sigue usando **openBrowserAsync** (sin returnUrl). Aunque `STRIPE_PORTAL_RETURN_URL` sea un deep link, no hay sesión que espere ese redirect; el usuario puede terminar en el navegador o la app se abre en segundo plano sin cerrar el navegador de forma controlada.

Resumen:

- **success_url / cancel_url / return_url** deben ser deep links **y** coincidir con lo que usa/openAuthSessionAsync en la app.
- **Checkout:** cliente correcto (openAuthSessionAsync + returnUrl); servidor debe tener STRIPE_SUCCESS_URL/STRIPE_CANCEL_URL = deep links.
- **Portal:** cliente incorrecto (openBrowserAsync); falta openAuthSessionAsync + returnUrl y STRIPE_PORTAL_RETURN_URL debe ser el mismo deep link.

---

## 4) Cambios recientes que pudieron romperlo

- **Checkout:** En el código actual, Checkout **sí** usa `openAuthSessionAsync` y `returnUrl = 'cellarium://checkout/success'`. Si “antes funcionaba” y ahora no, las causas más probables son:
  1. **Secrets de Supabase:** `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` se cambiaron de `cellarium://checkout/success` (y cancel) a una URL https, o se borraron (y se usa el fallback `https://example.com/success`).
  2. **Android intent-filter:** Si en algún momento se restringió el scheme a solo `auth-callback` (host), `cellarium://checkout/success` no abriría la app. En el repo actual hay `{ scheme: "cellarium" }` sin host, por lo que no debería bloquear.
  3. **iOS:** Scheme `cellarium` en app.config; no hay ruta explícita para checkout en linking, pero no debería impedir que se abra la app con ese URL.
- **Portal:** Nunca se migró a openAuthSessionAsync; siempre ha usado openBrowserAsync, por lo que “no regresar” desde Portal es esperado si no se hizo ese cambio.
- **Linking / Expo Router:** El proyecto usa React Navigation (Stack), no Expo Router. No hay evidencia de cambio de linking que quite `cellarium://`; los prefixes incluyen `cellarium://` y `cellarium:///`.

---

## 5) Conclusión y fix mínimo propuesto

### Causa más probable

1. **Checkout:** Las variables de entorno **STRIPE_SUCCESS_URL** y **STRIPE_CANCEL_URL** en Supabase (Edge create-checkout-session) no están configuradas como deep links (o se revirtieron a https). Mientras Stripe redirija a `https://...`, `openAuthSessionAsync` no recibe `cellarium://` y el usuario no “vuelve” a la app de forma fiable.
2. **Portal:** Uso de **openBrowserAsync** sin `openAuthSessionAsync` ni returnUrl, por lo que no hay flujo que devuelva a la app automáticamente.

### Comprobación rápida

- En **Supabase Dashboard** → Project Settings → Edge Functions → Secrets: revisar valores de `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL` y `STRIPE_PORTAL_RETURN_URL`. Si los dos primeros no son `cellarium://checkout/success` y `cellarium://checkout/cancel`, ahí está el fallo de Checkout.

### Fix mínimo propuesto (sin implementar)

1. **Checkout (mantener openAuthSessionAsync):**
   - En Supabase Secrets, fijar:
     - `STRIPE_SUCCESS_URL` = `cellarium://checkout/success`
     - `STRIPE_CANCEL_URL` = `cellarium://checkout/cancel`
   - Opcional: en `App.tsx` linking.config.screens añadir una ruta para `checkout/success` (ej. Subscriptions o pantalla de “listo”) para que al abrir por deep link se muestre la pantalla deseada.

2. **Portal (alinear con Checkout):**
   - En **SubscriptionsScreen**, en `handleManageSubscription`, sustituir **openBrowserAsync**(data.url) por **openAuthSessionAsync**(data.url, returnUrl) con `returnUrl = 'cellarium://checkout/portal-return'` (o el mismo que use Checkout si se quiere una sola pantalla).
   - En Supabase Secrets, fijar **STRIPE_PORTAL_RETURN_URL** = mismo deep link (ej. `cellarium://checkout/portal-return`).
   - Opcional: ruta en linking para `checkout/portal-return` si se quiere una pantalla específica al volver del Portal.

3. **Android:** Dejar el intent-filter que acepta `scheme: "cellarium"` sin host para que cualquier `cellarium://...` abra la app. No restringir solo a `auth-callback`.

Con esto, tanto Checkout como Portal deberían volver a la app automáticamente cuando Stripe redirija a los deep links configurados.
