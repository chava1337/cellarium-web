/**
 * Stubs Android/Web. iOS: appleIapSubscription.ios.ts
 */
export type ApplePlanUiId = 'bistro' | 'trattoria' | 'grand_maison';

export async function ensureIapConnection(): Promise<void> {
  /* no-op */
}

export async function purchaseAppleSubscription(_plan: ApplePlanUiId): Promise<{ purchase: unknown }> {
  throw new Error('Apple IAP solo está disponible en iOS');
}

export async function purchaseAppleBranchAddon(_slots: 1 | 3): Promise<{ purchase: unknown }> {
  throw new Error('Apple IAP solo está disponible en iOS');
}

export async function getReceiptBase64(_forceRefresh?: boolean): Promise<string | null> {
  return null;
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
