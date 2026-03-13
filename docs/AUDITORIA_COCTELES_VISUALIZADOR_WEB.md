# Auditoría: cocteles en el visualizador web para comensales

**Objetivo:** Permitir ver el menú de cocteles de la sucursal en el visualizador web (guest), además del menú de vinos, con cambio mínimo y reuso de la infraestructura actual.

**Nota:** El repo **cellarium-visualizador-web** (Next.js en Vercel) **no está en este workspace**. La auditoría del “visualizador web” se infiere del contrato de la API (`public-menu`), documentación interna y del código de este repo (Edge, servicios, tipos).

---

## 1. Cómo funciona hoy el visualizador de vinos

### a) Entrada y página actual

| Aspecto | Detalle |
|---------|---------|
| **Ruta web pública** | No está en este repo. Según docs: URL tipo `https://cellarium-visualizador-web.vercel.app/qr?data=<encoded>`, donde `data` es `encodeURIComponent(JSON.stringify({ type, token, branchId, branchName }))`. |
| **Componente/página** | En el repo web (Next.js); en este repo no hay implementación. Se asume una página `/qr` que lee `data`, extrae `token` y opcionalmente redirige a app o muestra menú en web. |
| **Resolución del token** | **No** se valida en el cliente contra Supabase directo. La web llama a la Edge **public-menu** con el token; la Edge valida el token. |
| **Cómo se obtiene branch_id** | Tras validar el token en la Edge, `branch_id` viene de `qr_tokens.branch_id`. La respuesta de la Edge incluye el objeto `branch` (id, name, address). |
| **Cómo se cargan los vinos** | Una sola llamada: **GET** (o POST) a la Edge **public-menu** con `?token=<token>`. La Edge con **service_role** hace: 1) SELECT `qr_tokens` por token; 2) comprueba type=guest, expires_at, max_uses/current_uses; 3) SELECT `branches` por branch_id; 4) SELECT `wine_branch_stock` con join a `wines` por branch_id y owner_id; 5) devuelve **JSON `{ branch, wines }`**. El cliente (web o app) usa ese JSON. |

### b) Fuente de datos de vinos

- **No** usa RPC desde el cliente.
- **No** usa `supabase.from(...)` desde el cliente para el menú guest en web (la web no tiene que tocar RLS).
- **Sí** usa **Edge Function**: `GET/POST /functions/v1/public-menu?token=...` (o body `{ token }`).
- **Helper en este repo (app):** `src/services/PublicMenuService.ts` → `getPublicMenuByToken(token)`: hace `fetch` a esa URL con header `apikey: SUPABASE_ANON_KEY`; devuelve `Promise<PublicMenuResponse>` con `{ branch, wines }`.
- **Fetching:** Client-side (fetch desde navegador o app). No hay SSR del menú en este repo; el repo web podría usar getServerSideProps o client fetch según su diseño.

### c) Estructura de UI actual (inferida / contrato)

- La **UI del visualizador** (header, búsqueda, filtros, lista, cards) está en el repo **cellarium-visualizador-web**; este repo no la contiene.
- Por contrato y docs:
  - **Header de sucursal:** se asume que usa `branch.name` y opcionalmente `branch.address` del JSON.
  - **Búsqueda/filtros:** en el front del repo web sobre el array `wines`.
  - **Lista de vinos:** se renderiza a partir de `wines[]`.
  - **Cards:** cada vino tiene en el JSON: id, name, grape_variety, region, country, vintage, type, description, image_url, winery, stock_quantity, price_by_glass, price_by_bottle (según `supabase/functions/public-menu/index.ts` líneas 175-189).

---

## 2. Cómo están modelados hoy los cocteles en el sistema

### Tabla y columnas

- **Tabla:** `public.cocktail_menu`  
  Definición en `supabase/migrations/20260207213838_remote_schema.sql` (aprox. líneas 21-35) y migración `20260301000000_cocktail_image_cleanup_queue.sql` (columna `image_path`).

