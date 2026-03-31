import {
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  getReceiptIOS,
  initConnection,
  requestPurchase,
  requestReceiptRefreshIOS,
} from 'react-native-iap';
import type { Purchase } from 'react-native-iap';
import { APPLE_IAP_PRODUCT_IDS, APPLE_IAP_SKUS_ALL } from '../constants/appleIap';
import type { ApplePlanUiId } from './appleIapSubscription';

let connected = false;

const CELLARIUM_SKU_SET = new Set<string>([...APPLE_IAP_SKUS_ALL]);

export async function ensureIapConnection(): Promise<void> {
  if (connected) return;
  await initConnection();
  connected = true;
}

function skuForPlan(plan: ApplePlanUiId): string {
  return plan === 'pro' ? APPLE_IAP_PRODUCT_IDS.pro : APPLE_IAP_PRODUCT_IDS.business;
}

/**
 * Compra: requestPurchase (subs) → (caller) validate-apple-receipt → finishTransaction SOLO si el backend confirma.
 * No llamar finishTransaction si el backend falla (timeout/5xx): la transacción queda pendiente y el usuario puede reintentar.
 */
export async function purchaseAppleSubscription(plan: ApplePlanUiId): Promise<{ purchase: Purchase }> {
  const sku = skuForPlan(plan);
  await ensureIapConnection();
  await fetchProducts({ skus: [...APPLE_IAP_SKUS_ALL], type: 'subs' });
  const result = await requestPurchase({
    type: 'subs',
    request: { apple: { sku } },
  });
  const purchase = Array.isArray(result) ? result[0] : result;
  if (!purchase) {
    throw new Error('Compra cancelada o sin resultado');
  }
  return { purchase };
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
  await finishTransaction({ purchase, isConsumable: false });
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
      await finishTransaction({ purchase: p, isConsumable: false });
    } catch (e) {
      if (__DEV__) console.warn('[appleIap] finishTransaction post-sync', p.productId, e);
    }
  }
}
