/**
 * Normaliza nombres de países para almacenarlos correctamente
 * - Capitaliza la primera letra
 * - Corrige acentos
 * - Normaliza nombres comunes
 */

const COUNTRY_MAPPING: Record<string, string> = {
  // Variaciones comunes sin acentos
  'italia': 'Italia',
  'italy': 'Italia',
  'españa': 'España',
  'spain': 'España',
  'francia': 'Francia',
  'france': 'Francia',
  'alemania': 'Alemania',
  'germany': 'Alemania',
  'portugal': 'Portugal',
  'argentina': 'Argentina',
  'chile': 'Chile',
  'australia': 'Australia',
  'nueva zelanda': 'Nueva Zelanda',
  'new zealand': 'Nueva Zelanda',
  'sudafrica': 'Sudáfrica',
  'sudáfrica': 'Sudáfrica',
  'south africa': 'Sudáfrica',
  'estados unidos': 'Estados Unidos',
  'united states': 'Estados Unidos',
  'usa': 'Estados Unidos',
  'usa': 'Estados Unidos',
  'méxico': 'México',
  'mexico': 'México',
  'brasil': 'Brasil',
  'brazil': 'Brasil',
  'perú': 'Perú',
  'peru': 'Perú',
  'uruguay': 'Uruguay',
  'colombia': 'Colombia',
  'canadá': 'Canadá',
  'canada': 'Canadá',
  'reino unido': 'Reino Unido',
  'united kingdom': 'Reino Unido',
  'uk': 'Reino Unido',
  'grecia': 'Grecia',
  'greece': 'Grecia',
  'hungría': 'Hungría',
  'hungary': 'Hungría',
  'rumanía': 'Rumanía',
  'romania': 'Rumanía',
  'bulgaria': 'Bulgaria',
  'bulgaria': 'Bulgaria',
  'croacia': 'Croacia',
  'croatia': 'Croacia',
  'eslovenia': 'Eslovenia',
  'slovenia': 'Eslovenia',
  'republica checa': 'República Checa',
  'czech republic': 'República Checa',
  'austria': 'Austria',
  'suiza': 'Suiza',
  'switzerland': 'Suiza',
  'suecia': 'Suecia',
  'sweden': 'Suecia',
  'noruega': 'Noruega',
  'norway': 'Noruega',
  'dinamarca': 'Dinamarca',
  'denmark': 'Dinamarca',
  'finlandia': 'Finlandia',
  'finland': 'Finlandia',
  'polonia': 'Polonia',
  'poland': 'Polonia',
  'turquía': 'Turquía',
  'turkey': 'Turquía',
  'israel': 'Israel',
  'libano': 'Líbano',
  'lebanon': 'Líbano',
  'japon': 'Japón',
  'japan': 'Japón',
  'china': 'China',
  'india': 'India',
  'tailandia': 'Tailandia',
  'thailand': 'Tailandia',
  'corea del sur': 'Corea del Sur',
  'south korea': 'Corea del Sur',
  'nueva zelanda': 'Nueva Zelanda',
  'new zealand': 'Nueva Zelanda',
};

/**
 * Normaliza un nombre de país
 * @param country - Nombre del país a normalizar
 * @returns Nombre normalizado con primera letra mayúscula y acentos correctos
 */
export function normalizeCountry(country: string | null | undefined): string | null {
  if (!country || typeof country !== 'string') {
    return null;
  }

  // Limpiar espacios y convertir a minúsculas para búsqueda
  const cleaned = country.trim().toLowerCase();

  // Si está vacío después de limpiar, retornar null
  if (!cleaned) {
    return null;
  }

  // Buscar en el mapeo de países
  const normalized = COUNTRY_MAPPING[cleaned];
  if (normalized) {
    return normalized;
  }

  // Si no está en el mapeo, capitalizar la primera letra manualmente
  // Manejar casos especiales con acentos
  const firstChar = cleaned.charAt(0).toUpperCase();
  const rest = cleaned.slice(1);

  // Intentar detectar y corregir acentos comunes
  let result = firstChar + rest;

  // Correcciones comunes de acentos
  const accentCorrections: Record<string, string> = {
    'mexico': 'México',
    'peru': 'Perú',
    'republica': 'República',
    'libano': 'Líbano',
    'japon': 'Japón',
    'turquia': 'Turquía',
    'hungria': 'Hungría',
    'rumania': 'Rumanía',
    'sudafrica': 'Sudáfrica',
    'canada': 'Canadá',
  };

  // Aplicar correcciones si el país completo coincide
  for (const [wrong, correct] of Object.entries(accentCorrections)) {
    if (cleaned === wrong) {
      return correct;
    }
  }

  // Si hay palabras compuestas, capitalizar cada palabra
  const words = result.split(/\s+/);
  const capitalizedWords = words.map(word => {
    if (word.length === 0) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });

  result = capitalizedWords.join(' ');

  return result;
}

