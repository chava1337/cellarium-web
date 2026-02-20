/**
 * Mapea errores de Supabase a mensajes de UI amigables
 * 
 * Maneja errores específicos de:
 * - Límites de suscripción (P0001, "Subscription limit reached")
 * - Permisos RLS (42501, "permission denied")
 * - Restricciones de rol ("Only owner can...")
 */

export type ErrorUiAction = 'subscriptions' | 'none';

export interface ErrorUi {
  title: string;
  message: string;
  ctaLabel?: string;
  ctaAction?: ErrorUiAction;
}

export interface StructuredError extends Error {
  kind: 'SUBSCRIPTION_LIMIT' | 'RLS' | 'GENERIC';
  ui: ErrorUi;
  originalError?: any;
}

/**
 * Mapea un error de Supabase a un objeto ErrorUi con título, mensaje y CTA
 * 
 * @param error - Error de Supabase o cualquier error
 * @param t - Función de traducción de useLanguage
 * @returns Objeto ErrorUi con título, mensaje y opcionalmente CTA
 */
export function mapSupabaseErrorToUi(
  error: any,
  t: (key: string) => string
): ErrorUi {
  const errorMessage = error?.message || error?.toString() || '';
  const errorCode = error?.code || '';
  const errorDetails = error?.details || '';

  // Error de límite de suscripción (trigger/constraint)
  if (
    errorCode === 'P0001' ||
    errorMessage.includes('Subscription limit reached') ||
    errorMessage.includes('FREE plan limit') ||
    errorMessage.includes('subscription limit') ||
    errorMessage.includes('límite de suscripción') ||
    errorMessage.includes('plan limit') ||
    errorDetails.includes('subscription limit')
  ) {
    return {
      title: t('subscription.limit_title'),
      message: t('subscription.limit_message'),
      ctaLabel: t('subscription.view_plans'),
      ctaAction: 'subscriptions',
    };
  }

  // Error de permisos RLS
  if (
    errorCode === '42501' ||
    errorMessage.includes('permission denied') ||
    errorMessage.includes('permiso denegado') ||
    errorMessage.includes('new row violates row-level security policy') ||
    errorMessage.includes('viola la política de seguridad')
  ) {
    return {
      title: t('auth.access_restricted'),
      message: t('auth.no_permission'),
      ctaAction: 'none',
    };
  }

  // Error de restricción de rol (solo owner puede...)
  if (
    errorMessage.includes('Only owner can') ||
    errorMessage.includes('Solo el owner puede') ||
    errorMessage.includes('requires owner role') ||
    errorMessage.includes('requiere rol owner')
  ) {
    return {
      title: t('subscription.restricted_title'),
      message: t('subscription.only_owner_msg'),
      ctaAction: 'none',
    };
  }

  // Error genérico
  return {
    title: t('common.error'),
    message: errorMessage || t('common.try_again'),
    ctaAction: 'none',
  };
}

/**
 * Crea un StructuredError a partir de un error de Supabase
 * Útil para propagar errores estructurados desde servicios a pantallas
 * 
 * @param error - Error original
 * @param t - Función de traducción
 * @returns StructuredError con kind y ui
 */
export function createStructuredError(
  error: any,
  t: (key: string) => string
): StructuredError {
  const ui = mapSupabaseErrorToUi(error, t);
  
  let kind: StructuredError['kind'] = 'GENERIC';
  if (ui.ctaAction === 'subscriptions') {
    kind = 'SUBSCRIPTION_LIMIT';
  } else if (ui.title === t('auth.access_restricted')) {
    kind = 'RLS';
  }

  const structuredError = new Error(ui.message) as StructuredError;
  structuredError.kind = kind;
  structuredError.ui = ui;
  structuredError.originalError = error;
  structuredError.name = 'StructuredError';

  return structuredError;
}

/**
 * Verifica si un error es un StructuredError
 */
export function isStructuredError(error: any): error is StructuredError {
  return error && typeof error === 'object' && 'kind' in error && 'ui' in error;
}





