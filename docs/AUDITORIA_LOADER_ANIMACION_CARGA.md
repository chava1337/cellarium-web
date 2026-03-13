# Auditoría: sistema de loading / animación de carga

**Objetivo:** Auditar el loader actual, identificar por qué la visualización está incompleta o inconsistente, y proponer el cambio mínimo para dejarlo production-ready y reutilizable. Sin implementar cambios todavía.

---

## 1. Cuál es el loader actual y dónde vive

### Loader reutilizable (Lottie)

| Dónde | Detalle |
|-------|--------|
| **Componente** | `CellariumLoader` (export default) |
| **Archivo** | `src/components/CellariumLoader.tsx` |
| **Tecnología** | **Lottie** (`lottie-react-native`), con fallback a `ActivityIndicator` nativo si `onError` dispara |
| **Asset** | `assets/anim/cellarium_loader.json` (animación botella/copa, 512×512, loop ~2.2s) |
| **Props actuales** | `size` (default 180), `label` (default "Decantando…"), `loop` (true), `speed` (1), `style` |

El componente usa:
- `LottieView` con `source={require('../../assets/anim/cellarium_loader.json')}`, `autoPlay`, `loop`, `speed`, `style={{ width: size, height: size }}`.
- `useEffect` que llama a `ref.current.play()` (redundante con `autoPlay` si el ref ya está montado).
- Fallback: si `error === true` (por `onError`), renderiza `ActivityIndicator` + `label`.

### Splash de bootstrap (Rive)

| Dónde | Detalle |
|-------|--------|
| **Pantalla** | `BootstrapScreen` |
| **Archivo** | `src/screens/BootstrapScreen.tsx` |
| **Tecnología** | **Rive** (`rive-react-native`), con fallback a `ActivityIndicator` si `riveError` |
| **Asset** | `assets/anim/splash_cellarium.riv` (referenciado en código y docs; no es el foco de esta auditoría de “loader reutilizable”) |

Este splash es solo para bootstrap; no se reutiliza como loader en otras pantallas.

### Conclusión “loader actual” para reutilización

- **Loader reutilizable:** solo **CellariumLoader** (Lottie) en `src/components/CellariumLoader.tsx`.
- **Splash:** Rive en Bootstrap; no forma parte del sistema de loaders reutilizables.

---

## 2. Dónde se usa actualmente

| Archivo | Uso | Import |
|---------|-----|--------|
| `src/screens/WineCatalogScreen.tsx` | `ListEmptyComponent`: cuando `loading`, muestra `<View style={styles.loadingContainer}><CellariumLoader size={120} label="Cargando catálogo..." … /></View>` | `import CellariumLoader from '../components/CellariumLoader';` ✅ |
| `src/screens/EvidenceFirstWineScreen.tsx` | Overlay de carga: `{loading && (<View style={styles.loadingOverlay}><CellariumLoader /><Text>{processingStep}</Text></View>)}` | `import { CellariumLoader } from '../components/CellariumLoader';` ❌ **named import** pero el componente es **default export** → en runtime `CellariumLoader` puede ser `undefined` → el loader no se muestra o hay error al renderizar |
| `src/components/LoadingExamples.tsx` | Solo ejemplos/demo (varias variantes de CellariumLoader) | `import CellariumLoader from './CellariumLoader';` ✅ |

**Resto de la app:** la gran mayoría de pantallas **no** usan CellariumLoader y usan **ActivityIndicator** de React Native directamente, con estilos inline o locales, por ejemplo:

- `AppAuthWrapper`, `AdminDashboardScreen`, `BranchManagementScreen`, `SubscriptionsScreen`, `SettingsScreen`: `ActivityIndicator size="large" color="#8B0000"` en un `View` con `loadingContainer` local.
- `TastingExamsListScreen`, `CreateTastingExamScreen`, `TakeTastingExamScreen`, `TastingExamResultsScreen`, `InventoryAnalyticsScreen`, `GlobalWineCatalogScreen`, `CocktailManagementScreen`, `FichaExtendidaScreen`, `QrProcessorScreen`, `AuthScreen`, `LoginScreen`, `RegistrationScreen`, `OwnerEmailVerificationScreen`, `QrGenerationScreen`, `CropImageModal`, etc.: mismo patrón con `ActivityIndicator` y colores variados (`#8B0000`, `#8E2C3A`, `CELLARIUM.primary`, `#fff`, etc.).

