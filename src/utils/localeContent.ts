/**
 * Resolución de contenido localizado en JSONB ({ es, en, pt }) vs idioma UI (pt-BR).
 * Clave JSONB: `pt`. Idioma app: `pt-BR`.
 */

export type UiLanguage = 'es' | 'en' | 'pt-BR';
export type JsonLocaleKey = 'es' | 'en' | 'pt';

export type LocaleString =
  | string
  | Partial<Record<JsonLocaleKey, string>>
  | null
  | undefined;

export type LocaleStringArray =
  | string[]
  | string
  | Partial<Record<JsonLocaleKey, string[]>>
  | null
  | undefined;

export type ResolveLocaleOptions = {
  /**
   * winery / label: no usar `pt`; cadena es → en (o en → es).
   * Alineado con requisito de no traducir nombre comercial vía pt.
   */
  wineryLabelMode?: boolean;
};

/** UI `pt-BR` → clave JSONB `pt`. */
export function uiLanguageToJsonKey(lang: UiLanguage): JsonLocaleKey | null {
  if (lang === 'pt-BR') return 'pt';
  return lang;
}

function nonEmptyString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

/** Orden de fallback para strings/arrays según idioma UI. */
export function localeKeyChain(lang: UiLanguage, options?: ResolveLocaleOptions): JsonLocaleKey[] {
  if (options?.wineryLabelMode) {
    if (lang === 'en') return ['en', 'es'];
    if (lang === 'pt-BR') return ['es', 'en'];
    return ['es', 'en'];
  }
  if (lang === 'pt-BR') return ['pt', 'en', 'es'];
  if (lang === 'en') return ['en', 'es', 'pt'];
  return ['es', 'en', 'pt'];
}

function pickFromObject(
  obj: Partial<Record<JsonLocaleKey, string>>,
  keys: JsonLocaleKey[]
): string | undefined {
  for (const key of keys) {
    const v = nonEmptyString(obj[key]);
    if (v) return v;
  }
  return undefined;
}

function pickArrayFromObject(
  obj: Partial<Record<JsonLocaleKey, string[]>>,
  keys: JsonLocaleKey[]
): string[] {
  for (const key of keys) {
    const arr = obj[key];
    if (Array.isArray(arr) && arr.length > 0) {
      const filtered = arr.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
      if (filtered.length > 0) return filtered;
    }
  }
  return [];
}

/**
 * Resuelve un valor string o JSONB multilocale.
 * pt-BR (producto): pt → en → es.
 */
export function resolveLocaleString(
  value: LocaleString,
  lang: UiLanguage = 'es',
  options?: ResolveLocaleOptions
): string | undefined {
  if (value == null || value === '') return undefined;

  if (typeof value === 'string') {
    return nonEmptyString(value);
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return pickFromObject(value, localeKeyChain(lang, options));
  }

  return undefined;
}

/**
 * Resuelve arrays localizados (flavors, pairing, etc.).
 * Misma cadena de fallback que resolveLocaleString.
 */
export function resolveLocaleArray(
  value: LocaleStringArray,
  lang: UiLanguage = 'es',
  options?: ResolveLocaleOptions
): string[] {
  if (value == null || value === '') return [];

  if (Array.isArray(value)) {
    return value.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
  }

  if (typeof value === 'string') {
    const s = nonEmptyString(value);
    return s ? [s] : [];
  }

  if (typeof value === 'object') {
    return pickArrayFromObject(value, localeKeyChain(lang, options));
  }

  return [];
}
