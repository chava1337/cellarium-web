# Edge Runtime compatibility

Las Edge Functions de Supabase se ejecutan en **Supabase Edge Runtime** (Deno 2). No se permite uso de módulos Node (`std/node`, `process`, `Buffer`, etc.). Este documento describe cómo mantener el código compatible.

## verify_jwt persistente (evitar 401 / legacy secret)

Para que el Dashboard no reactive "Verify JWT with legacy secret" tras un deploy:

1. **supabase/config.toml** define por función:
   - `[functions.update-subscription]` → `verify_jwt = false`
   - `[functions.stripe-webhook]` → `verify_jwt = false`
   - `[functions.get-addon-price]` → `verify_jwt = false`

2. Cada función que deba ser invocable sin verificación JWT en el gateway tiene además **deno.json** en su carpeta con `{"verify_jwt": false}` (update-subscription, stripe-webhook, get-addon-price).

3. Tras cambiar config o deno.json, hay que **volver a desplegar** para que se aplique.

## Reglas de imports

- **Prohibido**: `deno.land/std@0.1*`, `deno.land/std/node/*`, `std/node`, `node:*`, `npm:stripe`, Stripe SDK, `process`, `Buffer`, y `serve` desde `deno.land/std/http/server`.
- **Permitido**: `Deno.serve`, `fetch`, `URLSearchParams`, `TextEncoder`/`TextDecoder`, `crypto.subtle`, y `jsr:@supabase/supabase-js@2`.
- Ninguna función debe importar `deno.land/std@0.1*` ni `esm.sh/@supabase/supabase-js` (pueden provocar `Deno.core.runMicrotasks() is not supported`).

El cliente Supabase debe importarse desde JSR (evita runMicrotasks por dependencias transitivas de esm.sh):

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2';
```

## Edge import audit

Para comprobar que no haya imports prohibidos en `supabase/functions`:

```powershell
# Desde la raíz del repo (Windows PowerShell)
.\scripts\audit-edge-imports.ps1
```

- Si encuentra algún patrón prohibido, el script imprime **archivo:línea** y el contenido, y termina con **exit code 1**.
- Úsalo en CI o antes de hacer deploy para evitar que se cuele código incompatible con Edge.

## Minimal mode (stripe-webhook)

Para aislar si un crash (`Deno.core.runMicrotasks() is not supported`) viene del webhook de Stripe o de otra función:

1. En el proyecto Supabase, define la variable de entorno para la función `stripe-webhook`:
   - **Nombre**: `EDGE_MINIMAL_MODE`
   - **Valor**: `true`

2. Con `EDGE_MINIMAL_MODE=true`, la función `stripe-webhook`:
   - No carga `_shared/stripe_rest.ts` ni el cliente Supabase.
   - Responde de inmediato con `200` y cuerpo `{ "ok": true, "mode": "minimal" }`.
   - Escribe en logs: `[MINIMAL] stripe-webhook minimal mode active`.

3. Interpretación:
   - Si **con minimal mode ON** el crash **desaparece**: el problema está en los módulos que carga el webhook (p. ej. `stripe_rest` o el cliente Supabase). Con minimal ON no se ejecutan.
   - Si **con minimal mode ON** el crash **sigue**: el problema viene de otra función o del runtime (no del código cargado por `stripe-webhook`).

4. Para volver al comportamiento normal, quita la variable o pon `EDGE_MINIMAL_MODE=false`.

## BOOT log

En `stripe-webhook` se escribe al inicio de cada invocación:

```
[BOOT] { fn: "stripe-webhook", version: "...", ts: "..." }
```

Si en los logs aparece `[BOOT]` y luego un `UncaughtException`, el fallo ocurre después de arrancar el handler (p. ej. en lógica de negocio o en imports dinámicos). Si el crash ocurre antes de `[BOOT]`, el fallo es en la carga del módulo o en el runtime.

## Deploy para aplicar verify_jwt y config

Desde la raíz del repo, con Supabase CLI vinculado al proyecto:

```bash
supabase functions deploy update-subscription
supabase functions deploy stripe-webhook
supabase functions deploy get-addon-price
```

O desplegar todas:

```bash
supabase functions deploy
```

La configuración de `supabase/config.toml` y los `deno.json` de cada función se aplican en el deploy; no hace falta tocar el toggle "Verify JWT with legacy secret" en el Dashboard.

## Checklist de prueba (update-subscription + precio add-on)

1. **Logs sin runMicrotasks:** En Supabase → Edge Functions → Logs, invocar `update-subscription` y comprobar que no aparece `Deno.core.runMicrotasks() is not supported`.
2. **Sin 401:** Llamar desde la app (sesión válida) a "Actualizar add-ons" y ver en Invocations que la respuesta es 200 (no 401).
3. **Stripe add-on:** Con qty=1, en Stripe Dashboard la suscripción debe tener el ítem con price lookup_key `branch_addon_monthly`.
4. **UI $499:** En pantalla Suscripciones, el precio mostrado de "Sucursal adicional" debe ser $499 (o el valor que devuelva `get-addon-price` desde Stripe).
