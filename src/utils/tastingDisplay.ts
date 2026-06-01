/** Mapeo valores almacenados (es) → clave i18n para UI pt-BR/en sin migrar BD. */
const AROMA_STORED: Record<string, string> = {
  Frutales: 'tasting.aroma_fruity',
  Florales: 'tasting.aroma_floral',
  Vegetales: 'tasting.aroma_vegetal',
  Balsámicos: 'tasting.aroma_balsamic',
  'Tostados o especiados': 'tasting.aroma_toasted_spiced',
  Minerales: 'tasting.aroma_mineral',
};

const OPTION_KEYS: Record<string, string> = {
  fuertes: 'tasting.intensity_strong',
  sutiles: 'tasting.intensity_subtle',
  agradables: 'tasting.quality_pleasant',
  desagradables: 'tasting.quality_unpleasant',
  varios_mezclados: 'tasting.complexity_mixed',
  uno_destacado: 'tasting.complexity_single',
  suave: 'tasting.impact_soft',
  vibrante: 'tasting.impact_vibrant',
  dulce: 'tasting.impact_sweet',
  ácido: 'tasting.impact_acidic',
  cálido: 'tasting.impact_warm',
  otra: 'tasting.impact_other',
  madera: 'tasting.flavor_wood',
  especias: 'tasting.flavor_spices',
  flores: 'tasting.flavor_flowers',
  minerales: 'tasting.flavor_minerals',
  'frutos rojos': 'tasting.flavor_red_fruit',
  citricos: 'tasting.flavor_citrus',
  otro: 'tasting.flavor_other',
  ligero: 'tasting.body_light',
  medio: 'tasting.body_medium',
  robusto: 'tasting.body_full',
  baja: 'tasting.persistence_low',
  media: 'tasting.persistence_medium',
  alta: 'tasting.persistence_high',
};

export function tastingDisplayValue(t: (key: string) => string, stored: string | undefined | null): string {
  if (!stored) return '';
  const key = AROMA_STORED[stored] ?? OPTION_KEYS[stored.toLowerCase()] ?? OPTION_KEYS[stored];
  return key ? t(key) : stored;
}

export const TASTING_AROMA_OPTIONS = [
  { store: 'Frutales', labelKey: 'tasting.aroma_fruity' },
  { store: 'Florales', labelKey: 'tasting.aroma_floral' },
  { store: 'Vegetales', labelKey: 'tasting.aroma_vegetal' },
  { store: 'Balsámicos', labelKey: 'tasting.aroma_balsamic' },
  { store: 'Tostados o especiados', labelKey: 'tasting.aroma_toasted_spiced' },
  { store: 'Minerales', labelKey: 'tasting.aroma_mineral' },
] as const;

export const TASTING_FIRST_IMPACT_OPTIONS = [
  { store: 'suave', labelKey: 'tasting.impact_soft' },
  { store: 'vibrante', labelKey: 'tasting.impact_vibrant' },
  { store: 'dulce', labelKey: 'tasting.impact_sweet' },
  { store: 'ácido', labelKey: 'tasting.impact_acidic' },
  { store: 'cálido', labelKey: 'tasting.impact_warm' },
  { store: 'otra', labelKey: 'tasting.impact_other' },
] as const;

export const TASTING_FLAVOR_OPTIONS = [
  { store: 'madera', labelKey: 'tasting.flavor_wood' },
  { store: 'especias', labelKey: 'tasting.flavor_spices' },
  { store: 'flores', labelKey: 'tasting.flavor_flowers' },
  { store: 'minerales', labelKey: 'tasting.flavor_minerals' },
  { store: 'frutos rojos', labelKey: 'tasting.flavor_red_fruit' },
  { store: 'citricos', labelKey: 'tasting.flavor_citrus' },
  { store: 'otro', labelKey: 'tasting.flavor_other' },
] as const;
