# Blueprint: Módulo Inventario y Análisis (Cellarium)

Documento técnico de auditoría y mapa del módulo **Inventario y Análisis** (Stock, ventas, reportes, comparativas). Sin propuestas de IA, escaneo automático ni flujos de etiquetas. Enfoque: arquitectura actual, flujo de datos, hallazgos y pendientes para llevar la pantalla a nivel producción.

---

## 1) Entry points y navegación

### Desde qué pantalla se entra
- **AdminDashboard** (`src/screens/AdminDashboardScreen.tsx`).
- Card del menú: título **"Inventario y Análisis"** (i18n: `admin.inventory`), subtítulo según features.
- Handler: `handleInventoryAnalytics` (líneas ~92–97).

### Ruta y stack
- **Ruta registrada:** `InventoryManagement`.
- **Stack:** React Navigation (Stack) en `AppNavigator.tsx`.
- **Componente montado:** `InventoryAnalyticsScreen` (no `InventoryManagementScreen`).
- Configuración: `headerShown: false`.

```ts
// AppNavigator.tsx
<Stack.Screen name="InventoryManagement" component={InventoryAnalyticsScreen} options={{ headerShown: false }} />
```

### Parámetros que recibe
- **Único param documentado:** `branchId: string`.
- Definición en tipos: `InventoryManagement: { branchId: string }` (`src/types/index.ts`).
- Origen: `navigation.navigate('InventoryManagement', { branchId: currentBranch.id })` desde AdminDashboard (requiere `currentBranch`; si no hay, se muestra alert y no navega).

### Resolución de branch y owner en pantalla
- `branchId = route.params?.branchId || currentBranch?.id || ''`.
- **Owner:** `user.owner_id || user.id` (no viene por params).
- **Sucursal actual:** `currentBranch` de `useBranch()`; la pantalla no cambia de sucursal desde UI (selector de branch no implementado en esta pantalla).

### Deep links
- No se encontró uso de deep links ni `linking` configurado para `InventoryManagement` en el proyecto.

---

## 2) Archivos involucrados (lista exacta)

### Pantalla principal
| Archivo | Uso |
|--------|-----|
| `src/screens/InventoryAnalyticsScreen.tsx` | Pantalla activa "Inventario y Análisis" (~2260 líneas). Incluye tabs Stock, Ventas, Comparar, Reportes. |

### Pantalla no usada (legacy/duplicado)
| Archivo | Nota |
|--------|-----|
| `src/screens/InventoryManagementScreen.tsx` | No está registrada en AppNavigator. El stack usa `InventoryAnalyticsScreen` para la ruta `InventoryManagement`. |

### Subpantallas / tabs
- No hay subpantallas ni rutas hijas. Todo está en una sola pantalla con **4 modos (tabs)**:
  - `stock` – lista de inventario y acciones +/–, editar, eliminar.
  - `sales` – gráficas y lista de vinos por métricas de ventas.
  - `comparison` – comparativa entre sucursales (solo owner, 2+ branches).
  - `reports` – resumen numérico y botones de reporte (PDF inventario; ventas/comparativo “Próximamente”).

### Componentes UI usados (dentro de la misma pantalla)
- **Header:** `View` + título "Inventario y Análisis" + subtítulo (nombre de sucursal).
- **Tabs:** 4 `TouchableOpacity` con texto (📦 Stock, 📈 Ventas, 🏢 Comparar, 📄 Reportes). Sin librería de tabs (material-top-tabs, etc.); estado `viewMode`.
- **Stock:** `FlatList`, `TextInput` búsqueda, filtros horizontales (Todos (N), Sin Movimiento), cards por ítem con imagen, info, stock, botones ➕➖✏️🗑️, valor en inventario.
- **Ventas:** `ScrollView`, `PieChart` y `BarChart` (react-native-chart-kit), botones de orden (Ventas / Ingresos / Rotación), lista de cards de métricas por vino.
- **Comparar:** `ScrollView` con cards por sucursal (nombre, ingresos, ventas, barra de contribución %).
- **Reportes:** `ScrollView`, grid de estadísticas (Vinos, Botellas, Valor total, Ingresos, Ventas), botones "Reporte de Inventario" y placeholders para reportes de ventas/comparativo.
- **Modales:** 2 `Modal` (ajuste de stock: entrada/salida, cantidad, razones; edición de vino: formulario con imagen, precios, etc.).

