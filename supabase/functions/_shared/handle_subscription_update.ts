/**
 * Centraliza escrituras de suscripción en public.users + public.subscriptions + reconcile_branch_locks.
 * Stripe (webhook), Apple IAP (validate-apple-receipt) y Google Play (validate-google-subscription).
 * Planes canónicos: cafe | bistro | trattoria | grand-maison
 */

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export type BillingProvider = 'stripe' | 'apple' | 'google';

export type AllowedPlanId = 'cafe' | 'bistro' | 'trattoria' | 'grand-maison';

export interface HandleSubscriptionUpdateParams {
  supabaseAdmin: SupabaseClient;
  ownerId: string;
  userId: string;
  plan: AllowedPlanId;
  expiresAt: string | null;
  provider: BillingProvider;
  /** null = no tocar salvo reglas por plan/provider (Apple fuerza 0). */
  addonsCount: number | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionActive: boolean;
  subscriptionCancelAtPeriodEnd: boolean;
  /**
   * Parche completo para public.users (Stripe main path con reglas invoice).
   * Se fusiona con billing_provider / Apple; sustituye el patch derivado de plan.
   */
  userPatchOverride?: Record<string, unknown> | null;
  subscriptionsUpsertRow: Record<string, unknown> | null;
  reconcileBranchLocks: boolean;
  diagSkipReconcile?: boolean;
  /** true: reconciliar solo si plan === cafe (handler SUB_UPDATED temprano) */
  reconcileOnlyWhenPlanFree?: boolean;
  /**
   * SUB_UPDATED: actualiza users y subscriptions en paralelo (solo Stripe).
   * false: upsert subscriptions primero, cleanup opcional, luego users + reconcile (main path).
   */
  parallelUserUpdateAndSubscriptionsUpsert?: boolean;
  /** Cleanup de otras filas active: owner_id del tenant; el id de la fila upsertada se toma del upsert interno. */
  afterUpsertCleanupOtherActives?: { ownerId: string };
  /** Tras upsert OK y antes de cleanup (paridad stripe-webhook: logs entre upsert y cleanup). */
  afterSuccessfulUpsert?: (ctx: { upsertId: string | null }) => void;
  appleOriginalTransactionId?: string | null;
  appleProductId?: string | null;
  /** Google Play: purchase token (clave de upsert en subscriptions). */
  googlePurchaseToken?: string | null;
  googleProductId?: string | null;
  googleOrderId?: string | null;
}

function envTrue(name: string): boolean {
  const v = Deno.env.get(name);
  return typeof v === 'string' && v.trim().toLowerCase() === 'true';
}

function mergeBillingFields(
  provider: BillingProvider,
  appleOriginalTransactionId: string | null | undefined,
  appleProductId: string | null | undefined
): Record<string, unknown> {
  if (provider === 'stripe') {
    return {
      billing_provider: 'stripe',
      apple_original_transaction_id: null,
      apple_product_id: null,
    };
  }
  if (provider === 'google') {
    return {
      billing_provider: 'google',
      apple_original_transaction_id: null,
      apple_product_id: null,
    };
  }
  const o: Record<string, unknown> = { billing_provider: 'apple' };
  if (appleOriginalTransactionId !== undefined) o.apple_original_transaction_id = appleOriginalTransactionId;
  if (appleProductId !== undefined) o.apple_product_id = appleProductId;
  return o;
}

function subscriptionsUpsertConflict(p: HandleSubscriptionUpdateParams): string {
  if (p.provider === 'apple') return 'apple_original_transaction_id';
  if (p.provider === 'google') return 'google_purchase_token';
  return 'stripe_subscription_id';
}

function buildPatchFromPlanParams(p: HandleSubscriptionUpdateParams): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    subscription_active: p.subscriptionActive,
    subscription_expires_at: p.expiresAt,
    subscription_plan: p.plan,
    subscription_cancel_at_period_end: p.subscriptionCancelAtPeriodEnd,
  };

  if (p.provider === 'apple' || p.provider === 'google') {
    patch.stripe_subscription_id = null;
    if (p.addonsCount !== null && p.addonsCount !== undefined) {
      patch.subscription_branch_addons_count = p.addonsCount;
    }
  } else {
    patch.stripe_subscription_id = p.stripeSubscriptionId;
    if (p.plan === 'cafe') {
      patch.subscription_branch_addons_count = 0;
    } else if (p.addonsCount !== null && p.addonsCount !== undefined) {
      patch.subscription_branch_addons_count = p.addonsCount;
    }
  }

  Object.assign(patch, mergeBillingFields(p.provider, p.appleOriginalTransactionId, p.appleProductId));
  return patch;
}

