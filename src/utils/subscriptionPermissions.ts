import { User } from '../types';
import { FeatureId } from '../constants/subscriptionFeatures';
import { getEffectivePlan } from './effectivePlan';
import { getBranchLimit } from './branchLimit';

export type SubscriptionPlan = import('../types').CanonicalPlanId;

export interface PlanLimits {
  maxBranches: number;
  maxWines: number;
  maxManagers: number;
  maxCocktails: number;
  blockedFeatureIds: FeatureId[];
}

/**
 * maxBranches: referencia documental; el límite real de sucursales es getBranchLimit (1 + add-ons).
 * Staff total: cafe +1, bistro +2 adicionales => 3 gerentes si el owner cuenta aparte — aquí maxManagers es cupo de managers además del owner (3 en bistro).
 */
export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  cafe: {
    maxBranches: 1,
    maxWines: 10,
    maxManagers: 1,
    maxCocktails: 10,
    blockedFeatureIds: ['inventory', 'tastings'],
  },
  bistro: {
    maxBranches: 1,
    maxWines: 50,
    maxManagers: 3,
    maxCocktails: 50,
    blockedFeatureIds: [],
  },
  trattoria: {
    maxBranches: 1,
    maxWines: 150,
    maxManagers: -1,
    maxCocktails: 75,
    blockedFeatureIds: [],
  },
  'grand-maison': {
    maxBranches: 1,
    maxWines: -1,
    maxManagers: -1,
    maxCocktails: -1,
    blockedFeatureIds: [],
  },
};

export const checkSubscriptionFeature = (user: User | null, featureId: FeatureId | string): boolean => {
  if (!user || user.role !== 'owner') return true;

  const plan = getEffectivePlan(user);
  const limits = PLAN_LIMITS[plan];

  if (limits.blockedFeatureIds.includes(featureId as FeatureId)) {
    return false;
  }

  return true;
};

export function checkSubscriptionFeatureByPlan(
  plan: SubscriptionPlan,
  featureId: FeatureId | string
): boolean {
  const limits = PLAN_LIMITS[plan];
  return !limits.blockedFeatureIds.includes(featureId as FeatureId);
}

export const checkSubscriptionLimit = (
  user: User | null,
  limitType: 'branches' | 'wines' | 'managers' | 'cocktails',
  currentCount: number
): boolean => {
  if (!user || user.role !== 'owner') return true;

  const plan = getEffectivePlan(user);

  if (limitType === 'branches') {
    const maxBranches = getBranchLimit(user).limit;
    return currentCount < maxBranches;
  }

  const limits = PLAN_LIMITS[plan];
  const key =
    limitType === 'wines'
      ? 'maxWines'
      : limitType === 'managers'
        ? 'maxManagers'
        : 'maxCocktails';
  const maxLimit = limits[key] as number;
  if (maxLimit === -1) return true;
  return currentCount < maxLimit;
};

export const getSubscriptionPlanName = (plan: SubscriptionPlan): string => {
  const names: Record<SubscriptionPlan, string> = {
    cafe: 'Cafe',
    bistro: 'Bistro',
    trattoria: 'Trattoria',
    'grand-maison': 'Grand Maison',
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
