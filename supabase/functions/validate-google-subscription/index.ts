// Edge Function: validate-google-subscription
// Valida purchaseToken con Google Play Developer API (subscriptionsv2) y sincroniza users + subscriptions.
// Seguridad: owner_id solo desde JWT + public.users; body solo purchaseToken, productId, packageName.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { hasActiveAppleSubscription, hasActiveStripeBackedSubscription } from '../_shared/billing_coexistence.ts';
import {
  handleGoogleSubscriptionLapsed,
  handleSubscriptionUpdate,
} from '../_shared/handle_subscription_update.ts';
import { mapGoogleProductIdToPlan } from '../_shared/google_play_products.ts';
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

    const mappedPlan = mapGoogleProductIdToPlan(productId);
    if (!mappedPlan) {
      return json(400, {
        error: 'Product ID no es un plan base Cellarium',
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

    const finalMap = mapGoogleProductIdToPlan(resolvedProductId);
    if (!finalMap) {
      return json(400, { error: 'Plan no reconocido tras validar con Play', code: 'UNKNOWN_PRODUCT' });
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

    const nowIso = now.toISOString();
    const orderId = interpreted.orderId;
    const cancelAtEnd = interpreted.playState === 'SUBSCRIPTION_STATE_CANCELED';

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
      metadata: {
        provider: 'google',
        play_state: interpreted.playState,
        package_name: packageName,
      },
      updated_at: nowIso,
    };

    const sync = await handleSubscriptionUpdate({
      supabaseAdmin,
      ownerId,
      userId: userData.id,
      plan: finalMap.planId,
      expiresAt: expiresAtIso,
      provider: 'google',
      addonsCount: 0,
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
    });
  } catch (e) {
    console.error('[validate-google-subscription]', e);
    return json(500, { error: 'Error interno', code: 'INTERNAL' });
  }
});