| Columna | Tipo | Notas |
|---------|------|--------|
| id | uuid | PK, default gen_random_uuid() |
| branch_id | uuid | NOT NULL, FK → branches(id) ON DELETE CASCADE |
| owner_id | uuid | NOT NULL, FK → users(id) ON DELETE CASCADE |
| name | jsonb | NOT NULL (bilingüe: en, es) |
| description | jsonb | Opcional (bilingüe) |
| ingredients | jsonb | NOT NULL (array bilingüe: en[], es[]) |
| image_url | text | URL pública de la imagen |
| image_path | text | Ruta en bucket cocktail-images (limpieza) |
| price | numeric(10,2) | NOT NULL, CHECK >= 0 |
| is_active | boolean | default true |
| display_order | integer | default 0 |
| created_at, updated_at | timestamptz | |
| created_by | uuid | FK → auth.users (opcional) |

### Relación con branch / owner

- Cada fila tiene `branch_id` y `owner_id`. Cocteles son por sucursal y por tenant (owner).
- Índices: `idx_cocktail_menu_branch_id`, `idx_cocktail_menu_owner_id`, `idx_cocktail_menu_active` (WHERE is_active = true), `idx_cocktail_menu_display_order`.

### Categorías / tipos

- No hay tabla de categorías. No hay columna “tipo” o “categoría” explícita en `cocktail_menu`; se podría derivar de nombre/descripción en front o añadir después.

### Disponibilidad / visibilidad pública

- **is_active:** solo ítems con `is_active = true` se consideran “en menú”. En la app, `CocktailService.getCocktailMenu(branchId)` filtra `.eq('is_active', true)`.

### Imagen, precio, descripción, orden

- **Imagen:** `image_url` (y `image_path` para limpieza en storage).
- **Precio:** `price` (único; no hay “por copa”/“por botella” como en vinos).
- **Descripción:** `description` (jsonb bilingüe).
- **Orden:** `display_order` (y created_at como secundario); en la app se ordena por display_order y created_at.

### RPC o query pública para cocteles por branch

- **No** existe en este repo ninguna RPC ni Edge que devuelva cocteles públicos por token o branch.
- En la **app** (usuario autenticado), `CocktailService.getCocktailMenu(branchId)` hace `supabase.from('cocktail_menu').select('*').eq('branch_id', branchId).eq('is_active', true).order(...)`; eso depende de RLS (owner/staff). Para **guest/web** no hay endpoint equivalente; la Edge **public-menu** solo devuelve `branch` y `wines`.

---

## 3. Qué backend reutilizable ya existe para cocteles

- **No** hay RPC pública para cocteles por branch/token.
- **No** hay view ni Edge que devuelva cocteles para guest.
- **Sí** hay reutilizable:
  - **Misma Edge public-menu:** ya valida token guest, obtiene branch_id y owner_id. Se puede **extender** esa Edge para, en la misma respuesta, hacer un SELECT a `cocktail_menu` con `branch_id` y `owner_id`, `is_active = true`, y orden por `display_order`, y añadir un array `cocktails` al JSON. No hace falta nueva ruta ni nueva Edge; es la opción más pequeña y segura.

Conclusión: reutilizar la Edge **public-menu** extendiendo su respuesta con `cocktails[]`.

---

## 4. Qué falta crear

### En este repo (Cellarium)

1. **Edge public-menu:**  
   - Después de construir `wines`, hacer SELECT a `cocktail_menu` con `.eq('branch_id', branchId).eq('owner_id', ownerId).eq('is_active', true).order('display_order').order('created_at')` y seleccionar columnas necesarias (id, name, description, ingredients, image_url, price, display_order).  
   - Incluir en la respuesta JSON un campo `cocktails` (array de objetos con esos campos, normalizando name/description/ingredients a formato plano o bilingüe según acuerdo con el cliente).

2. **Contrato de tipos (app):**  
   - En `src/services/PublicMenuService.ts`, ampliar `PublicMenuResponse` con `cocktails?: PublicMenuCocktail[]` y definir `PublicMenuCocktail` (id, name, description, ingredients, image_url, price, display_order). Opcional: que la app también pueda mostrar cocteles en flujo guest si en el futuro se usa el mismo endpoint.

