# Reporte: Manejo de imágenes en Cellarium (Expo RN)

Documento de auditoría para integrar correctamente nuevas imágenes (p. ej. backgrounds) sin margen de error.

---

## 1) Inventario de uso de imágenes

### Require / assets locales

| Archivo | Línea aprox. | Descripción |
|---------|---------------|-------------|
| `src/screens/WineCatalogScreen.tsx` | 1407–1418 | `getWineCardBackground(type)`: `require('../../assets/images/wine-card-fizzy.png')`, `wine-card-red.png`, `wine-card-white.png`. Comentados: rose, dessert, fortified. |
| `src/screens/AuthScreen.tsx` | 454 | Botón Google: `require('../../assets/images/android_dark_rd_ctn.png')`. |
| `src/screens/WelcomeScreen.tsx` | 29 | Logo: `require('../../assets/images/cellarium-logo.png')`. |
| `src/components/CellariumLoader.tsx` | 44 | Lottie: `require('../../assets/anim/cellarium_loader.json')`. |
| `src/screens/BootstrapScreen.tsx` | 34 | Rive: `require('../../assets/anim/splash_cellarium.riv')`. |

### Image / ImageBackground (RN)

| Archivo | Línea aprox. | Descripción |
|---------|---------------|-------------|
| `WineCatalogScreen.tsx` | 1778–1779 | `<Image source={{ uri: cocktail.image_url }}>` (coctel en carrusel). |
| `WineCatalogScreen.tsx` | 1809–1814 | `<ImageBackground source={getWineCardBackground('red')} resizeMode="cover">` + overlay LinearGradient (cocteles). |
| `WineCatalogScreen.tsx` | 1947–1951 | `<Image source={{ uri: wine.image_url }} resizeMode="contain">` o placeholder gris + icono `wine`. |
| `WineCatalogScreen.tsx` | 2315–2334 | `<ImageBackground source={getWineCardBackground(wine.type)} resizeMode="cover">` + overlay LinearGradient (vinos). |
| `AnalyticsScreen.tsx` | 311 | `<Image source={{ uri: wine.wine_image }}>`. |
| `InventoryManagementScreen.tsx` | 567, 764, 786, 1090 | `<Image source={{ uri: item.wines.image_url }}>` o `editingWine.wines.image_url`; fallback `placeholderImage` (View gris). |
| `InventoryAnalyticsScreen.tsx` | 614, 863, 1331 | `<Image source={{ uri: item.wines.image_url }}>` / `wine.wine_image`; fallback `placeholderImage`. |
| `WineManagementScreen.tsx` | 723, 765, 810, 877, 888, 1152 | Varias `<Image source={{ uri: ... }}>` (labels, preview, bottle IA). |
| `CocktailManagementScreen.tsx` | 499, 658 | Preview: `formData.imageUri \|\| formData.imageUrl`, `previewDrink.image_url`. |
| `CocktailCard.tsx` | 49 | `<Image source={{ uri: drink.image_url }} resizeMode="cover">` (thumb). |
| `CropImageModal.tsx` | 234 | `<Image source={{ uri: imageUri }}>` (imagen a recortar). |
| `CaptureWineLabelScreen.tsx` | 239, 245 | `result.originalUri`, `result.warpedUri`. |
| `CreateTastingExamScreen.tsx` | 199 | `<Image source={{ uri: wine.image_url }}>`. |
| `EvidenceFirstWineScreen.tsx` | 225 | `formData.labelBackImage`. |
| `TakeTastingExamScreen.tsx` | 876 | `currentWine.image_url`. |
| `GlobalWineCatalogScreen.tsx` | 564, 607 | `currentImageUrl`. |

### Helpers / “source of truth” por tipo

- **getWineCardBackground(wineType)** — `WineCatalogScreen.tsx` ~1404–1422.  
  Devuelve `require('../../assets/images/wine-card-<type>.png')` según `wineType` (`sparkling` → fizzy, `red`, `white`); `default` → `null`.  
  No hay `mapWineTypeToImage` ni `getWineImage`; imágenes de botella/etiqueta son siempre **remotas** (`image_url`, `front_label_image`, etc.).

