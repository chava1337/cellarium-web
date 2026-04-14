import { Platform } from 'react-native';

/**
 * Plataforma de la app para lógica de facturación (no confundir con OS del usuario en web).
 * Fase 1: Stripe solo en web; iOS → Apple IAP; Android → Google Play (pendiente backend).
 */
export type CellariumBillingPlatform = 'web' | 'ios' | 'android';

export function getCellariumBillingPlatform(): CellariumBillingPlatform {
  if (Platform.OS === 'web') return 'web';
  if (Platform.OS === 'ios') return 'ios';
  return 'android';
}

/** Suscripción vía Stripe Checkout / Customer Portal (solo tiene sentido en web). */
export function shouldUseStripeSubscriptionUi(): boolean {
  return Platform.OS === 'web';
}

/** Nativo Android: no abrir checkout ni portal Stripe bajo ninguna circunstancia. */
export function isAndroidBillingApp(): boolean {
  return Platform.OS === 'android';
}

/**
 * Opcional: enviar en body a Edge Functions cuando exista validación server-side.
 * En Fase 1 Android no llama a esas funciones; web/ios sí pueden adjuntarlo.
 */
export function stripeEdgeClientMeta(): { clientPlatform: CellariumBillingPlatform } {
  return { clientPlatform: getCellariumBillingPlatform() };
}
