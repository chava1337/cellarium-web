import { User } from '../types';
import { isSubscriptionActive } from './subscriptionPermissions';

/**
 * Límite total de sucursales: 1 base + subscription_branch_addons_count (cuando la suscripción está activa).
 * Alineado con public.get_branch_limit_for_owner: si la suscripción no está efectivamente activa → solo 1.
 */

export interface BranchLimitResult {
  included: number;
  addons: number;
  limit: number;
}

export function getBranchLimit(user: User | null): BranchLimitResult {
  if (!user) {
    return { included: 1, addons: 0, limit: 1 };
  }
  const addonsRaw = user.subscription_branch_addons_count ?? 0;
  const addons =
    user.role === 'owner' && !isSubscriptionActive(user) ? 0 : Math.min(50, Math.max(0, addonsRaw));
  const limit = user.role === 'owner' && !isSubscriptionActive(user) ? 1 : 1 + addons;
  return { included: 1, addons, limit };
}

export function canCreateBranch(user: User | null, currentCount: number): boolean {
  const { limit } = getBranchLimit(user);
  return currentCount < limit;
}
