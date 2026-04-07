/**
 * IDs App Store Connect (auto-renewable). Alineado con supabase/functions/_shared/apple_iap.ts
 *
 * Solo estos IDs deben usarse en el cliente (compra y fetch).
 * Legacy (cellarium_pro, cellarium_pro_monthly, cellarium_business): solo validación de recibos en backend — nunca en el front.
 */
export const APPLE_IAP_PRODUCT_IDS = {
  bistro: 'cellarium_bistro_monthly',
  trattoria: 'cellarium_trattoria_monthly',
  grandMaison: 'cellarium_grand_maison_monthly',
  branch1: 'cellarium_branch_addon_monthly',
  branch3: 'cellarium_branch_3_monthly',
} as const;

export const APPLE_IAP_SKUS_PLANS = [
  APPLE_IAP_PRODUCT_IDS.bistro,
  APPLE_IAP_PRODUCT_IDS.trattoria,
  APPLE_IAP_PRODUCT_IDS.grandMaison,
] as const;

export const APPLE_IAP_SKUS_ADDONS = [
  APPLE_IAP_PRODUCT_IDS.branch1,
  APPLE_IAP_PRODUCT_IDS.branch3,
] as const;

export const APPLE_IAP_SKUS_ALL = [
  ...APPLE_IAP_SKUS_PLANS,
  ...APPLE_IAP_SKUS_ADDONS,
] as const;

export const APPLE_SUBSCRIPTIONS_MANAGE_URL = 'https://apps.apple.com/account/subscriptions';
