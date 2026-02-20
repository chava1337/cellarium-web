/**
 * Feature IDs estables para sistema de suscripciones
 * Estos IDs son independientes de textos visibles al usuario
 * y se usan para gating y enforcement en backend (RLS/triggers)
 */

export type FeatureId =
  | 'inventory' // Inventario y Análisis
  | 'tastings' // Catas y Degustaciones
  | 'branches_additional' // Gestión de Sucursales adicionales
  | 'reports_basic' // Reportes básicos
  | 'reports_full' // Reportes completos
  | 'exports' // Exportación de datos
  | 'branding_powered_by_cellarium'; // Branding "Powered by Cellarium" (plan free)

/**
 * Metadata de features para i18n
 * Las keys deben existir en LanguageContext.tsx
 */
export const FEATURE_META: Record<FeatureId, { titleKey: string; descriptionKey?: string }> = {
  inventory: {
    titleKey: 'features.inventory',
    descriptionKey: 'features.inventory_desc',
  },
  tastings: {
    titleKey: 'features.tastings',
    descriptionKey: 'features.tastings_desc',
  },
  branches_additional: {
    titleKey: 'features.branches_additional',
    descriptionKey: 'features.branches_additional_desc',
  },
  reports_basic: {
    titleKey: 'features.reports_basic',
    descriptionKey: 'features.reports_basic_desc',
  },
  reports_full: {
    titleKey: 'features.reports_full',
    descriptionKey: 'features.reports_full_desc',
  },
  exports: {
    titleKey: 'features.exports',
    descriptionKey: 'features.exports_desc',
  },
  branding_powered_by_cellarium: {
    titleKey: 'features.branding_powered_by',
    descriptionKey: 'features.branding_powered_by_desc',
  },
};

/**
 * Verifica si un FeatureId es válido
 */
export function isValidFeatureId(id: string): id is FeatureId {
  return id in FEATURE_META;
}





