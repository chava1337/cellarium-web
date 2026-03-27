# Header premium Cellarium (admin) — regla oficial

## Patrón de pantalla

1. **`SafeAreaView`** con `edges={['bottom', 'left', 'right']}` **sin** `top`, para que el header con gradiente dibuje **debajo de la status bar** (sin banda clara).
2. **`CellariumHeader`** como primer hijo: aplica `paddingTop: insets.top`, gradiente `CELLARIUM_GRADIENT`, radios inferiores y `StatusBar` clara (`expo-status-bar` `style="light"`).
3. Contenido con scroll: usar `contentContainerStyle.paddingBottom` con `max(insets.bottom, 24)` cuando haga falta.

## Centrado del título

- Columnas laterales de ancho fijo `headerSlotWidth`.
- Título + subtítulo en capa absoluta centrada (`pointerEvents: 'none'`).
- Fila de slots encima (`zIndex`) para toques en `leftSlot` / `rightSlot`.

## Tokens (fuente: `CELLARIUM_LAYOUT`, `CELLARIUM_HEADER_TOKENS`, `CELLARIUM_TEXT`)

| Token (nombre) | Valor / estrategia |
|----------------|-------------------|
| `headerTopPaddingStrategy` | `paddingTop = useSafeAreaInsets().top` |
| `headerBottomPadding` | `18` |
| `headerHorizontalPadding` | `20` |
| `headerBottomRadius` | `26` |
| `headerSlotWidth` | `48` |
| `headerBodyMinHeight` | `46` (solo título) |
| `headerBodyWithSubtitleMinHeight` | `64` |
| `headerTitleSize` | `24` (`CELLARIUM_TEXT.headerTitle`) |
| `headerSubtitleSize` | `13` (`CELLARIUM_TEXT.headerSubtitle`) |
| `headerMinHeight` (legacy) | `108` — preferir altura derivada de insets + body + padding |

## Pantallas alineadas en esta iteración

- `GlobalWineCatalogScreen`, `WineManagementScreen`, `QrGenerationScreen`, `UserManagementScreen`, `TastingExamsListScreen`, `SubscriptionsScreen`, `BranchManagementScreen`
- Ajuste de contenedor: `InventoryAnalyticsScreen`, `CocktailManagementScreen` (mismo criterio de safe area)
- Componente: `CellariumHeader.tsx`; tema: `cellariumTheme.ts`

## Pendiente de migrar al mismo patrón (siguen con `edges` superior u header propio)

- `AdminDashboardScreen`, `WineCatalogScreen`, `CreateTastingExamScreen`, `TastingExamResultsScreen`, `TakeTastingExamScreen`, `WelcomeScreen`, etc.

## Riesgos

- **Varias instancias de `StatusBar`**: cada `CellariumHeader` monta `expo-status-bar`; todas piden estilo claro en admin — coherente; si en el futuro mezclas pantallas claras en el mismo stack, conviene centralizar en el navigator.
- **Android**: `overflow: 'hidden'` en el gradiente para respetar el radio en algunos dispositivos.
