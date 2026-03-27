// Edge Function: validate-apple-receipt
// Valida recibo App Store (verifyReceipt), mapea productos a planes internos y sincroniza users + subscriptions.
//
// MVP ciclo de vida (iOS):
// - Compra / restaurar compras: mismo endpoint con receiptData (restore = mismo payload; no confiar en flags del cliente).
// - Revalidación al abrir pantalla de suscripción: llamar de nuevo con el recibo actual; si expiró, respuesta synced=lapsed.
// - Recibo inválido o error Apple (status ≠ 0): no degradar cuenta (evita borrar por fallos transitorios).
//
// Seguridad: owner_id / user_id solo desde JWT + public.users; el body solo acepta receiptData (nunca IDs de tenant).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { hasActiveStripeBackedSubscription } from '../_shared/billing_coexistence.ts';
import { handleAppleSubscriptionLapsed, handleSubscriptionUpdate } from '../_shared/handle_subscription_update.ts';
import { mapAppleProductId } from '../_shared/apple_iap.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ValidateAppleReceiptBody {
  /** Base64 del recibo de la App Store (legacy verifyReceipt) */
  receiptData: string;
  /** Opcional, solo telemetría (purchase | restore | sync); no altera lógica ni permisos. */
  intent?: string;
}

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface AppleReceiptInfo {
  product_id?: string;
  original_transaction_id?: string;
  expires_date_ms?: string;
  purchase_date_ms?: string;
}

interface VerifyReceiptResponse {
  status: number;
  latest_receipt_info?: AppleReceiptInfo[];
  receipt?: { in_app?: AppleReceiptInfo[] };
  environment?: string;
}

async function postVerifyReceipt(url: string, receiptData: string, password: string): Promise<VerifyReceiptResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      'receipt-data': receiptData,
      password,
      'exclude-old-transactions': false,
    }),
  });
  return (await res.json()) as VerifyReceiptResponse;
}

function pickBestSubscriptionInfo(body: VerifyReceiptResponse): AppleReceiptInfo | null {
  const list = [...(body.latest_receipt_info ?? []), ...(body.receipt?.in_app ?? [])];
  const candidates = list.filter((x) => x.product_id && mapAppleProductId(x.product_id));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const ea = parseInt(String(a.expires_date_ms ?? '0'), 10);
    const eb = parseInt(String(b.expires_date_ms ?? '0'), 10);
    return eb - ea;
  });
  return candidates[0] ?? null;
}

