# Ficha sensorial que no cuadra con la BD — causa raíz

## Problema

Para un vino concreto (ej. **Tres Picos Garnacha**), la ficha sensorial en la app no coincide con lo que está guardado en la BD en el campo `taste_profile` (JSON: `body`, `tannin`, `acidity`, `sweetness` en escala 0–100).

Ejemplo BD: `taste_profile = { body: 61, tannin: 55, acidity: 20, sweetness: 10 }`.  
En app se ven, por ejemplo, Cuerpo y Tanicidad altos (~80%, ~75%) y Dulzor muy bajo.

---

## Causas

### 1. Dos fuentes de verdad

- **Tabla `wines`:** columnas `body_level`, `sweetness_level`, `acidity_level`, `intensity_level`, `fizziness_level` en **escala 1–5**.
- **`taste_profile` (JSONB):** en `wines_canonical` (o en `wines`) con **escala 0–100** (`body`, `tannin`, `acidity`, `sweetness`).

La UI del catálogo (staff/owner y guest) usa **siempre** los niveles de la tabla `wines` cuando existen. Solo se rellena desde `taste_profile` cuando esos campos están **vacíos** (null/undefined), vía `normalizeWineFromCanonical` + `extractTasteLevelsFromCanonical` + persist.

Por tanto, si para ese vino en `wines` ya había valores (p. ej. body_level=4, intensity_level=4), la ficha mostrará 4/5 ≈ 80% y 4/5 ≈ 80%, aunque en `taste_profile` tengas 61 y 55 (que en 1–5 serían 3 y 3 ≈ 60%). La “discrepancia” viene de que la app prioriza la tabla `wines` sobre `taste_profile`.

### 2. Bug en la conversión 0–100 → 1–5 (`toLevel1to5`)

En `src/utils/wineCatalogUtils.ts`, los valores en el rango **5 < num ≤ 10** (p. ej. `sweetness: 10`) se convertían con `num / 2` en vez de tratarlos como escala 0–100 (`num / 20`). Eso hacía:

- `sweetness: 10` → nivel **5** (barra llena) en lugar de nivel **1** (muy bajo).

**Corrección aplicada:** todo valor **> 5** se considera escala 0–100 y se convierte con `num / 20`; luego clamp 1–5 y redondeo. Así 10 → 0,5 → 1 y 61, 55, 20 se convierten correctamente en 3, 3, 1.

---

## Resumen

| Qué ves en la app | Origen real |
|------------------|------------|
| Niveles de la ficha | Tabla `wines` (body_level, sweetness_level, acidity_level, intensity_level, fizziness_level) cuando tienen valor |
| Si en `wines` están vacíos | Se rellenan desde `taste_profile` (wines_canonical) con `toLevel1to5` y se persisten en `wines` |
| “No cuadra con la BD” | Suele ser que en `wines` hay valores distintos a los de `taste_profile` (manual, import, etc.) y la UI usa `wines` |

Para que la ficha “cuadre” con `taste_profile`:

- O bien la tabla `wines` se rellena solo desde `taste_profile` (dejando null los niveles hasta que se normalice),  
- O bien se decide que la fuente de verdad para la ficha sea siempre `taste_profile` cuando exista y cambiar la lógica de la UI para priorizarlo (decisión de producto).

---

## Cambio de código realizado

- **`src/utils/wineCatalogUtils.ts` — `toLevel1to5`:**  
  Eliminada la rama `num > 5 && num <= 10` que hacía `num / 2`.  
  Cualquier `num > 5` se convierte con `num / 20` (escala 0–100 → 1–5).

Con esto, si un vino se rellena desde `taste_profile` (p. ej. sweetness 10), la barra de dulzor mostrará nivel 1 y no 5.
