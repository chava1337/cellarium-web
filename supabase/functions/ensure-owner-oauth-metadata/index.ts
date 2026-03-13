// Edge Function: ensure-owner-oauth-metadata
// Tras login con Google, setea signup_method='google' y owner_email_verified=true en public.users
// si el usuario es owner y signup_method es null (evita que owners OAuth queden en "modo prueba").

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
      .select('id, role, signup_method, owner_email_verified')
      .eq('id', authUser.id)
      .maybeSingle();

    if (userErr || !userRow) {
      return jsonResponse({ code: 'USER_NOT_FOUND', message: 'User not found' }, 404);
    }
    if (userRow.role !== 'owner') {
      return jsonResponse({ success: true, updated: false }, 200);
    }
    if (userRow.signup_method != null && userRow.signup_method !== '') {
      return jsonResponse({ success: true, updated: false }, 200);
    }

    const now = new Date().toISOString();
    const { error: updateErr } = await supabaseAdmin
      .from('users')
      .update({
        signup_method: 'google',
        owner_email_verified: true,
        updated_at: now,
      })
      .eq('id', authUser.id);

    if (updateErr) {
      console.error('[ensure-owner-oauth-metadata] update failed', updateErr.message);
      return jsonResponse({ code: 'DB_ERROR', message: 'Error al actualizar' }, 500);
    }

    return jsonResponse({ success: true, updated: true }, 200);
  } catch (e: unknown) {
    console.error('[ensure-owner-oauth-metadata]', e);
    return jsonResponse(
      { code: 'SERVER_ERROR', message: (e as Error)?.message ?? 'Error interno' },
      500
    );
  }
});
