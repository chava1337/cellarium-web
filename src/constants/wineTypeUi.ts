export type WineType = 'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified';

// Subconjunto aprobado de nombres de Ionicons que Cellarium usa para vino.
// Todos existen en Ionicons (ver union de tipos en Ionicons.d.ts).
export type CellariumIoniconName =
  | 'wine'
  | 'wine-outline'
  | 'rose'
  | 'sparkles'
  | 'sparkles-outline'
  | 'ice-cream'
  | 'cafe'
  | 'sunny'
  | 'flame'
  | 'flower'
  | 'heart'
  | 'shield'
  | 'shield-checkmark'
  | 'shield-half'
  | 'grid'
  | 'text'
  | 'text-outline'
  | 'cube';

export type WineTypeUiConfig = {
  /**
   * Clave de traducción que se usará con `t(labelKey)`
   * por ejemplo: 'catalog.red'
   */
  labelKey: string;
  /**
   * Familia de iconos de @expo/vector-icons.
   * Se deja abierta por si en el futuro se mezclan familias,
   * aunque hoy solo usamos 'Ionicons'.
   */
  iconFamily: 'Ionicons';
  /**
   * Nombre concreto del icono en la familia elegida.
   * No tipamos contra glyphMap para evitar acoplar este módulo
   * a la implementación interna de la librería.
   */
  iconName: CellariumIoniconName;
  /**
   * Color sugerido para el icono en la UI (por ejemplo, para el icono principal).
   * Opcional: los contenedores pueden sobreescribirlo.
   */
  accentColor: string;
  /**
   * Gradiente opcional para chips o fondos, si se quiere aplicar
   * un estilo más rico por tipo de vino.
   */
  chipGradient?: {
    start: string;
    end: string;
  };
};

export const WINE_TYPES: readonly WineType[] = [
  'red',
  'white',
  'rose',
  'sparkling',
  'dessert',
  'fortified',
] as const;

export const WINE_TYPE_UI_MAP: Record<WineType, WineTypeUiConfig> = {
  red: {
    labelKey: 'catalog.red',
    iconFamily: 'Ionicons',
    iconName: 'wine',
    accentColor: '#8B0000',
    chipGradient: {
      start: '#7F1D1D',
      end: '#B91C1C',
    },
  },
  white: {
    labelKey: 'catalog.white',
    iconFamily: 'Ionicons',
    iconName: 'wine-outline',
    accentColor: '#FACC15',
    chipGradient: {
      start: '#FCD34D',
      end: '#FBBF24',
    },
  },
  rose: {
    labelKey: 'catalog.rose',
    iconFamily: 'Ionicons',
    iconName: 'rose',
    accentColor: '#EC4899',
    chipGradient: {
      start: '#DB2777',
      end: '#F973A0',
    },
  },
  sparkling: {
    labelKey: 'catalog.sparkling',
    iconFamily: 'Ionicons',
    iconName: 'sparkles',
    accentColor: '#22C55E',
    chipGradient: {
      start: '#16A34A',
      end: '#4ADE80',
    },
  },
  dessert: {
    labelKey: 'catalog.dessert',
    iconFamily: 'Ionicons',
    iconName: 'ice-cream',
    accentColor: '#F97316',
    chipGradient: {
      start: '#EA580C',
      end: '#FDBA74',
    },
  },
  fortified: {
    labelKey: 'catalog.fortified',
    iconFamily: 'Ionicons',
    iconName: 'shield',
    accentColor: '#6B21A8',
    chipGradient: {
      start: '#5B21B6',
      end: '#A855F7',
    },
  },
};

