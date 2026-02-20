# Diagnóstico: Edge Function `update-subscription` (Stripe add-on branches)

## A) Reporte por secciones

### 1. Call path desde la app

- **Origen:** La acción de “agregar una nueva sucursal” que dispara el error **no** es “crear sucursal” en BranchManagement. El error se dispara al **actualizar add-ons de sucursales** en la pantalla de suscripciones.
- **Archivo:** `src/screens/SubscriptionsScreen.tsx`
- **Flujo:**
  1. Usuario en plan Business abre **Suscripciones**.
  2. En la sección “Sucursales adicionales” cambia el stepper (o input) y pulsa **“Actualizar add-ons”**.
  3. Se ejecuta `handleUpdateAddonBranches` (aprox. líneas 648–700).
  4. Se llama a `invokeAuthedFunction('update-subscription', { addonBranchesQty: qty })` con `qty` entero 0–50.
- **Endpoint invocado:** Supabase Edge Functions (URL base la que devuelve `supabase.functions.invoke`; típicamente `https://<project>.supabase.co/functions/v1/update-subscription`). No se expone en código; se usa el cliente `@supabase/supabase-js`.
- **Método:** POST (OPTIONS para CORS).
- **Headers:**
  - `Authorization: Bearer <session.access_token>` (token de Supabase Auth).
  - `Content-Type: application/json` (lo añade el cliente al pasar `body`).
  - `apikey` (lo inyecta el cliente de Supabase).
- **Body exacto:** `{ addonBranchesQty: number }` (ej. `{ addonBranchesQty: 1 }`).
- **Manejo de errores:**
  - Si `error` existe, se lee `error.context?.response` para `status` y body (text + JSON).
  - En **__DEV__:** `console.error` con status, code, message y trozo del body; Alert “DEBUG update-subscription” con status, code y body (primeros 400 caracteres).
  - En **producción:** Alert con mensaje amigable (`t('subscription.error_generic')`) y en __DEV__ se añade `[DEV] Status: X, Code: Y`.
  - El objeto de error devuelto incluye `message`, `code`, `status` y (solo en __DEV__) `bodyText` / `bodyJson`.

**Código relevante (SubscriptionsScreen.tsx):**

```ts
// Líneas ~86-91
const { data, error } = await supabase.functions.invoke(functionName, {
  body: body || {},
  headers: { Authorization: `Bearer ${session.access_token}` },
});

// Líneas ~672-676
const { data, error } = await invokeAuthedFunction(
  'update-subscription',
  { addonBranchesQty: qty }
);
```

---

### 2. stripe_rest.ts (detalles)

- **Ruta:** `supabase/functions/_shared/stripe_rest.ts`
- **Base URL:** `https://api.stripe.com/v1/${endpoint}` (línea 145). No hay `Stripe-Version`; Stripe usa la versión por defecto de la cuenta.
- **Query params:** Se construyen con `URLSearchParams`: `const qs = new URLSearchParams(query); url += '?' + qs.toString();`. Ej.: `lookup_keys[0]=branch_addon_monthly&active=true&limit=1`, `expand[0]=items.data.price`. Stripe acepta tanto `lookup_keys[0]` como `lookup_keys[]` según documentación; si en tu cuenta no filtra, probar `lookup_keys[]`.
- **Headers:**
  - `Authorization: Bearer ${secretKey}`
  - Para POST/DELETE con body: `Content-Type: application/x-www-form-urlencoded` (línea 164) — correcto para Stripe REST.
- **Body (POST/DELETE):** Objeto plano pasado a `flattenObject` y luego codificado como `key=encodeURIComponent(k)&value=encodeURIComponent(v)` (form-urlencoded). Correcto para Stripe.
- **Manejo de errores:**
  - Si `!response.ok`: lee `response.text()`, intenta `JSON.parse`, devuelve `{ error: { message: err?.error?.message ?? '...', statusCode: response.status, raw: json } }`.
  - En catch de fetch: `{ error: { message: e.message, raw: e } }` (sin `statusCode`).
  - No hay logging interno; no se exponen secretos.
- **Posible mejora:** Incluir `statusCode` en el error cuando falla el parse (p. ej. body HTML de error) para que el llamador siempre tenga status.

---

### 3. Env vars y modos (test/live)