### En el repo web (cellarium-visualizador-web)

3. **UI:**  
   - Consumir el nuevo campo `cocktails` del mismo fetch que ya hace a `public-menu`.  
   - Añadir forma de alternar o combinar vinos y cocteles (tabs, secciones o chips).  
   - Renderizar cards de coctel con: imagen, nombre, descripción/ingredientes, precio (y disponibilidad si se expone; hoy no hay “stock” de cocteles).

4. **No** hace falta nueva ruta backend ni nueva Edge si se extiende public-menu.

---

## 5. UX recomendada para integrar cocteles en web

**Recomendación: Tabs “Vinos | Cocteles”** en la misma página del menú (misma URL, mismo token, misma respuesta).

- **Motivos:**  
  - Una sola llamada a `public-menu` devuelve branch + wines + cocktails; el cliente ya tiene todo.  
  - Tabs son estándar en móvil y escritorio, fáciles de entender.  
  - No cambia la URL ni el flujo de entrada; solo se añade contenido.  
  - Coherente con “extensión natural” del visualizador actual.

Alternativas descartadas para el mínimo seguro:

- **Ruta separada** (`/qr/wines`, `/qr/cocktails`): más navegación y posible segunda petición; no necesario si la respuesta incluye ambos.
- **Solo secciones en una sola lista:** mezclar vinos y cocteles en un solo scroll puede ser largo y menos claro que tabs.
- **Chips de tipo:** equivalente a tabs en otro formato; tabs son más claros para “Vinos vs Cocteles”.

Comportamiento sugerido:

- Por defecto, tab “Vinos” activa (comportamiento actual).
- Tab “Cocteles” muestra solo la lista de cocteles con cards propias (imagen, nombre, descripción/ingredientes, precio).
- Mobile first: tabs en parte superior, scroll debajo; mismo header de sucursal para ambos.

---

## 6. Contrato de datos para cocteles en web (card mínima)

Campos que **ya existen** en `cocktail_menu` y bastan para la card:

| Campo en API (propuesto) | Origen BD | Notas |
|--------------------------|-----------|--------|
| id | id | uuid |
| name | name (jsonb) | Objeto { en, es }; en web elegir por idioma o devolver string (ej. es ?? en). |
| description | description (jsonb) | Opcional; mismo criterio bilingüe. |
| ingredients | ingredients (jsonb) | Array bilingüe; mostrar como texto o lista. |
| image_url | image_url | URL pública. |
| price | price | Numérico; formatear en front. |
| display_order | display_order | Para ordenar. |

Campos que **no** existen y no son necesarios para el mínimo:

- **Categoría/tipo:** no hay columna; se puede omitir o derivar después.
- **Disponibilidad (stock):** no hay; cocteles no tienen stock en BD; se puede considerar “disponible” si está en la lista.
- **Alcohol / sin alcohol:** no hay columna; opcional a futuro.

Estilo de card: alinear con las cards de vino (imagen, nombre, subtítulo/descripción, precio) para consistencia visual.

---

## 7. Archivos exactos a tocar

