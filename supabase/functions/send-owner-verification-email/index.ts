// Edge Function: send-owner-verification-email
// Envía código de 6 dígitos por email para verificar correo de owner (registro manual).
// Requiere: RESEND_API_KEY, RESEND_FROM_EMAIL, EMAIL_VERIFICATION_SALT

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function jsonResponse(body: object, status: number): Response {
  return new Response(JSON.stringify(body), { headers: corsHeaders, status });
}

async function sha256Hex(message: string): Promise<string> {
  const enc = new TextEncoder();
  const data = await crypto.subtle.digest('SHA-256', enc.encode(message));
  return Array.from(new Uint8Array(data))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomSixDigit(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return String(n);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ code: 'AUTH_MISSING', message: 'Missing Bearer token' }, 401);
    }
    const token = authHeader.replace(/^\s*Bearer\s+/i, '').trim();
    if (!token) return jsonResponse({ code: 'AUTH_MISSING', message: 'Missing Bearer token' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ code: 'CONFIG_ERROR', message: 'Server configuration error' }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: { user: authUser }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authUser?.id) {
      return jsonResponse({ code: 'AUTH_INVALID', message: 'Invalid token' }, 401);
    }

    const { data: userRow, error: userErr } = await supabaseAdmin
      .from('users')
      .select('id, role, signup_method, owner_email_verified, email')
      .eq('id', authUser.id)
      .maybeSingle();

    if (userErr || !userRow) {
      return jsonResponse({ code: 'USER_NOT_FOUND', message: 'User not found' }, 404);
    }
    if (userRow.role !== 'owner') {
      return jsonResponse({ code: 'FORBIDDEN', message: 'Solo el owner puede solicitar verificación' }, 403);
    }
    if (userRow.signup_method !== 'password') {
      return jsonResponse({ code: 'NOT_APPLICABLE', message: 'Verificación no requerida para este tipo de cuenta' }, 400);
    }
    if (userRow.owner_email_verified === true) {
      return jsonResponse({ code: 'ALREADY_VERIFIED', message: 'Correo ya verificado' }, 400);
    }

    const salt = Deno.env.get('EMAIL_VERIFICATION_SALT');
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL');
    if (!salt || !resendKey || !fromEmail) {
      console.error('[send-owner-verification-email] missing RESEND_* or EMAIL_VERIFICATION_SALT');
      return jsonResponse({ code: 'CONFIG_ERROR', message: 'Server configuration error' }, 500);
    }

    const code = randomSixDigit();
    const tokenHash = await sha256Hex(code + salt);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { error: insertErr } = await supabaseAdmin
      .from('email_verification_tokens')
      .insert({
        owner_id: userRow.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

    if (insertErr) {
      console.error('[send-owner-verification-email] insert token failed', insertErr.message);
      return jsonResponse({ code: 'DB_ERROR', message: 'No se pudo generar el código' }, 500);
    }

    const toEmail = userRow.email ?? authUser.email;
    if (!toEmail) {
      return jsonResponse({ code: 'NO_EMAIL', message: 'No hay correo asociado' }, 400);
    }

    const subject = 'Cellarium – Código de verificación de correo';
    const html = `
      <p>Hola,</p>
      <p>Tu código de verificación es: <strong>${code}</strong></p>
      <p>Válido por 15 minutos. No lo compartas con nadie.</p>
      <p>Si no solicitaste este código, ignora este correo.</p>
      <p>— Cellarium</p>
    `.trim();

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('[send-owner-verification-email] Resend failed', res.status, errBody);
      return jsonResponse(
        { code: 'EMAIL_FAILED', message: 'No se pudo enviar el correo. Intenta más tarde.' },
        502
      );
    }

    return jsonResponse({ success: true, message: 'Código enviado al correo' }, 200);
  } catch (e: unknown) {
    console.error('[send-owner-verification-email]', e);
    return jsonResponse(
      { code: 'SERVER_ERROR', message: (e as Error)?.message ?? 'Error interno' },
      500
    );
  }
});