- **Documentación:**
  - `docs/STRIPE_WEBHOOK_SETUP.md`: `STRIPE_SECRET_KEY` (sk_test_... o sk_live_...), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
  - `docs/STRIPE_CHECKOUT_SETUP.md`: mismo; “No se exponen secretos”.
  - `docs/STRIPE_EDGE_FUNCTIONS.md`: ejemplos con `STRIPE_SECRET_KEY=sk_test_...`.
  - `supabase/functions/stripe-webhook/README.md`: `STRIPE_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Cliente (Expo):** `env.example` solo tiene `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...`; la clave secreta no se documenta en el cliente (correcto).
- **Edge Functions:** Todas leen `Deno.env.get('STRIPE_SECRET_KEY')` (y las demás). No hay variable tipo `STRIPE_MODE`; el modo test/live se decide por la clave (sk_test_ vs sk_live_).
- **Riesgo:** Si en Supabase Project Settings > Edge Functions se configuró `STRIPE_SECRET_KEY` con sk_test_ pero el publishable key del cliente es pk_live_ (o al revés), las llamadas desde la app y las que hace la Edge Function no coincidirían de modo (test vs live). Revisar que ambas claves sean del mismo modo.

---

### 4. DB schema + RPC reconcile_branch_locks

**Tabla `public.users` (columnas relevantes):**

- `id` uuid PK  
- `role` text, default 'owner'  
- `owner_id` uuid  
- `subscription_plan` text default 'free' (CHECK: 'free'|'basic'|'additional-branch')  
- `subscription_branch_addons_count` integer not null default 0  
- `stripe_customer_id` text (unique)  
- No hay columna `stripe_subscription_id` en la migración mostrada; el webhook actualiza `users` con campos que pueden estar en una migración posterior.

**Tabla `public.subscriptions`:**

- `id` uuid PK  
- `user_id`, `owner_id` uuid  
- `plan_id` text not null (valor que escribe el webhook: 'free'|'basic'|'additional-branch')  
- `plan_name` text  
- `status` text  
- `current_period_start`, `current_period_end` timestamptz  
- `stripe_subscription_id` text (unique)  
- `stripe_customer_id` text  
- `metadata` jsonb  
- `created_at`, `updated_at`  

**RPC `reconcile_branch_locks(p_owner_id uuid)`:**

- Lee de `subscriptions`: `plan_id` y addon como `COALESCE((metadata->>'addonBranchesQty')::INT, (SELECT subscription_branch_addons_count FROM users WHERE id = p_owner_id), 0)`.
- Filtro: `owner_id = p_owner_id`, `status = 'active'`, `current_period_end > NOW()`, orden `created_at DESC`, limit 1.
- **Lógica de allowed_count:**
  - Si `v_plan_id = 'business'` → `v_allowed_count := 3 + v_addon_qty`
  - Si no → `v_allowed_count := 1`
- El webhook escribe en `subscriptions.plan_id` los valores **'free' | 'basic' | 'additional-branch'** (no 'business'). Por tanto, **hay un bug:** la condición debería ser `v_plan_id = 'additional-branch'` (o incluir ambos 'business' y 'additional-branch') para que los usuarios Business (additional-branch) tengan 3 + addon. Con `= 'business'` nunca se cumple y siempre se usa 1 sucursal.

**Definición completa (resumen):** La función hace lock/unlock de `branches` según `allowed_count`: bloquea las que sobran (por `created_at DESC`) con `is_locked = true`, `lock_reason = 'subscription_limit'` y desbloquea hasta completar el cupo. Retorna `(locked_count, unlocked_count)`.

**RLS:** Ambas tablas tienen RLS habilitado; las Edge Functions usan el cliente con `SUPABASE_SERVICE_ROLE_KEY`, que bypasea RLS. No hay triggers en el schema mostrado que afecten a `subscriptions` o `users` para este flujo.

---

### 5. Flujo de creación de suscripción

- **Checkout:** `create-checkout-session` (body: `{ planLookupKey: 'pro_monthly' | 'business_monthly' }`). Mapeo interno: `business_monthly` → Stripe lookup_key `business_monthly_mxn`. Crea Stripe Checkout Session; al completar, Stripe redirige y el webhook recibe eventos.
- **Plan Business en BD:** Se representa como `subscription_plan = 'additional-branch'` en **users** y `plan_id = 'additional-branch'` en **subscriptions** (el webhook usa `normalizePlanId` / `mapPlanFromLookupKey`: business_* → 'additional-branch').
- **Webhook:** `supabase/functions/stripe-webhook/index.ts`. Eventos relevantes:
  - `customer.subscription.deleted` → users: `subscription_active=false`, `subscription_plan='free'`, limpia ids.
  - `customer.subscription.updated` → Lee subscription de Stripe, determina `finalPlanId` ('free'|'basic'|'additional-branch'), hace upsert en `subscriptions` (incl. `plan_id`, `stripe_subscription_id`, `metadata`) y actualiza **users** (`stripe_subscription_id`, `subscription_active`, `subscription_expires_at`, `subscription_plan`). No se expone `stripe_subscription_id` en users en la migración mostrada; si se añadió después, el webhook lo rellena.
  - `checkout.session.completed` e `invoice.*` también actualizan `subscriptions` y `users`; los invoice no sobrescriben `subscription_plan` a la baja.
- **Dónde se guarda `stripe_subscription_id`:** En **subscriptions** siempre (upsert por `stripe_subscription_id`). En **users** solo si la migración/schema lo incluye; en el código del webhook se usa `userUpdatePayload.stripe_subscription_id = subscriptionId`, por lo que si la columna existe en `users`, se rellena.
- **update-subscription** obtiene `stripe_subscription_id` desde la tabla **subscriptions** (por `owner_id`), no desde users, lo que es coherente con el schema actual.

---

### 6. Reglas de negocio de sucursales

- **Límites en app:** `src/utils/subscriptionPermissions.ts` — `PLAN_LIMITS['additional-branch'].maxBranches = -1` (ilimitado en la comprobación de límite). Para `basic` y `free` es 1.
- **Creación de sucursal:** `SubscriptionEnforcement.isActionAllowedForUser` con `action === 'create_branch'` usa `checkSubscriptionLimit(user, 'branches', currentBranchCount)`. Para additional-branch, al ser -1, siempre permite desde el punto de vista de límite numérico.
- **Locks en BD:** La restricción real es `branches.is_locked`. `reconcile_branch_locks` calcula `allowed_count` (1 para free/pro, **3 + addon** para Business) y marca como locked las sucursales que exceden ese cupo. El problema es que hoy usa `v_plan_id = 'business'` y en `subscriptions` el valor es `'additional-branch'`, por lo que nunca se aplica 3 + addon.
- **Reconciliación:** Se llama desde el webhook de Stripe (tras actualizar suscripción) y desde `update-subscription` tras actualizar `users.subscription_branch_addons_count`. Addon se lee de `subscriptions.metadata.addonBranchesQty` o de `users.subscription_branch_addons_count`.

---

### 7. Top 5 causas probables + evidencia en repo

1. **409 / MISSING_STRIPE_LINK o sin fila en `subscriptions`**  
   - **Evidencia:** `update-subscription` exige `user.stripe_customer_id` y `stripe_subscription_id` (desde `subscriptions` por owner_id). Si el usuario nunca completó checkout o el webhook no creó/actualizó la fila en `subscriptions`, no hay `stripe_subscription_id`.  
   - **Dónde:** `update-subscription/index.ts` líneas ~82–98 (validación y lectura de `subscriptions`).

2. **403 PLAN_NOT_ALLOWED**  
   - **Evidencia:** Se comprueba `userData.subscription_plan !== 'additional-branch'`. Si por cualquier motivo el usuario tiene `basic` o `free` en BD, la función devuelve 403.  
   - **Dónde:** `update-subscription/index.ts` líneas ~78–84.

3. **Price no encontrado en Stripe (lookup_key o modo test/live)**  
   - **Evidencia:** Se usa `lookup_keys[0]=branch_addon_monthly` en GET prices. Si en el Dashboard de Stripe no existe un Price con lookup_key `branch_addon_monthly` (o está inactivo), o la clave secreta es de otro modo (test vs live), la lista devuelve vacía y la función falla.  
   - **Dónde:** `update-subscription/index.ts` líneas ~127–146; `stripe_rest.ts` construye la URL con `URLSearchParams`.  
   - **Nota:** Algunas APIs esperan `lookup_keys[]`; si en tu Stripe no filtra, probar ese formato.

4. **reconcile_branch_locks usa `plan_id = 'business'` pero la BD tiene `'additional-branch'`**  
   - **Evidencia:** En `reconcile_branch_locks` está `IF v_plan_id = 'business' THEN v_allowed_count := 3 + v_addon_qty`. El webhook y el resto del sistema usan `plan_id = 'additional-branch'` para Business. Con eso, los usuarios Business nunca obtienen 3 + addon y la lógica de locks puede no coincidir con la intención.  
   - **Dónde:** Migración `reconcile_branch_locks` (aprox. líneas 2287–2291).

5. **Error de Stripe no propagado con status (502 / STRIPE_ERROR)**  
   - **Evidencia:** Si Stripe devuelve 4xx/5xx, `stripeRequest` devuelve `error.statusCode` y `error.message`. Si en algún path no se pasa `statusCode` al Response (p. ej. en catch de la Edge Function), el cliente podría ver solo “non-2xx” o “FUNCTION_ERROR” hasta que se mejoró el manejo de errores en `invokeAuthedFunction`.  
   - **Dónde:** `stripe_rest.ts` y `update-subscription` (todas las respuestas de error deberían incluir status y code).

---

## B) Checklist “qué probar ahora mismo”

1. **En Supabase Dashboard → Edge Functions → update-subscription → Logs**  
   - Reproducir el flujo (Actualizar add-ons con cantidad 1).  
   - Revisar el log: ¿status 401/403/409/502? ¿Mensaje “Error obteniendo price” o “No se encontró suscripción activa”?  
   - Si aparece “STRIPE_SECRET_KEY no configurada”, añadir la variable en Project Settings → Edge Functions.

2. **Stripe Dashboard (mismo modo que STRIPE_SECRET_KEY)**  
   - Products → Prices: que exista un Price con **Lookup key** = `branch_addon_monthly` y que esté **Active**.  
   - Customers → buscar por el `stripe_customer_id` del usuario (desde `users`).  
   - Subscriptions: que exista una suscripción activa para ese customer y que su ID coincida con el que guardas en `subscriptions.stripe_subscription_id` para ese owner.

3. **Base de datos**  
   - Para el `owner_id` que falla:  
     - `SELECT id, subscription_plan, stripe_customer_id, subscription_branch_addons_count FROM users WHERE id = '<owner_id>';`  
     - `SELECT id, owner_id, plan_id, status, stripe_subscription_id, metadata FROM subscriptions WHERE owner_id = '<owner_id>' ORDER BY created_at DESC LIMIT 1;`  
   - Comprobar: `subscription_plan = 'additional-branch'`, existe fila en `subscriptions` con `status = 'active'` y `stripe_subscription_id` no nulo.

4. **Cliente en __DEV__**  
   - Al fallar “Actualizar add-ons”, revisar el Alert “DEBUG update-subscription” y la consola: anotar **status** y **code** (y body si aparece). Con eso se distingue 401/403/409/502.

5. **RPC reconcile_branch_locks**  
   - Corregir la condición a `v_plan_id IN ('business', 'additional-branch')` (o solo `'additional-branch'`) y volver a desplegar la migración/función.  
   - Después de un update-subscription exitoso, llamar a `reconcile_branch_locks(p_owner_id)` y comprobar que las sucursales se bloquean/desbloquean según 3 + addon.

---

## C) Parches puntuales propuestos

### C1) reconcile_branch_locks: tratar Business como additional-branch

**Archivo:** `supabase/migrations/20260207213838_remote_schema.sql` (líneas 2287–2289).

En la migración (o en un **nuevo** migration file que reemplace la función), reemplazar la condición que calcula `v_allowed_count` para que reconozca el plan Business guardado como `additional-branch`:

```diff
  -- 2) Calcular allowed_count
