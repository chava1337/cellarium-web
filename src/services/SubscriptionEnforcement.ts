/**
 * Servicio de enforcement de suscripciones (frontend)
 * 
 * NOTA: Este servicio solo valida en el frontend. El enforcement real debe
 * implementarse en el backend mediante:
 * - RLS (Row Level Security) policies en Supabase
 * - Triggers que validen límites antes de INSERT/UPDATE
 * - RPC functions que encapsulen lógica de creación con validación
 * 
 * Este archivo prepara la estructura para integración futura con backend.
 */

import { User } from '../types';
import { FeatureId } from '../constants/subscriptionFeatures';
import { checkSubscriptionFeature, checkSubscriptionLimit } from '../utils/subscriptionPermissions';

export type SubscriptionAction = 'create_wine' | 'create_branch' | 'invite_manager' | 'access_feature';

export interface ActionResult {
  allowed: boolean;
  reasonKey?: string; // Key de i18n para el mensaje de error
  featureId?: FeatureId; // Feature ID relacionado si aplica
}

/**
 * Verifica si una acción está permitida para el usuario según su suscripción
 * 
 * @param user - Usuario actual
 * @param action - Acción a verificar
 * @param context - Contexto adicional (ej: currentCount para límites)
 * @returns Resultado con allowed y reasonKey si está bloqueado
 */
export function isActionAllowedForUser(
  user: User | null,
  action: SubscriptionAction,
  context?: {
    currentWineCount?: number;
    currentBranchCount?: number;
    currentManagerCount?: number;
    featureId?: FeatureId;
  }
): ActionResult {
  if (!user) {
    return {
      allowed: false,
      reasonKey: 'subscription.auth_required',
    };
  }

  // Solo owners tienen límites de suscripción
  if (user.role !== 'owner') {
    return { allowed: true };
  }

  // Verificar feature gating
  if (action === 'access_feature' && context?.featureId) {
    const allowed = checkSubscriptionFeature(user, context.featureId);
    if (!allowed) {
      return {
        allowed: false,
        reasonKey: 'subscription.feature_blocked',
        featureId: context.featureId,
      };
    }
    return { allowed: true };
  }

  // Verificar límites numéricos
  if (action === 'create_wine' && context?.currentWineCount !== undefined) {
    const allowed = checkSubscriptionLimit(user, 'wines', context.currentWineCount);
    if (!allowed) {
      return {
        allowed: false,
        reasonKey: 'subscription.wine_limit_reached',
      };
    }
    return { allowed: true };
  }

  if (action === 'create_branch' && context?.currentBranchCount !== undefined) {
    const allowed = checkSubscriptionLimit(user, 'branches', context.currentBranchCount);
    if (!allowed) {
      return {
        allowed: false,
        reasonKey: 'subscription.branch_limit_reached',
      };
    }
    return { allowed: true };
  }

  if (action === 'invite_manager' && context?.currentManagerCount !== undefined) {
    const allowed = checkSubscriptionLimit(user, 'managers', context.currentManagerCount);
    if (!allowed) {
      return {
        allowed: false,
        reasonKey: 'subscription.manager_limit_reached',
      };
    }
    return { allowed: true };
  }

  // Por defecto, permitir (si no hay validación específica)
  return { allowed: true };
}

/**
 * Assert helper que lanza error si la acción no está permitida
 * Útil para usar en guards antes de operaciones críticas
 * 
 * @throws Error con reasonKey si la acción no está permitida
 */
export function assertActionAllowed(
  user: User | null,
  action: SubscriptionAction,
  context?: {
    currentWineCount?: number;
    currentBranchCount?: number;
    currentManagerCount?: number;
    featureId?: FeatureId;
  }
): void {
  const result = isActionAllowedForUser(user, action, context);
  if (!result.allowed) {
    // TODO: DB ENFORCEMENT REQUIRED
    // Este error solo se lanza en frontend. El backend debe implementar
    // RLS policies y triggers para prevenir estas acciones incluso si
    // el frontend es bypasseado.
    throw new Error(result.reasonKey || 'subscription.action_blocked');
  }
}





