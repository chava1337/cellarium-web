import { AppState, type AppStateStatus } from 'react-native';
import {
  ErrorCode,
  fetchProducts,
  finishTransaction as iapFinishTransaction,
  getAvailablePurchases,
  getReceiptIOS,
  initConnection,
  isDuplicatePurchaseError,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  requestReceiptRefreshIOS,
} from 'react-native-iap';
import type { Product, Purchase, PurchaseError } from 'react-native-iap';
import {
  APPLE_IAP_PRODUCT_IDS,
  APPLE_IAP_SKUS_ADDONS,
  APPLE_IAP_SKUS_ALL,
  APPLE_IAP_SKUS_PLANS,
} from '../constants/appleIap';
import type { AppleIapPurchaseResult, ApplePlanUiId } from './appleIapSubscription';
import { AppleIapPurchaseUnconfirmedError, AppleIapStorePendingError } from './appleIapSubscription';
import {
  patchAppleIapDebugOverlay,
  resetAppleIapDebugOverlay,
  isIapDebugOverlayEnabled,
  type AppleIapDebugOverlaySnapshot,
} from '../debug/appleIapDebugOverlayStore';
import { AppleReceiptRecoveryError, validateAppleReceiptBackend } from './validateAppleReceipt';

let connected = false;

const CELLARIUM_SKU_SET = new Set<string>([...APPLE_IAP_SKUS_ALL]);

const LISTENER_TIMEOUT_MS = 90_000;

/** Logs seguros TestFlight: nunca incluir el recibo completo ni PII. */
function iapLog(payload: Record<string, unknown>): void {
  console.log('[Cellarium][IAP]', JSON.stringify(payload));
}

function iapOverlay(p: Partial<AppleIapDebugOverlaySnapshot>): void {
  if (!isIapDebugOverlayEnabled()) return;
  patchAppleIapDebugOverlay(p);
}

function transactionIdFromPurchase(p: Purchase): string | null {
  const anyP = p as Purchase & { transactionId?: string; transactionIdentifier?: string; id?: string };
  const tid = anyP.transactionId ?? anyP.transactionIdentifier ?? anyP.id;
  return typeof tid === 'string' && tid.length > 0 ? tid : null;
}

/** Mensaje nativo tipo "Duplicate purchase update skipped…" sin code duplicate-purchase. */
function looksLikeDuplicatePurchaseSkippedMessage(e: unknown): boolean {
  const msg =
    e && typeof e === 'object' && 'message' in e
      ? String((e as { message?: string }).message ?? '')
      : typeof e === 'string'
        ? e
        : '';
  const lower = msg.toLowerCase();
  return (
    lower.includes('duplicate purchase') ||
    (lower.includes('skipped') && lower.includes('restore') && lower.includes('purchase'))
  );
}

function isDuplicatePurchaseSituation(e: unknown): boolean {
  return isDuplicatePurchaseError(e) || looksLikeDuplicatePurchaseSkippedMessage(e);
}

function pickPurchaseForSkus(purchases: Purchase[], preferredSkus: string[]): Purchase | null {
  for (const sku of preferredSkus) {
    const p = purchases.find((x) => x.productId === sku);
    if (p) return p;
  }
  const any = purchases.find((p) => CELLARIUM_SKU_SET.has(p.productId));
  return any ?? null;
}

/** getAvailablePurchases: solo auditoría; nunca bloquea recuperación por recibo. */
async function tryGetAvailablePurchasesOptional(): Promise<Purchase[] | null> {
  try {
    const list = await getAvailablePurchases({ onlyIncludeActiveItemsIOS: false });
    iapLog({ stage: 'getAvailablePurchases', outcome: 'ok', count: list.length });
    return list;
  } catch (e) {
    iapLog({
      stage: 'getAvailablePurchases',
      outcome: 'error',
      preview: extractIapErrorMessage(e).slice(0, 200),
    });
    return null;
  }
}

function extractIapErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message?: unknown }).message ?? '');
  return String(e ?? '');
}

function extractIapErrorCode(e: unknown): string | undefined {
  if (e && typeof e === 'object' && 'code' in e) {
    const c = (e as { code?: unknown }).code;
    if (typeof c === 'string') return c;
    if (c != null) return String(c);
  }
  return undefined;
}

