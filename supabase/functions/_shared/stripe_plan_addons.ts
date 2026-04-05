/**
 * Parsea items de una Stripe Subscription (expand items.data.price) para el modelo canónico Cellarium.
 * Legacy (pro_*, business_*): no mapear a planes nuevos; se señala con legacyStripeOnly.
 */

export type StripeCanonicalPlanId = 'cafe' | 'bistro' | 'trattoria' | 'grand-maison';

export interface ParsedStripeCellariumSubscription {
  planId: StripeCanonicalPlanId;
  planName: string;
  addonBranchesQty: number;
  /** true si hay líneas reconocibles como Stripe legacy y ningún price nuevo de plan. */
  legacyStripeOnly: boolean;
  hasNewPlanPrice: boolean;
}

function isLegacyPlanLookupKey(key: string): boolean {
  return (
    key.startsWith('pro_') ||
    key.startsWith('business_') ||
    key.startsWith('basic_') ||
    key.startsWith('free_')
  );
}

/**
 * @param subscription — objeto Stripe subscription con items.data[].price.lookup_key
 */
export function parseStripeSubscriptionForCellarium(subscription: unknown): ParsedStripeCellariumSubscription {
  const sub = subscription as {
    items?: { data?: Array<{ quantity?: number; price?: { lookup_key?: string | null } }> };
  };
  const items = sub?.items?.data ?? [];

  let planId: StripeCanonicalPlanId = 'cafe';
  let planName = 'Cafe';
  let addonBranchesQty = 0;
  let hasNewPlanPrice = false;
  let legacyLineSeen = false;

  for (const it of items) {
    const key = String(it?.price?.lookup_key ?? '').toLowerCase().trim();
    const qtyRaw = it?.quantity;
    const qty = typeof qtyRaw === 'number' && Number.isFinite(qtyRaw)
      ? Math.max(0, Math.floor(qtyRaw))
      : 1;

    if (!key) continue;

    if (key === 'branch_addon_monthly' || key.startsWith('branch_addon_monthly')) {
      addonBranchesQty += qty;
      continue;
    }

    if (key.startsWith('bistro_monthly')) {
      planId = 'bistro';
      planName = 'Bistro';
      hasNewPlanPrice = true;
      continue;
    }
    if (key.startsWith('trattoria_monthly')) {
      planId = 'trattoria';
      planName = 'Trattoria';
      hasNewPlanPrice = true;
      continue;
    }
    if (key.startsWith('grand_maison_monthly')) {
      planId = 'grand-maison';
      planName = 'Grand Maison';
      hasNewPlanPrice = true;
      continue;
    }

    if (isLegacyPlanLookupKey(key)) {
      legacyLineSeen = true;
    }
  }

  const legacyStripeOnly = !hasNewPlanPrice && legacyLineSeen;

  return {
    planId,
    planName,
    addonBranchesQty,
    legacyStripeOnly,
    hasNewPlanPrice,
  };
}
