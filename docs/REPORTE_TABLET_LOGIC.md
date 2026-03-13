# Reporte: Lógica de tablet en el proyecto Cellarium

**Objetivo:** Documentar cómo se detecta “tablet” y qué diferencias aplica la app (layouts, backgrounds, tamaños). Sin cambios de código; solo informativo.

---

## (a) Dónde se detecta tablet

### 1. Fuente de verdad: `useDeviceInfo`

- **Archivo:** `src/hooks/useDeviceInfo.ts`
- **Método:** Solo **dimensiones de ventana** (`Dimensions.get('window')` de React Native). No se usa `expo-device`, ni `react-native-device-info`, ni `Platform` para decidir tablet.
- **Criterio de tablet:**

```ts
const { width, height } = Dimensions.get('window');
const minDimension = Math.min(width, height);
const maxDimension = Math.max(width, height);
const screenArea = width * height;
// Tablet si: mínimo >= 600px Y máximo >= 800px Y área >= 600,000px²
const isTablet = minDimension >= 600 && maxDimension >= 800 && screenArea >= 600000;
```

- **Valores devueltos:** `deviceType: 'tablet' | 'phone'` (no hay `'desktop'`). También `isTablet`, `isPhone`, `orientation`, `screenWidth`, `screenHeight`, `recommendedOrientation` (tablet → `'landscape'`, phone → `'portrait'`).
- **Actualización:** Un listener `Dimensions.addEventListener('change', updateDeviceInfo)` actualiza el estado al rotar o redimensionar.

### 2. Helper de layout recomendado (no usado en catálogo)

- **Archivo:** `src/hooks/useDeviceInfo.ts` — `getRecommendedLayout(deviceInfo)`.
- **Tablet:** `{ orientation: 'landscape', columns: 2, cardWidth: '48%', headerHeight: 80, padding: 20 }`.
- **Phone:** `{ orientation: 'portrait', columns: 1, cardWidth: '100%', headerHeight: 60, padding: 16 }`.
- **Uso:** En `WineCatalogScreen` se llama `const layout = getRecommendedLayout(deviceInfo)` pero **`layout` no se usa** en el render; el catálogo usa las dimensiones de `theme.ts` (ver más abajo).

---

## (b) Pantallas que aplican lógica tablet

