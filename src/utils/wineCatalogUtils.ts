/**
 * Utilidades puras para el catálogo de vinos
 * Funciones helper que no dependen de estado o hooks de React
 */

/**
 * Valida si un valor es un precio válido (número finito > 0)
 */
export const isValidPrice = (v: unknown): v is number => {
  const n = v != null ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0;
};

/**
 * Convierte un valor a un precio válido o undefined
 */
export const toValidPrice = (v: unknown): number | undefined => {
  return isValidPrice(v) ? Number(v) : undefined;
};

/**
 * Parsea precios/cantidades numéricas desde el API (Postgres numeric a veces llega como string en JSON).
 */
export function parseNullablePositiveNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    let t = v.trim().replace(/\s/g, '');
    if (t.includes(',') && !t.includes('.')) {
      t = t.replace(',', '.');
    } else {
      t = t.replace(/,/g, '');
    }
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Formatea un número como moneda MXN (ej. $1,234.56).
 * Usa Intl.NumberFormat cuando existe; si no, fallback a toFixed(2).
 */
export function formatCurrencyMXN(value: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  try {
    if (typeof Intl !== 'undefined' && Intl.NumberFormat) {
      return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    }
  } catch (_) {}
  return `$${value.toFixed(2)}`;
}

/**
 * Divide un array en chunks de tamaño máximo para evitar límites de query.
 * 
 * @param array - Array a dividir
 * @param chunkSize - Tamaño máximo de cada chunk (default: 100)
 * @returns Array de chunks
 */
export const chunkArray = <T,>(array: T[], chunkSize: number = 100): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
};

/**
 * Helper para convertir valores sensoriales a escala 1-5
 * Acepta number | string (strings como "13", "70", "70.5", "70,5", " 70 % ")
 * Si num > 5, trata como escala 0-100 y convierte: num / 20
 * Luego clamp a rango 1..5 y redondear a entero
 */
export const toLevel1to5 = (v: unknown): number | undefined => {
  if (v == null) return undefined;
  
  // Extraer número: acepta string con coma o punto, espacios, porcentajes
  let num: number;
  if (typeof v === 'number') {
    num = v;
  } else if (typeof v === 'string') {
    // Normalizar coma a punto y extraer número
    const normalized = v.replace(',', '.').trim();
    const match = normalized.match(/[\d.]+/);
    if (!match) return undefined;
    num = parseFloat(match[0]);
  } else if (typeof v === 'object' && v !== null) {
    // Soporta objetos como { value: 70 } o { score: 4 }
    const obj = v as any;
    const value = obj.value ?? obj.score ?? obj.level ?? obj.num;
    if (value == null) return undefined;
    num = typeof value === 'number' ? value : parseFloat(String(value));
  } else {
    return undefined;
  }
  
  // Si no es finito o NaN, retornar undefined (0 es válido: seco/dry)
  if (!Number.isFinite(num) || isNaN(num)) return undefined;
  if (num < 0) return undefined;

  // Escala 0-100 → 1-5: todo valor > 5 se considera 0-100 y se convierte con /20
  // (antes 5 < num <= 10 se convertía con /2, haciendo p.ej. sweetness 10 → 5 en vez de 1)
  if (num > 5) {
    num = num / 20;
  }

  // Clamp a rango 1..5 y redondear a entero
  const clamped = Math.max(1, Math.min(5, num));
  return Math.round(clamped);
};

/**
 * Opciones de logging para extractTasteLevelsFromCanonical
 */
export interface TasteExtractionLogOptions {
  debug?: boolean;
  debugTasteKeys?: boolean;
  log?: (...args: any[]) => void;
}

/**
 * Extrae niveles sensoriales de taste_profile (jsonb) de forma robusta
 * Respetando el tipo de vino para no inventar métricas no aplicables
 * 
 * @param canonicalTasteProfile - taste_profile desde wines_canonical (objeto parseado)
 * @param wineType - Tipo de vino: 'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified'
 * @param logOptions - Opciones opcionales de logging (si no se proporciona, no loguea nada)
 * @returns Objeto con niveles extraídos (1..5) según tipo de vino
 */
