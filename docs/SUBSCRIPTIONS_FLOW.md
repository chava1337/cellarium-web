# Auditoría — Flujo de suscripciones (Stripe + Supabase + UI)

## 1) Mapa de archivos relevantes

| Ruta | Propósito |
|------|-----------|
| `src/screens/SubscriptionsScreen.tsx` | Pantalla principal: estado actual, planes, portal, cancelar, add-ons. Usa `user` de AuthContext y `getEffectivePlan`. |
| `src/services/SubscriptionService.ts` | Servicio legacy: create/cancel/update subscription, getActiveSubscription, renewSubscription. Invoca Edge `cancel-subscription` (no existe en repo; cancelación real vía Portal + webhook). |
| `src/lib/supabase.ts` | Cliente Supabase; no tiene helpers específicos de refreshSession para suscripciones. |
| `src/contexts/AuthContext.tsx` | `refreshUser` / hydrate: selecciona `subscription_plan`, `subscription_active`, `subscription_expires_at` en users. No expone `cancel_at_period_end`. |
| `src/utils/effectivePlan.ts` | `getEffectivePlan(user)`: free si `subscription_active !== true` o `subscription_expires_at` en el pasado; si no, `subscription_plan`. No usa `cancel_at_period_end`. |
| `src/utils/subscriptionPermissions.ts` | `isSubscriptionActive`, checks de features; usa `user.subscription_active` y `subscription_expires_at`. |
| `supabase/functions/create-portal-session/index.ts` | POST con Bearer; devuelve URL de Stripe Billing Portal. No toca BD. |
| `supabase/functions/create-checkout-session/index.ts` | Crea Checkout Session Stripe; guarda en BD vía webhook al completar. |
| `supabase/functions/update-subscription/index.ts` | Actualiza add-ons (branch addon) en suscripción Stripe; no cancelación. |
| `supabase/functions/stripe-webhook/index.ts` | Recibe eventos Stripe; actualiza `public.subscriptions` y `public.users`. |
| **No existe** `supabase/functions/cancel-subscription/` | SubscriptionService lo invoca; en el repo no hay Edge con ese nombre. Cancelación se hace en Portal; Stripe envía webhooks. |
| `supabase/migrations/20260207213838_remote_schema.sql` | Define `public.users` (subscription_plan, subscription_expires_at, subscription_active, subscription_id, stripe_customer_id) y `public.subscriptions` (cancel_at_period_end, current_period_end, status, etc.). |
| RPC `enforce_subscription_expiry` | Referenciado en SubscriptionsScreen (líneas 509–522); no se leyó el cuerpo en esta auditoría. |

---

## 2) Estados y fuente de verdad

### ¿La app usa `public.users.subscription_active`?
**Sí.**  
- AuthContext: `USERS_BOOTSTRAP_SELECT` y `USERS_SELECT_COLUMNS` incluyen `subscription_active`.  
- effectivePlan.ts: `user.subscription_active !== true` → free.  
- SubscriptionsScreen: `getEffectivePlan(user)` → `hasActiveSub`, `isPremium`, `planMode`.

### ¿Usa `subscription_plan`, `subscription_expires_at`, `subscription_id`, `stripe_subscription_id`?
**Sí.**  
- users: `subscription_plan`, `subscription_expires_at`, `stripe_customer_id` leídos en AuthContext y usados en UI.  
- `subscription_id` (UUID en users) está en schema y en USERS_SELECT_COLUMNS; no se revisó uso en SubscriptionsScreen.  
- `stripe_subscription_id`: en users lo actualiza el webhook; usado por create-checkout-session (audit docs) y update-subscription (por fila en `subscriptions`).

### ¿Usa tabla `public.subscriptions` directamente desde la app?
**No desde SubscriptionsScreen.**  
- SubscriptionService.ts lee/escribe `subscriptions` (getActiveSubscription, create, cancel, update).  
- La UI de suscripciones se basa solo en `user` (AuthContext), que viene de `public.users`.  
- La tabla `subscriptions` tiene `cancel_at_period_end` y `current_period_end`; la UI no los consulta.

### ¿Cómo determina "se renueva" vs "cancelada"?
**Hoy no distingue cancel_at_period_end.**  
- SubscriptionsScreen líneas 267–272: `CurrentStatusCard` recibe `isPremium ? labels.renews : labels.expires` y `expirationText={formatDate(user?.subscription_expires_at)}`.  
- Condición: `isPremium` = `hasActiveSub` = `effectivePlan !== 'free'`.  
- Si la suscripción está activa y no expirada → siempre muestra "Renueva" + fecha.  
- No hay lectura de `cancel_at_period_end` en ningún sitio de la UI; por tanto aunque en Stripe esté cancelada al final del periodo, la app sigue mostrando "Se renueva...".

### Tabla: UI label/estado vs condición vs fuente