function looksLikeIapServiceError(e: unknown): boolean {
  const code = extractIapErrorCode(e)?.toLowerCase() ?? '';
  const m = extractIapErrorMessage(e).toLowerCase();
  return (
    code === ErrorCode.ServiceError ||
    code === 'service-error' ||
    m.includes('service-error') ||
    m.includes('service error') ||
    m.includes('no se pudo completar') ||
    m.includes('com.margelo.nitro') ||
    m.includes('r-niap')
  );
}

function isBranchAddonSku(sku: string): boolean {
  return sku === APPLE_IAP_PRODUCT_IDS.branch1 || sku === APPLE_IAP_PRODUCT_IDS.branch3;
}

/** Plan base: solo SKUs de planes. Add-on: planes + ese add-on (evita fetch global con add-ons no listos en ASC). */
function catalogSkusForPurchaseRequest(requestedSku: string): string[] {
  if (isBranchAddonSku(requestedSku)) {
    return [...APPLE_IAP_SKUS_PLANS, requestedSku];
  }
  return [...APPLE_IAP_SKUS_PLANS];
}

/**
 * Recuperación por recibo → validate-apple-receipt.
 * Solo entonces (synced active|lapsed) llama a finishApplePurchasesAfterBackendSync.
 * getAvailablePurchases al final es solo log; no bloquea ni autoriza finish.
 */
export async function recoverAppleIapViaReceipt(
  intent: 'restore' | 'purchase_recovery'
): Promise<{ syncedActive: boolean; syncedLapsed: boolean }> {
  iapLog({ stage: 'recover_via_receipt_start', intent });
  iapOverlay({
    lastIapEvent: `recover_via_receipt:${intent}`,
    validate_start: intent,
    validate_error_code: null,
    synced: null,
  });
  await ensureIapConnection();

  let receipt = await getReceiptBase64(false);
  if (!receipt) receipt = await getReceiptBase64(true);
  const receiptLen = receipt?.length ?? 0;
  iapLog({ recovery_receipt_len: receiptLen, intent });
  iapOverlay({
    receipt_hasReceipt: receiptLen > 0 ? 'yes' : 'no',
    receipt_length: receiptLen,
    lastIapEvent: 'recovery_receipt_ready',
  });

  if (!receipt) {
    iapLog({ recovery_validate_result: 'receipt_missing', intent });
    iapOverlay({
      validate_result: 'receipt_missing',
      lastIapEvent: 'recovery_receipt_missing',
    });
    throw new AppleReceiptRecoveryError({
      message: 'No hay recibo disponible para sincronizar con el servidor.',
      code: 'RECEIPT_MISSING',
    });
  }

  iapLog({ recovery_validate_start: true, intent });
  iapOverlay({ validate_start: intent, lastIapEvent: 'recovery_validate_start' });
  const { data, error } = await validateAppleReceiptBackend(receipt, intent);

  if (error) {
    iapLog({
      recovery_validate_result: 'edge_error',
      intent,
      code: error.code ?? null,
      httpStatus: error.status ?? null,
      appleStatus: error.appleStatus ?? null,
    });
    iapOverlay({
      validate_result: 'error',
      validate_error_code: error.code ?? null,
      synced: null,
      lastIapEvent: 'recovery_validate_error',
    });
    throw new AppleReceiptRecoveryError(error);
  }

  const syncedActive = data?.synced === 'active';
  const syncedLapsed = data?.synced === 'lapsed';

  if (syncedActive || syncedLapsed) {
    await finishApplePurchasesAfterBackendSync();
    iapLog({ recovery_finish_transactions: true, intent, synced: syncedLapsed ? 'lapsed' : 'active' });
    iapOverlay({
      validate_result: 'ok',
      validate_error_code: null,
      synced: syncedLapsed ? 'lapsed' : 'active',
      lastIapEvent: 'recovery_validate_synced',
    });
  } else {
    iapLog({ recovery_validate_result: 'unclear_response', intent });
    iapOverlay({
      validate_result: 'unclear',
      synced: data?.synced != null ? String(data.synced) : null,
      lastIapEvent: 'recovery_validate_unclear',
      flowHintNoAppleConfirmation:
        'No se recibió confirmación de Apple. Intenta Restaurar compras.',
    });
    throw new AppleReceiptRecoveryError({
      message: 'No se pudo confirmar la suscripción con el servidor.',
      code: 'RECOVERY_AMBIGUOUS',
    });
  }

  iapLog({
    recovery_validate_result: syncedLapsed ? 'lapsed' : 'active',
    intent,
    planId: data?.plan_id ?? null,
  });

  void tryGetAvailablePurchasesOptional();
  return { syncedActive, syncedLapsed };
}

