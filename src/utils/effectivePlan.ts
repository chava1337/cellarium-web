/**
 * Plan efectivo para gating y UI: considera subscription_active y subscription_expires_at.
 * Sin esto, un user con subscription_plan='additional-branch' pero active=false o expirado
 * se trataría como Business hasta que algo refresque el perfil.
 */

import type { User } from '../types';
import { supabase } from '../lib/supabase';

export type EffectivePlanId = 'free' | 'basic' | 'additional-branch';

function mapRpcPlanToEffective(rpcPlan: string | null | undefined): EffectivePlanId {
  if (!rpcPlan) return 'free';
  const p = String(rpcPlan).toLowerCase();
  if (p === 'pro') return 'basic';
  if (p === 'business') return 'additional-branch';
  if (p === 'free' || p === 'basic' || p === 'additional-branch') return p;
  return 'free';
}

/**
 * Plan efectivo del OWNER (para gerente/supervisor). Preferir RPC get_plan_id_effective;
 * si no está disponible, consultar public.users por owner_id y usar getEffectivePlan del row.
 */
export async function getOwnerEffectivePlan(user: User | null): Promise<EffectivePlanId> {
  const ownerId = user?.owner_id;
  if (!ownerId) return 'free';

  try {
    const { data, error } = await supabase.rpc('get_plan_id_effective', { p_owner: ownerId });
    if (!error && data != null) return mapRpcPlanToEffective(data);
  } catch (_) {}

  try {
    const { data: ownerRow, error } = await supabase
      .from('users')
      .select('subscription_plan, subscription_active, subscription_expires_at')
      .eq('id', ownerId)
      .single();
    if (!error && ownerRow) {
      return getEffectivePlan(ownerRow as User);
    }
  } catch (_) {}
  return 'free';
}

/**
 * Plan efectivo para el usuario.
 * - Sin user => free
 * - subscription_active !== true => free
 * - subscription_expires_at en el pasado => free
 * - Si no => user.subscription_plan ?? 'free'
 */
export function getEffectivePlan(user: User | null): EffectivePlanId {
  if (!user) return 'free';
  if (user.subscription_active !== true) return 'free';
  if (user.subscription_expires_at != null) {
    const expiresAt = new Date(user.subscription_expires_at);
    if (!isNaN(expiresAt.getTime()) && expiresAt <= new Date()) return 'free';
  }
  const plan = user.subscription_plan ?? 'free';
  if (plan === 'free' || plan === 'basic' || plan === 'additional-branch') return plan;
  return 'free';
}

export function isBusiness(user: User | null): boolean {
  return getEffectivePlan(user) === 'additional-branch';
}

export function isPro(user: User | null): boolean {
  return getEffectivePlan(user) === 'basic';
}

export function isFree(user: User | null): boolean {
  return getEffectivePlan(user) === 'free';
}
