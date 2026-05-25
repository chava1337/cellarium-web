import type { Language } from '../contexts/LanguageContext';

/** Locale BCP-47 para fechas y moneda en UI (no altera moneda del store). */
export function getAppLocaleTag(language: Language): string {
  if (language === 'en') return 'en-US';
  if (language === 'pt-BR') return 'pt-BR';
  return 'es-MX';
}
