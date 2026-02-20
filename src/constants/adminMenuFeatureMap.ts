/**
 * Mapeo de menuItem.id (AdminDashboard) a FeatureId estable
 * Esto permite que el menú use IDs descriptivos mientras el gating usa Feature IDs estables
 */

import { FeatureId } from './subscriptionFeatures';

/**
 * Mapea un menuItem.id del AdminDashboard a su FeatureId correspondiente
 * Si el item no requiere suscripción o no tiene FeatureId, retorna null
 */
export function mapMenuItemIdToFeatureId(menuItemId: string): FeatureId | null {
  const mapping: Record<string, FeatureId | null> = {
    'inventory': 'inventory',
    'tasting-exams': 'tastings',
    'branches': 'branches_additional',
    // Items que no requieren suscripción (siempre disponibles)
    'global-catalog': null,
    'cocktail-menu': null,
    'wines': null,
    'qr': null,
    'users': null,
    'subscriptions': null,
    'settings': null,
  };

  return mapping[menuItemId] ?? null;
}