Por tanto:
- **CellariumLoader** se usa en **2 pantallas** (WineCatalog + EvidenceFirstWine) y en **LoadingExamples**.
- En **EvidenceFirstWineScreen** el uso está **roto** por el import incorrecto (named vs default).

---

## 3. Qué problema exacto tiene la visualización

### 3.1 Loader no visible o fallo en EvidenceFirstWineScreen

- **Archivo:** `src/screens/EvidenceFirstWineScreen.tsx`, línea 21: `import { CellariumLoader } from '../components/CellariumLoader';`
- **Problema:** El módulo exporta `export default function CellariumLoader`. No hay `export { CellariumLoader }`. Con named import, `CellariumLoader` es `undefined`.
- **Efecto:** Al renderizar `{loading && (… <CellariumLoader /> …)}` puede no mostrarse nada o producir error (según cómo React maneje el componente undefined). El overlay de carga en esa pantalla está “incompleto” o roto.

### 3.2 Posible arranque de animación frágil en CellariumLoader

- **Archivo:** `src/components/CellariumLoader.tsx`, líneas 23–27 y 41–49.
- **Hecho:** Se usa `autoPlay` en `LottieView` y además `useEffect(() => { if (ref.current) ref.current.play(); }, []);`.
- **Problema:** En el primer render, `ref.current` puede ser aún `null` (LottieView no montado). El efecto se ejecuta una sola vez; si en ese momento el ref sigue null, no se llama a `play()`. Dependemos solo de `autoPlay`. En algunos entornos (o si Lottie monta tarde), la animación podría no iniciar de forma fiable.
- **Evidencia:** Código explícito: dependencia `[]` y comprobación `if (ref.current)`; no hay `onAnimationLoaded` ni segundo intento de `play()`.

### 3.3 Inconsistencia de presentación entre pantallas

- **Problema:** La mayoría de pantallas no usan CellariumLoader; usan `ActivityIndicator` con:
  - Colores distintos: `#8B0000`, `#8E2C3A`, `#fff`, `CELLARIUM.primary`, etc.
  - Contenedores locales (`loadingContainer`) con distintos `backgroundColor` (`#f8f9fa`, transparente, etc.), padding y minHeight.
- **Efecto:** La “visualización” del loading no es única: a veces Lottie (solo 2 sitios, uno roto), casi siempre spinner nativo y estética desigual. No hay un único “loader de la app” percibido como terminado.

### 3.4 CellariumLoader sin variantes de contexto

- **Archivo:** `src/components/CellariumLoader.tsx`.
- **Problema:** No hay props para:
  - **Overlay / fullscreen:** no hay `fullscreen` ni `overlay`; quien quiera overlay (como EvidenceFirstWine) tiene que envolver en un `View` con `position: 'absolute'` y estilos propios.
  - **Mensaje opcional** ya está (`label`), pero no hay convención de “mensaje en overlay oscuro” (por ejemplo texto blanco).
  - **Blocking / no blocking:** no definido; depende del contenedor que use cada pantalla.
- **Efecto:** Para Suscripciones u otras pantallas que quieran un overlay o fullscreen, no hay una API clara y reutilizable; cada uno vuelve a copiar estilos o usa ActivityIndicator.

### 3.5 Recorte / tamaño

- **CellariumLoader:** El contenedor tiene `alignItems: 'center'`, `justifyContent: 'center'`, `gap: 12`. El `LottieView` tiene `style={{ width: size, height: size }}`. No hay `overflow: 'hidden'` en el contenedor del componente; el recorte dependería del padre. En usos actuales (WineCatalog con `loadingContainer` flex, EvidenceFirstWine con overlay) no hay evidencia en código de recorte; el problema de “incompleto” en EvidenceFirstWine es el **import**, no el tamaño.

### 3.6 Resumen de problemas concretos

| Problema | Archivo / lugar | Evidencia |
|---------|------------------|-----------|
| Loader no visible o error en overlay de carga | `EvidenceFirstWineScreen.tsx` | Import `{ CellariumLoader }` con default export → componente undefined |
| Animación podría no arrancar en algunos casos | `CellariumLoader.tsx` | `useEffect` con `ref.current?.play()` una sola vez; ref puede ser null |
| Visualización “incompleta” en el resto de la app | Múltiples pantallas | Casi todo es ActivityIndicator ad hoc; CellariumLoader solo en 2 sitios (uno roto) |
| Sin API para overlay/fullscreen | `CellariumLoader.tsx` | No hay props `overlay`, `fullscreen`, `blocking` |

