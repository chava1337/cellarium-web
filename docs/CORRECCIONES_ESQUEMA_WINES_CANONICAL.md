# Correcciones de Esquema - `wines_canonical`

**Fecha:** 2024  
**Objetivo:** Corregir todas las consultas para usar solo columnas reales del esquema

---

## Esquema Real (Source of Truth)

### Columnas Existentes:
- `id` (uuid)
- `winery` (text) - **NO JSONB**
- `label` (text) - **NO JSONB**
- `abv` (numeric)
- `color` (jsonb)
- `country` (jsonb)
- `region` (jsonb)
- `grapes` (text[])
- `serving` (jsonb)
- `image_canonical_url` (text)
- `is_shared` (bool)
- `vector_embedding` (vector) - **SIEMPRE EXCLUIR en consultas de UI**
- `created_at` (timestamptz)
- `updated_at` (timestamptz)
- `taste_profile` (jsonb)
- `flavors` (jsonb)

### Columnas NO Existentes (Eliminadas de consultas):
- ❌ `canonical_key`
- ❌ `producer` (usar `winery`)
- ❌ `name` (usar `label`)
- ❌ `vintage`
- ❌ `style`
- ❌ `tech_data`
- ❌ `tasting_notes`
- ❌ `appellation`
- ❌ `closure`
- ❌ `volume_ml`
- ❌ `aging_months`
- ❌ `oak_types`
- ❌ `soils`
- ❌ `altitude_m`
- ❌ `tasting_official`
- ❌ `pairing_official`
- ❌ `awards`
- ❌ `confidence`
- ❌ `coverage`

---

## Archivos Modificados

### 1. `src/services/GlobalWineCatalogService.ts`

#### ✅ `fetchWineDetail()` (Línea 516)

**ANTES:**
```typescript
.select(`
  id, winery, label, image_canonical_url, country, region, color, abv, grapes,
  style, appellation, volume_ml, closure, taste_profile, flavors, serving,
  tech_data, tasting_notes, canonical_key, created_at, updated_at, is_shared
`)
```

**DESPUÉS:**
```typescript
.select(`
  id, winery, label, abv, color, country, region, grapes, serving,
  image_canonical_url, is_shared, created_at, updated_at, taste_profile, flavors
`)
```

**Columnas finales:** 15 campos (solo columnas reales)  
**Excluido:** `vector_embedding`, y todos los campos inexistentes

---

#### ✅ `addWineToUserCatalog()` (Línea 793)

**ANTES:**
```typescript
.select('id, winery, label, image_canonical_url, style, grapes, region, country, abv, color, tech_data, tasting_notes, serving, taste_profile, flavors')
```

**DESPUÉS:**
```typescript
.select('id, winery, label, image_canonical_url, grapes, region, country, abv, color, serving, taste_profile, flavors, created_at, updated_at, is_shared')
```

**Columnas finales:** 15 campos (solo columnas reales)  
**Excluido:** `style`, `tech_data`, `tasting_notes` (no existen)

**Código relacionado corregido:**
- Eliminadas referencias a `tech_data` y `tasting_notes` en extracción de `taste_profile`
- `taste_profile` ahora se lee solo desde columna directa (no hay fallback a `tech_data/tasting_notes`)

---

#### ✅ `listWinesKeyset()` (Línea 406)

**Estado:** ✅ Ya estaba correcto
```typescript
.select('id, winery, label, image_canonical_url, country, region, color, abv', { count: 'exact' })
```

**Columnas finales:** 8 campos (solo para listado)  
**Nota:** `winery` y `label` son TEXT, no JSONB (correcto)

---

#### ✅ `fetchGlobalWines()` (Línea 260)

**Estado:** ✅ Ya estaba correcto
```typescript
.select('id, winery, label, image_canonical_url, country, region, color, abv', { count: 'exact' })
```

**Columnas finales:** 8 campos (solo para listado)

---

### 2. `src/services/EvidenceFirstWineService.ts`

#### ⚠️ `findOrCreateCanonicalWine()` (Líneas 237, 256)

**Problema:** Este servicio estaba diseñado para un esquema diferente con campos que no existen.

**Cambios realizados:**

