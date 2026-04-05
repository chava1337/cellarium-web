/**
 * Servicio para gestionar suscripciones
 * Integración con Stripe para suscripciones recurrentes
 */

import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';
import { Subscription, SubscriptionPlan, SubscriptionStatus } from '../types';
import { createPaymentIntent, confirmPayment } from './PaymentService';

export interface CreateSubscriptionData {
  planId: SubscriptionPlan;
  userId: string;
  ownerId: string;
  paymentMethodId?: string; // ID del método de pago en Stripe
}

export interface UpdateSubscriptionData {
  planId?: SubscriptionPlan;
  cancelAtPeriodEnd?: boolean;
}

/**
 * Crea una nueva suscripción
 * Esto crea tanto la suscripción en Stripe como el registro en nuestra BD
 */
export async function createSubscription(
  data: CreateSubscriptionData
): Promise<Subscription> {
  try {
    logger.debug('[SubscriptionService] Creando suscripción:', data);

    const planNames: Record<SubscriptionPlan, string> = {
      cafe: 'Cafe',
      bistro: 'Bistro',
      trattoria: 'Trattoria',
      'grand-maison': 'Grand Maison',
    };

    const planPrices: Record<SubscriptionPlan, number> = {
      cafe: 0,
      bistro: 149900,
      trattoria: 249900,
      'grand-maison': 449900,
    };

    // Calcular fechas del período
    const now = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1); // 1 mes

    // Si es plan gratuito, crear directamente sin Stripe
    if (data.planId === 'cafe') {
      const { data: subscription, error } = await supabase
        .from('subscriptions')
        .insert({
          user_id: data.userId,
          owner_id: data.ownerId,
          plan_id: 'cafe',
          plan_name: planNames.cafe,
          status: 'active',
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          cancel_at_period_end: false,
        })
        .select()
        .single();

      if (error) {
        logger.error('[SubscriptionService] Error creando suscripción gratuita:', error);
        throw error;
      }

      // Actualizar usuario
      await supabase
        .from('users')
        .update({
          subscription_id: subscription.id,
          subscription_plan: 'cafe',
          subscription_active: true,
          subscription_expires_at: periodEnd.toISOString(),
        })
        .eq('id', data.userId);

      logger.success('[SubscriptionService] Suscripción gratuita creada:', subscription.id);
      return subscription;
    }

    // Para planes de pago, crear suscripción en Stripe a través de Edge Function
    const { data: stripeResponse, error: stripeError } = await supabase.functions.invoke(
      'create-subscription',
      {
        body: {
          customerId: data.ownerId, // Usar ownerId como referencia
          planId: data.planId,
          paymentMethodId: data.paymentMethodId,
        },
      }
    );

    if (stripeError) {
      logger.error('[SubscriptionService] Error creando suscripción en Stripe:', stripeError);
      throw stripeError;
    }

    // Crear registro en nuestra BD
    const { data: subscription, error: dbError } = await supabase
      .from('subscriptions')
      .insert({
        user_id: data.userId,
        owner_id: data.ownerId,
        plan_id: data.planId,
        plan_name: planNames[data.planId],
        status: 'active',
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
        stripe_subscription_id: stripeResponse.subscriptionId,
        stripe_customer_id: stripeResponse.customerId,
        metadata: {
          price: planPrices[data.planId] / 100, // Convertir a pesos
          currency: 'MXN',
        },
      })
      .select()
      .single();

    if (dbError) {
      logger.error('[SubscriptionService] Error guardando suscripción en BD:', dbError);
      throw dbError;
    }

    // Actualizar usuario
    await supabase
      .from('users')
      .update({
        subscription_id: subscription.id,
        subscription_plan: data.planId,
        subscription_active: true,
        subscription_expires_at: periodEnd.toISOString(),
        stripe_customer_id: stripeResponse.customerId,
      })
      .eq('id', data.userId);

    logger.success('[SubscriptionService] Suscripción creada:', subscription.id);
    return subscription;
  } catch (error) {
    logger.error('[SubscriptionService] Excepción creando suscripción:', error);
    throw error;
  }
}

/**
 * Cancela una suscripción
 */