| UI label/estado | Condición exacta | Archivo:Línea | Campo DB / origen |
|-----------------|------------------|---------------|-------------------|
| Plan (pill) | `currentPlanId` = effectivePlan → 'business' \| 'pro' \| 'free' | SubscriptionsScreen 569–573, 616–624 | users.subscription_plan + subscription_active + subscription_expires_at |
| Activo Sí/No | `isPremium` = hasActiveSub = (effectivePlan !== 'free') | 627–629, 264–265 | users.subscription_active + subscription_expires_at (effectivePlan) |
| "Renueva" + fecha | showExpiration && isPremium → labels.renews, formatDate(user?.subscription_expires_at) | 267–272, 612–613, 619 | users.subscription_expires_at |
| "Expira" + fecha | showExpiration && !isPremium → labels.expires | 269–270 | users.subscription_expires_at |
| Cancelada / Se desactiva el {date} | **No implementado**; debería ser cancel_at_period_end = true | — | **UNKNOWN en users**; existe solo en subscriptions.cancel_at_period_end |

### Equivalencia Stripe → BD

| Stripe (subscription) | users | subscriptions |
|------------------------|-------|----------------|
| status (active/canceled/…) | subscription_active (derivado: active/trialing + period not expired) | status (mapStatus) |
| cancel_at_period_end | **No se persiste** (origen Bug 2) | cancel_at_period_end (sí, en upsert genérico) |
| current_period_end | subscription_expires_at | current_period_end |
| canceled_at | — | canceled_at |
| id | stripe_subscription_id | stripe_subscription_id |

---

## 3) Flujo de cancelación

### A) Acción UI
- Botón "Cancelar suscripción" → `handleCancelSubscription` (líneas 583–591) → Alert con "Abrir portal" que llama `handleManageSubscription`.  
- "Administrar" → `handleManageSubscription` (líneas 471–511): `invokeAuthedFunction('create-portal-session', {})` → `WebBrowser.openBrowserAsync(data.url)`.

### B) Edge function
- **create-portal-session**: Auth por Bearer; lee `users.stripe_customer_id`; llama Stripe `billing_portal/sessions` con `return_url` (env STRIPE_PORTAL_RETURN_URL); devuelve `{ url }`. No escribe en BD.

### C) Stripe webhooks esperados
- Al cancelar en Portal (cancel at period end): Stripe envía **customer.subscription.updated** (status sigue `active`, `cancel_at_period_end: true`).  
- Al final del periodo o cancelación inmediata: **customer.subscription.deleted**.  
- checkout.session.completed solo si hay nuevo checkout.

### D) Persistencia en BD
- **customer.subscription.deleted** (stripe-webhook líneas 390–424): actualiza **users** por stripe_customer_id: `subscription_active: false`, `stripe_subscription_id: null`, `subscription_expires_at: null`, `subscription_plan: 'free'`. No toca tabla subscriptions en ese bloque.  
- **customer.subscription.updated** (líneas 427–511): obtiene subscription de Stripe; calcula `active = (status === 'active' \|\| 'trialing') && periodNotExpired`; actualiza **solo users**: `stripe_subscription_id`, `subscription_active`, `subscription_expires_at`, `subscription_plan`. **No lee ni persiste `cancel_at_period_end`** (el tipo en 450 no lo incluye; el update en 491–501 no lo tiene).  
- La ruta genérica (invoice/checkout) sí hace upsert en **subscriptions** con `cancel_at_period_end` (línea 676), pero subscription.updated sale antes por el early-return y no actualiza subscriptions en ese camino.

### E) Refresco en UI
- Al volver del Portal: `handleManageSubscription` hace `await WebBrowser.openBrowserAsync(data.url)` y luego `await refreshUserWithBackoffUntilUpdated()`.  
- **Problema**: Si el usuario sale del navegador con "atrás" o cambia de app sin cerrar la pestaña, `openBrowserAsync` puede no resolverse; entonces nunca se ejecuta `refreshUserWithBackoffUntilUpdated` ni el `finally { setIsProcessing(false) }` → loading se queda en true.  
- No hay `useFocusEffect` ni `navigation.addListener('focus')` en SubscriptionsScreen para refrescar estado ni resetear loading al volver a la pantalla.

---

## 4) Bug 1: Loading pegado al volver

### Estados de loading
- Un solo estado: **isProcessing** (línea 460). Se usa para: crear portal, checkout, actualizar add-ons, botones "Administrar", "Cancelar", "Actualizar add-ons", "Suscribirse".

### Rutas que pueden dejar loading en true
- **handleManageSubscription**: `setIsProcessing(true)` → invoke → si error, `return` (pero hay `finally` que pone false). Si OK, `await WebBrowser.openBrowserAsync(data.url)` → si el usuario no "cierra" el navegador y vuelve con back/switch app, la promesa puede no resolverse → no se llega a `refreshUserWithBackoffUntilUpdated` ni a `finally`.  
- **handleSubscribe**: mismo patrón con openBrowserAsync; mismo riesgo.  
- **handleUpdateAddonBranches**: tiene try/finally con setIsProcessing(false); paths con return dentro del onPress tienen finally ejecutado.