/**
 * Mapeo de países con sus traducciones en ambos idiomas
 */
const COUNTRY_TRANSLATIONS: Record<string, { es: string; en: string }> = {
  'italia': { es: 'Italia', en: 'Italy' },
  'italy': { es: 'Italia', en: 'Italy' },
  'españa': { es: 'España', en: 'Spain' },
  'spain': { es: 'España', en: 'Spain' },
  'francia': { es: 'Francia', en: 'France' },
  'france': { es: 'Francia', en: 'France' },
  'alemania': { es: 'Alemania', en: 'Germany' },
  'germany': { es: 'Alemania', en: 'Germany' },
  'portugal': { es: 'Portugal', en: 'Portugal' },
  'argentina': { es: 'Argentina', en: 'Argentina' },
  'chile': { es: 'Chile', en: 'Chile' },
  'australia': { es: 'Australia', en: 'Australia' },
  'nueva zelanda': { es: 'Nueva Zelanda', en: 'New Zealand' },
  'new zealand': { es: 'Nueva Zelanda', en: 'New Zealand' },
  'sudafrica': { es: 'Sudáfrica', en: 'South Africa' },
  'sudáfrica': { es: 'Sudáfrica', en: 'South Africa' },
  'south africa': { es: 'Sudáfrica', en: 'South Africa' },
  'estados unidos': { es: 'Estados Unidos', en: 'United States' },
  'united states': { es: 'Estados Unidos', en: 'United States' },
  'usa': { es: 'Estados Unidos', en: 'United States' },
  'méxico': { es: 'México', en: 'Mexico' },
  'mexico': { es: 'México', en: 'Mexico' },
  'brasil': { es: 'Brasil', en: 'Brazil' },
  'brazil': { es: 'Brasil', en: 'Brazil' },
  'perú': { es: 'Perú', en: 'Peru' },
  'peru': { es: 'Perú', en: 'Peru' },
  'uruguay': { es: 'Uruguay', en: 'Uruguay' },
  'colombia': { es: 'Colombia', en: 'Colombia' },
  'canadá': { es: 'Canadá', en: 'Canada' },
  'canada': { es: 'Canadá', en: 'Canada' },
  'reino unido': { es: 'Reino Unido', en: 'United Kingdom' },
  'united kingdom': { es: 'Reino Unido', en: 'United Kingdom' },
  'uk': { es: 'Reino Unido', en: 'United Kingdom' },
  'grecia': { es: 'Grecia', en: 'Greece' },
  'greece': { es: 'Grecia', en: 'Greece' },
  'hungría': { es: 'Hungría', en: 'Hungary' },
  'hungary': { es: 'Hungría', en: 'Hungary' },
  'rumanía': { es: 'Rumanía', en: 'Romania' },
  'romania': { es: 'Rumanía', en: 'Romania' },
  'bulgaria': { es: 'Bulgaria', en: 'Bulgaria' },
  'croacia': { es: 'Croacia', en: 'Croatia' },
  'croatia': { es: 'Croacia', en: 'Croatia' },
  'eslovenia': { es: 'Eslovenia', en: 'Slovenia' },
  'slovenia': { es: 'Eslovenia', en: 'Slovenia' },
  'republica checa': { es: 'República Checa', en: 'Czech Republic' },
  'czech republic': { es: 'República Checa', en: 'Czech Republic' },
  'austria': { es: 'Austria', en: 'Austria' },
  'suiza': { es: 'Suiza', en: 'Switzerland' },
  'switzerland': { es: 'Suiza', en: 'Switzerland' },
  'suecia': { es: 'Suecia', en: 'Sweden' },
  'sweden': { es: 'Suecia', en: 'Sweden' },
  'noruega': { es: 'Noruega', en: 'Norway' },
  'norway': { es: 'Noruega', en: 'Norway' },
  'dinamarca': { es: 'Dinamarca', en: 'Denmark' },
  'denmark': { es: 'Dinamarca', en: 'Denmark' },
  'finlandia': { es: 'Finlandia', en: 'Finland' },
  'finland': { es: 'Finlandia', en: 'Finland' },
  'polonia': { es: 'Polonia', en: 'Poland' },
  'poland': { es: 'Polonia', en: 'Poland' },
  'turquía': { es: 'Turquía', en: 'Turkey' },
  'turkey': { es: 'Turquía', en: 'Turkey' },
  'israel': { es: 'Israel', en: 'Israel' },
  'libano': { es: 'Líbano', en: 'Lebanon' },
  'lebanon': { es: 'Líbano', en: 'Lebanon' },
  'japon': { es: 'Japón', en: 'Japan' },
  'japan': { es: 'Japón', en: 'Japan' },
  'china': { es: 'China', en: 'China' },
  'india': { es: 'India', en: 'India' },
  'tailandia': { es: 'Tailandia', en: 'Thailand' },
  'thailand': { es: 'Tailandia', en: 'Thailand' },
  'corea del sur': { es: 'Corea del Sur', en: 'South Korea' },
  'south korea': { es: 'Corea del Sur', en: 'South Korea' },
};

