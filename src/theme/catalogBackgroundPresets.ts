import type { ImageSourcePropType } from 'react-native';

export type CatalogBackgroundPreset = {
  id: string;
  type: 'solid' | 'gradient' | 'image';
  backgroundColor?: string;
  gradientColors?: string[];
  /** Solo type === 'image': asset local (require). */
  imageSource?: ImageSourcePropType;
  /** Capa semitransparente sobre la imagen para legibilidad. */
  overlayColor?: string;
  /** Color trasero (SafeAreaView / letterboxing) y fallback si la imagen falla. */
  fallbackColor?: string;
};

export const CATALOG_BACKGROUND_PRESETS: Record<string, CatalogBackgroundPreset> = {
  default: {
    id: 'default',
    type: 'solid',
    backgroundColor: '#f8f9fa',
  },
  wine_soft: {
    id: 'wine_soft',
    type: 'solid',
    backgroundColor: '#E8D8DB',
  },
  dark_luxe: {
    id: 'dark_luxe',
    type: 'solid',
    backgroundColor: '#1E1E1E',
  },
  champagne: {
    id: 'champagne',
    type: 'solid',
    backgroundColor: '#F6F1E8',
  },
  cave_luxe: {
    id: 'cave_luxe',
    type: 'image',
    imageSource: require('../../assets/images/catalog-backgrounds/cave-luxe.jpg'),
    overlayColor: 'rgba(20, 18, 16, 0.55)',
    fallbackColor: '#2A2324',
  },
  vineyard_soft: {
    id: 'vineyard_soft',
    type: 'image',
    imageSource: require('../../assets/images/catalog-backgrounds/vineyard-soft.jpg'),
    overlayColor: 'rgba(255, 255, 255, 0.45)',
    fallbackColor: '#3E4A38',
  },
  barrel_cellar: {
    id: 'barrel_cellar',
    type: 'image',
    imageSource: require('../../assets/images/catalog-backgrounds/barrel-cellar.jpg'),
    overlayColor: 'rgba(40, 30, 20, 0.50)',
    fallbackColor: '#3D3028',
  },
};

const CATALOG_BACKGROUND_PRESET_IDS: ReadonlySet<string> = new Set([
  'default',
  'wine_soft',
  'champagne',
  'dark_luxe',
  'cave_luxe',
  'vineyard_soft',
  'barrel_cellar',
]);

export function isCatalogBackgroundPresetId(id: string): boolean {
  return typeof id === 'string' && CATALOG_BACKGROUND_PRESET_IDS.has(id);
}

/** Valores alineados con CHECK en public.branches.catalog_background_preset_id */
export function normalizeCatalogBackgroundPresetId(id: string | null | undefined): string {
  if (id != null && isCatalogBackgroundPresetId(id)) return id;
  return 'default';
}

export const getCatalogBackground = (presetId: string): CatalogBackgroundPreset => {
  return CATALOG_BACKGROUND_PRESETS[presetId] || CATALOG_BACKGROUND_PRESETS.default;
};

/** Color para SafeAreaView y superficies donde no dibujamos la imagen (p. ej. pending approval). */
export function getCatalogSurfaceFallbackColor(preset: CatalogBackgroundPreset): string {
  if (preset.type === 'image') {
    return preset.fallbackColor ?? preset.backgroundColor ?? '#f8f9fa';
  }
  if (preset.type === 'gradient') {
    return preset.gradientColors?.[0] ?? preset.backgroundColor ?? '#f8f9fa';
  }
  return preset.backgroundColor ?? '#f8f9fa';
}

export function catalogBackgroundUsesImage(
  preset: CatalogBackgroundPreset
): preset is CatalogBackgroundPreset & { type: 'image'; imageSource: ImageSourcePropType } {
  return preset.type === 'image' && preset.imageSource != null;
}

/** Lista ordenada para selector de fondo (claves i18n catalog.background.*) */
export type CatalogBackgroundPresetOption = {
  id: string;
  labelKey: string;
};

export const CATALOG_BACKGROUND_PRESET_OPTIONS: CatalogBackgroundPresetOption[] = [
  { id: 'default', labelKey: 'catalog.background.default' },
  { id: 'wine_soft', labelKey: 'catalog.background.wine_soft' },
  { id: 'champagne', labelKey: 'catalog.background.champagne' },
  { id: 'dark_luxe', labelKey: 'catalog.background.dark_luxe' },
  { id: 'cave_luxe', labelKey: 'catalog.background.cave_luxe' },
  { id: 'vineyard_soft', labelKey: 'catalog.background.vineyard_soft' },
  { id: 'barrel_cellar', labelKey: 'catalog.background.barrel_cellar' },
];