/**
 * StoreKit deduplica / compra previa sin sync: recibo primero; getAvailable solo para elegir Purchase si existe.
 */
async function recoverAfterDuplicatePurchase(preferredSkus: string[]): Promise<AppleIapPurchaseResult> {
  iapLog({ duplicate_detected: true, preferredSkus });
  const { syncedLapsed } = await recoverAppleIapViaReceipt('purchase_recovery');
  const purchases = (await tryGetAvailablePurchasesOptional()) ?? [];
  const purchase = pickPurchaseForSkus(purchases, preferredSkus);
  iapLog({ recovery_refresh_user: true });
  return {
    purchase,
    duplicateRecoverySyncDone: true,
    duplicateRecoveryLapsed: syncedLapsed,
  };
}

export async function ensureIapConnection(): Promise<void> {
  if (connected) return;
  iapLog({ stage: 'iap_connection_init', firstTime: true });
  const started = new Date().toISOString();
  iapOverlay({
    lastIapEvent: 'init_connection_started',
    init_connection_started: started,
    init_connection_finished: undefined,
    init_connection_error: undefined,
  });
  try {
    await initConnection();
    iapOverlay({
      lastIapEvent: 'init_connection_finished',
      init_connection_finished: new Date().toISOString(),
      init_connection_error: undefined,
    });
    connected = true;
  } catch (e) {
    const msg = extractIapErrorMessage(e).slice(0, 200);
    iapOverlay({
      lastIapEvent: 'init_connection_error',
      init_connection_finished: new Date().toISOString(),
      init_connection_error: msg,
    });
    throw e;
  }
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
    iapLog({ stage: 'listener_registered', expectedSku });
    iapOverlay({ lastIapEvent: 'listener_registered' });

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
      iapLog({ stage: 'purchase_timeout', expectedSku, ms: LISTENER_TIMEOUT_MS });
      iapOverlay({
        lastIapEvent: 'purchase_timeout',
        purchase_listener_event: 'timeout (no event)',
      });
      reject(new Error('PURCHASE_LISTENER_TIMEOUT'));
    }, LISTENER_TIMEOUT_MS);

    purchaseSub = purchaseUpdatedListener((p: Purchase) => {
      iapLog({
        stage: 'purchase_listener_event',
        expectedSku,
        receivedProductId: p.productId,
        listenerAccepts: p.productId === expectedSku,
        transactionId: transactionIdFromPurchase(p),
      });
      iapOverlay({
        lastIapEvent: 'purchase_listener_event',
        purchase_listener_event:
          p.productId === expectedSku ? `accepted:${p.productId}` : `ignored:${p.productId}`,
      });
      if (p.productId !== expectedSku) return;
      cleanup();
      resolve(p);
    });

    errorSub = purchaseErrorListener((e: PurchaseError) => {
      if (e.productId && e.productId !== expectedSku) return;
      iapLog({
        stage: 'purchase_error_listener_event',
        expectedSku,
        productId: e.productId ?? null,
        code: e.code ?? null,
        messagePreview: String(e.message ?? '').slice(0, 200),
      });
      iapOverlay({
        lastIapEvent: 'purchase_error_listener_event',
        purchase_error_listener_event: `${String(e.code ?? 'unknown')}:${String(e.message ?? '').slice(0, 80)}`,
      });
      cleanup();
      if (e.code === ErrorCode.UserCancelled) {
        reject(new Error('Compra cancelada'));
        return;
      }
      reject(e);
    });
  });
}

/** Tras volver de la hoja Apple o timeout del listener: recibo → validate (solo finish si synced). */
async function tryRecoverAppleIapAfterStoreSheet(
  sku: string,
  reason: 'foreground' | 'timeout'
): Promise<AppleIapPurchaseResult | null> {
  try {
    const r = await recoverAppleIapViaReceipt('purchase_recovery');
    const purchases = (await tryGetAvailablePurchasesOptional()) ?? [];
    const purchase = pickPurchaseForSkus(purchases, [sku]);
    iapLog({
      foreground_recovery_result: reason === 'foreground' ? 'success' : 'success_after_timeout',
      sku,
    });
    return {
      purchase,
      duplicateRecoverySyncDone: true,
      duplicateRecoveryLapsed: r.syncedLapsed,
    };
  } catch (err) {
    const code =
      err instanceof AppleReceiptRecoveryError ? err.detail.code ?? null : extractIapErrorCode(err) ?? null;
    iapLog({
      foreground_recovery_result: 'failed',
      reason,
      code,
      preview: extractIapErrorMessage(err).slice(0, 160),
    });
    return null;
  }
}

