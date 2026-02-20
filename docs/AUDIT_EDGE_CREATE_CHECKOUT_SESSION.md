# Auditoría: Edge Function create-checkout-session

**Objetivo:** Entender por qué devuelve non-2xx al crear checkout para plan Pro.

---

## 1) Código del handler con marcas

### [JWT / Authorization]
- **Líneas 154–189:** Valida que exista header `Authorization` / `authorization`, que empiece por `"Bearer "` (case-insensitive) y que el JWT no esté vacío después del prefijo. Si falla → **401**.
- **Líneas 211–215:** Crea cliente Supabase con ese JWT en `headers: { Authorization: \`Bearer ${jwt}\` }`.
- **Líneas 221–238:** `supabaseClient.auth.getUser(jwt)` para obtener usuario autenticado. Si `userError` o `!authUser` → **401**.

### [Carga usuario desde public.users]
- **Líneas 244–259:**  
  `supabaseAdmin.from('users').select('id, role, owner_id, stripe_customer_id, email, subscription_active, subscription_id, subscription_plan').eq('id', authUser.id).single()`  
  Si `userDataError` o `!userData` → **404**.

### [Guard: subscription_active y stripe_customer_id]
- **Líneas 261–265:** Log del guard:
```ts
console.log('create-checkout-session guard', {
  userId: authUser.id,
  subscription_active: userData.subscription_active,
  stripe_customer_id: userData.stripe_customer_id ?? null,
});
```
- **Líneas 266–277:** Si `userData.subscription_active === true` → **409** (ALREADY_SUBSCRIBED, mensaje para usar customer portal).

### [Todos los returns]

| Líneas   | Status | Body / condición |
|----------|--------|-------------------|
| 137–139  | (CORS) | `'ok'` body, OPTIONS |
| 145–149  | **405** | `{ error: 'Method not allowed' }` — método !== POST |
| 164–172  | **401** | `{ error: 'No authorization header', message: ... }` — header no empieza con "Bearer " |
| 180–188  | **401** | `{ error: 'Invalid authorization token', message: 'El token JWT está vacío' }` — JWT vacío |
| 202–207  | **500** | `{ error: 'Configuración de Supabase incompleta' }` — faltan SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY |
| 229–237  | **401** | `{ error: 'Usuario no autenticado', message: userError?.message \|\| 'Auth session missing!' }` — getUser(jwt) falla o sin user |
| 253–257  | **404** | `{ error: 'Usuario no encontrado en base de datos' }` — fila en public.users no existe |
| 268–276  | **409** | `{ code: 'ALREADY_SUBSCRIBED', message: '...' }` — subscription_active === true |
| 284–290  | **403** | `{ error: 'Solo el owner puede crear sesiones de checkout' }` — role !== 'owner' o id !== ownerId |
| 304–312  | **400** | `{ error: 'planLookupKey inválido', code: 'INVALID_PLAN', allowed }` — planLookupKey vacío o no en whitelist |
| 321–325  | **500** | `{ error: 'STRIPE_SECRET_KEY no configurada' }` |
| 334–342  | **400** | `{ error: 'planLookupKey inválido', code: 'INVALID_PLAN', allowed }` — lookup_key no en PLAN_LOOKUP_KEY_MAP |
| 357–365  | **502** | `{ error: 'Error al buscar price en Stripe', message, code: 'STRIPE_ERROR' }` — stripeRequest GET prices falla |
| 372–382  | **404** | `{ error: \`Price con lookup_key "${stripeLookupKey}" no encontrado...\`, code: 'PRICE_NOT_FOUND', ... }` — prices.length === 0 |
| 406–414  | **502** | `{ error: 'Error al crear customer en Stripe', ... }` — creación de customer falla |
| 419–425  | **502** | `{ error: 'Error al crear customer: ID no recibido' }` — customer creado pero sin id |
| 378–386  | **502** | `{ error: 'Error al crear checkout session', ... }` — stripeRequest POST checkout/sessions falla |
| 393–401  | **200** | `{ url: session.url, sessionId: session.id }` — éxito |
| 416–424  | **500** | `{ error: 'Error interno', message, code: 'INTERNAL_ERROR' }` — catch genérico (ej. req.json() falla) |

---

## 2) Lista de status codes y condición