1. **Búsqueda de vino existente (Línea 237):**
   - **ANTES:** Buscaba por `canonical_key` (no existe)
   - **DESPUÉS:** Busca por `winery` + `label` (campos reales)
   - **ANTES:** Seleccionaba campos inexistentes
   - **DESPUÉS:** Selecciona solo columnas reales

```typescript
// ANTES
.select('id, canonical_key, name, producer, vintage, ...')
.eq('canonical_key', canonicalKey)

// DESPUÉS
.select('id, winery, label, abv, color, country, region, grapes, serving, image_canonical_url, is_shared, created_at, updated_at, taste_profile, flavors')
.eq('winery', wineryToSearch)
.eq('label', labelToSearch)
```

2. **Inserción de vino (Línea 256):**
   - **ANTES:** Intentaba insertar campos inexistentes (`name`, `producer`, `vintage`, etc.)
   - **DESPUÉS:** Solo inserta campos que existen en el esquema

```typescript
// ANTES
.insert({
  name: extractedData.name,
  producer: extractedData.producer,
  vintage: extractedData.vintage,
  // ... muchos campos que no existen
})

// DESPUÉS
.insert({
  winery: extractedData.producer || '', // producer -> winery
  label: extractedData.name || '', // name -> label
  country: normalizedCountry,
  grapes: extractedData.grapes || [],
  abv: extractedData.abv || null,
  // Solo campos que existen
})
```

3. **Mapeo agregado:**
   - Nuevo método `mapToCanonicalWine()` para convertir datos reales a interfaz `CanonicalWine`
   - Mantiene compatibilidad con código existente que usa `CanonicalWine`

**Columnas finales (búsqueda):** 15 campos (solo columnas reales)  
**Columnas insertadas:** Solo `winery`, `label`, `country`, `grapes`, `abv` (campos soportados)

---

#### ✅ `findSimilarWines()` (Línea 439)

**ANTES:**
```typescript
.select('id, winery, label, country, region, abv, color, image_canonical_url, canonical_key, producer, name, vintage')
.or(`producer.ilike.%${producer}%,name.ilike.%${wineName}%`)
.eq('vintage', vintage)
```

**DESPUÉS:**
```typescript
.select('id, winery, label, country, region, abv, color, image_canonical_url, grapes, serving, taste_profile, flavors, created_at, updated_at, is_shared')
.or(`winery.ilike.%${producer}%,label.ilike.%${wineName}%`)
// .eq('vintage', vintage) // ❌ REMOVIDO: vintage no existe
```

**Columnas finales:** 15 campos (solo columnas reales)  
**Mapeo:** Resultados mapeados a `CanonicalWine[]` usando `mapToCanonicalWine()`

---

### 3. `src/screens/FichaExtendidaScreen.tsx`

#### ✅ Búsqueda por label (Línea 92)

**ANTES:**
```typescript
.select(`
  id, winery, label, image_canonical_url, country, region, color, abv, grapes,
  style, appellation, volume_ml, closure, taste_profile, flavors, serving,
  tech_data, tasting_notes, canonical_key, created_at, updated_at, is_shared
`)
```

**DESPUÉS:**
```typescript
.select(`
  id, winery, label, abv, color, country, region, grapes, serving,
  image_canonical_url, is_shared, created_at, updated_at, taste_profile, flavors
`)
```

**Columnas finales:** 15 campos (solo columnas reales)  
**Excluido:** `vector_embedding`, y todos los campos inexistentes

#### ✅ Referencias a campos inexistentes (Líneas 236, 240, 337)

**Correcciones:**
- `globalWineData.name` → Removido (usar solo `label` o `winery`)
- `globalWineData.style` → Removido (no existe en esquema)
- `globalWineData.vintage` → Removido (no existe en esquema, sección eliminada)

---

### 4. `src/screens/WineCatalogScreen.tsx`

#### ✅ Batch Queries (Líneas 461, 484, 507)

**Estado:** ✅ Ya estaban correctas
```typescript
.select('abv, taste_profile, label, winery, grapes, region, country, serving')
```

**Columnas finales:** 8 campos (todas reales)  
**Nota:** Estas consultas están bien, solo necesitan `taste_profile` y `serving` para normalización

---

## Resumen de Correcciones por Query

