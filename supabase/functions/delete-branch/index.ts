// Edge Function: Delete Branch (cascade)
// Borra una sucursal adicional y todo lo relacionado. Staff de esa branch se elimina de public.users y de auth.users.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  console.log('[DELETE_BRANCH] request received', {
    method: req.method,
    hasAuthHeader: !!req.headers.get('Authorization'),
  });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl?.trim() || !serviceRoleKey?.trim() || !anonKey?.trim()) {
    console.error('[DELETE_BRANCH] MISSING_ENV');
    return jsonResponse({
      success: false,
      error: 'Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY',
    }, 500);
  }

  try {
    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
    if (!authHeader?.trim()) {
      return jsonResponse({ success: false, error: 'No authorization header' }, 401);
    }

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    console.log('[DELETE_BRANCH] auth check', { userId: user?.id ?? null, userError: userError?.message ?? null });
    if (userError || !user) {
      return jsonResponse({ success: false, error: 'Usuario no autenticado' }, 401);
    }

    let body: { branchId?: string } = {};
    try {
      body = (await req.json()) as { branchId?: string };
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400);
    }
    const branchId = body?.branchId?.trim?.();
    if (!branchId) {
      return jsonResponse({ success: false, error: 'branchId is required' }, 400);
    }

    // Llamar RPC con el cliente del usuario para que auth.uid() sea correcto
    const { data: rpcData, error: rpcError } = await supabaseUser.rpc('delete_branch_cascade', {
      p_branch_id: branchId,
    });

    console.log('[DELETE_BRANCH] RPC result', {
      success: rpcData?.success ?? null,
      rpcError: rpcError?.message ?? null,
    });

    if (rpcError) {
      console.error('[DELETE_BRANCH] RPC error', rpcError.message);
      return jsonResponse({
        success: false,
        error: rpcError.message,
      }, 500);
    }

    if (!rpcData?.success) {
      return jsonResponse({
        success: false,
        message: rpcData?.message ?? 'No se pudo eliminar la sucursal',
      }, 400);
    }

    const staffIds: string[] = Array.isArray(rpcData?.deleted_staff_user_ids)
      ? (rpcData.deleted_staff_user_ids as string[]).filter((id: unknown) => typeof id === 'string' && id.length > 0)
      : [];

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const failedAuthUserDeletes: string[] = [];
    for (const staffId of staffIds) {
      const { error: authDelError } = await supabaseAdmin.auth.admin.deleteUser(staffId);
      if (authDelError) {
        console.warn('[DELETE_BRANCH] failed to delete staff auth', staffId, authDelError.message);
        failedAuthUserDeletes.push(staffId);
      }
    }

    return jsonResponse({
      success: true,
      message: rpcData.message ?? 'Sucursal eliminada correctamente',
      branch_id: rpcData.branch_id,
      branch_name: rpcData.branch_name,
      deleted_staff_count: rpcData.deleted_staff_count ?? staffIds.length,
      failed_auth_user_deletes: failedAuthUserDeletes,
    }, 200);
  } catch (error) {
    console.error('[DELETE_BRANCH] unexpected error', (error as Error)?.message ?? error);
    return jsonResponse({
      success: false,
      error: (error as Error)?.message ?? 'Error desconocido',
    }, 500);
  }
});
