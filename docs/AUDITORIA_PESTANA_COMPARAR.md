# Auditoría completa: pestaña "Comparar" (Inventario y Análisis)

**Alcance:** Módulo Inventario y Análisis en `InventoryAnalyticsScreen.tsx`, tab "Comparar".  
**Objetivo:** Documentar cómo funciona HOY la pestaña, fuentes de datos, inconsistencias con Ventas estimadas/Reportes y plan de corrección.  
**Sin cambios de código:** solo análisis y hallazgos.

---

## 1. Entry point y navegación

### ¿Dónde se renderiza el tab "Comparar"?
- **Archivo:** `src/screens/InventoryAnalyticsScreen.tsx`
- **Ubicación:** Barra de tabs (líneas ~1234–1252). El tab es un `TouchableOpacity` con texto "🏢 Comparar".
- **Contenido:** Se renderiza con `{viewMode === 'comparison' && renderComparisonTab()}` (línea 1266). La función `renderComparisonTab` está en líneas 1094–1195.

### ¿Qué condición lo muestra o lo deshabilita?
- **Habilitado/visible:** El tab siempre se muestra; se **deshabilita** cuando `!canCompareBranches`.
- **canCompareBranches** (línea 72): `const canCompareBranches = isOwner && availableBranches.length >= 2`
  - `isOwner = user?.role === 'owner'`
  - `availableBranches` viene de `useBranch()` (BranchContext)
- Si no es owner o hay menos de 2 sucursales: el tab se ve deshabilitado (`styles.tabDisabled`), `onPress` no hace nada y `disabled={true}`.

### ¿Se limita realmente a owner o solo visualmente?
- **Solo en UI:** La condición es `isOwner && availableBranches.length >= 2`. No hay comprobación de rol en backend en esta pantalla.
- **Datos:** `getAllBranchesComparison(ownerId)` usa `ownerId` (owner actual); las sucursales se obtienen vía `wine_branch_stock` filtrando por `wines.owner_id = ownerId`. Un usuario no-owner no tiene `availableBranches.length >= 2` (BranchContext filtra por `branch_id` del usuario), así que en la práctica solo un owner puede tener el tab habilitado. No hay re-verificación de rol en el servicio.

### ¿Qué estado/tab controla la vista?
- **Estado:** `viewMode` (`useState<ViewMode>('stock')`), tipo `'stock' | 'sales' | 'comparison' | 'reports'`.
- Al pulsar "Comparar" (si está habilitado): `setViewMode('comparison')`.

### ¿Qué función carga la data al entrar a Comparar?
- **loadData** (líneas 152–224) se ejecuta en `useEffect` que depende de `[branchId, viewMode, estimatedReportPeriod]` (líneas 142–144).
- Cuando `viewMode === 'comparison' && canCompareBranches` (líneas 166–177):
  - Llama a `AnalyticsService.getAllBranchesComparison(ownerId)`.
  - Si va bien: `setComparisonMetrics(comparison)`.
  - Si falla con `PGRST205` y mensaje incluye `sale_items`: `setComparisonMetrics(null)` (tabla inexistente).
- **No se usa** `InventoryService.getSalesFromCountsByPeriod` ni `inventory_movements` en Comparar.

---

## 2. Archivos involucrados

| Tipo | Archivo | Uso en Comparar |
|------|---------|------------------|
| Pantalla | `src/screens/InventoryAnalyticsScreen.tsx` | Tab, `loadData` para comparison, `renderComparisonTab`, `generatePDF('comparison')`, estilos comparison* |
| Servicio | `src/services/AnalyticsService.ts` | `getAllBranchesComparison`, `getBranchMetrics`, `getAllWinesMetrics`, `getWineMetrics`; tipos `ComparisonMetrics`, `BranchMetrics`, `WineMetrics` |
| Contexto | `src/contexts/BranchContext.tsx` | `availableBranches`, `currentBranch`; define si hay ≥2 sucursales para el owner |
| PDF | `src/services/PDFReportService.ts` | No implementa reporte comparativo; no hay función que reciba `ComparisonMetrics` |
| Tipos | `src/services/AnalyticsService.ts` (export) | `ComparisonMetrics`, `BranchMetrics`, `WineMetrics` |

