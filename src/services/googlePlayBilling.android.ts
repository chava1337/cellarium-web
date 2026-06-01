/**
 * Android — Google Play Billing (react-native-iap), alineado con el patrón imperativo de appleIapSubscription.ios.ts.
 */

import {
  ErrorCode,
  fetchProducts,
  finishTransaction as iapFinishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
} from 'react-native-iap';
import type { ProductSubscription, Purchase, PurchaseError } from 'react-native-iap';
import {
  GOOGLE_PLAY_PRODUCT_IDS,
  GOOGLE_PLAY_ALL_SUBSCRIPTION_SKUS,
  GOOGLE_PLAY_SUBSCRIPTION_SKUS,
  type GooglePlanUiId,
} from '../constants/googlePlayProducts';
import { getCellariumAndroidPackageName, validateGooglePurchaseBackend } from './validateGooglePurchase';
import {
  resolveBasePlanPurchaseOfferForSku,
  toSubscriptionOfferInput,
  type BasePlanPurchaseOfferResolution,
} from '../utils/googlePlaySubscriptionOffers';

let connected = false;

const GOOGLE_SKU_SET = new Set<string>([...GOOGLE_PLAY_ALL_SUBSCRIPTION_SKUS]);

const LISTENER_TIMEOUT_MS = 120_000;

/** Tokens cuya validación con backend está en curso (evita doble envío). */
const validatingTokens = new Set<string>();

export async function ensurePlayBillingConnection(): Promise<void> {
  if (connected) return;
  await initConnection();
  connected = true;
}

function skuForPlan(plan: GooglePlanUiId): string {
  switch (plan) {
    case 'bistro':
      return GOOGLE_PLAY_PRODUCT_IDS.bistro;
    case 'trattoria':
      return GOOGLE_PLAY_PRODUCT_IDS.trattoria;
    case 'grand_maison':
      return GOOGLE_PLAY_PRODUCT_IDS.grandMaison;
  }
}

/** Mapea id de plan de UI (SubscriptionsScreen) → GooglePlanUiId */
export function mainPlanSelectionIdToGooglePlan(
  planId: string
): GooglePlanUiId | null {
  if (planId === 'bistro' || planId === 'trattoria' || planId === 'grand_maison') {
    return planId;
  }
  if (planId === 'grand-maison') {
    return 'grand_maison';
  }
  return null;
}

function normalizePurchaseResult(
  result: Purchase | Purchase[] | null | undefined
): Purchase | null {
  if (result == null) return null;
  return Array.isArray(result) ? result[0] ?? null : result;
}

function waitForPurchaseFromListener(expectedSku: string, signal: AbortSignal): Promise<Purchase> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'));
      return;
    }

    let purchaseSub: ReturnType<typeof purchaseUpdatedListener>;
    let errorSub: ReturnType<typeof purchaseErrorListener>;
    let tid: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      clearTimeout(tid);
      purchaseSub?.remove();
      errorSub?.remove();
      signal.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(new Error('aborted'));
    };
    signal.addEventListener('abort', onAbort);

    tid = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          'Tiempo de espera agotado. Si completaste la compra en Google Play, usa Restaurar o inténtalo de nuevo.'
        )
      );
    }, LISTENER_TIMEOUT_MS);

    purchaseSub = purchaseUpdatedListener((p: Purchase) => {
      if (p.productId !== expectedSku) return;
      cleanup();
      resolve(p);
    });

    errorSub = purchaseErrorListener((e: PurchaseError) => {
      if (e.productId && e.productId !== expectedSku) return;
      cleanup();
      if (e.code === ErrorCode.UserCancelled) {
        reject(new Error('Compra cancelada'));
        return;
      }
      reject(new Error(e.message || 'Error en la compra'));
    });
  });
}

function logGooglePlayOffers(
  sku: string,
  resolved: BasePlanPurchaseOfferResolution | null
): void {
  console.log('[GooglePlay][Offers]', {
    sku,
    selectedOfferType: resolved?.selectedOfferType ?? null,
    selectedOfferTokenPresent: Boolean(resolved?.offerToken),
    purchaseUsesOffer: resolved != null,
    offerTags: resolved?.offerTags ?? [],
    recurringPrice: resolved?.recurringPriceFormatted ?? null,
  });
}

