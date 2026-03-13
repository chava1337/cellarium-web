# P0 Auditoría — cancel_at_period_end no reflejado en DB

## Hecho observado

- En `public.subscriptions` (para el `stripe_subscription_id` de la suscripción): `status=active`, `cancel_at_period_end=false`, `canceled_at=null` **después** de cancelar desde el Portal (cancel at period end).
- La UI muestra "Renews..." porque la fuente de verdad en DB indica que no está cancelada.

---

## 1) Revisión de `supabase/functions/stripe-webhook/index.ts`

### Handlers que actualizan `public.subscriptions`

| Ubicación | Eventos | Qué escribe en `subscriptions` |
|-----------|---------|--------------------------------|
| **Ruta genérica** (líneas 668–682, 709–713) | `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.paid`, `invoice.payment_failed` | Upsert con `cancel_at_period_end: subscription.cancel_at_period_end ?? false` (línea 679), `status`, `current_period_start`, `current_period_end`, `canceled_at`, etc. |
| **customer.subscription.updated** (bloque early-return 427–515) | `customer.subscription.updated`, `customer.subscription.created` | **No escribe en `public.subscriptions`**. Solo actualiza `public.users` y hace `return json(200, …)` en la línea 514. |

Conclusión: **el único camino que persiste `cancel_at_period_end` en `subscriptions` es la ruta genérica**. El handler de `customer.subscription.updated` **nunca** hace upsert en `subscriptions`.

### Handlers que actualizan `public.users`

| Ubicación | Eventos | Campos relevantes |
|-----------|---------|--------------------|
| **customer.subscription.deleted** (406–416) | `customer.subscription.deleted` | `subscription_active: false`, `subscription_cancel_at_period_end: false`, limpia ids y plan. |
| **customer.subscription.updated (early)** (491–504) | `customer.subscription.updated` / `.created` | `stripe_subscription_id`, `subscription_active`, `subscription_expires_at`, `subscription_plan`, **`subscription_cancel_at_period_end: cancelAtPeriodEnd`** (línea 502). `cancelAtPeriodEnd` viene de `!!(subscription.cancel_at_period_end === true)` (línea 492), salvo si `subscriptionPlan === 'free'` → false. |
| **Ruta genérica** (750–809) | checkout, invoice.* | `userUpdatePayload`: `stripe_subscription_id`, `subscription_active`, `subscription_expires_at`, `subscription_plan` (según lógica invoice). **No incluye `subscription_cancel_at_period_end`**. |

Conclusión: **solo el bloque early de subscription.updated** escribe `subscription_cancel_at_period_end` en `users`. La ruta genérica no lo toca (no lo pisa a false, pero tampoco lo pone a true si solo llega un evento de invoice).

### Posible overwrite de `cancel_at_period_end`

- **subscriptions:** En la ruta genérica el upsert usa `subscription.cancel_at_period_end ?? false` (679). No hay otro sitio que escriba `cancel_at_period_end` en esa tabla. **No** hay un segundo handler que lo pase a `false` después.
- **users:** La ruta genérica no incluye `subscription_cancel_at_period_end` en `userUpdatePayload`, así que no lo sobrescribe. El único lugar que lo pone a `false` es `customer.subscription.deleted`.

El problema no es overwrite, sino **que la tabla `subscriptions` no se actualiza en el evento que sí trae la cancelación**.

### Flujo por evento

- **Al cancelar “al final del periodo” en el Portal**, Stripe envía:
  - **customer.subscription.updated** (la suscripción sigue `status: active`, `cancel_at_period_end: true`).
  - Opcionalmente después: **invoice.payment_succeeded** u otros (cuando haya facturación).

- **customer.subscription.updated:**
  - Entra en el early-return (427–515).
  - Actualiza **solo users** (incl. `subscription_cancel_at_period_end: true`).
  - **No** hace upsert en `subscriptions` → la fila de `subscriptions` queda con el último valor escrito por un evento anterior (checkout o invoice), típicamente `cancel_at_period_end: false`.

