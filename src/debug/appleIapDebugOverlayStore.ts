/**
 * Estado visual temporal para diagnóstico Apple IAP (solo __DEV__ o TestFlight con flag).
 * No guardar recibo completo, tokens ni PII.
 */
import Constants from 'expo-constants';

/** Pon `true` y genera build iOS TestFlight para ver el overlay sin __DEV__. */
export const IAP_DEBUG_OVERLAY = true;

function iapDebugFromExpoExtra(): boolean {
  const extra = Constants.expoConfig?.extra as { iapDebugOverlay?: boolean } | undefined;
  return extra?.iapDebugOverlay === true;
}

/** Activo en dev, con constante en true, o con EXPO_PUBLIC_IAP_DEBUG_OVERLAY=1 en EAS. */
export function isIapDebugOverlayEnabled(): boolean {
  if (typeof __DEV__ !== 'undefined' && __DEV__) return true;
  if (IAP_DEBUG_OVERLAY) return true;
  return iapDebugFromExpoExtra();
}

/** Condición de render en SubscriptionsScreen (solo iOS). */
export function shouldShowAppleIapDebugOverlayOnIos(): boolean {
  return isIapDebugOverlayEnabled();
}
export type AppleIapDebugOverlaySnapshot = {
  lastIapEvent: string;
  updatedAt: number;
  requestPurchase_called?: string;
  requestPurchase_resolved?: string;
  hasImmediatePurchase?: string;
  purchase_listener_event?: string;
  purchase_error_listener_event?: string;
  appState_changed_active?: string;
  foreground_recovery_start?: string;
  receipt_hasReceipt?: string;
  receipt_length?: number | null;
  validate_start?: string;
  validate_result?: string;
  validate_error_code?: string | null;
  synced?: string | null;
  refresh_started?: string;
  refresh_finished?: string;
  /** Mensaje corto si el flujo quedó sin confirmación clara de Apple */
  flowHintNoAppleConfirmation?: string;
  /** StoreKit: carga de catálogo de planes (SubscriptionsScreen + loadAppleSubscriptionCatalog) */
  catalog_effect_started?: string;
  catalog_effect_skipped?: string;
  catalog_skip_reason?: string;
  init_connection_started?: string;
  init_connection_finished?: string;
  init_connection_error?: string;
  fetch_products_started?: string;
  fetch_products_requested_skus?: string;
  fetch_products_finished?: string;
  fetch_products_count?: string;
  fetch_products_ids?: string;
  fetch_products_error?: string;
  catalog_state_updated?: string;
  /** Add-ons sucursales: no se consulta StoreKit aquí hasta tener metadata completa */
  addon_catalog_skipped?: string;
  addon_catalog_skip_reason?: string;
  /** Cliente → Edge validate-apple-receipt (sin recibo/JWT/PII) */
  edge_invoke_start?: string;
  edge_invoke_finished?: string;
  edge_function_name?: string;
  supabase_url_host?: string;
  has_session?: string;
  has_access_token?: string;
  receipt_len_before_invoke?: string;
  edge_invoke_success?: string;
  edge_invoke_error?: string;
  edge_http_status?: string;
  edge_error_code?: string;
  edge_error_message?: string;
  edge_response_synced?: string;
  edge_response_plan_id?: string;
  /** Restaurar compras (SubscriptionsScreen) */
  restore_button_pressed?: string;
  restore_handler_started?: string;
  restore_skipped?: string;
  restore_skip_reason?: string;
  restore_loading_state?: string;
  restore_is_ios?: string;
  restore_has_user?: string;
  restore_has_session_if_checked?: string;
  restore_disabled?: string;
  /** getReceiptBase64 / getReceiptIOS / requestReceiptRefreshIOS */
  receipt_attempt_started?: string;
  receipt_attempt_force_refresh_false?: string;
  receipt_attempt_force_refresh_true?: string;
  receipt_attempt_finished?: string;
  receipt_attempt_error?: string;
  receipt_attempt_error_message?: string;
  receipt_attempt_error_stack_short?: string;
  receipt_result_empty?: string;
  receipt_result_length?: string;
  receipt_refresh_triggered?: string;
  receipt_refresh_finished?: string;
  receipt_refresh_failed?: string;
  receipt_attempt_timeout?: string;
};

let snapshot: AppleIapDebugOverlaySnapshot = {
  lastIapEvent: '—',
  updatedAt: 0,
};

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function getAppleIapDebugOverlaySnapshot(): AppleIapDebugOverlaySnapshot {
  return snapshot;
}

export function resetAppleIapDebugOverlay(): void {
  if (!isIapDebugOverlayEnabled()) return;
  snapshot = { lastIapEvent: 'reset', updatedAt: Date.now() };
  notify();
}

export function patchAppleIapDebugOverlay(p: Partial<AppleIapDebugOverlaySnapshot>): void {
  if (!isIapDebugOverlayEnabled()) return;
  snapshot = {
    ...snapshot,
    ...p,
    updatedAt: Date.now(),
  };
  notify();
}

export function subscribeAppleIapDebugOverlay(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
