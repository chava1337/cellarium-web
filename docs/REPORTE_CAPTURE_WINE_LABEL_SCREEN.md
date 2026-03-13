# Reporte informativo: CaptureWineLabelScreen.tsx (estado actual)

**Objetivo:** Documentar todo lo implementado en `src/screens/CaptureWineLabelScreen.tsx` tal como está hoy, sin proponer cambios. Sirve para pulir la pantalla con seguridad.

**Nota importante:** En el dashboard admin, el ítem "Escanear botella" navega a **WineManagement** (`navigation.navigate('WineManagement')`), no a CaptureWineLabel. La pantalla con cards "Anverso / Reverso / Fotos adicionales" y botones "Cámara Pro" / "Galería" corresponde a **WineManagementScreen** (que usa `processWineLabel` de WineAIService). Este reporte describe únicamente **CaptureWineLabelScreen.tsx**, que es un flujo distinto: cámara profesional a pantalla completa.

---

## 1) Flujo UI completo

### Vista principal: cámara a pantalla completa

- **Contenedor:** `SafeAreaView` con fondo negro (`backgroundColor: 'black'`).
- **Modo por defecto:** Se muestra `ProWineCamera` a pantalla completa (`showCamera === true`).
- **Controles superiores (overlay):**
  - **Izquierda:** Botón "← Volver" que llama `navigation.goBack()`.
  - **Derecha:** Dos botones:
    - 🔍 Toggle **modo debug** (muestra estilo `activeButton` cuando `debugMode` está activo).
    - 🎯 Toggle **configuración de cámara** (alterna `autoShoot` en `currentConfig`).
- **Panel de estado (overlay):** Bloque en la parte superior izquierda con:
  - "Modo: Auto-disparo" o "Modo: Manual".
  - "Debug: ON" o "Debug: OFF".
  - "Capturas: N" (número de elementos en `captureResults`).
- **Botón flotante inferior:** "Ver Resultados (N)" solo si `captureResults.length > 0`; al pulsar pone `showCamera` en `false` y cambia a la vista de resultados.

No hay secciones tipo "Anverso (obligatorio)", "Reverso (opcional)" ni "Fotos adicionales (opcional)". No hay botones "Cámara Pro" / "Galería" en esta pantalla; todo el flujo es cámara en vivo → captura → resultados.

### Vista de resultados (cuando `showCamera === false`)

- **ScrollView** con fondo blanco.
- **Header:** "← Volver a Cámara" (vuelve a `setShowCamera(true)`) y "Limpiar" (llama `resetResults()` → `setCaptureResults([])`).
- **Título:** "Resultados de Captura".
- **Por cada elemento de `captureResults`:**
  - Título "Captura #1", "#2", etc.
  - **Original:** label "Original:" + `Image` con `result.originalUri`.
  - **Procesada (si existe):** label "Procesada:" + `Image` con `result.warpedUri`.
  - Botón verde "Procesar con OCR" que llama `processCapturedImage(result.warpedUri || result.originalUri)`.

### Estados visuales

- **Vacío:** Sin capturas; solo cámara + controles + panel de estado ("Capturas: 0"). No hay estado "vacío" explícito en la vista de resultados porque solo se entra a resultados cuando hay al menos una captura.
- **Cargando:** No hay `isLoading` ni indicador de carga en esta pantalla. El módulo `ProWineCamera` puede tener estados internos de disparo/procesamiento.
- **Éxito:** Tras captura procesada (warped), se muestra un **Alert** "¡Captura Exitosa!" con "La etiqueta ha sido capturada y procesada correctamente." y botones "Continuar" / "Ver Resultado" (este último hace `setShowCamera(false)`).
- **Error:** Errores de cámara se muestran con `Alert.alert('Error de Cámara', error)` vía `handleCameraError`.

### Previews y reemplazo/eliminación de imágenes

- Las imágenes se acumulan en `captureResults` (array de `CaptureResult`).
- **Eliminar todas:** botón "Limpiar" en la vista de resultados → `resetResults()` → `setCaptureResults([])`.
- **Eliminar una sola imagen** o **reemplazar** una imagen concreta no está implementado; no hay botones por ítem ni lógica para borrar/actualizar un índice de `captureResults`.

---

## 2) Modelo de estado y variables

### Estado (useState)

| Variable | Tipo | Uso |
|---------|------|-----|
| `captureResults` | `CaptureResult[]` | Lista de capturas; cada ítem tiene `originalUri`, `warpedUri?`, `quad?`, `timestamp`. |
| `showCamera` | `boolean` | `true` = vista cámara; `false` = vista "Resultados de Captura". |
| `currentConfig` | `CameraConfig` | Configuración pasada a `ProWineCamera` (p. ej. `autoShoot`). Inicial: `DEFAULT_CONFIG`. |
| `debugMode` | `boolean` | Si se muestra debug (quad) y si se pasa `onDebugQuad` a la cámara. |

