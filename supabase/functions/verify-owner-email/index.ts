// Edge Function: verify-owner-email
// Verifica código de 6 dígitos y marca owner_email_verified=true en public.users.
// Requiere: EMAIL_VERIFICATION_SALT

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

    let body: { code?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ code: 'INVALID_BODY', message: 'Body JSON inválido' }, 400);
    }
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      return jsonResponse({ code: 'INVALID_CODE', message: 'Código debe ser 6 dígitos' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const salt = Deno.env.get('EMAIL_VERIFICATION_SALT');
    if (!supabaseUrl || !serviceKey || !salt) {
      return jsonResponse({ code: 'CONFIG_ERROR', message: 'Server configuration error' }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: { user: authUser }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authUser?.id) {
      return jsonResponse({ code: 'AUTH_INVALID', message: 'Invalid token' }, 401);
    }

    const tokenHash = await sha256Hex(code + salt);

    const { data: tokenRow, error: tokenErr } = await supabaseAdmin
      .from('email_verification_tokens')
      .select('id, owner_id, expires_at, used_at')
      .eq('owner_id', authUser.id)
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (tokenErr || !tokenRow) {
      return jsonResponse({ code: 'INVALID_CODE', message: 'Código inválido o expirado' }, 400);
    }
    if (tokenRow.used_at) {
      return jsonResponse({ code: 'CODE_ALREADY_USED', message: 'Este código ya fue usado' }, 400);
    }
    if (new Date(tokenRow.expires_at) < new Date()) {
      return jsonResponse({ code: 'CODE_EXPIRED', message: 'Código expirado' }, 400);
    }

    const now = new Date().toISOString();
    const { error: updateTokenErr } = await supabaseAdmin
      .from('email_verification_tokens')
      .update({ used_at: now })
      .eq('id', tokenRow.id);

    if (updateTokenErr) {
      console.error('[verify-owner-email] update token failed', updateTokenErr.message);
      return jsonResponse({ code: 'DB_ERROR', message: 'Error al verificar' }, 500);
    }

    const { error: updateUserErr } = await supabaseAdmin
      .from('users')
      .update({ owner_email_verified: true, updated_at: now })
      .eq('id', authUser.id);

    if (updateUserErr) {
      console.error('[verify-owner-email] update user failed', updateUserErr.message);
      return jsonResponse({ code: 'DB_ERROR', message: 'Error al actualizar perfil' }, 500);
    }

    return jsonResponse({ success: true, message: 'Correo verificado correctamente' }, 200);
  } catch (e: unknown) {
    console.error('[verify-owner-email]', e);
    return jsonResponse(
      { code: 'SERVER_ERROR', message: (e as Error)?.message ?? 'Error interno' },
      500
    );
  }
});
