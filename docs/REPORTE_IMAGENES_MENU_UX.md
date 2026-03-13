# Reporte: Imágenes y UX del menú (Cellarium App + Visualizador Web)

**Objetivo:** Paquete de información para mostrar imágenes de vinos en el visualizador web, mejorar UX del menú y diagnosticar `[object Object]`. Solo inspección y diagnóstico; sin cambios de UI.

---

## 1) Repo Web (cellarium-visualizador-web)

> **Nota:** El repo `cellarium-visualizador-web` **no está en este workspace**. La siguiente sección se infiere del contrato de la API (`public-menu`), documentación interna (`docs/INFORME_VISUALIZADOR_WEB_MENU_QR.md`, `docs/VERCEL_SETUP.md`) y de lo que debe inspeccionarse cuando tengas abierto ese repo.

### 1.1 Archivos clave a localizar (en el repo Next.js 14)

| Qué | Dónde buscar |
|-----|----------------|
| **Página / ruta del menú** | `/qr` (query `?data=...`) o `/menu/[token]`. App Router: `app/qr/page.tsx`, `app/menu/[token]/page.tsx` o similar. |
| **Fetch a public-menu** | Llamada a `GET ${NEXT_PUBLIC_MENU_API_URL || SUPABASE_URL}/functions/v1/public-menu?token=...` (o variable equivalente). Buscar `public-menu`, `NEXT_PUBLIC_MENU_API_URL`, `fetch(` con `token`. |
| **Componentes de lista/card de vinos** | Componentes que reciban `wines[]` y rendericen nombre, variedad, precio, imagen. |
| **Header / filtros** | Si existe filtro por tipo (red/white) o búsqueda. |

### 1.2 Variables de entorno (referencia)

- **`NEXT_PUBLIC_MENU_API_URL`:** URL base de la Edge Function (ej. `https://<project-ref>.supabase.co/functions/v1`). Se usa para armar `GET .../public-menu?token=...`.
- **`SUPABASE_URL` / `SUPABASE_ANON_KEY`:** Si el front llama directo a Supabase (Rest/PostgREST). Para `public-menu` suele bastar la URL de la función; las keys pueden ser solo para el cliente si se usan en otro flujo. En docs se indica: *"NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (si se llama a la Edge desde cliente)"*.
- **Config Next.js:** Revisar `next.config.js` (o `next.config.mjs`): `images.domains` o `images.remotePatterns` para permitir el dominio de Supabase Storage (ej. `*.supabase.co` o `sejhpjfzznskhmbifrum.supabase.co`).

### 1.3 Cómo se renderiza “Vino de …” y riesgo de `[object Object]`

- **Origen del texto:** En la app (Repo A) existe texto tipo “Vino de …” en `GlobalWineCatalogService.ts` (descripción canónica: `Vino de ${canonical.country}...`). En el **visualizador web** dependerá de cómo se monte el subtítulo en la card (p. ej. `wine.grape_variety`, `wine.winery`, `wine.region`, `wine.country`).
- **Riesgo [object Object]:** Si en el front se hace algo como `{wine.winery}` o `{wine.grape_variety}` y ese campo llega como **objeto** (p. ej. `{ en: "...", es: "..." }`), React mostrará `[object Object]`. En **public-menu** la tabla `wines` expone `winery` y `grape_variety` como **text** en el schema; por tanto desde esa API deberían llegar como string. Si aun así aparece `[object Object]`, puede ser: (1) otro endpoint o fuente de datos que devuelva jsonb, (2) un campo distinto (p. ej. `description` si en algún flujo es objeto), (3) concatenación con un valor que sí sea objeto. **Acción recomendada:** En el repo web, buscar la línea exacta donde se renderiza el subtítulo de la card (ej. “Vino de …” o “Malbec • 2021”) y comprobar qué campo se usa; si es objeto, usar helper tipo `typeof x === 'string' ? x : (x?.es ?? x?.en ?? '')` o `JSON.stringify` solo para debug.

### 1.4 Log de debug (solo desarrollo local)

En el punto donde se recibe la respuesta de `public-menu` (donde se hace `setWines(data.wines)` o similar), añadir temporalmente:

```js
if (process.env.NODE_ENV === 'development' && data?.wines?.length) {
  const w = data.wines[0];
  console.log('[public-menu] wines[0] keys:', Object.keys(w));
  console.log('[public-menu] wines[0] (sample):', {
    ...w,
    description: w.description?.substring?.(0, 80),
  });
}
```

No subir este log a producción.

### 1.5 Sample real del shape de `wines[]` (desde public-menu)