| Archivo | Función | Línea | Estado | Columnas Seleccionadas |
|---------|---------|-------|--------|----------------------|
| `GlobalWineCatalogService.ts` | `fetchWineDetail` | 516 | ✅ Corregido | 15 campos reales |
| `GlobalWineCatalogService.ts` | `addWineToUserCatalog` | 793 | ✅ Corregido | 15 campos reales |
| `GlobalWineCatalogService.ts` | `fetchGlobalWines` | 260 | ✅ Ya correcto | 8 campos reales |
| `GlobalWineCatalogService.ts` | `listWinesKeyset` | 406 | ✅ Ya correcto | 8 campos reales |
| `EvidenceFirstWineService.ts` | `findOrCreateCanonicalWine` (búsqueda) | 237 | ✅ Corregido | 15 campos reales |
| `EvidenceFirstWineService.ts` | `findOrCreateCanonicalWine` (inserción) | 256 | ✅ Corregido | Solo campos soportados |
| `EvidenceFirstWineService.ts` | `findSimilarWines` | 439 | ✅ Corregido | 15 campos reales |
| `FichaExtendidaScreen.tsx` | Búsqueda por label | 92 | ✅ Corregido | 15 campos reales |
| `FichaExtendidaScreen.tsx` | Referencias UI | 236, 240, 337 | ✅ Corregido | Removidas referencias a campos inexistentes |
| `WineCatalogScreen.tsx` | Batch queries (3) | 461, 484, 507 | ✅ Ya correcto | 8 campos reales |

---

## Mapeos Implementados

### `EvidenceFirstWineService.mapToCanonicalWine()`

Mapea datos reales de `wines_canonical` a interfaz `CanonicalWine` para mantener compatibilidad:

```typescript
{
  id: wineData.id,
  canonical_key: `${winery}|${label}|${vintage}`, // Generado localmente
  name: wineData.label, // label -> name
  producer: wineData.winery, // winery -> producer
  vintage: extractedData.vintage, // De extractedData (no existe en BD)
  // ... otros campos mapeados o con valores por defecto
}
```

**Propósito:** Mantener compatibilidad con código existente que usa `CanonicalWine` mientras se usan solo columnas reales en BD.

---

## Campos por Tipo de Vista

### 📋 LISTADO (8 campos)
```typescript
id, winery, label, image_canonical_url, country, region, color, abv
```
**Usado en:**
- `fetchGlobalWines()` - Listado paginado
- `listWinesKeyset()` - Listado con keyset pagination
- Batch queries en `WineCatalogScreen.tsx` (con `taste_profile` y `serving` adicionales)

### 📄 DETALLE (15 campos)
```typescript
id, winery, label, abv, color, country, region, grapes, serving,
image_canonical_url, is_shared, created_at, updated_at, taste_profile, flavors
```
**Usado en:**
- `fetchWineDetail()` - Detalle completo
- `FichaExtendidaScreen.tsx` - Búsqueda por label
- `addWineToUserCatalog()` - Agregar vino al catálogo
- `findOrCreateCanonicalWine()` - Búsqueda/creación

### 🔍 BÚSQUEDA SIMILAR (15 campos)
```typescript
id, winery, label, country, region, abv, color, image_canonical_url,
grapes, serving, taste_profile, flavors, created_at, updated_at, is_shared
```
**Usado en:**
- `findSimilarWines()` - Búsqueda fuzzy matching

---

## Validación

### ✅ Compilación
- ✅ Sin errores de TypeScript
- ✅ Sin errores de linter
- ✅ Tipos mantenidos correctamente

### ✅ Funcionalidad
- ✅ Todas las consultas usan solo columnas reales
- ✅ `vector_embedding` excluido de todas las consultas de UI
- ✅ Mapeos implementados para mantener compatibilidad con interfaces existentes

### ⚠️ Limitaciones Conocidas

1. **EvidenceFirstWineService:**
   - No puede insertar todos los campos de `ExtractedWineData` (muchos no existen en esquema)
   - Solo inserta: `winery`, `label`, `country`, `grapes`, `abv`
   - Campos perdidos: `vintage`, `appellation`, `aging_months`, `oak_types`, `soils`, `altitude_m`, `tasting_official`, `pairing_official`, `awards`
   - **Impacto:** El servicio "Evidence First" tiene funcionalidad limitada con el esquema actual

