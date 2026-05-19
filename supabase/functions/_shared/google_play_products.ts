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

/** Add-ons de sucursales (no acumulativos: solo 0, +1 o +3). Misma convención que Apple (`apple_iap.ts`). */
export const GOOGLE_PLAY_ADDON_PRODUCT_IDS = [
  'cellarium_branch_addon_monthly',
  'cellarium_branch_3_monthly',
] as const;

export type GooglePlayAddonProductId = (typeof GOOGLE_PLAY_ADDON_PRODUCT_IDS)[number];

const ADDON_PRODUCT_TO_SLOTS: Record<GooglePlayAddonProductId, 1 | 3> = {
  cellarium_branch_addon_monthly: 1,
  cellarium_branch_3_monthly: 3,
};

export function isGooglePlayAddonProductId(id: string): id is GooglePlayAddonProductId {
  return (GOOGLE_PLAY_ADDON_PRODUCT_IDS as readonly string[]).includes(id);
}

/** Slots extra (+1 o +3); null si no es un SKU add-on oficial. */
export function mapGoogleAddonProductIdToSlots(productId: string): 1 | 3 | null {
  if (!isGooglePlayAddonProductId(productId)) return null;
  return ADDON_PRODUCT_TO_SLOTS[productId];
}
