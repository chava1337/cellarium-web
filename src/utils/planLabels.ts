/**
 * Etiquetas UI para subscription_plan canónico.
 */

import type { CanonicalPlanId } from '../types';

export type PlanId = CanonicalPlanId;

export const PLAN_LABEL_ES: Record<PlanId, string> = {
  cafe: 'Cafe',
  bistro: 'Bistro',
  trattoria: 'Trattoria',
  'grand-maison': 'Grand Maison',
};

export function getPlanLabel(planId?: string): string {
  if (
    planId === 'cafe' ||
    planId === 'bistro' ||
    planId === 'trattoria' ||
    planId === 'grand-maison'
  ) {
    return PLAN_LABEL_ES[planId];
  }
  return 'Cafe';
}