### expo-image

- No se usa el paquete `expo-image` (componente `Image` de Expo).  
- Sí se usa: `expo-image-picker`, `expo-image-manipulator` (captura, crop, compresión).

### URLs remotas

- **Vinos:** `wine.image_url`, `wines.image_url`, `front_label_image`, `back_label_image`, `wine_image` (analytics). Origen: Supabase Storage (`wine-images`, etc.), URLs públicas.
- **Cocteles:** `drink.image_url`, `previewDrink.image_url`, `formData.imageUrl`. Origen: Supabase Storage (bucket cocktail-images).
- **Catálogo global:** `currentImageUrl` / `wine.image_url` desde API/canonical.

---

## 2) “Source of truth” por tipo de imagen

### A) Local assets (`/assets`)

- **Ubicación:** `assets/` (raíz) y `assets/images/`, `assets/anim/`.
- **Referencia:** siempre `require('../../assets/...')` o `require('../../../assets/...')` según profundidad del archivo (desde `src/screens` o `src/components`).
- **Formatos usados:** PNG, JPG, JSON (Lottie), RIV (Rive). No hay `import ... from` de assets; solo `require()`.
- **Props típicas:** `source={require(...)}`, `resizeMode="contain"` o `"cover"`, `style` con dimensiones cuando hace falta.
- **Fallback:** si `getWineCardBackground` devuelve `null`, se usa `<View>` sin imagen (solo contenido + gradiente de precios).

**Contenido actual de `assets/images/`:**

- `android_dark_rd_ctn.png` (+ @2x, @3x, @4x) — botón Google.
- `bg_catalog_phone.jpg`, `bg_catalog_tablet.jpg`, `bg_header_phone.jpg`, `bg_header_tablet.jpg` — **no referenciados en código** (candidatos para nuevo background).
- `cellarium-logo.png` — Welcome.
- `wine-card-fizzy.png`, `wine-card-red.png`, `wine-card-white.png` — fondos de tarjeta por tipo de vino/coctel.

**Raíz `assets/`:** `icon.png`, `splash.png`, `adaptive-icon.png`, `favicon.png`, `splash-icon.png`, `anim/` (Lottie + Rive).

### B) Remotas (Supabase / CDN)

- **Referencia:** `source={{ uri: url }}` con string que viene de API/Storage.
- **Props:** `resizeMode="contain"` o `"cover"` según pantalla; `style` obligatorio (p. ej. `wineImage`, `thumb`).
- **Fallback:** condicional `url ? <Image ... /> : <View style={[..., placeholderImage]} />` o icono (ej. `Ionicons name="wine"`). Estilo `placeholderImage`: fondo gris, mismo tamaño que la imagen.

### C) Generadas / derivadas

- **Gradientes:** `LinearGradient` (expo-linear-gradient) para headers, barras de precio, overlays. No son imágenes estáticas.
- **Placeholders:** `View` con `backgroundColor: '#f0f0f0'` o estilo `placeholderImage` + icono.
- No se usa blurhash ni placeholders remotos en el código revisado.

---

## 3) Pipeline y convenciones

### Estructura de carpetas

- `assets/` — icon, splash, favicon, adaptive-icon.
- `assets/images/` — logos, botones, **wine-card-*.png**, y (sin uso actual) bg_catalog_*, bg_header_*.
- `assets/anim/` — Lottie (.json), Rive (.riv).

### Naming

- **Fondos por tipo de vino:** `wine-card-<type>.png` (red, white, fizzy; comentados: rose, dessert, fortified).
- **Backgrounds de pantalla:** existen `bg_catalog_phone.jpg`, `bg_catalog_tablet.jpg`, `bg_header_phone.jpg`, `bg_header_tablet.jpg` pero **no se referencian** en el código.

### Index / mapa central

- **No hay** `index.ts` que exporte assets.
- **Sí hay** un mapa implícito por tipo: `getWineCardBackground(wineType)` en `WineCatalogScreen.tsx` (switch con `require()` por caso). Para un nuevo tipo (p. ej. rosé) se añade un `case` y un `require('../../assets/images/wine-card-rose.png')`.