**No usados por Comparar:** `InventoryService`, `getSalesFromCountsByPeriod`, `inventory_movements`, `SalesFromCountsRow`/`SalesFromCountsSummary`.

---

## 3. Fuente de datos actual

### ¿Comparar usa AnalyticsService.getAllBranchesComparison o algo similar?
- **Sí.** La única fuente de datos para la pestaña es `AnalyticsService.getAllBranchesComparison(ownerId)`.

### ¿Usa tablas sales/sale_items o usa inventory_movements + counts?
- **sales / sale_items.**  
  Cadena real:
  1. `getAllBranchesComparison(ownerId)` obtiene sucursales desde `wine_branch_stock` (branches que tienen al menos un vino del owner).
  2. Por cada sucursal llama `getBranchMetrics(branchId, ownerId)`.
  3. `getBranchMetrics` llama `getAllWinesMetrics(branchId, ownerId)`.
  4. `getAllWinesMetrics` por cada vino en esa sucursal llama `getWineMetrics(wineId, branchId, ownerId)`.
  5. **getWineMetrics** (AnalyticsService líneas 73–207):
     - Lee `wine_branch_stock` (stock, precios, datos del vino) filtrado por `wine_id`, `branch_id`, `wines.owner_id`.
     - Lee **sale_items** con ` .eq('wine_id', wineId)` **sin filtrar por branch_id**.
     - Usa `sales(created_at, payment_status)` para filtrar no canceladas y calcular total_sales y total_revenue.
- **No se usa** `inventory_movements`, `movement_type = 'count'`, ni lógica de cortes.

### ¿Usa branches del owner actual?
- **Sí.** Sucursales salen de `wine_branch_stock` con `wines.owner_id = ownerId`; luego se deduplican por `branch_id`. Solo aparecen branches que tienen al menos un vino del owner.

### ¿Qué métricas calcula hoy?
- **Por sucursal (BranchMetrics):** total_wines, total_stock, total_inventory_value, total_sales, total_revenue, avg_ticket, top_selling_wine, top_revenue_wine, low_stock_count, out_of_stock_count.
- **Global (ComparisonMetrics):** total_system_revenue, total_system_sales, best_performing_branch, worst_performing_branch, array `branches` (BranchMetrics[]).
- **En UI:** Ingresos totales, Ventas totales, Mejor / A mejorar, por sucursal: Vinos, Ventas, Ingresos, barra y % de Contribución.

---

## 4. Lógica real de cada métrica

Origen: `AnalyticsService.getWineMetrics` → `getAllWinesMetrics` → `getBranchMetrics` → `getAllBranchesComparison`.

### getWineMetrics (por vino, por sucursal)
- **total_sales:** suma de `quantity` de `sale_items` del `wine_id`, donde `sales.payment_status !== 'cancelled'`. **No se filtra por branch:** se cuentan todas las ventas de ese vino en cualquier sucursal.
- **total_revenue:** suma de `quantity * unit_price` sobre los mismos ítems.
- Si la tabla `sale_items` no existe (error PGRST205): devuelve objeto con total_sales: 0, total_revenue: 0 (y otros campos mínimos).

### getBranchMetrics (por sucursal)
- **total_wines:** `winesMetrics.length`
- **total_stock:** `sum(winesMetrics.current_stock)`
- **total_inventory_value:** `sum(current_stock * avg_price)`
- **total_sales:** `sum(winesMetrics.total_sales)`  → hereda el bug de no filtrar por branch en getWineMetrics.
- **total_revenue:** `sum(winesMetrics.total_revenue)`  → mismo bug.
- **avg_ticket:** `totalRevenue / totalOrders` si totalOrders > 0, si no 0.
- **best/worst:** orden por total_revenue; best = primero, worst = último.

