/**
 * URLs públicas: privacidad, términos y soporte (App Store / Google Play).
 * Deben coincidir con las páginas publicadas en www.cellarium.net.
 */
export const PRIVACY_POLICY_URL = 'https://www.cellarium.net/privacy';
export const TERMS_OF_SERVICE_URL = 'https://www.cellarium.net/terms';
export const SUPPORT_URL = 'https://www.cellarium.net/support';

/** Agrupación para imports únicos desde pantallas */
export const LEGAL_URLS = {
  privacyPolicy: PRIVACY_POLICY_URL,
  termsOfService: TERMS_OF_SERVICE_URL,
  support: SUPPORT_URL,
} as const;
