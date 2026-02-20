# Origen de los valores de la ficha sensorial

## Dónde se muestran (tarjeta del vino)

Los valores **Body**, **Tannin**, **Sweetness** y **Acidity** de la ficha sensorial se renderizan en:

- **Archivo:** `src/screens/WineCatalogScreen.tsx`
- **Función:** `renderSensoryProfile` (aprox. líneas 1540–1638)
- **Origen de datos:** el objeto `wine` que viene de `wine_branch_stock` + `wines`:
  - `wine.body_level`       → barra "Body"
  - `wine.intensity_level` → barra "Tannin" (solo tintos/rosados)
  - `wine.sweetness_level` → barra "Sweetness"
  - `wine.acidity_level`   → barra "Acidity"

Esos campos se leen de la base de datos (tabla `wines`) y se muestran tal cual. No se generan en la pantalla del catálogo.

---

## Dónde se asignan al guardar un vino

### 1) Vino ingresado **manual** (Scan Bottle → Agregar manualmente)

- **Archivo:** `src/screens/WineManagementScreen.tsx`
- **Al guardar** (`handleSaveWine`, aprox. líneas 624–627) se usaba **siempre** un valor por defecto si el usuario no había elegido nada:
  - `body_level: wineData.body_level || 3`
  - `sweetness_level: wineData.sweetness_level || 2`
  - `acidity_level: wineData.acidity_level || 3`
  - `intensity_level: wineData.intensity_level || 4`

Antes no había controles en el formulario para estos campos, así que para vinos manuales siempre se guardaban 3, 2, 3 y 4 (efecto de “valores fijos”, no aleatorios pero tampoco elegidos por el usuario).

**Cambio realizado:** en la pantalla de revisión del mismo archivo se añadió la sección **“Perfil sensorial”** con cuatro filas (Body, Dulzor, Acidez, Tanicidad), cada una con botones del 1 al 5. El usuario puede elegir opcionalmente el nivel para cada uno. Si no elige, se siguen usando los mismos valores por defecto (3, 2, 3, 4) al guardar.

### 2) Vino procesado por **IA** (Scan Bottle → foto → Procesar con IA)

- **Archivo:** `src/screens/WineManagementScreen.tsx`
- En `processMultipleLabels` (aprox. 328–355) los niveles vienen del resultado de la IA (`getBestValue('body_level', 3)`, etc.).
- Esos resultados los proporciona **WineAIService** / **WineAIServiceEnhanced** (`src/services/WineAIService.ts`, etc.), que devuelve niveles 1–5 a partir de la descripción/etiqueta. No son aleatorios.

### 3) Valores por defecto en servicios de IA

- **Archivos:** `src/services/WineAIService.ts`, `WineAIServiceSimple.ts`, `WineAIServiceEnhanced.ts`
- Cuando la IA no devuelve un nivel, se usan fallbacks (por ejemplo 3, 2, 3, 4). Tampoco son aleatorios.

---

## Resumen

| Origen del vino | Dónde se fijan Body / Sweetness / Acidity / Tannin | ¿Aleatorio? |
|-----------------|----------------------------------------------------|-------------|
| **Manual**      | `WineManagementScreen`: antes solo defaults 3,2,3,4; ahora el usuario puede elegir 1–5 en “Perfil sensorial”. | No. Ahora el usuario los elige (o se usan los mismos defaults si no toca nada). |
| **IA**          | `WineManagementScreen` + `WineAIService*`: resultado de la IA con fallbacks fijos. | No. |
| **Visualización** | `WineCatalogScreen`: solo lee de `wine.body_level`, etc. | N/A. |

Los valores de la ficha sensorial **no se generan aleatoriamente** en ningún flujo. Para vinos manuales, a partir de este cambio el usuario puede ingresarlos en la pantalla de “Scan Bottle” en la sección **Perfil sensorial** (opcional); si no los toca, se mantienen los mismos valores por defecto que antes (3, 2, 3, 4).