2. **Búsqueda por vintage:**
   - `findSimilarWines()` ya no filtra por `vintage` (no existe en esquema)
   - Puede retornar más resultados de los esperados

3. **Canonical Key:**
   - Ya no se usa `canonical_key` para búsqueda (no existe)
   - Búsqueda ahora por `winery` + `label` (menos preciso, puede haber duplicados)

---

## Resumen Final de Cambios

### Archivos Modificados: 3

1. **`src/services/GlobalWineCatalogService.ts`**
   - ✅ `fetchWineDetail()` - Corregido select (15 campos reales)
   - ✅ `addWineToUserCatalog()` - Corregido select y eliminadas referencias a `tech_data`/`tasting_notes`
   - ✅ `listWinesKeyset()` - Ya estaba correcto

2. **`src/services/EvidenceFirstWineService.ts`**
   - ✅ `findOrCreateCanonicalWine()` - Refactorizado para usar `winery`/`label` en lugar de `canonical_key`/`producer`/`name`
   - ✅ `findSimilarWines()` - Corregido para usar `winery`/`label` y remover filtro por `vintage`
   - ✅ Agregado método `mapToCanonicalWine()` para compatibilidad con interfaz existente

3. **`src/screens/FichaExtendidaScreen.tsx`**
   - ✅ Búsqueda por label - Corregido select (15 campos reales)
   - ✅ Referencias UI - Removidas referencias a `name`, `style`, `vintage`

### Queries Corregidas: 7

| Query | Archivo | Línea | Columnas Finales | Estado |
|-------|---------|-------|------------------|--------|
| `fetchWineDetail` | GlobalWineCatalogService.ts | 516 | 15 campos reales | ✅ |
| `addWineToUserCatalog` | GlobalWineCatalogService.ts | 789 | 15 campos reales | ✅ |
| `findOrCreateCanonicalWine` (búsqueda) | EvidenceFirstWineService.ts | 235 | 15 campos reales | ✅ |
| `findOrCreateCanonicalWine` (inserción) | EvidenceFirstWineService.ts | 256 | Solo campos soportados | ✅ |
| `findSimilarWines` | EvidenceFirstWineService.ts | 439 | 15 campos reales | ✅ |
| Búsqueda por label | FichaExtendidaScreen.tsx | 92 | 15 campos reales | ✅ |
| Referencias UI | FichaExtendidaScreen.tsx | 236, 240, 337 | Removidas | ✅ |

### Columnas Finales por Vista

#### 📋 LISTADO (8 campos)
```typescript
id, winery, label, image_canonical_url, country, region, color, abv
```
**Usado en:** `fetchGlobalWines()`, `listWinesKeyset()`

#### 📄 DETALLE (15 campos)
```typescript
id, winery, label, abv, color, country, region, grapes, serving,
image_canonical_url, is_shared, created_at, updated_at, taste_profile, flavors
```
**Usado en:** `fetchWineDetail()`, `FichaExtendidaScreen.tsx`, `addWineToUserCatalog()`, `findOrCreateCanonicalWine()`

#### 🔍 BÚSQUEDA SIMILAR (15 campos)
```typescript
id, winery, label, country, region, abv, color, image_canonical_url,
grapes, serving, taste_profile, flavors, created_at, updated_at, is_shared
```
**Usado en:** `findSimilarWines()`

#### 📦 BATCH QUERIES (8 campos)
```typescript
abv, taste_profile, label, winery, grapes, region, country, serving
```
**Usado en:** `WineCatalogScreen.tsx` (3 consultas batch)

---

## Próximos Pasos Recomendados

1. **Evaluar EvidenceFirstWineService:**
   - Decidir si se necesita refactorización mayor o si la funcionalidad limitada es aceptable
   - Considerar migrar campos adicionales a `wines_canonical` si se necesitan

2. **Índices SQL:**
   - Agregar índices para búsquedas por `winery` y `label` (son TEXT, no JSONB)
   - Considerar índice compuesto `(winery, label)` para búsquedas exactas

3. **Validación en Producción:**
   - Probar todas las pantallas que usan datos de `wines_canonical`
   - Verificar que no haya errores por propiedades faltantes

---

**Fin del Resumen**

