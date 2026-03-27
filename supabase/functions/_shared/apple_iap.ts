/** Product IDs en App Store Connect → plan interno (sin cambiar IDs de BD). */
export const APPLE_IAP_PRODUCT_MAP: Record<
  string,
  { planId: 'basic' | 'additional-branch'; planName: string }
> = {
  cellarium_pro: { planId: 'basic', planName: 'apple_iap_pro' },
  cellarium_business: { planId: 'additional-branch', planName: 'apple_iap_business' },
};

export function mapAppleProductId(productId: string): {
  planId: 'basic' | 'additional-branch';
  planName: string;
} | null {
  return APPLE_IAP_PRODUCT_MAP[productId] ?? null;
}
