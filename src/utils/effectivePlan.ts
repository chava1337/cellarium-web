/**
 * Plan efectivo para gating y UI: subscription_active, subscription_expires_at y plan canónico en BD.
 */

import type { User, CanonicalPlanId } from '../types';
import { supabase } from '../lib/supabase';

export type EffectivePlanId = CanonicalPlanId;

const CANONICAL = new Set<string>(['cafe', 'bistro', 'trattoria', 'grand-maison']);

function normalizeStoredPlan(raw: unknown): EffectivePlanId {
  const p = String(raw ?? 'cafe').toLowerCase().trim();
  if (CANONICAL.has(p)) return p as EffectivePlanId;
  return 'cafe';
}

function mapRpcPlanToEffective(rpcPlan: string | null | undefined): EffectivePlanId {
  return normalizeStoredPlan(rpcPlan);
}

/**
 * Plan efectivo del OWNER (gerente/supervisor). RPC get_plan_id_effective; fallback users.
 */
export async function getOwnerEffectivePlan(user: User | null): Promise<EffectivePlanId> {
  let ownerId = user?.owner_id ?? null;
  if (!ownerId && user?.role && user.role !== 'owner' && user?.branch_id) {
    try {
      const { data: branchRow, error: branchError } = await supabase
        .from('branches')
        .select('owner_id')
        .eq('id', user.branch_id)
        .maybeSingle();
      if (!branchError && branchRow?.owner_id) {
        ownerId = String(branchRow.owner_id);
      }
    } catch (_) {}
  }
  if (!ownerId) return 'cafe';

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
  return 'cafe';
}

/**
 * - Sin user => cafe
 * - subscription_active !== true => cafe
 * - subscription_expires_at en el pasado => cafe
 * - Si no => subscription_plan canónico o cafe
 */
export function getEffectivePlan(user: User | null): EffectivePlanId {
  if (!user) return 'cafe';
  if (user.subscription_active !== true) return 'cafe';
  if (user.subscription_expires_at != null) {
    const expiresAt = new Date(user.subscription_expires_at);
    if (!isNaN(expiresAt.getTime()) && expiresAt <= new Date()) return 'cafe';
  }
  return normalizeStoredPlan(user.subscription_plan);
}

export function isCafe(user: User | null): boolean {
  return getEffectivePlan(user) === 'cafe';
}

/** @deprecated usar isCafe */
export function isFree(user: User | null): boolean {
  return isCafe(user);
}

export function isGrandMaison(user: User | null): boolean {
  return getEffectivePlan(user) === 'grand-maison';
}
