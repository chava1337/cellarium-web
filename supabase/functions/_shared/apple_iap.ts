/**
 * App Store product id → tipo de producto (plan base, add-on sucursales, legacy fuera del flujo nuevo).
 * Legacy: cellarium_pro_monthly, cellarium_business — no se mapean a planes canónicos (respuesta explícita en validate-apple-receipt).
 */

export type AppleCanonicalPlanId = 'bistro' | 'trattoria' | 'grand-maison';

export type AppleMappedProduct =
  | { kind: 'base_plan'; planId: AppleCanonicalPlanId; planName: string }
  | { kind: 'branch_addon'; branchAddonSlots: 1 | 3 }
  | { kind: 'legacy' };

const NEW_BASE: Record<string, { planId: AppleCanonicalPlanId; planName: string }> = {
  cellarium_bistro_monthly: { planId: 'bistro', planName: 'Bistro' },
  cellarium_trattoria_monthly: { planId: 'trattoria', planName: 'Trattoria' },
  cellarium_grand_maison_monthly: { planId: 'grand-maison', planName: 'Grand Maison' },
};

const NEW_ADDON: Record<string, 1 | 3> = {
  cellarium_branch_addon_monthly: 1,
  cellarium_branch_3_monthly: 3,
};

/** IDs legacy conocidos (no entran al modelo canónico nuevo). */
const LEGACY_PRODUCT_IDS = new Set([
  'cellarium_pro',
  'cellarium_pro_monthly',
  'cellarium_business',
]);

export function mapAppleProductId(productId: string): AppleMappedProduct | null {
  const base = NEW_BASE[productId];
  if (base) return { kind: 'base_plan', planId: base.planId, planName: base.planName };
  const slots = NEW_ADDON[productId];
  if (slots != null) return { kind: 'branch_addon', branchAddonSlots: slots };
  if (LEGACY_PRODUCT_IDS.has(productId)) return { kind: 'legacy' };
  return null;
}
