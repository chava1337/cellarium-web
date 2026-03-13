# Reporte informativo: WineManagementScreen.tsx (estado actual)

**Objetivo:** Documentar todo lo implementado en `src/screens/WineManagementScreen.tsx`, pantalla real usada por "Escanear botella" (anverso obligatorio, reverso opcional, fotos adicionales, Cámara Pro/Galería, IA). Sin cambios de código; solo evidencia "as-is".

---

## 1) Flujo UI completo

### Secciones (paso `capture`)

- **Card principal (hero):** Texto descriptivo `t('wine_mgmt.hero_description')` (ej. "Toma fotos claras de tu botella. La IA buscará…").
- **Anverso de la etiqueta (obligatorio):**
  - Título: `t('wine_mgmt.front_label')` — "Anverso de la etiqueta (obligatorio)".
  - Hint: "Usa una foto frontal, bien enfocada y sin reflejos."
  - Si hay imagen: preview + botón ✕ para eliminar (`setFrontLabelImage(null)`).
  - Si no hay: dos botones — "Cámara Pro" (`handleOpenProCameraFront`) y "Galería" (`handleSelectFrontFromGallery`).
- **Reverso de la etiqueta (opcional):**
  - Título: `t('wine_mgmt.back_label')` — "Reverso de la etiqueta (opcional)".
  - Hint: "Inclúyela si hay información de uvas, alcohol o notas de cata."
  - Misma estructura: preview + ✕ o Cámara Pro / Galería (`handleOpenProCameraBack`, `handleSelectBackFromGallery`).
- **Fotos adicionales (opcional):**
  - Título: `t('wine_mgmt.additional_photos')`.
  - Hint: "Puedes añadir el cuello de la botella, cápsula o detalles del envase."
  - Lista de previews en grid con ✕ por imagen (`handleRemoveAdditionalImage(index)`).
  - Botones: Cámara Pro (`handleCaptureAdditionalImage` → ProCamera en modo `'additional'`) y Galería (`handleSelectAdditionalFromGallery`).
- **Botón "Procesar con IA":** Solo visible si `frontLabelImage` existe; llama `processMultipleLabels`. No hay botón explícito "Reintentar"; al fallar se vuelve a `capture` y el usuario puede pulsar de nuevo.
- **Botón "Agregar manualmente":** `setStep('review')` y `setWineData({})`; lleva al formulario de revisión sin pasar por IA.

### Estados de paso (`step`)

- **`capture`:** Pantalla de captura (secciones anteriores).
- **`processing`:** Pantalla con `CellariumLoader` ("Procesando etiqueta...") y texto "La IA está reconociendo el vino y generando la descripción". Si existe `labelImage`, se muestra una miniatura.
- **`review`:** Formulario de revisión/edición (datos del vino, sensorial, precios, stock) y botón "Guardar vino".
- **`images`:** Selector de imagen de botella (sugeridas por IA o "Subir propia"); al continuar vuelve a `review` con la imagen elegida en `wineData.front_label_image` / `image_url`.

### Previews y eliminación

- **Anverso:** Preview con `Image source={{ uri: frontLabelImage }}`; botón ✕ → `setFrontLabelImage(null)`.
- **Reverso:** Igual con `backLabelImage`; ✕ → `setBackLabelImage(null)`.
- **Adicionales:** Grid de imágenes; ✕ por ítem → `handleRemoveAdditionalImage(index)` (filter por índice).
- En **review** se muestra una sola preview: `labelImage || wineData.front_label_image || wineData.image_url`. Botón "Cambiar imagen" / "Seleccionar imagen" lleva a paso `images`.

### Validaciones

- **Anverso obligatorio:** En `processMultipleLabels`, si `!frontLabelImage` → `Alert.alert(t('msg.error'), t('wine_mgmt.error_no_front'))` y return; el botón "Procesar con IA" solo se muestra si hay anverso.
- **Guardar (review):** `handleSaveWine` valida campos obligatorios (`name`, `winery`, `grape_variety`, `vintage`, `type`, `region`, `country`, `alcohol_content`, `description`), `initial_stock > 0`, `currentBranch` y `user`; si falta algo muestra Alert con los nombres de campos y no guarda.

