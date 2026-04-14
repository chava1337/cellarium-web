/**
 * IDs de suscripción en Google Play Console (auto-renewing).
 * Reemplazar con los IDs reales cuando estén creados en Play; deben coincidir con el mapeo del backend.
 *
 * Convención sugerida (alinear con Apple): cellarium_*_monthly
 */
export const GOOGLE_PLAY_PRODUCT_IDS = {
  bistro: 'cellarium_bistro_monthly',
  trattoria: 'cellarium_trattoria_monthly',
  grandMaison: 'cellarium_grand_maison_monthly',
  branch1: 'cellarium_branch_addon_monthly',
  branch3: 'cellarium_branch_3_monthly',
} as const;

export const GOOGLE_PLAY_SUBSCRIPTION_SKUS = [
  GOOGLE_PLAY_PRODUCT_IDS.bistro,
  GOOGLE_PLAY_PRODUCT_IDS.trattoria,
  GOOGLE_PLAY_PRODUCT_IDS.grandMaison,
] as const;

export const GOOGLE_PLAY_ADDON_SKUS = [
  GOOGLE_PLAY_PRODUCT_IDS.branch1,
  GOOGLE_PLAY_PRODUCT_IDS.branch3,
] as const;

export type GooglePlanUiId = 'bistro' | 'trattoria' | 'grand_maison';