- **invoice.* / checkout:**
  - No tienen early-return, van a la ruta genérica.
  - Ahí sí se hace upsert en `subscriptions` con `cancel_at_period_end` del objeto subscription de Stripe.
  - Si el siguiente evento después de cancelar es un invoice, **sí** se actualizaría `subscriptions` con `true`; pero si **solo** llega `customer.subscription.updated`, `subscriptions` nunca se actualiza.

---

## 2) Revisión de `supabase/functions/create-portal-session/index.ts`

- **Líneas 125–137:** El body para Stripe es solo `customer` y `return_url` (URLSearchParams). No se envía `configuration`, `flow_data`, ni `features`.
- **Líneas 130–131:** Solo se usan `return_url` y `customer`. La posibilidad de cancelar (y “cancel at period end”) depende **por tanto de la configuración del Billing Portal en el Dashboard de Stripe** (Customer portal settings), no del código de la Edge.
- Conclusión: La sesión del portal se crea con **configuración por defecto del Dashboard**. Si ahí está permitida la cancelación / “Cancel at end of period”, Stripe sí envía `customer.subscription.updated` con `cancel_at_period_end: true`. El problema observado en DB es coherente con “el webhook no escribe ese valor en `subscriptions`”, no con “Stripe no envía el evento”.

---

## 3) Resumen y causa raíz

- **Eventos que deberían llegar al cancelar “al final del periodo”:**  
  **customer.subscription.updated** (con `cancel_at_period_end: true`; `status` sigue `active` hasta el fin del periodo).

- **Dónde se persiste `cancel_at_period_end`:**
  - **users:** En el handler early de **customer.subscription.updated** (líneas 492, 502).
  - **subscriptions:** Solo en la **ruta genérica** (línea 679, upsert 709–713). El handler de **customer.subscription.updated** no escribe en `subscriptions`.

- **Bug:**  
  El handler de `customer.subscription.updated` hace **early return** y actualiza solo `users`. **Nunca** hace upsert en `public.subscriptions`. Por eso, si la única actualización que Stripe envía al cancelar es `customer.subscription.updated`, la fila en `subscriptions` sigue con `cancel_at_period_end=false` (y el resto de valores de la última vez que se ejecutó la ruta genérica).

- **No hay overwrite:** Ningún otro handler pone después `cancel_at_period_end` a `false` en esa fila; simplemente esa fila no se vuelve a escribir en el evento de cancelación.

---

## 4) Fix mínimo aplicado

**Archivo:** `supabase/functions/stripe-webhook/index.ts`

**Cambio realizado:** En el bloque `customer.subscription.updated` / `customer.subscription.created`:

1. **Select de users** (línea ~477): de `.select('id')` a `.select('id, owner_id')` para disponer de `owner_id`.
2. **Construcción de fila para subscriptions:** `owner_id` (owner_id ?? userRow.id), `user_id`, `plan_id` (= subscriptionPlan), `plan_name` (= getFinalPlanName(subscriptionPlan)), `status` (= mapStatus(subscription.status)), `current_period_start` / `current_period_end` (desde subscription vía unixToIso y expiresAt), **`cancel_at_period_end: !!(subscription.cancel_at_period_end === true)`**, `canceled_at`, `stripe_subscription_id`, `stripe_customer_id`, `metadata` (lastEventType, lastEventId, lastEventAt), `updated_at`.
3. **Upsert:** `supabaseAdmin.from('subscriptions').upsert(subRow, { onConflict: 'stripe_subscription_id' })` en paralelo con el update de users (Promise.all).

Con esto, cuando Stripe envía `customer.subscription.updated` con `cancel_at_period_end: true`, tanto `public.users` como `public.subscriptions` quedan actualizados y la UI puede mostrar "Cancelada. Se desactiva el {date}".

---