export async function cancelSubscription(
  subscriptionId: string,
  cancelAtPeriodEnd: boolean = true
): Promise<Subscription> {
  try {
    logger.debug('[SubscriptionService] Cancelando suscripción:', {
      subscriptionId,
      cancelAtPeriodEnd,
    });

    // Obtener suscripción
    const { data: subscription, error: fetchError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', subscriptionId)
      .single();

    if (fetchError || !subscription) {
      throw new Error('Suscripción no encontrada');
    }

    // Si tiene Stripe subscription ID, cancelar en Stripe
    if (subscription.stripe_subscription_id) {
      const { error: stripeError } = await supabase.functions.invoke('cancel-subscription', {
        body: {
          subscriptionId: subscription.stripe_subscription_id,
          cancelAtPeriodEnd,
        },
      });

      if (stripeError) {
        logger.error('[SubscriptionService] Error cancelando en Stripe:', stripeError);
        // Continuar con la cancelación local aunque falle en Stripe
      }
    }

    // Actualizar en BD
    const updateData: any = {
      cancel_at_period_end: cancelAtPeriodEnd,
      canceled_at: new Date().toISOString(),
    };

    if (!cancelAtPeriodEnd) {
      // Cancelar inmediatamente
      updateData.status = 'canceled';
    }

    const { data: updatedSubscription, error: updateError } = await supabase
      .from('subscriptions')
      .update(updateData)
      .eq('id', subscriptionId)
      .select()
      .single();

    if (updateError) {
      logger.error('[SubscriptionService] Error actualizando suscripción:', updateError);
      throw updateError;
    }

    // Si se cancela inmediatamente, actualizar usuario
    if (!cancelAtPeriodEnd) {
      await supabase
        .from('users')
        .update({
          subscription_active: false,
        })
        .eq('id', subscription.user_id);
    }

    logger.success('[SubscriptionService] Suscripción cancelada:', subscriptionId);
    return updatedSubscription;
  } catch (error) {
    logger.error('[SubscriptionService] Excepción cancelando suscripción:', error);
    throw error;
  }
}

/**
 * Actualiza una suscripción (cambio de plan)
 */
export async function updateSubscription(
  subscriptionId: string,
  data: UpdateSubscriptionData
): Promise<Subscription> {
  try {
    logger.debug('[SubscriptionService] Actualizando suscripción:', { subscriptionId, data });

    // Obtener suscripción actual
    const { data: currentSubscription, error: fetchError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', subscriptionId)
      .single();

    if (fetchError || !currentSubscription) {
      throw new Error('Suscripción no encontrada');
    }

    // Si se cambia el plan y tiene Stripe subscription, actualizar en Stripe
    if (data.planId && data.planId !== currentSubscription.plan_id && currentSubscription.stripe_subscription_id) {
      const { error: stripeError } = await supabase.functions.invoke('update-subscription', {
        body: {
          subscriptionId: currentSubscription.stripe_subscription_id,
          newPlanId: data.planId,
        },
      });

      if (stripeError) {
        logger.error('[SubscriptionService] Error actualizando en Stripe:', stripeError);
        throw stripeError;
      }
    }

    // Actualizar en BD
    const updateData: any = {};
    if (data.planId) {
      const planNames: Record<SubscriptionPlan, string> = {
        cafe: 'Cafe',
        bistro: 'Bistro',
        trattoria: 'Trattoria',
        'grand-maison': 'Grand Maison',
      };
      updateData.plan_id = data.planId;
      updateData.plan_name = planNames[data.planId];
    }
    if (data.cancelAtPeriodEnd !== undefined) {
      updateData.cancel_at_period_end = data.cancelAtPeriodEnd;
    }

    const { data: updatedSubscription, error: updateError } = await supabase
      .from('subscriptions')
      .update(updateData)
      .eq('id', subscriptionId)
      .select()
      .single();

    if (updateError) {
      logger.error('[SubscriptionService] Error actualizando suscripción:', updateError);
      throw updateError;
    }

    // Actualizar usuario si cambió el plan
    if (data.planId) {
      await supabase
        .from('users')
        .update({
          subscription_plan: data.planId,
        })
        .eq('id', currentSubscription.user_id);
    }

    logger.success('[SubscriptionService] Suscripción actualizada:', subscriptionId);
    return updatedSubscription;
  } catch (error) {
    logger.error('[SubscriptionService] Excepción actualizando suscripción:', error);
    throw error;
  }
}

/**
 * Obtiene la suscripción activa de un usuario
 */
export async function getActiveSubscription(userId: string): Promise<Subscription | null> {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gt('current_period_end', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      // No es un error si no hay suscripción activa
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('[SubscriptionService] Error obteniendo suscripción activa:', error);
      return null;
    }

    return data;
  } catch (error) {
    logger.error('[SubscriptionService] Excepción obteniendo suscripción activa:', error);
    return null;
  }
}

/**
 * Obtiene todas las suscripciones de un usuario (historial)
 */
export async function getSubscriptionHistory(userId: string): Promise<Subscription[]> {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('[SubscriptionService] Error obteniendo historial:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    logger.error('[SubscriptionService] Excepción obteniendo historial:', error);
    throw error;
  }
}

/**
 * Verifica si una suscripción está activa y no ha expirado
 */
export async function isSubscriptionActive(userId: string): Promise<boolean> {
  try {
    const subscription = await getActiveSubscription(userId);
    return subscription !== null;
  } catch (error) {
    logger.error('[SubscriptionService] Error verificando suscripción activa:', error);
    return false;
  }
}

/**
 * Renueva una suscripción (llamado automáticamente por webhook de Stripe)
 * Esta función normalmente se llama desde un webhook, no desde el cliente
 */
export async function renewSubscription(
  subscriptionId: string,
  newPeriodEnd: Date
): Promise<Subscription> {
  try {
    logger.debug('[SubscriptionService] Renovando suscripción:', { subscriptionId, newPeriodEnd });

    const { data, error } = await supabase
      .from('subscriptions')
      .update({
        current_period_start: new Date().toISOString(),
        current_period_end: newPeriodEnd.toISOString(),
        status: 'active',
      })
      .eq('id', subscriptionId)
      .select()
      .single();

    if (error) {
      logger.error('[SubscriptionService] Error renovando suscripción:', error);
      throw error;
    }

    // Actualizar usuario
    await supabase
      .from('users')
      .update({
        subscription_active: true,
        subscription_expires_at: newPeriodEnd.toISOString(),
      })
      .eq('id', data.user_id);

    logger.success('[SubscriptionService] Suscripción renovada:', subscriptionId);
    return data;
  } catch (error) {
    logger.error('[SubscriptionService] Excepción renovando suscripción:', error);
    throw error;
  }
}






















