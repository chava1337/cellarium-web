import { User } from '../types';

/**
 * Límite total de sucursales: 1 base + subscription_branch_addons_count (Stripe quantity o Apple 1|3).
 * Alineado con public.get_branch_limit_for_owner y reconcile_branch_locks.
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
  const addons = user.subscription_branch_addons_count ?? 0;
  return { included: 1, addons, limit: 1 + addons };
}

export function canCreateBranch(user: User | null, currentCount: number): boolean {
  const { limit } = getBranchLimit(user);
  return currentCount < limit;
}
