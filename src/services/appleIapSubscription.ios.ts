import {
  ErrorCode,
  fetchProducts,
  finishTransaction as iapFinishTransaction,
  getAvailablePurchases,
  getReceiptIOS,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  requestReceiptRefreshIOS,
} from 'react-native-iap';
import type { Product, Purchase, PurchaseError } from 'react-native-iap';
import { APPLE_IAP_PRODUCT_IDS, APPLE_IAP_SKUS_ALL } from '../constants/appleIap';
import type { ApplePlanUiId } from './appleIapSubscription';

let connected = false;

const CELLARIUM_SKU_SET = new Set<string>([...APPLE_IAP_SKUS_ALL]);

const LISTENER_TIMEOUT_MS = 60_000;

export async function ensureIapConnection(): Promise<void> {
  if (connected) return;
  await initConnection();
  connected = true;
}

function productIdFromStoreProduct(p: Product): string {
  const o = p as { id?: string; productId?: string };
  return o.id ?? o.productId ?? '';
}

function skuForPlan(plan: ApplePlanUiId): string {
  switch (plan) {
    case 'bistro':
      return APPLE_IAP_PRODUCT_IDS.bistro;
    case 'trattoria':
      return APPLE_IAP_PRODUCT_IDS.trattoria;
    case 'grand_maison':
      return APPLE_IAP_PRODUCT_IDS.grandMaison;
  }
}

function skuForBranchAddon(slots: 1 | 3): string {
  return slots === 1 ? APPLE_IAP_PRODUCT_IDS.branch1 : APPLE_IAP_PRODUCT_IDS.branch3;
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
          'Tiempo de espera agotado. Si completaste la compra en Apple, usa Restaurar compras o inténtalo de nuevo.'
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

async function purchaseWithSku(sku: string): Promise<{ purchase: Purchase }> {
  await ensureIapConnection();
  const skuList = [...APPLE_IAP_SKUS_ALL];
  if (__DEV__) {
    console.log('[IAP] Requested SKUs:', skuList);
    console.log('[IAP] Purchasing SKU:', sku);
  }
  const fetched = await fetchProducts({ skus: skuList, type: 'subs' });
  const fetchedIds = new Set(
    (fetched as Product[]).map((p) => productIdFromStoreProduct(p)).filter(Boolean)
  );
  if (__DEV__) {
    console.log('[IAP] Fetched product IDs from store:', [...fetchedIds]);
    const missing = skuList.filter((s) => !fetchedIds.has(s));
    if (missing.length) {
      console.warn('[IAP] Requested but not returned by StoreKit (check App Store Connect):', missing);
    }
  }

  if (!fetchedIds.has(sku)) {
    throw new Error(
      `[IAP] El producto "${sku}" no está disponible en App Store (no devuelto por StoreKit). ` +
        'Revisa que el ID exista y esté en “Ready to Submit” / aprobado para esta app.'
    );
  }

  const ac = new AbortController();
  const listenerPromise = waitForPurchaseFromListener(sku, ac.signal);

  try {
    const result = await requestPurchase({
      type: 'subs',
      request: { apple: { sku } },
    });
    const immediate = normalizePurchaseResult(result);
    if (immediate) {
      ac.abort();
      void listenerPromise.catch(() => {});
      if (__DEV__) {
        console.log('[appleIap] purchase from requestPurchase', immediate.productId);
      }
      return { purchase: immediate };
    }

    if (__DEV__) {
      console.log('[appleIap] requestPurchase returned null; waiting for purchaseUpdatedListener', sku);
    }
    const purchase = await listenerPromise;
    return { purchase };
  } catch (e) {
    ac.abort();
    void listenerPromise.catch(() => {});
    throw e;
  }
}

export async function purchaseAppleSubscription(plan: ApplePlanUiId): Promise<{ purchase: Purchase }> {
  const sku = skuForPlan(plan);
  console.log('[IAP] Plan selected:', plan);
  console.log('[IAP] SKU mapped:', sku);
  return purchaseWithSku(sku);
}

export async function purchaseAppleBranchAddon(slots: 1 | 3): Promise<{ purchase: Purchase }> {
  const sku = skuForBranchAddon(slots);
  console.log('[IAP] Branch add-on slots:', slots);
  console.log('[IAP] SKU mapped:', sku);
  return purchaseWithSku(sku);
}

export async function getReceiptBase64(forceRefresh = false): Promise<string | null> {
  await ensureIapConnection();
  const receipt = forceRefresh ? await requestReceiptRefreshIOS() : await getReceiptIOS();
  return receipt?.length ? receipt : null;
}

export async function restoreApplePurchasesForReceipt(): Promise<void> {
  await ensureIapConnection();
  await getAvailablePurchases({ onlyIncludeActiveItemsIOS: false });
}

export async function finishAppleTransactionIfNeeded(purchase: Purchase): Promise<void> {
  await iapFinishTransaction({ purchase, isConsumable: false });
}

export async function finishApplePurchasesAfterBackendSync(): Promise<void> {
  await ensureIapConnection();
  const purchases = await getAvailablePurchases({ onlyIncludeActiveItemsIOS: false });
  for (const p of purchases) {
    if (!CELLARIUM_SKU_SET.has(p.productId)) continue;
    try {
      await iapFinishTransaction({ purchase: p, isConsumable: false });
    } catch (e) {
      if (__DEV__) console.warn('[appleIap] finishTransaction post-sync', p.productId, e);
    }
  }
}