| Pantalla / componente | Cómo detecta tablet | Qué cambia en tablet |
|------------------------|---------------------|----------------------|
| **WineCatalogScreen** | `useDeviceInfo()` → `stableIsTablet` (estado estable con debounce) | Ver sección (c). |
| **CocktailManagementScreen** | `useDeviceInfo()` → `deviceInfo.deviceType === 'tablet'` | Compresión de imagen: `maxWidth` 736 vs 512; no hay cambios de layout de grid en el código revisado. |
| **InventoryManagementScreen** | **Breakpoint propio:** `const isTablet = SCREEN_WIDTH >= 768` (module-level, `Dimensions.get('window')` una vez). Usa `useDeviceInfo()` pero **no** `deviceInfo.deviceType**. | Cards: `isTablet && styles.inventoryCardTablet`; modales: `isTablet && styles.modalContentTablet`; dimensiones de imagen en estilos: `width/height` 120/180 (tablet) vs 80/120 (phone). |
| **LanguageSelector** | `useDeviceInfo()` → `deviceInfo.deviceType === 'tablet'` | Tamaño del selector: 36 vs 32. |
| **DeviceInfo** (componente debug) | `useDeviceInfo()` | Solo muestra tipo/orientación/resolución. |
| **GlobalWineCatalogScreen** | No se encontraron condicionales por `deviceType` ni `isTablet`. Usa `Dimensions` para ancho pero sin lógica tablet explícita. | Nada específico de tablet documentado. |
| **AnalyticsScreen / InventoryAnalyticsScreen** | Usan `Dimensions.get('window').width` para cálculos de ancho; **no** hay checks de `deviceType` ni `isTablet`. | Sin ramas específicas tablet. |

---

## (c) Resumen: WineCatalogScreen en tablet

### Detección y estado estable

- **Archivo:** `src/screens/WineCatalogScreen.tsx`
- **Hook:** `const deviceInfo = useDeviceInfo();`
- **Estado estable:** `stableIsTablet` se actualiza desde `deviceInfo.deviceType === 'tablet'` con un `setTimeout` (debounce) para evitar cambios bruscos. En el código se indica que **`stableIsTablet` es la única fuente de verdad** para decisiones tablet/phone en esta pantalla.

### Grid / carrusel (no numColumns)

- La lista es un **FlatList horizontal** (carrusel); no hay `numColumns`.
- **Dimensiones:** Si `stableIsTablet` → `getWineCarouselDimensionsForTablet()` (`src/constants/theme.ts`), si no → `getWineCarouselDimensions()`.
- **theme.ts (tablet):** `ITEM_WIDTH: 400`, `ITEM_SPACING: 50` (phone: 280 y 35).
- **FlatList:** `key={stableIsTablet ? 'tablet' : 'phone'}` para forzar re-mount al cambiar tipo; `snapToInterval`, `getItemLayout` y `contentContainerStyle` usan `carouselDimensions` (ITEM_FULL, CONTENT_PAD, etc.).

### Backgrounds

- **Wine cards (ficha principal del vino):** `getWineCardBackground(wine.type)` devuelve la misma imagen por tipo (red, white, sparkling, dessert, fortified). **No hay assets distintos para tablet** (mismo `wine-card-*.png` en phone y tablet).
- **Cocktail card (ficha “Ingredientes:”):** Sí hay background distinto por dispositivo:
  - `stableIsTablet` → `require('../../assets/images/bg_cocktail_tablet.jpg')`
  - Phone → `require('../../assets/images/bg_cocktail_phone.jpg')`
- **Headers / catálogo general:** No se usan `bg_catalog_tablet`, `bg_header_tablet`, etc. en el código actual. El reporte de imágenes indica que existen en disco pero no están referenciados.

### Overlay (LinearGradient)

- **Wine card:** El bloque con `ImageBackground` usa un único `LinearGradient` (blanco semitransparente: 0.45 → 0.65 → 0.1). **No hay variante por tablet**; mismo overlay en phone y tablet.
- **Cocktail card:** Overlay oscuro fijo (no depende de tablet).

### Ajustes de layout/UI por tablet en WineCatalogScreen

- **Card de vino:** `minHeight: 540` (tablet) en el wrapper; bloque de información sin fondo tiene `minHeight: 240` en tablet; `WineImageBlock`: altura 200 vs 180, padding 12 vs 8; `WineSensoryBlock`: sectionHeight 200 vs 180, sectionPadding 12 vs 8; chips de tipo (Tinto/Blanco/etc.): tamaños mayores en tablet (chipWidth 108/92, chipHeight 70/60, borderRadius 18/16, iconSize 26/24, fontSize 12/11); barras sensoriales: barHeight 14/10.5, labelFontSize 12/10, márgenes y paddings mayores; `WineInfoBlock` y precios: paddings 20/16, estilos `priceValueTablet` vs `priceValuePhone`, botones de configuración y compra con altura 56/50 y fontSize 16/15; `WinePricesBlock` recibe `isTablet={stableIsTablet}`.
- **Card de coctel:** Altura del área de imagen 280 en tablet; padding 16/12; padding horizontal del footer 20/16; fontSize del precio 18/16.
- **Header (nombre de sucursal):** `fontSize` 22 vs 18; input de edición `maxWidth: 400` en tablet.
- **Bottom padding:** En guest, valor base mayor en tablet (140 vs 220/180 en Android).
- **Filtros / chips de tipo:** Separación entre ítems (`ItemSeparatorComponent`) 12 vs 10; padding horizontal 20/16 y 18/14 en zonas del header; botones de filtro 40x40 vs 36x36.

---

## Validación y riesgos

1. **Inconsistencia de breakpoint (InventoryManagementScreen)**  
   Usa **768px** como umbral (`SCREEN_WIDTH >= 768`) y lo calcula una sola vez al cargar el módulo. El hook global usa **600 / 800 / 600000** y se actualiza con `Dimensions.addEventListener('change')`. En ventanas entre 600–768px o al rotar, Inventory puede comportarse como “tablet” mientras WineCatalog como “phone”, o al revés según ancho.

2. **`getRecommendedLayout` sin uso en WineCatalogScreen**  
   Se obtiene `layout` pero no se usa para columnas ni ancho de card; el catálogo depende solo de `theme.ts`. Si en el futuro se quisiera un grid 2 columnas en tablet, habría que conectar este layout o unificar con las constantes de theme.

3. **Posible deviceType siempre phone**  
   Si en algún entorno `Dimensions.get('window')` devuelve valores pequeños (ej. Web o emulador mal configurado), `deviceType` nunca será `'tablet'`. La lógica es correcta para móvil/tablet real; solo conviene tenerlo en cuenta en pruebas.

4. **Estilos “tablet” en theme**  
   `TABLET_CAROUSEL_CONFIG` tiene valores fijos (ITEM_WIDTH 400, ITEM_SPACING 50). En pantallas muy grandes o muy pequeñas (tablets pequeñas o phones muy anchos) podría ser deseable ajustar por `screenWidth`; hoy no se hace.

5. **GlobalWineCatalogScreen / Analytics**  
   No usan `useDeviceInfo` ni `deviceType`; solo dimensiones en bruto. Comportamiento en tablet no está unificado con el resto de la app.

---

## Referencia rápida de archivos

| Tema | Archivo(s) |
|------|------------|
| Detección tablet | `src/hooks/useDeviceInfo.ts` (líneas 16–24 y 40–46) |
| Dimensiones carrusel tablet | `src/constants/theme.ts` (TABLET_CAROUSEL_CONFIG, getWineCarouselDimensionsForTablet) |
| Uso estable en catálogo | `src/screens/WineCatalogScreen.tsx` (stableIsTablet, carouselDimensions, líneas ~141–177, 162–164) |
| Background cocktail por dispositivo | `src/screens/WineCatalogScreen.tsx` (líneas ~1827–1828: bg_cocktail_tablet.jpg / bg_cocktail_phone.jpg) |
| Breakpoint 768 (inventario) | `src/screens/InventoryManagementScreen.tsx` (líneas 46–47: SCREEN_WIDTH, isTablet) |
| Layout recomendado (no usado en catálogo) | `src/hooks/useDeviceInfo.ts` (getRecommendedLayout, líneas 87–104) |

---

*Reporte generado sin modificar código. Solo lectura y citas del código actual.*
