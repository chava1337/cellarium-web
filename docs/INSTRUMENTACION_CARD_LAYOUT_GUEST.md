# Instrumentación temporal: layout card guest (medición en runtime)

## Objetivo

Medir alturas reales renderizadas en la card de vino (guest) para localizar qué contenedor está creciendo de más en el dispositivo problemático. No es refactor permanente; solo diagnóstico.

---

## Contenedores instrumentados (onLayout)

| Label | Contenedor | Qué confirma la medida |
|-------|------------|------------------------|
| **itemWrapper** | `View` con `width: carouselDimensions.ITEM_WIDTH` (wrapper del ítem en el carrusel) | Alto total que el FlatList asigna al ítem. Si aquí el `h` es muy grande, el carrusel está dando demasiada altura al item. |
| **wineCard** | `View` con `styles.wineCard` (minHeight 520/540) | Alto real de la card. Si crece mucho más que la suma de hijos, la card está imponiendo altura. |
| **wineCardInnerClip** | `View` con `styles.wineCardInnerClip` (flex: 1) | Alto del clip interno; debería coincidir con wineCard menos bordes. |
| **wineCardBody** | `View` con `styles.wineCardBody` (flex: 1, justifyContent: space-between) | Espacio donde se reparten topGridRow, hero y footer. Si `h` es muy grande, este es el contenedor que “tiene” el exceso. |
| **topGridRow** | `View` con `styles.topGridRow` (imagen + sensorial) | Alto de la zona superior (imagen + ficha sensorial). Valor estable ~180–200px + padding. |
| **wineAdditionalInfo** | `ImageBackground` o `View` del hero (fondo + ficha) | Alto del hero. Si `h` >> 260–300 aquí, el hero está ignorando maxHeight o creciendo por otro motivo. |
| **wineAdditionalInfoContent** | `View` que envuelve `WineInfoBlock` (contenedor de la ficha blanca) | Alto del contenido de la ficha. Debería ser contenido real (bodega, nombre, uvas, etc.). |
| **WinePricesBlock** | `View` que envuelve el componente de precios | Alto del bloque de precios. Valor estable. |

---

## Logs de dispositivo (una vez por mount)

Al dispararse el primer `onLayout` (itemWrapper) se loguea en **__DEV__**:

- `Dimensions.get('window').width` / `.height`
- `PixelRatio.get()`
- `stableIsTablet`
- `ITEM_WIDTH`, `ITEM_SPACING`, `ITEM_FULL` (dimensiones del carrusel)

---

## Cómo interpretar el diagnóstico

1. **itemWrapper (h):** Si es mucho mayor que la altura visible de la card en pantalla, el FlatList/contentContainer está dando altura extra al ítem (p. ej. por `contentContainerStyle` o altura del FlatList).
2. **wineCard (h):** Si es muy grande con respecto a topGridRow + hero + precios, la card está creciendo (p. ej. por minHeight o por el padre).
3. **wineCardBody (h):** Es el “presupuesto” vertical para los tres bloques. Si es enorme, el exceso está en este nivel; luego ver qué hijo se lo queda.
4. **wineAdditionalInfo (h):** Si `h` > 260 (phone) o > 300 (tablet), el hero está superando el maxHeight (bug de estilo o herencia). Si `h` está en 260/300 pero sigue habiendo mucho espacio muerto, el espacio sobrante está en wineCardBody y se reparte con space-between (gaps arriba/abajo del hero).
5. **wineAdditionalInfoContent (h):** Alto real del contenido de la ficha. Si es pequeño y wineAdditionalInfo es grande, el “tubo” vacío está entre el contenido y el borde del hero.

---

## Próximo paso (después de medir)

1. Identificar en el dispositivo problemático qué contenedor tiene `h` desproporcionado.
2. Decidir si el origen es: ítem del carrusel (itemWrapper), wineCard, o wineAdditionalInfo.
3. Aplicar el diff mínimo (p. ej. limitar altura del ítem, o del body, o reforzar maxHeight del hero) según el culpable medido.

---

## Cómo quitar la instrumentación

- Eliminar el `ref` `cardLayoutDeviceLoggedRef` y el callback `logCardLayout`.
- Quitar todos los `onLayout={logCardLayout('...')}` de los contenedores listados.
- Quitar el `View` wrapper de `WinePricesBlock` (dejar solo `<WinePricesBlock ... />`).
- Quitar `logCardLayout` de la lista de dependencias del `useCallback` de `renderWineCard`.
- Opcional: quitar imports `Dimensions` y `PixelRatio` si no se usan en otro sitio.
