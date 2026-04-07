/**
 * Servicio para conectar con base de datos global de vinos
 * Accede a la tabla wines_canonical en Supabase
 */

import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';

/** Solo logs de diagnóstico en __DEV__ (vino reportado como invisible en browse). */
const DEBUG_GLOBAL_CATALOG_WINE_ID = 'd0b9e697-1ae3-4311-8287-1d6efc715360';

function globalCatalogAudit(step: string, payload: Record<string, unknown>) {
  if (!__DEV__) return;
  console.log(`[GlobalCatalogAudit] ${step}`, payload);
}

type BrowseColorTab = 'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified';

function escapeIlikeTerm(value: string): string {
  return value.replace(/[%(),]/g, ' ').trim();
}

/** Valor literal para filtros PostgREST `eq` (comillas si hace falta). */
function postgrestEqAtom(value: string): string {
  if (/^[a-z0-9_-]+$/i.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

const BROWSE_COLOR_TAB_ALIASES: Record<string, BrowseColorTab> = {
  red: 'red',
  tinto: 'red',
  white: 'white',
  blanco: 'white',
  rose: 'rose',
  rosé: 'rose',
  rosado: 'rose',
  sparkling: 'sparkling',
  espumoso: 'sparkling',
  dessert: 'dessert',
  postre: 'dessert',
  fortified: 'fortified',
  fortificado: 'fortified',
};

const BROWSE_COLOR_SQL_TERMS: Record<BrowseColorTab, { en: string[]; es: string[] }> = {
  red: { en: ['red'], es: ['tinto'] },
  white: { en: ['white'], es: ['blanco'] },
  rose: { en: ['rose', 'rosé'], es: ['rosado'] },
  sparkling: { en: ['sparkling'], es: ['espumoso'] },
  dessert: { en: ['dessert'], es: ['postre'] },
  fortified: { en: ['fortified'], es: ['fortificado'] },
};

/** Filtro PostgREST `.or(...)` con `eq` exacto sobre `wines_canonical_browse.color_en` / `color_es`. */
function buildBrowseColorOrFilter(colors: readonly unknown[]): string | null {
  const tabs = new Set<BrowseColorTab>();
  for (const c of colors) {
    if (typeof c !== 'string') continue;
    const key = BROWSE_COLOR_TAB_ALIASES[c.trim().toLowerCase()];
    if (key) tabs.add(key);
  }
  if (tabs.size === 0) return null;
  const parts: string[] = [];
  for (const tab of tabs) {
    const { en, es } = BROWSE_COLOR_SQL_TERMS[tab];
    for (const term of en) {
      parts.push(`color_en.eq.${postgrestEqAtom(term)}`);
    }
    for (const term of es) {
      parts.push(`color_es.eq.${postgrestEqAtom(term)}`);
    }
  }
  return parts.join(',');
}

/**
 * Si `color` llegó como texto JSON (columna jsonb mal tipada o serialización), parsear.
 */
function parseMaybeJsonColorField(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const t = raw.trim();
  if (t.startsWith('{') && t.endsWith('}')) {
    try {
      return JSON.parse(t);
    } catch {
      return raw;
    }
  }
  return raw;
}

/**
 * Concatena todos los valores string legibles del campo color/type (cualquier clave del objeto, p. ej. en + es).
 * Evita depender solo de `(en || es)` cuando el filtro de pestaña usa códigos en inglés (`red`) y el vino solo trae `tinto` en ES.
 */
export function wineColorSearchHaystack(colorField: unknown): string {
  const raw = parseMaybeJsonColorField(colorField);
  const parts: string[] = [];
  if (raw == null || raw === '') return '';
  if (typeof raw === 'string') {
    parts.push(raw);
  } else if (Array.isArray(raw)) {
    for (const x of raw) {
      if (typeof x === 'string') parts.push(x);
    }
  } else if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    for (const v of Object.values(o)) {
      if (typeof v === 'string') parts.push(v);
    }
  }
  return parts.join(' ').toLowerCase();
}

/**
 * Filtro de pestañas Tintos/Blancos/… (keys: red | white | rose | sparkling | dessert | fortified).
 * Incluye sinónimos ES/EN para alinear con datos bilingües en `wines_canonical.color`.
 */
export function wineMatchesColorTab(colorField: unknown, tabKey: string): boolean {
  const hay = wineColorSearchHaystack(colorField);
  if (!hay) return false;
  const f = tabKey.toLowerCase();
  if (f === 'red') {
    return (
      hay.includes('red') ||
      hay.includes('tinto') ||
      hay.includes('tinta') ||
      hay.includes('rojo') ||
      hay.includes('rouge')
    );
  }
  if (f === 'white') {
    return hay.includes('white') || hay.includes('blanco') || hay.includes('blanc');
  }
  if (f === 'rose') {
    return hay.includes('rose') || hay.includes('rosé') || hay.includes('rosado');
  }
  if (f === 'sparkling') {
    return (
      hay.includes('sparkling') ||
      hay.includes('espumoso') ||
      hay.includes('champagne') ||
      hay.includes('cava')
    );
  }
  if (f === 'dessert') {
    return hay.includes('dessert') || hay.includes('postre') || hay.includes('dulce');
  }
  if (f === 'fortified') {
    return hay.includes('fortified') || hay.includes('fortificado') || hay.includes('generoso');
  }
  return hay.includes(f);
}

// Construir URL pública de imagen de vino
const SUPABASE_PROJECT_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

// Cache para imágenes ya buscadas (optimización)
const imageCache = new Map<string, string | undefined>();

/**
 * Tipo para valores bilingües (español/inglés)
 */
type BilingualValue = string | { en?: string; es?: string } | null | undefined;

/**
 * Helper para extraer el valor según el idioma preferido
 * @param value - Valor que puede ser string o objeto bilingüe {en: "...", es: "..."}
 * @param lang - Idioma preferido ('es' | 'en'), por defecto 'es'
 * @returns El valor en el idioma solicitado, o el disponible si no existe
 */
export function getBilingualValue(
  value: BilingualValue,
  lang: 'es' | 'en' = 'es'
): string | undefined {
  if (!value) return undefined;
  
  // Si es un string simple, retornarlo directamente (retrocompatibilidad)
  if (typeof value === 'string') {
    return value;
  }
  
  // Si es un objeto bilingüe
  if (typeof value === 'object' && value !== null) {
    // Intentar obtener el valor en el idioma preferido
    const preferred = value[lang];
    if (preferred) return preferred;
    
    // Fallback al otro idioma si no existe en el preferido
    const fallbackLang = lang === 'es' ? 'en' : 'es';
    const fallback = value[fallbackLang];
    if (fallback) return fallback;
    
    // Si no hay ningún valor, retornar undefined
    return undefined;
  }
  
  return undefined;
}

/**
 * Helper para mostrar país en formato bilingüe: "Español // English"
 * @param country - País que puede ser string o objeto bilingüe
 * @returns String con formato "Español // English" o solo el disponible
 */
export function getBilingualCountryDisplay(
  country: string | { en?: string; es?: string } | null | undefined
): string | undefined {
  if (!country) return undefined;
  
  // Si es un string simple, retornarlo directamente
  if (typeof country === 'string') {
    return country;
  }
  
  // Si es un objeto bilingüe
  if (typeof country === 'object' && country !== null) {
    const es = country.es;
    const en = country.en;
    
    // Si hay ambos idiomas, mostrar ambos
    if (es && en) {
      return `${es} // ${en}`;
    }
    
    // Si solo hay uno, mostrar ese
    if (es) return es;
    if (en) return en;
  }
  
  return undefined;
}

/**
 * Helper para extraer un array bilingüe
 * @param value - Valor que puede ser array, string o objeto bilingüe {en: [...], es: [...]}
 * @param lang - Idioma preferido ('es' | 'en'), por defecto 'es'
 * @returns Array de strings en el idioma solicitado
 */
export function getBilingualArray(
  value: string[] | string | { en?: string[]; es?: string[] } | null | undefined,
  lang: 'es' | 'en' = 'es'
): string[] {
  if (!value) return [];
  
  // Si es un array simple, retornarlo directamente
  if (Array.isArray(value)) {
    return value;
  }
  
  // Si es un string, convertirlo a array
  if (typeof value === 'string') {
    return [value];
  }
  
  // Si es un objeto bilingüe
  if (typeof value === 'object' && value !== null) {
    // Intentar obtener el array en el idioma preferido
    const preferred = value[lang];
    if (Array.isArray(preferred) && preferred.length > 0) {
      return preferred;
    }
    
    // Fallback al otro idioma si no existe en el preferido
    const fallbackLang = lang === 'es' ? 'en' : 'es';
    const fallback = value[fallbackLang];
    if (Array.isArray(fallback) && fallback.length > 0) {
      return fallback;
    }
  }
  
  return [];
}

export const publicImageUrl = (path?: string) => {
  if (!path) {
    logger.debug('[publicImageUrl] Path vacío');
    return undefined;
  }
  
  // Si ya es una URL completa, retornarla
  if (path.startsWith('http://') || path.startsWith('https://')) {
    logger.debug('[publicImageUrl] Ya es URL completa');
    return path;
  }
  
  // Limpiar el path
  let cleanPath = path.trim().replace(/^\/+/, '');
  
  // Usar getPublicUrl de Supabase
  try {
    const { data, error } = supabase.storage
      .from('wine-bottles')
      .getPublicUrl(cleanPath);
    
    if (error) {
      logger.error('[publicImageUrl] Error en getPublicUrl:', error);
    } else if (data?.publicUrl) {
      logger.debug('[publicImageUrl] URL obtenida:', data.publicUrl);
      return data.publicUrl;
    }
  } catch (error) {
    logger.error('[publicImageUrl] Excepción:', error);
  }
  
  // Fallback: construcción manual
  const cleanUrl = SUPABASE_PROJECT_URL.replace(/^https?:\/\//, '');
  const needsEncoding = /[^a-zA-Z0-9\/._-]/.test(cleanPath);
  const finalPath = needsEncoding 
    ? cleanPath.split('/').map(segment => encodeURIComponent(segment)).join('/')
    : cleanPath;
  
  return `https://${cleanUrl}/storage/v1/object/public/wine-bottles/${finalPath}`;
};

export interface GlobalWine {
  id: string;
  winery?: string | { en?: string; es?: string }; // Nombre de la bodega desde wines_canonical (bilingüe)
  label?: string | { en?: string; es?: string }; // Nombre del vino desde wines_canonical (bilingüe)
  country?: string | { en?: string; es?: string }; // País (bilingüe)
  region?: string | { en?: string; es?: string }; // Región (bilingüe)
  color?: string | { en?: string; es?: string } | string[]; // Color puede ser string, objeto bilingüe, o array JSONB
  vintage?: number;
  image_canonical_url?: string;
  // Campos adicionales para ficha completa
  grapes?: string[] | string;
  abv?: number;
  volume_ml?: number;
  closure?: string;
  style?: string | { en?: string; es?: string };
  appellation?: string | { en?: string; es?: string };
  flavors?: string[] | string | { en?: string[]; es?: string[] };
  // taste_profile puede venir como columna directa (JSONB) o dentro de tech_data/tasting_notes
  taste_profile?: {
    acidity?: number;
    alcohol?: number;
    body?: number;
    sweetness?: number;
    tannin?: number;
    fizziness?: number;
    bitterness?: number;
    fruitiness?: number;
    oak?: number;
  } | any;
  tasting_profile?: {
    acidity?: number;
    alcohol?: number;
    body?: number;
    sweetness?: number;
    tannin?: number;
    fizziness?: number;
    bitterness?: number;
    fruitiness?: number;
    oak?: number;
  };
  serving?: {
    pairing?: string[] | string | { en?: string[]; es?: string[] };
    temperature?: string;
  };
  tech_data?: {
    vinification?: string;
    production?: string;
    taste_profile?: {
      acidity?: number;
      body?: number;
      sweetness?: number;
      tannin?: number;
      fizziness?: number;
    };
  };
  tasting_notes?: {
    taste_profile?: {
      acidity?: number;
      body?: number;
      sweetness?: number;
      tannin?: number;
      fizziness?: number;
    };
  };
}

interface FetchWinesResult {
  data: GlobalWine[] | null;
  error: any;
  count: number | null;
}

/**
 * Obtiene lista de vinos del catálogo global con paginación y filtros
 */
export async function fetchGlobalWines({
  q = '',
  colors = [],
  from = 0,
  to = 19,
}: {
  q?: string;
  colors?: string[];
  from?: number;
  to?: number;
}): Promise<FetchWinesResult> {
  logger.log('[fetchGlobalWines] Búsqueda:', { q, colors, from, to });

  try {
    // ✅ PRE-FASE 3: Removido count: 'exact' para mejor performance (no necesario en scroll infinito)
    let query = supabase
      .from('wines_canonical')
      .select('id, winery, label, image_canonical_url, country, region, color, abv')
      .order('label', { ascending: true })
      .range(from, to);

    if (q) {
      query = query.or(`label.ilike.%${q}%,winery.ilike.%${q}%`);
      logger.debug('[fetchGlobalWines] Búsqueda:', q);
    }
    
    // Nota: No aplicamos el filtro de color aquí porque el campo puede ser JSONB
    // y Supabase tiene limitaciones con operadores JSONB en consultas complejas.
    // Filtraremos después de obtener los datos.

    const result = await query;
    
    logger.debug('[fetchGlobalWines] Resultado:', result.data?.length, 'vinos');

    if (result.error) {
      logger.error('[fetchGlobalWines] Error:', result.error.message);
      return result;
    }
    
    // Procesar imágenes en paralelo y filtrar por color si es necesario
    if (result.data) {
      let processedWines = await Promise.all(
        result.data.map(async (wine) => {
          let processedUrl = wine.image_canonical_url ? publicImageUrl(wine.image_canonical_url) : undefined;
          
          // Buscar por ID si no hay URL
          if (!processedUrl) {
            processedUrl = await findImageByWineId(wine.id);
          }
          
          return {
            ...wine,
            image_canonical_url: processedUrl,
          };
        })
      );
      logger.success('[fetchGlobalWines] URLs procesadas');
      
      // Filtrar por color/tipo si se especificó (sinónimos ES/EN + todas las claves del objeto i18n)
      if (colors.length > 0) {
        processedWines = processedWines.filter(
          (wine) => wine.color != null && colors.some((tab) => wineMatchesColorTab(wine.color, tab))
        );

        logger.debug('[fetchGlobalWines] Filtrado por color:', processedWines.length, 'vinos después del filtro');
      }
      
      result.data = processedWines;
      // ✅ PRE-FASE 3: count siempre null (no calculamos total exacto para mejor performance)
      result.count = null;
    }

    logger.success('[fetchGlobalWines] Completado');
    return result;
  } catch (error) {
    logger.error('[fetchGlobalWines] Excepción:', error instanceof Error ? error.message : error);
    return {
      data: null,
      error: error instanceof Error ? error : new Error(String(error)),
      count: null,
    };
  }
}

/**
 * Obtiene lista de vinos del catálogo global con paginación por keyset (cursor)
 * 
 * ✅ OPTIMIZADO: Usa keyset pagination en lugar de OFFSET para mejor performance
 * 
 * @param options - Opciones de paginación y filtros
 * @param options.q - Texto de búsqueda (opcional)
 * @param options.colors - Filtro por colores (opcional)
 * @param options.cursorId - ID del último vino de la página anterior (para paginación)
 * @param options.limit - Número de resultados por página (default: 20)
 * @returns Resultado con datos, cursor para siguiente página, y count total
 * 
 * @example
 * // Primera página
 * const firstPage = await listWinesKeyset({ limit: 20 });
 * 
 * // Siguiente página
 * const nextPage = await listWinesKeyset({ 
 *   cursorId: firstPage.nextCursor, 
 *   limit: 20 
 * });
 */
export async function listWinesKeyset({
  q = '',
  colors = [],
  cursorId = null,
  limit = 20,
}: {
  q?: string;
  colors?: string[];
  cursorId?: string | null;
  limit?: number;
}): Promise<{
  data: GlobalWine[] | null;
  error: any;
  count: number | null;
  nextCursor: string | null;
}> {
  logger.log('[listWinesKeyset] Búsqueda con keyset:', { q, colors, cursorId, limit });

  try {
    // ✅ PRE-FASE 3: Removido count: 'exact' para mejor performance (keyset no necesita total exacto)
    // Construir query base con orden por ID (más eficiente que label JSONB)
    let query = supabase
      .from('wines_canonical_browse')
      .select('id, winery, label, image_canonical_url, country, region, color, abv, color_en, color_es')
      .order('id', { ascending: true })
      .limit(limit + 1); // +1 para detectar si hay más páginas

    // Aplicar filtro de cursor (keyset pagination)
    if (cursorId) {
      query = query.gt('id', cursorId);
    }

    // Aplicar búsqueda de texto si existe
    const safeQ = escapeIlikeTerm(q);
    if (safeQ) {
      query = query.or(`label.ilike.%${safeQ}%,winery.ilike.%${safeQ}%`);
      logger.debug('[listWinesKeyset] Búsqueda:', q);
    }

    if (colors.length > 0) {
      const colorOr = buildBrowseColorOrFilter(colors);
      if (colorOr) {
        query = query.or(colorOr);
      }
    }

    const result = await query;

    if (result.error) {
      logger.error('[listWinesKeyset] Error:', result.error.message);
      return {
        data: null,
        error: result.error,
        count: null,
        nextCursor: null,
      };
    }

    let wines = result.data || [];
    let nextCursor: string | null = null;

    // Detectar si hay más páginas (si tenemos limit+1 resultados)
    if (wines.length > limit) {
      // El último elemento es el cursor para la siguiente página
      nextCursor = wines[limit].id;
      // Remover el elemento extra
      wines = wines.slice(0, limit);
    }

    // Procesar imágenes en paralelo
    if (wines.length > 0) {
      wines = await Promise.all(
        wines.map(async (wine) => {
          let processedUrl = wine.image_canonical_url ? publicImageUrl(wine.image_canonical_url) : undefined;

          if (!processedUrl) {
            processedUrl = await findImageByWineId(wine.id);
          }

          return {
            ...wine,
            image_canonical_url: processedUrl,
          };
        })
      );
      logger.success('[listWinesKeyset] URLs procesadas');
    }

    if (wines.some((w) => w.id === DEBUG_GLOBAL_CATALOG_WINE_ID) && colors.length === 0) {
      globalCatalogAudit('listWinesKeyset:batch_includes_target_no_color_filter', {
        q,
        colors,
        batchSize: wines.length,
        targetColorRaw: wines.find((w) => w.id === DEBUG_GLOBAL_CATALOG_WINE_ID)?.color ?? null,
      });
    }

    wines = wines.map((row) => {
      const { color_en: _en, color_es: _es, ...wine } = row as GlobalWine & {
        color_en?: string;
        color_es?: string;
      };
      return wine;
    });

    // ✅ PRE-FASE 3: hasMore basado en nextCursor (más eficiente que count exact)
    const hasMore = nextCursor !== null;
    logger.success('[listWinesKeyset] Completado', { winesCount: wines.length, hasMore, nextCursor });
    return {
      data: wines,
      error: null,
      count: null, // ✅ PRE-FASE 3: Siempre null (no calculamos total exacto)
      nextCursor,
    };
  } catch (error) {
    logger.error('[listWinesKeyset] Excepción:', error instanceof Error ? error.message : error);
    return {
      data: null,
      error: error instanceof Error ? error : new Error(String(error)),
      count: null,
      nextCursor: null,
    };
  }
}

/**
 * Obtiene detalle completo de un vino
 */
export async function fetchWineDetail(id: string) {
  try {
    // ✅ OPTIMIZADO: Selección explícita sin vector_embedding (columna pesada innecesaria para UI)
    // Usando solo columnas reales del esquema: id, winery, label, abv, color, country, region, grapes, serving, image_canonical_url, is_shared, created_at, updated_at, taste_profile, flavors
    // ❌ EXCLUIDO: vector_embedding (solo para búsqueda semántica, ~1.5KB innecesario)
    const { data, error } = await supabase
      .from('wines_canonical')
      .select(`
        id,
        winery,
        label,
        abv,
        color,
        country,
        region,
        grapes,
        serving,
        image_canonical_url,
        is_shared,
        created_at,
        updated_at,
        taste_profile,
        flavors
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      console.error('Error fetching wine detail:', error);
      return { data: null, error };
    }

    // Construir URL de imagen
    console.log('🖼️ [fetchWineDetail] Path original de imagen:', {
      id: data.id,
      image_canonical_url: data.image_canonical_url,
      type: typeof data.image_canonical_url,
    });
    
    let imageUrl: string | undefined = undefined;
    
    // Primero intentar usar el path de la BD
    if (data.image_canonical_url) {
      imageUrl = publicImageUrl(data.image_canonical_url);
      
      // Si la URL generada falla, buscar por ID del vino
      if (imageUrl) {
        // Verificar si la imagen existe usando findImageByWineId como fallback
        // Esto maneja el caso donde el nombre en la BD no coincide
        const foundImage = await findImageByWineId(id);
        if (foundImage) {
          // Si encontramos una imagen por ID, usar esa en lugar de la del path
          console.log('✅ [fetchWineDetail] Usando imagen encontrada por ID en lugar del path de BD');
          imageUrl = foundImage;
        }
      }
    }
    
    // Si aún no hay imagen, buscar por ID
    if (!imageUrl) {
      console.log('⚠️ [fetchWineDetail] No hay image_canonical_url válido, buscando por ID...');
      imageUrl = await findImageByWineId(id);
      if (imageUrl) {
        console.log('✅ [fetchWineDetail] Imagen encontrada por ID:', imageUrl);
      } else {
        console.log('❌ [fetchWineDetail] No se encontró imagen para este vino');
      }
    }

    console.log('✅ Wine detail fetched successfully:', {
      id: data.id,
      label: data.label,
      final_image_url: imageUrl,
    });

    // Los datos bilingües se mantienen como objetos para que el componente decida qué idioma usar
    return {
      data: {
        ...data,
        image_canonical_url: imageUrl,
      } as GlobalWine,
      error: null,
    };
  } catch (error) {
    console.error('Exception in fetchWineDetail:', error);
    return { data: null, error };
  }
}

/**
 * Busca la imagen de un vino en Storage por su ID
 * Usa caché para evitar búsquedas duplicadas
 */
export async function findImageByWineId(wineId: string): Promise<string | undefined> {
  // Verificar caché primero
  if (imageCache.has(wineId)) {
    logger.debug('[findImageByWineId] Usando caché para:', wineId);
    return imageCache.get(wineId);
  }

  try {
    logger.debug('[findImageByWineId] Búsqueda para:', wineId);
    
    // Buscar en wine_images
    const { data: wineImageData, error: wineImageError } = await supabase
      .from('wine_images')
      .select('file_path')
      .eq('wine_id', wineId)
      .eq('kind', 'bottle')
      .maybeSingle();

    if (wineImageError) {
      logger.warn('[findImageByWineId] Error en wine_images:', wineImageError);
    }

    if (wineImageData?.file_path) {
      const url = publicImageUrl(wineImageData.file_path);
      imageCache.set(wineId, url);
      logger.success('[findImageByWineId] Encontrada en wine_images');
      return url;
    }

    // Buscar en canonical/
    const { data: files, error } = await supabase.storage
      .from('wine-bottles')
      .list('canonical', {
        limit: 1000,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' },
      });

    if (error || !files || files.length === 0) {
      logger.warn('[findImageByWineId] No hay archivos o error');
      imageCache.set(wineId, undefined);
      return undefined;
    }

    logger.debug(`[findImageByWineId] ${files.length} archivos en canonical/`);

    // Buscar archivo que contenga el ID
    const matchingFile = files.find(file => {
      const fileName = file.name.toLowerCase();
      const wineIdLower = wineId.toLowerCase();
      
      return (
        fileName.includes(wineIdLower) || 
        fileName === `${wineIdLower}.png` ||
        fileName === `${wineIdLower}.jpg` ||
        fileName === `${wineIdLower}.jpeg` ||
        fileName === `${wineIdLower}.webp` ||
        fileName.startsWith(wineIdLower)
      );
    });

    if (matchingFile) {
      const imagePath = `canonical/${matchingFile.name}`;
      const url = publicImageUrl(imagePath);
      imageCache.set(wineId, url);
      logger.success('[findImageByWineId] Encontrada:', matchingFile.name);
      return url;
    }

    logger.warn('[findImageByWineId] No encontrada');
    imageCache.set(wineId, undefined);
    return undefined;
  } catch (error) {
    logger.error('[findImageByWineId] Excepción:', error);
    imageCache.set(wineId, undefined);
    return undefined;
  }
}

/**
 * Si falta image_canonical_url, busca en wine_images (kind='bottle')
 * @deprecated Usar findImageByWineId en su lugar
 */
export async function fetchBottleFallback(wineId: string) {
  return await findImageByWineId(wineId);
}

/**
 * Verifica si una imagen existe en Storage
 * Esto ayuda a diagnosticar problemas de URLs
 */
export async function verifyImageExists(path: string): Promise<boolean> {
  try {
    const cleanPath = path.trim().replace(/^\/+/, '');
    const folder = cleanPath.split('/')[0] || '';
    const fileName = cleanPath.split('/').pop() || '';
    
    const { data, error } = await supabase.storage
      .from('wine-bottles')
      .list(folder, {
        limit: 1000,
        offset: 0,
      });
    
    if (error) {
      console.error('❌ [verifyImageExists] Error verificando:', error);
      return false;
    }
    
    const exists = data?.some(file => file.name === fileName);
    
    console.log(`🔍 [verifyImageExists] ${exists ? '✅' : '❌'} Imagen ${exists ? 'existe' : 'NO existe'}:`, {
      path: cleanPath,
      folder,
      fileName,
      filesFound: data?.length || 0,
    });
    
    return exists || false;
  } catch (error) {
    console.error('❌ [verifyImageExists] Excepción:', error);
    return false;
  }
}

/**
 * Verifica si un vino ya existe en el catálogo del usuario
 */
export async function checkWineExistsInCatalog(
  tenantId: string,
  wineName: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('wines')
      .select('id')
      .eq('owner_id', tenantId)
      .eq('name', wineName)
      .maybeSingle();

    if (error) {
      console.error('Error checking wine existence:', error);
      return false; // En caso de error, permitir intentar agregar
    }

    return !!data;
  } catch (error) {
    console.error('Exception checking wine existence:', error);
    return false;
  }
}

/**
 * Agrega un vino del catálogo global al catálogo del tenant
 */
export async function addWineToUserCatalog({
  tenantId,
  branchId,
  userId,
  canonicalWineId,
  price,
  initialQty,
  priceGlass,
  canonicalWine,
}: {
  tenantId: string;
  branchId?: string;
  userId: string;
  canonicalWineId: string;
  price?: number;
  initialQty?: number;
  priceGlass?: number;
  canonicalWine?: Partial<GlobalWine>;
}) {
  // Obtener detalles canónicos (para el nombre) solo si no vienen en parámetros o si falta abv
  let canonical = canonicalWine;
  if (!canonical || (canonical && !canonical.abv)) {
    // ✅ CORREGIDO: Usando solo columnas reales del esquema
    const { data, error } = await supabase
      .from('wines_canonical')
      .select('id, winery, label, image_canonical_url, grapes, region, country, abv, color, serving, taste_profile, flavors, created_at, updated_at, is_shared')
      .eq('id', canonicalWineId)
      .single();
    if (error || !data) throw new Error('Vino canónico no encontrado');
    
    // Extraer taste_profile: primero desde la columna directa, luego desde tech_data/tasting_notes como fallback
    let tasteProfile: any = null;
    
    // ✅ CORREGIDO: taste_profile es columna directa en el esquema real
    // Log detallado de la estructura recibida
    console.log('🔍 Estructura de datos recibida de wines_canonical:', {
      has_taste_profile_direct: !!data.taste_profile,
      taste_profile_type: typeof data.taste_profile,
      taste_profile_value: data.taste_profile,
    });
    
    if (data.taste_profile) {
      // taste_profile es una columna directa JSONB
      if (typeof data.taste_profile === 'object' && data.taste_profile !== null) {
        tasteProfile = data.taste_profile;
        console.log('✅ taste_profile extraído desde columna directa:', tasteProfile);
      } else if (typeof data.taste_profile === 'string') {
        try {
          tasteProfile = JSON.parse(data.taste_profile);
          console.log('✅ taste_profile parseado desde string:', tasteProfile);
        } catch (e) {
          console.warn('⚠️ No se pudo parsear taste_profile como JSON:', e);
        }
      }
    }
    
    if (!tasteProfile) {
      console.warn('⚠️ No se encontró taste_profile en wines_canonical');
    }
    
    // Debug: Verificar qué valores vienen de wines_canonical
    console.log('🍷 Datos finales desde wines_canonical:', {
      winery: (data as any).winery,
      label: (data as any).label,
      abv: data.abv,
      has_taste_profile_column: !!data.taste_profile,
      has_taste_profile_data: !!tasteProfile,
      taste_profile: tasteProfile,
      taste_profile_keys: tasteProfile && typeof tasteProfile === 'object' ? Object.keys(tasteProfile) : null,
      has_flavors: !!data.flavors,
    });
    
    canonical = {
      ...data,
      tasting_profile: tasteProfile ? {
        body: tasteProfile.body ?? null,
        acidity: tasteProfile.acidity ?? null,
        tannin: tasteProfile.tannin ?? null,
        sweetness: tasteProfile.sweetness ?? null,
        fizziness: tasteProfile.fizziness ?? null,
      } : null,
      flavors: data.flavors || undefined,
    } as GlobalWine;
  } else if (canonical) {
    // Si canonical viene como parámetro, asegurarse de extraer taste_profile si está disponible
    let tasteProfile: any = null;
    
    // Intentar extraer desde taste_profile directo
    if ((canonical as any).taste_profile) {
      const tp = (canonical as any).taste_profile;
      if (typeof tp === 'object' && tp !== null) {
        tasteProfile = tp;
      } else if (typeof tp === 'string') {
        try {
          tasteProfile = JSON.parse(tp);
        } catch (e) {
          console.warn('⚠️ No se pudo parsear taste_profile como JSON:', e);
        }
      }
    }
    
    // ✅ CORREGIDO: taste_profile es columna directa, no hay fallback a tech_data/tasting_notes
    // (esas columnas no existen en el esquema real)
    
    // Actualizar canonical con taste_profile extraído
    if (tasteProfile && !canonical.tasting_profile) {
      (canonical as any).tasting_profile = {
        body: tasteProfile.body ?? null,
        acidity: tasteProfile.acidity ?? null,
        tannin: tasteProfile.tannin ?? null,
        sweetness: tasteProfile.sweetness ?? null,
        fizziness: tasteProfile.fizziness ?? null,
      };
    }
    
    console.log('🍷 Datos desde canonicalWine parámetro:', {
      winery: (canonical as any).winery,
      label: (canonical as any).label,
      has_taste_profile: !!(canonical as any).taste_profile,
      has_tasting_profile: !!(canonical as any).tasting_profile,
      taste_profile_raw: (canonical as any).taste_profile,
      tasting_profile_extracted: (canonical as any).tasting_profile,
    });
  }

  // Extraer winery y label de wines_canonical (solo estos dos campos como información principal)
  // Usar español como idioma por defecto (luego se puede hacer configurable)
  const canonicalWinery = getBilingualValue((canonical as any).winery, 'es')?.trim() || '';
  const canonicalLabel = getBilingualValue((canonical as any).label, 'es')?.trim() || '';
  // Si no hay label, usar winery como nombre (cuando son iguales solo se muestra uno)
  // Solo error si ambos están vacíos
  if (!canonicalLabel && !canonicalWinery) {
    throw new Error('El vino canónico no tiene label ni winery definidos');
  }
  // Usar label como nombre, o winery si label no existe
  const wineNameToUse = canonicalLabel || canonicalWinery;
  
  // TODO: DB ENFORCEMENT REQUIRED
  // Esta función debe validar límites de suscripción antes de crear vinos.
  // El backend debe implementar:
  // 1. RLS policy que prevenga INSERT si se excede límite de wines
  // 2. Trigger BEFORE INSERT que valide subscription limits
  // 3. RPC function add_wine_to_catalog_with_validation() que encapsule esta lógica
  // 
  // Por ahora, la validación solo ocurre en frontend (si se proporciona ownerUser)
  // Parámetros opcionales para validación (preparación para enforcement real):
  // - ownerUser: User | null (opcional, para validar límites)
  // - currentWineCount: number (opcional, conteo actual de vinos)
  // 
  // NOTA: Estos parámetros no se agregan a la firma para mantener compatibilidad.
  // En el futuro, se puede crear una función wrapper o usar contexto global.

  // Misma fila canónica = mismo vino tenant (no deduplicar solo por nombre: Opus One vs Opus One Overture).
  const { data: existingByCanonical } = await supabase
    .from('wines')
    .select('id')
    .eq('owner_id', tenantId)
    .eq('canonical_wine_id', canonicalWineId)
    .maybeSingle();

  let wineId = existingByCanonical?.id;

  if (!wineId) {
    // NOTA: vintage ya no existe en wines_canonical
    // El usuario puede agregar la añada manualmente después de agregar el vino a su catálogo
    const numericVintage: number | null = null;
    
    // Verificar si el nombre del vino es igual al nombre de la bodega
    // Si son iguales (o si no hay label pero sí winery), solo mostrar el nombre y dejar bodega vacía
    const effectiveLabel = canonicalLabel || canonicalWinery; // Nombre efectivo del vino
    const isNameEqualToWinery = (
      (canonicalLabel && canonicalWinery && canonicalLabel.toLowerCase() === canonicalWinery.toLowerCase()) ||
      (!canonicalLabel && canonicalWinery) // Si no hay label pero sí winery, son iguales por definición
    );
    
    const finalName = wineNameToUse;
    const finalWinery = isNameEqualToWinery ? '' : canonicalWinery;
    
    // Calcular niveles sensoriales antes de insertar
    const bodyLevel = (() => {
      const body = canonical.tasting_profile?.body;
      if (body == null || body === undefined) return null;
      const num = typeof body === 'number' ? body : parseFloat(String(body));
      if (!Number.isFinite(num) || num <= 0) return null;
      return Math.max(1, Math.min(5, Math.round(num / 20)));
    })();
    const sweetnessLevel = (() => {
      const sweetness = canonical.tasting_profile?.sweetness;
      if (sweetness == null || sweetness === undefined) return null;
      const num = typeof sweetness === 'number' ? sweetness : parseFloat(String(sweetness));
      if (!Number.isFinite(num) || num <= 0) return null;
      return Math.max(1, Math.min(5, Math.round(num / 20)));
    })();
    const acidityLevel = (() => {
      const acidity = canonical.tasting_profile?.acidity;
      if (acidity == null || acidity === undefined) return null;
      const num = typeof acidity === 'number' ? acidity : parseFloat(String(acidity));
      if (!Number.isFinite(num) || num <= 0) return null;
      return Math.max(1, Math.min(5, Math.round(num / 20)));
    })();
    const intensityLevel = (() => {
      const tannin = canonical.tasting_profile?.tannin;
      if (tannin == null || tannin === undefined) return null;
      const num = typeof tannin === 'number' ? tannin : parseFloat(String(tannin));
      if (!Number.isFinite(num) || num <= 0) return null;
      return Math.max(1, Math.min(5, Math.round(num / 20)));
    })();
    const fizzinessLevel = (() => {
      const fizziness = canonical.tasting_profile?.fizziness;
      if (fizziness == null || fizziness === undefined) return null;
      const num = typeof fizziness === 'number' ? fizziness : parseFloat(String(fizziness));
      if (!Number.isFinite(num) || num <= 0) return null;
      return Math.max(1, Math.min(5, Math.round(num / 20)));
    })();
    
    // Log antes de insertar
    console.log('🔍 Datos sensoriales antes de insertar:', {
      tasting_profile_raw: canonical.tasting_profile,
      body: canonical.tasting_profile?.body,
      sweetness: canonical.tasting_profile?.sweetness,
      acidity: canonical.tasting_profile?.acidity,
      tannin: canonical.tasting_profile?.tannin,
      fizziness: canonical.tasting_profile?.fizziness,
      converted_body: bodyLevel,
      converted_sweetness: sweetnessLevel,
      converted_acidity: acidityLevel,
      converted_intensity: intensityLevel,
      converted_fizziness: fizzinessLevel,
    });
    
    const { data, error } = await supabase
      .from('wines')
      .insert({
        owner_id: tenantId,
        canonical_wine_id: canonicalWineId,
        name: finalName,
        winery: finalWinery,
        vintage: numericVintage,
        grape_variety: (() => {
          const grapes = canonical.grapes;
          if (!grapes) return '';
          
          // Si es un array nativo de PostgreSQL (viene como array de JavaScript)
          if (Array.isArray(grapes)) {
            return grapes.filter(g => g && g.trim()).join(', ');
          }
          
          // Si es un string
          if (typeof grapes === 'string') {
            return grapes.trim();
          }
          
          // Si viene como JSONB array, intentar parsearlo
          if (typeof grapes === 'object' && grapes !== null) {
            try {
              // Si es un objeto con estructura de array
              const arr = Object.values(grapes).filter(v => v && typeof v === 'string');
              if (arr.length > 0) return arr.join(', ');
            } catch (e) {
              console.warn('⚠️ No se pudo parsear grapes:', e);
            }
          }
          
          return '';
        })(),
        type: mapColorToType((canonical as any).color),
        region: getBilingualValue(canonical.region, 'es') || '',
        country: getBilingualValue(canonical.country, 'es') || '',
        alcohol_content: (() => {
          // Nota: wines_canonical solo tiene 'abv', no 'alcohol_content' ni 'alcohol_percentage'
          const raw = canonical.abv ?? null;
          
          if (raw == null) {
            const wineLabel = (canonical as any).label || 'vino';
            console.warn(`⚠️ Vino "${wineLabel}" no tiene grado alcohólico (abv) en wines_canonical`);
            return null;
          }
          
          // Convertir a número si es string (ej: "13.5", "13,5", "13.5 %", etc.)
          const num = typeof raw === 'number' 
            ? raw 
            : parseFloat(String(raw).replace(',', '.').match(/[\d.]+/)?.[0] ?? '');
          
          const result = Number.isFinite(num) ? num : null;
          const wineLabel = (canonical as any).label || 'vino';
          console.log(`✅ Grado alcohólico extraído para "${wineLabel}":`, { raw, result });
          return result;
        })(),
        description: `Vino de ${canonical.country || ''}${canonical.region ? `, ${canonical.region}` : ''}`.trim(),
        tasting_notes: 'Del catálogo global',
        serving_temperature: canonical.serving?.temperature || '',
        body_level: bodyLevel,
        sweetness_level: sweetnessLevel,
        acidity_level: acidityLevel,
        intensity_level: intensityLevel,
        fizziness_level: fizzinessLevel, // Para espumosos
        food_pairings: Array.isArray(canonical.serving?.pairing)
          ? canonical.serving.pairing.filter((p: any) => p && typeof p === 'string' && p.trim().length > 0)
          : (typeof canonical.serving?.pairing === 'string' && canonical.serving.pairing.trim().length > 0)
            ? [canonical.serving.pairing.trim()]
            : [],
        price: price ?? null,
        price_per_glass: priceGlass ?? null,
        image_url: publicImageUrl(canonical.image_canonical_url),
      })
      .select('id')
      .single();

    if (error) throw error;
    wineId = data.id;
  } else if (priceGlass != null || price != null) {
    // Actualizar precios si se proporcionan
    await supabase
      .from('wines')
      .update({
        price: price ?? undefined,
        price_per_glass: priceGlass ?? undefined,
      })
      .eq('id', wineId);
  }

  // Vincular a la sucursal en wine_branch_stock (crear si no existe)
  if (branchId) {
    // ¿ya existe vínculo?
    const { data: existingStock } = await supabase
      .from('wine_branch_stock')
      .select('id, stock_quantity')
      .eq('wine_id', wineId)
      .eq('branch_id', branchId)
      .maybeSingle();

    const qtyToSet = initialQty != null ? initialQty : (existingStock?.stock_quantity ?? 0);

    if (!existingStock) {
      const { error: stkErr } = await supabase.from('wine_branch_stock').insert({
        wine_id: wineId,
        branch_id: branchId,
        stock_quantity: qtyToSet,
        min_stock: 0,
        price_by_bottle: price ?? null,
        price_by_glass: priceGlass ?? null,
      });
      if (stkErr) throw stkErr;
    } else {
      // Actualizar stock y precios si se proporcionan
      const updateData: any = {};
      if (initialQty != null) {
        updateData.stock_quantity = qtyToSet;
      }
      if (price != null) {
        updateData.price_by_bottle = price;
      }
      if (priceGlass != null) {
        updateData.price_by_glass = priceGlass;
      }
      if (Object.keys(updateData).length > 0) {
        await supabase
          .from('wine_branch_stock')
          .update(updateData)
          .eq('id', existingStock.id);
      }
    }
  }

  return { wineTenantId: wineId };
}

/**
 * Mapea color a tipo de vino
 * Maneja strings, objetos bilingües y arrays
 */
export const mapColorToType = (
  color?: string | { en?: string; es?: string } | string[] | { en?: string[]; es?: string[] }
): 'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified' => {
  if (!color) return 'red';
  
  let colorValue: string | null = null;
  
  // Si es un objeto bilingüe, extraer el valor
  if (typeof color === 'object' && !Array.isArray(color) && color !== null) {
    // Es un objeto bilingüe {en: "...", es: "..."}
    colorValue = getBilingualValue(color, 'es');
    
    // Si no hay valor en español, intentar con inglés
    if (!colorValue) {
      colorValue = (color as any).en || null;
    }
  } 
  // Si es un array bilingüe, extraer el primer valor
  else if (typeof color === 'object' && Array.isArray(color) && color.length > 0) {
    // Es un array simple
    colorValue = typeof color[0] === 'string' ? color[0] : null;
  }
  // Si es un string simple
  else if (typeof color === 'string') {
    colorValue = color;
  }
  
  // Si no hay valor válido, retornar 'red' por defecto
  if (!colorValue || typeof colorValue !== 'string') {
    return 'red';
  }
  
  const normalized = colorValue.toLowerCase();
  if (normalized.includes('red') || normalized.includes('rojo') || normalized.includes('tinto')) return 'red';
  if (normalized.includes('white') || normalized.includes('blanc') || normalized.includes('blanco')) return 'white';
  if (normalized.includes('rose') || normalized.includes('rosado') || normalized.includes('rosé')) return 'rose';
  if (normalized.includes('sparkling') || normalized.includes('espumoso') || normalized.includes('champagne')) return 'sparkling';
  if (normalized.includes('dessert') || normalized.includes('postre') || normalized.includes('dulce')) return 'dessert';
  if (normalized.includes('fortified') || normalized.includes('fortificado') || normalized.includes('generoso')) return 'fortified';
  
  return 'red';
};

/**
 * Orden y conjunto de claves de `taste_profile` visibles según tipo de vino.
 * Debe coincidir con `WineCatalogScreen` (espumoso: burbujeo; blanco/postre: sin taninos; tinto/rosado: sin burbujeo).
 */
export function getTasteProfileKeyOrderForWineType(
  wineType: ReturnType<typeof mapColorToType>
): Array<'body' | 'acidity' | 'fizziness' | 'tannin' | 'sweetness'> {
  if (wineType === 'sparkling') {
    return ['body', 'acidity', 'fizziness'];
  }
  if (wineType === 'white' || wineType === 'dessert' || wineType === 'fortified') {
    return ['body', 'sweetness', 'acidity'];
  }
  return ['body', 'tannin', 'sweetness', 'acidity'];
}