### Fix mínimo propuesto (Bug 1)
1. **useFocusEffect** (o `navigation.addListener('focus')`) en SubscriptionsScreen: al ganar foco, llamar `setIsProcessing(false)` y opcionalmente `refreshUser?.()` o `enforceExpiryAndRefresh()` para actualizar datos al volver.  
2. Mantener try/finally en todos los handlers; asegurar que en cualquier `return` por error se siga llegando al `finally` (ya ocurre; el único caso sin "salida" es la promesa de openBrowserAsync que no resuelve).  
3. Opcional: al montar/focus, si tenemos `isProcessing === true` y han pasado > N segundos, forzar `setIsProcessing(false)` para recuperación.

---

## 5) Bug 2: UI dice "Se renueva" aunque cancelada

### Código que construye el texto
- **CurrentStatusCard** (líneas 267–272):  
  `isPremium ? labels.renews : labels.expires` → texto "Renueva" o "Expira".  
  `expirationText={formatDate(user?.subscription_expires_at)}`.  
- No se usa `cancel_at_period_end` en ningún sitio; la fuente de verdad de la UI es solo `user` (users), que no tiene ese campo.

### Fix mínimo propuesto (Bug 2)
1. **Fuente de verdad para cancel_at_period_end** (elegir una):  
   - **Opción A**: Añadir columna `users.subscription_cancel_at_period_end` (boolean). En stripe-webhook, en el bloque de **customer.subscription.updated** (líneas 427–511), leer `subscription.cancel_at_period_end` del objeto Stripe y añadirlo al `.update(users)`.  
   - **Opción B**: En SubscriptionsScreen (o en un hook), leer la fila de `public.subscriptions` para el owner (por ejemplo `owner_id = user.id` ordenado por updated_at desc limit 1) y usar su `cancel_at_period_end` y `current_period_end`. Requiere RLS/select permitido para el owner.

2. **Función de display** (en utils o dentro de SubscriptionsScreen):  
   `getSubscriptionDisplayState(user, subscriptionRow?)` que devuelva:  
   - `statusLabel`: "Activa" | "Cancelada" | "Expirada" según subscription_active, cancel_at_period_end y fechas.  
   - `nextBillingLabel`: si no cancelada → "Se renueva el {date}"; si cancel_at_period_end → "Se desactiva el {date}" (usar current_period_end o subscription_expires_at).  
   - `endOfAccessDate`: fecha hasta la que tiene acceso.  
   - `isActiveFeatureAccess`: acceso a features hasta esa fecha.

3. Reemplazar en CurrentStatusCard el uso actual de `isPremium ? labels.renews : labels.expires` y `expirationText` por los valores de `getSubscriptionDisplayState` (sin refactor grande del resto de la pantalla).

---

## 6) Resumen: causa raíz y fix mínimo

| Bug | Causa raíz probable | Fix mínimo |
|-----|---------------------|------------|
| Loading pegado | `WebBrowser.openBrowserAsync` no resuelve si el usuario vuelve por back/switch sin cerrar el navegador; no hay reset por focus. | useFocusEffect (o listener focus): al volver a la pantalla, `setIsProcessing(false)` y opcionalmente refresh; mantener try/finally. |
| "Se renueva" cuando está cancelada | La UI solo usa users (subscription_active, subscription_expires_at); no existe `cancel_at_period_end` en users y el webhook no lo persiste ahí. | Persistir cancel_at_period_end (users nueva columna + webhook subscription.updated) O leer subscriptions por owner; luego getSubscriptionDisplayState() y mostrar "Cancelada. Se desactiva el {date}". |

### Archivos a tocar (fix mínimo)

1. **src/screens/SubscriptionsScreen.tsx**  
   - Añadir `useFocusEffect` (de `@react-navigation/native`): en callback, `setIsProcessing(false)` y opcionalmente `refreshUser?.()` o `enforceExpiryAndRefresh()`.  
   - Introducir `getSubscriptionDisplayState(user, subscriptionRow?)` (o recibir ya los campos si se leen en pantalla) y usar su `statusLabel` y `nextBillingLabel` en CurrentStatusCard en lugar de la lógica actual renews/expires.

2. **Backend (elegir A o B)**  
   - **Opción A**: Migración que añada `users.subscription_cancel_at_period_end` (boolean default false). **supabase/functions/stripe-webhook/index.ts**: en el bloque `customer.subscription.updated` (antes del update a users), leer `(subscription as any).cancel_at_period_end` y añadir al objeto del `.update()`; en AuthContext (y tipos) incluir el nuevo campo en el select y en User.

   - **Opción B**: RPC o select desde app a `public.subscriptions` por owner_id; SubscriptionsScreen hace ese fetch y pasa la fila (o cancel_at_period_end + current_period_end) a `getSubscriptionDisplayState`.

3. **Traducciones**: Añadir claves para "Cancelada", "Se desactiva el {date}" si no existen (LanguageContext / subscription.*).

---

*Auditoría basada en el estado del repo; todas las referencias son a archivos y líneas existentes.*
