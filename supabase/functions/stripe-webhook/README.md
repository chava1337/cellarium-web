# stripe-webhook

Edge Function que recibe eventos de Stripe (directamente desde Stripe o vía proxy con firma verificada) y mantiene **public.users** como fuente de verdad: `subscription_id`, `subscription_active`, `subscription_plan`, `subscription_expires_at`.

## Eventos que procesa

- **customer.subscription.created** → fuente de verdad del PLAN. Actualiza `users` por `stripe_customer_id` (plan desde `subscription.items.data[0].price.lookup_key`).
- **customer.subscription.updated** → mismo flujo (upgrade/downgrade desde Customer Portal).
- **customer.subscription.deleted** → pone `subscription_active=false`, `subscription_plan='free'`, `subscription_id=null`, `subscription_expires_at=null`.
- **checkout.session.completed** → actualiza `subscriptions` y `users` (incl. `subscription_plan`).
- **invoice.payment_succeeded** / **invoice.paid** / **invoice.payment_failed** → actualizan `subscriptions` y `users` pero **NO sobrescriben `subscription_plan`** (evita que prorrateos reviertan el plan).

La firma se verifica con `STRIPE_WEBHOOK_SECRET`. Si no hay usuario con el `stripe_customer_id` del evento, se responde 200 y se registra en logs (idempotencia).

**Saneamiento:** Tras hacer upsert de la suscripción vigente en `subscriptions`, el webhook marca como `status = 'canceled'` todas las demás filas con `owner_id` igual y `status = 'active'`. Así se garantiza que por cada owner solo haya una suscripción activa vigente. En cuentas de prueba con múltiples intentos de checkout esto evita filas duplicadas activas.

## Proxy (opcional)

Si usas el proxy en **vercel-site** (`vercel-site/api/stripe-webhook.ts`):

- Stripe debe apuntar a la URL del proxy (p. ej. `https://tu-dominio.vercel.app/api/stripe-webhook`).
- El proxy **debe reenviar todos los eventos** (no solo `invoice.*`): incluye `customer.subscription.deleted` y `customer.subscription.updated` para que las cancelaciones actualicen la BD.
- El proxy debe enviar el **raw body** y el header **`stripe-signature`** sin modificar.

## Variables de entorno

- `STRIPE_WEBHOOK_SECRET` – obligatorio para verificar `stripe-signature`.
- `STRIPE_SECRET_KEY` – para expandir subscription/price si hace falta.
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` – para leer/escribir `users` (y `subscriptions`).

## DIAG FLAGS (solo diagnóstico)

Variables de entorno que permiten aislar el bloque que dispara errores tipo `runMicrotasks` / UncaughtException. Todas son opcionales; si no están o no son `"true"`, el flujo es el normal.

| Flag | Efecto |
|------|--------|
| `DIAG_MINIMAL_OK` | Tras verificar firma y parsear evento: loguea `[DIAG] MINIMAL_OK=true`, responde 200 `{ ok: true, diag: 'minimal_ok' }`. No hace reconcile, ni llamadas Stripe, ni DB. |
| `DIAG_SKIP_STRIPE_API_FETCH` | No llama a la API de Stripe (ni en subscription.updated/created ni en invoice ni en el fetch principal de subscription). Responde 200 con diag en esas ramas. |
| `DIAG_SKIP_INVOICE_PARSE` | En eventos `invoice.*`: no entra al bloque que deriva subscriptionId desde invoice; responde 200 con diag. |
| `DIAG_SKIP_SUBSCRIPTION_LOOKUP` | Antes de hacer el GET subscription principal: responde 200 con diag (no resuelve lookup_key ni metadata desde subscription). |
| `DIAG_SKIP_DB_UPSERT` | No hace UPSERT a `subscriptions` ni update a `users`; responde 200 con diag. |
| `DIAG_SKIP_RECONCILE_BRANCH_LOCKS` | No llama a `reconcile_branch_locks`; el resto del flujo sigue igual. |

**Uso:** Activar un solo flag (valor `"true"`) y reproducir el caso (p. ej. upgrade Pro → Business). Si el error desaparece, el bloque que se salta es el que dispara el crash. Los logs incluyen `[DIAG] reached: BEFORE_DB_UPSERT`, `AFTER_DB_UPSERT`, `BEFORE_RETURN_200` para ver hasta dónde llegó el handler.

## Pruebas manuales

### 1. Eventos a revisar en Stripe

- **Dashboard Stripe → Developers → Webhooks** → tu endpoint.
- **Eventos útiles:**
  - `customer.subscription.updated` (cambio de plan en Portal, renovación).
  - `customer.subscription.deleted` (cancelación).
  - `customer.subscription.created` (nueva suscripción vía Checkout).
  - `invoice.payment_succeeded` (pago exitoso).

### 2. Comprobar una sola suscripción activa

- En Stripe: **Customers** → elegir el cliente → pestaña **Subscriptions**. No debe haber más de una suscripción activa por cliente.
- Si el usuario cambia de plan desde el Customer Portal, Stripe debe **actualizar** la misma suscripción (mismo `sub_xxx`), no crear una segunda.

### 3. Verificar la fila del usuario en la BD

Después de un cambio de plan o cancelación, revisar que `public.users` refleje el estado:

```sql
SELECT id, email, stripe_customer_id, subscription_id, subscription_active, subscription_plan, subscription_expires_at
FROM public.users
WHERE stripe_customer_id = 'cus_XXXXXXXXXX';
```

- Tras **upgrade/downgrade en Portal**: `subscription_id` debe seguir siendo el mismo `sub_xxx`, `subscription_plan` debe ser `basic` (Pro) o `additional-branch` (Business), `subscription_active = true`, `subscription_expires_at` con la fecha del periodo actual.
- Tras **cancelación**: `subscription_active = false`, `subscription_plan = 'free'`, `subscription_id = null`, `subscription_expires_at = null`.

### 4. Logs de la función

En los logs de la Edge Function buscar:

- `[WEBHOOK] <tipo> <event.id>`
- `[SUB_UPDATED] userId, customerId, subscriptionId, status, plan, expires`
- `[SUB_DELETED] userId, customerId, subscriptionId`

Si aparece `no user for stripe_customer_id, ack 200`, el usuario no tiene ese `stripe_customer_id` en `public.users` (idempotencia: se responde 200).

### 5. Casos de prueba manual

- **Caso A (Checkout Pro):** Nuevo checkout Pro → `users.subscription_plan = basic`.
- **Caso B (Upgrade Portal Pro → Business):** Cambio en Portal → `users.subscription_plan = additional-branch` aunque llegue `invoice.paid` de prorrateo (el invoice NO sobrescribe el plan).
- **Caso C (Downgrade Portal Business → Pro):** Cambio en Portal → `users.subscription_plan = basic`.
- **Caso D (Cancel):** Cancelación → `users.subscription_plan = free`, `subscription_active = false`, `subscription_id = null`, `subscription_expires_at = null`.