### Convención de uso

- Imágenes locales: siempre `require()` con ruta relativa al archivo.
- Remotas: siempre `{ uri: string }`; el string puede ser null/undefined y se comprueba antes de renderizar `<Image>`.

---

## 4) Reglas de Expo/Metro y compatibilidad

### app.config.js

- **icon:** `./assets/icon.png` (comentario: PNG 1024x1024, sin bordes redondeados ni padding excesivo).
- **android.adaptiveIcon:** `foregroundImage: "./assets/icon.png"`, `backgroundColor: "#6D1F2B"`.
- No hay `assetBundlePatterns` ni `packagerOpts` explícitos; Expo usa por defecto los assets referenciados por `require()`.

### metro.config.js

- `config.resolver.assetExts.push('riv');` — Rive permitido.
- No se añaden `png`/`jpg`/`webp`; ya vienen en el default de Expo/Metro.
- **Formatos permitidos/recomendados:** PNG, JPG, WEBP para imágenes; JSON para Lottie; RIV para Rive. SVG no aparece en assetExts (no se usan SVGs como asset en el inventario).

---

## 5) Caso específico: backgrounds temáticos (y el nuevo)

### Dónde existen backgrounds hoy

- **Tarjetas de vino/coctel en catálogo:** `ImageBackground` con `getWineCardBackground(type)` (solo red, white, sparkling). Overlay para legibilidad:
  - `LinearGradient` sobre el `ImageBackground`:
    - `colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0.65)', 'rgba(255,255,255,0.1)']}`
    - `start={{ x: 0, y: 0 }}` `end={{ x: 0, y: 1 }}`
    - `style={StyleSheet.absoluteFillObject}`
  - Así el texto no se pierde sobre la foto.

### Assets de background sin usar

- `assets/images/bg_catalog_phone.jpg`, `bg_catalog_tablet.jpg`, `bg_header_phone.jpg`, `bg_header_tablet.jpg` — presentes en disco pero **ningún require() ni referencia** en el código. Pueden usarse para pantalla de catálogo o header.

### Forma correcta de integrar un nuevo background

1. **Dónde guardarlo**  
   Ruta exacta: `assets/images/<nombre>.png` o `.jpg`.  
   Ejemplo: `assets/images/bg_catalog_phone.jpg` (ya existe; si es otro archivo nuevo, mismo directorio).

2. **Nombre recomendado**  
   Mantener convención: `bg_<contexto>_<variante>.jpg` (ej. `bg_catalog_phone`, `bg_catalog_tablet`, `bg_add_wine.jpg`).  
   Para fondos por tipo de vino (como las cards): `wine-card-<type>.png`.

3. **Exportación**  
   No hay `index` de assets. Uso directo con `require('../../assets/images/<nombre>.<ext>')` desde `src/screens/...` o un helper en la misma pantalla (como `getWineCardBackground`).

4. **Ejemplo de uso en pantalla**  
   Si el background es para una pantalla completa (ej. Catálogo o Add Wine):

   ```tsx
   import { ImageBackground } from 'react-native';
   import { LinearGradient } from 'expo-linear-gradient';

   // En el componente:
   const bgSource = require('../../assets/images/bg_catalog_phone.jpg'); // o según dispositivo

   <ImageBackground
     source={bgSource}
     resizeMode="cover"
     style={StyleSheet.absoluteFillObject}
   >
     <LinearGradient
       colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0.65)', 'rgba(255,255,255,0.1)']}
       start={{ x: 0, y: 0 }}
       end={{ x: 0, y: 1 }}
       style={StyleSheet.absoluteFillObject}
     />
     {/* Contenido (texto, botones) aquí */}
   </ImageBackground>
   ```

