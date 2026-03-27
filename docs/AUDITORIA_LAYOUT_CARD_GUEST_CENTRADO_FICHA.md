# Auditoría: layout card guest — espacio bajo la ficha / centrado

## Objetivo

Corregir el exceso de espacio libre debajo de la ficha de información dentro del área principal (hero/background) en algunos dispositivos, manteniendo buen aspecto en el resto.

---

## Causa raíz final (segunda iteración)

El centrado vertical (`justifyContent: 'center'`) no resolvió el problema porque **el desequilibrio no era solo de alineación**: la sección central **wineAdditionalInfo** (hero) tiene `flex: 1` y **absorbe todo el alto sobrante** de `wineCardBody`. En dispositivos altos, ese “sobrante” es grande: el hero crece mucho y la ficha (contenido) sigue siendo pequeña, dejando mucho espacio muerto dentro del hero. Limitar la altura del hero con **maxHeight** y repartir el espacio con **justifyContent: 'space-between'** en el body evita que el hero crezca de más y distribuye el hueco por encima y por debajo del hero.

---

## 1. Archivos auditados

| Archivo | Revisado |
|---------|----------|
| `src/screens/WineCatalogScreen.tsx` | Card vino (renderWineCard), card coctelería (renderCocktailCard), estilos wineCard / wineCardBody / wineAdditionalInfo / wineAdditionalInfoContent / topGridRow |
| `src/constants/theme.ts` | getWineCarouselDimensions, getWineCarouselDimensionsForTablet, ITEM_WIDTH (280/400), sin height de card |

---

## 2. Estructura y estilos relevantes

### Card de vino (guest y owner/staff)

- **wineCard:** `minHeight: 520` (phone), tablet inline `minHeight: 540`. `justifyContent: 'space-between'`, `flexDirection: 'column'`. Sin altura fija; la altura real la da el contenido + minHeight.
- **wineCardInnerClip:** `flex: 1`, `overflow: 'hidden'`, column.
- **wineCardBody:** `flex: 1`, `minHeight: 0` — se reparte el espacio entre:
  - **topGridRow:** imagen (WineImageBlock) + ficha sensorial (WineSensoryBlock). Altura efectiva ~180 (phone) / 200 (tablet) + paddings.
  - **wineAdditionalInfo (hero):** `flex: 1`, `minHeight: 0` — ocupa **todo el espacio restante** hasta el footer de precios.
  - **WinePricesBlock:** altura fija por contenido.
- **wineAdditionalInfo:** `flex: 1`, `minHeight: 0`, `overflow: 'hidden'`. Contiene ImageBackground (o View) y dentro un **View** con **wineAdditionalInfoContent** que envuelve `WineInfoBlock` (bodega, nombre, origen, uvas, añada, maridajes).
- **wineAdditionalInfoContent:** `flex: 1`, `padding: 16`, `paddingBottom: 4`. Sin `justifyContent` → contenido alineado al **inicio** (arriba).

### Card de coctelería

- Misma **wineCard** y **wineCardBody**.
- **wineCardContent:** `height: 200` (phone) o `height: 280` (tablet) — bloque de imagen del cóctel.
- **wineAdditionalInfo** (ImageBackground fondo coctelería) con **ScrollView** (`wineAdditionalInfoScroll`) y `contentContainerStyle={[styles.wineAdditionalInfoContent, { alignItems: 'center' }]}`. Sin `flexGrow: 1` en content → el contenido no llena la altura del ScrollView y queda pegado arriba cuando sobra espacio.

### Constantes / Dimensions

- **theme.ts:** solo ancho y espaciado (ITEM_WIDTH 280/400, ITEM_SPACING, etc.). No se usa altura fija de card ni breakpoint por altura; el breakpoint es solo tablet por ancho/tipo de dispositivo.

---

## 3. Causa raíz

1. **Altura de la card no es fija:** La card tiene `minHeight: 520/540` pero puede ser más alta cuando el contenedor del carrusel o la pantalla dan más altura. En esos casos **wineAdditionalInfo** (hero) recibe más espacio por `flex: 1`.
2. **Contenido de la ficha no se centra:** El contenedor del contenido (wineAdditionalInfoContent) tiene `flex: 1` pero sin `justifyContent: 'center'`. El bloque de información (WineInfoBlock / contenido del cóctel) queda alineado al **inicio** del hero, por lo que todo el espacio sobrante queda **debajo** de la ficha.
3. **Dependencia del dispositivo:** En pantallas más altas o con más espacio vertical, el hero es más alto y el efecto (mucho hueco bajo la ficha) se nota más. Donde la altura es justa, no sobra espacio y se ve “bien”.
4. **Coctelería:** Misma lógica: el área bajo la imagen es `flex: 1` (wineAdditionalInfo); el ScrollView no hace que su contenido quede centrado verticalmente cuando el contenido es más bajo que el área.

