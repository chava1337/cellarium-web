/**
 * IDs de producto en App Store Connect (auto-renewable subscriptions).
 * Deben coincidir con supabase/functions/_shared/apple_iap.ts y validate-apple-receipt.
 */
export const APPLE_IAP_PRODUCT_IDS = {
  pro: 'cellarium_pro',
  business: 'cellarium_business',
} as const;

export const APPLE_IAP_SKUS_ALL = [APPLE_IAP_PRODUCT_IDS.pro, APPLE_IAP_PRODUCT_IDS.business] as const;

/** URL de gestión de suscripciones de Apple (cuenta del usuario). */
export const APPLE_SUBSCRIPTIONS_MANAGE_URL = 'https://apps.apple.com/account/subscriptions';
