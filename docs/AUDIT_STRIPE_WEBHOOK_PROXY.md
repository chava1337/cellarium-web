# Auditoría: Stripe → Vercel proxy → Supabase stripe-webhook

## 1) Dónde está el endpoint webhook

| Qué | Dónde |
|-----|--------|
| **Proxy (recibe Stripe)** | `vercel-site/api/stripe-webhook.ts` (Vercel serverless Edge) |
| **Ruta pública** | `POST https://<tu-dominio>.vercel.app/api/stripe-webhook` |
| **Destino Supabase** | URL en env: `SUPABASE_INTERNAL_WEBHOOK_URL` → debe ser `https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook` |

**Variables de entorno (Vercel):**

- `SUPABASE_INTERNAL_WEBHOOK_URL` – URL completa de la Edge Function (sin trailing slash).
- `INTERNAL_EDGE_AUTH_TOKEN` o `SUPABASE_SERVICE_ROLE_KEY` – Bearer para que la Edge acepte la llamada.
- `INTERNAL_WEBHOOK_SHARED_SECRET` – (opcional) mismo valor que en Supabase para `x-internal-webhook-secret`.

---

## 2) Cómo hace el forward el proxy

- **Body:** Lee `await req.text()` (raw) y reenvía el **mismo string** en `body: rawBody`. No re-serializa JSON → la firma de Stripe sigue siendo válida.
- **Headers que reenvía/usa:**
  - `content-type` – el que envía Stripe (o `application/json`).
  - `stripe-signature` – el que envía Stripe (obligatorio para verificación en la Edge).
  - `authorization: Bearer <token>` – token desde Vercel (INTERNAL_EDGE_AUTH_TOKEN o SUPABASE_SERVICE_ROLE_KEY).
  - `x-internal-webhook-secret` – desde INTERNAL_WEBHOOK_SHARED_SECRET (opcional).
- **Verificación de firma:** Se hace **en Supabase** (Edge Function con STRIPE_WEBHOOK_SECRET). El proxy no verifica; solo reenvía body + `stripe-signature`.

---

## 3) Por qué Supabase puede no recibir eventos

| Causa | Comprobación |
|-------|----------------|
| **URL incorrecta** | En Vercel, `SUPABASE_INTERNAL_WEBHOOK_URL` debe ser exactamente `https://<ref>.supabase.co/functions/v1/stripe-webhook`. Si falta `/functions/v1/` o el path, la request no llega a la función. |
| **Bearer vacío** | La Edge exige `Authorization: Bearer <token>`. Si en Vercel no hay INTERNAL_EDGE_AUTH_TOKEN ni SUPABASE_SERVICE_ROLE_KEY, el proxy envía `Bearer ` → la Edge responde 401 (y puede no loguear [BOOT] si el gateway corta antes). |
| **Firma rechazada** | Si el body cambia o el `stripe-signature` no se reenvía, la Edge devuelve 400 tras verificar. Deberías ver [BOOT] y luego error en logs. |
| **Stripe no llama al proxy** | En Stripe Dashboard → Webhooks el endpoint debe ser la URL del proxy (`https://<dominio>.vercel.app/api/stripe-webhook`), no la URL directa de Supabase. |
| **Route mismatch** | Supabase espera path `/functions/v1/stripe-webhook`. La variable debe incluir ese path completo. |

---

## 4) Fix aplicado en el proxy

- Normalización de URL (trim, quitar trailing slash).
- Aviso en log si no hay Bearer token.
- Log tras el forward: `status`, `ok`, y preview corto de la respuesta si no es 2xx (sin secretos).
- Comentario en código con la URL esperada.

---

## 5) Checklist de pruebas

1. **Vercel env**
   - [ ] `SUPABASE_INTERNAL_WEBHOOK_URL` = `https://<PROJECT_REF>.supabase.co/functions/stripe-webhook` (sustituir PROJECT_REF; sin barra final).
   - [ ] `SUPABASE_SERVICE_ROLE_KEY` (o `INTERNAL_EDGE_AUTH_TOKEN`) definido.
   - [ ] Si en Supabase está definido `INTERNAL_WEBHOOK_SHARED_SECRET`, el mismo valor en Vercel como `INTERNAL_WEBHOOK_SHARED_SECRET`.

2. **Stripe**
   - [ ] Webhook endpoint URL = `https://<tu-dominio>.vercel.app/api/stripe-webhook`.
   - [ ] Eventos incluyen al menos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` / `invoice.payment_succeeded`.

3. **Trigger test**
   - En Stripe Dashboard → Developers → Webhooks → tu endpoint → “Send test webhook” (p. ej. `checkout.session.completed` o `invoice.paid`).
   - En Vercel → Project → Logs: buscar `[PROXY] received` y `[PROXY] forward` con `status: 200` y `ok: true`.
   - En Supabase → Edge Functions → stripe-webhook → Logs: buscar `[BOOT]` y luego el evento correspondiente.

4. **BD**
   - Tras un pago real o test que simule checkout completado, en `public.subscriptions` debe aparecer una fila con `stripe_subscription_id` y `owner_id` correctos, y en `public.users` los campos `subscription_plan`, `subscription_active`, `stripe_subscription_id` actualizados.