### Servicios
| Servicio | Path | Uso en Inventario y Análisis |
|----------|------|------------------------------|
| InventoryService | `src/services/InventoryService.ts` | `getInventoryByBranch`, `getInventoryStats`, `updateStock`, `recordMovement` (vía updateStock). |
| AnalyticsService | `src/services/AnalyticsService.ts` | `getBranchMetrics`, `getAllWinesMetrics`, `getAllBranchesComparison`. |
| PDFReportService | `src/services/PDFReportService.ts` | Llamada a `generateAndShareReport(reportData)` desde la pantalla; **el servicio solo expone `exportInventoryReport(branchName, inventory, stats)`** (ver hallazgos). |
| WineService | `src/services/WineService.ts` | `updateWine`, `deleteWine` (edición y borrado de vino). |
| Supabase (cliente) | `src/lib/supabase.ts` | Queries directos: `wines` (select owner_id), `wine_branch_stock` (update precios, delete por wine_id+branch_id), comprobaciones antes de eliminar. |

### Utils
- No hay módulo específico de utils para este módulo (p. ej. `formatMoney` centralizado). Formateo inline:
  - Precios: `item.price_by_bottle?.toFixed(2)`, `(item.stock_quantity * (item.price_by_bottle \|\| 0)).toFixed(2)`.
  - Fechas: `new Date().toLocaleString('es-MX', ...)` para reportData; en PDF, `toLocaleDateString('es-ES', ...)`.

### Tipos (TypeScript)
| Origen | Tipos relevantes |
|--------|-------------------|
| `src/types/index.ts` | `RootStackParamList['InventoryManagement']` = `{ branchId: string }`; `InventoryMovement` (no usado por InventoryService que define el suyo). |
| `src/services/InventoryService.ts` | `InventoryItem`, `InventoryStats`, `InventoryMovement`. |
| `src/services/AnalyticsService.ts` | `WineMetrics`, `BranchMetrics`, `ComparisonMetrics`, `DateRangeMetrics`. |

