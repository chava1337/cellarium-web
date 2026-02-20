# WineCatalogScreen - Changelog

Este archivo contiene el historial de cambios y mejoras aplicadas al componente `WineCatalogScreen.tsx`.

## CHANGES #1
**Fix dropdown**: activeFilterKey creado para que "cocktails" se vea seleccionado (línea ~177)

## CHANGES #2
**Separar filtros**: reemplazado selectedFilter por 3 estados independientes (selectedTypeFilter, availabilityFilter, sortOrder) (líneas ~124-126, ~167-195, ~1292-1360)

- Separar filtros en 3 estados independientes
- Actualizar handleFilterSelect para usar los 3 estados independientes
- Actualizar useEffect de filtrado para usar los 3 estados independientes
- Usar sortOrder directamente, aplicar default asc solo cuando no hay type filter
- Actualizar extraData para usar los nuevos estados de filtros

**FIX**: activeFilterKey con prioridad: cocktails > selectedTypeFilter > availabilityFilter > sortOrder > all

**FIX**: Mostrar "all" solo cuando realmente no hay ningún filtro activo

**FIX**: null en lugar de 'asc' para que el label muestre "all" y no "sort_asc"

## CHANGES #3
**Performance**: Map stockByWineIdRef para evitar O(n²) en cambio de idioma (líneas ~139, ~696, ~1244)

- Map para optimizar búsqueda de stock por wine.id (evita O(n²) en cambio de idioma)
- Llenar Map para optimizar búsqueda O(1) en cambio de idioma

**FIX**: Usar Map stockByWineIdRef para evitar O(n²)

## CHANGES #5
**Búsqueda real**: barra de búsqueda implementada con searchVisible y TextInput (líneas ~127-128, ~2508-2530, ~2558-2585, estilos ~3420-3438)

- Estado para barra de búsqueda
- Alternar barra de búsqueda
- Barra de búsqueda
- Estilos para barra de búsqueda

## CHANGES #8
**toLevel1to5**: mejorada heurística para valores 1-10 (líneas ~312-318)

- Mejorar heurística para valores 1-10
- Si num > 5 && num <= 10 => convertir con num / 2 (escala 1-10 a 1-5)
- Si num > 10 => num / 20 (0-100)

## CHANGES #9
**SafeArea/paddingBottom**: paddingBottom solo en FlatList, no duplicado en SafeAreaView (líneas ~2375, ~2348-2353)

- Persist glass price to wine_branch_stock.price_by_glass + sync UI + reload
- Memoizar contentContainerStyle - paddingBottom solo aquí (no duplicar con SafeAreaView)

## MEJORA #1
**Limpiar caches de datos bilingües al cambiar de sucursal**

- Esto previene usar datos de la sucursal anterior

## MEJORA #2
**Blindar para no pisar updates recientes - solo actualizar campos bilingües**

- Si no hay stock o canonicalData, retornar wine original sin cambios
- Solo actualizar campos bilingües (name, winery, region, country, food_pairings)
- NO reescribir precios, disponibilidad, stock_quantity, etc.
- Solo actualizar campos bilingües, preservar todo lo demás

## MEJORA #3
**Actualizar estado local con validación estricta**

- Actualizar estado local con validación estricta
- Actualizar caches en memoria para evitar inconsistencias
- Enfoque híbrido - solo recargar si el upsert no regresó precio válido
- Si data.price_by_glass es válido y ya sincronizamos estado local, no recargar todo

## MEJORA #4
**Protección contra flapping para evitar remount innecesario del FlatList**

- El hook useDeviceInfo ya es estable, pero agregamos ref para estabilidad adicional
- Usar stableIsTablet para evitar remount por flapping

## MEJORA #5
**Construir listas únicas de valores para buscar**

- Construir listas únicas de valores para buscar
- Deduplicar wineries vs fallback para evitar queries duplicadas
- Query por winery fallback (solo valores no duplicados)

## MEJORA #6
**Mejor snap UX**

- fast en iOS, normal en Android

## MEJORA #7
**Reforzar estado visual al confirmar**

- Por si se limpió visualmente antes

## FIX adicionales

- false en iOS, true en Android (removeClippedSubviews)

## Resumen de los 9 ajustes aplicados

1) Fix dropdown: activeFilterKey creado para que "cocktails" se vea seleccionado (línea ~177)
2) Separar filtros: reemplazado selectedFilter por 3 estados independientes (selectedTypeFilter, availabilityFilter, sortOrder) (líneas ~124-126, ~167-195, ~1292-1360)
3) Performance: Map stockByWineIdRef para evitar O(n²) en cambio de idioma (líneas ~139, ~696, ~1244)
4) BUG disponibilidad: ya estaba corregido con != null en loadWines (líneas ~956-967)
5) Búsqueda real: barra de búsqueda implementada con searchVisible y TextInput (líneas ~127-128, ~2508-2530, ~2558-2585, estilos ~3420-3438)
6) FlatList: removeClippedSubviews condicional por Platform.OS (línea ~2651)
7) snapToInterval: optimizado para evitar array enorme de offsets (línea ~2742)
8) toLevel1to5: mejorada heurística para valores 1-10 (líneas ~312-318)
9) SafeArea/paddingBottom: paddingBottom solo en FlatList, no duplicado en SafeAreaView (líneas ~2375, ~2348-2353)






