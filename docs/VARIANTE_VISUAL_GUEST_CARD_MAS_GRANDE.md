# Variante visual guest: card más grande y premium

## Objetivo

Variante solo para guest/comensal: card de vinos (y coctelería) más alta, bloques más grandes, tipografía y footer más presentes, sin afectar owner/staff.

## Archivos modificados

Solo **`src/screens/WineCatalogScreen.tsx`**:

- Constante **GUEST_CARD** (useMemo) con valores reutilizables.
- **renderWineCard:** overrides de card (minHeight), hero (maxHeight), paso de isGuest/guestCard a WineImageBlock y WineSensoryBlock.
- **WineImageBlock:** props isGuest, guestCard; altura imagen 212/232 en guest (antes 180/200).
- **WineSensoryBlock:** props isGuest, guestCard; altura sección 212/232 en guest (antes 180/200).
- **wineAdditionalInfo:** en guest maxHeight 280/324 (antes 260/300).
- **wineInfoBlockContainerGuest:** minHeight 260 (antes 226).
- Nuevos estilos guest: **wineNameGuest, wineWineryGuest, wineCountryGuest, wineGrapesInlineGuest, wineVintageGuest, abvBadgeGuest, abvBadgeTextGuest, pricesContainerGuest, priceValueGuest, priceLabelGuest.**
- **WineInfoBlock:** aplicación de estilos guest a nombre, bodega, país, uvas, añada y badge ABV cuando isGuest.
- **WinePricesBlock:** aplicación de pricesContainerGuest, priceValueGuest, priceLabelGuest cuando isGuest.
- **renderCocktailCard:** card minHeight guest, wineCardContent height 212/232 en guest, hero maxHeight guest, content minHeight 260, nombre cóctel fontSize 23 en guest, footer con pricesContainerGuest y precio fontSize 20 en guest.

## Lista de estilos/tamaños aumentados (solo guest)

| Elemento | Antes (owner/staff o base) | Guest |
|----------|----------------------------|--------|
| **Card minHeight** | 520 (phone) / 540 (tablet) | 600 / 628 |
| **Imagen botella + bloque sensorial** | 180 / 200 px | 212 / 232 px |
| **Hero maxHeight** | 260 / 300 px | 280 / 324 px |
| **Ficha blanca minHeight** | 226 px | 260 px |
| **Nombre del vino** | 20 / lineHeight 26 | 22 / 28 |
| **Bodega** | 15 / 20 | 16 / 22 |
| **País / uvas / añada** | 14–15 | 15–16 |
| **Badge ABV** | padding 4–8, fontSize 11 | padding 5–10, fontSize 12 |
| **Footer precios** | padding 8–10, value 17/22, label 10 | padding 12–14, value 20, label 11 |
| **Coctel: bloque imagen** | 200 / 280 px | 212 / 232 px |
| **Coctel: contenido minHeight** | 226 px | 260 px |
| **Coctel: nombre** | 21 | 23 / lineHeight 28 |
| **Coctel: precio** | 16/18 | 20 |

## Por qué ahora sí debería notarse visualmente

- **Card más alta:** +80 px (phone) y +88 px (tablet) de minHeight hace que la card ocupe más pantalla y se perciba como “menú principal”.
- **Bloque superior más alto:** +32 px en imagen y sensorial (180→212, 200→232) da más peso a la botella y a la ficha sensorial.
- **Hero y ficha:** Hero con más techo (280/324) y ficha con minHeight 260 reducen el hueco vacío y dan más presencia al bloque blanco.
- **Tipografía:** Nombre 20→22, bodega/país/uvas/añada y ABV un punto más grandes; en conjunto la ficha se lee como “menú de restaurante” y no como card compacta.
- **Footer:** Más padding y precio en 20 px (y label 11) hacen que la zona de precios tenga más jerarquía.
- **Coctelería:** Misma lógica (card más alta, bloque imagen/contenido más alto, nombre y precio más grandes) mantiene consistencia entre vinos y cócteles en guest.

## Owner/staff no cambia

- Todos los overrides se aplican **solo cuando `isGuest === true`**.
- Owner/staff siguen usando: minHeight 520/540, imagen/sensorial 180/200, hero 260/300, ficha sin estilos *Guest, tipografía base, footer base.
- No se toca lógica de datos ni rutas; solo estilos condicionados a isGuest.
