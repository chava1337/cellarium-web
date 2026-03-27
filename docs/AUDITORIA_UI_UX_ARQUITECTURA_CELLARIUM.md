# Auditoría UI/UX + Arquitectura + Limpieza — Cellarium (React Native / Expo)

**Alcance:** Módulo administrativo y de operación. Pantallas prioritarias + componentes directamente relacionados.  
**Fecha:** Marzo 2025.  
**Estado:** Diagnóstico únicamente — sin cambios aplicados.

---

# 1. Resumen Ejecutivo

## Principales problemas globales detectados

1. **Duplicación masiva de tokens visuales:** `CELLARIUM` y `UI` están copiados en al menos 10 pantallas con variaciones (headerHeight 92 vs 96 vs 104; buttonHeight 46 vs 50; border #E5E5E8 vs #E7E7EA; texto 0.75 vs 0.76). No hay una única fuente de verdad.
2. **Colores fuera del sistema Cellarium:** Uso extensivo de `#8B0000`, `#8E2C3A`, `#f8f9fa`, `#007bff`, `#dc3545`, `#fff3cd` en pantallas y componentes (InventoryAnalyticsScreen, InventoryManagementScreen, CocktailHeader, CocktailCard, CropImageModal, PendingApprovalMessage, PDFReportService, etc.), rompiendo identidad premium.
3. **Headers inconsistentes:** Combinación de `height` vs `minHeight`, `paddingTop: insets.top` vs `insets.top + 8` vs `insets.top * 0.35` vs `Math.max(insets.top, 14)`, y `borderBottomRadius` 24 vs 26. Solo WineManagementScreen aplica el estándar “premium” (minHeight 108, radius 26).
4. **Imports de Supabase fragmentados:** Tres rutas distintas (`../lib/supabase`, `../config/supabase`, `../services/supabase`) según archivo, generando deuda técnica y riesgo de regresiones.
5. **Pantallas monolíticas:** InventoryAnalyticsScreen (~2982 líneas), WineCatalogScreen (muy grande), GlobalWineCatalogScreen (~1682), CocktailManagementScreen (~1230), QrGenerationScreen (~1150) concentran lógica, UI y varios modales en un solo archivo.
6. **Copy y mensajes hardcodeados:** Alertas y textos en español en CreateTastingExamScreen, QrGenerationScreen y otros sin pasar por i18n.
7. **Código dev/debug abundante:** Decenas de `__DEV__` y `console.log/warn/error` en pantallas prioritarias (InventoryAnalyticsScreen 48, QrProcessorScreen 91, UserManagementScreen 17, SettingsScreen 18, CocktailManagementScreen 19).
8. **Componentes compartidos con paleta legacy:** CocktailHeader usa gradiente `#6D1F2B`, `#8E2C3A`; CocktailCard y CropImageModal usan `#8E2C3A`; PendingApprovalMessage usa `#f8f9fa` y grises genéricos.

## Nivel de severidad general

- **Alta** en consistencia visual y mantenibilidad (tokens duplicados, colores legacy, headers dispares).
- **Media-alta** en arquitectura (pantallas muy grandes, modales complejos, imports inconsistentes).
- **Media** en código muerto y dev-only (reducible sin tocar lógica de negocio).

## Áreas más maduras vs más débiles

- **Más maduras:** SettingsScreen, WineManagementScreen (tras refactor reciente), CocktailManagementScreen (en gran parte alineado a CELLARIUM en pantalla, no en CocktailHeader/CocktailCard). UserManagementScreen y QrGenerationScreen usan CELLARIUM/UI pero con detalles inconsistentes.
- **Más débiles:** InventoryAnalyticsScreen (mezcla #8B0000/#007bff/#dc3545 con #924048; 4 modales; ~2982 líneas). GlobalWineCatalogScreen (supabase desde `services`, fondo #f5f5f5, header sin gradiente unificado). InventoryManagementScreen y otras pantallas no refinadas (legacy #8B0000/#f8f9fa). Componentes CocktailHeader, CocktailCard, PendingApprovalMessage, CropImageModal, CellariumLoader con colores fuera del design system.

---

# 2. Hallazgos Globales del Sistema UI

## 2.1 Inconsistencias visuales globales

| Área | Detalle |
|------|--------|
| **Header** | WineManagement: minHeight 108, paddingBottom 18, borderBottomRadius 26, paddingTop Math.max(insets.top,14). InventoryAnalytics: height 104, paddingBottom 12, sin borderBottomRadius en gradient. CocktailManagement: height 96, paddingBottom 10, paddingTop insets.top*0.35. Settings: minHeight 92, paddingBottom 16, paddingTop insets.top+8. QrGeneration/User/CreateTastingExam/TastingExamsList: height 96 o 104, paddingBottom 12. |
| **Título header** | fontSize 22 (GlobalWineCatalog, QrGeneration), 24 (Cocktail, Settings, WineManagement), 26 (InventoryAnalytics, UserManagement, CreateTastingExam, TastingExamsList). lineHeight 30 solo WineManagement. |
| **Cards** | cardRadius 18 en la mayoría; GlobalWineCatalog cardRow borderRadius 12. Padding 14 vs 16 vs 20. Sombras: shadowOpacity 0.06–0.12, shadowRadius 4–12. |
| **Botones primarios** | minHeight/height 44, 46, 48, 50, 52, 54 según pantalla. borderRadius 12, 14, 16. |
| **Inputs** | minHeight 48 (WineManagement), 52 (Settings, CreateTastingExam), height 48 en otros. borderColor #E5E5E8 vs #ddd vs CELLARIUM.border. borderRadius 8, 12, 14. |
| **Fondo pantalla** | #F4F4F6 (CELLARIUM.bg en refinadas) vs #f8f9fa (InventoryAnalytics, PendingApprovalMessage, varias legacy) vs #f5f5f5 (GlobalWineCatalog). |

## 2.2 Componentes repetidos que deberían unificarse

- **Header con gradiente:** Patrón LinearGradient + título (y a veces subtítulo) repetido en todas las pantallas auditadas; cada una define su propio estilo (headerGradient, headerTitle, headerSubtitle, headerCenter, etc.). CocktailHeader es el único componente reutilizable pero usa colores legacy.
- **Cards de lista/ficha:** Estructura tipo thumbnail + contenido + acciones repetida en InventoryAnalytics (inventoryCard), CocktailManagement (card + cardThumbWrap + cardContent + cardActions), GlobalWineCatalog (cardRow), UserManagement (userCard). Sin componente base compartido.
- **Modales de overlay:** Patrón View overlay + View content + título + botones repetido en UserManagement (2 modales), Settings (1), InventoryAnalytics (4), CocktailManagement (2), QrGeneration (1), WineManagement (2). Estilos modalOverlay/modalContent/modalTitle similares pero no compartidos.
- **Botones primario/secundario:** Estilos primaryButton/secondaryButton, saveButton, generateButton, etc. definidos por pantalla con medidas distintas.
- **Guard/Loading inicial:** Misma estructura (View centrado + ActivityIndicator + texto) en todas las pantallas con guard; colores del spinner distintos (#8B0000 vs CELLARIUM.primary).
- **Empty state:** Varias pantallas tienen emptyCard/emptyContainer/emptyText/emptySubtext con ligeras variaciones.

## 2.3 Tokens / medidas / tamaños inconsistentes

- **UI.headerHeight:** 92 (Settings), 96 (Cocktail, User, CreateTastingExam, TastingExamsList, TakeTastingExam, TastingExamResults), 104 (InventoryAnalytics, QrGeneration). WineManagement no usa número fijo, usa minHeight 108 en estilo.
- **UI.buttonHeight:** 46 (UserManagement), 50 (CreateTastingExam, QrGeneration, Settings, TastingExamsList, TakeTastingExam, TastingExamResults), 52 (WineManagement en botones de foto). WineManagement saveButton minHeight 54.
- **UI.cardRadius:** 18 en la mayoría; algunos card internos 12, 14.
- **UI.inputHeight / inputRadius:** 48 vs 52, radius 12 vs 14.
- **Border color:** #E5E5E8 (varias), #E7E7EA (WineManagement), #D9D9DE (chips WineManagement), #ddd en modales/inputs legacy.
- **textOnDarkMuted:** "0.75" vs "0.76" (WineManagement).

## 2.4 Colores y jerarquía visual

- **Primary:** #924048 (Cellarium) usado en pantallas refinadas; #8E2C3A y #8B0000 siguen en InventoryAnalyticsScreen, InventoryManagementScreen, CocktailHeader, CocktailCard, CropImageModal, CellariumLoader, BootstrapScreen, AppAuthWrapper, RoleSelector, PDFReportService, WineCatalogScreen, GlobalWineCatalogScreen (spinner), AnalyticsScreen, AdminDashboard, BranchManagement, FichaExtendida, Subscriptions, AdminRegistration, AdminLogin, LoginScreen, RegistrationScreen, AddWineToCatalogScreen, TastingExamResultsScreen, OwnerRegistrationScreen, OwnerEmailVerificationScreen, TastingNotesScreen, constants/wineTypeUi, AppNavigator.
- **Fondo:** #f8f9fa muy extendido; debería ser #F4F4F6 (CELLARIUM.bg) donde aplique el sistema premium.
- **Secundarios/acción:** #007bff (botones “azul” en InventoryAnalytics, InventoryManagement, BranchManagement, AdminDashboard). #dc3545 para peligro/alertas. #28a745 verde. #fff3cd amarillo advertencia. Ninguno forma parte del design system Cellarium.
- **CocktailHeader:** GRADIENT_COLORS = ['#6D1F2B', '#8E2C3A'] — no coincide con primaryGradient Cellarium ['#4e2228','#6f2f37','#924048'].

## 2.5 Tipografía y spacing

- **Section titles:** 16, 17, 18, 20 según pantalla; fontWeight '600' o '700'; marginBottom 12, 14, 16.
- **Labels:** fontSize 13 o 14, fontWeight '600', marginBottom 6 u 8.
- **Body/secondary:** 13, 14, 15; color #666, #6A6A6A, CELLARIUM.muted.
- **Padding contenido:** screenPadding 16 en la mayoría; paddingTop 16, 18, 14; paddingBottom variable (24, 40, 44, + insets.bottom).
- **Gap entre cards:** 14 (UI.cardGap) vs 16 (QrGeneration cardGap) vs 18.

## 2.6 Modales problemáticos

- **InventoryAnalyticsScreen:** 4 modales (Registrar evento, Conteo físico, Editar vino, Ayuda). Los tres primeros incluyen formularios (inputs, botones de razón, preview, subida de imagen). El modal de edición de vino es especialmente pesado (muchos campos). Candidatos a pantalla full-screen o subcomponentes dedicados.
- **UserManagementScreen:** 2 modales (Aprobar con rol, Cambiar rol). Contenido acotado pero duplican estructura overlay/content/title/buttons.
- **CocktailManagementScreen:** Modal de formulario de bebida (full-screen en práctica) + modal de preview. El formulario podría ser pantalla separada para mejorar navegación y estado.
- **QrGenerationScreen:** Modal de compartir (share). Tamaño razonable.
- **WineManagementScreen:** Modal de “Processing” + modal de cámara. Processing es pequeño; cámara es pantalla overlay ya manejada por ProWineCamera.
- **SettingsScreen:** Modal de confirmación de borrado de cuenta (input CONFIRMAR + botones). Bien acotado.
- **GlobalWineCatalogScreen:** Modal de detalle de vino + modal de búsqueda. El detalle podría crecer; búsqueda es contenido medio.

## 2.7 Código muerto / estilos residuales

- **InventoryAnalyticsScreen:** Estilos legacy en bloque “Reportes” y modales (reasonButton con #8B0000, confirmButton #28a745, cancelButton #6c757d, imageButton #007bff, pdfButton #007bff, reportStatValue #8B0000, reportButton #8B0000). Duplicación de variantes “Compact” y “Cellarium” (reasonButtonActiveCellarium, confirmButtonCellarium, previewLabelCellarium) junto a versiones no Cellarium. previewSection con #e3f2fd y #1976d2 (azul Material). statCardWarning #fff3cd, statValueWarning #dc3545. Posible uso parcial de headerContent/headerLeftSlot/headerRightSlot que en otras pantallas se eliminó.
- **GlobalWineCatalogScreen:** Comentario "CARD_HEIGHT removido"; posible código o estilos ligados a layout antiguo. searchModalInput backgroundColor #f9f9f9, borderColor #ddd.
- **WineCatalogScreen:** Múltiples constantes GUEST_CARD, isTablet, minHeight condicionales; riesgo de estilos o ramas no usadas en flujo guest/admin.
- **CreateTastingExamScreen:** headerSubtitle usado en loading y en contenido; posible duplicación de bloque header entre loading y normal.
- **CocktailManagementScreen:** No se detectaron estilos claramente no referenciados; cardActionBtnDelete #B85454 (danger) coherente con CELLARIUM.danger en Settings.
- **PendingApprovalMessage:** Estilos fijos; no usa CELLARIUM ni theme.

## 2.8 Dev-only / debugging / lógica sobrante

- **InventoryAnalyticsScreen:** ~48 referencias __DEV__/console (loadData, comparación, ventas, approve, etc.). Varios console.log de estado y errores.
- **QrProcessorScreen:** 91 referencias (muy alto).
- **UserManagementScreen:** 17 (approveUserWithRole, handleRejectUser, etc.), incluyendo logs de RPC y errores serializados.
- **SettingsScreen:** 18 (delete-user-account, extractFunctionsHttpErrorDetails, errores de Edge Function).
- **CocktailManagementScreen:** 19 (picker, crop, compress).
- **GlobalWineCatalogScreen:** 8 (loadFirstPage, loadAddedWines).
- **WineManagementScreen:** 8.
- **CreateTastingExamScreen:** 2 (loadAvailableWines, handleSubmit).
- **QrGenerationScreen:** 9 (permisos, loadUserTokens, generate).

Recomendación: envolver en __DEV__ donde aporte valor y eliminar o sustituir por logger con niveles en producción; unificar uso de logger en lugar de console directo.

## 2.9 Imports inconsistentes / deuda técnica estructural

- **Supabase:**  
  - `../lib/supabase`: WineManagementScreen, UserManagementScreen, AuthContext, BranchContext, InventoryAnalyticsScreen, etc.  
  - `../config/supabase`: QrProcessorScreen, SettingsScreen (config re-exporta desde lib).  
  - `../services/supabase`: GlobalWineCatalogScreen, FichaExtendidaScreen, WineCatalogScreen; servicios internos usan `./supabase` o `../lib/supabase`.  
  Estandarizar en `../lib/supabase` (o un solo barrel) en pantallas y servicios.

- **Utilidades:** mapSupabaseErrorToUi en UserManagementScreen y BranchManagementScreen; getBilingualValue en CocktailManagementScreen y otros. Rutas relativas distintas según archivo (../utils/ vs ../services/).

- **Theme:** cellariumTheme.ts exporta CELLARIUM y CELLARIUM_THEME.admin; ninguna pantalla prioritaria importa desde theme (todas definen CELLARIUM/UI local).

## 2.10 Oportunidades de design system

- Centralizar CELLARIUM (y ampliar con bg, card, border, text, muted, danger, neutralButton) y UI (headerHeight, paddingBottom, borderBottomRadius, cardRadius, buttonHeight, inputHeight, primaryGradient, etc.) en theme/cellariumTheme.ts o design-system/tokens.ts.
- Un solo componente CellariumHeader (gradient + título + opcional subtítulo + opcional slot derecho) usado por todas las pantallas.
- Componentes CellariumCard, CellariumModal, CellariumPrimaryButton, CellariumSecondaryButton, CellariumTextField, CellariumSectionTitle, CellariumEmptyState para eliminar duplicación y alinear medidas/colores.
- PendingApprovalMessage, CocktailHeader, CocktailCard, CropImageModal, CellariumLoader actualizados para consumir theme (CELLARIUM.primary, gradient, bg, card).

---

# 3. Auditoría por Pantalla

## InventoryAnalyticsScreen

**Archivo:** `src/screens/InventoryAnalyticsScreen.tsx` (~2982 líneas)

### Problemas visuales

- Header: height 104, paddingBottom 12; sin borderBottomLeftRadius/Right; no usa minHeight 108 ni radius 26 del estándar premium.
- ActivityIndicator en guard/loading usa #8B0000 en lugar de CELLARIUM.primary.
- Fondo guard/loading y varios contenedores #f8f9fa en lugar de CELLARIUM.bg.
- Tabs bar (Inventario / Ventas estimadas / Comparar / Reportes): estilos propios; chip activo usa #924048 pero statCard, statValue, pdfButton, reportButton, reasonButton, confirmButton, imageButton usan #8B0000, #007bff, #28a745, #dc3545, #fff3cd.
- Modales: mezcla de estilos “Compact” y “Cellarium” con legacy (reasonButtonActive vs reasonButtonActiveCellarium); previewSection azul #e3f2fd/#1976d2; inputs y botones con #8B0000 y #007bff.

### Problemas estructurales

- Archivo muy largo; lógica de 4 vistas (stock, sales, comparison, reports) + 4 modales + carga de datos en un solo componente.
- renderStockTab, renderSalesTab, renderComparisonTab, renderReportsTab devuelven JSX grande; modales con mucho JSX inline.
- Modal “Editar vino” incluye formulario completo (imagen, campos, guardar/eliminar); candidato a pantalla o subcomponente.

### Código/estilos sobrantes

- statCardWarning, statValueWarning, pdfButton/pdfButtonText (azul), previewSection/previewLabel/previewText (azul Material), reasonButton/reasonButtonText con #8B0000 (duplicados con variante Cellarium). confirmButton/cancelButton genéricos (verde/gris) junto a confirmButtonCellarium.
- Posible duplicación entre modalContent/modalContentCompact y conjuntos de estilos para “Registrar evento” vs “Conteo físico” vs “Editar vino”.

### Componentes extraíbles

- Header (LinearGradient + título + subtítulo + botón ayuda) → CellariumHeader.
- TabsBar (segmento de 4 tabs) → CellariumSegmentedTabs o similar.
- Modal “Registrar evento” → InventoryEventModal (subcomponente o pantalla).
- Modal “Conteo físico” → InventoryCountModal.
- Modal “Editar vino” → InventoryEditWineModal o pantalla EditInventoryWine.
- Modal “Ayuda” → componente reutilizable de ayuda o pantalla.
- Card de ítem de inventario (inventoryCard + thumbnail + texto + acciones) → InventoryItemCard.
- Bloque de estadísticas (statsGrid, statCard) → InventoryStatsBlock.

### Riesgos técnicos

- Cambios en modales pueden afectar flujos de registro/conteo/edición; extraer a componentes/pantallas requiere cuidado con estado y callbacks.
- Unificar colores a Cellarium puede tocar muchos estilos en un solo archivo; conviene hacerlo por bloques (primero header y tabs, luego cards, luego modales).

### Prioridad

**Alta.** Es la pantalla con mayor mezcla de identidad visual legacy y premium y una de las más grandes.

---

## GlobalWineCatalogScreen

**Archivo:** `src/screens/GlobalWineCatalogScreen.tsx` (~1682 líneas)

### Problemas visuales

- container backgroundColor #f5f5f5 en lugar de CELLARIUM.bg (#F4F4F6).
- CELLARIUM local sin bg, card, muted, border (solo primary, textOnDark, chip).
- Header: paddingVertical 16, paddingHorizontal 20; sin gradiente explícito en estilos (el JSX usa LinearGradient con CELLARIUM); headerTitle fontSize 22 (resto de pantallas 24 o 26).
- ActivityIndicator en carga inicial #8B0000.
- filterBarGradient y filterChip con estilos propios; coherentes con tonos claros sobre gradiente pero no reutilizan mismo header que otras pantallas.
- cardRow borderRadius 12 (en otras cardRadius 18); cardThumb 86x110, borderRadius 10.
- searchModalSearchBtn #924048 (correcto); searchModalInput #f9f9f9, #ddd.

### Problemas estructurales

- Archivo largo; listado keyset, filtros, modal de búsqueda, modal de detalle, lógica de “added wines” en un solo componente.
- loadFirstPage, loadMore, loadAddedWines, detalle de vino con estado local extenso.

### Código/estilos sobrantes

- Comentario "CARD_HEIGHT removido"; revisar si hay estilos o variables relacionadas sin uso.
- list con padding 8; verificar que todos los estilos de list/cardRow se usen.

### Componentes extraíbles

- Header con gradiente + búsqueda → CellariumHeader + SearchTrigger o reutilizar patrón.
- Barra de filtros (color/tipo) → FilterBar o ChipBar reutilizable.
- Card de vino horizontal (cardRow) → WineCatalogRowCard.
- Modal de búsqueda → SearchModal o pantalla.
- Modal de detalle de vino → WineDetailModal o FichaExtendidaScreen si ya existe flujo.

### Riesgos técnicos

- Import desde `../services/supabase`; alinear con lib/supabase.
- Cambiar fondo y header a estándar Cellarium no debería romper lógica.

### Prioridad

**Alta.** Es catálogo principal; alinear fondo, header y spinner con design system y unificar con WineCatalogScreen donde aplique.

---

## CocktailManagementScreen

**Archivo:** `src/screens/CocktailManagementScreen.tsx` (~1230 líneas)

### Problemas visuales

- Header: paddingTop `insets.top * 0.35` (distinto al resto que usan Math.max(insets.top, 14) o insets.top + 8); height 96, paddingBottom 10; sin borderBottomRadius 26.
- Usa CELLARIUM/UI en pantalla; botón eliminar en card #B85454 (coherente con danger). Lista y formulario en modal alineados.
- CocktailHeader (si se usara) y CocktailCard usan #8E2C3A y gradiente [#6D1F2B, #8E2C3A]; en esta pantalla el header está implementado inline (no se usa el componente CocktailHeader en el listado actual), pero CocktailCard sí se usa en otras rutas; inconsistencia entre pantalla y componentes compartidos.

### Problemas estructurales

- Modal de formulario de bebida muy grande (nombre ES/EN, descripción, ingredientes, precio, imagen, botones cámara/galería, guardar/cancelar). Podría ser pantalla “Crear/Editar Bebida” para mejorar navegación y teclado.
- CropImageModal reutilizado correctamente; flujo de imagen bien separado.

### Código/estilos sobrantes

- No se detectaron estilos claramente huérfanos; cardActionBtnDelete #B85454 podría venir de theme danger.

### Componentes extraíbles

- Header actual (gradient + título + subtítulo + botón +) → CellariumHeader con slot derecho.
- Formulario de bebida (campos bilingües + imagen + acciones) → CocktailForm o pantalla CocktailFormScreen.
- Lista de bebidas (FlatList + card) ya usa estructura; podría usar CocktailCard con colores de theme.

### Riesgos técnicos

- CocktailCard y CocktailHeader son componentes en src/components; cambiarles color a CELLARIUM.primary afecta a cualquier otra pantalla que los use. Refactor coordinado.

### Prioridad

**Media-alta.** Pantalla ya bastante alineada; falta unificar header (paddingTop, radius) y migrar CocktailCard/CocktailHeader a theme.

---

## QrGenerationScreen

**Archivo:** `src/screens/QrGenerationScreen.tsx` (~1150 líneas)

### Problemas visuales

- headerHeight 104, paddingBottom 12; headerTitle fontSize 22 (otros 24/26). Sin borderBottomRadius 26.
- Guard/loading: estilos guardContainer con padding 24; ActivityIndicator color CELLARIUM.primary (correcto). Textos “Sin permiso” y descripción hardcodeados en español.
- Resto de la pantalla usa CELLARIUM/UI de forma coherente (cards, botones, chips).

### Problemas estructurales

- Lógica guest vs admin, generación, listado de tokens, share en un solo archivo; tamaño manejable pero podría extraer secciones (GuestQrSection, AdminQrSection, QrShareModal).

### Código/estilos sobrantes

- guardTitle, guardSubtitle; shareModal posiblemente con estilos propios; revisar si hay estilos de modales no usados.

### Componentes extraíbles

- Header → CellariumHeader.
- Selector tipo (guest/admin) → ya usa typeSelectorOuter/Inner; podría ser CellariumSegmentedControl.
- Modal de compartir → QrShareModal (subcomponente).

### Riesgos técnicos

- Copy hardcodeado en Alert y en guard; mover a i18n.

### Prioridad

**Media.** Ajustes rápidos: header (minHeight, radius, fontSize título), i18n para mensajes y guard.

---

## CreateTastingExamScreen

**Archivo:** `src/screens/CreateTastingExamScreen.tsx` (~552 líneas)

### Problemas visuales

- headerHeight 96, height en estilo (no minHeight); borderBottomRadius no aplicado en headerGradient. headerSubtitle presente (Cargando vinos... / Selecciona los vinos...).
- Guard “Sin permiso” con textos y “Volver” hardcodeados; no usa t().
- Loading state con header + loadingContainer + ActivityIndicator CELLARIUM.primary (correcto).

### Problemas estructurales

- Hooks (useState) después de return condicional (guard) en líneas 77–78; React permite pero es frágil. Debería moverse todo el estado arriba del primer return.
- Formulario simple (nombre, descripción, lista de vinos con selección); tamaño razonable.

### Código/estilos sobrantes

- Posible duplicación de bloque header entre rama loading y rama principal (mismo LinearGradient + título + subtítulo).

### Componentes extraíbles

- Header → CellariumHeader.
- Lista de vinos seleccionables (chips o cards) → WineSelectionList o reutilizar patrón de chips.

### Riesgos técnicos

- Alert.alert y textos en español ('Error', 'Éxito', 'Examen creado correctamente', etc.); migrar a t().
- Orden de hooks: corregir para que todos los useState estén antes de cualquier return.

### Prioridad

**Media.** Corrección de hooks, i18n y alinear header a estándar (minHeight, radius).

---

## UserManagementScreen

**Archivo:** `src/screens/UserManagementScreen.tsx` (~943 líneas)

### Problemas visuales

- headerGradient height 96, paddingBottom 12; sin borderBottomRadius 26. headerTitle 26; headerSubtitle presente.
- guardLoadingText y guardErrorText; guardErrorText color #b91c1c (hardcoded).
- Cards de usuario (userCard) y modales alineados a CELLARIUM (card, primary, muted). Roles con getRoleColor (posible paleta por rol); verificar que no use #8B0000.

### Problemas estructurales

- Dos modales (aprobar con rol, cambiar rol) con estructura similar (overlay + content + title + subtitle + roles + close). Podrían compartir un CellariumModal con contenido variable.
- loadUsers, approveUserWithRole, handleRejectUser, handleChangeRole con lógica RPC y Alert; bien agrupado pero mucho en un archivo.

### Código/estilos sobrantes

- rolesContainer, roleOption, roleOptionText, getRoleColor: asegurar que colores de rol vengan de theme o constante compartida.

### Componentes extraíbles

- Header → CellariumHeader.
- UserCard (pending/active) → UserManagementCard.
- Modal de selección de rol (aprobar / cambiar) → RoleSelectionModal con props (title, subtitle, roles, onSubmit, onCancel, loading).

### Riesgos técnicos

- Muchos console.log/__DEV__; unificar con logger y reducir ruido en producción.

### Prioridad

**Media.** Consistencia de header y modales; extraer RoleSelectionModal reduce duplicación.

---

## SettingsScreen

**Archivo:** `src/screens/SettingsScreen.tsx` (~599 líneas)

### Problemas visuales

- headerHeight 92 (único con 92); paddingTop insets.top + 8; paddingBottom 16; minHeight en headerGradient; borderBottomRadius no aplicado en estilo.
- CELLARIUM incluye danger y neutralButton; uso correcto en signOut y delete.
- Modal de borrado: overlay rgba(0,0,0,0.5); content con CELLARIUM.card; coherente.

### Problemas estructurales

- Import supabase desde `../config/supabase`; unificar con lib/supabase.
- extractFunctionsHttpErrorDetails y lógica de delete-user-account con muchos console.log; mantener solo los necesarios para depuración y envolver en __DEV__.

### Código/estilos sobrantes

- Ninguno evidente.

### Componentes extraíbles

- Header → CellariumHeader.
- Secciones (section + sectionTitle + userInfoRow) → CellariumSection o mantener si solo se usa aquí.
- Modal de confirmación destructiva → CellariumConfirmModal (reutilizable para borrar cuenta u otras acciones).

### Riesgos técnicos

- Bajo; pantalla estable y ya refinada.

### Prioridad

**Baja.** Estandarizar import supabase, header (opcional) y limpieza de logs.

---

## WineManagementScreen

**Archivo:** `src/screens/WineManagementScreen.tsx` (~1027 líneas)

### Problemas visuales

- Header ya refactorizado: minHeight 108, paddingBottom 18, borderBottomLeftRadius 26, paddingTop Math.max(insets.top, 14), título 24/700, lineHeight 30. Sin subtítulo.
- CELLARIUM con border #E7E7EA (resto #E5E5E8); textOnDarkMuted 0.76 (resto 0.75). Detalle menor.
- Formulario, cards, botones y modal processing alineados al estándar premium reciente.

### Problemas estructurales

- Un solo archivo con guard, captura de foto, preview, formulario largo y modal; aceptable tras refactor visual. ProWineCamera es módulo aparte.

### Código/estilos sobrantes

- Tras limpieza reciente no se detectan bloques obvios; formGroupFlex y formRow bien usados.

### Componentes extraíbles

- Hero card + Photo section card → opcional extraer a WineManagementHero y WineManagementPhotoSection si se reutiliza en otro flujo.
- Bloque “Datos del vino” (sectionTitle + form groups) → podría ser WineFormSection genérico en el futuro.

### Riesgos técnicos

- Bajo.

### Prioridad

**Baja.** Mantener y usar como referencia de header y formulario premium; unificar border/textOnDarkMuted con theme si se centraliza.

---

# 4. Componentes Reutilizables Recomendados

| Componente | Propósito | Dónde se reutilizaría | Impacto |
|------------|-----------|------------------------|---------|
| **CellariumHeader** | Gradiente + título (+ subtítulo opcional) + slot derecho opcional (botón ayuda, etc.). Medidas: minHeight 108, paddingBottom 18, borderBottomRadius 26, paddingTop Math.max(insets.top, 14). | Todas las pantallas con header premium (InventoryAnalytics, GlobalWineCatalog, Cocktail, QrGeneration, CreateTastingExam, User, Settings, WineManagement, TastingExamsList, TakeTastingExam, TastingExamResults, etc.). | Alto: una sola fuente de verdad para header. |
| **CellariumScreen** | Wrapper SafeAreaView + fondo CELLARIUM.bg + opcional padding. | Todas las pantallas. | Medio: reduce repetición de container y edges. |
| **CellariumCard** | Card con borderRadius 18, padding, sombra y borde sutiles, fondo CELLARIUM.card. | Listas y secciones en InventoryAnalytics, GlobalWineCatalog, Cocktail, User, Settings, CreateTastingExam, QrGeneration. | Alto: unifica cards. |
| **CellariumModal** | Overlay (rgba 0.35) + content (maxWidth, borderRadius 20, padding) + título + contenido children + botones opcionales. | UserManagement (2), Settings (1), InventoryAnalytics (4), Cocktail (2), QrGeneration (1), WineManagement (2), TastingExamsList (2), etc. | Alto: modales consistentes y accesibles. |
| **CellariumPrimaryButton** | Botón con CELLARIUM.primary, minHeight 50–54, borderRadius 16, texto blanco 17/700. | Guardar, Generar, Aprobar, Confirmar en todas las pantallas. | Alto. |
| **CellariumSecondaryButton** | Botón outline (borde CELLARIUM.primary, fondo transparente o card). | Cancelar, Galería, etc. | Alto. |
| **CellariumDangerButton** | Botón para acciones destructivas (CELLARIUM.danger o token danger). | Eliminar cuenta, Rechazar, Eliminar bebida. | Medio. |
| **CellariumSectionTitle** | Título de sección 17/700, color #2C2C2C, marginTop/marginBottom consistentes. | “Datos del vino”, “Sensorial”, “Precios”, “Pendientes de aprobación”, etc. | Medio. |
| **CellariumEmptyState** | Icono/ilustración + título + subtítulo + botón opcional. | Listas vacías en User, Cocktail, CreateTastingExam, Inventory, QrGeneration. | Medio. |
| **CellariumTextField** | Label (13/600) + TextInput (minHeight 48, borderRadius 14, border #E5E5E8). | Formularios en WineManagement, InventoryAnalytics (editar vino), Cocktail, CreateTastingExam, Settings (confirmación). | Alto. |
| **CellariumActionIconButton** | Botón circular o cuadrado para icono (editar, eliminar, ver, cerrar). Tamaños y colores desde theme. | Card acciones en Cocktail, User, InventoryAnalytics. | Medio. |
| **CellariumSegmentedControl** | Fila de chips/botones (tabs o opciones). Estilo activo Cellarium (rgba primary). | InventoryAnalytics (tabs), QrGeneration (guest/admin), duración. | Medio. |
| **CellariumChip** | Chip con borderRadius 999, borde y fondo según estado (normal/activo). | Tipo de vino (WineManagement), filtros (GlobalWineCatalog), roles (UserManagement). | Medio. |

Además:

- **PendingApprovalMessage:** Convertir a usar CELLARIUM.bg, CELLARIUM.muted y tipografía del theme; o envolver en CellariumCard + CellariumSectionTitle.
- **CocktailHeader:** Sustituir GRADIENT_COLORS por UI.primaryGradient y color botón por CELLARIUM.primary; o deprecar y usar CellariumHeader con slot derecho.
- **CocktailCard:** Sustituir WINE_COLOR por CELLARIUM.primary y botón delete por token danger.
- **CropImageModal:** ActivityIndicator y botón confirmar con CELLARIUM.primary.
- **CellariumLoader:** Spinner con CELLARIUM.primary (o theme).

---

# 5. Lista de Código Muerto / Limpieza Técnica

- **Estilos posiblemente no usados:**  
  - InventoryAnalyticsScreen: previewSection, previewLabel, previewText (azul); statCardWarning, statValueWarning si no se usan en ninguna vista; pdfButton si se reemplaza por CellariumPrimaryButton.  
  - GlobalWineCatalogScreen: list (padding 8); cualquier estilo ligado a CARD_HEIGHT antiguo.  
  - Otras pantallas: revisar con búsqueda de referencias styles.xxx en cada archivo.

- **Bloques legacy:**  
  - InventoryAnalyticsScreen: reasonButton/reasonButtonText (no Cellarium), confirmButton/cancelButton (verde/gris), imageButton #007bff, reportButton #8B0000, statValue #8B0000.  
  - InventoryManagementScreen, BranchManagementScreen, WineCatalogScreen, AnalyticsScreen, etc.: bloques con #8B0000, #f8f9fa, #007bff que deban migrarse a theme.

- **Helpers redundantes:**  
  - extractFunctionsHttpErrorDetails en SettingsScreen: mantener si se usa solo ahí; si se reutiliza, mover a utils/ o services/.  
  - getRoleColor en UserManagementScreen: si hay constantes de colores por rol en otro archivo, unificar.

- **Imports inconsistentes:**  
  - Supabase: reemplazar `../config/supabase` y `../services/supabase` por `../lib/supabase` en pantallas y, donde aplique, en servicios (o un solo barrel que re-exporte desde lib).

- **Props o estados residuales:**  
  - Revisar en InventoryAnalyticsScreen si helpHidden, dontShowHelpAgain, HELP_MODAL_DONT_SHOW_KEY se usan en todos los flujos.  
  - CreateTastingExamScreen: estado (name, description, selectedWineIds, etc.) declarado después de return condicional; mover arriba.

- **Ramas dev-only:**  
  - Eliminar o envolver en __DEV__ todos los console.log/warn/error que no aporten en producción; preferir logger con nivel (debug/info/error) y en producción mostrar solo error.

---

# 6. Plan de Refactor por Fases

## Fase 1: Quick wins visuales (1–2 sprints)

- **Objetivo:** Unificar colores y headers sin tocar lógica.
- **Archivos:** theme/cellariumTheme.ts (ampliar CELLARIUM y añadir UI base), InventoryAnalyticsScreen (sustituir #8B0000/#007bff/#dc3545/#f8f9fa por tokens; ActivityIndicator a CELLARIUM.primary), GlobalWineCatalogScreen (fondo #F4F4F6, spinner CELLARIUM.primary), PendingApprovalMessage (bg y texto desde theme), CocktailHeader (gradient y botón Cellarium), CocktailCard (primary y danger), CropImageModal (spinner y botón), CellariumLoader (spinner). Aplicar en todas las pantallas prioritarias: header con minHeight 108, paddingBottom 18, borderBottomRadius 26, paddingTop Math.max(insets.top, 14) donde corresponda; título 24 o 26 según guía.
- **Riesgo:** Bajo; solo estilos y tokens.
- **Beneficio:** Identidad visual única y base para componentes.

## Fase 2: Consolidación de componentes base (2–3 sprints)

- **Objetivo:** Crear CellariumHeader, CellariumScreen, CellariumCard, CellariumModal, CellariumPrimaryButton, CellariumSecondaryButton, CellariumSectionTitle, CellariumTextField y usarlos en las 8 pantallas prioritarias.
- **Archivos:** Nuevo directorio components/cellarium/ o design-system/ con los componentes; después reemplazo progresivo en cada pantalla.
- **Riesgo:** Medio; asegurar que props (título, subtítulo, onPress, etc.) cubran todos los usos actuales.
- **Beneficio:** Menos duplicación, cambios de diseño centralizados.

## Fase 3: Limpieza de estilos y código muerto (1 sprint)

- **Objetivo:** Eliminar estilos legacy duplicados (reasonButton vs reasonButtonActiveCellarium, etc.), estilos no referenciados y unificar imports de Supabase y logger.
- **Archivos:** InventoryAnalyticsScreen, GlobalWineCatalogScreen, UserManagementScreen, SettingsScreen, QrProcessorScreen; lib/supabase o barrel único; utils/logger.
- **Riesgo:** Bajo si se hace con búsqueda de referencias por cada estilo.
- **Beneficio:** Código más legible y mantenible.

## Fase 4: División de pantallas grandes (2–3 sprints)

- **Objetivo:** Extraer modales complejos o vistas a subcomponentes/pantallas. Prioridad: InventoryAnalyticsScreen (modales Registrar evento, Conteo físico, Editar vino; vistas stock/sales/comparison/reports); CocktailManagementScreen (formulario de bebida como pantalla); GlobalWineCatalogScreen (modal detalle / búsqueda si crecen).
- **Archivos:** InventoryAnalyticsScreen → InventoryEventModal, InventoryCountModal, EditInventoryWineModal o pantallas; CocktailManagementScreen → CocktailFormScreen; navegación y estado compartido vía params o context según caso.
- **Riesgo:** Medio-alto; estado y callbacks deben preservarse.
- **Beneficio:** Archivos más pequeños, testing y mantenimiento más fáciles.

## Fase 5: Unificación final del design system (1–2 sprints)

- **Objetivo:** Todas las pantallas consumen theme y componentes Cellarium; i18n para copy hardcodeado; logger único; documentación de tokens y componentes.
- **Archivos:** theme/cellariumTheme.ts (documentado), componentes en design-system/, pantallas restantes (WineCatalogScreen, InventoryManagementScreen, TastingExamsListScreen, TakeTastingExamScreen, TastingExamResultsScreen, etc.), archivos de idiomas.
- **Riesgo:** Bajo si Fases 1–4 están hechas.
- **Beneficio:** Consistencia completa y onboarding más rápido.

---

# 7. Top 20 mejoras más importantes

1. **Centralizar CELLARIUM y UI** en theme/cellariumTheme.ts (o design-system/tokens) y usarlos en todas las pantallas y componentes compartidos.
2. **Crear e implantar CellariumHeader** con medidas estándar (minHeight 108, radius 26, paddingTop safe) en las 8 pantallas prioritarias.
3. **Eliminar #8B0000 y #8E2C3A** de pantallas y componentes; reemplazar por CELLARIUM.primary (#924048) o theme.
4. **Unificar imports de Supabase** a `../lib/supabase` (o un solo barrel) en pantallas y servicios.
5. **Sustituir #f8f9fa** por CELLARIUM.bg (#F4F4F6) en guard, loading y contenedores de las pantallas refinadas y PendingApprovalMessage.
6. **Actualizar CocktailHeader y CocktailCard** a gradiente y primary Cellarium; eliminar #6D1F2B y #8E2C3A.
7. **Crear CellariumModal** y usarlo en UserManagement (2), Settings (1), InventoryAnalytics (4), Cocktail (2), QrGeneration, WineManagement (2).
8. **Refactorizar InventoryAnalyticsScreen:** unificar colores a Cellarium en tabs, stats, modales y botones; ActivityIndicator a CELLARIUM.primary.
9. **Crear CellariumPrimaryButton y CellariumSecondaryButton** e implantarlos en formularios y CTAs de las 8 pantallas.
10. **Extraer modales de InventoryAnalyticsScreen** (Registrar evento, Conteo físico, Editar vino) a subcomponentes o pantallas para reducir tamaño del archivo.
11. **GlobalWineCatalogScreen:** fondo CELLARIUM.bg, header con mismo estándar (minHeight, radius), spinner CELLARIUM.primary; import supabase desde lib.
12. **Migrar copy hardcodeado a i18n** en CreateTastingExamScreen, QrGenerationScreen (Alert y guard) y cualquier otro Alert en español.
13. **Corregir orden de hooks en CreateTastingExamScreen** (todos los useState antes del primer return).
14. **Reducir y unificar __DEV__/console** en InventoryAnalyticsScreen, QrProcessorScreen, UserManagementScreen, SettingsScreen, CocktailManagementScreen; usar logger con niveles.
15. **Crear CellariumCard** y usarlo en listas/cards de InventoryAnalytics, GlobalWineCatalog, Cocktail, User, Settings.
16. **PendingApprovalMessage y CellariumLoader:** consumir theme (bg, muted, primary para spinner).
17. **CropImageModal:** ActivityIndicator y botón confirmar con CELLARIUM.primary.
18. **Estandarizar header en todas las pantallas:** mismo paddingTop (Math.max(insets.top, 14)), borderBottomRadius 26, minHeight 108 donde aplique.
19. **UserManagementScreen:** extraer RoleSelectionModal reutilizable; unificar estilos de modal con CellariumModal cuando exista.
20. **Documentar design system:** tokens (colores, espaciado, tipografía), componentes y uso en README o docs/ dentro del repo.

---

*Fin de la auditoría. No se ha aplicado ningún cambio en el código.*