export const extractTasteLevelsFromCanonical = (
  canonicalTasteProfile: any,
  wineType?: 'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified',
  logOptions?: TasteExtractionLogOptions
): {
  body_level?: number;
  sweetness_level?: number;
  acidity_level?: number;
  intensity_level?: number;
  fizziness_level?: number;
} => {
  const result: {
    body_level?: number;
    sweetness_level?: number;
    acidity_level?: number;
    intensity_level?: number;
    fizziness_level?: number;
  } = {};

  // Si viene vacío {} o null, retornar objeto vacío
  if (!canonicalTasteProfile || typeof canonicalTasteProfile !== 'object' || Object.keys(canonicalTasteProfile).length === 0) {
    return result;
  }

  const tp = canonicalTasteProfile;

  // Debug opcional: loguear keys encontradas si no se pudo extraer nada y el objeto no estaba vacío
  if (logOptions?.debug && logOptions?.debugTasteKeys && logOptions?.log) {
    const allKeys = Object.keys(tp);
    const knownKeys = ['body', 'structure', 'sweetness', 'sugar', 'acidity', 'freshness', 'tannin', 'tannins', 'intensity', 'power', 'fizziness', 'bubbles', 'sparkle', 'carbonation'];
    const unknownKeys = allKeys.filter(k => !knownKeys.includes(k));
    if (unknownKeys.length > 0) {
      // Solo loguear 1 vez por sesión usando un Set global
      if (!(global as any).__tasteKeysLogged) {
        (global as any).__tasteKeysLogged = new Set<string>();
      }
      const keyStr = unknownKeys.join(', ');
      if (!(global as any).__tasteKeysLogged.has(keyStr)) {
        (global as any).__tasteKeysLogged.add(keyStr);
        logOptions.log('🔍 Nuevas claves en taste_profile no reconocidas:', unknownKeys);
      }
    }
  }

  // Helper para extraer valor con múltiples claves posibles
  const extractValue = (keys: string[]): unknown => {
    for (const key of keys) {
      if (tp[key] != null) {
        return tp[key];
      }
    }
    return undefined;
  };

  // Extraer body_level (body, structure)
  const bodyValue = extractValue(['body', 'structure']);
  if (bodyValue != null) {
    const level = toLevel1to5(bodyValue);
    if (level !== undefined) {
      result.body_level = level;
    }
  }

  // Extraer sweetness_level (sweetness, sugar)
  const sweetnessValue = extractValue(['sweetness', 'sugar']);
  if (sweetnessValue != null) {
    const level = toLevel1to5(sweetnessValue);
    if (level !== undefined) {
      result.sweetness_level = level;
    }
  }

  // Extraer acidity_level (acidity, freshness)
  const acidityValue = extractValue(['acidity', 'freshness']);
  if (acidityValue != null) {
    const level = toLevel1to5(acidityValue);
    if (level !== undefined) {
      result.acidity_level = level;
    }
  }

  // Extraer intensity_level (tannin, tannins, intensity, power) - solo para red/rose
  if (wineType === 'red' || wineType === 'rose') {
    const intensityValue = extractValue(['tannin', 'tannins', 'intensity', 'power']);
    if (intensityValue != null) {
      const level = toLevel1to5(intensityValue);
      if (level !== undefined) {
        result.intensity_level = level;
      }
    }
  }

  // Extraer fizziness_level (fizziness, bubbles, sparkle, carbonation) - solo para sparkling
  if (wineType === 'sparkling') {
    const fizzinessValue = extractValue(['fizziness', 'bubbles', 'sparkle', 'carbonation']);
    if (fizzinessValue != null) {
      const level = toLevel1to5(fizzinessValue);
      if (level !== undefined) {
        result.fizziness_level = level;
      }
    }
  }

  return result;
};

/**
 * Tipo para actualizaciones de vino
 */
export type WineUpdates = {
  alcohol_content?: number;
  grape_variety?: string;
  body_level?: number;
  sweetness_level?: number;
  acidity_level?: number;
  intensity_level?: number;
  fizziness_level?: number;
};

/**
 * Normaliza los datos de un vino desde datos canónicos.
 * Extrae y procesa taste_profile, alcohol_content, grape_variety y niveles sensoriales.
 * 
 * @param stock - Objeto stock con datos del vino
 * @param canonicalData - Datos canónicos obtenidos de wines_canonical
 * @param extractTasteLevelsFn - Función para extraer niveles sensoriales (por defecto usa extractTasteLevelsFromCanonical)
 * @returns Objeto con actualizaciones a aplicar y taste_profile parseado
 */