Según **supabase/functions/public-menu/index.ts**, cada elemento de `wines` tiene esta forma:

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
  image_url: string | null;   // ← campo de imagen
  winery: string | null;
  stock_quantity: number;
  price_by_glass: number | null;
  price_by_bottle: number | null;
}
```

**Ejemplo representativo (recortado):**

```json
{
  "id": "uuid-wine-1",
  "name": "Malbec Reserve",
  "grape_variety": "Malbec",
  "region": "Mendoza",
  "country": "Argentina",
  "vintage": "2021",
  "type": "red",
  "description": "Vino de cuerpo medio...",
  "image_url": "https://sejhpjfzznskhmbifrum.supabase.co/storage/v1/object/public/wine-bottles/user-id/wines/photo.jpg",
  "winery": "Bodega Ejemplo",
  "stock_quantity": 12,
  "price_by_glass": 4.5,
  "price_by_bottle": 28
}
```

### 1.6 Estado de imágenes en el visualizador web

- **Campo disponible:** `image_url` (string | null) en cada ítem de `wines[]`. La Edge Function **sí incluye** `image_url` (y lo mapea desde `row.wines.image_url`).
- **Uso en web:** A inspeccionar en el repo Next.js: si se usa `<img src={wine.image_url}>` o `next/image`. Si usan `next/image`, el dominio de Supabase Storage debe estar en `images.remotePatterns` (o `images.domains` en versiones anteriores).
- **Posibles campos de imagen en el contrato:** Por ahora solo `image_url`. La app móvil además usa `front_label_image` (prioritario sobre `image_url` en catálogo); la Edge actual **no** expone `front_label_image` (solo `image_url`). Si en BD hay vinos con `front_label_image` y sin `image_url`, el visualizador no los mostraría hasta que la Edge o el front unifiquen (p. ej. `image_url || front_label_image`).

---

## 2) Repo App (Cellarium – Expo)

### 2.1 Archivos clave

| Rol | Archivo |
|-----|---------|
| **Pantalla catálogo (comensales/admin)** | `src/screens/WineCatalogScreen.tsx` |
| **Card de vino (imagen)** | Mismo archivo: `wine.image_url` en `<Image source={{ uri: wine.image_url }} />` (líneas ~1841–1843). |
| **Servicio que carga vinos + imagen** | `src/services/InventoryService.ts` (getInventoryByBranch: select incluye `image_url`); `WineCatalogScreen` además construye `image_url: stock.wines.front_label_image \|\| stock.wines.image_url` (línea ~717). |
| **Alta/edición de vino e imagen** | `src/screens/WineManagementScreen.tsx` (subida a Storage, `front_label_image` / `image_url`); `src/screens/InventoryManagementScreen.tsx` (bucket `wine-images`, `image_url`); `src/screens/InventoryAnalyticsScreen.tsx` (bucket `wine-bottles`, `image_url`). |

### 2.2 Campos de imagen usados en la app

- **Catálogo (WineCatalogScreen):** `stock.wines.front_label_image || stock.wines.image_url` → se normaliza a `image_url` en el objeto que se pasa a la UI.
- **Inventario / edición:** `wines.image_url`, y en WineManagement también `front_label_image`, `back_label_image`.
- **Tipos:** En `src/types/index.ts` y servicios: `image_url?: string`; en `WineManagementScreen`: `front_label_image`, `back_label_image` como string opcionales.

### 2.3 URL pública vs signed

- **Solo URLs públicas.** No se usa `createSignedUrl` en el flujo de imágenes de vino.
- **Helper:** `getPublicUrl` de Supabase Storage:
  - **GlobalWineCatalogService:** `supabase.storage.from('wine-bottles').getPublicUrl(cleanPath)` (y fallback manual con `.../storage/v1/object/public/wine-bottles/...`).
  - **WineManagementScreen:** `supabase.storage.from('wine-bottles').getPublicUrl(filePath)` tras subir.
  - **InventoryManagementScreen:** `supabase.storage.from('wine-images').getPublicUrl(filePath)`.
  - **InventoryAnalyticsScreen:** `supabase.storage.from('wine-bottles').getPublicUrl(...)`.

### 2.4 Mapa de imágenes (bucket + path + público/signed)

| Bucket | Path pattern | Uso | Acceso |
|--------|--------------|-----|--------|
| **wine-bottles** | `{userId}/wines/{fileName}` (ej. `user-uuid-123/wines/user-uuid-123-1739123456789.jpg`) | WineManagementScreen, InventoryAnalyticsScreen, GlobalWineCatalogService (catálogo global / canonical) | Público (`getPublicUrl`). RLS: lectura pública, escritura autenticada. |
| **wine-images** | `wines/{ownerId}/{wineId}-{timestamp}.{ext}` | InventoryManagementScreen (edición de imagen desde inventario) | Público (`getPublicUrl`). |

- **Signed URLs:** No se usan para estas imágenes; todo es bucket público con URL pública.
- **Dominio típico:** `https://<project-ref>.supabase.co/storage/v1/object/public/<bucket>/<path>`.

