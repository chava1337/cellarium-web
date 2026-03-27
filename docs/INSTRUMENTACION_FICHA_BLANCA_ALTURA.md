# Instrumentación temporal: altura real de la ficha blanca

## Objetivo

Medir en runtime la altura del contenedor blanco de la ficha (WineInfoBlock) en guest vs owner/staff y comprobar si los estilos guest (`minHeight: 200`) se aplican al nodo correcto.

## Contenedores instrumentados (solo __DEV__)

| Log prefijo | Nodo | Estilo aplicado |
|-------------|------|------------------|
| `[FICHA_LAYOUT] container` | `View` con `wineInfoBlockContainer` + `wineInfoBlockContainerGuest` (si isGuest) | Es la caja blanca completa (overlay + contenido + botón Maridajes). **Aquí está el minHeight: 200** cuando isGuest. |
| `[FICHA_LAYOUT] content` | `View` con `wineInfoBlockContent` + `wineInfoBlockContentGuest` (si isGuest) | Es el bloque de contenido (texto + ABV + vintage). No tiene minHeight; su altura es la del contenido. |

Cada log incluye: `wineName`, `isGuest`, `width`, `height`, y en container además `stylesApplied: { containerGuest, contentGuest }`.

## Cómo comparar

1. **Guest (se ve vacía):** Abrir una card de vino en modo comensal. En consola buscar `[FICHA_LAYOUT]` con `isGuest: true`. Anotar `height` de **container** y de **content**.
2. **Owner/staff (se ve bien):** Misma card (o otra) en modo owner/staff. Buscar `[FICHA_LAYOUT]` con `isGuest: false`. Anotar `height` de **container** y de **content**.

## Interpretación

- **Si en guest `container.height` < 200:** El `minHeight: 200` de `wineInfoBlockContainerGuest` no está aplicando al nodo que se mide (p. ej. un padre con altura fija o flex que la limita). Habría que aplicar minHeight al nodo que envuelve este View (p. ej. `wineAdditionalInfoContent`) o revisar la cadena de estilos.
- **Si en guest `container.height` >= 200 pero la ficha se ve baja:** El contenedor sí tiene altura, pero el **contenido visible** (overlay + texto) puede estar limitado por el hijo `content` o por el hero. Revisar `content.height` y si el hero (`wineAdditionalInfo`) tiene maxHeight que recorta.
- **Si `stylesApplied.containerGuest` es false en guest:** El flag `isGuest` no está llegando a WineInfoBlock en esa ruta; revisar que se pase `isGuest={isGuest}` en el render de la card guest.

## Qué nodo tocar según el diagnóstico

| Resultado de la medida | Nodo a tocar |
|------------------------|--------------|
| container.height < 200 en guest | Asegurar minHeight en el **contenedor** (wineInfoBlockContainerGuest) o en el **padre** que lo envuelve (wineAdditionalInfoContent) cuando isGuest. |
| container.height >= 200 pero ficha se ve baja | El techo puede ser el **hero** (maxHeight 260/300) que recorta; o el contenido blanco es solo el overlay y el View “content” es quien define la altura visible → aplicar minHeight o padding al **content** (wineInfoBlockContentGuest). |
| content.height muy bajo en guest | Subir **minHeight** o **paddingVertical** en `wineInfoBlockContentGuest` para que el bloque de texto ocupe más alto. |

## Quitar la instrumentación

- En `WineInfoBlock`, eliminar `handleContainerLayout`, `handleContentLayout` y los `onLayout={...}` de ambos `View`.
- Eliminar este doc o marcarlo como “diagnóstico ya usado”.