5. **Overlay para legibilidad**  
   Valores que ya se usan y funcionan:
   - **Gradiente blanco vertical:**  
     `colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0.65)', 'rgba(255,255,255,0.1)']}`  
     `start={{ x: 0, y: 0 }}` `end={{ x: 0, y: 1 }}`  
   - Alternativa más oscura: `rgba(0,0,0,0.3)` a `rgba(0,0,0,0.5)` si el fondo es claro.

---

## 6) Checklist “sin margen de error” para una nueva imagen (ej. background)

- [ ] **1. Copiar el archivo** a la ruta final, p. ej. `assets/images/<nombre>.png` o `.jpg`.  
      Evitar espacios y caracteres raros en el nombre.

- [ ] **2. Comprobar formato**  
      PNG o JPG/JPEG; para fondos grandes, JPG suele ser mejor.  
      Tamaño razonable (p. ej. &lt; 500 KB para fondos; el repo ya tiene wine-cards ~90–265 KB).

- [ ] **3. Exports / mapas**  
      Si es un fondo por “tipo” (como wine-card): añadir un `case` en `getWineCardBackground` en `WineCatalogScreen.tsx` con el `require()` correspondiente.  
      Si es un fondo de pantalla: usar `require()` en la pantalla que lo use (o un helper local en esa pantalla).

- [ ] **4. Uso en la pantalla**  
      Envolver contenido en `ImageBackground` + `LinearGradient` (o View semitransparente) con los valores de overlay indicados arriba.

- [ ] **5. Rutas de require**  
      Desde `src/screens/X.tsx` → `require('../../assets/images/<nombre>.<ext>')`.  
      Desde `src/components/X.tsx` → mismo patrón.  
      No usar `@/assets` (el alias `@` apunta a `./src`, no a `assets`).

- [ ] **6. Verificar en proyecto**  
      - `npx expo start` (o dev client): que la pantalla muestre la imagen y el overlay correctamente.  
      - iOS y Android (o al menos el que uses).  
      - Si hay web: comprobar también en web.

- [ ] **7. Bundling**  
      Metro incluye por defecto los assets usados por `require()`. No hace falta tocar `metro.config.js` para PNG/JPG.  
      Si añadieras SVG u otro formato nuevo, entonces sí revisar `assetExts`.

- [ ] **8. Build EAS**  
      Ejecutar un build (p. ej. `eas build --profile development --platform android`) y comprobar que el APK muestra la nueva imagen y que no hay errores de “asset not found” o similares.

---

## Riesgos detectados y soluciones

| Riesgo | Solución |
|--------|----------|
| **Assets sin usar** (`bg_catalog_*`, `bg_header_*`) | Decidir si se usan (integrar con el patrón anterior) o se eliminan para no inflar el bundle. |
| **Tamaño de wine-card-*.png** (~90–265 KB) | Aceptable para calidad; si se optimiza, comprimir con herramienta externa y reemplazar en `assets/images/`. |
| **Placeholder inconsistente** | Algunas pantallas usan `placeholderImage` (estilo), otras un `View` con backgroundColor + icono. Mantener el mismo criterio por tipo de lista (inventario vs catálogo). |
| **Rutas relativas** | Siempre `../../assets/` desde `src/screens`; un refactor a alias tipo `@assets` requeriría configurar Metro y posiblemente app.config. Por ahora seguir con require relativos. |

---

## Resumen rápido para “mi nuevo background”

1. Guardar imagen en **`assets/images/`** (ej. `bg_mi_pantalla.jpg`).
2. En la pantalla objetivo, hacer `const bg = require('../../assets/images/bg_mi_pantalla.jpg');`.
3. Envolver el contenido en `<ImageBackground source={bg} resizeMode="cover" style={...}>` y dentro un `<LinearGradient colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0.65)', 'rgba(255,255,255,0.1)']} start={{x:0,y:0}} end={{x:0,y:1}} style={StyleSheet.absoluteFillObject} />` para legibilidad del texto.
4. Probar en dev, luego en build EAS.

Si el background es por “tipo” (como las wine-cards), añadir un caso en `getWineCardBackground` en `WineCatalogScreen.tsx` y usar el mismo patrón `ImageBackground` + `LinearGradient` que ya tienen las tarjetas de vino y coctel.