### Tipo local

```ts
interface CaptureResult {
  originalUri: string;
  warpedUri?: string;
  quad?: Quad;
  timestamp: number;
}
```

### useRef

No se usa ningún `useRef` en esta pantalla.

### Fuentes de verdad

- **Navegación:** solo **props** `navigation` (tipo `StackNavigationProp<RootStackParamList, 'CaptureWineLabel'>`). No se usan `route.params`, ni Auth, ni Branch, ni rol.
- **Datos:** todo es estado local (`captureResults`, `showCamera`, `currentConfig`, `debugMode`). No hay llamadas a Supabase, ni a servicios de IA, ni a catálogo canónico en este archivo.

---

## 3) Captura y selección de imágenes

### Librerías

- **Cámara:** `ProWineCamera` (`src/modules/camera/ProWineCamera.tsx`). Usa **react-native-vision-camera** (`Camera`, `useCameraDevice`, etc.), no `expo-image-picker` ni `expo-camera`.
- **Procesamiento de imagen (warp):** Dentro del módulo cámara se usa `warpUtils` de `./lib/warp` y `geometryUtils` de `./lib/geometry` (tipos en `src/modules/camera/types.ts`). No se usa `expo-image-manipulator` en CaptureWineLabelScreen; el warp y la generación de `warpedUri` ocurren dentro de ProWineCamera.
- **Galería:** Esta pantalla **no** tiene opción "Galería"; solo cámara en vivo.

### Permisos

- Los permisos se gestionan **dentro de ProWineCamera**: `Camera.requestCameraPermission()` (react-native-vision-camera). Si se deniegan, se actualiza el estado con `error: 'Permisos de cámara denegados'` y se llama `onError?.('Permisos de cámara requeridos')`, que en CaptureWineLabelScreen es `handleCameraError` → `Alert.alert('Error de Cámara', error)`. No hay flujo específico en CaptureWineLabelScreen para "usuario negó permisos" más allá de ese Alert.

### Calidad / compresión

- No se define en CaptureWineLabelScreen. El módulo cámara usa `CameraConfig` con `outputWidth` y `outputAspect` (p. ej. en `DEFAULT_CONFIG`: `outputWidth: 1200`, `outputAspect: 4/5`). No hay lógica en este archivo para tamaños máximos, formato (JPEG/PNG) ni calidad de compresión.
- **originalUri:** proviene del callback `onOriginal` de ProWineCamera (imagen capturada sin warp).
- **warpedUri:** proviene de `onWarped` (imagen corregida por perspectiva). Se guardan ambos en `captureResults`; en la UI de resultados se muestran como "Original" y "Procesada".

---

## 4) Pipeline IA / búsqueda en catálogo canónico

- **En este archivo no hay integración con IA ni con catálogo canónico.**
- La única función que sugiere "procesamiento" es `processCapturedImage(uri: string)` (líneas 136–155):
  - Hace `console.log('🔍 Procesando imagen con OCR:', uri)`.
  - **Simula** un delay de 2 segundos (`await new Promise(resolve => setTimeout(resolve, 2000))`).
  - Muestra un Alert "Procesamiento Completado" / "La imagen ha sido procesada con éxito. Los datos del vino han sido extraídos."
  - No llama a ninguna Edge Function, ni a WineAIService, ni a Supabase, ni a ninguna API.
- En el código hay un comentario: *"Aquí se integraría con el sistema de OCR existente"*.
- No hay: payload (front/back/additional, branch_id, owner_id, language), respuesta estructurada (match, candidatos, datos extraídos), ni decisión "existe en catálogo" vs "crear desde cero". Todo eso correspondería a otra pantalla o a una futura integración en esta.

---

## 5) Persistencia / creación en BD

- **No hay** persistencia ni creación en BD en CaptureWineLabelScreen.
- No se inserta en ninguna tabla, no se llama a RPC ni a Edge Function, no se agrega vino al menú del branch.
- No hay navegación a otra pantalla tras "procesar" (solo el Alert de simulación); no se pasan parámetros a CreateWine, WineManagement, GlobalWineCatalog ni a ninguna ruta. Solo existe `navigation.goBack()` en el botón "Volver".

---

## 6) Manejo de errores y telemetría

