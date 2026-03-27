/**
 * Servicio para gestionar pagos con Stripe
 * NOTA: Las operaciones sensibles (crear PaymentIntent, confirmar pagos)
 * deben hacerse desde Supabase Edge Functions para mantener seguras las claves secretas
 */

import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';
import { Payment, PaymentStatus, PaymentMethod } from '../types';

export interface CreatePaymentIntentData {
  amount: number; // En centavos (ej: 129000 = $1,290.00 MXN)
  currency?: string; // Por defecto 'MXN'
  description?: string;
  metadata?: Record<string, any>;
}

export interface PaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
}

export interface ConfirmPaymentData {
  paymentIntentId: string;
  paymentMethodId?: string;
}

/**
 * Crea un PaymentIntent en Stripe a través de Edge Function
 * Esto debe llamarse desde el backend (Supabase Edge Function)
 */
export async function createPaymentIntent(
  data: CreatePaymentIntentData
): Promise<PaymentIntentResponse> {
  try {
    logger.debug('[PaymentService] Creando PaymentIntent:', data);

    // Llamar a Edge Function de Supabase
    const { data: response, error } = await supabase.functions.invoke('create-payment-intent', {
      body: {
        amount: data.amount,
        currency: data.currency || 'MXN',
        description: data.description,
        metadata: data.metadata,
      },
    });

    if (error) {
      const fn = 'create-payment-intent';
      const res = error?.context?.response as Response | undefined;
      const status = res?.status;
      let rawBody: string | undefined;
      if (res) {
        try {
          rawBody = await res.clone().text();
        } catch {
          rawBody = undefined;
        }
      }
      logger.error(
        `[PaymentService] Edge Function ${fn} failed: status=${status ?? 'n/a'}, message=${error.message ?? 'n/a'}, body=${rawBody ?? 'n/a'}`
      );
      throw error;
    }

    if (!response?.clientSecret || !response?.paymentIntentId) {
      throw new Error('Respuesta inválida del servidor');
    }

    logger.success('[PaymentService] PaymentIntent creado:', response.paymentIntentId);
    return {
      clientSecret: response.clientSecret,
      paymentIntentId: response.paymentIntentId,
    };
  } catch (error) {
    logger.error('[PaymentService] Excepción creando PaymentIntent:', error);
    throw error;
  }
}

/**
 * Confirma un pago después de que el usuario completa el proceso en Stripe
 */
export async function confirmPayment(
  paymentIntentId: string,
  userId: string,
  ownerId: string,
  subscriptionId?: string
): Promise<Payment> {
  try {
    logger.debug('[PaymentService] Confirmando pago:', { paymentIntentId, userId });

    // Llamar a Edge Function para confirmar el pago
    const { data: response, error } = await supabase.functions.invoke('confirm-payment', {
      body: {
        paymentIntentId,
        userId,
        ownerId,
        subscriptionId,
      },
    });

    if (error) {
      const fn = 'confirm-payment';
      const res = error?.context?.response as Response | undefined;
      const status = res?.status;
      let rawBody: string | undefined;
      if (res) {
        try {
          rawBody = await res.clone().text();
        } catch {
          rawBody = undefined;
        }
      }
      logger.error(
        `[PaymentService] Edge Function ${fn} failed: status=${status ?? 'n/a'}, message=${error.message ?? 'n/a'}, body=${rawBody ?? 'n/a'}`
      );
      throw error;
    }

    // Guardar el pago en nuestra base de datos
    const { data: payment, error: dbError } = await supabase
      .from('payments')
      .insert({
        user_id: userId,
        owner_id: ownerId,
        subscription_id: subscriptionId,
        amount: response.amount / 100, // Convertir de centavos a pesos
        currency: response.currency,
        status: response.status === 'succeeded' ? 'completed' : 'failed',
        payment_method: 'card',
        payment_method_details: {
          last4: response.paymentMethod?.card?.last4,
          brand: response.paymentMethod?.card?.brand,
        },
        stripe_payment_intent_id: paymentIntentId,
        stripe_charge_id: response.chargeId,
        description: response.description,
        metadata: response.metadata,
      })
      .select()
      .single();

    if (dbError) {
      logger.error('[PaymentService] Error guardando pago en BD:', dbError);
      throw dbError;
    }

    logger.success('[PaymentService] Pago confirmado y guardado:', payment.id);
    return payment;
  } catch (error) {
    logger.error('[PaymentService] Excepción confirmando pago:', error);
    throw error;
  }
}

/**
 * Obtiene el historial de pagos de un usuario
 */
export async function getPaymentHistory(
  userId: string,
  limit: number = 50
): Promise<Payment[]> {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('[PaymentService] Error obteniendo historial:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    logger.error('[PaymentService] Excepción obteniendo historial:', error);
    throw error;
  }
}

/**
 * Obtiene un pago específico por ID
 */
export async function getPayment(paymentId: string): Promise<Payment | null> {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .single();

    if (error) {
      logger.error('[PaymentService] Error obteniendo pago:', error);
      return null;
    }

    return data;
  } catch (error) {
    logger.error('[PaymentService] Excepción obteniendo pago:', error);
    return null;
  }
}

/**
 * Obtiene un pago por PaymentIntent ID de Stripe
 */
export async function getPaymentByStripeIntentId(
  stripePaymentIntentId: string
): Promise<Payment | null> {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('stripe_payment_intent_id', stripePaymentIntentId)
      .single();

    if (error) {
      logger.error('[PaymentService] Error obteniendo pago por Stripe ID:', error);
      return null;
    }

    return data;
  } catch (error) {
    logger.error('[PaymentService] Excepción obteniendo pago por Stripe ID:', error);
    return null;
  }
}






















