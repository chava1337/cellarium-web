# Fix: 401 Missing authorization header en public-menu

## Causa raíz

- La app llama a la Edge Function `public-menu` con **fetch** directo a `.../functions/v1/public-menu?token=...`.
- Se enviaban solo `apikey` y `Content-Type`. La **pasarela de Supabase** que expone las Edge Functions exige el header **`Authorization: Bearer <anon_key>`** para aceptar la petición; si falta, responde **401 Missing authorization header** antes de que la función se ejecute.
- El comentario en la función ("no Authorization header required") se refiere a la lógica de la función (no exige JWT de usuario), no a la pasarela.

## Archivo y lógica previa

| Archivo | Estado anterior |
|---------|-----------------|
| **src/services/PublicMenuService.ts** | URL: `${SUPABASE_URL}/functions/v1/public-menu?token=...`. Headers: `apikey: SUPABASE_ANON_KEY`, `Content-Type: application/json`. Sin header `Authorization`. |

## Patrón en el proyecto

- **supabase.functions.invoke()** (lib/supabase): el cliente de Supabase añade automáticamente `Authorization` y `apikey` con la anon key (o el token de sesión).
- **src/lib/supabaseDirect.ts**: usa `'Authorization': \`Bearer ${SUPABASE_KEY}\`` y `'apikey': SUPABASE_KEY` en fetch directos.
- **PublicMenuService** hace fetch directo (sin `supabase.functions.invoke`) para pasar el token QR por query; debe enviar los mismos headers que exige la pasarela.

## Diff mínimo aplicado

**src/services/PublicMenuService.ts**

1. Añadido header **`Authorization: Bearer ${SUPABASE_ANON_KEY}`** junto a `apikey` y `Content-Type`.
2. Clave: misma fuente que el resto de la app, `process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY` (sin service_role).
3. Método y URL sin cambios: **GET** con **?token=...**.
4. Logs en __DEV__:
   - Antes del fetch: `urlSummary` (sin token real), `tokenSuffix`, nombres de headers enviados (`apikey`, `Authorization`, `Content-Type`).
   - Después: `status`.
   - Si error: `status`, `bodySummary` (primeros 200 caracteres).
5. Comentario actualizado: la pasarela exige Authorization + apikey (anon).

## Explicación breve

Las Edge Functions de Supabase están detrás de una pasarela que requiere identificación con la anon key vía `Authorization: Bearer <anon_key>` (y en la práctica también `apikey`). PublicMenuService hacía fetch directo y solo enviaba `apikey`; al añadir `Authorization: Bearer ${SUPABASE_ANON_KEY}` la pasarela acepta la petición y la función responde 200 con el menú. El endpoint sigue siendo público por token QR + anon key (no se usa sesión de usuario ni service_role).

## Checklist de prueba

1. **Dev client / preview**
   - Abrir enlace QR guest (o flujo que llame a public-menu).
   - Consola: `[GUEST_MENU] fetch start` con urlSummary y headers; `fetch end` con status 200.
   - Pantalla: menú guest cargado (vinos/sucursal), sin mensaje "código expiró o inválido".

2. **Token inválido**
   - Usar QR con token expirado o erróneo.
   - Respuesta 400 (u otro 4xx) con cuerpo de error; en __DEV__ ver `fetch error` con status y bodySummary.
   - UI: mensaje de error esperado, sin 401.

3. **Regresión**
   - Flujo staff (resolve-qr) y otros usos de `supabase.functions.invoke` siguen funcionando (no modificados).