### Estados loading / error / success

- **Loading:** `processing === true` muestra un `Modal` global con `CellariumLoader` y "Procesando…". En paso `processing` se muestra además la pantalla con loader y subtítulo.
- **Error al procesar:** En `processMultipleLabels` o `processLabel`, el `catch` hace `Alert.alert(t('msg.error'), t('wine_mgmt.error_process_labels')` o `error_process` y `setStep('capture')`; no se limpian `frontLabelImage`, `backLabelImage` ni `additionalImages`.
- **Error al guardar:** Se usa `mapSupabaseErrorToUi`; Alert con título/mensaje y opcionalmente CTA a Subscriptions.
- **Éxito al guardar:** Alert con "Vino guardado" y dos opciones: "Agregar otro" (reset a `capture` limpiando `labelImage`, `wineData`, `suggestedImages`, `selectedImage`; **no** se limpian `frontLabelImage`, `backLabelImage`, `additionalImages`) o "Ver catálogo" (`navigation.goBack()`).

---

## 2) Estado local y modelo de datos

### useState

| Variable | Tipo | Uso |
|----------|------|-----|
| `step` | `'capture' \| 'processing' \| 'review' \| 'images'` | Paso actual del flujo. |
| `labelImage` | `string \| null` | Imagen única legacy; se mantiene en paralelo con front (p. ej. al elegir anverso se hace también `setLabelImage`). |
| `frontLabelImage` | `string \| null` | URI del anverso. |
| `backLabelImage` | `string \| null` | URI del reverso. |
| `additionalImages` | `string[]` | URIs de fotos adicionales. |
| `processing` | `boolean` | Bloqueo durante procesamiento IA o guardado. |
| `wineData` | `Partial<WineFormData>` | Datos del formulario (nombre, bodega, tipo, sensorial, precios, stock, URIs de imágenes). |
| `suggestedImages` | `any[]` | Imágenes sugeridas por IA (searchBottleImages); no se rellenan en el flujo múltiple actual (solo en `processLabel` de una sola imagen). |
| `selectedImage` | `string \| null` | URL elegida en el paso `images`. |
| `showProCamera` | `boolean` | Modal de cámara profesional visible. |
| `proCameraMode` | `'front' \| 'back' \| null` | No hay `'additional'` en el tipo; en código se usa el string `'additional'` para fotos adicionales. |

### useRef

No se usa ningún `useRef` en esta pantalla.

### Payload final para IA

- **Función:** `processMultipleLabels` (líneas 264–376).
- **Inputs:** `frontLabelImage` (obligatorio), `backLabelImage` (opcional), `additionalImages[]` (opcional).
- **Llamadas:** Por cada imagen se llama `processWineLabel(uri)` (WineAIService). Primero frontal, luego reverso (si existe), luego cada adicional en bucle (los fallos de adicionales se capturan con try/catch y se continúa).
- **Combinación:** Se construye `allResults = [frontResult, backResult, ...additionalResults].filter(Boolean)`. Con una función `getBestValue(field, defaultValue)` se recorre ese array y se toma el primer valor no vacío/no "No especificado" por campo. Esos valores se mapean a `combinedData` (WineFormData parcial) incluyendo `front_label_image`, `back_label_image`, `additional_images` como URIs locales. No se envía `branch_id`, `owner_id` ni `language` al servicio de IA; `processWineLabel` solo recibe la URI de cada imagen.

### Fuentes de verdad externas

- **Auth:** `useAuth()` → `user` (para `user.id`, `user.owner_id` al guardar).
- **Branch:** `useBranch()` → `currentBranch` (para `currentBranch.id` al guardar).
- **Idioma:** `useLanguage()` → `t` para textos.
- **Guard de admin:** `useAdminGuard({ navigation, route, allowedRoles: ['owner', 'gerente', 'sommelier', 'supervisor'] })`; si no pasa, se muestra loader, PendingApproval o null.
- **Props:** `navigation`, `route`; no se leen `route.params` en el flujo actual.