### Estilos y temas
- Estilos: **todos en el mismo archivo** `InventoryAnalyticsScreen.tsx` con `StyleSheet.create({ ... })` (container, header, tabs, cards, modales, botones, etc.).
- Colores: hardcodeados (#8B0000, #B22222, #DC143C, #333, #999, etc.); no se usa un tema global tipo CELLARIUM para esta pantalla.
- Sin `LinearGradient` ni `ImageBackground` en esta pantalla (a diferencia del catálogo).

---

## 3) Flujo de datos (DATA FLOW)

### Fuente de verdad de branch y owner
- **Branch:** `branchId` = `route.params?.branchId ?? currentBranch?.id ?? ''`. Si no hay branch, `loadData` puede no tener branch válido.
- **Owner:** `ownerId = user.owner_id || user.id` dentro de `loadData`; no se cachea en ref.

### Tablas Supabase tocadas

| Tabla | Operación | Dónde |
|-------|-----------|--------|
| wine_branch_stock | SELECT | InventoryService.getInventoryByBranch (con wines), getInventoryStats (vía getInventoryByBranch); AnalyticsService (getWineMetrics, getAllWinesMetrics, getBranchMetrics); comparación (getAllBranchesComparison). |
| wine_branch_stock | UPDATE | InventoryService.updateStock (stock_quantity, updated_at); pantalla (edición de precios por ítem). |
| wine_branch_stock | DELETE | Pantalla handleDeleteWine (solo filas del branch actual). |
| wines | SELECT | Implícito en join de wine_branch_stock; pantalla (owner_id para validar delete). |
| wines | UPDATE | WineService.updateWine (edición de vino). |
| wines | DELETE | WineService.deleteWine (solo si no queda stock en ninguna sucursal). |
| inventory_movements | INSERT | InventoryService.recordMovement (después de updateStock). Si la tabla no existe o RLS falla, se ignora y el stock ya quedó actualizado. |
| sale_items | SELECT | AnalyticsService.getWineMetrics, getBranchMetrics (vía getAllWinesMetrics). Si no existe, se devuelven métricas en cero. |
| sales | SELECT | Via sale_items (join). |
| branches | SELECT | AnalyticsService.getBranchMetrics, getAllBranchesComparison. |

### Cómo se construye la lista “Todos (N)”
- **Fuente:** `inventory` (estado) = resultado de `InventoryService.getInventoryByBranch(branchId, ownerId)`.
- **“Todos (N)”:** el chip muestra `Todos (inventory.length)`; el filtro “all” usa la lista completa antes de aplicar búsqueda.
- **Lista mostrada:** `filteredInventory`; se actualiza en `filterInventory()` que:
  - Filtra por `searchQuery` (nombre, grape_variety, region, country).
  - Si `filterType === 'no_movement'`: actualmente **placeholder** que no filtra por movimiento real (`item.stock_quantity === item.stock_quantity`), por tanto no cambia nada.

### Cómo se determina “Sin movimiento”
- **Estado actual:** el filtro “Sin Movimiento” **no está implementado**. En `filterInventory`, cuando `filterType === 'no_movement'` se aplica un filtro placeholder que no excluye ningún ítem.
- Para implementarlo habría que definir “sin movimiento” (p. ej. sin registros en `inventory_movements` en un rango de fechas, o sin ventas en `sale_items`) y consultar o marcar ítems en consecuencia.

### Cómo se obtiene Stock Actual
- **Por ítem:** `item.stock_quantity` de cada fila de `wine_branch_stock` devuelta por `getInventoryByBranch`.
- No se usa historial de movimientos para “stock actual”; es el valor actual de la columna.

### Cómo se calcula “Valor en inventario”
- **Por ítem (card):** `(item.stock_quantity * (item.price_by_bottle || 0)).toFixed(2)`.
- **Estadísticas globales (InventoryStats):** `totalValue = inventory.reduce((sum, item) => sum + (item.stock_quantity * (item.price_by_bottle || 0)), 0)` (en `InventoryService.getInventoryStats`).
- Si `price_by_bottle` es null, se usa 0; el valor puede ser 0.00 aunque haya stock.

### Si price_by_bottle o price_by_glass es null
- **Card:** se muestra `$0.00` para precio botella y “Valor en inventario” = 0.00.
- **Estadísticas:** totalValue y totalBottles cuentan ese vino; el valor aportado es 0.
- **Reporte PDF (generateInventoryReport):** usa `item.price_by_glass?.toFixed(2) || 'N/A'`, `item.price_by_bottle?.toFixed(2) || 'N/A'`, y valor total `(price_by_bottle || 0) * stock_quantity`.
- No hay regla explícita de “ocultar precio” o “No disponible” cuando ambos son null.

### Si no hay stock / no hay precios / no hay imagen
- **Sin imagen:** placeholder con emoji 🍷 y estilo `placeholderImage`/`placeholderText`.
- **Sin stock (0):** se muestra “0 botellas”; botón ➖ puede llevar a 0 o negativo (en updateStock se hace `Math.max(0, previousQuantity + quantityChange)`).
- **Sin precios:** se muestran $0.00 y valor 0.00; no hay mensaje “No disponible”.

---

## 4) Acciones del card (según UI actual)

### Botón + (incrementar stock)
- **Función:** `openAdjustmentModal(item, 'entrada')` → abre modal; al confirmar, `handleStockAdjustment`.
- **Lógica:** `InventoryService.updateStock(stockId, wineId, branchId, +quantity, 'entrada', reason, userId, ownerId)`.
- **Tabla:** `wine_branch_stock` (UPDATE stock_quantity, updated_at); opcionalmente `inventory_movements` (INSERT).
- **Validaciones:** cantidad > 0; razón de entrada obligatoria (compra_producto, cortesia_proveedor, otro + texto).
- **Loading:** estado `adjusting`; al terminar se cierra el modal y se llama `loadData()`.

### Botón − (decrementar stock)
- Igual que arriba con `openAdjustmentModal(item, 'salida')` y en `handleStockAdjustment` quantityChange negativo.
- **Validaciones:** razón de salida obligatoria (venta, rotura, expiracion, otro + texto).
- **Tabla y flujo:** mismo que entrada.

### Botón lápiz (editar)
- **Función:** `openEditModal(item)` → rellena `wineEditData` con datos del ítem y abre modal de edición.
- **Navegación:** no navega a otra pantalla; todo en modal dentro de InventoryAnalyticsScreen.
- **Payload guardado:** `WineService.updateWine(wineId, ownerId, { name, winery, grape_variety, region, country, vintage, description, tasting_notes, image_url, ... })` y actualización de `wine_branch_stock` (price_by_bottle, price_by_glass) vía Supabase directo.
- **Imagen:** opción “Seleccionar imagen” que sube a Supabase Storage (wine-bottles) y actualiza URL en estado y luego en BD al guardar.

### Botón basura (eliminar)
- **Confirmación:** `Alert.alert('Eliminar Vino', ...)` con botones Cancelar / Eliminar.
- **Pasos:** 1) Comprobar que el vino pertenece al owner (`wines.owner_id`). 2) DELETE en `wine_branch_stock` donde `wine_id` y `branch_id` (solo branch actual). 3) SELECT en `wine_branch_stock` por `wine_id`; si no hay filas en otras sucursales, `WineService.deleteWine(wine_id, ownerId)` (DELETE en `wines`).
- **Riesgos:** si falla el delete de stock o hay race, el vino podría quedar sin stock en ninguna sucursal pero no eliminado; no hay transacción explícita. Estado `deletingWine` deshabilita el botón durante el proceso.

