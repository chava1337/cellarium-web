/**
 * Stubs para Android / Web: la compra Apple solo existe en iOS (ver .ios.ts).
 */
export type ApplePlanUiId = 'pro' | 'business';

export async function ensureIapConnection(): Promise<void> {
  /* no-op */
}

export async function purchaseAppleSubscription(_plan: ApplePlanUiId): Promise<{ purchase: unknown }> {
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

/** Tras validate-apple-receipt OK: finaliza transacciones en cola (restauración). No-op fuera de iOS. */
export async function finishApplePurchasesAfterBackendSync(): Promise<void> {
  /* no-op */
}
