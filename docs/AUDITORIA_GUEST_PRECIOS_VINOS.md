# Auditoría: precios de vinos no se muestran en guest

## Objetivo

Determinar por qué en el flujo guest las cards de vinos muestran "— BOTTLE" / "— GLASS" sin importe y corregirlo sin romper owner/staff ni el flujo QR.

---

## 1. Archivos auditados

| # | Archivo | Alcance |
|---|---------|--------|
| 1 | `supabase/functions/public-menu/index.ts` | Payload wines: campos de precio y disponibilidad |
| 2 | `src/services/PublicMenuService.ts` | Tipo `PublicMenuWine` |
| 3 | `src/screens/WineCatalogScreen.tsx` | `mapPublicMenuToWineCatalogItems`, `renderWineCard`, `WinePricesBlock` / `hasBottle` / `hasGlass` |
| 4 | `src/types/index.ts` | Interface `Wine` (price, price_per_glass, available_by_*) |

---

## 2. Shape real backend guest (public-menu)

Cada elemento de `wines` en la respuesta tiene exactamente:

```ts
{
  id: string;
  name: string;
  grape_variety: string | null;
  region: string | null;
  country: string | null;
  vintage: string | null;
  type: string | null;
  description: string | null;
  image_url: string | null;
  winery: string | null;
  body_level: number | null;
  sweetness_level: number | null;
  acidity_level: number | null;
  intensity_level: number | null;
  fizziness_level: number | null;
  stock_quantity: number;           // row.stock_quantity ?? 0
  price_by_glass: number | null;    // row.price_by_glass ?? null
  price_by_bottle: number | null;    // row.price_by_bottle ?? null
}
```

- **No** devuelve `price`, `price_per_glass`, `available_by_bottle` ni `available_by_glass`.
- Los precios vienen de `wine_branch_stock`: `price_by_glass`, `price_by_bottle` (select líneas 129–130, mapeo 203–204).

---

## 3. Shape esperado por `Wine` (UI)

En `src/types/index.ts`, `Wine` usa:

- `price: number` — precio botella (para mostrar y para hasBottle).
- `price_per_glass?: number` — precio copa.
- `available_by_bottle?: boolean` — si se ofrece por botella.
- `available_by_glass?: boolean` — si se ofrece por copa.

La card de precios usa:

- **Monto botella:** `toMoney(wine.price)` → mostrado solo si `effectiveHasBottle` (véase D).
- **Monto copa:** `toMoney(wine.price_per_glass)` → mostrado solo si `effectiveHasGlass`.
- **Labels:** `t('wine.bottle')` y `t('wine.glass')` (BOTTLE / GLASS).

---

## 4. Mapper guest (`mapPublicMenuToWineCatalogItems`)

Hace:

- `priceBottle = w.price_by_bottle` (number finito) o `null`.
- `priceGlass = w.price_by_glass` (number finito) o `null`.
- Asigna:
  - `price: priceBottle ?? priceGlass ?? 0`
  - `price_per_glass: priceGlass ?? undefined`
- **No asigna** `available_by_bottle` ni `available_by_glass`.

Por tanto el objeto `Wine` en guest queda con `available_by_bottle` y `available_by_glass` en **undefined**.

---

## 5. Condición exacta de render del precio (D)

En `renderWineCard` (WineCatalogScreen.tsx):

```ts
const hasBottle = wine.available_by_bottle && isValidPrice(wine.price);
const hasGlass = wine.available_by_glass && isValidPrice(wine.price_per_glass);
```

Luego en `WinePricesBlock` (footer):

- `bottleMoney = toMoney(wine.price)`, `glassMoney = toMoney(wine.price_per_glass)`.
- `effectiveHasBottle = hasBottle && !!bottleMoney`.
- `effectiveHasGlass = hasGlass && !!glassMoney`.
- **Monto botella:** `bottlePrice = effectiveHasBottle ? bottleMoney! : '—'`.
- **Monto copa:** `glassPrice = effectiveHasGlass ? glassMoney! : '—'`.

Si `wine.available_by_bottle` es `undefined` (falsy), `hasBottle` es false → `effectiveHasBottle` false → se muestra "—" aunque `wine.price` tenga valor. Igual para copa.

---

## 6. Causa raíz (E)

**El bug no viene del backend** (1): public-menu sí devuelve `price_by_bottle` y `price_by_glass`.

**Viene del mapper guest** (2): al mapear `PublicMenuWine` → `Wine` no se asignan `available_by_bottle` ni `available_by_glass`. La UI (3) usa los nombres correctos (`wine.price`, `wine.price_per_glass`) y la condición (4) exige `wine.available_by_bottle` / `wine.available_by_glass` para mostrar el monto. Al ser undefined, siempre se muestra "—".

**Resumen:** el mapper guest no rellena disponibilidad; la card condiciona el importe a esa disponibilidad → precios nunca visibles en guest.

---

## 7. Diff mínimo aplicado

**Archivo:** `src/screens/WineCatalogScreen.tsx`  
**Función:** `mapPublicMenuToWineCatalogItems` — objeto retornado por cada vino.

Añadido tras `price_per_glass`:

```ts
available_by_bottle: priceBottle != null,
available_by_glass: priceGlass != null,
```

Así, cuando el backend envía precios, el Wine en guest tiene disponibilidad true y la condición `hasBottle` / `hasGlass` permite mostrar el importe. Owner/staff no usa este mapper; siguen usando `loadWines` con `available_by_bottle`/`available_by_glass` desde stock.