---

## 4. Causa raíz más probable

- **Por qué la visualización está incompleta o inconsistente:**
  1. **Uso limitado:** CellariumLoader existe y está documentado como “listo para toda la app”, pero no se adoptó en la mayoría de pantallas; cada pantalla siguió usando ActivityIndicator con estilos locales.
  2. **Bug de import:** En EvidenceFirstWineScreen el import incorrecto hace que el único uso explícito de CellariumLoader en un overlay falle, reforzando la sensación de “loader que no se ve bien” en esa pantalla.
  3. **Falta de variante “overlay/fullscreen”:** No hay un solo componente o API que unifique “loader en overlay bloqueante” o “loader fullscreen”; cada pantalla lo resuelve a su manera (o no lo usa).

---

## 5. Qué le falta para estar a nivel producción

### Visual

- Unificar criterio: que las pantallas que deban mostrar “cargando” usen el mismo componente (CellariumLoader o un wrapper) con la misma paleta (p. ej. #8B0000 / tema Cellarium).
- Corregir el uso en EvidenceFirstWineScreen (import) para que el overlay de carga se vea.
- Definir y aplicar un contenedor estándar para “loader fullscreen” y “loader en overlay” (fondo, centrado, safe area si aplica) para que no se vea cortado ni amateur.

### Técnico

- Asegurar que la animación Lottie arranque siempre (ref + autoPlay o callback tipo `onAnimationLoaded` + play).
- Mantener fallback a ActivityIndicator si Lottie falla (ya existe).
- Evitar dependencias frágiles (por ejemplo no depender de que el ref esté listo en el primer tick del efecto).

### Reutilización

- Un solo punto de uso: un componente (o un conjunto mínimo) que se importe desde todas las pantallas que necesiten loading.
- Props claras: al menos `visible`, `message`/`label`, y opcionalmente `fullscreen` o `overlay` para no duplicar estilos de overlay en cada pantalla.
- Documentación breve de “cuándo usar qué” (inline vs fullscreen vs overlay).

---

## 6. Cambio mínimo recomendado

- **Objetivo:** Corregir la visualización rota, dejar el loader estable y convertirlo en base reutilizable sin refactor grande.

### 6.1 Corregir import en EvidenceFirstWineScreen (obligatorio)

- **Archivo:** `src/screens/EvidenceFirstWineScreen.tsx`
- **Cambio:** Sustituir `import { CellariumLoader } from '../components/CellariumLoader';` por `import CellariumLoader from '../components/CellariumLoader';`
- **Efecto:** El overlay de carga de EvidenceFirstWine volverá a mostrar CellariumLoader correctamente.

### 6.2 Hacer más robusto el arranque de Lottie en CellariumLoader (recomendado)

- **Archivo:** `src/components/CellariumLoader.tsx`
- **Cambio mínimo:** Usar `onAnimationLoaded` (o equivalente de lottie-react-native) para llamar a `ref.current?.play()` cuando la animación esté lista, en lugar de confiar solo en el `useEffect` con ref en el primer mount. Si la API no expone ese callback, mantener `autoPlay` y opcionalmente un segundo intento de `play()` en un efecto con un pequeño delay (por ejemplo requestAnimationFrame o setTimeout 0) para cuando el ref ya esté asignado.
- **Efecto:** Reduce el riesgo de “animación que no inicia” en algunos dispositivos o momentos de montaje.

### 6.3 API mínima para reutilización (sin refactor grande)

- **Archivo:** `src/components/CellariumLoader.tsx`
- **Cambios mínimos sugeridos (solo props y estilos internos):**
  - Añadir prop opcional `**overlay**` (boolean): si `true`, el contenedor del loader usa estilos tipo overlay (position absolute, flex 1, fondo semi-transparente, centrado). Así EvidenceFirstWine y futuras pantallas (p. ej. Suscripciones) pueden usar `<CellariumLoader overlay message="..." />` sin duplicar el `loadingOverlay` en cada pantalla.
  - Mantener `label` o añadir alias `message` para consistencia con “mensaje en overlay”.
  - Opcional: prop `**fullscreen**` (boolean) para variante “pantalla completa” (mismo fondo que overlay pero ocupando toda la pantalla con SafeArea si se desea), reutilizando la misma lógica de contenedor.
- No hace falta tocar la lógica de Lottie/fallback ni la navegación; solo la capa de presentación del contenedor según la variante.

### 6.4 No hacer en esta fase

- No reemplazar aún todos los ActivityIndicator de la app por CellariumLoader (queda para una siguiente iteración).
- No cambiar el splash de Bootstrap (Rive) ni la estructura de navegación.
- No añadir nuevas dependencias; solo usar lo ya existente (Lottie + RN ActivityIndicator).

---

## 7. Archivos exactos a tocar

| Archivo | Cambio |
|---------|--------|
| `src/screens/EvidenceFirstWineScreen.tsx` | Corregir import: default en lugar de named para `CellariumLoader`. |
| `src/components/CellariumLoader.tsx` | (1) Robustecer arranque de animación (onAnimationLoaded o retry de play). (2) Opcional: props `overlay` y/o `fullscreen` y estilos internos para contenedor overlay/fullscreen. |

No tocar (por ahora): BootstrapScreen, WineCatalogScreen, LoadingExamples, resto de pantallas que usan ActivityIndicator, backend, navegación.

---

## 8. Si conviene dejarlo como componente reutilizable

Sí. Conviene que **CellariumLoader** sea el componente estándar de loading de la app:

- Ya existe, tiene fallback y props básicas (size, label, loop, speed).
- Con el arreglo del import y el refuerzo del play(), y opcionalmente las props `overlay`/`fullscreen`, se puede usar de forma consistente en:
  - Carga inline (catálogo, listas).
  - Overlay bloqueante (EvidenceFirstWine, futuros flujos async).
  - Pantallas como Suscripciones (carga de perfil, checkout, etc.) sin duplicar estilos.

Un único componente reutilizable reduce inconsistencias visuales y facilita mantener un solo nivel de calidad “production-ready”.

---

## 9. Riesgos o consideraciones

- **Lottie en dispositivos muy limitados:** Ya hay fallback a ActivityIndicator; mantenerlo.
- **Rive (Bootstrap):** Fuera del alcance de esta auditoría; si el .riv no existe en `assets/anim/`, Bootstrap mostrará el fallback ActivityIndicator (ya implementado).
- **Performance:** El JSON de Lottie está en el bundle; no se ha detectado uso problemático; seguir usando el mismo asset.
- **Accesibilidad:** No auditado en detalle; considerar en el futuro `accessibilityLabel` y `accessibilityRole="progressbar"` o similar en el componente reutilizable.
- **Safe area:** En variante fullscreen/overlay, valorar envolver con `SafeAreaView` o insets si se quiere que el loader no quede bajo notch/home indicator; puede hacerse dentro del mismo componente según prop.

---

## 10. Propuesta concreta de implementación (resumen)

1. **Evidencia y uso actual**
   - Loader reutilizable: **CellariumLoader** en `src/components/CellariumLoader.tsx` (Lottie + fallback ActivityIndicator). Asset: `assets/anim/cellarium_loader.json`.
   - Uso real: WineCatalogScreen (correcto), EvidenceFirstWineScreen (roto por import), LoadingExamples (demo). Resto de la app: ActivityIndicator directo.

2. **Problema principal de visualización “incompleta”**
   - En EvidenceFirstWineScreen el loader no se muestra (o falla) por **import incorrecto** (named vs default).
   - Riesgo menor: animación Lottie podría no arrancar en algunos mounts por ref null en el único `useEffect`.

3. **Cambio mínimo seguro**
   - Corregir en **EvidenceFirstWineScreen** el import a `import CellariumLoader from '...'`.
   - En **CellariumLoader**: robustecer arranque (callback cuando Lottie esté listo o retry de `play()`).
   - Opcional en el mismo componente: añadir props `overlay` y/o `fullscreen` y aplicar estilos de contenedor para overlay/fullscreen, sin cambiar lógica de navegación ni del resto de la app.

4. **Archivos a tocar**
   - `src/screens/EvidenceFirstWineScreen.tsx` (solo import).
   - `src/components/CellariumLoader.tsx` (arranque + opcionalmente overlay/fullscreen).

Con esto el loader actual queda estable, visible donde ya se usa, y listo como base reutilizable para Suscripciones y otros flujos sin refactor grande.