/** Patch final para users: override (Stripe main) o derivado de plan (SUB_UPDATED / Apple). */
function resolveUserPatch(p: HandleSubscriptionUpdateParams): Record<string, unknown> {
  if (p.userPatchOverride && Object.keys(p.userPatchOverride).length > 0) {
    return { ...p.userPatchOverride, ...mergeBillingFields(p.provider, p.appleOriginalTransactionId, p.appleProductId) };
  }
  return buildPatchFromPlanParams(p);
}

function usersUpdateQuery(p: HandleSubscriptionUpdateParams, userPatch: Record<string, unknown>) {
  const q = p.supabaseAdmin.from('users').update(userPatch);
  if (p.provider === 'apple' || p.provider === 'google') {
    return q.eq('id', p.userId);
  }
  const cid = p.stripeCustomerId;
  if (!cid) {
    return q.eq('id', p.userId);
  }
  return q.eq('stripe_customer_id', cid);
}

async function runReconcile(
  supabaseAdmin: SupabaseClient,
  ownerId: string,
  diagSkip: boolean | undefined
): Promise<void> {
  if (diagSkip || envTrue('DIAG_SKIP_RECONCILE_BRANCH_LOCKS')) return;
  const { error: recErr } = await supabaseAdmin.rpc('reconcile_branch_locks', { p_owner_id: ownerId });
  if (recErr) console.error('[handleSubscriptionUpdate] reconcile_branch_locks:', recErr.message);
  else console.log('[handleSubscriptionUpdate] reconcile_branch_locks ok', { ownerId });
}

/** Defensa en profundidad: la fila de subscriptions debe coincidir con owner/user del caller (no confiar en el body). */
function assertSubscriptionsRowMatchesCaller(p: HandleSubscriptionUpdateParams): string | null {
  if (!p.subscriptionsUpsertRow) return null;
  const row = p.subscriptionsUpsertRow;
  const oid = row['owner_id'];
  const uid = row['user_id'];
  if (oid !== undefined && oid !== p.ownerId) return 'subscriptionsUpsertRow.owner_id does not match ownerId';
  if (uid !== undefined && uid !== p.userId) return 'subscriptionsUpsertRow.user_id does not match userId';
    if (p.provider === 'apple' && p.appleOriginalTransactionId) {
      const aid = row['apple_original_transaction_id'];
      if (aid !== undefined && String(aid) !== String(p.appleOriginalTransactionId)) {
        return 'subscriptionsUpsertRow.apple_original_transaction_id mismatch';
      }
      if (oid === undefined || uid === undefined) {
        return 'subscriptionsUpsertRow must include owner_id and user_id for Apple';
      }
    }
    if (p.provider === 'google' && p.googlePurchaseToken) {
      const tok = row['google_purchase_token'];
      if (tok !== undefined && String(tok) !== String(p.googlePurchaseToken)) {
        return 'subscriptionsUpsertRow.google_purchase_token mismatch';
      }
      if (oid === undefined || uid === undefined) {
        return 'subscriptionsUpsertRow must include owner_id and user_id for Google';
      }
    }
  return null;
}

/**
 * Sincroniza estado de suscripción en BD. Mantiene compatibilidad con los dos órdenes del webhook Stripe.
 */
