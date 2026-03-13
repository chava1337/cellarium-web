import { User } from '../types';
import { FeatureId } from '../constants/subscriptionFeatures';
import { getEffectivePlan } from './effectivePlan';

export type SubscriptionPlan = 'free' | 'basic' | 'additional-branch';

export interface PlanLimits {
  maxBranches: number;
  maxWines: number;
  maxManagers: number;
  maxCocktails: number;
  blockedFeatureIds: FeatureId[];
}

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  free: {
    maxBranches: 1,
    maxWines: 10,
    maxManagers: 1,
    maxCocktails: 10,
    blockedFeatureIds: [
      'inventory',
      'tastings',
      'branches_additional',
    ],
  },
  basic: {
    maxBranches: 1,
    maxWines: 100,
    maxManagers: -1, // Ilimitado
    maxCocktails: -1,
    blockedFeatureIds: [],
  },
  'additional-branch': {
    maxBranches: -1, // Sin límite
    maxWines: -1, // Sin límite
    maxManagers: -1, // Ilimitado
    maxCocktails: -1,
    blockedFeatureIds: [],
  },
};

export const checkSubscriptionFeature = (user: User | null, featureId: FeatureId | string): boolean => {
  if (!user || user.role !== 'owner') return true; // Solo owners tienen límites (staff usa plan del owner en UI vía checkSubscriptionFeatureByPlan)

  const plan = getEffectivePlan(user);
  const limits = PLAN_LIMITS[plan];
  
  // Si el plan bloquea la función (usando FeatureId estable)
  if (limits.blockedFeatureIds.includes(featureId as FeatureId)) {
    return false;
  }

  return true;
};

/**
 * Comprueba si un plan permite un feature (para gating por plan sin depender del rol).
 * Usar cuando el plan efectivo ya fue resuelto (p. ej. plan del owner para staff).
 */
export function checkSubscriptionFeatureByPlan(
  plan: SubscriptionPlan,
  featureId: FeatureId | string
): boolean {
  const limits = PLAN_LIMITS[plan];
  return !limits.blockedFeatureIds.includes(featureId as FeatureId);
}

export const checkSubscriptionLimit = (
  user: User | null,
  limitType: 'branches' | 'wines' | 'managers',
  currentCount: number
): boolean => {
  if (!user || user.role !== 'owner') return true; // Solo owners tienen límites

  const plan = getEffectivePlan(user);
  const limits = PLAN_LIMITS[plan];
  
  const maxLimit = limits[`max${limitType.charAt(0).toUpperCase() + limitType.slice(1)}` as keyof PlanLimits] as number;
  
  // -1 significa ilimitado
  if (maxLimit === -1) return true;
  
  return currentCount < maxLimit;
};

export const getSubscriptionPlanName = (plan: SubscriptionPlan): string => {
  const names: Record<SubscriptionPlan, string> = {
    free: 'Gratis',
    basic: 'Básico',
    'additional-branch': 'Sucursal Adicional',
  };
  return names[plan];
};

export const isSubscriptionActive = (user: User | null): boolean => {
  if (!user) return false;
  if (user.subscription_active !== true) return false;
  if (user.subscription_expires_at != null) {
    const expiresAt = new Date(user.subscription_expires_at);
    if (!isNaN(expiresAt.getTime()) && expiresAt <= new Date()) return false;
  }
  return true;
};






