| Status | Condición |
|--------|-----------|
| **200** | Checkout Session creada correctamente; respuesta con `url` y `sessionId`. |
| **400** | `planLookupKey` ausente, no está en `ALLOWED_PLAN_LOOKUP_KEYS`, o no está en `PLAN_LOOKUP_KEY_MAP`. |
| **401** | Sin header Authorization, formato distinto de "Bearer <jwt>", JWT vacío, o `getUser(jwt)` falla / no devuelve user. |
| **403** | Usuario no es owner: `role !== 'owner'` o `id !== ownerId`. |
| **404** | No hay fila en `public.users` para `authUser.id`, o no hay price activo en Stripe con el `lookup_key` usado. |
| **409** | `subscription_active === true`; debe usarse Billing Portal. |
| **500** | Faltan env de Supabase, falta `STRIPE_SECRET_KEY`, o excepción no controlada (p. ej. `req.json()`). |
| **502** | Error de Stripe: búsqueda de price, creación de customer o creación de checkout session. |
| **405** | Método distinto de POST (y no OPTIONS). |

---

## 3) Comportamiento clave

**A) Bloqueo si ya tiene suscripción activa**  
- **Sí.** Si `userData.subscription_active === true` devuelve **409** con código `ALREADY_SUBSCRIBED` y mensaje para usar el customer portal. No crea checkout.

**B) Creación de Stripe Customer si no existe**  
- **Sí.** Si `userData.stripe_customer_id` es null/undefined (líneas 391–348), llama a `stripeRequest('POST', 'customers', ...)`, obtiene `stripeCustomerId` y opcionalmente actualiza `public.users.stripe_customer_id`. Si la creación falla → **502**.

**C) Búsqueda de price por lookup_key y posible fallo**  
- **Sí.** Para "pro" el front suele enviar `planLookupKey: 'pro_monthly'`.  
- Se mapea a Stripe `lookup_key` = `'pro_monthly'` (igual en el mapa).  
- Se llama a Stripe: `GET prices?lookup_keys[]=pro_monthly&active=true&limit=1`.  
- Si Stripe devuelve error → **502**.  
- Si Stripe devuelve OK pero `data.data.length === 0` (no hay price activo con ese `lookup_key`) → **404** con `PRICE_NOT_FOUND`.  
- **Causa muy probable de non-2xx para plan Pro:** en el Dashboard de Stripe no existe un Price con **lookup_key** = `pro_monthly` o no está activo.

---

## 4) Mapeo planId → priceId y env vars

### Mapeo planId / planLookupKey → Stripe lookup_key

```ts
const PLAN_LOOKUP_KEY_MAP = {
  pro_monthly: 'pro_monthly',
  business_monthly: 'business_monthly_mxn',
} as const;
```

- El front envía `planLookupKey` (ej. `'pro_monthly'`).  
- La función usa `PLAN_LOOKUP_KEY_MAP[planLookupKey]` como **Stripe lookup_key**.  
- Luego hace **GET** `https://api.stripe.com/v1/prices?lookup_keys[]=<stripeLookupKey>&active=true&limit=1`.  
- El **priceId** es `prices[0].id`; no hay mapeo directo planId → priceId, solo planLookupKey → lookup_key → price por API.

### Env vars usadas (solo nombres)

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`

---

## 5) Resumen

**Causa más probable de non-2xx para plan Pro**

1. **404 PRICE_NOT_FOUND:** En Stripe no hay un Price activo con **lookup_key** = `pro_monthly`. Es lo más habitual si el plan “Pro” existe pero el Price no tiene ese lookup_key configurado o está inactivo.  
2. **409 ALREADY_SUBSCRIBED:** El usuario ya tiene `subscription_active === true`; la función obliga a usar Billing Portal.  
3. **403:** El usuario no es `role === 'owner'` o no cumple la condición de owner (id vs ownerId).  
4. **401:** Token no enviado, mal formado o inválido/caducado.

**Fix mínimo recomendado (sin tocar Auth/hydrate del app)**

- **Si el fallo es 404 PRICE_NOT_FOUND:**  
  - En Stripe Dashboard → Products → el producto del plan Pro → el Price que quieras usar para “Pro mensual”.  
  - Editar ese Price y en **Lookup key** (o “Metadata” según versión) poner exactamente: `pro_monthly`.  
  - O crear un Price nuevo para ese producto, activo, con lookup_key `pro_monthly`.  
  - No hace falta cambiar código si ya envías `planLookupKey: 'pro_monthly'`.

- **Si el fallo es 409:**  
  - En el front, al recibir 409 con `code: 'ALREADY_SUBSCRIBED'`, redirigir a Stripe Billing Portal (crear sesión de portal y abrir `url`) en lugar de mostrar error genérico.

- **Si el fallo es 403:**  
  - Asegurar que solo owners llamen a esta función (ocultar/deshabilitar “Plan Pro” para no-owners) o revisar que `public.users` tenga `role = 'owner'` y que la lógica de `ownerId` sea la esperada.

- Revisar logs de la Edge Function en Supabase (Dashboard → Edge Functions → create-checkout-session → Logs) para ver el status y el body exactos (409, 404, 502, etc.) y confirmar cuál de los casos anteriores aplica.
