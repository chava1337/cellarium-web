/**
 * Etiquetas de tipo/color de vino para UI (es / en / pt-BR vía t() + catalog.*).
 * No traduce winery, label ni grapes.
 */

import type { LocaleString } from './localeContent';
import { WINE_TYPE_UI_MAP, WINE_TYPES, type WineType } from '../constants/wineTypeUi';
import { mapColorToType } from '../services/GlobalWineCatalogService';

export type WineTypeLabelTranslator = (key: string) => string;

/** Color canónico o legacy → clave interna red|white|… */
export function resolveWineTypeFromColor(
  color?: LocaleString | string | string[] | null
): WineType {
  return mapColorToType(color as Parameters<typeof mapColorToType>[0]);
}

/** Etiqueta localizada del tipo (Tinto / Red / Branco, etc.). */
export function getWineTypeDisplayLabel(
  colorOrType: LocaleString | string | string[] | null | undefined,
  t: WineTypeLabelTranslator
): string {
  const wineType = resolveWineTypeFromColor(colorOrType);
  return t(WINE_TYPE_UI_MAP[wineType].labelKey);
}

export function isKnownWineType(value: string | null | undefined): value is WineType {
  return !!value && (WINE_TYPES as readonly string[]).includes(value);
}

/** Etiqueta desde wines.type (tenant) cuando el valor es una clave conocida. */
export function getWineTypeDisplayLabelFromType(
  type: string | null | undefined,
  t: WineTypeLabelTranslator
): string | null {
  if (!isKnownWineType(type)) return null;
  return t(WINE_TYPE_UI_MAP[type].labelKey);
}