### Manejo de errores y loading
- **Loading global:** estado `loading`; pantalla muestra `ActivityIndicator` + “Cargando datos...” y no pinta tabs/contenido.
- **Ajuste:** `adjusting` en modal; “Confirmar” muestra spinner.
- **Edición:** `savingWine`; **Eliminar:** `deletingWine`.
- Errores: `Alert.alert('Error', ...)` con mensaje genérico o `error.message`. No hay retry automático ni estados vacíos diferenciados por error.

---

## 5) Estado y performance

### Listas
- **Stock:** `FlatList` con `data={filteredInventory}`, `keyExtractor={(item) => item.id}`, `ListEmptyComponent` para “No hay vinos en el inventario”. Sin paginación ni `onEndReached`.
- **Ventas:** lista de métricas con `sortedWines.map(...)` dentro de `ScrollView` (no virtualizada).
- **Comparar:** `ScrollView` con cards por sucursal.
- No hay `snapToInterval` ni comportamiento tipo carrusel.

### Dependencias de estado y efectos
- **useEffect([branchId, viewMode]):** llama `loadData()`. Al cambiar tab (viewMode) o branchId se recargan datos (inventario, stats, métricas de ventas o comparación según modo).
- **useEffect([inventory, searchQuery, filterType]):** solo cuando `viewMode === 'stock'`; ejecuta `filterInventory()` y actualiza `filteredInventory`.
- No hay focus listener para recargar al volver a la pantalla.
- Búsqueda: sin debounce; cada cambio de `searchQuery` dispara el efecto y filtrado en cliente.

