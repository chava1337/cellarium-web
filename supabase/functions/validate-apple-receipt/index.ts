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
import type { AllowedPlanId } from '../_shared/handle_subscription_update.ts';
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

function collectReceiptInfos(body: VerifyReceiptResponse): AppleReceiptInfo[] {
  return [...(body.latest_receipt_info ?? []), ...(body.receipt?.in_app ?? [])].filter(
    (x) => x.product_id && String(x.product_id).length > 0
  );
}

function msToNum(ms: string | undefined): number {
  const n = parseInt(String(ms ?? '0'), 10);
  return Number.isFinite(n) ? n : 0;
}

/** Por product_id, la fila no expirada con expiración más lejana (add-on y base pueden coexistir). */
function pickActiveLatestPerProduct(infos: AppleReceiptInfo[], nowMs: number): AppleReceiptInfo[] {
  const best = new Map<string, AppleReceiptInfo>();
  for (const x of infos) {
    const exp = msToNum(x.expires_date_ms);
    if (exp <= nowMs) continue;
    const pid = String(x.product_id);
    const prev = best.get(pid);
    if (!prev || exp > msToNum(prev.expires_date_ms)) best.set(pid, x);
  }
  return [...best.values()];
}

type ResolveResult =
  | {
      base: {
        productId: string;
        originalTransactionId: string;
        expiresIso: string;
        purchaseIso: string;
        planId: AllowedPlanId;
        planName: string;
      };
      addonsCount: 0 | 1 | 3;
      addonProductId: string | null;
      legacyAlsoPresent: boolean;
    }
  | { error: 'NO_MATCHING_SUBSCRIPTION' | 'LEGACY_ONLY' | 'ADDON_WITHOUT_BASE' };

function resolveAppleSubscriptionFromReceipt(body: VerifyReceiptResponse, now: Date): ResolveResult {
  const nowMs = now.getTime();
  const rows = pickActiveLatestPerProduct(collectReceiptInfos(body), nowMs);

  let legacyAlsoPresent = false;
  let bestBase: { info: AppleReceiptInfo; planId: AllowedPlanId; planName: string } | null = null;
  let bestAddon: { info: AppleReceiptInfo; slots: 1 | 3 } | null = null;

  for (const info of rows) {
    const pid = String(info.product_id);
    const m = mapAppleProductId(pid);
    if (m == null) continue;
    if (m.kind === 'legacy') {
      legacyAlsoPresent = true;
      continue;
    }
    if (m.kind === 'base_plan') {
      const exp = msToNum(info.expires_date_ms);
      const prevExp = bestBase ? msToNum(bestBase.info.expires_date_ms) : 0;
      if (!bestBase || exp > prevExp) {
        bestBase = { info, planId: m.planId as AllowedPlanId, planName: m.planName };
      }
      continue;
    }
    if (m.kind === 'branch_addon') {
      const exp = msToNum(info.expires_date_ms);
      const prevExp = bestAddon ? msToNum(bestAddon.info.expires_date_ms) : 0;
      if (!bestAddon || exp > prevExp) {
        bestAddon = { info, slots: m.branchAddonSlots };
      }
    }
  }

  if (!bestBase && bestAddon) {
    return { error: 'ADDON_WITHOUT_BASE' };
  }
  if (!bestBase) {
    if (legacyAlsoPresent) return { error: 'LEGACY_ONLY' };
    return { error: 'NO_MATCHING_SUBSCRIPTION' };
  }

  const expiresIso = msToIso(bestBase.info.expires_date_ms);
  const purchaseIso = msToIso(bestBase.info.purchase_date_ms) ?? new Date().toISOString();
  if (!expiresIso) return { error: 'NO_MATCHING_SUBSCRIPTION' };

  const addonsCount = (bestAddon ? bestAddon.slots : 0) as 0 | 1 | 3;

  return {
    base: {
      productId: String(bestBase.info.product_id),
      originalTransactionId: String(bestBase.info.original_transaction_id),
      expiresIso,
      purchaseIso,
      planId: bestBase.planId,
      planName: bestBase.planName,
    },
    addonsCount,
    addonProductId: bestAddon ? String(bestAddon.info.product_id) : null,
    legacyAlsoPresent,
  };
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

    const resolved = resolveAppleSubscriptionFromReceipt(verified, new Date());
    if ('error' in resolved) {
      if (resolved.error === 'LEGACY_ONLY') {
        return json(400, {
          error:
            'Suscripción Apple legacy no está disponible en el flujo actual. Usa un plan nuevo (Bistro, Trattoria o Grand Maison).',
          code: 'LEGACY_APPLE_PRODUCT',
        });
      }
      if (resolved.error === 'ADDON_WITHOUT_BASE') {
        return json(400, {
          error: 'Se requiere un plan base activo para el add-on de sucursales.',
          code: 'ADDON_WITHOUT_BASE',
        });
      }
      return json(400, {
        error: 'No se encontró una suscripción Cellarium en el recibo',
        code: 'NO_MATCHING_SUBSCRIPTION',
      });
    }

    const { base, addonsCount, addonProductId, legacyAlsoPresent } = resolved;
    if (legacyAlsoPresent) {
      console.warn('[validate-apple-receipt] recibo contiene producto legacy además del plan nuevo (legacy ignorado)');
    }

    const expiresIso = base.expiresIso;
    const purchaseIso = base.purchaseIso;

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
    const originalTx = base.originalTransactionId;
    const productId = base.productId;

    const subRow = {
      user_id: userData.id,
      owner_id: ownerId,
      plan_id: base.planId,
      plan_name: base.planName,
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
        apple_branch_addon_product_id: addonProductId,
        addonBranchesQty: addonsCount,
      },
      updated_at: nowIso,
    };

    const sync = await handleSubscriptionUpdate({
      supabaseAdmin,
      ownerId,
      userId: userData.id,
      plan: base.planId,
      expiresAt: expiresIso,
      provider: 'apple',
      addonsCount,
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
      plan_id: base.planId,
      plan_name: base.planName,
      expires_at: expiresIso,
      apple_original_transaction_id: originalTx,
      subscription_branch_addons_count: addonsCount,
    });
  } catch (e) {
    console.error('[validate-apple-receipt]', e);
    return json(500, { error: 'Error interno', code: 'INTERNAL' });
  }
});