async function purchaseWithSku(
  sku: string,
  options?: { attachBasePlanSubscriptionOffer?: boolean }
): Promise<{ purchase: Purchase }> {
  await ensurePlayBillingConnection();
  const skuList = [...GOOGLE_PLAY_ALL_SUBSCRIPTION_SKUS];
  if (__DEV__) {
    console.log('[GooglePlay] Requested SKUs:', skuList);
    console.log('[GooglePlay] Purchasing SKU:', sku);
  }
  const fetched = await fetchProducts({ skus: skuList, type: 'subs' });
  const fetchedList = (fetched ?? []) as ProductSubscription[];
  const fetchedIds = new Set(
    fetchedList.map((p) => {
      const r = p as { id?: string; productId?: string };
      return (r.productId ?? r.id ?? '').trim();
    }).filter(Boolean)
  );
  if (__DEV__) {
    console.log('[GooglePlay] Fetched product IDs from Play:', [...fetchedIds]);
    const missing = skuList.filter((s) => !fetchedIds.has(s));
    if (missing.length) {
      console.warn('[GooglePlay] SKUs no devueltos por Play (revisa Play Console):', missing);
    }
  }

  if (!fetchedIds.has(sku)) {
    throw new Error(
      `[GooglePlay] El producto "${sku}" no está disponible en Google Play (no devuelto por la tienda). ` +
        'Revisa el ID en Play Console y que el APK use el mismo applicationId.'
    );
  }

  const isBasePlanSku = (GOOGLE_PLAY_SUBSCRIPTION_SKUS as readonly string[]).includes(sku);
  const attachBasePlanOffer =
    options?.attachBasePlanSubscriptionOffer !== false && isBasePlanSku;
  const purchaseOffer = attachBasePlanOffer
    ? resolveBasePlanPurchaseOfferForSku(sku, fetchedList)
    : null;
  logGooglePlayOffers(sku, purchaseOffer);

  const googleRequest: {
    skus: string[];
    subscriptionOffers?: ReturnType<typeof toSubscriptionOfferInput>[];
  } = { skus: [sku] };
  if (purchaseOffer) {
    googleRequest.subscriptionOffers = [toSubscriptionOfferInput(sku, purchaseOffer.offer)];
  }

  if (__DEV__) {
    console.log('[GooglePlay] requestPurchase payload', {
      type: 'subs',
      request: { google: googleRequest },
    });
  }

  const ac = new AbortController();
  const listenerPromise = waitForPurchaseFromListener(sku, ac.signal);

  try {
    const result = await requestPurchase({
      type: 'subs',
      request: {
        google: googleRequest,
      },
    });
    const immediate = normalizePurchaseResult(result);
    if (immediate) {
      ac.abort();
      void listenerPromise.catch(() => {});
      if (__DEV__) {
        console.log('[GooglePlay] purchase from requestPurchase', immediate.productId);
      }
      return { purchase: immediate };
    }

    if (__DEV__) {
      console.log('[GooglePlay] requestPurchase returned null; waiting for purchaseUpdatedListener', sku);
    }
    const purchase = await listenerPromise;
    return { purchase };
  } catch (e) {
    ac.abort();
    void listenerPromise.catch(() => {});
    throw e;
  }
}

/** Catálogo de suscripciones (precios desde Play). */
export async function loadSubscriptions(): Promise<ProductSubscription[]> {
  await ensurePlayBillingConnection();
  const result = await fetchProducts({
    skus: [...GOOGLE_PLAY_ALL_SUBSCRIPTION_SKUS],
    type: 'subs',
  });
  return (result ?? []) as ProductSubscription[];
}

export async function purchaseGoogleSubscription(plan: GooglePlanUiId): Promise<{ purchase: Purchase }> {
  const sku = skuForPlan(plan);
  return purchaseWithSku(sku);
}

export async function purchaseGoogleBranchAddon(slots: 1 | 3): Promise<{ purchase: Purchase }> {
  const sku = slots === 1 ? GOOGLE_PLAY_PRODUCT_IDS.branch1 : GOOGLE_PLAY_PRODUCT_IDS.branch3;
  return purchaseWithSku(sku, { attachBasePlanSubscriptionOffer: false });
}

export async function finishGoogleTransactionIfNeeded(purchase: Purchase): Promise<void> {
  await iapFinishTransaction({ purchase, isConsumable: false });
}

export async function restoreGooglePurchases(): Promise<{
  synced: boolean;
  message?: string;
}> {
  await ensurePlayBillingConnection();
  const purchases = await getAvailablePurchases({
    onlyIncludeActiveItemsIOS: false,
    includeSuspendedAndroid: false,
  });

  const packageName = getCellariumAndroidPackageName();
  let synced = false;
  let lastMessage: string | undefined;

  for (const p of purchases) {
    if (!GOOGLE_SKU_SET.has(p.productId)) continue;
    const token = p.purchaseToken?.trim();
    if (!token) continue;
    if (validatingTokens.has(token)) continue;

    validatingTokens.add(token);
    try {
      const { data, error } = await validateGooglePurchaseBackend({
        purchaseToken: token,
        productId: p.productId,
        packageName,
      });
      if (error) {
        lastMessage = error.message;
        continue;
      }
      const code = data?.code as string | undefined;
      if (code === 'PLAY_PURCHASE_PENDING') {
        lastMessage = data?.error as string | undefined;
        continue;
      }
      if (data?.synced === 'active' || data?.ok === true) {
        try {
          await iapFinishTransaction({ purchase: p, isConsumable: false });
        } catch (fe) {
          if (__DEV__) console.warn('[GooglePlay] finishTransaction restore', p.productId, fe);
        }
        synced = true;
      }
    } finally {
      validatingTokens.delete(token);
    }
  }

  return { synced, message: lastMessage };
}
