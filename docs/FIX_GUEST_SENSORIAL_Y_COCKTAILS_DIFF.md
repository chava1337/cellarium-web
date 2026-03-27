# Fix guest: ficha sensorial N/D y cocktails vacíos — diff aplicado

## 1. Archivos modificados

| Archivo | Cambios |
|---------|--------|
| `supabase/functions/public-menu/index.ts` | A) Select wines: + body_level, sweetness_level, acidity_level, intensity_level, fizziness_level. B) Tipo winesRaw y map wines: incluir y devolver esos 5 campos. |
| `src/services/PublicMenuService.ts` | PublicMenuWine: + body_level?, sweetness_level?, acidity_level?, intensity_level?, fizziness_level? (opcionales). |
| `src/screens/WineCatalogScreen.tsx` | C) mapPublicMenuToWineCatalogItems: clamp 1–5 y asignar body_level, sweetness_level, acidity_level, intensity_level, fizziness_level al Wine. D) Nueva mapPublicMenuCocktailsToCatalogItems(cocktails, branchId). E) loadGuestMenuByToken: setCocktails(mapPublicMenuCocktailsToCatalogItems(menu.cocktails, branch.id)). F) useEffect loadCocktails: solo si !isGuest (guest usa cocktails de public-menu). |

---

## 2. Diff resumido por archivo

### Backend — public-menu/index.ts

- **Select** `wines!inner (...)`: añadidos `body_level`, `sweetness_level`, `acidity_level`, `intensity_level`, `fizziness_level`.
- **winesRaw** (tipo): en `wines` añadidos los 5 campos opcionales.
- **wines** (map): cada objeto wine incluye `body_level`, `sweetness_level`, `acidity_level`, `intensity_level`, `fizziness_level` (con ?? null).

### Frontend — PublicMenuService.ts

- **PublicMenuWine**: 5 propiedades opcionales `number | null` para los niveles sensoriales. PublicMenuCocktail sin cambios (ya consistente).

### Frontend — WineCatalogScreen.tsx

- **Import**: + PublicMenuCocktail.
- **mapPublicMenuToWineCatalogItems**: helper clamp1to5; en cada Wine se asignan body_level, sweetness_level, acidity_level, intensity_level, fizziness_level (clamp 1–5).
- **mapPublicMenuCocktailsToCatalogItems** (nueva): (cocktails, branchId) → CocktailDrink[] con branch_id, owner_id '', timestamps, name/description/ingredients/price/display_order desde PublicMenuCocktail.
- **loadGuestMenuByToken**: tras setWines/setFilteredWines, `setCocktails(mapPublicMenuCocktailsToCatalogItems(menu.cocktails, branch.id))`; log con cocktailsCount.
- **useEffect(loadCocktails)**: condición `showCocktails && activeBranch && !isGuest` para no llamar getCocktailMenu en guest (cocktails vienen de public-menu).

---

## 3. Por qué no se rompe el flujo QR guest

- **Solo se añaden datos:** El payload de public-menu sigue teniendo la misma estructura; solo se agregan campos a wines y se usa un array (cocktails) que ya se enviaba pero no se usaba.
- **Mapper atrás compatible:** Si el backend no enviara aún los niveles (deploy pendiente), los campos opcionales serían undefined y clamp1to5 devuelve undefined → la UI sigue mostrando N/D como antes; no hay crash.
- **Guest no usa getCocktailMenu:** En guest, los cocktails se rellenan únicamente desde loadGuestMenuByToken (menu.cocktails). El useEffect que llama loadCocktails() solo corre cuando !isGuest, así que owner/staff siguen usando getCocktailMenu como antes.
- **Navegación y token:** No se toca QrProcessor, pendingQrPayload, parseQrLink ni navegación root; el flujo QR → public-menu → WineCatalog se mantiene igual.

---

## 4. Edge cases considerados

- **Backend sin deploy:** Si la Edge aún no tiene el select ampliado, wines llegan sin niveles sensoriales → el mapper deja undefined → N/D en UI (comportamiento actual).
- **Cocktails vacíos en respuesta:** Si menu.cocktails es [] o undefined, mapPublicMenuCocktailsToCatalogItems devuelve [] y setCocktails([]) → pestaña Cocktails vacía pero sin error.
- **owner_id vacío en CocktailDrink (guest):** La UI de lista/ficha de cocktails no depende de owner_id para mostrar nombre/precio/ingredientes; si en el futuro se usara para algo (p. ej. enlaces), habría que valorar devolver owner_id desde public-menu (p. ej. en branch).
- **Clamp 1–5:** Valores fuera de rango o no numéricos se convierten en undefined en el mapper, evitando valores inválidos en SensoryBar.

---

## 5. Checklist rápido de prueba

- [ ] Guest: escanear QR → WineCatalog con vinos → abrir ficha de un vino con niveles en BD → comprobar Body/Tannin/Sweetness/Acidity (ya no N/D si el vino tiene datos).
- [ ] Guest: misma sesión → pestaña Cocktails → comprobar que se listan los cocktails del branch (los mismos que devuelve public-menu).
- [ ] Owner/staff: entrar al catálogo por flujo normal → pestaña Cocktails → comprobar que sigue cargando vía getCocktailMenu.
- [ ] Guest con branch sin cocktails: comprobar que la pestaña Cocktails muestra lista vacía sin error.