async function purchaseWithSku(sku: string): Promise<AppleIapPurchaseResult> {
  await ensureIapConnection();
  const skuList = catalogSkusForPurchaseRequest(sku);
  iapLog({
    stage: 'purchase_flow_start',
    requestedSku: sku,
    skuCatalogCount: skuList.length,
    appState_before_purchase: AppState.currentState,
  });

  if (__DEV__) {
    console.log('[IAP] Requested SKUs:', skuList);
    console.log('[IAP] Purchasing SKU:', sku);
  }
  const fetched = await fetchProducts({ skus: skuList, type: 'subs' });
  const fetchedIds = new Set(
    (fetched as Product[]).map((p) => productIdFromStoreProduct(p)).filter(Boolean)
  );
  iapLog({
    stage: 'purchaseWithSku_store_products',
    requestedSku: sku,
    fetchedProductIds: [...fetchedIds],
    requestedSkuAvailable: fetchedIds.has(sku),
  });
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

  resetAppleIapDebugOverlay();
  iapOverlay({
    lastIapEvent: 'purchase_flow_start',
    requestPurchase_called: 'no',
    requestPurchase_resolved: 'no',
    hasImmediatePurchase: 'no',
    flowHintNoAppleConfirmation: undefined,
  });

  const ac = new AbortController();
  let foregroundRecovery: AppleIapPurchaseResult | null = null;
  let prevAppState: AppStateStatus = AppState.currentState;
  let foregroundRecoverInFlight = false;
  let unsubApp: { remove: () => void } | null = null;

  const detachForeground = () => {
    unsubApp?.remove();
    unsubApp = null;
  };

  const attachForeground = () => {
    unsubApp = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        iapLog({ stage: 'appState_changed_background', next });
      }
      const from = prevAppState;
      const becameActive =
        (from === 'background' || from === 'inactive') && next === 'active';
      prevAppState = next;
      if (!becameActive || ac.signal.aborted || foregroundRecoverInFlight) return;
      iapLog({ stage: 'appState_changed_active', from });
      iapOverlay({
        lastIapEvent: 'appState_changed_active',
        appState_changed_active: String(from),
      });
      foregroundRecoverInFlight = true;
      void (async () => {
        try {
          iapLog({ stage: 'foreground_recovery_start', sku });
          iapOverlay({
            lastIapEvent: 'foreground_recovery_start',
            foreground_recovery_start: 'yes',
          });
          const recovered = await tryRecoverAppleIapAfterStoreSheet(sku, 'foreground');
          if (recovered) {
            foregroundRecovery = recovered;
            ac.abort();
          }
        } finally {
          foregroundRecoverInFlight = false;
        }
      })();
    });
  };

  const listenerPromise = waitForPurchaseFromListener(sku, ac.signal);
  attachForeground();

  try {
    iapLog({ stage: 'requestPurchase_called', appState: AppState.currentState, requestedSku: sku });
    iapOverlay({ lastIapEvent: 'requestPurchase_called', requestPurchase_called: 'yes' });
    const result = await requestPurchase({
      type: 'subs',
      request: { apple: { sku } },
    });
    const immediate = normalizePurchaseResult(result);
    iapLog({
      stage: 'requestPurchase_resolved',
      requestPurchase_result_shape: Array.isArray(result)
        ? 'array'
        : result === null || result === undefined
          ? 'nullish'
          : typeof result,
      hasImmediate: !!immediate,
    });
    iapOverlay({
      lastIapEvent: 'requestPurchase_resolved',
      requestPurchase_resolved: 'yes',
      hasImmediatePurchase: immediate ? 'yes' : 'no',
    });
    if (immediate) {
      detachForeground();
      ac.abort();
      void listenerPromise.catch(() => {});
      iapLog({
        stage: 'purchase_resolved',
        source: 'requestPurchase_immediate',
        productId: immediate.productId,
        transactionId: transactionIdFromPurchase(immediate),
      });
      iapOverlay({ lastIapEvent: 'purchase_resolved_immediate', flowHintNoAppleConfirmation: undefined });
      if (__DEV__) {
        console.log('[appleIap] purchase from requestPurchase', immediate.productId);
      }
      return { purchase: immediate };
    }

    iapLog({ stage: 'purchase_waiting_listener', requestedSku: sku });
    iapOverlay({ lastIapEvent: 'purchase_waiting_listener' });
    if (__DEV__) {
      console.log('[appleIap] requestPurchase returned null; waiting for purchaseUpdatedListener', sku);
    }

    try {
      const purchase = await listenerPromise;
      detachForeground();
      iapLog({
        stage: 'purchase_resolved',
        source: 'purchaseUpdatedListener',
        productId: purchase.productId,
        transactionId: transactionIdFromPurchase(purchase),
      });
      iapOverlay({ lastIapEvent: 'purchase_resolved_listener', flowHintNoAppleConfirmation: undefined });
      return { purchase };
    } catch (le: unknown) {
      if (le instanceof Error && le.message === 'aborted' && foregroundRecovery) {
        detachForeground();
        iapLog({ foreground_recovery_result: 'success', via: 'abort_listener_after_foreground' });
        iapOverlay({ lastIapEvent: 'foreground_recovery_abort_listener', flowHintNoAppleConfirmation: undefined });
        return foregroundRecovery;
      }
      if (le instanceof Error && le.message === 'PURCHASE_LISTENER_TIMEOUT') {
        iapLog({ stage: 'purchase_timeout_recovery_attempt', sku });
        const afterTimeout = await tryRecoverAppleIapAfterStoreSheet(sku, 'timeout');
        detachForeground();
        if (afterTimeout) {
          iapLog({ foreground_recovery_result: 'success_after_timeout' });
          iapOverlay({ lastIapEvent: 'foreground_recovery_success_timeout', flowHintNoAppleConfirmation: undefined });
          return afterTimeout;
        }
        iapOverlay({
          lastIapEvent: 'purchase_unconfirmed',
          flowHintNoAppleConfirmation:
            'No se recibió confirmación de Apple. Intenta Restaurar compras.',
        });
        throw new AppleIapPurchaseUnconfirmedError();
      }
      detachForeground();
      throw le;
    }
  } catch (e) {
    detachForeground();
    ac.abort();
    void listenerPromise.catch(() => {});
    if (e instanceof Error && e.message === 'Compra cancelada') {
      throw e;
    }
    if (isDuplicatePurchaseSituation(e)) {
      const recovered = await recoverAfterDuplicatePurchase([sku]);
      iapLog({ recovery_refresh_user: true });
      return recovered;
    }
    if (looksLikeIapServiceError(e)) {
      try {
        const r = await recoverAppleIapViaReceipt('purchase_recovery');
        iapLog({ recovery_refresh_user: true, source: 'service_error' });
        return {
          purchase: null,
          duplicateRecoverySyncDone: true,
          duplicateRecoveryLapsed: r.syncedLapsed,
        };
      } catch (inner: unknown) {
        if (inner instanceof AppleReceiptRecoveryError) throw inner;
        throw new AppleIapStorePendingError();
      }
    }
    if (e instanceof Error) throw e;
    throw new Error(typeof e === 'string' ? e : 'Error en la compra');
  }
}

