// Edge Function: ensure-owner-oauth-metadata
// Tras login con Google o Apple (nativo), setea signup_method y owner_email_verified en public.users
// si el usuario es owner y signup_method es null (evita owners OAuth en "modo prueba").
// También sincroniza nombre desde user_metadata (full_name) cuando aplica.

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

/** Hide My Email: el trigger puede haber guardado split_part(email) como name (opaco). */
function isRelayPlaceholderName(name: string, email: string | null | undefined): boolean {
  if (!email || !name.trim()) return false;
  const em = email.toLowerCase();
  if (!em.endsWith('@privaterelay.appleid.com')) return false;
  const at = email.indexOf('@');
  const local = at > 0 ? email.slice(0, at) : '';
  return local === name.trim();
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
      .select('id, role, signup_method, owner_email_verified, name, email')
      .eq('id', authUser.id)
      .maybeSingle();

    if (userErr || !userRow) {
      return jsonResponse({ code: 'USER_NOT_FOUND', message: 'User not found' }, 404);
    }
    if (userRow.role !== 'owner') {
      return jsonResponse({ success: true, updated: false }, 200);
    }

    const appMeta = authUser.app_metadata as Record<string, unknown> | undefined;
    const providers = appMeta?.providers as string[] | undefined;
    const appProvider = typeof appMeta?.provider === 'string' ? appMeta.provider : undefined;
    const identities = (authUser.identities ?? []) as Array<{ provider?: string }>;
    const idProvider = identities.find((i) => i.provider === 'apple' || i.provider === 'google')?.provider;

    const oauthProvider: 'google' | 'apple' | null =
      appProvider === 'apple' || idProvider === 'apple' || providers?.includes('apple')
        ? 'apple'
        : appProvider === 'google' || idProvider === 'google' || providers?.includes('google')
          ? 'google'
          : null;

    if (!oauthProvider) {
      return jsonResponse({ success: true, updated: false, reason: 'not_oauth' }, 200);
    }

    const meta = authUser.user_metadata as Record<string, unknown> | undefined;
    const fullName =
      typeof meta?.full_name === 'string'
        ? meta.full_name.trim()
        : typeof meta?.name === 'string'
          ? meta.name.trim()
          : '';

    const now = new Date().toISOString();
    const needsSignup =
      userRow.signup_method == null || String(userRow.signup_method).trim() === '';
    const nameFromMeta = fullName.length > 0 ? fullName : null;
    const rowEmail = typeof userRow.email === 'string' ? userRow.email : '';
    const currentName =
      userRow.name != null && String(userRow.name).trim() !== ''
        ? String(userRow.name).trim()
        : '';
    const shouldFillName = Boolean(
      nameFromMeta &&
        (!currentName || isRelayPlaceholderName(currentName, rowEmail || authUser.email)),
    );

    if (!needsSignup && !shouldFillName) {
      return jsonResponse({ success: true, updated: false }, 200);
    }

    const { error: updateErr } = await supabaseAdmin
      .from('users')
      .update({
        ...(needsSignup ? { signup_method: oauthProvider, owner_email_verified: true } : {}),
        ...(shouldFillName ? { name: nameFromMeta } : {}),
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
