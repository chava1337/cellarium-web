/**
 * Mapeo productId Play Console → plan canónico interno (alineado con Apple / Stripe lookup).
 */

import type { AllowedPlanId } from './handle_subscription_update.ts';

export const GOOGLE_PLAY_BASE_PRODUCT_IDS = [
  'cellarium_bistro_monthly',
  'cellarium_trattoria_monthly',
  'cellarium_grand_maison_monthly',
] as const;

export type GooglePlayBaseProductId = (typeof GOOGLE_PLAY_BASE_PRODUCT_IDS)[number];

const PRODUCT_TO_PLAN: Record<GooglePlayBaseProductId, AllowedPlanId> = {
  cellarium_bistro_monthly: 'bistro',
  cellarium_trattoria_monthly: 'trattoria',
  cellarium_grand_maison_monthly: 'grand-maison',
};

const PLAN_DISPLAY: Record<AllowedPlanId, string> = {
  cafe: 'Cafe',
  bistro: 'Bistro',
  trattoria: 'Trattoria',
  'grand-maison': 'Grand Maison',
};

export function isGooglePlayBaseProductId(id: string): id is GooglePlayBaseProductId {
  return (GOOGLE_PLAY_BASE_PRODUCT_IDS as readonly string[]).includes(id);
}

export function mapGoogleProductIdToPlan(productId: string): {
  planId: AllowedPlanId;
  planName: string;
} | null {
  if (!isGooglePlayBaseProductId(productId)) return null;
  const planId = PRODUCT_TO_PLAN[productId];
  return { planId, planName: PLAN_DISPLAY[planId] };
}
