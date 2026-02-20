# API routes (Vercel serverless)

## `stripe-webhook` (proxy)

Reenvía **todos** los webhooks de Stripe a la Edge Function de Supabase `stripe-webhook`, sin filtrar por tipo de evento.

- **URL en producción:** `https://<tu-dominio>.vercel.app/api/stripe-webhook`
- **Configuración en Stripe Dashboard:** Usa esta URL como "Webhook endpoint URL" y selecciona los eventos que quieras (incluye `customer.subscription.deleted`, `customer.subscription.updated`, `invoice.*`, etc.).

### Comportamiento

- Lee el body como **raw string** (`req.text()`), no como JSON.
- Reenvía el **mismo body** y el header **`stripe-signature`** a Supabase para que la Edge Function pueda verificar la firma.
- **No filtra** por `event.type`: reenvía todos los eventos que Stripe envía al endpoint.
- Log: `[PROXY] received { eventType, hasSig, bodyLen }` y tras el forward `[PROXY] forward { eventType, status, ok, responsePreview }` (sin secretos).

### Variables de entorno (Vercel)

Configurar en **Vercel → Project → Settings → Environment Variables**:

| Variable | Descripción |
|----------|-------------|
| `SUPABASE_INTERNAL_WEBHOOK_URL` | URL de la Edge Function, p. ej. `https://<project-ref>.supabase.co/functions/v1/stripe-webhook` |
| `INTERNAL_EDGE_AUTH_TOKEN` o `SUPABASE_SERVICE_ROLE_KEY` | Bearer token que acepta la Edge Function (Authorization header) |
| `INTERNAL_WEBHOOK_SHARED_SECRET` | Valor que la Edge Function espera en `x-internal-webhook-secret` (si está configurado) |

### Criterio de éxito / Checklist

1. **Trigger test en Stripe:** Developers → Webhooks → Send test webhook (p. ej. `invoice.paid`).
2. **Vercel Logs:** `[PROXY] received` y `[PROXY] forward` con `status: 200`, `ok: true`.
3. **Supabase Edge Logs (stripe-webhook):** `[BOOT]` y luego el evento; tras checkout, `[USER_UPDATED]` y fila en `public.subscriptions`.
4. **BD:** `public.subscriptions` con fila para el owner; `public.users` con `subscription_plan`, `subscription_active`, `stripe_subscription_id` actualizados.

Ver `docs/AUDIT_STRIPE_WEBHOOK_PROXY.md` para diagnóstico si no llegan eventos.
