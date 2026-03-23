/**
 * Cellarium — única fuente de verdad para tokens visuales (colores, medidas, tipografía).
 * Import oficial: import { CELLARIUM, CELLARIUM_LAYOUT, ... } from '../theme/cellariumTheme';
 *
 * Cliente Supabase oficial del proyecto: `../lib/supabase` (no usar services/supabase ni config/supabase en código nuevo).
 */

import type { TextStyle } from 'react-native';

/** Colores base Cellarium */
export const CELLARIUM = {
  primary: '#924048',
  primaryDark: '#6f2f37',
  primaryDarker: '#4e2228',
  bg: '#F4F4F6',
  card: '#FFFFFF',
  border: '#E5E5E8',
  text: '#2C2C2C',
  muted: '#6A6A6A',
  textOnDark: 'rgba(255,255,255,0.92)',
  textOnDarkMuted: 'rgba(255,255,255,0.75)',
  chipActiveBg: 'rgba(255,255,255,0.14)',
  chipBorder: 'rgba(255,255,255,0.16)',
  danger: '#B85454',
  neutralButton: '#8D96A0',
} as const;

/** Gradiente principal (headers, hero) */
export const CELLARIUM_GRADIENT = ['#4e2228', '#6f2f37', '#924048'] as const;

/**
 * Medidas y radios.
 *
 * --- Header premium oficial (admin) ---
 * headerTopPaddingStrategy: `paddingTop = insets.top` en CellariumHeader (safe-area-context).
 *   El gradiente empieza en y=0; el relleno superior empuja el bloque útil bajo hora/batería/notch.
 * headerMinHeight (legacy): altura mínima del bloque del gradiente sin contar insets; preferir
 *   cálculo dinámico: insets.top + headerBodyMinHeight + headerBottomPadding.
 * headerSlotWidth: ancho fijo izquierda/derecha para centrar el título aunque solo un slot tenga botón.
 * headerTitleSize / headerSubtitleSize: ver CELLARIUM_TEXT.headerTitle / headerSubtitle (fontSize).
 */
export const CELLARIUM_LAYOUT = {
  screenPadding: 16,
  sectionGap: 16,
  cardRadius: 18,
  inputRadius: 14,
  buttonRadius: 16,
  buttonHeight: 50,
  inputHeight: 48,
  /** @deprecated Preferir cálculo con insets + body + padding; se mantiene por compat */
  headerMinHeight: 108,
  headerBottomRadius: 26,
  headerBottomPadding: 18,
  headerHorizontalPadding: 20,
  iconButtonSize: 44,
  /** Columnas laterales del header (balance visual título centrado) */
  headerSlotWidth: 48,
  /** Altura mínima del cuerpo del header solo título (fila de iconos alineada) */
  headerBodyMinHeight: 46,
  /** Altura mínima con subtítulo */
  headerBodyWithSubtitleMinHeight: 64,
} as const;

/** Alias documentado para tokens de header (referencia en auditorías) */
export const CELLARIUM_HEADER_TOKENS = {
  headerMinHeight: CELLARIUM_LAYOUT.headerMinHeight,
  headerTopPaddingStrategy: 'insets.top from useSafeAreaInsets()',
  headerBottomPadding: CELLARIUM_LAYOUT.headerBottomPadding,
  headerHorizontalPadding: CELLARIUM_LAYOUT.headerHorizontalPadding,
  headerBottomRadius: CELLARIUM_LAYOUT.headerBottomRadius,
  headerTitleSize: 24,
  headerSubtitleSize: 13,
  headerSlotWidth: CELLARIUM_LAYOUT.headerSlotWidth,
} as const;

/** Tipografía (combinar con StyleSheet) */
export const CELLARIUM_TEXT: Record<string, TextStyle> = {
  headerTitle: {
    fontSize: CELLARIUM_HEADER_TOKENS.headerTitleSize,
    fontWeight: '700',
    lineHeight: 30,
    color: CELLARIUM.textOnDark,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: CELLARIUM_HEADER_TOKENS.headerSubtitleSize,
    fontWeight: '400',
    color: CELLARIUM.textOnDarkMuted,
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: CELLARIUM.text,
    letterSpacing: 0.2,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: CELLARIUM.text,
  },
  body: {
    fontSize: 15,
    fontWeight: '400',
    color: CELLARIUM.text,
    lineHeight: 22,
  },
  caption: {
    fontSize: 13,
    fontWeight: '400',
    color: CELLARIUM.muted,
    lineHeight: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: CELLARIUM.text,
    marginBottom: 6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
};

/** Compat: tema admin legacy (AdminDashboard / cards antiguas) */
export const CELLARIUM_THEME = {
  admin: {
    bg: '#F6F6F6',
    card: '#FFFFFF',
    text: '#2B2B2B',
    subtext: '#6B6B6B',
    border: 'rgba(0,0,0,0.06)',
    shadow: 'rgba(0,0,0,0.12)',
    wine1: '#5A1F2B',
    wine2: '#7A2F3A',
    wine3: '#8C3A45',
    graphite: '#4A4A4A',
    graphite2: '#5A5A5A',
    pillBg: 'rgba(255,255,255,0.18)',
    warning: '#C85A5A',
  },
} as const;