---

## 4. Propuesta de cambio mínimo

- **Centrar verticalmente el contenido de la ficha dentro del hero**, sin tocar alturas fijas ni la lógica de datos:
  - En el estilo **wineAdditionalInfoContent** añadir **`justifyContent: 'center'`**. Así, cuando el hero tenga más altura que el contenido, la ficha (WineInfoBlock) quedará centrada; cuando el contenido sea más alto que el área, se seguirá mostrando desde arriba (y se recorta por `overflow: 'hidden'` del padre), comportamiento aceptable y ya existente en dispositivos pequeños.
  - En la card de **coctelería**, en el `contentContainerStyle` del ScrollView añadir **`flexGrow: 1`** para que el contenedor del contenido ocupe toda la altura del ScrollView y el `justifyContent: 'center'` del estilo base tenga efecto, centrando el contenido cuando sea más bajo que el área.

No se modifican: `minHeight` de card, alturas de imagen/sensorial, ni estructura de datos; solo alineación del contenido dentro del hero compartido.

---

## 5. Cambios aplicados (segunda iteración — límite de altura del hero)

- **wineCardBody:** Se añade `justifyContent: 'space-between'` para repartir los tres bloques (topGridRow, hero, footer) y que el espacio sobrante no quede solo debajo del hero.
- **wineAdditionalInfo (StyleSheet):** Se añade `maxHeight: 260` (phone) para que el hero no siga creciendo en pantallas altas.
- **Card vino (ImageBackground):** `style={[styles.wineAdditionalInfo, stableIsTablet && { maxHeight: 300 }]}`.
- **Card vino (View sin fondo):** Se añade `maxHeight: 300` en el override de tablet (junto al `minHeight: 240` ya existente).
- **Card coctelería (ImageBackground):** `style={[styles.wineAdditionalInfo, stableIsTablet && { maxHeight: 300 }]}`.

(La iteración anterior — `justifyContent: 'center'` en wineAdditionalInfoContent y `flexGrow: 1` en coctelería — se mantiene para que el contenido siga centrado dentro del hero cuando quepa.)

---

## 6. Por qué este cambio sí se nota visualmente

- **Antes:** El hero era el único hijo con `flex: 1` en `wineCardBody`, así que se quedaba con **todo** el alto restante. A más altura de card/pantalla, más alto el hero y más espacio vacío bajo la ficha.
- **Ahora:** Con `maxHeight: 260` (phone) / `300` (tablet), el hero **deja de crecer** más allá de ese techo. El espacio sobrante queda en `wineCardBody`. Con `justifyContent: 'space-between'`, ese espacio se reparte **entre** los tres bloques (arriba del hero, entre hero y footer), de modo que ya no se acumula todo debajo de la ficha y la proporción de la card mejora.

---

## 7. Por qué no rompe otros dispositivos

- **Dispositivos donde ya se veía bien:** Ahí el espacio vertical es justo: el contenido ocupa casi toda la altura del hero. Con `justifyContent: 'center'` el contenido sigue cabiendo y se centra en ese mismo espacio; el aspecto sigue siendo “lleno” y no se introduce hueco extra.
- **Dispositivos con poco espacio:** Si el contenido es más alto que el hero, sigue habiendo `overflow: 'hidden'` en wineAdditionalInfo; se recorta por abajo como antes. La única diferencia es que el bloque puede quedar ligeramente centrado en vertical, por lo que se podría recortar un poco por arriba y por abajo en lugar de solo por abajo; en la práctica el contenido de la ficha tiene altura acotada y en phones típicos ya cabía, por lo que el riesgo de recorte molesto es bajo.
- **Tablet:** Misma lógica; minHeight 540 y el hero con flex: 1. Centrar mejora la proporción cuando sobra espacio y no cambia el comportamiento cuando no sobra.
- **Coctelería:** ScrollView con `flexGrow: 1` en contentContainer hace que, cuando el contenido es corto, quede centrado; cuando es largo, el scroll sigue permitiendo ver todo. No se añade altura fija ni se cambia la estructura.

- **Donde el hero ya era &lt; 260px:** El `maxHeight` no recorta; el hero sigue con su altura natural. `space-between` apenas cambia la distribución si no hay espacio sobrante.
- **Donde el hero era &gt; 260px:** El hero se limita a 260/300px y el resto se reparte; se elimina el “tubo” de espacio muerto bajo la ficha.
