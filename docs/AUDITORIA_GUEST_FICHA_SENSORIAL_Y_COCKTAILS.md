# Auditoría: Ficha sensorial N/D y cocktails vacíos en flujo guest

Solo diagnóstico. Sin cambios de código.

---

## 1. Archivos auditados

| Archivo | Rol |
|---------|-----|
| `src/screens/QrProcessorScreen.tsx` | Entrada QR → validación public-menu → navegación a WineCatalog con guestToken |
| `src/screens/WineCatalogScreen.tsx` | UI guest: loadGuestMenuByToken, mapPublicMenuToWineCatalogItems, SensoryBar (N/D), loadCocktails, estado cocktails |
| `src/services/PublicMenuService.ts` | getPublicMenuByToken, tipos PublicMenuWine / PublicMenuCocktail / PublicMenuResponse |
| `supabase/functions/public-menu/index.ts` | Edge Function: consultas wines y cocktails, shape del payload |
| `src/services/CocktailService.ts` | getCocktailMenu (supabase client, RLS), tipo CocktailDrink |
| `src/types/index.ts` | Tipo Wine (body_level, sweetness_level, acidity_level, intensity_level) |
| `supabase/migrations/20260207213838_remote_schema.sql` | Columnas sensoriales en tabla `wines` |

---

## 2. Flujo real QR → public-menu → WineCatalog guest

1. Comensal abre enlace QR → App listener / pendingQrPayload → **QrProcessorScreen**.
2. QrProcessor valida token con **getPublicMenuByToken(token)** → GET `.../functions/v1/public-menu?token=...`.
3. **Edge Function public-menu**: valida token en `qr_tokens`, obtiene `branch_id` y `owner_id`, consulta:
   - **Wines:** `wine_branch_stock` (branch_id, owner_id, stock_quantity >= 0) + join `wines` con columnas: id, name, grape_variety, region, country, vintage, type, description, image_url, winery. **No incluye** body_level, sweetness_level, acidity_level, intensity_level.
   - **Cocktails:** `cocktail_menu` (branch_id, owner_id, is_active: true), columnas: id, name, description, ingredients, image_url, price, display_order.
4. Responde `{ branch, wines, cocktails }` (200).
5. **WineCatalogScreen** en modo guest: **loadGuestMenuByToken** recibe ese objeto, llama **mapPublicMenuToWineCatalogItems(menu)** que devuelve solo **{ branch, wines }**; asigna `setGuestBranchFromMenu(branch)`, `setWines(wines)`, y rellena refs para stock. **No lee ni asigna menu.cocktails**.
6. Cocteles: al pulsar pestaña "Cocktails" se ejecuta **loadCocktails()** → **getCocktailMenu(activeBranch.id)** (Supabase client sobre `cocktail_menu`). Con usuario anon (guest), RLS puede denegar SELECT → lista vacía o error; además, para guest nunca se ha rellenado estado desde public-menu.

---

## 3. Shape real del payload guest (public-menu)

**Backend devuelve:**

```ts
{
  branch: { id, name, address },
  wines: Array<{
    id, name, grape_variety, region, country, vintage, type, description,
    image_url, winery, stock_quantity, price_by_glass, price_by_bottle
  }>,
  cocktails: Array<{
    id, name, description, ingredients, image_url, price, display_order
  }>
}
```

- **Wines:** sin campos sensoriales (body_level, sweetness_level, acidity_level, intensity_level no están en el select de la Edge).
- **Cocktails:** presente en el JSON; filtros: mismo branch_id/owner_id que wines, is_active = true.

---

## 4. Contrato de datos (backend vs frontend)

| Campo / aspecto | Backend (public-menu) | Frontend esperado (WineCatalog guest) | ¿Coincide? | Notas |
|------------------|------------------------|----------------------------------------|------------|--------|
| wines[].id, name, ... | ✓ | ✓ | Sí | mapPublicMenuToWineCatalogItems mapea bien |
| wines[].body_level | No enviado | Wine.body_level (1–5) | No | No en select; no en PublicMenuWine |
| wines[].sweetness_level | No enviado | Wine.sweetness_level | No | Idem |
| wines[].acidity_level | No enviado | Wine.acidity_level | No | Idem |
| wines[].intensity_level | No enviado | Wine.intensity_level (tannin) | No | Idem |
| cocktails | Enviado en payload | Estado `cocktails` / filteredCocktails | No | No se asigna: mapper solo devuelve branch + wines; loadGuestMenuByToken no hace setCocktails(menu.cocktails) |
| branch | ✓ | guestBranchFromMenu / activeBranch | Sí | Correcto |

**Conclusión contrato:**

- Ficha sensorial N/D: el backend **no** envía niveles sensoriales; el mapper **no** puede rellenarlos; la UI recibe `Wine` sin body_level/sweetness_level/acidity_level/intensity_level → se muestran como N/D.
- Cocktails vacíos: el backend **sí** envía cocktails; el frontend **no** los usa (no se asignan desde menu.cocktails); además, la ruta alternativa loadCocktails → getCocktailMenu puede estar bloqueada por RLS para anon.

---

## 5. Dónde la UI muestra "N/D" (ficha sensorial)

