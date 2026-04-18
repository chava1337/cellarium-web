// Edge Function: Delete User Account
// Elimina cuenta de usuario y todos los datos relacionados

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
  console.log('[DELETE_ACCOUNT] request received', {
    method: req.method,
    hasAuthHeader: !!req.headers.get('Authorization'),
  });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl?.trim()) {
    console.error('[DELETE_ACCOUNT] MISSING_ENV: SUPABASE_URL');
    return jsonResponse({ code: 'MISSING_ENV', error: 'SUPABASE_URL not set' }, 500);
  }
  if (!serviceRoleKey?.trim()) {
    console.error('[DELETE_ACCOUNT] MISSING_ENV: SUPABASE_SERVICE_ROLE_KEY');
    return jsonResponse({ code: 'MISSING_ENV', error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, 500);
  }
  if (!anonKey?.trim()) {
    console.error('[DELETE_ACCOUNT] MISSING_ENV: SUPABASE_ANON_KEY');
    return jsonResponse({ code: 'MISSING_ENV', error: 'SUPABASE_ANON_KEY not set' }, 500);
  }

  try {
    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
    if (!authHeader?.trim()) {
      return jsonResponse({ error: 'No authorization header' }, 401);
    }

    const supabaseClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    console.log('[DELETE_ACCOUNT] auth check result', {
      userId: user?.id ?? null,
      userError: userError?.message ?? null,
    });
    if (userError || !user) {
      return jsonResponse({ error: 'Usuario no autenticado' }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 0. Bloquear solo si suscripción activa y NO cancelada/programada. Permitir borrar si ya cancelada o cancel_at_period_end.
    const { data: userRow, error: userRowError } = await supabaseAdmin
      .from('users')
      .select(
        'subscription_active, subscription_plan, subscription_expires_at, subscription_cancel_at_period_end, stripe_subscription_id, stripe_customer_id, billing_provider'
      )
      .eq('id', user.id)
      .maybeSingle();

    if (userRowError) {
      console.error('[DELETE_ACCOUNT] failed to read user row', userRowError.message);
      return jsonResponse({
        success: false,
        message: 'Error al verificar estado de suscripción',
      }, 500);
    }

    const subscriptionActive = userRow?.subscription_active === true;
    const userCancelScheduled = userRow?.subscription_cancel_at_period_end === true;
    const stripeSubId = userRow?.stripe_subscription_id?.trim?.() ?? '';
    const hasStripeSubId = stripeSubId.length > 0;
    const billingProvider =
      typeof (userRow as { billing_provider?: string } | null)?.billing_provider === 'string'
        ? String((userRow as { billing_provider: string }).billing_provider)
        : 'none';

    /** Si la fecha de fin ya pasó, no bloquear solo por `subscription_active` desactualizado en BD. */
    const expiresIso = userRow?.subscription_expires_at;
    const hasExpiry = typeof expiresIso === 'string' && expiresIso.length > 0;
    const expiredByDate = hasExpiry && new Date(expiresIso).getTime() < Date.now();
    const subscriptionEffectivelyActive = subscriptionActive && !expiredByDate;

    let cancelScheduled = userCancelScheduled;
    // Regla: permitir borrar si la suscripción ya está cancelada/programada, aunque siga activa hasta fin de periodo.
    let blocked = subscriptionEffectivelyActive && !cancelScheduled;

    // Si hay stripe_subscription_id, consultar Stripe para normalizar cancelScheduled y persistir estado
    if (hasStripeSubId) {
      const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
      if (stripeSecretKey?.trim()) {
        try {
          const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(stripeSubId)}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${stripeSecretKey}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          });
          const stripeSub = await subRes.json().catch(() => ({})) as Record<string, unknown>;
          const cancelAtPeriodEnd = stripeSub.cancel_at_period_end === true;
          const cancelAt = stripeSub.cancel_at;
          const canceledAt = stripeSub.canceled_at;
          const status = typeof stripeSub.status === 'string' ? stripeSub.status : '';

          const stripeCancelScheduled =
            cancelAtPeriodEnd === true ||
            (typeof cancelAt === 'number') ||
            (canceledAt != null) ||
            (status === 'canceled');

          cancelScheduled = cancelScheduled || stripeCancelScheduled;
          blocked = subscriptionEffectivelyActive && !cancelScheduled;

          const subIdSuffix = stripeSubId.length >= 6 ? stripeSubId.slice(-6) : '***';
          console.log('[DELETE_ACCOUNT] stripe sub check', {
            subIdSuffix,
            subscriptionActive,
            userCancelScheduled,
            stripeCancelScheduled,
            cancelScheduled,
            blocked,
            status,
          });

          // Persistir estado normalizado en DB (subscriptions + users)
          if (subRes.ok && stripeSub.id) {
            const { data: subRow } = await supabaseAdmin
              .from('subscriptions')
              .select('metadata')
              .eq('stripe_subscription_id', stripeSubId)
              .maybeSingle();

            const existing = (subRow as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
            const meta: Record<string, unknown> = {
              ...(typeof existing === 'object' && existing !== null ? existing : {}),
              cancel_scheduled: cancelScheduled,
              stripe_status: status,
              lastStripeCheckAt: new Date().toISOString(),
            };
            if (typeof cancelAt === 'number') {
              meta.cancel_at_unix = cancelAt;
              meta.cancel_at_iso = new Date(cancelAt * 1000).toISOString();
            }
            if (typeof cancelAtPeriodEnd === 'boolean') {
              meta.cancel_at_period_end = cancelAtPeriodEnd;
            }

            const nowIso = new Date().toISOString();
            await supabaseAdmin
              .from('subscriptions')
              .update({
                metadata: meta,
                cancel_at_period_end: cancelScheduled,
                updated_at: nowIso,
              })
              .eq('stripe_subscription_id', stripeSubId);

            await supabaseAdmin
              .from('users')
              .update({
                subscription_cancel_at_period_end: cancelScheduled,
                updated_at: nowIso,
              })
              .eq('id', user.id);
          }
        } catch (e) {
          console.warn('[DELETE_ACCOUNT] stripe fetch failed', (e as Error)?.message ?? e);
        }
      }
    }

    if (blocked) {
      const userIdSuffix = user.id.length >= 6 ? user.id.slice(-6) : '***';
      console.log('[DELETE_ACCOUNT] SUBSCRIPTION_ACTIVE block', {
        userIdSuffix,
        subscriptionActive,
        subscriptionEffectivelyActive,
        expiredByDate,
        cancelScheduled,
        plan: userRow?.subscription_plan ?? null,
        hasStripeSubId,
        billing_provider: billingProvider,
      });
      return jsonResponse({
        success: false,
        code: 'SUBSCRIPTION_ACTIVE',
        message: "No puedes eliminar tu cuenta mientras tengas una suscripción activa. Cancélala desde 'Administrar suscripción' y vuelve a intentarlo.",
        subscription: {
          subscription_active: subscriptionActive,
          subscription_plan: userRow?.subscription_plan ?? null,
          subscription_expires_at: userRow?.subscription_expires_at ?? null,
          has_stripe_subscription_id: hasStripeSubId,
          billing_provider: billingProvider,
        },
      }, 409);
    }

    // 0.5. Si es owner: obtener IDs de staff (owner_id = owner) para borrarlos de auth después del RPC
    const { data: staffRows, error: staffQueryError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('owner_id', user.id)
      .neq('id', user.id);

    if (staffQueryError) {
      console.warn('[DELETE_ACCOUNT] failed to fetch staff ids', staffQueryError.message);
    }
    const staffIds: string[] = (staffRows ?? [])
      .map((r: { id?: string }) => r?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    // 1. Llamar a la función RPC para eliminar datos de public.users
    console.log('[DELETE_ACCOUNT] calling RPC delete_user_account', {
      userId: user.id,
    });
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('delete_user_account', {
      p_user_id: user.id,
    });
    console.log('[DELETE_ACCOUNT] RPC result', {
      rpcSuccess: rpcData?.success ?? null,
      rpcError: rpcError?.message ?? null,
      rpcCode: (rpcError as any)?.code ?? null,
    });

    if (rpcError) {
      const err = rpcError as { code?: string; details?: string; hint?: string };
      const rpcErrorInfo = {
        message: rpcError.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
      };
      console.error('[DELETE_ACCOUNT] Error en delete_user_account RPC:', rpcErrorInfo);
      return jsonResponse({
        success: false,
        message: 'Error eliminando datos del usuario (RPC)',
        rpcError: rpcErrorInfo,
      }, 500);
    }

    if (!rpcData?.success) {
      return jsonResponse({
        success: false,
        message: rpcData?.message || 'Error eliminando cuenta',
        rpcData,
      }, 500);
    }

    // 1.5. Limpiar storage wine-bottles del owner (path: {userId}/...)
    const wineBottlesBucket = 'wine-bottles';
    try {
      const pathsToRemove: string[] = [];
      async function listAllInPrefix(prefix: string): Promise<void> {
        const { data: items, error: listError } = await supabaseAdmin.storage
          .from(wineBottlesBucket)
          .list(prefix, { limit: 1000 });
        if (listError) {
          console.warn('[DELETE_ACCOUNT] storage list failed', prefix, listError.message);
          return;
        }
        if (!items?.length) return;
        for (const item of items) {
          const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
          const isFolder = item.id == null && (item.metadata == null || Object.keys(item.metadata as object).length === 0);
          if (isFolder) {
            await listAllInPrefix(fullPath);
          } else {
            pathsToRemove.push(fullPath);
          }
        }
      }
      await listAllInPrefix(user.id);
      if (pathsToRemove.length > 0) {
        const { error: removeError } = await supabaseAdmin.storage
          .from(wineBottlesBucket)
          .remove(pathsToRemove);
        if (removeError) {
          console.warn('[DELETE_ACCOUNT] wine-bottles remove failed', removeError.message);
        } else {
          console.log('[DELETE_ACCOUNT] wine-bottles cleaned', pathsToRemove.length, 'objects');
        }
      }
    } catch (storageErr) {
      console.warn('[DELETE_ACCOUNT] wine-bottles cleanup error', (storageErr as Error)?.message ?? storageErr);
    }

    // 2. Borrar auth de staff del owner (no abortar si falla uno: log y seguir)
    for (const staffId of staffIds) {
      const { error: staffAuthError } = await supabaseAdmin.auth.admin.deleteUser(staffId);
      if (staffAuthError) {
        console.warn('[DELETE_ACCOUNT] failed to delete staff auth', staffId, staffAuthError.message);
      }
    }

    // 3. Borrar owner de auth.users
    console.log('[DELETE_ACCOUNT] deleting from auth.users', {
      userId: user.id,
    });
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteAuthError) {
      console.error('[DELETE_ACCOUNT] Error eliminando de auth.users:', deleteAuthError.message);
      return jsonResponse({
        success: true,
        message: 'Datos eliminados, pero hubo un error al eliminar la cuenta de autenticación. Contacta al administrador.',
        warning: deleteAuthError.message,
      }, 200);
    }

    return jsonResponse({
      success: true,
      message: rpcData.message || 'Cuenta eliminada exitosamente',
    }, 200);
  } catch (error) {
    console.error('[DELETE_ACCOUNT] UNHANDLED ERROR', {
      message: error instanceof Error ? error.message : 'unknown',
      stack: error instanceof Error ? error.stack?.slice(0, 400) : null,
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});