---

## 3) Captura y selección de imágenes

### Librerías

- **expo-image-picker:** Para galería y cámara estándar (`launchImageLibraryAsync`, `launchCameraAsync`). Opciones: `mediaTypes: ImagePicker.MediaTypeOptions.Images`, `quality: 0.8`, `allowsEditing: true`, `aspect: [3, 4]`.
- **ProWineCamera** (`../modules/camera`): Para "Cámara Pro" en modal; recibe `onWarped`, `onOriginal`, `onError`, `config` (minArea, minAspect, stabilityFrames, autoShoot, showGuide, guideShape). Al capturar se llama `handleProCameraCapture(uri)`.
- **expo-file-system/legacy:** Para leer URIs locales en base64 al subir a Storage (`FileSystem.readAsStringAsync(..., { encoding: 'base64' })`) y en `convertLocalImageToUri`.
- No se usa expo-image-manipulator ni un crop modal propio en esta pantalla; el recorte es el nativo de ImagePicker (`allowsEditing`, `aspect`).

### Permisos

- **Galería:** `ImagePicker.requestMediaLibraryPermissionsAsync()` antes de cada `launchImageLibraryAsync`; si `!granted` → `Alert.alert(t('wine_mgmt.permission_required'), t('wine_mgmt.gallery_access'))`.
- **Cámara:** `ImagePicker.requestCameraPermissionsAsync()` antes de cada `launchCameraAsync`; si `!granted` → Alert con `t('wine_mgmt.camera_access')`.
- La cámara Pro (ProWineCamera) gestiona sus propios permisos internamente (react-native-vision-camera).

### Compresión / tamaños / calidad

- ImagePicker: `quality: 0.8`, `aspect: [3, 4]`. No hay lógica phone/tablet en esta pantalla; no se usa useDeviceInfo ni tamaños distintos por dispositivo.

### Helper de URI

- `convertLocalImageToUri(uri)`: Si la URI ya es `file://` la devuelve; si empieza por `/data/` o `/storage/` le añade `file://`; si no, la devuelve tal cual. Se usa después de la captura de ProWineCamera para asignar la URI a front/back/additional.

---

## 4) Pipeline IA

### Ubicación y función

- **Servicio:** `src/services/WineAIService.ts`.
- **Función usada:** `processWineLabel(imageUri: string)` (exportada y llamada desde WineManagementScreen).

### Inputs

- **Único argumento:** `imageUri` (string URI de la imagen). No se envían branch_id, owner_id, language ni tipo de etiqueta (front/back/additional); la pantalla llama una vez por imagen y combina resultados en cliente.

### Flujo interno de `processWineLabel`

1. **recognizeWineLabel(imageUri):** Convierte imagen a base64 (FileSystem para locales, fetch para remotas), llama a **Google Vision API** (`images:annotate`) con TEXT_DETECTION, LOGO_DETECTION, LABEL_DETECTION; procesa texto con `processWineText` y devuelve `WineRecognitionResult` (name, winery, vintage, grape_variety, type, region, country, alcohol_content, confidence, raw_text). En error usa fallback mock.
2. **generateWineDescription(recognition):** Llama a **OpenAI GPT** (gpt-3.5-turbo) con prompt de sommelier; devuelve `WineDescription` (description, tasting_notes, food_pairings, serving_temperature, body_level, sweetness_level, acidity_level, intensity_level). En error usa mocks por tipo.
3. **searchBottleImages(name, winery, vintage):** Mock: delay 1s y devuelve array de imágenes de ejemplo (Vivino, Wine-Searcher, Decanter). No hay búsqueda real.

### Outputs de `processWineLabel`

- Retorno: `{ recognition, description, suggestedImages: images, success: true }`.
- No hay en el servicio ningún "match en catálogo canónico", ni lista de candidatos ni confidence de matching; solo reconocimiento + descripción + imágenes sugeridas (mock).

### Decisión "existe en canónico" vs "crear desde cero"