/** Catálogo de suscripciones de planes principales (precios desde StoreKit). Reutiliza el mismo fetch que la compra. */
export async function loadAppleSubscriptionCatalog(): Promise<Product[]> {
  await ensureIapConnection();
  const skus = [...APPLE_IAP_SKUS_PLANS];
  const reqSkus = skus.join(',');
  iapOverlay({
    lastIapEvent: 'fetch_products_started',
    fetch_products_started: new Date().toISOString(),
    fetch_products_requested_skus: reqSkus,
    fetch_products_finished: undefined,
    fetch_products_count: undefined,
    fetch_products_ids: undefined,
    fetch_products_error: undefined,
  });
  try {
    const result = await fetchProducts({ skus, type: 'subs' });
    const products = (result ?? []) as Product[];
    const ids = products.map((p) => productIdFromStoreProduct(p)).filter(Boolean);
    iapOverlay({
      lastIapEvent: 'fetch_products_finished',
      fetch_products_finished: new Date().toISOString(),
      fetch_products_count: String(products.length),
      fetch_products_ids: ids.join(','),
      fetch_products_error: undefined,
    });
    if (__DEV__) {
      const normalized = products.map((p) => {
        const anyP = p as Product & {
          displayPrice?: string;
          localizedPrice?: string;
          priceString?: string;
          currencyCode?: string;
          currency?: string;
        };
        return {
          productId: productIdFromStoreProduct(p),
          displayPrice: anyP.displayPrice ?? anyP.localizedPrice ?? anyP.priceString ?? null,
          price: anyP.price ?? null,
          currency: anyP.currencyCode ?? anyP.currency ?? null,
        };
      });
      console.log('[IAP] Catalog products from StoreKit:', normalized);
    }
    return products;
  } catch (e) {
    const msg = extractIapErrorMessage(e).slice(0, 200);
    iapOverlay({
      lastIapEvent: 'fetch_products_error',
      fetch_products_finished: new Date().toISOString(),
      fetch_products_error: msg,
    });
    throw e;
  }
}

