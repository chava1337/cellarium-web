# Fix: densidad ficha guest + grado alcohólico

## Causa raíz final

1. **Área muerta:** Owner/staff ve la misma ficha (`WineInfoBlock`) pero con más datos (p. ej. badge ABV, más texto). En guest la ficha tenía menos contenido visible y **no mostraba el grado alcohólico** porque el payload de public-menu no enviaba `alcohol_content` y el mapper no lo asignaba al tipo `Wine`. La ficha quedaba más baja y el hero con mucho espacio vacío.
2. **Grado alcohólico en guest:** El backend public-menu no incluía `alcohol_content` en el select de `wines`; `PublicMenuWine` y el mapper guest no lo tenían, por lo que `wine.alcohol_content` llegaba `undefined` y el badge no se renderizaba.

## Archivos modificados

| Archivo | Cambios |
|---------|--------|
| `supabase/functions/public-menu/index.ts` | Select de `wines`: + `alcohol_content`. Tipo `winesRaw` y map de respuesta: + `alcohol_content`. |
| `src/services/PublicMenuService.ts` | Interface `PublicMenuWine`: + `alcohol_content?: number \| string \| null`. |
| `src/screens/WineCatalogScreen.tsx` | Mapper guest: cálculo de `alcohol` desde `w.alcohol_content` y asignación a `alcohol_content` del Wine. `WineInfoBlock`: prop opcional `isGuest`; estilos `wineInfoBlockContainerGuest` (minHeight 200, justifyContent space-between) y `wineInfoBlockContentGuest` (paddingVertical 14, paddingBottom 48). Pasar `isGuest={isGuest}` en las dos rutas que renderizan WineInfoBlock. Coctelería: en ScrollView contentContainerStyle, cuando `isGuest` añadir `minHeight: 200`. Dependencias de `renderCocktailCard`: + `isGuest`. |

## Diff mínimo aplicado

### 1. Backend: public-menu

- En el `select` de `wines!inner`: añadido `alcohol_content`.
- En el tipo de `winesRaw` y en el `map` de `wines`: añadido `alcohol_content: row.wines.alcohol_content ?? null`.

### 2. PublicMenuService

- En `PublicMenuWine`: `alcohol_content?: number | string | null`.

### 3. WineCatalogScreen — mapper guest

- Antes del `return` del objeto Wine:  
  `const alcohol = w.alcohol_content != null ? (typeof w.alcohol_content === 'number' ? w.alcohol_content : parseFloat(String(w.alcohol_content).replace(',', '.'))) : undefined;`  
  y en el objeto: `alcohol_content: Number.isFinite(alcohol) ? alcohol : undefined`.

### 4. WineInfoBlock — ficha guest

- Firma: `isGuest?: boolean` (default `false`).
- Contenedor: `style={[styles.wineInfoBlockContainer, isGuest && styles.wineInfoBlockContainerGuest]}`.
- Contenido: `isGuest && styles.wineInfoBlockContentGuest`.
- Estilos nuevos:
  - `wineInfoBlockContainerGuest`: `minHeight: 200`, `justifyContent: 'space-between'`.
  - `wineInfoBlockContentGuest`: `paddingVertical: 14`, `paddingBottom: 48`.
- En ambos usos de WineInfoBlock (ImageBackground y View sin fondo): `isGuest={isGuest}`.

### 5. Coctelería guest

- ScrollView del cocktail card:  
  `contentContainerStyle={[..., isGuest && { minHeight: 200 }]}`.  
  Dependencias del useCallback de `renderCocktailCard`: + `isGuest`.

## Por qué este ajuste corrige el área muerta percibida

- **Más contenido visible:** Al mostrar el grado alcohólico en guest, la ficha gana una línea/badge y se acerca a la densidad de owner/staff.
- **Ficha más alta y estable:** Con `minHeight: 200` y `justifyContent: 'space-between'` en el contenedor de la ficha (solo en guest), el bloque blanco ocupa al menos 200px; el botón Maridajes sigue anclado abajo (absolute) y el contenido tiene más presencia, reduciendo el hueco vacío en el hero.
- **Más aire interno:** `wineInfoBlockContentGuest` aumenta el padding vertical y el inferior, de modo que la ficha se ve más llena sin tocar el hero global.

## Confirmación: grado alcohólico en guest

- **Sí se muestra en guest:** El backend envía `alcohol_content` en cada wine de public-menu; el mapper lo normaliza a número y lo asigna a `wine.alcohol_content`. `WineInfoBlock` ya renderizaba el badge ABV cuando `wine.alcohol_content` existe (mismo código para owner y guest). Con el mapper y el backend actualizados, el comensal ve el grado alcohólico en la ficha blanca igual que owner/staff (misma UI, mismo dato cuando la BD lo tiene).