- **No existe en esta pantalla ni en WineAIService.** Siempre se trata como "crear desde cero": se combinan los resultados de todas las fotos en `processMultipleLabels`, se rellenan `wineData` y se pasa a paso `review`. No se consulta GlobalWineCatalog ni se navega a AddWineToCatalog con un vino existente; el usuario edita el formulario y guarda con `handleSaveWine`, que crea un vino nuevo en la sucursal.

### Dónde se guardan y muestran los resultados

- Resultados combinados → `setWineData(combinedData)` y `setStep('review')`. En review se muestran los campos en el formulario; las imágenes sugeridas se rellenan en `suggestedImages` solo cuando se usa el flujo de una sola imagen (`processLabel`), no en `processMultipleLabels` (que no asigna `setSuggestedImages`). El paso `images` usa `suggestedImages` si tiene datos; si no, solo queda "Subir propia".

---

## 5) Persistencia

### Si hay "match" (no aplica)

- No hay flujo de match con catálogo canónico; no se agrega un vino existente al menú del branch desde esta pantalla.

### Crear vino nuevo (flujo actual)

- **Función:** `handleSaveWine`.
- **Imagen:** Se toma `imageSource = wineData.front_label_image || wineData.image_url || frontLabelImage || labelImage || selectedImage`. Si es local (file:// o path), se sube a **Supabase Storage** bucket `wine-bottles`, path `{user.id}/wines/{fileName}`; se obtiene URL pública y se usa como `finalImageUrl`. Solo se sube **una** imagen (la frontal); `back_label_image` y `additional_images` se pasan en `wineToSave` como `wineData.back_label_image` y no se suben en este código (quedan como URIs locales si lo son; la tabla `wines` podría recibir null o una URI no válida según schema).
- **Tablas / servicio:** `WineService.createWineWithStock(wineToSave, currentBranch.id, user.owner_id || user.id, wineData.initial_stock, wineData.price_glass, wineData.price_bottle)`. Dentro del servicio:
  - **Insert en `wines`:** con los campos del vino (name, winery, type, image_url, front_label_image, back_label_image, etc.) y `owner_id: ownerId`, `created_by` / `updated_by` = user.id.
  - **Insert en `wine_branch_stock`:** wine_id, branch_id, owner_id, stock_quantity, price_by_glass, price_by_bottle, min_stock.
- No se usa RPC ni Edge Function para crear el vino; son inserts directos vía supabase client.

### Si no hay match / creación manual

- No hay navegación a otra pantalla para "crear desde cero"; el mismo formulario de revisión sirve para editar y guardar. El botón "Agregar manualmente" solo pone `step = 'review'` y `wineData = {}`; el usuario rellena todo a mano y guarda con el mismo `handleSaveWine`. No se navega a AddWineToCatalog, CreateWine ni GlobalWineCatalog con parámetros.

### IDs usados

- `currentBranch.id`, `user.owner_id || user.id`, `user.id` (created_by, updated_by), `savedWine.id` tras el insert (solo para log; no se navega a detalle de vino).

---

## 6) Navegación

### Entrada

- Desde **AdminDashboard:** ítem "Escanear botella" → `navigation.navigate('WineManagement')` (sin params).

### Salidas

- **goBack():** Tras "Ver catálogo" en el Alert de éxito, o desde el header si existiera (en el código actual el header no tiene botón atrás visible; se asume que el usuario usa el gesto o la barra del stack).
- **navigation.navigate('Subscriptions'):** Solo desde el Alert de error al guardar, cuando `mapSupabaseErrorToUi` devuelve `ctaAction === 'subscriptions'` (p. ej. límite de plan).
- No hay navegación a CreateWine, EditWine, GlobalWineCatalog, AddWineToCatalog ni FichaExtendida en este flujo.

---

## 7) Riesgos / pendientes (solo observación)

- **evidenceFirstWineService:** Importado pero no usado en el archivo; código muerto.
- **proCameraMode:** Tipo `'front' | 'back' | null` pero se asigna `'additional'`; TypeScript podría quejarse o el tipo está ampliado en otro sitio.
- **back_label_image / additional_images al guardar:** Solo la imagen frontal se sube a Storage; `back_label_image` se envía como `wineData.back_label_image` (suele ser URI local). Si la tabla espera URLs públicas, podría guardarse una URI inválida o null; las adicionales no se envían en `wineToSave` en el fragmento revisado (solo front_label_image y back_label_image en el objeto).
- **Reset tras éxito "Agregar otro":** No se limpian `frontLabelImage`, `backLabelImage`, `additionalImages`; la siguiente captura puede arrastrar fotos anteriores.
- **Reset tras error de IA:** Se hace `setStep('capture')` pero no se vacían las imágenes; el usuario puede reintentar con las mismas fotos (comportamiento aceptable) o quedar con datos viejos si cambia de flujo.
- **Doble submit en "Procesar con IA":** No hay comprobación de `processing` al inicio de `processMultipleLabels`; si el usuario pulsa dos veces rápido se pueden lanzar dos pipelines en paralelo. En "Guardar vino" el botón sí se deshabilita con `disabled={processing}`.
- **WineService.createWineWithStock:** El servicio tiene TODOs sobre enforcement en BD (límites de suscripción); la validación actual en front es opcional (ownerUser, currentWineCount); el backend podría no estar aplicando el mismo límite.
- **searchBottleImages:** Mock; las URLs de ejemplo (Vivino, etc.) pueden no ser válidas; `suggestedImages` en el flujo múltiple no se rellena porque `processMultipleLabels` no asigna `setSuggestedImages`.
- **Placeholders:** Varios campos del formulario usan `placeholder` con claves `t('wine_mgmt.placeholder_*')` o texto fijo ("2015", "13.5", "150", "850", "12"); sin error de lógica, solo detalle de UX.

---

## Mapa del flujo (diagrama textual)

```
Usuario entra (AdminDashboard → WineManagement)
    │
    ▼
[ PASO: capture ]
    │  Anverso (obligatorio) ← Cámara Pro / Galería
    │  Reverso (opcional)   ← Cámara Pro / Galería
    │  Adicionales (opcional) ← Cámara Pro / Galería
    │
    ├─ "Agregar manualmente" ──► step = review, wineData = {}
    │
    └─ "Procesar con IA" (si hay anverso)
           │
           ▼
    [ PASO: processing ]
           │  processWineLabel(front) → processWineLabel(back?) → processWineLabel(additional[])?
           │  Combinar resultados (getBestValue por campo) → setWineData(combinedData)
           ▼
    [ PASO: review ]
           │  Formulario editable (nombre, bodega, tipo, sensorial, precios, stock)
           │  Opción "Cambiar imagen" → step = images
           │
           └─ "Guardar vino"
                  │  Validar campos obligatorios y stock
                  │  Subir 1 imagen (frontal) a Storage wine-bottles
                  │  WineService.createWineWithStock(...) → insert wines + wine_branch_stock
                  ▼
           Alert éxito → "Agregar otro" (reset parcial) | "Ver catálogo" (goBack)
```

---

## Archivos relacionados

| Archivo | Uso |
|---------|-----|
| `src/screens/WineManagementScreen.tsx` | Pantalla documentada. |
| `src/services/WineAIService.ts` | `processWineLabel`, `recognizeWineLabel`, `generateWineDescription`, `searchBottleImages`. |
| `src/services/WineService.ts` | `createWineWithStock` (insert wines + wine_branch_stock). |
| `src/modules/camera/index.ts` (ProWineCamera) | Cámara profesional en modal. |
| `src/contexts/AuthContext.tsx` | useAuth → user. |
| `src/contexts/BranchContext.tsx` | useBranch → currentBranch. |
| `src/utils/supabaseErrorMapper.ts` | mapSupabaseErrorToUi en catch de handleSaveWine. |
| `src/services/EvidenceFirstWineService.ts` | Importado en WineManagementScreen pero no usado. |

---

*Reporte solo informativo; no se ha modificado código.*
