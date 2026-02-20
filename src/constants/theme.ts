import { Dimensions, PixelRatio } from 'react-native';
import type { DeviceInfo } from '../hooks/useDeviceInfo';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Configuración del carrusel de vinos (valores originales para smartphones)
export const WINE_CAROUSEL_CONFIG = {
  ITEM_WIDTH: 280,        // ancho de la tarjeta vino (smartphone)
  ITEM_SPACING: 35,       // espacio horizontal entre tarjetas (smartphone)
  SCREEN_WIDTH,
  // Umbrales para snap manual
  MIN_SWIPE_VELOCITY: 0.35,     // velocidad mínima para cambiar de ítem
  MIN_SWIPE_DISTANCE_RATIO: 0.35, // porcentaje mínimo de distancia para cambiar
} as const;

// Configuración para tablets (solo se usa cuando se detecta tablet)
const TABLET_CAROUSEL_CONFIG = {
  ITEM_WIDTH: 400,        // ancho de la tarjeta vino (tablet)
  ITEM_SPACING: 50,       // espacio horizontal entre tarjetas (tablet)
} as const;

// Calcular valores derivados (valores originales para smartphones)
export const getWineCarouselDimensions = () => {
  const { ITEM_WIDTH, ITEM_SPACING, SCREEN_WIDTH, MIN_SWIPE_VELOCITY, MIN_SWIPE_DISTANCE_RATIO } = WINE_CAROUSEL_CONFIG;
  
  // Redondear dimensiones para evitar decimales
  const roundedItemWidth = PixelRatio.roundToNearestPixel(ITEM_WIDTH);
  const roundedItemSpacing = PixelRatio.roundToNearestPixel(ITEM_SPACING);
  const roundedItemFull = PixelRatio.roundToNearestPixel(roundedItemWidth + roundedItemSpacing);
  const roundedContentPad = PixelRatio.roundToNearestPixel((SCREEN_WIDTH - roundedItemWidth) / 2);
  
  return {
    ITEM_WIDTH: roundedItemWidth,
    ITEM_SPACING: roundedItemSpacing,
    ITEM_FULL: roundedItemFull,
    CONTENT_PAD: roundedContentPad,
    SCREEN_WIDTH,
    MIN_SWIPE_VELOCITY,
    MIN_SWIPE_DISTANCE: roundedItemFull * MIN_SWIPE_DISTANCE_RATIO,
  };
};

// Calcular valores derivados para tablets (solo cuando se detecta tablet)
export const getWineCarouselDimensionsForTablet = () => {
  const { ITEM_WIDTH, ITEM_SPACING } = TABLET_CAROUSEL_CONFIG;
  const { SCREEN_WIDTH, MIN_SWIPE_VELOCITY, MIN_SWIPE_DISTANCE_RATIO } = WINE_CAROUSEL_CONFIG;
  
  // Redondear dimensiones para evitar decimales
  const roundedItemWidth = PixelRatio.roundToNearestPixel(ITEM_WIDTH);
  const roundedItemSpacing = PixelRatio.roundToNearestPixel(ITEM_SPACING);
  const roundedItemFull = PixelRatio.roundToNearestPixel(roundedItemWidth + roundedItemSpacing);
  const roundedContentPad = PixelRatio.roundToNearestPixel((SCREEN_WIDTH - roundedItemWidth) / 2);
  
  return {
    ITEM_WIDTH: roundedItemWidth,
    ITEM_SPACING: roundedItemSpacing,
    ITEM_FULL: roundedItemFull,
    CONTENT_PAD: roundedContentPad,
    SCREEN_WIDTH,
    MIN_SWIPE_VELOCITY,
    MIN_SWIPE_DISTANCE: roundedItemFull * MIN_SWIPE_DISTANCE_RATIO,
  };
};

// Función para calcular offsets de snap (valores originales para smartphones)
export const getSnapOffsets = (itemCount: number) => {
  const { ITEM_FULL } = getWineCarouselDimensions();
  return Array.from({ length: itemCount }, (_, i) => i * ITEM_FULL);
};

// Función para calcular offsets de snap para tablets
export const getSnapOffsetsForTablet = (itemCount: number) => {
  const { ITEM_FULL } = getWineCarouselDimensionsForTablet();
  return Array.from({ length: itemCount }, (_, i) => i * ITEM_FULL);
};

// Hook para recalcular dimensiones cuando cambia el ancho de pantalla
export const useScreenWidthChanged = () => {
  const { width: currentWidth } = Dimensions.get('window');
  
  return {
    screenWidth: currentWidth,
    isLandscape: currentWidth > Dimensions.get('window').height,
  };
};
