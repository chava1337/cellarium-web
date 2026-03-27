import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CELLARIUM_GRADIENT, CELLARIUM_LAYOUT, CELLARIUM_TEXT } from '../../theme/cellariumTheme';

/**
 * Header premium oficial Cellarium (admin).
 *
 * - Status bar: integrada vía gradiente edge-to-edge + paddingTop = insets.top + StatusBar style="light".
 * - Título: capa absoluta centrada + columnas laterales fijas (headerSlotWidth) para centrado visual real.
 *
 * Tokens: ver CELLARIUM_LAYOUT / CELLARIUM_HEADER_TOKENS en `cellariumTheme.ts`.
 */
export interface CellariumHeaderProps {
  title: string;
  subtitle?: string;
  /** Misma anchura que la columna derecha; mantiene el título centrado en pantalla */
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  /**
   * Menos padding inferior y cuerpo más bajo (formularios largos).
   * Por defecto false: no altera el resto de pantallas.
   */
  compact?: boolean;
}

const CellariumHeader: React.FC<CellariumHeaderProps> = ({
  title,
  subtitle,
  leftSlot,
  rightSlot,
  compact = false,
}) => {
  const insets = useSafeAreaInsets();
  const L = CELLARIUM_LAYOUT;
  /** Estrategia superior: siempre el inset del dispositivo (sin min artificial) para menos “aire muerto” */
  const paddingTop = insets.top;
  const bodyMinH = subtitle
    ? L.headerBodyWithSubtitleMinHeight - (compact ? 8 : 0)
    : L.headerBodyMinHeight - (compact ? 6 : 0);
  const bottomPad = L.headerBottomPadding - (compact ? 6 : 0);
  const slotW = L.headerSlotWidth;

  return (
    <LinearGradient
      colors={[...CELLARIUM_GRADIENT]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[
        styles.gradient,
        {
          paddingTop,
          paddingBottom: bottomPad,
          paddingHorizontal: L.headerHorizontalPadding,
        },
      ]}
    >
      <StatusBar style="light" />
      <View style={[styles.bodyWrap, { minHeight: bodyMinH }]}>
        <View
          style={[styles.titleLayer, { paddingHorizontal: slotW }]}
          pointerEvents="none"
        >
          <Text style={CELLARIUM_TEXT.headerTitle} numberOfLines={subtitle ? 2 : 1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={CELLARIUM_TEXT.headerSubtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={[styles.slotRow, { minHeight: bodyMinH }]}>
          <View style={[styles.slotSide, { width: slotW }]}>{leftSlot}</View>
          <View style={styles.slotSpacer} />
          <View style={[styles.slotSide, { width: slotW, alignItems: 'flex-end' }]}>{rightSlot}</View>
        </View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: {
    borderBottomLeftRadius: CELLARIUM_LAYOUT.headerBottomRadius,
    borderBottomRightRadius: CELLARIUM_LAYOUT.headerBottomRadius,
    ...(Platform.OS === 'android' && { overflow: 'hidden' as const }),
  },
  bodyWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  titleLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  slotSide: {
    minHeight: CELLARIUM_LAYOUT.iconButtonSize,
    justifyContent: 'center',
    zIndex: 1,
  },
  slotSpacer: {
    flex: 1,
  },
});

export default CellariumHeader;