export async function handleSubscriptionUpdate(
  p: HandleSubscriptionUpdateParams
): Promise<{ error?: string }> {
  if (p.provider === 'stripe' && !p.stripeCustomerId) {
    return { error: 'stripeCustomerId is required' };
  }
  if (p.provider === 'apple' && !p.appleOriginalTransactionId) {
    return { error: 'appleOriginalTransactionId is required' };
  }
  if (p.provider === 'google' && !p.googlePurchaseToken) {
    return { error: 'googlePurchaseToken is required' };
  }

  const rowAssert = assertSubscriptionsRowMatchesCaller(p);
  if (rowAssert) {
    console.error('[handleSubscriptionUpdate]', rowAssert);
    return { error: rowAssert };
  }

  const userPatch = resolveUserPatch(p);

  const shouldReconcile = (): boolean => {
    if (!p.reconcileBranchLocks) return false;
    if (p.reconcileOnlyWhenPlanFree) return p.plan === 'cafe';
    return true;
  };

  const conflict = subscriptionsUpsertConflict(p);

  // ——— SUB_UPDATED: paralelo users + subscriptions (solo Stripe; paridad: siempre ack; solo logs en error) ———
  if (p.parallelUserUpdateAndSubscriptionsUpsert && p.subscriptionsUpsertRow) {
    const stripeCustomerId = p.stripeCustomerId;
    if (!stripeCustomerId) {
      return { error: 'stripeCustomerId is required' };
    }
    const [updateResult, upsertSubResult] = await Promise.all([
      p.supabaseAdmin.from('users').update(userPatch).eq('stripe_customer_id', stripeCustomerId),
      p.supabaseAdmin
        .from('subscriptions')
        .upsert(p.subscriptionsUpsertRow, { onConflict: 'stripe_subscription_id' }),
    ]);
    if (updateResult.error) {
      console.error('[handleSubscriptionUpdate] users update failed', updateResult.error.message);
    }
    if (upsertSubResult.error) {
      console.error('[handleSubscriptionUpdate] subscriptions upsert failed', upsertSubResult.error.message);
    }
    if (shouldReconcile() && !updateResult.error) {
      await runReconcile(p.supabaseAdmin, p.ownerId, p.diagSkipReconcile);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    return {};
  }

  // ——— Main path: upsert → cleanup → users + reconcile (parallel) ———
  if (p.subscriptionsUpsertRow) {
    const { data: upsertData, error: upsertError } = await p.supabaseAdmin
      .from('subscriptions')
      .upsert(p.subscriptionsUpsertRow, { onConflict: conflict })
      .select('id, owner_id, stripe_subscription_id')
      .single();

    if (upsertError) {
      console.error('[handleSubscriptionUpdate] subscriptions upsert failed', upsertError.message);
      return { error: upsertError.message };
    }

    const upsertOwnerId = upsertData?.owner_id as string | undefined;
    if (upsertOwnerId && upsertOwnerId !== p.ownerId) {
      console.error('[handleSubscriptionUpdate] SECURITY: upsert owner_id mismatch');
      return { error: 'subscriptions upsert owner_id mismatch' };
    }

    p.afterSuccessfulUpsert?.({ upsertId: (upsertData?.id as string | undefined) ?? null });

    const currentRowId = upsertData?.id as string | undefined;
    if (currentRowId && p.afterUpsertCleanupOtherActives) {
      const { data: cleanupData, error: cleanupError } = await p.supabaseAdmin
        .from('subscriptions')
        .update({ status: 'canceled' })
        .eq('owner_id', p.afterUpsertCleanupOtherActives.ownerId)
        .eq('status', 'active')
        .neq('id', currentRowId)
        .select('id');
      if (cleanupError) {
        console.error('[handleSubscriptionUpdate] cleanup subscriptions:', cleanupError.message);
      } else if (cleanupData && cleanupData.length > 0) {
        console.log(
          '[handleSubscriptionUpdate] marked other active subs canceled',
          p.afterUpsertCleanupOtherActives.ownerId,
          'count:',
          cleanupData.length
        );
      }
    }

    const updateUsersPromise = usersUpdateQuery(p, userPatch);
    const reconcilePromise =
      shouldReconcile() && !envTrue('DIAG_SKIP_RECONCILE_BRANCH_LOCKS') && !p.diagSkipReconcile
        ? p.supabaseAdmin.rpc('reconcile_branch_locks', { p_owner_id: p.ownerId })
        : Promise.resolve({ error: null as { message: string } | null });

    const [updateUserResult, reconcileResult] = await Promise.all([updateUsersPromise, reconcilePromise]);

    if (updateUserResult.error) {
      console.error('[handleSubscriptionUpdate] users update failed', updateUserResult.error.message);
    } else {
      console.log('[USER_UPDATED]', { billing: userPatch });
    }
    if (reconcileResult.error) {
      console.error('[handleSubscriptionUpdate] reconcile_branch_locks:', reconcileResult.error.message);
    } else if (shouldReconcile() && !p.diagSkipReconcile && !envTrue('DIAG_SKIP_RECONCILE_BRANCH_LOCKS')) {
      console.log('[handleSubscriptionUpdate] reconcile_branch_locks ok', p.ownerId);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    return {};
  }

  const { error: updateErr } = await usersUpdateQuery(p, userPatch);
  if (updateErr) {
    console.error('[handleSubscriptionUpdate] users update failed', updateErr.message);
  }
  if (shouldReconcile()) {
    await runReconcile(p.supabaseAdmin, p.ownerId, p.diagSkipReconcile);
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  return {};
}

export interface HandleStripeSubscriptionDeletedParams {
  supabaseAdmin: SupabaseClient;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  ownerId: string;
  diagSkipReconcile?: boolean;
}

/**
 * customer.subscription.deleted: reset a free y reconciliar (mismo orden que antes: users + subscriptions en paralelo).
 */
export async function handleStripeSubscriptionDeleted(
  p: HandleStripeSubscriptionDeletedParams
): Promise<{ error?: string }> {
  const nowIso = new Date().toISOString();

  const { data: appleStillActive } = await p.supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('owner_id', p.ownerId)
    .not('apple_original_transaction_id', 'is', null)
    .in('status', ['active', 'trialing'])
    .gt('current_period_end', nowIso)
    .maybeSingle();

  const { data: googleStillActive } = await p.supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('owner_id', p.ownerId)
    .not('google_purchase_token', 'is', null)
    .in('status', ['active', 'trialing'])
    .gt('current_period_end', nowIso)
    .maybeSingle();

  const updateSubRow =
    p.stripeSubscriptionId.length > 0
      ? p.supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'canceled',
            current_period_end: nowIso,
            updated_at: nowIso,
          })
          .eq('stripe_subscription_id', p.stripeSubscriptionId)
      : Promise.resolve({ error: null as { message?: string } | null });

  if (appleStillActive?.id || googleStillActive?.id) {
    // Apple o Google sigue activo: no degradar a free; solo desvincular el Stripe sub cancelado.
    const updateUsersDetachStripe = p.supabaseAdmin
      .from('users')
      .update({
        stripe_subscription_id: null,
        subscription_cancel_at_period_end: false,
      })
      .eq('stripe_customer_id', p.stripeCustomerId);

    const [updateResult] = await Promise.all([updateUsersDetachStripe, updateSubRow]);
    if (updateResult.error) {
      console.error('[handleStripeSubscriptionDeleted] update failed', updateResult.error.message);
      return { error: updateResult.error.message };
    }
    if (!envTrue('DIAG_SKIP_RECONCILE_BRANCH_LOCKS')) {
      const { error: recErr } = await p.supabaseAdmin.rpc('reconcile_branch_locks', { p_owner_id: p.ownerId });
      if (recErr) console.error('[handleStripeSubscriptionDeleted] reconcile_branch_locks:', recErr.message);
      else console.log('[handleStripeSubscriptionDeleted] reconcile_branch_locks ok (apple retained)');
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    return {};
  }

  const updateUsers = p.supabaseAdmin
    .from('users')
    .update({
      subscription_active: false,
      stripe_subscription_id: null,
      subscription_expires_at: null,
      subscription_plan: 'cafe',
      subscription_cancel_at_period_end: false,
      subscription_branch_addons_count: 0,
      billing_provider: 'none',
      apple_original_transaction_id: null,
      apple_product_id: null,
    })
    .eq('stripe_customer_id', p.stripeCustomerId);

  const [updateResult] = await Promise.all([updateUsers, updateSubRow]);
  if (updateResult.error) {
    console.error('[handleStripeSubscriptionDeleted] update failed', updateResult.error.message);
    return { error: updateResult.error.message };
  }

  if (!updateResult.error && !envTrue('DIAG_SKIP_RECONCILE_BRANCH_LOCKS')) {
    const { error: recErr } = await p.supabaseAdmin.rpc('reconcile_branch_locks', { p_owner_id: p.ownerId });
    if (recErr) console.error('[handleStripeSubscriptionDeleted] reconcile_branch_locks:', recErr.message);
    else console.log('[handleStripeSubscriptionDeleted] reconcile_branch_locks ok');
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  return {};
}

export interface HandleAppleSubscriptionLapsedParams {
  supabaseAdmin: SupabaseClient;
  ownerId: string;
  userId: string;
  diagSkipReconcile?: boolean;
}

/**
 * MVP: recibo Apple expirado o sin suscripción Cellarium válida → free en users y cancelar filas Apple en subscriptions.
 * Solo llamar cuando no hay Stripe activo (evita pisar plan web).
 */
export async function handleAppleSubscriptionLapsed(
  p: HandleAppleSubscriptionLapsedParams
): Promise<{ error?: string }> {
  const nowIso = new Date().toISOString();
  const { error: subErr } = await p.supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'canceled',
      current_period_end: nowIso,
      updated_at: nowIso,
    })
    .eq('owner_id', p.ownerId)
    .not('apple_original_transaction_id', 'is', null)
    .in('status', ['active', 'trialing']);

  if (subErr) {
    console.error('[handleAppleSubscriptionLapsed] subscriptions update', subErr.message);
    return { error: subErr.message };
  }

  const { error: userErr } = await p.supabaseAdmin
    .from('users')
    .update({
      subscription_active: false,
      subscription_plan: 'cafe',
      subscription_expires_at: null,
      subscription_cancel_at_period_end: false,
      subscription_branch_addons_count: 0,
      billing_provider: 'none',
      apple_original_transaction_id: null,
      apple_product_id: null,
      stripe_subscription_id: null,
    })
    .eq('id', p.userId);

  if (userErr) {
    console.error('[handleAppleSubscriptionLapsed] users update', userErr.message);
    return { error: userErr.message };
  }

  await runReconcile(p.supabaseAdmin, p.ownerId, p.diagSkipReconcile);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return {};
}

export interface HandleGoogleSubscriptionLapsedParams {
  supabaseAdmin: SupabaseClient;
  ownerId: string;
  userId: string;
  purchaseToken: string;
  diagSkipReconcile?: boolean;
}

/**
 * Compra Google expirada / revocada: baja fila por token y users a cafe si no queda Stripe/Apple activo.
 * No llamar si hasActiveStripeBackedSubscription (el caller debe comprobarlo).
 */
export async function handleGoogleSubscriptionLapsed(
  p: HandleGoogleSubscriptionLapsedParams
): Promise<{ error?: string }> {
  const nowIso = new Date().toISOString();

  const { error: subErr } = await p.supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'expired',
      current_period_end: nowIso,
      updated_at: nowIso,
    })
    .eq('owner_id', p.ownerId)
    .eq('google_purchase_token', p.purchaseToken);

  if (subErr) {
    console.error('[handleGoogleSubscriptionLapsed] subscriptions update', subErr.message);
    return { error: subErr.message };
  }

  const { data: otherActive } = await p.supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('owner_id', p.ownerId)
    .in('status', ['active', 'trialing'])
    .gt('current_period_end', nowIso)
    .limit(1)
    .maybeSingle();

  if (otherActive?.id) {
    await runReconcile(p.supabaseAdmin, p.ownerId, p.diagSkipReconcile);
    return {};
  }

  const { error: userErr } = await p.supabaseAdmin
    .from('users')
    .update({
      subscription_active: false,
      subscription_plan: 'cafe',
      subscription_expires_at: null,
      subscription_cancel_at_period_end: false,
      subscription_branch_addons_count: 0,
      billing_provider: 'none',
      apple_original_transaction_id: null,
      apple_product_id: null,
      stripe_subscription_id: null,
    })
    .eq('id', p.userId);

  if (userErr) {
    console.error('[handleGoogleSubscriptionLapsed] users update', userErr.message);
    return { error: userErr.message };
  }

  await runReconcile(p.supabaseAdmin, p.ownerId, p.diagSkipReconcile);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return {};
}