---

## 3) Supabase / public-menu

### 3.1 Archivo

- `supabase/functions/public-menu/index.ts`

### 3.2 Flujo y tablas

1. **Entrada:** `token` por query (GET) o body (POST).
2. **Validación:** `qr_tokens` (token, type, branch_id, expires_at, max_uses, current_uses). Solo `type === 'guest'`.
3. **Sucursal:** `branches` (id, name, address, owner_id).
4. **Menú:** `wine_branch_stock` con join a `wines`:
   - Filtros: `branch_id`, `wines.owner_id = branch.owner_id`, `stock_quantity >= 0`.
   - Columnas de `wines`: `id, name, grape_variety, region, country, vintage, type, description, image_url, winery`.

### 3.3 Query actual (wines)

```ts
.from('wine_branch_stock')
.select(`
  wine_id,
  stock_quantity,
  price_by_glass,
  price_by_bottle,
  wines!inner (
    id,
    name,
    grape_variety,
    region,
    country,
    vintage,
    type,
    description,
    image_url,
    winery
  )
`)
.eq('branch_id', branchId)
.eq('wines.owner_id', ownerId)
.gte('stock_quantity', 0);
```

### 3.4 Shape final de `wines[]` (ya devuelto)

Cada elemento tiene: `id`, `name`, `grape_variety`, `region`, `country`, `vintage`, `type`, `description`, `image_url`, `winery`, `stock_quantity`, `price_by_glass`, `price_by_bottle`. **La imagen ya está incluida** vía `image_url`.

### 3.5 Si se quisiera priorizar `front_label_image` (solo diagnóstico)

- En la tabla `wines` (schema remoto) existen `image_url`, `front_label_image`, `back_label_image`. La Edge actual **solo** selecciona `image_url`.
- Para alinear con la app (que usa `front_label_image || image_url`), en la Edge se podría añadir en el select de `wines`: `front_label_image`, y en el mapeo final exponer algo como `image_url: row.wines.front_label_image ?? row.wines.image_url ?? null`. No implementado aquí; solo como sugerencia para que el visualizador tenga la misma prioridad que la app.

---

## 4) Checklist de acciones recomendadas

(Sin implementar; priorizado.)

1. **Mostrar imágenes en el visualizador web**
   - Usar `wine.image_url` en la card (ej. `<img>` o `next/image`).
   - En Next.js: añadir en `next.config.js` el dominio de Storage en `images.remotePatterns` (host: `sejhpjfzznskhmbifrum.supabase.co`, pathname: `/storage/v1/object/public/**`), o equivalente en tu versión de Next.

2. **Corregir [object Object]**
   - En el repo web, localizar la línea que renderiza el subtítulo de la card (“Vino de …”, variedad, bodega).
   - Asegurar que los campos usados sean string: si algún campo puede ser objeto (p. ej. en otro endpoint o en futuro winery bilingüe), usar helper que extraiga string (ej. `es`/`en`) o `String(x)` con fallback.

3. **URLs accesibles desde el navegador**
   - Los buckets usados (`wine-bottles`, `wine-images`) están expuestos por URL pública; no hace falta signed URL para lectura. Comprobar en Supabase Dashboard que las políticas de Storage permitan lectura pública (como en `20260217120000_storage_wine_bottles_policies.sql`).

4. **Opcional: prioridad front_label_image en public-menu**
   - Si en BD muchos vinos tienen `front_label_image` y no `image_url`, añadir en la Edge `front_label_image` al select y en el payload exponer `image_url: row.wines.front_label_image ?? row.wines.image_url ?? null` para que el visualizador reciba la misma imagen que la app.

5. **Debug en desarrollo (web)**
   - Añadir el log de `Object.keys(wines[0])` y `wines[0]` recortado donde se procesa la respuesta de `public-menu`, solo en `NODE_ENV === 'development'`, para confirmar el shape real y que no haya campos objeto inesperados.

---

## Notas

- No se han escrito claves privadas completas; en `src/lib/supabase.ts` la URL del proyecto aparece en docs como `https://sejhpjfzznskhmbifrum.supabase.co` (referencia para dominios de imágenes).
- Repo **cellarium-visualizador-web** no está en este workspace; las rutas y componentes concretos (página `/qr` o `/menu/[token]`, componente de lista, uso de `NEXT_PUBLIC_MENU_API_URL`) deben confirmarse abriendo ese repo y buscando `public-menu`, `wines`, `image_url` y el texto “Vino de” o equivalente.
- En la app, existen dos buckets para imágenes de vino: **wine-bottles** (principal para alta/edición desde WineManagement y catálogo global) y **wine-images** (InventoryManagement). El visualizador solo recibe `image_url` desde `public-menu`; ese valor en BD puede venir de cualquiera de los dos flujos según dónde se haya actualizado el vino.
