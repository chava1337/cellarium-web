# Entregable — Refactor Cellarium (tokens, componentes, inventario, pantallas)

## A. Archivos creados

| Archivo |
|---------|
| `src/theme/index.ts` |
| `src/components/cellarium/CellariumHeader.tsx` |
| `src/components/cellarium/CellariumCard.tsx` |
| `src/components/cellarium/CellariumPrimaryButton.tsx` |
| `src/components/cellarium/CellariumSecondaryButton.tsx` |
| `src/components/cellarium/CellariumDangerButton.tsx` |
| `src/components/cellarium/CellariumTextField.tsx` |
| `src/components/cellarium/CellariumModal.tsx` |
| `src/components/cellarium/index.ts` |
| `src/components/inventory/inventoryAnalyticsTypes.ts` |
| `src/components/inventory/inventoryModalSharedStyles.ts` |
| `src/components/inventory/InventoryEventModal.tsx` |
| `src/components/inventory/InventoryCountModal.tsx` |
| `src/components/inventory/EditInventoryWineModal.tsx` |
| `src/components/inventory/HelpInventoryModal.tsx` |
| `src/components/inventory/InventoryAnalyticsTabs.tsx` |
| `src/components/inventory/InventoryItemCard.tsx` |
| `docs/REFACTOR_CELLARIUM_ENTREGABLE.md` (este documento) |

## B. Archivos modificados

| Archivo |
|---------|
| `src/theme/cellariumTheme.ts` (reemplazo/ampliación completa) |
| `src/components/CocktailHeader.tsx` |
| `src/components/CocktailCard.tsx` |
| `src/components/PendingApprovalMessage.tsx` |
| `src/components/CropImageModal.tsx` |
| `src/components/CellariumLoader.tsx` |
| `src/screens/InventoryAnalyticsScreen.tsx` |
| `src/screens/GlobalWineCatalogScreen.tsx` |
| `src/screens/CocktailManagementScreen.tsx` |
| `src/screens/SettingsScreen.tsx` |
| `src/screens/WineManagementScreen.tsx` |

## C. Tokens globales definidos (`src/theme/cellariumTheme.ts`)

- **CELLARIUM:** `primary`, `primaryDark`, `primaryDarker`, `bg`, `card`, `border`, `text`, `muted`, `textOnDark`, `textOnDarkMuted`, `chipActiveBg`, `chipBorder`, `danger`, `neutralButton`
- **CELLARIUM_GRADIENT:** `['#4e2228','#6f2f37','#924048']`
- **CELLARIUM_LAYOUT:** `screenPadding`, `sectionGap`, `cardRadius`, `inputRadius`, `buttonRadius`, `buttonHeight`, `inputHeight`, `headerMinHeight`, `headerBottomRadius`, `headerBottomPadding`, `headerHorizontalPadding`, `iconButtonSize`
- **CELLARIUM_TEXT:** `headerTitle`, `headerSubtitle`, `sectionTitle`, `cardTitle`, `body`, `caption`, `label`, `buttonText`
- **CELLARIUM_THEME** (admin legacy): se mantiene para compatibilidad

**Import oficial de Supabase (documentado en el theme):** `../lib/supabase`

## D. Componentes base nuevos

- **CellariumHeader** — gradiente, minHeight 108, radios inferiores 26, título/subtítulo, `leftSlot`/`rightSlot` balanceados
- **CellariumCard** — card premium con padding configurable
- **CellariumPrimaryButton** — CTA primary, altura token, loading/disabled
- **CellariumSecondaryButton** — `outline` | `neutral`
- **CellariumDangerButton** — token `danger`
- **CellariumTextField** — label opcional, input alineado a tokens
- **CellariumModal** — overlay, `presentation: 'card' | 'sheet'`, título/subtítulo, scroll interno

Barrel: `src/components/cellarium/index.ts`

## E. Componentes legacy migrados al theme

- **CocktailHeader** — `CELLARIUM_GRADIENT`, colores texto/onDark, botón `chipActiveBg`
- **CocktailCard** — `CELLARIUM` (texto, primary, danger, card)
- **PendingApprovalMessage** — `CELLARIUM.bg`, `text`, `muted`
- **CropImageModal** — spinners y texto con `CELLARIUM.primary`
- **CellariumLoader** — fallback `ActivityIndicator` y label con tokens

## F. Pantallas alineadas al sistema

| Pantalla | Cambios principales |
|----------|---------------------|
| **InventoryAnalyticsScreen** | `CellariumHeader`, `InventoryAnalyticsTabs`, `InventoryItemCard`, modales extraídos, fondos/spinners con `CELLARIUM`, sustitución masiva de `#8B0000` / `#007bff` / `#f8f9fa` por tokens en estilos restantes |
| **GlobalWineCatalogScreen** | `supabase` → `lib/supabase`, `CellariumHeader`, gradiente filtros con `CELLARIUM_GRADIENT`, `CELLARIUM.bg`, spinner primary |
| **CocktailManagementScreen** | Theme + `CellariumHeader`, `UI` derivado de `CELLARIUM_LAYOUT` |
| **SettingsScreen** | `supabase` → `lib/supabase`, theme + `CellariumHeader`, `UI` desde layout |
| **WineManagementScreen** | `CELLARIUM` / gradiente desde theme (sin duplicar constantes locales) |

## G. Pantallas pendientes (no tocadas en esta fase o solo parcialmente)

- **QrGenerationScreen** — sin `CellariumHeader`/theme central (prioridad media-alta según briefing)
- **CreateTastingExamScreen** — pendiente
- **UserManagementScreen** — pendiente
- **WineCatalogScreen**, **InventoryManagementScreen**, **TastingExamsListScreen**, etc. — fuera del alcance de esta pasada
- **InventoryStatsBlock** — no extraído como archivo aparte (la lógica de stats sigue en `InventoryAnalyticsScreen`)

## H. Modales extraídos a componentes (siguen siendo modales, no screens)

| Componente | Descripción |
|------------|-------------|
| **InventoryEventModal** | Mismo flujo: registrar evento (entrada/salida, motivo, cantidad, notas) |
| **InventoryCountModal** | Conteo físico + preview de ajuste |
| **EditInventoryWineModal** | Edición de vino en stock (campos y guardar) |
| **HelpInventoryModal** | Ayuda + switch “no mostrar de nuevo” |

Todos siguen montados como `<Modal />` (directo o vía **CellariumModal** con `presentation="sheet"` / `animationType="slide"`).

---

*Nota: `npx tsc --noEmit` puede seguir reportando errores preexistentes en otros archivos del repo; los cambios de esta fase no introducen errores nuevos en los componentes `inventory/*` ni en `CellariumModal` según el filtrado de salida de tsc.*