### Repo Cellarium (este)

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/public-menu/index.ts` | Tras obtener branch y owner_id y construir `wines`, hacer SELECT a `cocktail_menu` (branch_id, owner_id, is_active=true), mapear a array de objetos públicos (id, name, description, ingredients, image_url, price, display_order). Incluir en el JSON de respuesta `cocktails: [...]`. Mantener contrato actual `branch` y `wines`. |
| `src/services/PublicMenuService.ts` | Añadir tipo `PublicMenuCocktail` y campo opcional `cocktails?: PublicMenuCocktail[]` en `PublicMenuResponse`. No cambiar firma de `getPublicMenuByToken`; el cliente ya recibe el JSON ampliado. |

### Repo cellarium-visualizador-web (externo)

| Archivo (a localizar en ese repo) | Cambio |
|-----------------------------------|--------|
| Página/ruta que muestra el menú (ej. `/qr` o componente que consume public-menu) | Usar en la respuesta `branch`, `wines` y `cocktails`. Añadir estado o tab para “Vinos” / “Cocteles”. Por defecto mostrar vinos; al elegir “Cocteles”, renderizar lista de cards de cocteles. |
| Componente de card (o nuevo) | Card de coctel: imagen, nombre, descripción/ingredientes, precio; estilo alineado con card de vino. |

---

## 8. Cambio mínimo recomendado (resumen)

1. **Backend (solo este repo)**  
   - En **public-menu**: después de construir `wines`, con el mismo `branchId` y `ownerId`, hacer:
     - `supabase.from('cocktail_menu').select('id, name, description, ingredients, image_url, price, display_order').eq('branch_id', branchId).eq('owner_id', ownerId).eq('is_active', true).order('display_order', { ascending: true }).order('created_at', { ascending: false })`.
     - Normalizar filas a un array (p. ej. name/description/ingredients como están en jsonb o como string por idioma si se elige en la Edge).
     - Respuesta: `{ branch, wines, cocktails }` (cocktails array; si no hay cocteles, `[]`).

2. **PublicMenuService (este repo)**  
   - Añadir interfaz `PublicMenuCocktail` y `cocktails?: PublicMenuCocktail[]` en `PublicMenuResponse`. Sin cambios en la llamada fetch.

3. **Visualizador web (otro repo)**  
   - Misma URL y mismo fetch a public-menu.  
   - Añadir tabs “Vinos | Cocteles”.  
   - Tab Vinos: lógica actual sobre `wines`.  
   - Tab Cocteles: renderizar `cocktails` en cards (imagen, nombre, descripción/ingredientes, precio).  
   - No reescribir la página; solo extender estado y render condicional por tab.

---

## 9. Plan de implementación por fases

| Fase | Qué | Dónde |
|------|-----|--------|
| **F1** | Extender Edge public-menu: SELECT cocktail_menu, añadir `cocktails` al JSON. | Repo Cellarium: `supabase/functions/public-menu/index.ts` |
| **F2** | Tipos en app: PublicMenuCocktail y cocktails en PublicMenuResponse. | Repo Cellarium: `src/services/PublicMenuService.ts` |
| **F3** | Desplegar Edge y probar con `scripts/test-public-menu.mjs` o curl: respuesta debe incluir `cocktails`. | Repo Cellarium |
| **F4** | En repo web: leer `cocktails` del mismo fetch; añadir tabs Vinos/Cocteles; lista y cards de cocteles. | Repo cellarium-visualizador-web |
| **F5** | Pruebas E2E: QR guest → web → ver vinos y cocteles por tab; sin token o token inválido sin cambios. | Manual / QA |

---

## 10. Riesgos / dependencias

| Riesgo | Mitigación |
|--------|------------|
| Romper clientes que esperan solo `branch` y `wines` | Añadir solo un campo nuevo `cocktails`; no eliminar ni renombrar campos. Clientes antiguos lo ignoran. |
| RLS cocktail_menu para service_role | La Edge usa service_role; no depende de RLS para lectura. |
| Tamaño de respuesta | Cocteles por sucursal suele ser acotado; si crece, más adelante se puede paginar o limitar. |
| name/description/ingredients en jsonb | Definir en la Edge un criterio de idioma (ej. siempre `es` o header Accept-Language) o devolver el objeto y que el cliente elija. |
| Repo web desactualizado o sin acceso | F4 y F5 dependen de ese repo; este repo puede dejar listo F1–F3 (backend + tipos). |

---

## 11. Repos a tocar

| Repo | Qué tocar |
|------|------------|
| **Repo principal (Cellarium, este)** | Edge `public-menu` (añadir lectura de cocktail_menu y campo `cocktails` en la respuesta); tipos en `PublicMenuService.ts`. |
| **Repo cellarium-visualizador-web** | Página/componente que consume public-menu; añadir soporte para `cocktails` y UI (tabs + cards de cocteles). |

**Resumen:** Backend y contrato en este repo; experiencia de usuario (tabs y cards) en el repo del visualizador web.