## 5) P0 Debug — Webhook no actualiza DB (401 / early-return)

### Causa adicional: 401 antes de procesar

- **Código (líneas 301–308):** Se exigía `Authorization: Bearer ...` para **todas** las peticiones POST. Stripe **no** envía ese header al entregar webhooks; solo envía `stripe-signature`.
- **Efecto:** Las peticiones directas de Stripe al endpoint recibían **401 Unauthorized** y el handler de `customer.subscription.updated` nunca se ejecutaba.

### Fix aplicado (stripe-webhook/index.ts)

- Si la petición trae header **stripe-signature**, no se exige Bearer (se considera entrega directa de Stripe y se valida la firma después).
- Si **no** trae stripe-signature, se mantiene la exigencia de Bearer (y opcionalmente x-internal-webhook-secret) para proxies/llamadas internas.

### Logging seguro añadido

- Al recibir evento (tras parsear): `eventId`, `eventType`, `livemode`, `created`.
- En handler subscription.updated: entrada al handler; sufijos de 6 chars de `subscription.id` y `customer.id` (`subIdSuffix`, `custIdSuffix`); `status` y `cancel_at_period_end` del objeto de Stripe; resultado de update users (ok o error.message); resultado de upsert subscriptions (ok o error.message).
- En error de firma: `message` y `stack` truncado (sin payload completo).

### Early-returns antes de subscription.updated

| Orden | Condición | Archivo:Líneas | Acción |
|-------|-----------|----------------|--------|
| 1 | `req.method !== 'POST'` | 300 | 405 Method not allowed |
| 2 | Sin stripe-signature y sin Bearer | 305–310 | 401 Unauthorized **(corregido: si hay stripe-signature no se exige Bearer)** |
| 3 | Sin stripe-signature y x-internal-webhook-secret incorrecto | 306–308 | 403 Forbidden |
| 4 | Sin header stripe-signature tras body | 317–319 | 400 No stripe-signature header |
| 5 | Sin STRIPE_WEBHOOK_SECRET | 321–324 | 500 |
| 6 | Firma inválida | 326–331 | 400 Invalid signature |
| 7 | JSON inválido | 336–339 | 400 Invalid JSON |
| 8 | DIAG_MINIMAL_OK=true | 357–360 | 200 diag minimal_ok |
| 9 | event.type no en PROCESSED_EVENTS | 362–365 | 200 Event type ignored |
| 10 | Sin STRIPE_SECRET_KEY | 367–371 | 200 Configuration error |
| 11 | Sin SUPABASE_URL o SERVICE_ROLE_KEY | 373–377 | 200 Configuration error |

No hay filtro por **livemode** (test vs live); todos los eventos aceptados se procesan igual.

---

## 6) Checklist — Stripe Dashboard (verificar webhook)

- [ ] **Endpoint URL:** En Developers → Webhooks, el endpoint apunta a la URL de la Edge Function (p. ej. `https://<project>.supabase.co/functions/v1/stripe-webhook`). No a un proxy que exija Bearer sin reenviar stripe-signature.
- [ ] **Signing secret:** El "Signing secret" (whsec_...) del webhook en Dashboard es el mismo que la variable de entorno **STRIPE_WEBHOOK_SECRET** de la Edge (mismo modo: live con live, test con test).
- [ ] **Eventos:** En "Events to send" está incluido **customer.subscription.updated** (y si aplica customer.subscription.deleted, checkout.session.completed, invoice.*).
- [ ] **Entregas:** En la pestaña del webhook, "Recent deliveries" muestra **customer.subscription.updated** con respuesta **200**. Si aparece 401, la petición estaba siendo rechazada por el Bearer check (ya corregido con el fix de stripe-signature).
- [ ] **Modo:** Si la suscripción es de **test** (sub_... en modo test), el webhook debe ser de tipo Test y usar el signing secret de test; si es **live**, el webhook debe ser Live con el secret de live.
