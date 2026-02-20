# 🔍 Reporte: Warning de Grado Alcohólico Faltante

## 📋 Problema Identificado

**Warning en logs:**
```
⚠️ Vino "Gran Passione Rosso Veneto" no tiene grado alcohólico (abv) en wines_canonical
```

**Situación reportada por el usuario:**
- El vino SÍ tiene grado alcohólico en la base de datos
- El grado alcohólico SÍ aparece en el catálogo del usuario después de agregarlo

## 🔍 Análisis del Código

### 1. **Origen del Warning**
El warning se genera en `src/services/GlobalWineCatalogService.ts` línea 896:
```typescript
if (raw == null) {
  const wineLabel = (canonical as any).label || 'vino';
  console.warn(`⚠️ Vino "${wineLabel}" no tiene grado alcohólico (abv) en wines_canonical`);
  return null;
}
```

### 2. **Causa Raíz**

**Problema en `fetchGlobalWines` (línea 261):**
```typescript
.select('id, winery, label, image_canonical_url, country, region, color', { count: 'exact' })
```
❌ **NO se está seleccionando el campo `abv`**

**Flujo del problema:**
1. `fetchGlobalWines` obtiene la lista de vinos del catálogo global
2. Solo selecciona: `id, winery, label, image_canonical_url, country, region, color`
3. **NO incluye `abv`** en la selección
4. Cuando el usuario selecciona un vino y navega a `AddWineToCatalogScreen`, se pasa el objeto `wine` que **no tiene `abv`**
5. En `AddWineToCatalogScreen` (línea 100), se llama a `addWineToUserCatalog` con `canonicalWine: wine`
6. En `addWineToUserCatalog` (línea 615), si `canonicalWine` existe, se usa directamente **sin hacer consulta a BD**
7. Como `canonicalWine.abv` es `undefined`, se genera el warning
8. **PERO** cuando se hace la consulta a BD (si `canonicalWine` no existe), sí se selecciona `abv` (línea 619)

### 3. **Por qué funciona después**

Cuando el vino se guarda en la tabla `wines` del usuario:
- Si `canonicalWine` no tiene `abv`, se consulta la BD (línea 617-622) que **SÍ incluye `abv`**
- O si el vino ya existe en `wines`, se obtiene de ahí
- Por eso el grado alcohólico **SÍ aparece** en el catálogo del usuario

## ✅ Solución

### Opción 1: Agregar `abv` a `fetchGlobalWines` (Recomendada)
Agregar `abv` a la selección en `fetchGlobalWines` para que siempre esté disponible:

```typescript
.select('id, winery, label, image_canonical_url, country, region, color, abv', { count: 'exact' })
```

**Ventajas:**
- Soluciona el problema en la raíz
- Evita consultas adicionales innecesarias
- Mejora el rendimiento

### Opción 2: Verificar y consultar si falta `abv`
Modificar `addWineToUserCatalog` para que siempre consulte la BD si `canonicalWine` no tiene `abv`:

```typescript
let canonical = canonicalWine;
if (!canonical || !canonical.abv) {
  // Consultar BD para obtener abv
}
```

**Ventajas:**
- Soluciona el problema sin cambiar la consulta principal
- Más flexible

**Desventajas:**
- Requiere consulta adicional a BD
- Menos eficiente

## 🎯 Recomendación

**Implementar Opción 1** porque:
1. Es más eficiente (una sola consulta)
2. Soluciona el problema en la raíz
3. Evita warnings innecesarios
4. Mejora la consistencia de datos

## 📝 Archivos a Modificar

1. `src/services/GlobalWineCatalogService.ts`
   - Línea 261: Agregar `abv` a la selección en `fetchGlobalWines`




