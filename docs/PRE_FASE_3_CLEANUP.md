# Pre-Fase 3 Cleanup - Optimizaciones de Performance

**Fecha:** 2024  
**Objetivo:** Eliminar `count: 'exact'` de listados y estabilizar canonical_key antes de implementar Fase 3 (keyset pagination)

---

## Cambios Realizados

### OBJETIVO A: Eliminación de `count: 'exact'` en Listados

#### ✅ 1. `fetchGlobalWines()` - GlobalWineCatalogService.ts:261

**ANTES:**
```typescript
.select('id, winery, label, image_canonical_url, country, region, color, abv', { count: 'exact' })
```

**DESPUÉS:**
```typescript
.select('id, winery, label, image_canonical_url, country, region, color, abv')
```

**Cambios adicionales:**
- Removido ajuste manual de `result.count` después del filtrado (línea 345)
- `count` siempre retorna `null` (línea 350)
- La UI ya maneja `result.count || 0` correctamente, no se rompe

**Impacto:**
- ✅ Mejora de performance: Supabase no necesita calcular COUNT(*) exacto
- ✅ Menor latencia en consultas de listado
- ✅ UI compatible: `GlobalWineCatalogScreen.tsx` usa `result.count || 0` (líneas 263, 266)

---

#### ✅ 2. `listWinesKeyset()` - GlobalWineCatalogService.ts:407

**ANTES:**
```typescript
.select('id, winery, label, image_canonical_url, country, region, color, abv', { count: 'exact' })
```

**DESPUÉS:**
```typescript
.select('id, winery, label, image_canonical_url, country, region, color, abv')
```

**Cambios adicionales:**
- `count` siempre retorna `null` (línea 499)
- Agregado cálculo de `hasMore` basado en `nextCursor` (línea 495)
- Logging actualizado para mostrar `hasMore` en lugar de `count`

**Lógica de `hasMore`:**
```typescript
const hasMore = nextCursor !== null;
```

**Impacto:**
- ✅ Mejora de performance: No calcula COUNT(*) exacto
- ✅ Keyset pagination no necesita total exacto (usa `nextCursor` para detectar más páginas)
- ✅ Preparado para Fase 3: `hasMore` puede usarse en UI para mostrar "Cargar más"

---

### OBJETIVO B: Canonical Key Estable

#### ✅ 3. `mapToCanonicalWine()` - EvidenceFirstWineService.ts:288

**ANTES:**
```typescript
canonical_key: `${(wineData.winery || '').toLowerCase().replace(/[^a-z0-9]/g, '')}|${(wineData.label || '').toLowerCase().replace(/[^a-z0-9]/g, '')}|${extractedData.vintage || new Date().getFullYear()}`
```

**Problemas:**
- No normaliza espacios (`.trim()`)
- Si `vintage` no existe, usa año actual (inconsistente)
- Puede generar strings con "undefined"

**DESPUÉS:**
```typescript
// ✅ PRE-FASE 3: Canonical key estable con normalización robusta
const wineryNorm = ((wineData.winery ?? '') as string).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const labelNorm = ((wineData.label ?? '') as string).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const vintageNorm = (extractedData.vintage ?? '').toString().trim(); // Si no existe, usa '' (vacío)
const canonical_key = `${wineryNorm}|${labelNorm}|${vintageNorm}`;
```

**Mejoras:**
- ✅ Normalización robusta: `.trim()` elimina espacios antes/después
- ✅ Manejo seguro de `null`/`undefined` con `??`
- ✅ `vintage` vacío si no existe (no usa año actual, más consistente)
- ✅ Conversión explícita a string para `vintage`

**Ejemplos de canonical_key generado:**
- Con vintage: `"bodegaconcha|reservaspecial|2020"`
- Sin vintage: `"bodegaconcha|reservaspecial|"` (vacío al final)
- Con espacios: `"  Bodega Concha  "` → `"bodegaconcha"`

**Impacto:**
- ✅ Consistencia: mismo vino siempre genera mismo `canonical_key`
- ✅ Robustez: no genera strings con "undefined" o valores raros
- ✅ Compatibilidad: mantiene formato `winery|label|vintage` para búsquedas

---

## Archivos Modificados

| Archivo | Cambios | Líneas |
|---------|---------|--------|
| `src/services/GlobalWineCatalogService.ts` | Removido `count: 'exact'` en 2 métodos | 261, 345, 350, 407, 495, 499 |
| `src/services/EvidenceFirstWineService.ts` | Canonical key estable | 288-293 |

---

## Resumen de Cambios por Método

### `fetchGlobalWines()`
- ❌ Removido: `{ count: 'exact' }` del `.select()`
- ❌ Removido: Ajuste manual de `result.count = processedWines.length`
- ✅ Agregado: `result.count = null` (siempre null)
- ✅ Compatibilidad: UI usa `result.count || 0`, funciona correctamente

### `listWinesKeyset()`
- ❌ Removido: `{ count: 'exact' }` del `.select()`
- ✅ Cambiado: `count: result.count` → `count: null`
- ✅ Agregado: Cálculo de `hasMore` basado en `nextCursor`
- ✅ Mejorado: Logging muestra `hasMore` en lugar de `count`

### `mapToCanonicalWine()`
- ✅ Mejorado: Normalización robusta con `.trim()`
- ✅ Mejorado: Manejo seguro de `null`/`undefined` con `??`
- ✅ Mejorado: `vintage` vacío si no existe (no año actual)
- ✅ Mejorado: Conversión explícita a string

---

## Validación

### ✅ Compilación
- ✅ Sin errores de TypeScript
- ✅ Sin errores de linter
- ✅ Tipos mantenidos correctamente

### ✅ Compatibilidad UI
- ✅ `GlobalWineCatalogScreen.tsx` usa `result.count || 0` (compatible con `null`)
- ✅ No se rompe funcionalidad existente
- ✅ Paginación sigue funcionando (usa `range()`)

### ✅ Performance
- ✅ Supabase no calcula COUNT(*) exacto (mejor latencia)
- ✅ Menor carga en base de datos
- ✅ Preparado para keyset pagination (Fase 3)

---

## Próximos Pasos (Fase 3)

1. **Conectar `listWinesKeyset()` a UI:**
   - Reemplazar `fetchGlobalWines()` por `listWinesKeyset()` en `GlobalWineCatalogScreen.tsx`
   - Usar `nextCursor` para paginación
   - Usar `hasMore` para mostrar "Cargar más"

2. **Eliminar paginación OFFSET:**
   - Remover `.range(from, to)` de `fetchGlobalWines()`
   - Migrar completamente a keyset pagination

3. **Optimizar índices SQL:**
   - Índice en `id` (ya existe, primario)
   - Índice en `winery` y `label` para búsquedas (TEXT, no JSONB)

---

## Notas Técnicas

### ¿Por qué eliminar `count: 'exact'`?

1. **Performance:** COUNT(*) exacto requiere escanear toda la tabla (o usar índices especiales)
2. **Escalabilidad:** En tablas grandes (>10K filas), COUNT(*) puede ser lento
3. **No necesario:** Para scroll infinito, solo necesitamos saber si hay más páginas (`nextCursor`)
4. **Keyset pagination:** No requiere total exacto, solo cursor para siguiente página

### ¿Por qué canonical_key estable?

1. **Búsquedas:** Permite encontrar vinos duplicados de forma consistente
2. **Deduplicación:** Mismo vino siempre genera mismo key
3. **Robustez:** Maneja casos edge (null, undefined, espacios)
4. **Compatibilidad:** Mantiene formato esperado por código existente

---

**Fin del Resumen**

