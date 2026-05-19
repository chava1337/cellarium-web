/**
 * Stubs Android/Web. iOS: appleIapSubscription.ios.ts
 */
import type { Purchase } from 'react-native-iap';

export type ApplePlanUiId = 'bistro' | 'trattoria' | 'grand_maison';

/** Resultado de recoverAppleIapViaReceipt (solo iOS implementado). */
export type AppleIapReceiptRecoveryResult = {
  syncedActive: boolean;
  syncedLapsed: boolean;
};

/** Tras hoja de Apple / timeout sin evento de compra; recibo no confirmó sync en backend. */
export class AppleIapPurchaseUnconfirmedError extends Error {
  readonly name = 'AppleIapPurchaseUnconfirmedError';

  constructor() {
    super('AppleIapPurchaseUnconfirmedError');
  }
}

/** StoreKit/Nitro falló de forma genérica tras intentar recuperación por recibo. */
export class AppleIapStorePendingError extends Error {
  readonly name = 'AppleIapStorePendingError';

  constructor() {
    super('AppleIapStorePendingError');
  }
}

/** Resultado de compra Apple; `duplicateRecoverySyncDone` indica que ya se validó recibo y se finalizaron transacciones locales. */
export type AppleIapPurchaseResult = {
  purchase: Purchase | null;
  duplicateRecoverySyncDone?: boolean;
  duplicateRecoveryLapsed?: boolean;
};

export async function ensureIapConnection(): Promise<void> {
  /* no-op */
}

/** iOS: appleIapSubscription.ios.ts */
export async function loadAppleSubscriptionCatalog(): Promise<unknown[]> {
  return [];
}

/** iOS: appleIapSubscription.ios.ts — precios StoreKit de add-ons de sucursales */
export async function loadAppleBranchAddonCatalog(): Promise<unknown[]> {
  return [];
}

export async function purchaseAppleSubscription(_plan: ApplePlanUiId): Promise<AppleIapPurchaseResult> {
  throw new Error('Apple IAP solo está disponible en iOS');
}

export async function purchaseAppleBranchAddon(_slots: 1 | 3): Promise<AppleIapPurchaseResult> {
  throw new Error('Apple IAP solo está disponible en iOS');
}

export async function getReceiptBase64(_forceRefresh?: boolean): Promise<string | null> {
  return null;
}

export async function recoverAppleIapViaReceipt(
  _intent: 'restore' | 'purchase_recovery'
): Promise<AppleIapReceiptRecoveryResult> {
  throw new Error('Apple IAP solo está disponible en iOS');
}

export async function restoreApplePurchasesForReceipt(): Promise<void> {
  /* no-op */
}

export async function finishAppleTransactionIfNeeded(_purchase: unknown): Promise<void> {
  /* no-op */
}

export async function finishApplePurchasesAfterBackendSync(): Promise<void> {
  /* no-op */
}