export const normalizeWineFromCanonical = (
  stock: any,
  canonicalData: any,
  extractTasteLevelsFn: (
    canonicalTasteProfile: any,
    wineType?: 'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified',
    logOptions?: TasteExtractionLogOptions
  ) => {
    body_level?: number;
    sweetness_level?: number;
    acidity_level?: number;
    intensity_level?: number;
    fizziness_level?: number;
  } = extractTasteLevelsFromCanonical
): { 
  updatesToSave: WineUpdates;
  tasteProfile: any;
} => {
  // Helper para verificar si un nivel está vacío (solo null o undefined, NO 0)
  const isEmptyLevel = (v: unknown) => v == null;
  
  const updatesToSave: WineUpdates = {};

  // Extraer y parsear taste_profile
  let tasteProfile: any = null;
  if (canonicalData.taste_profile) {
    if (typeof canonicalData.taste_profile === 'object' && canonicalData.taste_profile !== null) {
      tasteProfile = canonicalData.taste_profile;
    } else if (typeof canonicalData.taste_profile === 'string') {
      try {
        tasteProfile = JSON.parse(canonicalData.taste_profile);
      } catch (e) {
        // Silencioso: no loguear errores de parse
      }
    }
  }

  // Normalizar alcohol_content
  // Solo setear si es null o undefined, no sobrescribir valores válidos (incluyendo 0)
  if (stock.wines.alcohol_content == null && canonicalData.abv != null) {
    stock.wines.alcohol_content = canonicalData.abv;
    updatesToSave.alcohol_content = canonicalData.abv;
  }

  // Normalizar grape_variety
  if ((!stock.wines.grape_variety || (typeof stock.wines.grape_variety === 'string' && !stock.wines.grape_variety.trim())) && canonicalData.grapes) {
    let grapesValue = '';
    if (Array.isArray(canonicalData.grapes)) {
      grapesValue = canonicalData.grapes.filter((g: string) => g && g.trim()).join(', ');
    } else if (typeof canonicalData.grapes === 'string') {
      grapesValue = canonicalData.grapes.trim();
    }
    if (grapesValue) {
      stock.wines.grape_variety = grapesValue;
      updatesToSave.grape_variety = grapesValue;
    }
  }

  // Normalizar niveles sensoriales desde taste_profile usando helper robusto
  // Respetar tipo de vino para no inventar métricas no aplicables
  // Solo asignar si el campo en stock.wines está vacío/undefined/null (usando isEmptyLevel)
  // No sobrescribir valores existentes (incluyendo 0)
  if (tasteProfile) {
    const wineType = stock.wines.type as 'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified' | undefined;
    // Nota: extractTasteLevelsFn se llama sin logOptions aquí, ya que el logging se maneja en el componente
    const extractedLevels = extractTasteLevelsFn(tasteProfile, wineType);

    // Aplicar niveles extraídos solo si el campo está vacío y el valor es válido
    if (extractedLevels.body_level !== undefined && isEmptyLevel(stock.wines.body_level)) {
      stock.wines.body_level = extractedLevels.body_level;
      updatesToSave.body_level = extractedLevels.body_level;
    }

    // sweetness_level: permitir para white, dessert, fortified, red, rose
    // NO para sparkling (aunque puede venir en canonical, no lo usamos)
    if (extractedLevels.sweetness_level !== undefined && isEmptyLevel(stock.wines.sweetness_level)) {
      if (wineType !== 'sparkling') {
        stock.wines.sweetness_level = extractedLevels.sweetness_level;
        updatesToSave.sweetness_level = extractedLevels.sweetness_level;
      }
    }

    // acidity_level: permitir para todos los tipos
    if (extractedLevels.acidity_level !== undefined && isEmptyLevel(stock.wines.acidity_level)) {
      stock.wines.acidity_level = extractedLevels.acidity_level;
      updatesToSave.acidity_level = extractedLevels.acidity_level;
    }

    // intensity_level: solo para red y rose (desde tannin/intensity)
    // NO para sparkling, white, dessert, fortified
    if (extractedLevels.intensity_level !== undefined && isEmptyLevel(stock.wines.intensity_level)) {
      if (wineType === 'red' || wineType === 'rose') {
        stock.wines.intensity_level = extractedLevels.intensity_level;
        updatesToSave.intensity_level = extractedLevels.intensity_level;
      }
    }

    // fizziness_level: solo para sparkling
    // NO para otros tipos (aunque venga en canonical, no lo usamos)
    if (extractedLevels.fizziness_level !== undefined && isEmptyLevel(stock.wines.fizziness_level)) {
      if (wineType === 'sparkling') {
        stock.wines.fizziness_level = extractedLevels.fizziness_level;
        updatesToSave.fizziness_level = extractedLevels.fizziness_level;
      }
    }
  }

  return { updatesToSave, tasteProfile };
};




