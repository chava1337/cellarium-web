# send-welcome-email

Envía el correo de bienvenida a **owners** vía Resend. Idempotente con `public.users.welcome_email_sent_at`.

## Invocación

Solo **server-to-server** (otras Edge Functions o backend con service role):

```http
POST /functions/v1/send-welcome-email
Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
Content-Type: application/json

{ "userId": "<uuid>" }
```

Ejemplo desde otra Edge Function (Deno):

```ts
const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-welcome-email`;
const res = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ userId: ownerId }),
});
```

## Secrets

| Variable | Descripción |
|----------|-------------|
| `SUPABASE_URL` | Automático en Edge |
| `SUPABASE_SERVICE_ROLE_KEY` | Automático; también se usa para autorizar la llamada |
| `RESEND_API_KEY` | API key Resend |
| `RESEND_FROM_EMAIL` | Remitente (ej. `Cellarium <noreply@tudominio.com>`) |

## Respuestas

| Caso | HTTP | Cuerpo |
|------|------|--------|
| Enviado | 200 | `{ success: true, sent: true, welcome_email_sent_at }` |
| Ya enviado / no owner / sin email | 200 | `{ success: true, sent: false, reason }` |
| Usuario inexistente | 404 | `{ code: 'USER_NOT_FOUND' }` |
| userId inválido | 400 | `{ code: 'INVALID_USER_ID' }` |
| Sin service role | 401 | `{ code: 'UNAUTHORIZED' }` |
| Resend falló | 502 | `{ code: 'EMAIL_FAILED' }` |

`reason`: `already_sent` \| `not_owner` \| `no_email`

## Idempotencia

1. Si `welcome_email_sent_at` ya tiene valor → **no** se llama a Resend.
2. Tras Resend OK → `UPDATE users SET welcome_email_sent_at = now() WHERE id = ? AND welcome_email_sent_at IS NULL`.
3. Si el UPDATE no afecta filas (carrera concurrente) → respuesta `already_sent` sin error.

## Deploy

```bash
supabase functions deploy send-welcome-email
```
