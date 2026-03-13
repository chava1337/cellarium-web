# Auditoría fase 2: iconos del scroll horizontal (tipos de vino)

## 1. Por qué en catálogo los iconos se ven en blanco

En **WineCatalogScreen** el chip de filtro (`FilterChip`) renderiza el icono así:

```tsx
<Ionicons name={item.iconName} size={iconSize} color="#FFFFFF" />
```

El color está **hardcodeado a blanco** (`#FFFFFF`) para que contraste con el fondo de la barra de filtros, que es un **LinearGradient** con la paleta Cellarium:

- `primaryDarker: "#4e2228"`
- `primary: "#924048"`
- `primaryDark: "#6f2f37"`

El chip activo usa además `backgroundColor: CELLARIUM.chipActiveBg` (`rgba(255,255,255,0.14)`) y `borderColor: CELLARIUM.chipBorder`. Por tanto, en la app real **no se usa `accentColor`** en los chips; solo en otras vistas podría usarse. La preview antigua mostraba iconos con `accentColor` sobre fondo oscuro, por eso no representaba el look del catálogo.

## 2. Cambios en la preview (WineTypeIconPreviewScreen)

- **Dos modos visuales:**
  - **Con color (accent):** iconos con `accentColor` sobre fondo oscuro (como antes).
  - **Como en catálogo:** iconos blancos sobre el mismo gradiente que la barra del catálogo, con etiqueta en blanco suave, para reproducir el look real del chip.

- **Comparación MaterialCommunityIcons (solo tipos problemáticos):**
  - **sparkling:** `glass-flute`, `glass-wine` (copa flauta / vino).
  - **dessert:** `candy`, `cake`, `cookie` (alternativas más sobrias que ice-cream).
  - **fortified:** `bottle-wine-outline`, `glass-wine` (menos “administrativo” que shield).
  - **rose:** `flower`, `flower-outline`, `flower-tulip` (flor como alternativa a rose de Ionicons).

- Las opciones MCI se muestran siempre en **modo “como en catálogo”** (blanco sobre gradiente) para comparar en igualdad con los Ionicons en ese mismo modo.

## 3. Opciones nuevas probadas (MaterialCommunityIcons / MDI)

| Wine type  | Iconos MDI probados           | Semántica                          |
|-----------|--------------------------------|------------------------------------|
| sparkling | `glass-flute`, `glass-wine`    | Copa flauta (champagne) / copa vino |
| dessert   | `candy`, `cake`, `cookie`      | Dulce/postre más sobrio            |
| fortified | `bottle-wine-outline`, `glass-wine` | Botella / copa (vino fuerte)  |
| rose      | `flower`, `flower-outline`, `flower-tulip` | Flor (rosado)              |

**Confirmación de existencia (Pictogrammers/MDI):**

- `glass-flute` – existe (champagne flute).
- `glass-wine` – existe (copa de vino).
- `bottle-wine-outline` – existe (botella de vino).
- `flower`, `flower-outline`, `flower-tulip` – nombres estándar MDI; conviene confirmar en la versión exacta de `@expo/vector-icons` del proyecto.
- `candy`, `cake`, `cookie` – nombres muy habituales en MDI; misma recomendación de verificación en runtime.

Si algún nombre no existe en la versión local de MaterialCommunityIcons, el icono puede verse vacío o como fallback; en ese caso basta con quitarlo de `MCI_CANDIDATES` en la preview.

## 4. Recomendación por familia de iconos

- **Ionicons**  
  - Buen comportamiento general y ya integrado en el proyecto.  
  - Limitaciones: sparkling → solo “sparkles” (genérico); dessert → “ice-cream” (muy informal); fortified → “shield” (metáfora, no dominio vino).

- **MaterialCommunityIcons (MDI)**  
  - Mejor para **dominio vino**: `glass-flute`, `glass-wine`, `bottle-wine-outline` encajan muy bien con sparkling y fortified.  
  - Para dessert, `cake` o `candy` son más sobrios que `ice-cream`.  
  - Para rose, `flower` / `flower-tulip` son alternativas claras a “rosa”.

**Recomendación final:**

- **Mantener Ionicons** para acciones de sistema (cerrar, guardar, navegación, etc.) y para tipos de vino donde ya funciona bien (red, white, rose con `rose`).
- **Valorar MaterialCommunityIcons** solo para los tipos de vino donde Ionicons es más limitado:
  - **sparkling:** `glass-flute` (MCI).
  - **dessert:** `cake` o `candy` (MCI) si se quiere un look más sobrio que `ice-cream`.
  - **fortified:** `bottle-wine-outline` (MCI) si se prefiere iconografía de vino en lugar de “shield”.

Implementación posible en producción (cuando se decida):

- Ampliar `wineTypeUi.ts` para permitir `iconFamily: 'Ionicons' | 'MaterialCommunityIcons'` y `iconName` según la familia.
- En el componente que renderiza el chip, usar `iconFamily` para elegir entre `<Ionicons>` y `<MaterialCommunityIcons>`.
- No es necesario cambiar lógica de filtros ni de negocio; solo el mapeo de tipo de vino → familia + nombre de icono.

## 5. Cómo revertir o seguir

- La preview es solo comparación visual; **no se ha tocado el mapping de producción** en `wineTypeUi.ts`.
- Para quitar la comparación MCI de la preview: eliminar `MCI_CANDIDATES`, el bloque “MaterialCommunityIcons (alternativas)” y el import de `MaterialCommunityIcons`.
- Para adoptar iconos MCI en producción: añadir la segunda familia en `wineTypeUi.ts` y en el renderizado del chip según lo indicado arriba.
