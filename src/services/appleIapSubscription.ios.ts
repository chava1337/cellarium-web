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
import type { Purchase, PurchaseError } from 'react-native-iap';
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

function skuForPlan(plan: ApplePlanUiId): string {
  return plan === 'pro' ? APPLE_IAP_PRODUCT_IDS.pro : APPLE_IAP_PRODUCT_IDS.business;
}

function normalizePurchaseResult(
  result: Purchase | Purchase[] | null | undefined
): Purchase | null {
  if (result == null) return null;
  return Array.isArray(result) ? result[0] ?? null : result;
}

/**
 * Espera una compra que coincida con el SKU (StoreKit puede entregar la transacción por listener
 * cuando requestPurchase devuelve null). Registrar listeners ANTES de requestPurchase.
 */
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

/**
 * Compra: requestPurchase (subs) → (caller) validate-apple-receipt → finishTransaction SOLO si el backend confirma.
 * No llamar finishTransaction si el backend falla (timeout/5xx): la transacción queda pendiente y el usuario puede reintentar.
 */
export async function purchaseAppleSubscription(plan: ApplePlanUiId): Promise<{ purchase: Purchase }> {
  const sku = skuForPlan(plan);
  await ensureIapConnection();
  await fetchProducts({ skus: [...APPLE_IAP_SKUS_ALL], type: 'subs' });

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

export async function getReceiptBase64(forceRefresh = false): Promise<string | null> {
  await ensureIapConnection();
  const receipt = forceRefresh ? await requestReceiptRefreshIOS() : await getReceiptIOS();
  return receipt?.length ? receipt : null;
}

/** Restaura transacciones en StoreKit para que el recibo refleje compras previas (idempotente en repetición). */
export async function restoreApplePurchasesForReceipt(): Promise<void> {
  await ensureIapConnection();
  await getAvailablePurchases({ onlyIncludeActiveItemsIOS: false });
}

export async function finishAppleTransactionIfNeeded(purchase: Purchase): Promise<void> {
  await iapFinishTransaction({ purchase, isConsumable: false });
}

/**
 * Tras validate-apple-receipt exitoso (compra o restauración): finaliza transacciones Cellarium en cola.
 * Evita dejar transacciones pendientes en StoreKit tras sincronizar con el servidor.
 */
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