function msToIso(ms: string | undefined): string | null {
  if (!ms) return null;
  const n = parseInt(ms, 10);
  if (!Number.isFinite(n)) return null;
  return new Date(n).toISOString();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }

  const sharedSecret = Deno.env.get('APPLE_SHARED_SECRET') ?? Deno.env.get('APP_STORE_SHARED_SECRET') ?? '';
  if (!sharedSecret) {
    console.error('[validate-apple-receipt] APPLE_SHARED_SECRET not configured');
    return json(500, { error: 'Server configuration error', code: 'MISSING_APPLE_SECRET' });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
    if (!authHeader) {
      return json(401, { error: 'Missing Authorization', code: 'MISSING_AUTH' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabaseClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

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
        error: 'Ya tienes una suscripción activa con Stripe. Gestiona el plan desde la web o cancela antes de usar Apple.',
        code: 'STRIPE_SUBSCRIPTION_ACTIVE',
      });
    }

    let bodyJson: ValidateAppleReceiptBody;
    try {
      bodyJson = (await req.json()) as ValidateAppleReceiptBody;
    } catch {
      return json(400, { error: 'JSON inválido', code: 'INVALID_JSON' });
    }

    const intent = typeof bodyJson.intent === 'string' ? bodyJson.intent.slice(0, 32) : undefined;
    if (intent) {
      console.log('[validate-apple-receipt] intent (telemetry only)', intent);
    }

    const receiptData = typeof bodyJson.receiptData === 'string' ? bodyJson.receiptData.trim() : '';
    if (!receiptData) {
      return json(400, { error: 'receiptData es obligatorio', code: 'MISSING_RECEIPT' });
    }

    const productionUrl = 'https://buy.itunes.apple.com/verifyReceipt';
    const sandboxUrl = 'https://sandbox.itunes.apple.com/verifyReceipt';

    let verified = await postVerifyReceipt(productionUrl, receiptData, sharedSecret);
    if (verified.status === 21007) {
      verified = await postVerifyReceipt(sandboxUrl, receiptData, sharedSecret);
    }

    if (verified.status !== 0) {
      console.warn('[validate-apple-receipt] Apple status', verified.status);
      return json(400, {
        error: 'Recibo no válido o expirado',
        code: 'APPLE_VERIFY_FAILED',
        status: verified.status,
      });
    }

    const info = pickBestSubscriptionInfo(verified);
    if (!info?.product_id || !info.original_transaction_id) {
      return json(400, {
        error: 'No se encontró una suscripción Cellarium en el recibo',
        code: 'NO_MATCHING_SUBSCRIPTION',
      });
    }

    const mapped = mapAppleProductId(info.product_id);
    if (!mapped) {
      return json(400, { error: 'Producto no soportado', code: 'UNKNOWN_PRODUCT', product_id: info.product_id });
    }

    const expiresIso = msToIso(info.expires_date_ms);
    const purchaseIso = msToIso(info.purchase_date_ms) ?? new Date().toISOString();
    if (!expiresIso) {
      return json(400, { error: 'Fecha de expiración inválida', code: 'INVALID_EXPIRY' });
    }

    if (new Date(expiresIso) <= new Date()) {
      const lapse = await handleAppleSubscriptionLapsed({
        supabaseAdmin,
        ownerId,
        userId: userData.id,
        diagSkipReconcile: false,
      });
      if (lapse.error) {
        console.error('[validate-apple-receipt] lapse failed', lapse.error);
        return json(500, { error: 'Error al sincronizar baja', code: 'LAPSE_FAILED', details: lapse.error });
      }
      return json(200, {
        ok: true,
        synced: 'lapsed',
        reason: 'subscription_expired',
        expires_at: expiresIso,
      });
    }

    const nowIso = new Date().toISOString();
    const originalTx = String(info.original_transaction_id);
    const productId = String(info.product_id);

    const subRow = {
      user_id: userData.id,
      owner_id: ownerId,
      plan_id: mapped.planId,
      plan_name: mapped.planName,
      status: 'active',
      current_period_start: purchaseIso,
      current_period_end: expiresIso,
      cancel_at_period_end: false,
      canceled_at: null,
      stripe_subscription_id: null,
      stripe_customer_id: null,
      apple_original_transaction_id: originalTx,
      metadata: {
        provider: 'apple',
        apple_product_id: productId,
        apple_original_transaction_id: originalTx,
        addonBranchesQty: 0,
      },
      updated_at: nowIso,
    };

    const sync = await handleSubscriptionUpdate({
      supabaseAdmin,
      ownerId,
      userId: userData.id,
      plan: mapped.planId,
      expiresAt: expiresIso,
      provider: 'apple',
      addonsCount: 0,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionActive: true,
      subscriptionCancelAtPeriodEnd: false,
      userPatchOverride: null,
      subscriptionsUpsertRow: subRow,
      reconcileBranchLocks: true,
      reconcileOnlyWhenPlanFree: false,
      parallelUserUpdateAndSubscriptionsUpsert: false,
      afterUpsertCleanupOtherActives: { ownerId },
      appleOriginalTransactionId: originalTx,
      appleProductId: productId,
      diagSkipReconcile: false,
    });

    if (sync.error) {
      console.error('[validate-apple-receipt] sync failed', sync.error);
      return json(500, { error: 'Error al guardar la suscripción', code: 'SYNC_FAILED', details: sync.error });
    }

    return json(200, {
      ok: true,
      synced: 'active',
      plan_id: mapped.planId,
      plan_name: mapped.planName,
      expires_at: expiresIso,
      apple_original_transaction_id: originalTx,
    });
  } catch (e) {
    console.error('[validate-apple-receipt]', e);
    return json(500, { error: 'Error interno', code: 'INTERNAL' });
  }
});