### getAllBranchesComparison
- **total_system_revenue:** `sum(branch.total_revenue)` sobre `validMetrics`.
- **total_system_sales:** `sum(branch.total_sales)` sobre `validMetrics`.
- **best_performing_branch:** nombre de la sucursal con mayor `total_revenue`.
- **worst_performing_branch:** nombre de la sucursal con menor `total_revenue`.

### En la UI (renderComparisonTab)
- **Ingresos Totales:** `comparisonMetrics.total_system_revenue.toFixed(0)` con prefijo `$`.
- **Ventas Totales:** `comparisonMetrics.total_system_sales`.
- **Mejor / A mejorar:** `best_performing_branch` / `worst_performing_branch`.
- **Contribución %:**  
  `(branch.total_revenue / comparisonMetrics.total_system_revenue) * 100`  
  tanto para el ancho de la barra como para el texto.  
  **Si total_system_revenue === 0:** división por cero → **NaN%**.
- **Ranking #1, #2…:** `comparisonMetrics.branches` ordenado por `total_revenue` descendente; el índice (+1) es el número mostrado.

---

## 5. Problemas detectados

### NaN% en contribución
- **Causa:** En líneas 1181 y 1187 se usa `(branch.total_revenue / comparisonMetrics.total_system_revenue) * 100`. Si `total_system_revenue === 0` (todas las sucursales con ingresos 0, p. ej. sin `sale_items` o sin ventas), la división da NaN y se muestra "NaN%".

### Divisiones por 0
- **Contribución:** La única división explícita en Comparar es la anterior; no hay guarda `total_system_revenue > 0`.
- **getBranchMetrics:** `avg_ticket = totalOrders > 0 ? totalRevenue / totalOrders : 0` sí está protegido.

### Ingresos totales = 0 cuando sí hay datos en Ventas estimadas
- **Sí.** Ventas estimadas usa `inventory_movements` (cortes + entradas − salidas especiales) e ignora `sale_items`. Si el negocio solo registra cortes y no usa `sale_items`, Comparar mostrará ingresos 0 (y posible NaN% en contribución) mientras Ventas estimadas muestra consumo e ingresos estimados.

### Comparar usa lógica vieja e inconsistente con Ventas estimadas
- **Sí, crítico.** Comparar depende al 100% de `sale_items`/`sales`. Ventas estimadas y Reportes usan `inventory_movements` (count, entrada, salida) y no `sale_items`. No hay una sola fuente de verdad: dos módulos del mismo flujo con fuentes distintas.

### Wording "Ventas" vs "Ventas estimadas" / "Consumo estimado"
- En Comparar se usa "Ventas Totales" y "Ventas" por sucursal (líneas 1119, 1161). En el resto del módulo se unificó a "Ventas estimadas" / "Consumo est."; aquí sigue la nomenclatura antigua.

### PDF Multi-Sucursal
- **No implementado.** `generatePDF('comparison')` (líneas 647–650) solo hace `Alert.alert('Próximamente', 'PDF comparativo multi-sucursal estará disponible pronto')`. No se llama a `PDFReportService` para comparación; no existe método que reciba `ComparisonMetrics`.

### Sucursales nuevas con pocos datos
- Si una sucursal tiene vinos en `wine_branch_stock` pero sin ventas en `sale_items`, entra en la comparativa con total_sales y total_revenue en 0. Eso es coherente con la lógica actual, pero si además `total_system_revenue === 0` (todas así), la barra de contribución y el % dan NaN.

### Vinos sin precio
- En Comparar no se usa `getSalesFromCountsByPeriod` ni `unpriced_consumption_total`. Los ingresos por sucursal vienen de `sale_items` (unit_price). Si un vino no tiene precio en venta real pero sí en stock, no hay impacto directo en Comparar; el problema de "vinos sin precio" está en Ventas estimadas/Reportes, no en esta pestaña con la lógica actual.

### Sucursal con 0 datos y validez en la comparativa
- **Sí entra.** Cualquier branch que aparezca en `wine_branch_stock` con `wines.owner_id = ownerId` se incluye. `getBranchMetrics` puede devolver total_revenue 0 y total_sales 0; esas sucursales se incluyen en `validMetrics` y en la lista. No se filtra por "tener al menos algo de ventas".