- IF v_plan_id = 'business' THEN
+ IF v_plan_id IN ('business', 'additional-branch') THEN
    v_allowed_count := 3 + v_addon_qty; -- 1 main + 2 incluidas + addons
  ELSE
```

**Crear nueva migración (recomendado):** no editar la migración ya aplicada; crear p. ej. `supabase/migrations/YYYYMMDDHHMMSS_fix_reconcile_branch_locks_plan_id.sql` con un `CREATE OR REPLACE FUNCTION public.reconcile_branch_locks(...)` completo donde la condición sea `v_plan_id IN ('business', 'additional-branch')`.

Aplicar el mismo criterio en cualquier otra función o vista que use `plan_id = 'business'` para lógica de sucursales.

### C2) stripe_rest.ts: asegurar statusCode en error de respuesta

Para que el llamador siempre tenga HTTP status cuando Stripe devuelve error (incluso si el body no es JSON estándar):

```ts
// En el bloque if (!response.ok), después de parsear json:
return {
  error: {
    message: err?.error?.message ?? `Stripe API error: ${response.status}`,
    statusCode: response.status,
    raw: json,
  },
};
```

(Ya se usa `response.status`; comprobar que en todos los paths de error de la Edge Function se lee `priceResult.error?.statusCode` o equivalente y se devuelve en el JSON al cliente.)

### C3) update-subscription: opción de lookup_keys[] para Stripe

Si en tu Stripe el listado de prices con `lookup_keys[0]` no devuelve el price, probar el formato array que use tu versión de API:

```ts
// Opción A: mantener y añadir fallback
const priceResult = await stripeRequest('GET', 'prices', stripeSecretKey, undefined, {
  'lookup_keys[0]': 'branch_addon_monthly',
  active: 'true',
  limit: '1',
});
// Si priceResult.data?.data es vacío, intentar con key alternativo:
// 'lookup_keys[]': 'branch_addon_monthly'
```

Solo añadir el fallback si con `lookup_keys[0]` no aparece el price en Stripe.

---

**Resumen:** El fallo se dispara desde **SubscriptionsScreen** al pulsar “Actualizar add-ons”, no al crear sucursal. La causa más probable es 409 (falta `stripe_subscription_id` o fila en `subscriptions`) o error de Stripe (price no encontrado / clave de otro modo). Corrigiendo `reconcile_branch_locks` para `additional-branch` se alinea la lógica de locks con el resto del sistema.