### Riesgos
- **Re-renders:** filtrado y ordenación se hacen en cada cambio de dependencias; listas grandes en Ventas/Comparar sin virtualización.
- **Queries repetidas:** al cambiar de tab se llama de nuevo a APIs (getInventoryByBranch + getInventoryStats en stock; getBranchMetrics + getAllWinesMetrics en sales; getAllBranchesComparison en comparison). No hay cache por tab ni por branch.
- **Filtros costosos:** “Sin Movimiento” no implementado; si se implementara con consulta a `inventory_movements`, convendría no traer todo el inventario y filtrar en memoria para muchos ítems.

### Sugerencias (sin código)
- Cachear por `branchId` + `viewMode` (o invalidar al volver con focus) para evitar recargas innecesarias.
- Debounce en `searchQuery` (ej. 300 ms) antes de filtrar.
- En tab Ventas, considerar FlatList o lista virtualizada si hay muchos vinos.
- Memoizar `filteredInventory` / listas derivadas con `useMemo` según dependencias.

---

## 6) Dependencias externas y librerías

### Tabs
- **Custom:** 4 `TouchableOpacity` con estilo activo/inactivo; no material-top-tabs ni react-navigation bottom tabs.

### UI
- **react-native:** View, Text, FlatList, TouchableOpacity, TextInput, Modal, ScrollView, Image, ActivityIndicator, Dimensions.
- **react-native-chart-kit:** `PieChart`, `BarChart` (tab Ventas).
- **expo-image-picker:** selección de imagen en modal de edición.
- **expo-file-system/legacy:** lectura base64 para subir imagen en edición.
- **react-native-safe-area-context:** SafeAreaView, useSafeAreaInsets.
- No LinearGradient ni ImageBackground en esta pantalla.

### Formateo y fechas
- **Números:** `.toFixed(2)` inline; no hay intl ni formateador centralizado.
- **Fechas:** `Date` + `toLocaleString` / `toLocaleDateString` (es-MX, es-ES). No dayjs ni date-fns en este módulo.

### Charts
- **react-native-chart-kit** (PieChart, BarChart); configuración de color rgba(139,0,0,…).

### Hooks y contexto
- **useAuth:** user (owner_id, id, role).
- **useBranch:** currentBranch, availableBranches.
- **useAdminGuard:** allowedRoles owner, gerente, sommelier, supervisor; redirige o muestra PendingApprovalMessage.
- No Zustand ni store global específico de inventario.

---

## 7) Checklist “Production polish” (específico para este módulo)

### Estados vacíos
- **Sin vinos en inventario:** hay `ListEmptyComponent` con texto “No hay vinos en el inventario” y emoji.
- **Sin datos de ventas:** tab Ventas muestra “No hay datos de ventas” si `!branchMetrics`.
- **Sin movimiento:** filtro no implementado; no hay estado vacío específico.
- **Comparar sin suficientes sucursales:** tab “Comparar” deshabilitado y estilo `tabDisabled`; no mensaje explicativo en el contenido.

### Skeleton / loading
- Solo pantalla completa con `ActivityIndicator` y “Cargando datos...” cuando `loading`. No skeleton por sección ni por card.

### Accesibilidad y UX
- No se encontraron `accessibilityLabel` / `accessibilityHint` en botones ni campos.
- Touch targets: botones ➕➖✏️🗑️ en una fila; tamaño depende de estilos (revisar mínimo ~44pt).
- No hay haptics en acciones críticas (ajuste, eliminar).

### Consistencia visual con catálogo premium
- Esta pantalla no usa el mismo header con gradiente ni paleta CELLARIUM que WineCatalogScreen; colores y header son propios del archivo.
- Cards y espaciado no unificados con el catálogo.

### Reglas de precios
- **Nunca mostrar $0 como “precio” cuando es null:** no implementado; se muestra `$0.00` cuando price_by_bottle es null.
- **Si null ⇒ ocultar:** no; se muestra “0.00” o “N/A” en PDF.
- **Si ambos null ⇒ “No disponible”:** no; en card se muestra “$0.00 / botella” y valor 0.00.

