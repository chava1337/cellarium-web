// Edge Function: validate-google-subscription
// Valida purchaseToken con Google Play Developer API (subscriptionsv2) y sincroniza users + subscriptions.
// Seguridad: owner_id solo desde JWT + public.users; body solo purchaseToken, productId, packageName.
//
// Plan base y add-ons de sucursales son suscripciones distintas en Play (tokens distintos).
// La fila activa en BD usa siempre google_purchase_token del plan base; el token del add-on va en metadata.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { hasActiveAppleSubscription, hasActiveStripeBackedSubscription } from '../_shared/billing_coexistence.ts';
import {
  handleGoogleSubscriptionLapsed,
  handleSubscriptionUpdate,
} from '../_shared/handle_subscription_update.ts';
import type { AllowedPlanId } from '../_shared/handle_subscription_update.ts';
import {
  isGooglePlayAddonProductId,
  isGooglePlayBaseProductId,
  mapGoogleAddonProductIdToSlots,
  mapGoogleProductIdToPlan,
} from '../_shared/google_play_products.ts';
import {
  getSubscriptionPurchaseV2,
  interpretPlaySubscriptionV2,
} from '../_shared/google_play_purchases.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface ValidateGoogleBody {
  purchaseToken?: string;
  productId?: string;
  packageName?: string;
}

const BASE_PLAN_IDS: AllowedPlanId[] = ['bistro', 'trattoria', 'grand-maison'];

