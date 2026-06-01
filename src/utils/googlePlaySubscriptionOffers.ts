import type {
  ProductSubscription,
  ProductSubscriptionAndroidOfferDetails,
} from 'react-native-iap';
import { GOOGLE_PLAY_SUBSCRIPTION_SKUS } from '../constants/googlePlayProducts';

type GoogleBasePlanSku = (typeof GOOGLE_PLAY_SUBSCRIPTION_SKUS)[number];

export const FREE_MONTH_OFFER_TAG = 'free-month';

const BASE_PLAN_SKU_SET = new Set<string>(GOOGLE_PLAY_SUBSCRIPTION_SKUS);

export type FreeMonthOfferResolution = {
  offer: ProductSubscriptionAndroidOfferDetails;
  offerToken: string;
  recurringPriceFormatted: string | null;
  offerTags: string[];
};

export type BasePlanPurchaseOfferType = 'free-month' | 'base-plan';

export type BasePlanPurchaseOfferResolution = {
  offer: ProductSubscriptionAndroidOfferDetails;
  offerToken: string;
  selectedOfferType: BasePlanPurchaseOfferType;
  recurringPriceFormatted: string | null;
  offerTags: string[];
};

function getProductSku(product: ProductSubscription): string {
  const row = product as { id?: string; productId?: string };
  return (row.productId ?? row.id ?? '').trim();
}

function offerHasFreeMonthTag(tags: string[] | null | undefined): boolean {
  return (tags ?? []).some((tag) => tag.trim().toLowerCase() === FREE_MONTH_OFFER_TAG);
}

function getSubscriptionOfferDetailsAndroid(
  product: ProductSubscription
): ProductSubscriptionAndroidOfferDetails[] {
  if (product.platform !== 'android') return [];

  const android = product as ProductSubscription & {
    subscriptionOfferDetailsAndroid?: ProductSubscriptionAndroidOfferDetails[];
    subscriptionOffers?: Array<{
      offerTagsAndroid?: string[] | null;
      offerTokenAndroid?: string | null;
      pricingPhasesAndroid?: ProductSubscriptionAndroidOfferDetails['pricingPhases'];
      basePlanIdAndroid?: string | null;
      id?: string;
      offerId?: string | null;
    }>;
  };

  const legacy = android.subscriptionOfferDetailsAndroid;
  if (Array.isArray(legacy) && legacy.length > 0) {
    return legacy.filter((o) => Boolean(o.offerToken?.trim()));
  }

  const normalized = android.subscriptionOffers;
  if (!Array.isArray(normalized)) return [];

  return normalized
    .map((o) => {
      const token = o.offerTokenAndroid?.trim();
      if (!token) return null;
      return {
        basePlanId: o.basePlanIdAndroid ?? '',
        offerTags: o.offerTagsAndroid ?? [],
        offerToken: token,
        offerId: o.id ?? null,
        pricingPhases: o.pricingPhasesAndroid ?? { pricingPhaseList: [] },
      } satisfies ProductSubscriptionAndroidOfferDetails;
    })
    .filter((o): o is ProductSubscriptionAndroidOfferDetails => o != null);
}

/** Oferta Play con tag `free-month` en catálogo Android. */
export function findFreeMonthOffer(
  product: ProductSubscription
): ProductSubscriptionAndroidOfferDetails | null {
  const match = getSubscriptionOfferDetailsAndroid(product).find((o) =>
    offerHasFreeMonthTag(o.offerTags)
  );
  return match ?? null;
}

/** Offer base por defecto (sin promo free-month; preferir offerId nulo = plan base estándar). */
export function findDefaultBasePlanOffer(
  product: ProductSubscription
): ProductSubscriptionAndroidOfferDetails | null {
  const offers = getSubscriptionOfferDetailsAndroid(product);
  if (!offers.length) return null;

  const standardBase = offers.find(
    (o) =>
      !offerHasFreeMonthTag(o.offerTags) &&
      (o.offerId == null || String(o.offerId).trim() === '')
  );
  if (standardBase) return standardBase;

  const nonFreeMonth = offers.find((o) => !offerHasFreeMonthTag(o.offerTags));
  if (nonFreeMonth) return nonFreeMonth;

  return offers[0] ?? null;
}

/** Precio recurrente tras el trial (fase con importe > 0; preferir P1M). */
export function getRecurringPriceAfterTrial(
  offer: ProductSubscriptionAndroidOfferDetails
): string | null {
  const phases = offer.pricingPhases?.pricingPhaseList ?? [];
  if (!phases.length) return null;

  const paidPhases = phases.filter((phase) => {
    const micros = Number.parseInt(phase.priceAmountMicros, 10);
    return Number.isFinite(micros) && micros > 0;
  });

  const monthly =
    paidPhases.find((phase) => phase.billingPeriod === 'P1M') ??
    paidPhases[paidPhases.length - 1];

  const formatted = monthly?.formattedPrice?.trim();
  return formatted || null;
}

export function toSubscriptionOfferInput(
  sku: string,
  offer: Pick<ProductSubscriptionAndroidOfferDetails, 'offerToken'>
): { sku: string; offerToken: string } {
  return { sku, offerToken: offer.offerToken };
}

export function isGooglePlayBasePlanSku(sku: string): sku is GoogleBasePlanSku {
  return BASE_PLAN_SKU_SET.has(sku);
}

/** Resuelve oferta free-month solo para SKUs de planes base. */
export function resolveFreeMonthOfferForSku(
  sku: string,
  playSubscriptions: ProductSubscription[]
): FreeMonthOfferResolution | null {
  if (!isGooglePlayBasePlanSku(sku)) return null;

  const product = playSubscriptions.find((p) => getProductSku(p) === sku);
  if (!product) return null;

  const offer = findFreeMonthOffer(product);
  const offerToken = offer?.offerToken?.trim();
  if (!offer || !offerToken) return null;

  return {
    offer,
    offerToken,
    recurringPriceFormatted: getRecurringPriceAfterTrial(offer),
    offerTags: offer.offerTags ?? [],
  };
}

/** Offer para compra de plan base: free-month si existe; si no, base plan por defecto. */
export function resolveBasePlanPurchaseOfferForSku(
  sku: string,
  playSubscriptions: ProductSubscription[]
): BasePlanPurchaseOfferResolution | null {
  if (!isGooglePlayBasePlanSku(sku)) return null;

  const product = playSubscriptions.find((p) => getProductSku(p) === sku);
  if (!product) return null;

  const freeMonth = findFreeMonthOffer(product);
  const freeMonthToken = freeMonth?.offerToken?.trim();
  if (freeMonth && freeMonthToken) {
    return {
      offer: freeMonth,
      offerToken: freeMonthToken,
      selectedOfferType: 'free-month',
      recurringPriceFormatted: getRecurringPriceAfterTrial(freeMonth),
      offerTags: freeMonth.offerTags ?? [],
    };
  }

  const basePlan = findDefaultBasePlanOffer(product);
  const basePlanToken = basePlan?.offerToken?.trim();
  if (!basePlan || !basePlanToken) return null;

  return {
    offer: basePlan,
    offerToken: basePlanToken,
    selectedOfferType: 'base-plan',
    recurringPriceFormatted: getRecurringPriceAfterTrial(basePlan),
    offerTags: basePlan.offerTags ?? [],
  };
}
