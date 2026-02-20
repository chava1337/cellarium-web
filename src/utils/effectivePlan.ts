/**
 * Plan efectivo para gating y UI: considera subscription_active y subscription_expires_at.
 * Sin esto, un user con subscription_plan='additional-branch' pero active=false o expirado
 * se trataría como Business hasta que algo refresque el perfil.
 */

import type { User } from '../types';

export type EffectivePlanId = 'free' | 'basic' | 'additional-branch';

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