async function fetchActiveGoogleBaseSubscriptionRow(
  supabaseAdmin: SupabaseClient,
  ownerId: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select(
      'id,user_id,owner_id,plan_id,plan_name,status,google_purchase_token,google_product_id,google_order_id,metadata,current_period_start,current_period_end,cancel_at_period_end'
    )
    .eq('owner_id', ownerId)
    .in('status', ['active', 'trialing'])
    .not('google_purchase_token', 'is', null)
    .in('plan_id', BASE_PLAN_IDS)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[validate-google-subscription] fetch base row', error.message);
    return null;
  }
  return data as Record<string, unknown> | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }

  const expectedPackage =
    (Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME') ?? 'com.cellarium.winecatalog').trim();

  try {
    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
    if (!authHeader) {
      return json(401, { error: 'Missing Authorization', code: 'MISSING_AUTH' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !supabaseAnon || !supabaseServiceKey) {
      console.error('[validate-google-subscription] missing Supabase env');
      return json(500, { error: 'Server configuration error', code: 'CONFIG' });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const {
      data: { user: authUser },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !authUser) {
      return json(401, {
        error: 'Invalid session',
        code: 'INVALID_SESSION',
        details: String(userError?.message ?? 'no user').slice(0, 200),
      });
    }

    let bodyJson: ValidateGoogleBody;
    try {
      bodyJson = (await req.json()) as ValidateGoogleBody;
    } catch {
      return json(400, { error: 'JSON inválido', code: 'INVALID_JSON' });
    }

    const purchaseToken = typeof bodyJson.purchaseToken === 'string' ? bodyJson.purchaseToken.trim() : '';
    const productId = typeof bodyJson.productId === 'string' ? bodyJson.productId.trim() : '';
    const packageName = typeof bodyJson.packageName === 'string' ? bodyJson.packageName.trim() : '';

    if (!purchaseToken || !productId || !packageName) {
      return json(400, {
        error: 'purchaseToken, productId y packageName son obligatorios',
        code: 'MISSING_FIELDS',
      });
    }

    if (packageName !== expectedPackage) {
      return json(400, {
        error: 'packageName no coincide con la app configurada',
        code: 'PACKAGE_MISMATCH',
      });
    }

    const isBase = isGooglePlayBaseProductId(productId);
    const isAddon = isGooglePlayAddonProductId(productId);
    if (!isBase && !isAddon) {
      return json(400, {
        error: 'Product ID no es un plan base ni un add-on Cellarium',
        code: 'UNKNOWN_PRODUCT',
        productId,
      });
    }

    const { data: userData, error: userDataError } = await supabaseAdmin
      .from('users')
      .select(
        'id, role, owner_id, signup_method, owner_email_verified, billing_provider'
      )
      .eq('id', authUser.id)
      .single();

    if (userDataError || !userData) {
      return json(401, { error: 'Usuario no encontrado en base de datos', code: 'AUTH_REQUIRED' });
    }

    const ownerId = (userData.owner_id ?? userData.id) as string;
    if (userData.role !== 'owner' || userData.id !== ownerId) {
      return json(403, { error: 'Solo el owner puede activar la suscripción', code: 'FORBIDDEN' });
    }

    if (userData.signup_method === 'password' && userData.owner_email_verified !== true) {
      return json(403, {
        error: 'Debes verificar tu correo antes de activar la suscripción.',
        code: 'EMAIL_VERIFICATION_REQUIRED',
      });
    }

    if (await hasActiveStripeBackedSubscription(supabaseAdmin, ownerId)) {
      return json(409, {
        error: 'Ya tienes una suscripción activa con Stripe. Cancela en la web antes de usar Google Play.',
        code: 'STRIPE_SUBSCRIPTION_ACTIVE',
      });
    }

    if (await hasActiveAppleSubscription(supabaseAdmin, ownerId)) {
      return json(409, {
        error: 'Ya tienes una suscripción activa con Apple. No se puede activar Google Play en paralelo.',
        code: 'APPLE_SUBSCRIPTION_ACTIVE',
      });
    }

    let playBody: Awaited<ReturnType<typeof getSubscriptionPurchaseV2>>;
    try {
      playBody = await getSubscriptionPurchaseV2(packageName, purchaseToken);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[validate-google-subscription] Play API', msg);
      return json(502, {
        error: 'No se pudo validar con Google Play',
        code: 'PLAY_API_ERROR',
        details: msg.slice(0, 300),
      });
    }

    const now = new Date();
    const interpreted = interpretPlaySubscriptionV2(playBody, productId, now);
    const resolvedProductId = interpreted.productId ?? productId;

    if (resolvedProductId !== productId) {
      return json(400, {
        error: 'El recibo de Play no coincide con el productId enviado',
        code: 'PRODUCT_MISMATCH',
      });
    }

    if (interpreted.pendingOnly) {
      return json(409, {
        ok: false,
        error: 'La compra está pendiente en Google Play',
        code: 'PLAY_PURCHASE_PENDING',
        play_state: interpreted.playState,
      });
    }

    const expiresAtIso = interpreted.expiresAtIso;

    // ——— Add-on: sincronizar sobre la fila del plan base (mismo token base en subscriptions). ———
    if (isAddon) {
      const slots = mapGoogleAddonProductIdToSlots(productId);
      if (slots == null) {
        return json(400, { error: 'Add-on no reconocido', code: 'UNKNOWN_PRODUCT', productId });
      }

      if (!interpreted.subscriptionActive || !expiresAtIso) {
        const baseRowClear = await fetchActiveGoogleBaseSubscriptionRow(supabaseAdmin, ownerId);
        if (!baseRowClear?.['google_purchase_token']) {
          return json(400, {
            error: 'No hay un plan base activo en Google Play para este tenant',
            code: 'ADDON_WITHOUT_BASE',
          });
        }

        const baseTok = String(baseRowClear['google_purchase_token']);
        let baseBodyClear: Awaited<ReturnType<typeof getSubscriptionPurchaseV2>>;
        try {
          baseBodyClear = await getSubscriptionPurchaseV2(packageName, baseTok);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return json(502, { error: 'No se pudo validar el plan base', code: 'PLAY_API_ERROR', details: msg.slice(0, 200) });
        }
        const basePid = String(baseRowClear['google_product_id'] ?? '');
        const baseInterpClear = interpretPlaySubscriptionV2(baseBodyClear, basePid, now);

        if (!baseInterpClear.subscriptionActive || !baseInterpClear.expiresAtIso) {
          const lapse = await handleGoogleSubscriptionLapsed({
            supabaseAdmin,
            ownerId,
            userId: userData.id,
            purchaseToken: baseTok,
            diagSkipReconcile: false,
          });
          if (lapse.error) {
            return json(500, { error: 'Error al sincronizar baja', code: 'LAPSE_FAILED', details: lapse.error });
          }
          return json(200, {
            ok: true,
            synced: 'lapsed',
            reason: 'base_inactive_addon_expired',
            expires_at: baseInterpClear.expiresAtIso,
          });
        }

        const finalMapClear = mapGoogleProductIdToPlan(basePid);
        if (!finalMapClear) {
          return json(400, { error: 'Plan base no reconocido', code: 'UNKNOWN_PRODUCT' });
        }

        const cancelAtEndClear = baseInterpClear.playState === 'SUBSCRIPTION_STATE_CANCELED';
        const nowIsoClear = now.toISOString();
        const metaClear = (typeof baseRowClear['metadata'] === 'object' && baseRowClear['metadata'] !== null
          ? { ...(baseRowClear['metadata'] as Record<string, unknown>) }
          : {}) as Record<string, unknown>;
        delete metaClear['google_addon_purchase_token'];
        delete metaClear['google_addon_product_id'];
        delete metaClear['google_addon_order_id'];
        metaClear['provider'] = 'google';
        metaClear['package_name'] = packageName;
        metaClear['play_state'] = baseInterpClear.playState;

        const subRowClear: Record<string, unknown> = {
          user_id: userData.id,
          owner_id: ownerId,
          plan_id: finalMapClear.planId,
          plan_name: finalMapClear.planName,
          status: 'active',
          current_period_start: baseRowClear['current_period_start'] ?? nowIsoClear,
          current_period_end: baseInterpClear.expiresAtIso,
          cancel_at_period_end: cancelAtEndClear,
          canceled_at: null,
          stripe_subscription_id: null,
          stripe_customer_id: null,
          apple_original_transaction_id: null,
          google_purchase_token: baseTok,
          google_product_id: basePid,
          google_order_id: baseInterpClear.orderId,
          metadata: metaClear,
          updated_at: nowIsoClear,
        };

        const syncClear = await handleSubscriptionUpdate({
          supabaseAdmin,
          ownerId,
          userId: userData.id,
          plan: finalMapClear.planId,
          expiresAt: baseInterpClear.expiresAtIso,
          provider: 'google',
          addonsCount: 0,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          subscriptionActive: true,
          subscriptionCancelAtPeriodEnd: cancelAtEndClear,
          userPatchOverride: null,
          subscriptionsUpsertRow: subRowClear,
          reconcileBranchLocks: true,
          reconcileOnlyWhenPlanFree: false,
          parallelUserUpdateAndSubscriptionsUpsert: false,
          afterUpsertCleanupOtherActives: { ownerId },
          appleOriginalTransactionId: null,
          appleProductId: null,
          googlePurchaseToken: baseTok,
          googleProductId: basePid,
          googleOrderId: baseInterpClear.orderId,
          diagSkipReconcile: false,
        });

        if (syncClear.error) {
          console.error('[validate-google-subscription] addon-clear sync failed', syncClear.error);
          return json(500, { error: 'Error al guardar la suscripción', code: 'SYNC_FAILED', details: syncClear.error });
        }

        return json(200, {
          ok: true,
          synced: 'active',
          plan_id: finalMapClear.planId,
          addons_cleared: true,
          subscription_branch_addons_count: 0,
          expires_at: baseInterpClear.expiresAtIso,
        });
      }

      const baseRow = await fetchActiveGoogleBaseSubscriptionRow(supabaseAdmin, ownerId);
      if (!baseRow?.['google_purchase_token']) {
        return json(400, {
          error: 'Necesitas un plan base activo en Google Play antes del add-on de sucursales.',
          code: 'ADDON_WITHOUT_BASE',
        });
      }

      const baseTok = String(baseRow['google_purchase_token']);
      const basePid = String(baseRow['google_product_id'] ?? '');
      if (!isGooglePlayBaseProductId(basePid)) {
        return json(400, { error: 'Plan base en BD no es un producto base válido', code: 'CONFIG' });
      }

      let baseBody: Awaited<ReturnType<typeof getSubscriptionPurchaseV2>>;
      try {
        baseBody = await getSubscriptionPurchaseV2(packageName, baseTok);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[validate-google-subscription] base Play API', msg);
        return json(502, {
          error: 'No se pudo validar el plan base con Google Play',
          code: 'PLAY_API_ERROR',
          details: msg.slice(0, 300),
        });
      }

      const baseInterp = interpretPlaySubscriptionV2(baseBody, basePid, now);
      if (!baseInterp.subscriptionActive || !baseInterp.expiresAtIso) {
        return json(409, {
          error: 'Tu plan base en Google Play no está activo. Renueva el plan antes del add-on.',
          code: 'BASE_SUBSCRIPTION_INACTIVE',
          play_state: baseInterp.playState,
        });
      }

      const finalMap = mapGoogleProductIdToPlan(basePid);
      if (!finalMap) {
        return json(400, { error: 'Plan no reconocido', code: 'UNKNOWN_PRODUCT' });
      }

      const cancelAtEnd = baseInterp.playState === 'SUBSCRIPTION_STATE_CANCELED';
      const nowIso = now.toISOString();
      const orderId = interpreted.orderId;

      const metaAddon: Record<string, unknown> = {
        provider: 'google',
        play_state: baseInterp.playState,
        package_name: packageName,
        google_addon_purchase_token: purchaseToken,
        google_addon_product_id: resolvedProductId,
        google_addon_order_id: orderId,
      };

      const subRow: Record<string, unknown> = {
        user_id: userData.id,
        owner_id: ownerId,
        plan_id: finalMap.planId,
        plan_name: finalMap.planName,
        status: 'active',
        current_period_start: baseRow['current_period_start'] ?? nowIso,
        current_period_end: baseInterp.expiresAtIso,
        cancel_at_period_end: cancelAtEnd,
        canceled_at: null,
        stripe_subscription_id: null,
        stripe_customer_id: null,
        apple_original_transaction_id: null,
        google_purchase_token: baseTok,
        google_product_id: basePid,
        google_order_id: baseInterp.orderId,
        metadata: metaAddon,
        updated_at: nowIso,
      };

      const sync = await handleSubscriptionUpdate({
        supabaseAdmin,
        ownerId,
        userId: userData.id,
        plan: finalMap.planId,
        expiresAt: baseInterp.expiresAtIso,
        provider: 'google',
        addonsCount: slots,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionActive: true,
        subscriptionCancelAtPeriodEnd: cancelAtEnd,
        userPatchOverride: null,
        subscriptionsUpsertRow: subRow,
        reconcileBranchLocks: true,
        reconcileOnlyWhenPlanFree: false,
        parallelUserUpdateAndSubscriptionsUpsert: false,
        afterUpsertCleanupOtherActives: { ownerId },
        appleOriginalTransactionId: null,
        appleProductId: null,
        googlePurchaseToken: baseTok,
        googleProductId: basePid,
        googleOrderId: baseInterp.orderId,
        diagSkipReconcile: false,
      });

      if (sync.error) {
        console.error('[validate-google-subscription] addon sync failed', sync.error);
        return json(500, { error: 'Error al guardar la suscripción', code: 'SYNC_FAILED', details: sync.error });
      }

      return json(200, {
        ok: true,
        synced: 'active',
        plan_id: finalMap.planId,
        plan_name: finalMap.planName,
        expires_at: baseInterp.expiresAtIso,
        play_state: baseInterp.playState,
        google_order_id: baseInterp.orderId,
        subscription_branch_addons_count: slots,
      });
    }

    // ——— Plan base ———
    const finalMap = mapGoogleProductIdToPlan(resolvedProductId);
    if (!finalMap) {
      return json(400, { error: 'Plan no reconocido tras validar con Play', code: 'UNKNOWN_PRODUCT' });
    }

    if (!interpreted.subscriptionActive || !expiresAtIso) {
      const lapse = await handleGoogleSubscriptionLapsed({
        supabaseAdmin,
        ownerId,
        userId: userData.id,
        purchaseToken,
        diagSkipReconcile: false,
      });
      if (lapse.error) {
        console.error('[validate-google-subscription] lapse failed', lapse.error);
        return json(500, { error: 'Error al sincronizar baja', code: 'LAPSE_FAILED', details: lapse.error });
      }
      return json(200, {
        ok: true,
        synced: 'lapsed',
        reason: 'subscription_inactive_or_expired',
        play_state: interpreted.playState,
        expires_at: expiresAtIso,
      });
    }

    let addonsCount = 0;
    let addonOrderId: string | null = null;
    const existingBase = await fetchActiveGoogleBaseSubscriptionRow(supabaseAdmin, ownerId);
    const metaExisting =
      typeof existingBase?.['metadata'] === 'object' && existingBase['metadata'] !== null
        ? (existingBase['metadata'] as Record<string, unknown>)
        : null;
    const prevAddonTok =
      metaExisting && typeof metaExisting['google_addon_purchase_token'] === 'string'
        ? metaExisting['google_addon_purchase_token'].trim()
        : '';
    const prevAddonPid =
      metaExisting && typeof metaExisting['google_addon_product_id'] === 'string'
        ? String(metaExisting['google_addon_product_id']).trim()
        : '';

    if (
      prevAddonTok &&
      prevAddonPid &&
      isGooglePlayAddonProductId(prevAddonPid) &&
      mapGoogleAddonProductIdToSlots(prevAddonPid) != null
    ) {
      try {
        const addonBody = await getSubscriptionPurchaseV2(packageName, prevAddonTok);
        const addonInterp = interpretPlaySubscriptionV2(addonBody, prevAddonPid, now);
        if (addonInterp.subscriptionActive && addonInterp.expiresAtIso) {
          addonsCount = mapGoogleAddonProductIdToSlots(prevAddonPid)!;
          addonOrderId = addonInterp.orderId;
        }
      } catch {
        /* add-on token inválido o revocado: no sumar */
      }
    }

    const nowIso = now.toISOString();
    const orderId = interpreted.orderId;
    const cancelAtEnd = interpreted.playState === 'SUBSCRIPTION_STATE_CANCELED';

    const metadataBase: Record<string, unknown> = {
      provider: 'google',
      play_state: interpreted.playState,
      package_name: packageName,
    };
    if (addonsCount > 0 && prevAddonTok && prevAddonPid) {
      metadataBase['google_addon_purchase_token'] = prevAddonTok;
      metadataBase['google_addon_product_id'] = prevAddonPid;
      if (addonOrderId) metadataBase['google_addon_order_id'] = addonOrderId;
    }

    const subRow: Record<string, unknown> = {
      user_id: userData.id,
      owner_id: ownerId,
      plan_id: finalMap.planId,
      plan_name: finalMap.planName,
      status: 'active',
      current_period_start: nowIso,
      current_period_end: expiresAtIso,
      cancel_at_period_end: cancelAtEnd,
      canceled_at: null,
      stripe_subscription_id: null,
      stripe_customer_id: null,
      apple_original_transaction_id: null,
      google_purchase_token: purchaseToken,
      google_product_id: resolvedProductId,
      google_order_id: orderId,
      metadata: metadataBase,
      updated_at: nowIso,
    };

    const sync = await handleSubscriptionUpdate({
      supabaseAdmin,
      ownerId,
      userId: userData.id,
      plan: finalMap.planId,
      expiresAt: expiresAtIso,
      provider: 'google',
      addonsCount,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionActive: true,
      subscriptionCancelAtPeriodEnd: cancelAtEnd,
      userPatchOverride: null,
      subscriptionsUpsertRow: subRow,
      reconcileBranchLocks: true,
      reconcileOnlyWhenPlanFree: false,
      parallelUserUpdateAndSubscriptionsUpsert: false,
      afterUpsertCleanupOtherActives: { ownerId },
      appleOriginalTransactionId: null,
      appleProductId: null,
      googlePurchaseToken: purchaseToken,
      googleProductId: resolvedProductId,
      googleOrderId: orderId,
      diagSkipReconcile: false,
    });

    if (sync.error) {
      console.error('[validate-google-subscription] sync failed', sync.error);
      return json(500, { error: 'Error al guardar la suscripción', code: 'SYNC_FAILED', details: sync.error });
    }

    return json(200, {
      ok: true,
      synced: 'active',
      plan_id: finalMap.planId,
      plan_name: finalMap.planName,
      expires_at: expiresAtIso,
      play_state: interpreted.playState,
      google_order_id: orderId,
      subscription_branch_addons_count: addonsCount,
    });
  } catch (e) {
    console.error('[validate-google-subscription]', e);
    return json(500, { error: 'Error interno', code: 'INTERNAL' });
  }
});