- **Componente:** función **SensoryBar** definida dentro de **WineCatalogScreen.tsx** (aprox. líneas 1382–1495).
- **Condición:** se muestra el texto **"N/D"** cuando **isMissing === true** (prop del SensoryBar).
- **Código exacto (aprox. 1448–1457):**

```tsx
{isMissing && (
  <Text style={[...]}>N/D</Text>
)}
```

- **Origen de isMissing:** en los usos de SensoryBar se pasa por ejemplo `isMissing={bodyLevel === undefined}`, `isMissing={sweetnessLevel === undefined || sweetnessLevel === null}`, etc. Esos niveles vienen de `wine.body_level`, `wine.sweetness_level`, `wine.acidity_level`, `wine.intensity_level` (aprox. 1506–1509, 1544–1595).
- Para flujo guest, cada `wine` viene de **mapPublicMenuToWineCatalogItems**: el objeto Wine que se construye **no incluye** body_level, sweetness_level, acidity_level ni intensity_level (PublicMenuWine no los tiene y el mapper no los asigna), por tanto quedan `undefined` → isMissing true → "N/D".

---

## 6. Causa raíz más probable

### Ficha sensorial en N/D

- **Causa:** La Edge Function **public-menu** no selecciona en la tabla `wines` los campos **body_level, sweetness_level, acidity_level, intensity_level** (ni ningún otro campo sensorial). El tipo **PublicMenuWine** y el mapper **mapPublicMenuToWineCatalogItems** tampoco los contemplan. En guest, los vinos llegan sin niveles sensoriales y la UI los trata como faltantes y muestra "N/D".

### Cocktails vacíos

- **Causa 1 (principal):** En **loadGuestMenuByToken** solo se usa **mapPublicMenuToWineCatalogItems(menu)** y se hace **setWines** / **setGuestBranchFromMenu**. No se lee **menu.cocktails** ni se hace **setCocktails(menu.cocktails)** (ni un equivalente mapeado). El estado de cocktails en guest queda en [].
- **Causa 2 (secundaria):** Si el comensal abre la pestaña Cocktails, se llama **loadCocktails()** → **getCocktailMenu(activeBranch.id)** con el cliente Supabase (anon). Si RLS en `cocktail_menu` no permite SELECT para anon, esa llamada puede devolver vacío o fallar; en cualquier caso, no se están usando los cocktails ya devueltos por public-menu.

---

## 7. Propuesta de diff mínimo (solo descripción, sin aplicar)

### Backend (public-menu)

- En la consulta de **wines** (join con `wines`), añadir al select de la tabla `wines` los campos: **body_level, sweetness_level, acidity_level, intensity_level** (y si se usan en la app: **fizziness_level**).
- Incluir esos campos en el objeto que se arma para cada elemento de `wines` en la respuesta (igual que el resto de campos actuales).
- No es necesario cambiar la consulta de cocktails ni el shape de branch.

### Frontend

**Ficha sensorial:**

- En **PublicMenuService.ts**: ampliar **PublicMenuWine** con opcionales: `body_level?`, `sweetness_level?`, `acidity_level?`, `intensity_level?` (y `fizziness_level?` si aplica).
- En **WineCatalogScreen.tsx**, en **mapPublicMenuToWineCatalogItems**: al mapear cada `PublicMenuWine` a **Wine**, asignar esos campos numéricos (con validación 1–5 si se desea) para que la UI no reciba `undefined` cuando el backend ya los envíe.

**Cocktails guest:**

- En **loadGuestMenuByToken** (WineCatalogScreen.tsx): después de **mapPublicMenuToWineCatalogItems(menu)** y de asignar branch y wines, si `menu.cocktails` existe, mapear cada ítem al shape que espera la UI (p. ej. **CocktailDrink** o un tipo mínimo id, name, description, ingredients, image_url, price, display_order) y llamar **setCocktails(mapped)**.
- Definir una función de mapeo **PublicMenuCocktail → CocktailDrink** (o al tipo que use la lista de cocktails) rellenando branch_id/owner_id desde `menu.branch` y valores por defecto si hace falta (created_at, updated_at, is_active).
- Opcional: en modo guest no llamar **loadCocktails** (getCocktailMenu) cuando ya se hayan cargado cocktails desde public-menu, para no depender de RLS en cocktail_menu para anon.

---

## 8. Resumen

| Bug | Causa raíz | Dónde |
|-----|------------|--------|
| Ficha sensorial N/D | Backend no envía body_level, sweetness_level, acidity_level, intensity_level; mapper no los asigna | public-menu select wines; mapPublicMenuToWineCatalogItems; SensoryBar isMissing |
| Cocktails vacíos | Payload incluye cocktails pero loadGuestMenuByToken no hace setCocktails(menu.cocktails); guest depende de getCocktailMenu que puede bloquear RLS | loadGuestMenuByToken; opcionalmente getCocktailMenu para anon |

Con los diffs mínimos anteriores (backend: incluir campos sensoriales en wines; frontend: tipos + mapper sensorial + usar y mapear menu.cocktails en guest) se corrigen ambos comportamientos sin refactors grandes.
