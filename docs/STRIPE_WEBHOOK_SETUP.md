# 🔔 Configuración de Stripe Webhook para Cellarium

## 📋 Resumen

Este documento explica cómo configurar el webhook de Stripe para sincronizar automáticamente el estado de suscripciones y pagos desde Stripe hacia nuestra base de datos.

## 🚀 Pasos de Configuración

### 1. Obtener URL del Endpoint

Tienes dos opciones:

**A) Directo a Supabase (recomendado si no usas proxy)**  
URL del webhook:
```
https://<PROJECT_REF>.functions.supabase.co/stripe-webhook
```
(En Stripe Dashboard → Webhooks → Add endpoint usa esta URL.)

**B) Vía proxy en Vercel**  
Si usas el proxy en este repo (`vercel-site/api/stripe-webhook.ts`), la URL en Stripe debe ser la del proxy, por ejemplo:
```
https://<tu-dominio>.vercel.app/api/stripe-webhook
```
El proxy reenvía **todos** los eventos (incl. `customer.subscription.deleted`, `customer.subscription.updated`) con el body y el header `stripe-signature` intactos. **Importante:** no configurar el proxy para filtrar solo `invoice.*`; si lo haces, las cancelaciones no actualizarán la BD.

Para obtener tu `PROJECT_REF` (opción A):
1. Ve a tu proyecto en Supabase Dashboard
2. Ve a **Settings** → **API**
3. Copia el **Project URL** y extrae el `PROJECT_REF` (la parte antes de `.supabase.co`)

### 2. Crear Webhook en Stripe Dashboard

