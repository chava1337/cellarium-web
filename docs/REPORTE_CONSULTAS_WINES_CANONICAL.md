# Reporte de Consultas a `wines_canonical` - Análisis de Performance

**Fecha:** 2024  
**Objetivo:** Identificar todas las consultas a `wines_canonical` y analizar riesgos de performance, especialmente relacionados con columnas pesadas y paginación.

---

## Resumen Ejecutivo

Se encontraron **10 consultas directas** a `wines_canonical` distribuidas en 4 archivos:
- `WineCatalogScreen.tsx`: 3 consultas (batch queries)
- `GlobalWineCatalogService.ts`: 3 consultas (listado, detalle, agregar vino)
- `EvidenceFirstWineService.ts`: 3 consultas (búsqueda y creación)
- `FichaExtendidaScreen.tsx`: 1 consulta (búsqueda por label)

**Problemas identificados:**
- ✅ **3 consultas críticas** con `select('*')` que cargan columnas pesadas innecesariamente
- ⚠️ **4 consultas** con `taste_profile` y `serving` (JSONB grandes) en listados
- ⚠️ **2 consultas** usan `OFFSET` para paginación (ineficiente en grandes volúmenes)
- ⚠️ **1 función RPC** (`filter_wines_by_color`) con `OFFSET` y sin keyset pagination

---

## Columnas Pesadas Identificadas

Las siguientes columnas se consideran "pesadas" y deben evitarse en consultas de listado:

| Columna | Tipo | Tamaño Estimado | Uso |
|---------|------|----------------|-----|
| `vector_embedding` | vector | ~1.5KB por fila | Solo para búsqueda semántica |
| `taste_profile` | JSONB | ~500 bytes - 2KB | Perfil sensorial completo |
| `flavors` | JSONB | ~200-500 bytes | Lista de sabores |
| `serving` | JSONB | ~300-800 bytes | Maridajes y temperatura |
| `image_canonical_url` | TEXT | ~100-200 bytes | URL de imagen (solo si no se usa) |
| `tech_data` | JSONB | ~1-3KB | Datos técnicos completos |
| `tasting_notes` | JSONB | ~500 bytes - 2KB | Notas de cata |

---

## Consultas Detalladas

### 1. WineCatalogScreen.tsx - Batch Query por Labels (Línea 461)

**Archivo:** `src/screens/WineCatalogScreen.tsx:461`  
**Tipo de vista:** Listado (batch lookup)  
**Contexto:** Carga inicial del catálogo de vinos

```typescript
const { data: labelData, error: labelError } = await supabase
  .from('wines_canonical')
  .select('abv, taste_profile, label, winery, grapes, region, country, serving')
  .in('label', chunk);
```

**Columnas seleccionadas:**
- ✅ `abv` (ligero)
- ⚠️ `taste_profile` (JSONB pesado - ~500 bytes - 2KB)
- ✅ `label` (ligero)
- ✅ `winery` (ligero)
- ✅ `grapes` (ligero)
- ✅ `region` (ligero)
- ✅ `country` (ligero)
- ⚠️ `serving` (JSONB pesado - ~300-800 bytes)

**Ordenamiento:** Ninguno  
**Paginación:** Ninguna (usa `.in()` con chunks de 100)  
**Riesgos de performance:**
- ⚠️ **MEDIO:** Carga `taste_profile` y `serving` en batch queries (puede ser 100+ filas)
- ⚠️ **BAJO:** No usa índices explícitos (depende de índice en `label`)

**Impacto:** MEDIO - Se ejecuta en carga inicial, puede afectar tiempo de carga del catálogo.

---

### 2. WineCatalogScreen.tsx - Batch Query por Wineries (Línea 484)

**Archivo:** `src/screens/WineCatalogScreen.tsx:484`  
**Tipo de vista:** Listado (batch lookup)  
**Contexto:** Carga inicial del catálogo de vinos

```typescript
const { data: wineryData, error: wineryError } = await supabase
  .from('wines_canonical')
  .select('abv, taste_profile, label, winery, grapes, region, country, serving')
  .in('winery', chunk);
```

