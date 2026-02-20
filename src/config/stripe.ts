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
    free: {
      id: 'free',
      name: 'Gratis',
      price: 0, // $0.00
      priceFormatted: '$0.00',
    },
    basic: {
      id: 'basic',
      name: 'Básico',
      price: 95000, // $950.00 MXN en centavos
      priceFormatted: '$950.00',
    },
    'additional-branch': {
      id: 'additional-branch',
      name: 'Sucursal Adicional',
      price: 49900, // $499.00 MXN en centavos (add-on por sucursal)
      priceFormatted: '$499.00',
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






















