/**
 * Reglas de coexistencia Stripe ↔ Apple (backend).
 * Todas las consultas usan owner_id del servidor (nunca del body del cliente).
 */

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

function nowIso(): string {
  return new Date().toISOString();
}

/** Suscripción activa cuyo origen es Apple (fila en public.subscriptions con apple_original_transaction_id). */
export async function hasActiveAppleSubscription(
  supabaseAdmin: SupabaseClient,
  ownerId: string
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('owner_id', ownerId)
    .in('status', ['active', 'trialing'])
    .gt('current_period_end', nowIso())
    .not('apple_original_transaction_id', 'is', null)
    .maybeSingle();
  return !!data?.id;
}

/** Suscripción activa respaldada por Stripe (stripe_subscription_id no nulo). */
export async function hasActiveStripeBackedSubscription(
  supabaseAdmin: SupabaseClient,
  ownerId: string
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('owner_id', ownerId)
    .in('status', ['active', 'trialing'])
    .gt('current_period_end', nowIso())
    .not('stripe_subscription_id', 'is', null)
    .maybeSingle();
  return !!data?.id;
}