### Offline y retry
- No hay detección de red ni cola offline. Si falla la petición, solo se muestra Alert; no retry automático ni botón “Reintentar” en pantalla principal.

### Logs
- **Dev:** varios `console.log` (📦, 📊, ✅, ⚠️, 🔑, etc.) en loadData, InventoryService, AnalyticsService.
- **Prod:** no hay guardas por `__DEV__`; los mismos logs podrían ejecutarse en producción. Convendría reducir o envolver en `if (__DEV__)`.

---

## Hallazgos y pendientes (resumen)

1. **PDF: método inexistente**  
   La pantalla llama `PDFReportService.generateAndShareReport(reportData)`, pero el servicio solo tiene `exportInventoryReport(branchName, inventory, stats)`. O se añade `generateAndShareReport` que acepte `reportData` y delegue, o se cambia la pantalla a `exportInventoryReport(currentBranch?.name, inventory, inventoryStats)`.

2. **PDF: stats en HTML**  
   `generateInventoryReport` usa `stats.total_wines` y `stats.total_bottles`; la interfaz `InventoryStats` tiene `totalWines` y `totalBottles`. En runtime los valores en el HTML serían undefined a menos que exista un adapter; corregir a camelCase o pasar snake_case desde quien llame.

3. **Filtro “Sin Movimiento”**  
   No implementado; el filtro actual no excluye ningún ítem. Definir criterio (p. ej. sin movimientos en N días) y aplicar en backend o en cliente con datos de `inventory_movements`.

4. **AnalyticsService.getWineMetrics**  
   En el early return cuando `sale_items` no existe se usan `wineData?.price_bottle` y `wineData?.wines?.price_bottle`; el select devuelve `price_by_bottle` en el nivel de stock. Además el objeto devuelto no cumple la interfaz `WineMetrics` (falta campos, y usa `days_since_last_sale` en lugar de `last_sale_date`). Revisar y alinear con WineMetrics.

5. **Pantalla duplicada**  
   `InventoryManagementScreen.tsx` no se usa; el stack usa `InventoryAnalyticsScreen`. Decidir si eliminar el archivo legacy o unificar.

6. **Precios null**  
   Unificar criterio: no mostrar $0 cuando el precio es null; mostrar “—”, “N/A” o “No disponible” y no incluir valor en “Valor en inventario” cuando no hay precio.

7. **Deep links**  
   No hay; si se requieren, añadir `InventoryManagement` al config de `linking` con `branchId` opcional.

---

## Mapa rápido: archivos y funciones clave

| Ámbito | Archivo / función / tabla |
|--------|---------------------------|
| Entry | AdminDashboardScreen.handleInventoryAnalytics → navigate('InventoryManagement', { branchId }) |
| Pantalla | InventoryAnalyticsScreen.tsx (loadData, filterInventory, handleStockAdjustment, openEditModal, handleSaveWine, handleDeleteWine, generatePDF, renderStockTab, renderSalesTab, renderComparisonTab, renderReportsTab) |
| Servicios | InventoryService.getInventoryByBranch, getInventoryStats, updateStock, recordMovement |
| | AnalyticsService.getBranchMetrics, getAllWinesMetrics, getAllBranchesComparison |
| | WineService.updateWine, deleteWine |
| | PDFReportService.generateInventoryReport, exportInventoryReport, saveAndShareHTML (generateAndShareReport no existe) |
| Tablas | wine_branch_stock (SELECT/UPDATE/DELETE), wines (SELECT/UPDATE/DELETE), inventory_movements (INSERT), sale_items + sales (SELECT), branches (SELECT) |
| Tipos | InventoryItem, InventoryStats, InventoryMovement (InventoryService); WineMetrics, BranchMetrics, ComparisonMetrics (AnalyticsService); RootStackParamList.InventoryManagement |

---

*Documento generado como blueprint de auditoría. No incluye cambios de código; sirve como base para planear mejoras y llevar el módulo Inventario y Análisis a nivel producción.*
