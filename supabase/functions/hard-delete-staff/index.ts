// Edge Function: Hard delete staff
// Eliminación completa del staff: validación de permisos, limpieza en public (RPC) y borrado en auth.users.
// Solo owner o gerente pueden eliminar; nunca el owner como target. Libera el correo para reutilización.

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

type UserRow = {
  id: string;
  role: string | null;
  status: string | null;
  owner_id: string | null;
  branch_id: string | null;
};

const ROLE_ORDER: Record<string, number> = {
  owner: 5,
  gerente: 4,
  sommelier: 3,
  supervisor: 2,
  personal: 1,
};

Deno.serve(async (req: Request) => {
  console.log('[HARD_DELETE_STAFF] request received', {
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
    console.error('[HARD_DELETE_STAFF] MISSING_ENV');
    return jsonResponse({
      ok: false,
      message: 'Configuración del servidor incompleta',
    }, 500);
  }

  try {
    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
    if (!authHeader?.trim()) {
      return jsonResponse({ ok: false, message: 'No autorizado' }, 401);
    }

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: authUser }, error: userError } = await supabaseUser.auth.getUser();
    console.log('[HARD_DELETE_STAFF] auth check', {
      userId: authUser?.id ?? null,
      userError: userError?.message ?? null,
    });
    if (userError || !authUser) {
      return jsonResponse({ ok: false, message: 'Usuario no autenticado' }, 401);
    }

    let body: { target_user_id?: string } = {};
    try {
      body = (await req.json()) as { target_user_id?: string };
    } catch {
      return jsonResponse({ ok: false, message: 'Cuerpo de petición inválido' }, 400);
    }

    const targetUserId = body?.target_user_id?.trim?.();
    if (!targetUserId) {
      return jsonResponse({ ok: false, message: 'target_user_id es obligatorio' }, 400);
    }

    if (authUser.id === targetUserId) {
      return jsonResponse({
        ok: false,
        message: 'Para eliminar tu propia cuenta usa la opción en Ajustes.',
      }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: actorRows, error: actorError } = await supabaseAdmin
      .from('users')
      .select('id, role, status, owner_id, branch_id')
      .eq('id', authUser.id)
      .limit(1);

    if (actorError || !actorRows?.length) {
      console.error('[HARD_DELETE_STAFF] actor not found', actorError?.message ?? null);
      return jsonResponse({ ok: false, message: 'Usuario actor no encontrado' }, 403);
    }

    const actor = actorRows[0] as UserRow;

    const { data: targetRows, error: targetError } = await supabaseAdmin
      .from('users')
      .select('id, role, status, owner_id, branch_id')
      .eq('id', targetUserId)
      .limit(1);

    if (targetError || !targetRows?.length) {
      console.error('[HARD_DELETE_STAFF] target not found', targetError?.message ?? null);
      return jsonResponse({ ok: false, message: 'Usuario a eliminar no encontrado' }, 404);
    }

    const target = targetRows[0] as UserRow;

    if (actor.status !== 'active') {
      return jsonResponse({ ok: false, message: 'Tu usuario debe estar activo' }, 403);
    }

    if (actor.role !== 'owner' && actor.role !== 'gerente') {
      return jsonResponse({
        ok: false,
        message: 'Solo el owner o un gerente pueden eliminar staff',
      }, 403);
    }

    if (target.role === 'owner') {
      return jsonResponse({ ok: false, message: 'No se puede eliminar al owner' }, 400);
    }

    if (actor.role === 'owner') {
      if (target.owner_id !== actor.id) {
        return jsonResponse({
          ok: false,
          message: 'Solo puedes eliminar staff de tu organización',
        }, 403);
      }
    } else {
      if (actor.owner_id == null || actor.branch_id == null) {
        return jsonResponse({ ok: false, message: 'Gerente sin sucursal asignada' }, 403);
      }
      if (target.owner_id !== actor.owner_id || target.branch_id !== actor.branch_id) {
        return jsonResponse({
          ok: false,
          message: 'Solo puedes eliminar staff de tu misma sucursal',
        }, 403);
      }
      const actorLevel = ROLE_ORDER[actor.role] ?? 0;
      const targetLevel = ROLE_ORDER[target.role] ?? 0;
      if (targetLevel >= actorLevel) {
        return jsonResponse({
          ok: false,
          message: 'No puedes eliminar a un gerente o a alguien de tu mismo nivel',
        }, 403);
      }
    }

    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('hard_delete_staff_public', {
      p_target_user_id: targetUserId,
    });

    console.log('[HARD_DELETE_STAFF] RPC result', {
      success: (rpcData as { success?: boolean })?.success ?? null,
      rpcError: rpcError?.message ?? null,
    });

    if (rpcError) {
      console.error('[HARD_DELETE_STAFF] RPC error', rpcError.message);
      return jsonResponse({
        ok: false,
        message: (rpcError as { message?: string }).message ?? 'Error al eliminar datos del usuario',
      }, 500);
    }

    const rpcResult = rpcData as { success?: boolean; message?: string } | null;
    if (!rpcResult?.success) {
      return jsonResponse({
        ok: false,
        message: rpcResult?.message ?? 'Error al eliminar el usuario',
      }, 500);
    }

    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    if (deleteAuthError) {
      console.error('[HARD_DELETE_STAFF] auth.admin.deleteUser failed', deleteAuthError.message);
      return jsonResponse({
        ok: false,
        message: 'Se eliminaron los datos pero falló la eliminación de la cuenta de acceso. Contacta al administrador.',
      }, 500);
    }

    console.log('[HARD_DELETE_STAFF] success', { targetUserId });
    return jsonResponse({
      ok: true,
      message: 'Usuario eliminado correctamente. El correo queda disponible para una nueva cuenta.',
    }, 200);
  } catch (error) {
    console.error('[HARD_DELETE_STAFF] UNHANDLED', {
      message: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse({
      ok: false,
      message: error instanceof Error ? error.message : 'Error inesperado',
    }, 500);
  }
});