### Atribución de ventas por sucursal (bug de datos)
- **getWineMetrics** consulta `sale_items` solo por `wine_id`, sin filtrar por sucursal. La tabla `sales` tiene `branch_id`, pero el código no lo usa. Por tanto, las ventas de un vino se cuentan igual para cada sucursal que tenga ese vino en stock: **las ventas se atribuyen varias veces (una por sucursal que tenga el vino)** y no por sucursal real. Esto invalida la comparación entre sucursales.

---

## 6. Comportamiento esperado vs actual

| Aspecto | Hoy (actual) | Esperado (consistente con el módulo) |
|---------|--------------|--------------------------------------|
| Fuente de ventas/ingresos | `sale_items` + `sales` | Misma lógica que Ventas estimadas: cortes + entradas − salidas especiales por sucursal (p. ej. `getSalesFromCountsByPeriod` por branch o equivalente). |
| Métricas por sucursal | total_sales, total_revenue desde ventas reales (y con bug de no filtrar por branch) | Consumo estimado total por sucursal, ingresos estimados por sucursal (con mismo criterio de precio válido / sin precio). |
| Contribución % | % de ingresos (reales) por sucursal; NaN si total_system_revenue === 0 | % sobre total system (ingresos o consumo) con protección frente a 0 (mostrar 0% o "—"). |
| Wording | "Ventas Totales", "Ventas", "Ingresos" | "Consumo estimado" / "Ventas estimadas" e "Ingresos estimados" donde corresponda. |
| Sucursales sin datos | Incluidas con 0 | Decidir si se excluyen o se muestran con "—" / 0% y texto aclaratorio. |
| PDF Comparar | No implementado (solo alert "Próximamente") | Generar PDF con resumen por sucursal alineado a la misma fuente (cortes/estimado). |
| Atribución por sucursal | Ventas por vino no filtradas por branch (doble conteo) | Si se mantiene lógica de ventas reales, filtrar por `sales.branch_id`; si se migra a estimado, usar datos ya por branch. |

---

## 7. Plan de corrección (sin implementar aún)

### P0 – Bugs visibles
- **NaN% en contribución:** Antes de dividir, comprobar `total_system_revenue > 0`; si es 0, mostrar "0%" o "—" y barra en 0.
- **Atribución por sucursal (getWineMetrics):** Filtrar ventas por sucursal (p. ej. join o subquery con `sales.branch_id = branchId`) para que total_sales/total_revenue por branch sean correctos mientras se siga usando `sale_items`.

### P1 – Alineación con lógica de cortes
- Definir si Comparar debe pasar a **solo estimado** (cortes) o **híbrido** (real + estimado).
- Si es solo estimado: por cada sucursal llamar a `InventoryService.getSalesFromCountsByPeriod({ ownerId, branchId, days })` (o un periodo fijo 30 días) y usar `summary.total_sold_estimated`, `summary.total_revenue_estimated` (y opcionalmente `unpriced_consumption_total` / `unpriced_wines_count`) para construir un "BranchMetrics" estimado; reutilizar o definir tipo `ComparisonMetrics` con esos campos.
- Reemplazar o complementar llamadas a `getAllBranchesComparison` / `getBranchMetrics` según la decisión anterior.
- Unificar copy: "Ventas estimadas", "Consumo estimado", "Ingresos estimados" en headers y columnas.

### P2 – PDF comparativo
- En `PDFReportService` añadir método que reciba `ComparisonMetrics` (o el nuevo tipo con métricas estimadas) y genere HTML/PDF con resumen global y tabla por sucursal (consumo estimado, ingresos estimados, contribución %, etc.).
- En `generatePDF('comparison')` llamar a ese método en lugar del `Alert.alert('Próximamente')`.

### P3 – Polish visual
- Revisar formato de montos (formatCurrencyMXN, misma línea, no partir números).
- Sucursales con 0 datos: mensaje o estilo que deje claro "Sin datos en el periodo" en lugar de solo 0.
- Opcional: incluir en comparativa resumen de "Consumo sin precio configurado" por sucursal si se usa lógica de cortes.

