// Edge Function: send-welcome-email
// Correo de bienvenida para owners (Resend). Idempotente vía users.welcome_email_sent_at.
// Invocación server-to-server: Authorization Bearer = SUPABASE_SERVICE_ROLE_KEY.
// Requiere: RESEND_API_KEY, RESEND_FROM_EMAIL

import { createClient } from 'jsr:@supabase/supabase-js@2';

const LOG = '[send-welcome-email]';
const SUPPORT_URL = 'https://www.cellarium.net/support';
const TERMS_URL = 'https://www.cellarium.net/terms';
const PRIVACY_URL = 'https://www.cellarium.net/privacy';
/** Landing público para CTA «Abrir Cellarium» (sin deep link específico de la app). */
const CELLARIUM_SITE_URL = 'https://www.cellarium.net';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

type SkipReason = 'not_owner' | 'no_email' | 'already_sent';

function jsonResponse(body: object, status: number): Response {
  return new Response(JSON.stringify(body), { headers: corsHeaders, status });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildWelcomeHtml(displayName: string): string {
  const greeting = displayName ? `Hola, ${escapeHtml(displayName)}` : 'Hola';
  return `
<!DOCTYPE html>
<html lang="es-MX">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#2C2C2C;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F6;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:10px;border:1px solid #e8e8ec;overflow:hidden;">
        <tr><td style="padding:26px 32px;text-align:center;background:linear-gradient(135deg,#924048,#6f2f37);">
          <p style="margin:0;font-size:22px;font-weight:700;letter-spacing:0.06em;color:#F4F4F6;text-transform:none;">Cellarium</p>
          <p style="margin:10px 0 0;font-size:13px;font-weight:400;color:rgba(244,244,246,0.92);letter-spacing:0.02em;">Tu carta digital premium</p>
        </td></tr>
        <tr><td style="padding:30px 32px;">
          <p style="margin:0 0 18px;font-size:17px;line-height:1.45;font-weight:500;color:#2C2C2C;">${greeting},</p>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#2C2C2C;">
            Te damos la bienvenida a <strong style="color:#4e2228;">Cellarium</strong>. Estamos muy contentos de acompañarte a dar vida a tu carta digital.
          </p>
          <p style="margin:0 0 10px;font-size:14px;line-height:1.65;font-weight:700;color:#4e2228;text-transform:uppercase;letter-spacing:0.04em;">Primer paso imprescindible</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#2C2C2C;">
            Para arrancar, <strong>agrega vinos y cócteles a tu catálogo</strong> desde nuestra base de datos oficial. Ahí encuentras etiquetas ya listas para que tu menú luzca impecable.
          </p>
          <p style="margin:0 0 10px;font-size:14px;line-height:1.65;font-weight:700;color:#4e2228;text-transform:uppercase;letter-spacing:0.04em;">¿Dónde están el resto de las funciones?</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#2C2C2C;">
            Para usar <strong>todas las funciones de Cellarium</strong>, toca el ícono de <strong>engrane</strong> en la parte <strong>superior derecha</strong> de la pantalla dentro de la app. Desde ahí accedes al menú donde se encuentran tus herramientas.
          </p>
          <p style="margin:0 0 10px;font-size:14px;line-height:1.65;font-weight:700;color:#4e2228;text-transform:uppercase;letter-spacing:0.04em;">Tu catálogo para comensales (QR)</p>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#2C2C2C;">
            Para que tus comensales vean tu menú necesitas tu código QR:
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;padding-left:0;">
            <tr><td style="padding:0 0 6px;font-size:15px;line-height:1.6;color:#2C2C2C;"><span style="color:#924048;font-weight:bold;">1.</span> Entra a la pantalla donde se <strong>generan los códigos QR</strong>.</td></tr>
            <tr><td style="padding:0 0 6px;font-size:15px;line-height:1.6;color:#2C2C2C;"><span style="color:#924048;font-weight:bold;">2.</span> Genera tu código QR.</td></tr>
            <tr><td style="padding:0;font-size:15px;line-height:1.6;color:#2C2C2C;"><span style="color:#924048;font-weight:bold;">3.</span> Comparte ese código (por ejemplo impreso o desde el dispositivo) con quien quieras que consulte tu catálogo.</td></tr>
          </table>
          <p style="margin:0 0 10px;font-size:14px;line-height:1.65;font-weight:700;color:#4e2228;text-transform:uppercase;letter-spacing:0.04em;">Tu plan hoy</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#2C2C2C;background:#F4F4F6;padding:14px 16px;border-radius:8px;border-left:4px solid #924048;">
            Inicias en el plan <strong>Café</strong>, nuestra opción <strong>sin costo</strong>. Es ideal para conocer la app: permite hasta <strong>máximo 10 vinos</strong> y <strong>máximo 10 cócteles</strong>.
          </p>
          <p style="margin:0 0 10px;font-size:14px;line-height:1.65;font-weight:700;color:#4e2228;text-transform:uppercase;letter-spacing:0.04em;">¿Quieres más carta?</p>
          <p style="margin:0 0 26px;font-size:15px;line-height:1.65;color:#2C2C2C;">
            Si necesitas más posiciones en tu menú, puede contratar una <strong>suscripción</strong>: entra en el apartado de <strong>Suscripciones</strong> dentro de la app para ver planes y opciones.
          </p>
          <p style="margin:0;text-align:center;">
            <a href="${CELLARIUM_SITE_URL}" style="display:inline-block;padding:14px 28px;background:#924048;color:#F4F4F6;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">Abrir Cellarium</a>
          </p>
          <p style="margin:20px 0 0;text-align:center;font-size:14px;line-height:1.6;color:#6A6A6A;">
            ¿Dudas? <a href="${SUPPORT_URL}" style="color:#924048;font-weight:600;text-decoration:none;">Ir a soporte</a>
          </p>
        </td></tr>
        <tr><td style="padding:18px 32px 26px;text-align:center;border-top:1px solid #eaeaea;background:#fafafa;">
          <p style="margin:0 0 12px;font-size:12px;line-height:1.55;color:#6A6A6A;">
            <a href="${TERMS_URL}" style="color:#6f2f37;text-decoration:none;">Términos</a>
            &nbsp;·&nbsp;
            <a href="${PRIVACY_URL}" style="color:#6f2f37;text-decoration:none;">Privacidad</a>
          </p>
          <p style="margin:0;font-size:12px;color:#6A6A6A;">— Cellarium</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();
}

function buildWelcomePlainText(displayName: string): string {
  const line = '\n';
  const hi = displayName.trim() ? `Hola, ${displayName},` : 'Hola,';
  const parts = [
    hi,
    '',
    'Te damos la bienvenida a Cellarium.',
    '',
    'PRIMER PASO',
    'Para comenzar, agrega vinos y cócteles a tu catálogo desde nuestra base de datos.',
    '',
    '¿DÓNDE ESTÁN LAS FUNCIONES?',
    'Para usar todas las funciones de Cellarium, toca el ícono de engrane en la parte superior derecha de la pantalla en la app.',
    '',
    'CÓDIGO QR PARA TUS COMENSALES',
    '1. Entra a la pantalla de generación de códigos QR.',
    '2. Genera tu código QR.',
    '3. Compártelo con quien quieras que vea tu catálogo.',
    '',
    'TU PLAN',
    'Inicias en el plan Café (gratis), con hasta 10 vinos y 10 cócteles.',
    '',
    'SUSCRIPCIONES',
    'Para expandir tu menú, entra al apartado de Suscripciones en la app.',
    '',
    `Abrir sitio Cellarium: ${CELLARIUM_SITE_URL}`,
    `Soporte: ${SUPPORT_URL}`,
    `Términos: ${TERMS_URL}`,
    `Privacidad: ${PRIVACY_URL}`,
    '',
    '— Cellarium',
  ];
  return parts.join(line);
}

function authorizeServiceRole(req: Request, serviceKey: string): boolean {
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.replace(/^\s*Bearer\s+/i, '').trim();
  return token.length > 0 && token === serviceKey;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL');

    if (!supabaseUrl || !serviceKey) {
      console.error(`${LOG} missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`);
      return jsonResponse({ code: 'CONFIG_ERROR', message: 'Server configuration error' }, 500);
    }
    if (!authorizeServiceRole(req, serviceKey)) {
      return jsonResponse({ code: 'UNAUTHORIZED', message: 'Service role required' }, 401);
    }
    if (!resendKey || !fromEmail) {
      console.error(`${LOG} missing RESEND_API_KEY or RESEND_FROM_EMAIL`);
      return jsonResponse({ code: 'CONFIG_ERROR', message: 'Server configuration error' }, 500);
    }

    let body: { userId?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ code: 'INVALID_BODY', message: 'Body JSON inválido' }, 400);
    }

    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!userId || !isUuid(userId)) {
      return jsonResponse({ code: 'INVALID_USER_ID', message: 'userId (UUID) requerido' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: userRow, error: userErr } = await supabaseAdmin
      .from('users')
      .select('id, email, name, role, signup_method, welcome_email_sent_at')
      .eq('id', userId)
      .maybeSingle();

    if (userErr) {
      console.error(`${LOG} select user failed`, userErr.message);
      return jsonResponse({ code: 'DB_ERROR', message: 'Error al leer usuario' }, 500);
    }
    if (!userRow) {
      return jsonResponse({ code: 'USER_NOT_FOUND', message: 'Usuario no encontrado' }, 404);
    }

    if (userRow.role !== 'owner') {
      console.log(`${LOG} skip not_owner`, { userId });
      return jsonResponse({ success: true, sent: false, reason: 'not_owner' satisfies SkipReason }, 200);
    }

    if (userRow.welcome_email_sent_at) {
      console.log(`${LOG} skip already_sent`, { userId });
      return jsonResponse({ success: true, sent: false, reason: 'already_sent' satisfies SkipReason }, 200);
    }

    const toEmail = typeof userRow.email === 'string' ? userRow.email.trim() : '';
    if (!toEmail) {
      console.log(`${LOG} skip no_email`, { userId });
      return jsonResponse({ success: true, sent: false, reason: 'no_email' satisfies SkipReason }, 200);
    }

    const displayName =
      typeof userRow.name === 'string' && userRow.name.trim() ? userRow.name.trim() : '';
    const subject = 'Bienvenido a Cellarium — primeros pasos para crear tu carta digital';
    const html = buildWelcomeHtml(displayName);
    const text = buildWelcomePlainText(displayName);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject,
        html,
        text,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`${LOG} Resend failed`, { userId, status: res.status, preview: errBody.slice(0, 200) });
      return jsonResponse(
        { code: 'EMAIL_FAILED', message: 'No se pudo enviar el correo de bienvenida' },
        502
      );
    }

    const now = new Date().toISOString();
    const { data: updatedRows, error: updateErr } = await supabaseAdmin
      .from('users')
      .update({ welcome_email_sent_at: now, updated_at: now })
      .eq('id', userId)
      .is('welcome_email_sent_at', null)
      .select('id');

    if (updateErr) {
      console.error(`${LOG} update welcome_email_sent_at failed`, { userId, message: updateErr.message });
      return jsonResponse(
        {
          code: 'DB_ERROR',
          message: 'Correo enviado pero no se pudo registrar el estado. Revisar logs.',
        },
        500
      );
    }

    if (!updatedRows?.length) {
      console.log(`${LOG} concurrent already_sent after send`, { userId });
      return jsonResponse({ success: true, sent: false, reason: 'already_sent' satisfies SkipReason }, 200);
    }

    console.log(`${LOG} sent`, { userId, signup_method: userRow.signup_method ?? null });
    return jsonResponse(
      {
        success: true,
        sent: true,
        welcome_email_sent_at: now,
      },
      200
    );
  } catch (e: unknown) {
    console.error(LOG, e);
    return jsonResponse(
      { code: 'SERVER_ERROR', message: (e as Error)?.message ?? 'Error interno' },
      500
    );
  }
});
