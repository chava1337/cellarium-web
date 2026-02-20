/**
 * Fuente de verdad para etiquetas de plan en UI.
 * Los valores de plan_id vienen de public.users.subscription_plan (free | basic | additional-branch).
 */

export type PlanId = 'free' | 'basic' | 'additional-branch';

export const PLAN_LABEL_ES: Record<PlanId, string> = {
  free: 'Gratis',
  basic: 'Pro',
  'additional-branch': 'Business',
};

export function getPlanLabel(planId?: string): string {
  if (planId === 'free' || planId === 'basic' || planId === 'additional-branch') {
    return PLAN_LABEL_ES[planId];
  }
  return 'Gratis';
}
