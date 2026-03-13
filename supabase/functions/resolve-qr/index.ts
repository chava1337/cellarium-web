// Edge Function: resolve-qr
// Valida token QR tipo admin_invite (staff) con service_role y lo marca como usado (1 uso).
// No requiere auth; protege con validación mínima de body.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function jsonResponse(body: object, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: corsHeaders,
    status,
  });
}

function tokenSuffix(token: string): string {
  if (!token || token.length < 4) return '***';
  return token.slice(-4);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  }

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    console.log('[RESOLVE_QR] result: invalid_body tokenSuffix:n/a');
    return jsonResponse({ success: false, code: 'INVALID_BODY' }, 400);
  }

  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!token || token.length < 8) {
    console.log('[RESOLVE_QR] result: invalid_token tokenSuffix:', token ? tokenSuffix(token) : 'empty');
    return jsonResponse({ success: false, code: 'INVALID_TOKEN' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl?.trim() || !serviceRoleKey?.trim()) {
    console.error('[RESOLVE_QR] MISSING_ENV');
    return jsonResponse({ success: false, code: 'SERVER_ERROR' }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: row, error: fetchError } = await supabaseAdmin
    .from('qr_tokens')
    .select('id, token, type, owner_id, branch_id, expires_at, used, used_at, current_uses, max_uses')
    .eq('token', token)
    .maybeSingle();

  if (fetchError) {
    console.error('[RESOLVE_QR] result: db_error type:n/a tokenSuffix:', tokenSuffix(token));
    return jsonResponse({ success: false, code: 'SERVER_ERROR' }, 500);
  }

  if (!row) {
    console.log('[RESOLVE_QR] result: not_found type:n/a tokenSuffix:', tokenSuffix(token));
    return jsonResponse({ success: false, code: 'TOKEN_NOT_FOUND' }, 404);
  }

  const type = row.type ?? '';
  if (type !== 'admin_invite') {
    console.log('[RESOLVE_QR] result: type_not_allowed type:', type, 'tokenSuffix:', tokenSuffix(token));
    return jsonResponse({ success: false, code: 'TOKEN_TYPE_NOT_ALLOWED' }, 400);
  }

  const now = new Date().toISOString();
  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  if (expiresAt && expiresAt <= new Date()) {
    console.log('[RESOLVE_QR] result: expired type: admin_invite tokenSuffix:', tokenSuffix(token));
    return jsonResponse({ success: false, code: 'TOKEN_EXPIRED' }, 410);
  }

  if (row.used === true) {
    console.log('[RESOLVE_QR] result: used type: admin_invite tokenSuffix:', tokenSuffix(token));
    return jsonResponse({ success: false, code: 'TOKEN_USED' }, 409);
  }

  const maxUses = row.max_uses != null ? Number(row.max_uses) : 1;
  const currentUses = row.current_uses != null ? Number(row.current_uses) : 0;
  if (maxUses > 0 && currentUses >= maxUses) {
    console.log('[RESOLVE_QR] result: limit type: admin_invite tokenSuffix:', tokenSuffix(token));
    return jsonResponse({ success: false, code: 'TOKEN_LIMIT_REACHED' }, 409);
  }

  const newCurrentUses = currentUses + 1;
  const effectiveMaxUses = maxUses > 0 ? maxUses : 1;
  const markUsed = newCurrentUses >= effectiveMaxUses;

  const updatePayload: Record<string, unknown> = {
    current_uses: newCurrentUses,
  };
  if (markUsed) {
    updatePayload.used = true;
    updatePayload.used_at = now;
  }

  const { error: updateError } = await supabaseAdmin
    .from('qr_tokens')
    .update(updatePayload)
    .eq('id', row.id);

  if (updateError) {
    console.error('[RESOLVE_QR] result: update_error type: admin_invite tokenSuffix:', tokenSuffix(token));
    return jsonResponse({ success: false, code: 'SERVER_ERROR' }, 500);
  }

  let branchName: string | null = null;
  const { data: branchRow } = await supabaseAdmin
    .from('branches')
    .select('name')
    .eq('id', row.branch_id)
    .maybeSingle();
  if (branchRow && typeof (branchRow as { name?: string }).name === 'string') {
    branchName = (branchRow as { name: string }).name;
  }

  console.log('[RESOLVE_QR] result: valid type: admin_invite tokenSuffix:', tokenSuffix(token));

  return jsonResponse(
    {
      success: true,
      status: 'valid',
      type: 'admin_invite',
      owner_id: row.owner_id,
      branch_id: row.branch_id,
      branch_name: branchName,
    },
    200
  );
});
