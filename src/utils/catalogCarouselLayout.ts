/**
 * Layout responsive del carrusel horizontal del catálogo (vinos/cócteles).
 * Solo afecta rama tablet (stableIsTablet); phone delega en getWineCarouselDimensions().
 *
 * Sin detección por modelo: solo ancho/alto/insets y clamp.
 */
import { PixelRatio } from 'react-native';
import { getWineCarouselDimensions } from '../constants/theme';

const clamp = (min: number, value: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/** Header Catálogo + barra de filtros + márgenes (aprox.; alineado con guest tablet en WineCatalogScreen). */
export const CATALOG_LIST_VERTICAL_CHROME_PX = 240;

export type CatalogCarouselLayout = ReturnType<typeof getWineCarouselDimensions> & {
  /** >0 solo en tablet: minHeight sugerido para WineCardShell / CocktailCardShell */
  CARD_SHELL_MIN_HEIGHT: number;
  /** Cuántas “ranuras” de ~ancho mínimo caben en el ancho útil (solo telemetría / fórmula). */
  virtualColumns: number;
  /** Ancho entre paddings horizontales del carrusel. */
  availableWidth: number;
  /** Alto útil aproximado para la lista (ventana − safe − chrome). */
  availableHeightForList: number;
};

/**
 * Alto disponible para la zona del FlatList (aprox.), misma base que guestTabletWineCardStyle.
 */
export function getCatalogAvailableListHeight(
  windowHeight: number,
  topInset: number,
  bottomInset: number,
  chromePx: number = CATALOG_LIST_VERTICAL_CHROME_PX
): number {
  return Math.max(280, windowHeight - topInset - bottomInset - chromePx);
}

type ComputeParams = {
  windowWidth: number;
  windowHeight: number;
  topInset: number;
  bottomInset: number;
  isTablet: boolean;
};

/**
 * phone: mismos valores que getWineCarouselDimensions() (comportamiento actual).
 * tablet: ITEM_WIDTH / espaciado / pad derivados del ancho; alto de card del alto útil.
 */
export function computeCatalogCarouselLayout(p: ComputeParams): CatalogCarouselLayout {
  const { windowWidth: w, windowHeight: h, topInset, bottomInset, isTablet } = p;

  if (!isTablet) {
    const base = getWineCarouselDimensions();
    return {
      ...base,
      CARD_SHELL_MIN_HEIGHT: 0,
      virtualColumns: 1,
      availableWidth: w,
      availableHeightForList: getCatalogAvailableListHeight(h, topInset, bottomInset),
    };
  }

  const edgePad = clamp(14, Math.round(12 + w * 0.012), 28);
  const innerW = Math.max(200, w - 2 * edgePad);
  const gapMin = 32;
  const minCell = 280;
  const virtualColumns = clamp(2, Math.floor((innerW + gapMin) / (minCell + gapMin)), 5);

  const itemSpacing = clamp(32, Math.round(innerW * 0.036), 56);
  const itemWidth = clamp(
    300,
    Math.round(innerW * 0.46),
    560
  );

  const roundedItemWidth = PixelRatio.roundToNearestPixel(itemWidth);
  const roundedItemSpacing = PixelRatio.roundToNearestPixel(itemSpacing);
  const roundedItemFull = PixelRatio.roundToNearestPixel(roundedItemWidth + roundedItemSpacing);
  const roundedContentPad = PixelRatio.roundToNearestPixel(edgePad);

  const MIN_SWIPE_VELOCITY = 0.35;
  const MIN_SWIPE_DISTANCE_RATIO = 0.35;

  const availableHeightForList = getCatalogAvailableListHeight(h, topInset, bottomInset);
  const CARD_SHELL_MIN_HEIGHT = clamp(
    520,
    availableHeightForList - 6,
    900
  );

  return {
    ITEM_WIDTH: roundedItemWidth,
    ITEM_SPACING: roundedItemSpacing,
    ITEM_FULL: roundedItemFull,
    CONTENT_PAD: roundedContentPad,
    SCREEN_WIDTH: w,
    MIN_SWIPE_VELOCITY,
    MIN_SWIPE_DISTANCE: roundedItemFull * MIN_SWIPE_DISTANCE_RATIO,
    CARD_SHELL_MIN_HEIGHT,
    virtualColumns,
    availableWidth: innerW,
    availableHeightForList,
  };
}