1. Ve a [Stripe Dashboard](https://dashboard.stripe.com)
2. Navega a **Developers** → **Webhooks**
3. Clic en **Add endpoint**
4. Ingresa la URL del endpoint (del paso 1)
5. En **Events to send**, selecciona estos 4 eventos:
   - ✅ `invoice.paid`
   - ✅ `invoice.payment_failed`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
6. Clic en **Add endpoint**

### 3. Copiar Signing Secret

1. Después de crear el endpoint, verás la página de detalles
2. En la sección **Signing secret**, copia el valor que comienza con `whsec_...`
3. **IMPORTANTE**: Este secreto es único para este endpoint. Guárdalo de forma segura.

### 4. Configurar Variable de Entorno en Supabase

1. Ve a tu proyecto en Supabase Dashboard
2. Navega a **Settings** → **Edge Functions** → **Secrets**
3. Agrega o actualiza el secreto:
   - **Name**: `STRIPE_WEBHOOK_SECRET`
   - **Value**: El valor `whsec_...` que copiaste en el paso 3
4. Clic en **Save**

### 5. Verificar Variables de Entorno Requeridas

Asegúrate de tener configuradas estas variables en Supabase Dashboard → **Settings** → **Edge Functions** → **Secrets**:

- ✅ `STRIPE_SECRET_KEY` (sk_test_... o sk_live_...)
- ✅ `STRIPE_WEBHOOK_SECRET` (whsec_...)
- ✅ `STRIPE_API_VERSION` (opcional; default: "2024-06-20")
- ✅ `SUPABASE_URL` (ya configurado automáticamente)
- ✅ `SUPABASE_SERVICE_ROLE_KEY` (ya configurado automáticamente)

### 6. Desplegar la Edge Function

```bash
supabase functions deploy stripe-webhook
```

O desde Supabase Dashboard:
1. Ve a **Edge Functions**
2. Si la función ya existe, haz clic en **Deploy**
3. Si no existe, súbela manualmente

## 🧪 Probar el Webhook

### Opción 1: Usar Stripe CLI (Recomendado para desarrollo local)

```bash
# Instalar Stripe CLI
# https://stripe.com/docs/stripe-cli

# Login
stripe login

# Forward webhooks a tu función local
stripe listen --forward-to http://localhost:54321/functions/v1/stripe-webhook

# En otra terminal, trigger un evento de prueba
stripe trigger invoice.paid
```

### Opción 2: Usar Stripe Dashboard

1. Ve a **Developers** → **Webhooks**
2. Selecciona tu endpoint
3. Clic en **Send test webhook**
4. Selecciona un evento (ej: `invoice.paid`)
5. Clic en **Send test webhook**

### Opción 3: Verificar Logs

1. Ve a Supabase Dashboard → **Edge Functions** → **stripe-webhook**
2. Ve a la pestaña **Logs**
3. Deberías ver mensajes como:
   - `📥 Webhook recibido: invoice.paid (evt_...)`
   - `✅ Subscription actualizada: ...`
   - `✅ User actualizado: ...`
   - `✅ reconcile_branch_locks ejecutado para owner: ...`

## 📊 Campos Actualizados por Evento

### `invoice.paid`
**Tabla `subscriptions`:**
- `status` → `'active'`
- `current_period_start` (desde invoice lines o subscription)
- `current_period_end` (desde invoice lines o subscription)
- `metadata.lastEventType` → `'invoice.paid'`
- `metadata.lastEventId` → ID del evento
- `metadata.lastEventAt` → timestamp

**Tabla `users`:**
- `subscription_active` → `true`
- `subscription_expires_at` → `current_period_end`
- `subscription_plan` → plan_id (si se puede inferir)

**Acción adicional:**
- ✅ Llama a `reconcile_branch_locks(owner_id)`

---

### `invoice.payment_failed`
**Tabla `subscriptions`:**
- `status` → `'past_due'`
- `current_period_start` (desde invoice lines o subscription)
- `current_period_end` (desde invoice lines o subscription)
- `metadata.lastEventType` → `'invoice.payment_failed'`
- `metadata.lastEventId` → ID del evento
- `metadata.lastEventAt` → timestamp

**Tabla `users`:**
- `subscription_active` → `false`
- `subscription_expires_at` → `current_period_end`
- `subscription_plan` → plan_id (si se puede inferir)

**Acción adicional:**
- ✅ Llama a `reconcile_branch_locks(owner_id)`

---

### `customer.subscription.updated`
**Tabla `subscriptions`:**
- `status` → mapeado desde Stripe status
- `current_period_start` → desde subscription
- `current_period_end` → desde subscription
- `cancel_at_period_end` → desde subscription
- `canceled_at` → desde subscription (si existe)
- `plan_id` → inferido desde price lookup_key (si aplica)
- `metadata.lastEventType` → `'customer.subscription.updated'`
- `metadata.lastEventId` → ID del evento
- `metadata.lastEventAt` → timestamp

**Tabla `users`:**
- `subscription_active` → `true` si status in ('active','trialing'), `false` en otros casos
- `subscription_expires_at` → `current_period_end`
- `subscription_plan` → plan_id (si se puede inferir)

**Acción adicional:**
- ✅ Llama a `reconcile_branch_locks(owner_id)` (solo si status cambió)

---

### `customer.subscription.deleted`
**Tabla `subscriptions`:**
- `status` → `'canceled'` (forzado)
- `current_period_start` → desde subscription
- `current_period_end` → desde subscription
- `canceled_at` → desde subscription
- `metadata.lastEventType` → `'customer.subscription.deleted'`
- `metadata.lastEventId` → ID del evento
- `metadata.lastEventAt` → timestamp

**Tabla `users`:**
- `subscription_active` → `false`
- `subscription_expires_at` → `current_period_end`
- `subscription_plan` → plan_id (si se puede inferir)

**Acción adicional:**
- ✅ Llama a `reconcile_branch_locks(owner_id)`

## 🔒 Seguridad

- ✅ **Firma verificada**: El webhook siempre verifica la firma usando `STRIPE_WEBHOOK_SECRET`
- ✅ **Idempotencia**: Si el mismo evento se procesa dos veces, se detecta y se ignora
- ✅ **No filtra secretos**: Los errores no exponen información sensible
- ✅ **Respuestas rápidas**: Siempre responde 200 rápidamente, procesa en background

## ⚠️ Notas Importantes

1. **Fuente de verdad**: El webhook es la fuente de verdad. No confiar en el frontend para estado de suscripciones.

2. **Mapeo de owner_id**: Si no se puede mapear `stripe_customer_id` a un `owner_id`, el webhook responde 200 pero registra un error en logs. Esto evita reintentos infinitos.

3. **Creación automática**: Si no existe un registro en `subscriptions`, el webhook intenta crearlo automáticamente usando el `stripe_customer_id` para encontrar el `owner_id`.

4. **Bloqueo de sucursales**: El webhook llama automáticamente a `reconcile_branch_locks(owner_id)` después de actualizar suscripciones en eventos críticos.

5. **Fallback fetch**: Si el invoice no incluye información de period, el webhook hace un fetch adicional a Stripe para obtener la subscription completa.

## 🐛 Troubleshooting

### El webhook no recibe eventos
- Verifica que la URL del endpoint sea correcta
- Verifica que los eventos estén seleccionados en Stripe Dashboard
- Revisa los logs en Supabase Dashboard → Edge Functions → Logs

### Error "Webhook signature verification failed"
- Verifica que `STRIPE_WEBHOOK_SECRET` esté configurado correctamente
- Asegúrate de usar el secreto correcto para el endpoint correcto
- El secreto debe comenzar con `whsec_`

### No se actualiza la base de datos
- Revisa los logs de la Edge Function
- Verifica que `SUPABASE_SERVICE_ROLE_KEY` esté configurado
- Verifica que el `stripe_customer_id` exista en la tabla `users`

### Sucursales no se bloquean/desbloquean
- Verifica que `reconcile_branch_locks` se esté llamando (revisa logs)
- Verifica que el `owner_id` sea correcto
- Revisa que la función SQL `reconcile_branch_locks` esté desplegada

## 📚 Referencias

- [Stripe Webhooks Documentation](https://stripe.com/docs/webhooks)
- [Stripe Webhook Events](https://stripe.com/docs/api/events/types)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)



