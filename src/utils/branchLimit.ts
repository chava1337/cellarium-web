import { User } from '../types';
import { getEffectivePlan } from './effectivePlan';

/**
 * Reglas de negocio:
 * - Plan efectivo 'additional-branch' = Business (incluye 3 sucursales base); usa getEffectivePlan (active + no expirado).
 * - subscription_branch_addons_count = add-ons comprados.
 * - limit = included + addons.
 * Comprar add-on NO crea una branch; solo aumenta el límite.
 */

export interface BranchLimitResult {
  /** Sucursales incluidas en el plan (Free/Pro=1, Business=3). */
  included: number;
  /** Add-ons de sucursal comprados. */
  addons: number;
  /** Límite total permitido (included + addons). */
  limit: number;
}

/**
 * Calcula el límite de sucursales para el owner según plan y add-ons.
 * Alineado con backend get_branch_limit_for_owner: included solo por plan.
 * - included: Business ('additional-branch') => 3, Free/Pro => 1
 * - addons: subscription_branch_addons_count ?? 0
 * - limit: included + addons
 */
export function getBranchLimit(user: User | null): BranchLimitResult {
  if (!user) {
    return { included: 1, addons: 0, limit: 1 };
  }
  const effectivePlan = getEffectivePlan(user);
  const included = effectivePlan === 'additional-branch' ? 3 : 1;
  const addons = user.subscription_branch_addons_count ?? 0;
  const limit = included + addons;
  return { included, addons, limit };
}

/**
 * Indica si el owner puede crear una sucursal más.
 * currentCount = número actual de branches (owner_id = user.id).
 */
export function canCreateBranch(user: User | null, currentCount: number): boolean {
  const { limit } = getBranchLimit(user);
  return currentCount < limit;
}