---

## 8. Checklist de validación futura

Cuando se implementen los cambios, validar manualmente:

1. **Dos sucursales, una con datos y otra vacía**  
   - Una con cortes/ventas y otra sin: no debe haber NaN%; la vacía debe mostrar 0 o "—" en consumo/ingresos y 0% o "—" en contribución.

2. **Dos sucursales con cortes suficientes**  
   - Ambas con al menos 2 conteos por vino: comparativa debe mostrar consumo estimado e ingresos estimados por sucursal y contribución % coherente (suma 100% o se entiende el redondeo).

3. **Una sucursal con vinos sin precio**  
   - Si la comparativa usa lógica de cortes: debe mostrarse consumo sin precio (o indicador) sin romper totales ni porcentajes; ingresos estimados "—" donde no hay precio.

4. **Una sucursal con entradas y salidas especiales**  
   - Verificar que el consumo estimado por esa sucursal coincida con la pestaña Ventas estimadas para la misma sucursal y periodo.

5. **PDF comparativo**  
   - Generar PDF desde Comparar: debe incluir periodo, sucursales, consumo/ingresos estimados y contribución, sin NaN y con la misma fuente que la pantalla.

6. **Owner con una sola sucursal**  
   - Tab Comparar deshabilitado; no se ejecuta `getAllBranchesComparison` al cambiar de tab.

7. **Tabla sale_items inexistente o vacía**  
   - Si se mantiene temporalmente lógica legacy: sin NaN; si ya se migró a solo estimado, no depender de sale_items en esta pestaña.

---

**Fin de la auditoría.** No se ha modificado código; este documento sirve como blueprint para las correcciones.

---

## Implementación aplicada (post-auditoría)

La pestaña Comparar fue reimplementada para usar la misma lógica que Ventas estimadas (cortes físicos). Resumen de cambios:

- **Eliminado:** Uso de `AnalyticsService.getAllBranchesComparison`, `getBranchMetrics`, `getAllWinesMetrics`, `getWineMetrics` y tablas `sale_items`/`sales` en esta pestaña. Estado `comparisonMetrics` (tipo `ComparisonMetrics`) y su carga en `loadData`.
- **Añadido:** `InventoryService.getBranchesComparisonFromCounts({ ownerId, days })`, tipos `BranchComparisonRow` y `BranchComparisonSummary`. Estado `comparisonFromCounts` y `comparisonDays` (7/30/90). Selector de periodo, métricas “Ingresos estimados” y “Consumo estimado”, contribución % sin NaN, “Más movido” / “Menos movido” por sucursal, “Datos insuficientes” cuando no hay datos. `PDFReportService.exportBranchComparisonReport` y `generateBranchComparisonReport`.

### Checklist manual post-implementación

1. **2 sucursales con datos válidos:** Ambas con al menos un vino con 2 cortes en el periodo. Ver: resumen con ingresos y consumo totales, mejor / a mejorar, cards por sucursal con ingresos est., consumo est., contribución % (suma coherente), vino más y menos movido. Cambiar periodo 7/30/90 y comprobar que los datos se actualizan.
2. **1 sucursal válida y 1 sin datos:** Una con cortes suficientes y otra sin. Ver: una card con métricas y otra con “Datos insuficientes”. Resumen global no debe romperse; contribución % sin NaN.
3. **Sucursal con vino sin precio:** Al menos un vino con consumo pero sin precio. Ver: esa sucursal muestra consumo estimado; ingresos “—” donde corresponda; no NaN en contribución si hay otras con ingresos.
4. **PDF comparativo:** Pulsar “PDF Multi-Sucursal” con al menos una sucursal con datos. Ver: se genera y comparte el HTML/PDF con título “Reporte comparativo entre sucursales”, periodo, nota de cortes, resumen (mejor, a mejorar, ingresos/consumo totales), tabla por sucursal (ingresos est., consumo est., contribución, más/menos movido). Sin NaN en el documento.
