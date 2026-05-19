/**
 * Mensajes de usuario para validate-apple-receipt (sin lógica de negocio).
 */
import type { AppleReceiptInvokeError } from '../services/validateAppleReceipt';

/**
 * Texto listo para Alert: mensaje principal + código para diagnóstico TestFlight.
 */
export function messageForAppleReceiptError(
  t: (key: string) => string,
  error: AppleReceiptInvokeError
): string {
  const code = error.code ?? '';
  const appleSt = error.appleStatus;

  let base: string;
  switch (code) {
    case 'NO_SESSION':
    case 'INVALID_SESSION':
      base = t('subscription.apple_error_no_session');
      break;
    case 'EMAIL_VERIFICATION_REQUIRED':
      base = t('subscription.apple_error_email_verification');
      break;
    case 'GOOGLE_SUBSCRIPTION_ACTIVE':
      base = t('subscription.apple_error_google_active');
      break;
    case 'STRIPE_SUBSCRIPTION_ACTIVE':
      base = t('subscription.apple_error_stripe_active');
      break;
    case 'APPLE_VERIFY_FAILED':
      base =
        appleSt != null
          ? t('subscription.apple_error_apple_verify_failed_status').replace('{status}', String(appleSt))
          : t('subscription.apple_error_apple_verify_failed');
      break;
    case 'NO_MATCHING_SUBSCRIPTION':
      base = t('subscription.apple_error_no_matching_subscription');
      break;
    case 'SYNC_FAILED':
      base = t('subscription.apple_error_sync_failed');
      break;
    case 'RECOVERY_AMBIGUOUS':
      base = t('subscription.apple_sync_unclear_message');
      break;
    case 'MISSING_RECEIPT':
    case 'RECEIPT_MISSING':
      base = t('subscription.apple_error_receipt_recover_instruction');
      break;
    case 'ADDON_WITHOUT_BASE':
      base = t('subscription.apple_error_addon_without_base');
      break;
    case 'LEGACY_APPLE_PRODUCT':
    case 'LEGACY_ONLY':
      base = t('subscription.apple_error_legacy_product');
      break;
    case 'FORBIDDEN':
      base = t('subscription.apple_error_forbidden');
      break;
    case 'AUTH_REQUIRED':
      base = t('subscription.apple_error_auth_required');
      break;
    case 'INTERNAL':
    case 'UNEXPECTED':
      base = t('subscription.apple_error_internal');
      break;
    case 'LAPSE_FAILED':
      base = t('subscription.apple_error_lapse_failed');
      break;
    default:
      base = error.message?.trim() || t('subscription.error_generic');
      break;
  }

  const hint = t('subscription.apple_backend_retry_hint');
  const codeLine =
    code.length > 0 ? t('subscription.apple_error_code_line').replace('{code}', code) : '';

  return codeLine.length > 0 ? `${base}\n\n${codeLine}\n\n${hint}` : `${base}\n\n${hint}`;
}