/** Precios StoreKit para add-ons de sucursales (misma convención que loadAppleSubscriptionCatalog). */
export async function loadAppleBranchAddonCatalog(): Promise<Product[]> {
  await ensureIapConnection();
  const result = await fetchProducts({ skus: [...APPLE_IAP_SKUS_ADDONS], type: 'subs' });
  return (result ?? []) as Product[];
}

export async function purchaseAppleSubscription(plan: ApplePlanUiId): Promise<AppleIapPurchaseResult> {
  const sku = skuForPlan(plan);
  console.log('[IAP] Plan selected:', plan);
  console.log('[IAP] SKU mapped:', sku);
  return purchaseWithSku(sku);
}

export async function purchaseAppleBranchAddon(slots: 1 | 3): Promise<AppleIapPurchaseResult> {
  const sku = skuForBranchAddon(slots);
  console.log('[IAP] Branch add-on slots:', slots);
  console.log('[IAP] SKU mapped:', sku);
  return purchaseWithSku(sku);
}

export async function getReceiptBase64(forceRefresh = false): Promise<string | null> {
  await ensureIapConnection();
  iapLog({ stage: 'getReceiptBase64_start', forceRefresh });
  const receipt = forceRefresh ? await requestReceiptRefreshIOS() : await getReceiptIOS();
  const len = receipt?.length ?? 0;
  const hasReceipt = len > 0;
  iapLog({ stage: 'getReceiptBase64_result', forceRefresh, hasReceipt, receiptLen: len });
  iapOverlay({
    lastIapEvent: 'getReceiptBase64',
    receipt_hasReceipt: hasReceipt ? 'yes' : 'no',
    receipt_length: len,
  });
  return receipt && receipt.length > 0 ? receipt : null;
}

export async function restoreApplePurchasesForReceipt(): Promise<void> {
  await ensureIapConnection();
  void tryGetAvailablePurchasesOptional();
}

/**
 * Finaliza transacciones StoreKit **solo** tras `validate-apple-receipt` con `synced === 'active' | 'lapsed'`.
 * No llamar por compra reciente ni solo por getAvailablePurchases.
 */
export async function finishAppleTransactionIfNeeded(purchase: Purchase): Promise<void> {
  await iapFinishTransaction({ purchase, isConsumable: false });
}

/**
 * Cierra transacciones pendientes de SKUs Cellarium **solo** si el backend ya confirmó estado vía validate
 * (esta función debe invocarse inmediatamente después de synced active/lapsed).
 * Si `getAvailablePurchases` falla, no se fuerza éxito: simplemente no hay nada que cerrar en ese intento.
 */
export async function finishApplePurchasesAfterBackendSync(): Promise<void> {
  await ensureIapConnection();
  let purchases: Purchase[];
  try {
    purchases = await getAvailablePurchases({ onlyIncludeActiveItemsIOS: false });
  } catch (e) {
    iapLog({
      stage: 'finishAfterSync_getAvailablePurchases',
      outcome: 'error',
      preview: extractIapErrorMessage(e).slice(0, 200),
    });
    return;
  }
  for (const p of purchases) {
    if (!CELLARIUM_SKU_SET.has(p.productId)) continue;
    try {
      await iapFinishTransaction({ purchase: p, isConsumable: false });
    } catch (err) {
      if (__DEV__) console.warn('[appleIap] finishTransaction post-sync', p.productId, err);
    }
  }
}
