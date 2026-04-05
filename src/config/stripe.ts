/**
 * Configuración de Stripe
 * NOTA: Solo contiene la clave pública (publishable key)
 * La clave secreta debe estar en Supabase Edge Functions
 */

export const STRIPE_CONFIG = {
  publishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
  currency: 'MXN' as const,
  // Planes y precios (en centavos)
  plans: {
    cafe: {
      id: 'cafe',
      name: 'Cafe',
      price: 0,
      priceFormatted: '$0.00',
    },
    bistro: {
      id: 'bistro',
      name: 'Bistro',
      price: 149900,
      priceFormatted: '$1499.00',
    },
    trattoria: {
      id: 'trattoria',
      name: 'Trattoria',
      price: 249900,
      priceFormatted: '$2499.00',
    },
    'grand-maison': {
      id: 'grand-maison',
      name: 'Grand Maison',
      price: 449900,
      priceFormatted: '$4499.00',
    },
  },
} as const;

/**
 * Verifica si Stripe está configurado
 */
export function isStripeConfigured(): boolean {
  return !!STRIPE_CONFIG.publishableKey && STRIPE_CONFIG.publishableKey.startsWith('pk_');
}

/**
 * Obtiene el precio de un plan en centavos
 */
export function getPlanPrice(planId: string): number {
  return STRIPE_CONFIG.plans[planId as keyof typeof STRIPE_CONFIG.plans]?.price || 0;
}

/**
 * Obtiene el precio formateado de un plan
 */
export function getPlanPriceFormatted(planId: string): string {
  return STRIPE_CONFIG.plans[planId as keyof typeof STRIPE_CONFIG.plans]?.priceFormatted || '$0.00';
}






















