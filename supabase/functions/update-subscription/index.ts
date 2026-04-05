// Edge Function: update-subscription
// Actualiza el add-on mensual de sucursales en Stripe y sincroniza con public.users (UI: sucursales adicionales)
// Owners con suscripci?n Stripe de pago (bistro/trattoria/grand-maison) pueden ajustar add-on de sucursales.
// Usa REST API directa (sin Stripe SDK) para evitar node polyfills

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { hasActiveAppleSubscription } from '../_shared/billing_coexistence.ts';
import { stripeRequest } from '../_shared/stripe_rest.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface UpdateSubscriptionRequest {
  addonBranchesQty?: number;
}

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
    const hasAuth = !!authHeader;
    const tokenLen = authHeader?.length ?? 0;
    console.log('[update-subscription] auth', { hasAuth, tokenLen });

    if (!authHeader) {
      return json(401, { error: 'Missing Authorization', code: 'MISSING_AUTH' });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const {
      data: { user: authUser },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !authUser) {
      const details = userError?.message ?? (authUser ? '' : 'No user in session');
      return json(401, {
        error: 'Invalid session',
        code: 'INVALID_SESSION',
        details: String(details).slice(0, 200),
      });
    }

    // Cargar usuario desde public.users (fuente de verdad para plan)
    const { data: userData, error: userDataError } = await supabaseAdmin
      .from('users')
      .select(
        'id, role, owner_id, subscription_plan, stripe_customer_id, signup_method, owner_email_verified, billing_provider'
      )
      .eq('id', authUser.id)
      .single();

    if (userDataError || !userData) {
      return json(401, { error: 'Usuario no encontrado en base de datos', code: 'AUTH_REQUIRED' });
    }

    const ownerId = (userData.owner_id ?? userData.id) as string;
    if (userData.role !== 'owner' || userData.id !== ownerId) {
      return json(403, {
        error: 'Solo el owner puede actualizar la suscripci?n',
        code: 'FORBIDDEN',
      });
    }

    if (userData.signup_method === 'password' && userData.owner_email_verified !== true) {
      return json(403, {
        error: 'Debes verificar tu correo antes de actualizar la suscripci?n.',
        code: 'EMAIL_VERIFICATION_REQUIRED',
      });
    }

    if (
      userData.billing_provider === 'apple' ||
      (await hasActiveAppleSubscription(supabaseAdmin, ownerId))
    ) {
      return json(409, {
        error:
          'Las sucursales adicionales con Stripe no aplican a la suscripci?n de Apple. Gestiona el plan desde iOS.',
        code: 'APPLE_SUBSCRIPTION_ACTIVE',
      });
    }

    // Cualquier owner con suscripci?n Stripe vinculada puede ajustar quantity del add-on (incl. cafe + add-ons si aplica).

    // stripe_subscription_id: tabla subscriptions (o users si tiene la columna)
    const { data: subRow } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const stripeSubscriptionId = subRow?.stripe_subscription_id ?? null;

    if (!userData.stripe_customer_id || !stripeSubscriptionId) {
      return json(409, {
        error: 'Falta vincular la suscripci?n con Stripe. Gestiona tu suscripci?n desde el portal.',
        code: 'MISSING_STRIPE_LINK',
      });
    }

    let body: UpdateSubscriptionRequest;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'Body JSON inv?lido', code: 'INVALID_INPUT' });
    }

    const addonBranchesQty = body?.addonBranchesQty;
    if (typeof addonBranchesQty !== 'number' || addonBranchesQty < 0 || addonBranchesQty > 50) {
      return json(400, {
        error: 'addonBranchesQty debe ser un n?mero entre 0 y 50',
        code: 'INVALID_INPUT',
      });
    }

    const safeQty = Math.min(Math.max(Math.floor(addonBranchesQty), 0), 50);

    /** Modelo can?nico: 1 sucursal base + add-ons (quantity en Stripe). */
    const BASE_INCLUDED_BRANCHES = 1;
    const { count: activeBranchCount, error: branchCountError } = await supabaseAdmin
      .from('branches')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', ownerId);

    if (branchCountError) {
      console.error('[update-subscription] branch count:', branchCountError.message);
      return json(500, {
        error: 'No se pudo validar sucursales activas',
        code: 'BRANCH_COUNT_ERROR',
      });
    }

    const newAllowedBranches = BASE_INCLUDED_BRANCHES + safeQty;
    const active = activeBranchCount ?? 0;
    if (active > newAllowedBranches) {
      return json(400, {
        error:
          'No puedes reducir sucursales adicionales porque tienes m?s sucursales activas de las permitidas.',
        code: 'BRANCH_REDUCTION_NOT_ALLOWED',
        details: { activeBranches: active, allowed: newAllowedBranches },
      });
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      console.error('[update-subscription] STRIPE_SECRET_KEY no configurada');
      return json(500, { error: 'Error de configuraci?n', code: 'INTERNAL' });
    }

    const priceResult = await stripeRequest(
      'GET',
      'prices',
      stripeSecretKey,
      undefined,
      { 'lookup_keys[0]': 'branch_addon_monthly', active: 'true', limit: '1' }
    );
    const prices = (priceResult.data as { data?: { id: string }[] })?.data;
    const addonPriceId = prices?.[0]?.id;
    if (priceResult.error || !addonPriceId) {
      console.error('[update-subscription] Error obteniendo price:', priceResult.error?.message ?? 'n/a');
      return json(
        priceResult.error?.statusCode && priceResult.error.statusCode >= 400 && priceResult.error.statusCode < 500
          ? priceResult.error.statusCode
          : 502,
        {
          error: priceResult.error?.message ?? 'Error al obtener price de Stripe',
          code: 'STRIPE_ERROR',
        }
      );
    }

    const subResult = await stripeRequest(
      'GET',
      `subscriptions/${stripeSubscriptionId}`,
      stripeSecretKey,
      undefined,
      { 'expand[0]': 'items.data.price' }
    );

    if (subResult.error) {
      console.error('[update-subscription] Error obteniendo subscription:', subResult.error?.message ?? 'n/a');
      const status = subResult.error?.statusCode ?? 502;
      return json(
        status >= 400 && status < 500 ? status : 502,
        {
          error: 'Error al obtener suscripci?n de Stripe',
          message: subResult.error?.message,
          code: 'STRIPE_ERROR',
        }
      );
    }

    const stripeSubscription = subResult.data as {
      items?: { data?: { id: string; quantity: number; price: { id: string } }[] };
    };
    const allItems = stripeSubscription.items?.data ?? [];
    const branchAddonItem = allItems.find((item: { price: { id: string } }) => item.price.id === addonPriceId);

    // Safe logs (no secrets)
    console.log('[update-subscription]', {
      stripe_subscription_id: stripeSubscriptionId,
      addonPriceId,
      safeQty,
      hasBranchAddonItem: !!branchAddonItem,
    });

    let updatedQuantity = safeQty;

    // Build full items payload for POST /v1/subscriptions/{id} (Stripe requires full set when modifying items)
    const itemsPayload: Array<Record<string, unknown>> = [];
    for (const item of allItems) {
      if (item.price.id === addonPriceId) {
        if (safeQty === 0) {
          itemsPayload.push({ id: item.id, deleted: true });
        } else {
          itemsPayload.push({ id: item.id, quantity: safeQty });
        }
      } else {
        itemsPayload.push({ id: item.id, quantity: item.quantity });
      }
    }
    if (safeQty > 0 && !branchAddonItem) {
      itemsPayload.push({ price: addonPriceId, quantity: safeQty });
    }

    if (safeQty === 0 && !branchAddonItem) {
      // No addon item to remove; no Stripe call
      updatedQuantity = 0;
    } else {
      const updateBody: Record<string, unknown> = {
        items: itemsPayload,
        proration_behavior: 'none',
      };
      const updateResult = await stripeRequest(
        'POST',
        `subscriptions/${stripeSubscriptionId}`,
        stripeSecretKey,
        updateBody
      );
      if (updateResult.error) {
        console.error('[update-subscription] Error actualizando subscription:', updateResult.error?.message ?? 'n/a');
        const status = updateResult.error?.statusCode ?? 502;
        return json(
          status >= 400 && status < 500 ? status : 502,
          {
            error: 'Error al actualizar suscripci?n en Stripe',
            message: updateResult.error?.message,
            code: 'STRIPE_ERROR',
          }
        );
      }
    }

    const { error: updateUserError } = await supabaseAdmin
      .from('users')
      .update({ subscription_branch_addons_count: updatedQuantity })
      .eq('id', ownerId);

    if (updateUserError) {
      console.error('[update-subscription] Error actualizando users:', updateUserError.message);
      return json(500, {
        error: 'Error al guardar la cantidad en la base de datos',
        code: 'INTERNAL',
      });
    }

    // Sync addonBranchesQty to subscriptions.metadata for reconcile_branch_locks
    const { data: subMetaRow } = await supabaseAdmin
      .from('subscriptions')
      .select('metadata')
      .eq('stripe_subscription_id', stripeSubscriptionId)
      .maybeSingle();
    const currentMeta = (subMetaRow?.metadata as Record<string, unknown>) ?? {};
    const { error: updateSubMetaError } = await supabaseAdmin
      .from('subscriptions')
      .update({ metadata: { ...currentMeta, addonBranchesQty: updatedQuantity } })
      .eq('stripe_subscription_id', stripeSubscriptionId);

    if (updateSubMetaError) {
      console.error('[update-subscription] Error actualizando subscriptions.metadata:', updateSubMetaError.message);
      // Non-fatal; reconcile reads from users.subscription_branch_addons_count as fallback
    }

    try {
      const { error: reconcileError } = await supabaseAdmin.rpc('reconcile_branch_locks', {
        p_owner_id: ownerId,
      });
      if (reconcileError) {
        console.error('[update-subscription] reconcile_branch_locks:', reconcileError.message);
      }
    } catch {
      // no fallar la respuesta
    }

    return json(200, {
      ok: true,
      addonBranchesQty: updatedQuantity,
      stripeSubscriptionId,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const name = error instanceof Error ? error.name : 'Error';
    const message = error instanceof Error ? error.message : String(error);
    console.error('[update-subscription] Error inesperado:', { name, message, where: 'catch' });
    return json(500, {
      error: 'Error interno',
      message: message,
      code: 'INTERNAL',
    });
  }
});
