# send-owner-verification-email / verify-owner-email / ensure-owner-oauth-metadata

## Env vars (Supabase Edge Secrets)

| Variable | Función | Descripción |
|----------|---------|-------------|
| `RESEND_API_KEY` | send-owner-verification-email | API key de Resend (resend.com) |
| `RESEND_FROM_EMAIL` | send-owner-verification-email | Email remitente (ej: `Cellarium <noreply@tudominio.com>`) |
| `EMAIL_VERIFICATION_SALT` | send-owner-verification-email, verify-owner-email | Salt para hashear el código de 6 dígitos (string aleatorio largo) |

Configurar en Dashboard → Project Settings → Edge Functions → Secrets.