/**
 * Obtiene ambas traducciones de un país
 */
function getCountryTranslations(country: string): { es: string; en: string } | null {
  const cleaned = country.trim().toLowerCase();
  
  // Buscar en el mapeo de traducciones
  const translations = COUNTRY_TRANSLATIONS[cleaned];
  if (translations) {
    return translations;
  }
  
  // Si no está en el mapeo, normalizar y usar el mismo valor para ambos idiomas
  const normalized = normalizeCountry(country);
  if (normalized) {
    return { es: normalized, en: normalized };
  }
  
  return null;
}

/**
 * Normaliza un país que puede venir como objeto bilingüe
 * Asegura tener ambos idiomas si es posible
 */
export function normalizeCountryBilingual(
  country: string | { en?: string; es?: string } | null | undefined,
  lang: 'es' | 'en' = 'es'
): { en?: string; es?: string } | null {
  if (!country) return null;

  // Si es un objeto bilingüe
  if (typeof country === 'object' && !Array.isArray(country)) {
    const normalized: { en?: string; es?: string } = {};
    
    // Normalizar español si existe
    if (country.es) {
      const esNormalized = normalizeCountry(country.es);
      if (esNormalized) {
        normalized.es = esNormalized;
        // Intentar obtener traducción en inglés
        const translations = getCountryTranslations(country.es);
        if (translations && translations.en) {
          normalized.en = translations.en;
        }
      }
    }
    
    // Normalizar inglés si existe
    if (country.en) {
      const enNormalized = normalizeCountry(country.en);
      if (enNormalized) {
        normalized.en = enNormalized;
        // Intentar obtener traducción en español
        const translations = getCountryTranslations(country.en);
        if (translations && translations.es) {
          normalized.es = translations.es;
        }
      }
    }

    // Si ambos están definidos, retornar el objeto completo
    if (normalized.en || normalized.es) {
      return normalized;
    }

    return null;
  }

  // Si es un string, obtener ambas traducciones
  if (typeof country === 'string') {
    const translations = getCountryTranslations(country);
    if (translations) {
      return translations;
    }
    
    // Si no se encontraron traducciones, normalizar y usar el mismo valor
    const normalized = normalizeCountry(country);
    if (normalized) {
      return { es: normalized, en: normalized };
    }
  }

  return null;
}