- **Errores de cámara:** `handleCameraError(error)` → `console.error('❌ Error de cámara:', error)` y `Alert.alert('Error de Cámara', error)`.
- **Error en “procesamiento”:** Dentro de `processCapturedImage`, el `catch` hace `console.error('Error procesando imagen:', error)` y `Alert.alert('Error', 'No se pudo procesar la imagen')`.
- **Logs:** Solo `console.log` / `console.error` (p. ej. al capturar original, al capturar warped, al procesar con OCR simulado). No se observa Sentry, analytics ni flags `__DEV__` en este archivo.
- Permisos denegados: manejados en ProWineCamera y expuestos al usuario vía `onError` → Alert.

---

## 7) Dependencias con otras pantallas

- **Navegación desde esta pantalla:**
  - **Volver:** `navigation.goBack()` (no se especifica a qué pantalla se vuelve; depende del stack).
- **Navegación hacia esta pantalla:** No se encontró en el código base ningún `navigate('CaptureWineLabel')`. El ítem "Escanear botella" del AdminDashboard navega a `WineManagement`. La ruta `CaptureWineLabel` está tipada en la pantalla (`RootStackParamList['CaptureWineLabel']`) pero no aparece en el fragmento de `RootStackParamList` revisado en `src/types/index.ts`; podría estar definida en otra extensión del tipo o la pantalla podría estar registrada en un stack sin estar enlazada desde el menú admin.
- **Rutas y parámetros:** La pantalla solo usa `navigation`; no lee `route.params`. No navega a CreateWine, WineManagement, GlobalWineCatalog ni a otras pantallas.

---

## 8) Riesgos / pendientes (solo observación)

- **Comentario en cabecera:** El archivo dice "Pantalla de Ejemplo para Captura de Etiquetas" y "Demuestra el uso del módulo de cámara profesional"; sugiere que es una pantalla de demostración más que el flujo final de "Escanear botella" que usa anverso/reverso/adicionales.
- **processCapturedImage:** Es una simulación (setTimeout + Alert). El comentario indica que "aquí se integraría con el sistema de OCR existente". No hay integración real con IA ni catálogo.
- **ProWineCamera:** En el módulo cámara, el frame processor para detección de rectángulos está **comentado** ("TEMPORALMENTE DESHABILITADO - problemas con worklets"); se usa `detectRectanglesMock`. Esto afecta el comportamiento de detección/warp en producción.
- **Sin anverso/reverso/adicionales:** No hay distinción entre foto frontal, reverso ni adicionales; todas las capturas van a un único array. No hay validación "anverso obligatorio".
- **Sin opción Galería:** El usuario no puede elegir desde galería en esta pantalla.
- **Sin eliminación individual:** No se puede borrar o reemplazar una captura concreta, solo "Limpiar" todas.
- **Sin contexto de branch/owner:** No se usa Auth ni Branch; si más adelante se integra con BD o catálogo, habrá que inyectar branch_id, owner_id, etc.
- **Ruta en navegación:** "Escanear botella" en el dashboard lleva a WineManagement, no a CaptureWineLabel; si la intención es que CaptureWineLabel sea la pantalla principal de escaneo, habría que cambiar el destino del ítem en AdminDashboard (eso sería un cambio fuera de este archivo).
- **RootStackParamList:** Confirmar si la ruta `CaptureWineLabel` está declarada en el tipo y registrada en el navigator para que sea accesible.

---

## Resumen de archivos relacionados

| Archivo | Relación |
|---------|----------|
| `src/screens/CaptureWineLabelScreen.tsx` | Pantalla documentada. |
| `src/modules/camera/ProWineCamera.tsx` | Cámara en vivo, permisos, warp, callbacks `onOriginal`/`onWarped`. |
| `src/modules/camera/types.ts` | `CameraConfig`, `DEFAULT_CONFIG`, `Quad`, `CaptureResult` (local a la pantalla). |
| `src/modules/camera/lib/warp.ts` | Utilidades de warp (usadas por ProWineCamera). |
| `src/screens/AdminDashboardScreen.tsx` | "Escanear botella" → `navigate('WineManagement')`. |
| `src/screens/WineManagementScreen.tsx` | Contiene la UI con anverso/reverso/adicionales, Cámara Pro, Galería y usa `processWineLabel` (WineAIService). |
| `src/contexts/LanguageContext.tsx` | Claves `wine_mgmt.front_label`, `wine_mgmt.back_label`, `wine_mgmt.additional_photos`, `wine_mgmt.pro_camera`, `wine_mgmt.gallery` (usadas en WineManagement, no en CaptureWineLabel). |

---

*Reporte solo informativo; no se ha modificado código. Basado en el código actual de `CaptureWineLabelScreen.tsx` y módulo de cámara.*