**Columnas seleccionadas:** (Igual que consulta #1)  
**Ordenamiento:** Ninguno  
**Paginación:** Ninguna  
**Riesgos de performance:**
- ⚠️ **MEDIO:** Mismo problema con `taste_profile` y `serving`
- ⚠️ **BAJO:** Depende de índice en `winery`

**Impacto:** MEDIO

---

### 3. WineCatalogScreen.tsx - Batch Query Fallback (Línea 507)

**Archivo:** `src/screens/WineCatalogScreen.tsx:507`  
**Tipo de vista:** Listado (batch lookup fallback)  
**Contexto:** Carga inicial del catálogo de vinos

```typescript
const { data: fallbackData, error: fallbackError } = await supabase
  .from('wines_canonical')
  .select('abv, taste_profile, label, winery, grapes, region, country, serving')
  .in('winery', chunk);
```

**Columnas seleccionadas:** (Igual que consulta #1)  
**Ordenamiento:** Ninguno  
**Paginación:** Ninguna  
**Riesgos de performance:** (Igual que consulta #2)

**Impacto:** MEDIO

---

### 4. GlobalWineCatalogService.ts - Listado con Paginación (Línea 260)

**Archivo:** `src/services/GlobalWineCatalogService.ts:260`  
**Tipo de vista:** Listado paginado  
**Contexto:** Pantalla de catálogo global (`GlobalWineCatalogScreen`)

```typescript
let query = supabase
  .from('wines_canonical')
  .select('id, winery, label, image_canonical_url, country, region, color, abv', { count: 'exact' })
  .order('label', { ascending: true })
  .range(from, to);
```

**Columnas seleccionadas:**
- ✅ Todas ligeras (sin JSONB pesados)
- ✅ `image_canonical_url` se usa en la vista

**Ordenamiento:** `ORDER BY label ASC`  
**Paginación:** `range(from, to)` → Usa `OFFSET` internamente  
**Riesgos de performance:**
- ⚠️ **ALTO:** Usa `OFFSET` para paginación (ineficiente en grandes volúmenes)
- ⚠️ **MEDIO:** `ORDER BY label` puede ser lento sin índice (label es JSONB)
- ⚠️ **BAJO:** `count: 'exact'` requiere scan completo

**Impacto:** ALTO - Esta es la consulta principal del listado global, se ejecuta frecuentemente.

---

### 5. GlobalWineCatalogService.ts - Detalle Completo (Línea 369)

**Archivo:** `src/services/GlobalWineCatalogService.ts:369`  
**Tipo de vista:** Detalle completo  
**Contexto:** Pantalla de detalle de vino (`FichaExtendidaScreen`)

```typescript
const { data, error } = await supabase
  .from('wines_canonical')
  .select('*')
  .eq('id', id)
  .single();
```

**Columnas seleccionadas:**
- ❌ **`select('*')`** → Carga TODAS las columnas incluyendo:
  - `vector_embedding` (~1.5KB)
  - `taste_profile` (~500 bytes - 2KB)
  - `flavors` (~200-500 bytes)
  - `serving` (~300-800 bytes)
  - `tech_data` (~1-3KB)
  - `tasting_notes` (~500 bytes - 2KB)
  - `image_canonical_url` (si no se usa)

**Ordenamiento:** Ninguno  
**Paginación:** Ninguna (`.single()`)  
**Riesgos de performance:**
- ⚠️ **ALTO:** Carga `vector_embedding` innecesariamente (solo para búsqueda semántica)
- ⚠️ **MEDIO:** Carga `tech_data` y `tasting_notes` que pueden no usarse siempre
- ✅ **BAJO:** Es detalle, solo 1 fila

**Impacto:** ALTO - Aunque es detalle, carga ~5-10KB de datos innecesarios por vino.

---

### 6. GlobalWineCatalogService.ts - Agregar Vino al Catálogo (Línea 618)

**Archivo:** `src/services/GlobalWineCatalogService.ts:618`  
**Tipo de vista:** Detalle (para inserción)  
**Contexto:** Agregar vino del catálogo global al catálogo del usuario

```typescript
const { data, error } = await supabase
  .from('wines_canonical')
  .select('id, winery, label, image_canonical_url, style, grapes, region, country, abv, color, tech_data, tasting_notes, serving, taste_profile, flavors')
  .eq('id', canonicalWineId)
  .single();
```

**Columnas seleccionadas:**
- ✅ Selección explícita (no `select('*')`)
- ⚠️ `tech_data` (JSONB pesado - ~1-3KB)
- ⚠️ `tasting_notes` (JSONB pesado - ~500 bytes - 2KB)
- ⚠️ `serving` (JSONB pesado - ~300-800 bytes)
- ⚠️ `taste_profile` (JSONB pesado - ~500 bytes - 2KB)
- ⚠️ `flavors` (JSONB pesado - ~200-500 bytes)

**Ordenamiento:** Ninguno  
**Paginación:** Ninguna (`.single()`)  
**Riesgos de performance:**
- ⚠️ **MEDIO:** Carga múltiples JSONB pesados, pero es necesario para la inserción
- ✅ **BAJO:** Solo se ejecuta cuando el usuario agrega un vino

**Impacto:** MEDIO - Aceptable porque es necesario para la inserción, pero podría optimizarse.

---

### 7. EvidenceFirstWineService.ts - Búsqueda por Canonical Key (Línea 235)

**Archivo:** `src/services/EvidenceFirstWineService.ts:235`  
**Tipo de vista:** Búsqueda/Verificación  
**Contexto:** Sistema "Evidence First" - verificar si vino canónico existe

```typescript
const { data: existingWine, error: searchError } = await supabase
  .from('wines_canonical')
  .select('*')
  .eq('canonical_key', canonicalKey)
  .single();
```

**Columnas seleccionadas:**
- ❌ **`select('*')`** → Carga TODAS las columnas

**Ordenamiento:** Ninguno  
**Paginación:** Ninguna (`.single()`)  
**Riesgos de performance:**
- ⚠️ **ALTO:** Carga `vector_embedding` innecesariamente
- ⚠️ **MEDIO:** Solo necesita verificar existencia, no todos los datos

**Impacto:** MEDIO - Se ejecuta durante el proceso de "Evidence First", pero solo necesita verificar existencia.

---

### 8. EvidenceFirstWineService.ts - Inserción (Línea 252)

**Archivo:** `src/services/EvidenceFirstWineService.ts:252`  
**Tipo de vista:** Inserción  
**Contexto:** Crear nuevo vino canónico

```typescript
const { data: newWine, error: insertError } = await supabase
  .from('wines_canonical')
  .insert({...})
  .select()
  .single();
```

**Columnas seleccionadas:**
- ⚠️ `.select()` sin parámetros → Retorna todas las columnas insertadas

**Ordenamiento:** Ninguno  
**Paginación:** Ninguna  
**Riesgos de performance:**
- ⚠️ **BAJO:** Solo retorna lo insertado, pero incluye columnas pesadas si existen

**Impacto:** BAJO - Es inserción, no consulta de lectura.

---

### 9. EvidenceFirstWineService.ts - Búsqueda Similar (Línea 433)

**Archivo:** `src/services/EvidenceFirstWineService.ts:433`  
**Tipo de vista:** Búsqueda con filtros  
**Contexto:** Buscar vinos similares usando fuzzy matching

```typescript
const { data: wines, error } = await supabase
  .from('wines_canonical')
  .select('*')
  .or(`producer.ilike.%${producer}%,name.ilike.%${wineName}%`)
  .eq('vintage', vintage)
  .limit(10);
```

**Columnas seleccionadas:**
- ❌ **`select('*')`** → Carga TODAS las columnas
- ⚠️ Retorna hasta 10 filas

**Ordenamiento:** Ninguno  
**Paginación:** `.limit(10)` (sin OFFSET)  
**Riesgos de performance:**
- ⚠️ **ALTO:** Carga `vector_embedding` en hasta 10 filas (~15KB innecesario)
- ⚠️ **MEDIO:** `OR` con `ILIKE` puede ser lento sin índices adecuados
- ⚠️ **MEDIO:** `.eq('vintage')` puede beneficiarse de índice

**Impacto:** MEDIO - Se ejecuta durante "Evidence First", pero carga datos innecesarios.

---

### 10. FichaExtendidaScreen.tsx - Búsqueda por Label (Línea 91)

**Archivo:** `src/screens/FichaExtendidaScreen.tsx:91`  
**Tipo de vista:** Búsqueda/Detalle  
**Contexto:** Buscar vino canónico por label exacto

```typescript
const { data: canonicalData, error: canonicalError } = await supabase
  .from('wines_canonical')
  .select('*')
  .eq('label', wineData.name)
  .maybeSingle();
```

**Columnas seleccionadas:**
- ❌ **`select('*')`** → Carga TODAS las columnas

**Ordenamiento:** Ninguno  
**Paginación:** Ninguna (`.maybeSingle()`)  
**Riesgos de performance:**
- ⚠️ **ALTO:** Carga `vector_embedding` innecesariamente
- ⚠️ **MEDIO:** `label` es JSONB, puede ser lento sin índice GIN

**Impacto:** MEDIO - Se ejecuta al abrir ficha extendida si el vino viene del catálogo global.

---

### 11. Función RPC: filter_wines_by_color (Migración 032)

**Archivo:** `supabase/migrations/032_create_filter_wines_by_color_rpc.sql:99`  
**Tipo de vista:** Listado paginado con filtros  
**Contexto:** Función RPC para filtrar vinos por color (actualmente NO se usa en el código TypeScript)

```sql
SELECT 
  wc.id,
  wc.winery,
  wc.label,
  wc.image_canonical_url,
  wc.country,
  wc.region,
  wc.color,
  wc.abv
FROM wines_canonical wc
WHERE (...)
ORDER BY COALESCE(...)
LIMIT (p_to - p_from + 1)
OFFSET p_from;
```

**Columnas seleccionadas:**
- ✅ Todas ligeras (sin JSONB pesados)

**Ordenamiento:** `ORDER BY COALESCE(extract_text_from_field(fw.label, 'en'), ...)`  
**Paginación:** `OFFSET p_from` → **Usa OFFSET**  
**Riesgos de performance:**
- ⚠️ **ALTO:** Usa `OFFSET` para paginación (ineficiente)
- ⚠️ **MEDIO:** `ORDER BY` con función puede ser lento
- ⚠️ **BAJO:** Función no se usa actualmente en el código

**Impacto:** BAJO (actualmente) - No se usa, pero si se implementa, necesita optimización.

---

## Resumen de Problemas por Impacto

### 🔴 ALTO IMPACTO (Crítico - Optimizar primero)

1. **GlobalWineCatalogService.ts:369** - `select('*')` en detalle
   - Carga `vector_embedding` innecesariamente
   - **Solución:** Selección explícita sin `vector_embedding`

2. **GlobalWineCatalogService.ts:260** - Paginación con `OFFSET`
   - Usa `range()` que internamente usa `OFFSET`
   - **Solución:** Keyset pagination con `id` o `created_at`

3. **EvidenceFirstWineService.ts:433** - `select('*')` en búsqueda
   - Carga `vector_embedding` en hasta 10 filas
   - **Solución:** Selección explícita sin `vector_embedding`

### 🟡 MEDIO IMPACTO (Optimizar después)

4. **WineCatalogScreen.tsx (3 consultas)** - Batch queries con `taste_profile` y `serving`
   - Carga JSONB pesados en batch (100+ filas)
   - **Solución:** Separar consultas: una para datos básicos, otra para datos sensoriales si se necesitan

5. **GlobalWineCatalogService.ts:618** - Múltiples JSONB pesados
   - Aceptable porque es necesario, pero podría optimizarse

6. **EvidenceFirstWineService.ts:235** - `select('*')` para verificación
   - Solo necesita verificar existencia
   - **Solución:** `select('id')` o `select('canonical_key')`

7. **FichaExtendidaScreen.tsx:91** - `select('*')` en búsqueda
   - Carga `vector_embedding` innecesariamente
   - **Solución:** Selección explícita sin `vector_embedding`

### 🟢 BAJO IMPACTO (Aceptable)

8. **EvidenceFirstWineService.ts:252** - Inserción con `.select()`
   - Es inserción, no lectura masiva

9. **filter_wines_by_color RPC** - No se usa actualmente
   - Si se implementa, necesita keyset pagination

---

## Propuestas de Optimización

### 1. Query Optimizada para LISTADO (sin columnas pesadas)

**Reemplazo para `GlobalWineCatalogService.ts:260`:**

```typescript
// ✅ OPTIMIZADO: Solo columnas necesarias para listado
let query = supabase
  .from('wines_canonical')
  .select('id, winery, label, image_canonical_url, country, region, color, abv', { count: 'exact' })
  .order('label', { ascending: true })
  .range(from, to);
```

**Mejora adicional - Keyset Pagination:**

```typescript
// ✅ OPTIMIZADO CON KEYSET: Evita OFFSET
// Primera página
let query = supabase
  .from('wines_canonical')
  .select('id, winery, label, image_canonical_url, country, region, color, abv', { count: 'exact' })
  .order('id', { ascending: true }) // Usar id para keyset (más estable que label JSONB)
  .limit(20);

// Páginas siguientes (keyset)
if (lastId) {
  query = query.gt('id', lastId); // Continuar desde último ID
}
```

---

### 2. Query Optimizada para DETALLE

**Reemplazo para `GlobalWineCatalogService.ts:369`:**

```typescript
// ✅ OPTIMIZADO: Sin vector_embedding ni columnas no usadas
const { data, error } = await supabase
  .from('wines_canonical')
  .select(`
    id,
    winery,
    label,
    image_canonical_url,
    country,
    region,
    color,
    abv,
    grapes,
    style,
    appellation,
    volume_ml,
    closure,
    taste_profile,
    flavors,
    serving,
    tech_data,
    tasting_notes
    -- ❌ EXCLUIR: vector_embedding (solo para búsqueda semántica)
  `)
  .eq('id', id)
  .single();
```

---

### 3. Batch Queries Optimizadas (WineCatalogScreen.tsx)

**Reemplazo para las 3 consultas batch (líneas 461, 484, 507):**

```typescript
// ✅ OPTIMIZADO: Separar datos básicos de datos sensoriales
// Primera consulta: Solo datos básicos (más rápida)
const { data: basicData } = await supabase
  .from('wines_canonical')
  .select('id, abv, label, winery, grapes, region, country')
  .in('label', chunk);

// Segunda consulta: Solo datos sensoriales si se necesitan (lazy load)
// Esta consulta solo se ejecuta si realmente se necesitan los datos sensoriales
const { data: sensoryData } = await supabase
  .from('wines_canonical')
  .select('id, taste_profile, serving')
  .in('id', basicData.map(w => w.id));
```

**Alternativa (si se necesitan todos los datos):**

```typescript
// ✅ OPTIMIZADO: Incluir taste_profile y serving pero excluir vector_embedding
const { data: labelData } = await supabase
  .from('wines_canonical')
  .select('id, abv, taste_profile, label, winery, grapes, region, country, serving')
  .in('label', chunk);
// Nota: taste_profile y serving son necesarios para normalización, mantenerlos
```

---

### 4. Búsqueda Optimizada (EvidenceFirstWineService.ts:433)

**Reemplazo:**

```typescript
// ✅ OPTIMIZADO: Solo columnas necesarias para matching
const { data: wines, error } = await supabase
  .from('wines_canonical')
  .select('id, producer, name, vintage, canonical_key') // Solo campos para matching
  .or(`producer.ilike.%${producer}%,name.ilike.%${wineName}%`)
  .eq('vintage', vintage)
  .limit(10);
```

---

### 5. Verificación Optimizada (EvidenceFirstWineService.ts:235)

**Reemplazo:**

```typescript
// ✅ OPTIMIZADO: Solo verificar existencia
const { data: existingWine, error: searchError } = await supabase
  .from('wines_canonical')
  .select('id, canonical_key') // Solo campos necesarios
  .eq('canonical_key', canonicalKey)
  .maybeSingle();
```

---

### 6. Búsqueda por Label Optimizada (FichaExtendidaScreen.tsx:91)

**Reemplazo:**

```typescript
// ✅ OPTIMIZADO: Sin vector_embedding
const { data: canonicalData, error: canonicalError } = await supabase
  .from('wines_canonical')
  .select(`
    id,
    winery,
    label,
    image_canonical_url,
    country,
    region,
    color,
    abv,
    grapes,
    taste_profile,
    flavors,
    serving,
    tech_data,
    tasting_notes
    -- ❌ EXCLUIR: vector_embedding
  `)
  .eq('label', wineData.name)
  .maybeSingle();
```

---

### 7. Función RPC Optimizada (filter_wines_by_color)

**Reemplazo con Keyset Pagination:**

```sql
-- ✅ OPTIMIZADO: Keyset pagination en lugar de OFFSET
CREATE OR REPLACE FUNCTION filter_wines_by_color(
  p_search_query TEXT DEFAULT '',
  p_colors TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_cursor_id UUID DEFAULT NULL, -- ✅ NUEVO: Cursor para keyset
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  winery JSONB,
  label JSONB,
  image_canonical_url TEXT,
  country JSONB,
  region JSONB,
  color JSONB,
  abv DECIMAL,
  total_count BIGINT,
  next_cursor UUID -- ✅ NUEVO: Cursor para siguiente página
) 
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total_count BIGINT;
BEGIN
  -- Contar total (solo una vez, cacheable)
  SELECT COUNT(*) INTO v_total_count
  FROM wines_canonical wc
  WHERE (
    (p_search_query IS NULL OR p_search_query = '' OR ...)
    AND (p_colors IS NULL OR ...)
  );

  -- Query principal con keyset
  RETURN QUERY
  SELECT 
    wc.id,
    wc.winery,
    wc.label,
    wc.image_canonical_url,
    wc.country,
    wc.region,
    wc.color,
    wc.abv,
    v_total_count,
    (SELECT wc2.id FROM wines_canonical wc2 
     WHERE wc2.id > wc.id 
     ORDER BY wc2.id LIMIT 1) as next_cursor
  FROM wines_canonical wc
  WHERE (
    (p_search_query IS NULL OR ...)
    AND (p_colors IS NULL OR ...)
    AND (p_cursor_id IS NULL OR wc.id > p_cursor_id) -- ✅ Keyset condition
  )
  ORDER BY wc.id ASC -- ✅ Ordenar por ID (índice primario)
  LIMIT p_limit;
END;
$$;
```

---

## Recomendaciones de Índices SQL

### Índices Existentes (verificados en migraciones)

```sql
-- ✅ Ya existe
CREATE INDEX idx_wines_canonical_key ON wines_canonical(canonical_key);
CREATE INDEX idx_wines_canonical_producer ON wines_canonical(producer);
CREATE INDEX idx_wines_canonical_country ON wines_canonical(country);
CREATE INDEX idx_wines_canonical_color_gin ON wines_canonical USING GIN (color jsonb_path_ops);
CREATE INDEX idx_wines_canonical_color_value ON wines_canonical (get_wine_color_value(color));
```

### Índices Recomendados (Agregar)

```sql
-- ✅ RECOMENDADO: Índice GIN para búsqueda en label (JSONB)
CREATE INDEX IF NOT EXISTS idx_wines_canonical_label_gin 
ON wines_canonical USING GIN (label jsonb_path_ops);

-- ✅ RECOMENDADO: Índice GIN para búsqueda en winery (JSONB)
CREATE INDEX IF NOT EXISTS idx_wines_canonical_winery_gin 
ON wines_canonical USING GIN (winery jsonb_path_ops);

-- ✅ RECOMENDADO: Índice compuesto para búsqueda por label + winery
CREATE INDEX IF NOT EXISTS idx_wines_canonical_label_winery 
ON wines_canonical USING GIN (label jsonb_path_ops, winery jsonb_path_ops);

-- ✅ RECOMENDADO: Índice para vintage (usado en EvidenceFirstWineService)
CREATE INDEX IF NOT EXISTS idx_wines_canonical_vintage 
ON wines_canonical(vintage);

-- ✅ RECOMENDADO: Índice compuesto para búsqueda similar (producer + name + vintage)
CREATE INDEX IF NOT EXISTS idx_wines_canonical_producer_name_vintage 
ON wines_canonical(producer, name, vintage);

-- ✅ RECOMENDADO: Índice para ordenamiento por ID (keyset pagination)
-- Nota: El índice primario ya existe, pero asegurar que sea usado para ORDER BY
-- (PostgreSQL usa automáticamente el índice primario para ORDER BY id)
```

---

## Plan de Implementación Sugerido

### Fase 1: Quick Wins (Impacto Alto, Esfuerzo Bajo)
1. ✅ Reemplazar `select('*')` por selección explícita en:
   - `GlobalWineCatalogService.ts:369` (detalle)
   - `EvidenceFirstWineService.ts:235` (verificación)
   - `EvidenceFirstWineService.ts:433` (búsqueda similar)
   - `FichaExtendidaScreen.tsx:91` (búsqueda por label)

**Tiempo estimado:** 1-2 horas  
**Riesgo:** Bajo (solo cambia columnas seleccionadas)

---

### Fase 2: Optimización de Paginación (Impacto Alto, Esfuerzo Medio)
2. ✅ Implementar keyset pagination en:
   - `GlobalWineCatalogService.ts:260` (listado global)

**Tiempo estimado:** 3-4 horas  
**Riesgo:** Medio (requiere cambios en UI para manejar cursor)

---

### Fase 3: Optimización de Batch Queries (Impacto Medio, Esfuerzo Medio)
3. ✅ Separar consultas básicas de sensoriales en:
   - `WineCatalogScreen.tsx` (3 consultas batch)

**Tiempo estimado:** 2-3 horas  
**Riesgo:** Bajo-Medio (requiere lazy loading de datos sensoriales)

---

### Fase 4: Índices y RPC (Impacto Medio, Esfuerzo Bajo)
4. ✅ Agregar índices recomendados
5. ✅ Optimizar función RPC `filter_wines_by_color` (si se implementa)

**Tiempo estimado:** 1-2 horas  
**Riesgo:** Bajo (solo agregar índices, no rompe funcionalidad)

---

## Métricas Esperadas

### Antes de Optimización
- **Tiempo de carga del catálogo:** ~2-3 segundos (con 100+ vinos)
- **Tamaño de respuesta detalle:** ~5-10KB por vino
- **Tiempo de paginación (página 10+):** ~500-800ms

### Después de Optimización
- **Tiempo de carga del catálogo:** ~1-1.5 segundos (reducción 40-50%)
- **Tamaño de respuesta detalle:** ~2-3KB por vino (reducción 60-70%)
- **Tiempo de paginación (página 10+):** ~100-200ms (reducción 75-80%)

---

## Notas Finales

1. **`vector_embedding`:** Esta columna solo se usa para búsqueda semántica. Nunca debe incluirse en consultas de listado o detalle normal.

2. **Keyset Pagination:** Es crítico implementar keyset pagination en lugar de OFFSET para consultas de listado que pueden tener miles de registros.

3. **Índices GIN:** Los campos JSONB (`label`, `winery`, `color`) se benefician de índices GIN para búsquedas rápidas.

4. **Separación de Datos:** Considerar separar datos básicos de datos sensoriales para permitir lazy loading.

5. **Monitoreo:** Después de implementar optimizaciones, monitorear:
   - Tiempo de respuesta de consultas
   - Uso de memoria
   - Avisos de Supabase Query Performance

---

**Fin del Reporte**

