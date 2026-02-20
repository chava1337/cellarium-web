# Auditoría: implementación multi-sucursal en Cellarium

**Fecha:** 2026-01-22  
**Alcance:** Plan Business (3 base), Free/Pro (1), add-ons, selector de sucursal, compra de add-ons. Sin tocar Auth/hydrate core.

---

## 1) Fuentes de verdad del límite de sucursales (backend + frontend)

### Backend (BD)

| Origen | Archivo / función | Lógica |
|--------|-------------------|--------|
| **RPC** | `public.get_branch_limit_for_owner(p_owner uuid)` | Definida en `20250122130000_fix_branch_limit_plan_ids.sql`. Usa `get_plan_id_effective(p_owner)` y `users.subscription_branch_addons_count`. **Included:** `plan IN ('additional-branch','business')` → 3 + addons; si no → 1. **Addons:** `COALESCE(subscription_branch_addons_count, 0)` desde `users` donde `id = p_owner`. |
| **Trigger** | `enforce_branch_limit()` (BEFORE INSERT on `branches`) | `20260207213838_remote_schema.sql` ~L.1414. Obtiene `max_branches := get_branch_limit_for_owner(owner)`, cuenta `branches` por `owner_id`, si `current_count >= max_branches` lanza excepción. |
| **Reconcile** | `public.reconcile_branch_locks(p_owner_id)` | En `20250122130100_reconcile_branch_locks_business_base.sql`. Lee plan y addon de `subscriptions` (activa, `current_period_end > NOW()`): `plan_id`, `metadata->>'addonBranchesQty'` o fallback `users.subscription_branch_addons_count`. **Allowed:** `plan_id IN ('additional-branch','business')` → 3 + addons; si no → 1. Bloquea/desbloquea `branches` (is_locked) según ese límite. |

**Valores en BD:**

- `users.subscription_plan`: `'free' | 'basic' | 'additional-branch'` (CHECK en tabla).
- `users.subscription_branches_count`: integer, default 1 (no se usa en `get_branch_limit_for_owner`; la función usa solo plan + addons).
- `users.subscription_branch_addons_count`: integer not null default 0. **Sí se usa** en backend (get_branch_limit_for_owner, reconcile_branch_locks como fallback).
- `subscriptions.plan_id`: mismo dominio; `subscriptions.metadata->>'addonBranchesQty'` para addons en reconcile.

### Frontend

| Origen | Archivo | Lógica |
|--------|---------|--------|
| **Límite numérico** | `src/utils/branchLimit.ts` | **getBranchLimit(user):** `included = user.subscription_branches_count ?? (isBusiness ? 3 : 1)`, `addons = user.subscription_branch_addons_count ?? 0`, `limit = included + addons`. **canCreateBranch(user, currentCount):** `currentCount < limit`. |
| **Feature gating** | `src/utils/subscriptionPermissions.ts` | **PLAN_LIMITS:** `free` maxBranches 1; `basic` 1; `additional-branch` **-1** (ilimitado en UI). **checkSubscriptionLimit(user, 'branches', currentCount)** usa esos máximos; -1 ⇒ siempre permitido. |
| **Enforcement UI** | `src/services/SubscriptionEnforcement.ts` | Usa `checkSubscriptionLimit(user, 'branches', context.currentBranchCount)` para acción `create_branch`; mensaje `subscription.branch_limit_reached`. |
| **Pantalla ramas** | `src/screens/BranchManagementScreen.tsx` | Usa **getBranchLimit** y **canCreateBranch** (branchLimit.ts) antes de crear sucursal; no usa PLAN_LIMITS. |

**Constantes / mappings:**

- Plan id en app/BD: `'free' | 'basic' | 'additional-branch'`.
- Lookup keys Stripe: `pro_monthly`, `business_monthly_mxn`, `branch_addon_monthly` (add-on).
- Business = 3 sucursales base; Free/Pro = 1. Addons suman al límite en backend y en `branchLimit.ts`.

**Inconsistencia potencial:**

- **subscription_branches_count:** En BD tiene default 1. En `get_branch_limit_for_owner` **no se usa**; el “included” se deriva solo del plan (3 vs 1). En frontend `branchLimit.ts` **sí** usa `user.subscription_branches_count` como override: si viene en el usuario, ese es el “included”. Si la BD nunca actualiza `subscription_branches_count` a 3 para Business, el frontend podría seguir mostrando límite 1 hasta que algo lo ponga en 3 (p. ej. simulate en SubscriptionsScreen sí lo setea para pruebas).

---

## 2) Flujo de BranchContext / Selector de sucursal

### Archivo principal: `src/contexts/BranchContext.tsx`

- **Estado:** `currentBranch`, `availableBranches`, `isInitialized`.
- **Carga:** `loadBranchesFromDB(ownerUser)` (useCallback, sin deps de props).
- **Query exacta:**

```ts
const { data: branches, error } = await supabase
  .from('branches')
  .select('*')
  .eq('owner_id', ownerId)
  .order('created_at', { ascending: true });
```

- **ownerId:** `ownerUser.owner_id || ownerUser.id`.
- **Filtrado post-query:** Si `ownerUser.role === 'owner'` → usa todas las filas; si no (staff) → filtra `branch.id === ownerUser.branch_id`. Luego `setAvailableBranches(filteredBranches)`.
- **currentBranch:** Si hay al menos una: owner → primera; staff → la asignada o la primera. Si no hay ninguna, no se setea (queda null).
- **Cuándo se limpia:** En `useEffect` cuando `!user`: `setAvailableBranches([])`, `setCurrentBranch(null)`, `setIsInitialized(true)`.
- **Cuándo se carga:** `useEffect([user, profileReady, loadBranchesFromDB])`: si `user && profileReady` → `loadBranchesFromDB(user)`; si no user → limpia como arriba.

**Gate:** Depende de `user` y `profileReady` (AuthContext). No hay filtro por `status`, `deleted_at` ni `is_active` en la query; la tabla `branches` no tiene columna `status`/`deleted_at` en el schema revisado.

### Selector en UI

- **Archivo:** `src/screens/AdminDashboardScreen.tsx`.
- **Condición modal:** `isOwner && (...)` con `isOwner = profileReady && (user?.role === 'owner')`. El botón del selector siempre se muestra; al pulsar, si no es owner se muestra un Alert en lugar del modal.
- **Lista del modal:** `data={availableBranches}` (FlatList). Si `availableBranches.length === 0`, el modal se abre pero la lista está vacía.
- **Conclusión “por qué no aparece”:** (1) **No aparece el modal:** usuario no es owner o `profileReady` false. (2) **Modal vacío:** `availableBranches` está vacío: RLS no devuelve filas, o la query se ejecutó con `owner_id` que no coincide con ningún branch, o `loadBranchesFromDB` falló y en el catch se hace `setAvailableBranches([])`. (3) Si hay **solo 1** branch: el selector sigue visible (muestra ese branch); no se oculta.

---

## 3) Modelo de datos: tablas y relaciones

### `public.branches` (20260207213838_remote_schema.sql ~L.5)

```sql
create table "public"."branches" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "address" text,
    "owner_id" uuid not null,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "is_main" boolean default false,
    "is_locked" boolean not null default false,
    "lock_reason" text,
    "locked_at" timestamp with time zone
);
```

- **Índice:** `idx_branches_owner_id ON branches(owner_id)`.
- **Trigger:** `trg_enforce_branch_limit` BEFORE INSERT, ejecuta `enforce_branch_limit()`.

### Relación con usuarios

- **Owner:** `branches.owner_id` = id del usuario owner (normalmente `users.id`).
- **Staff:** `users.branch_id` apunta a `branches.id`; `users.owner_id` al owner. No hay tabla pivot; la relación es directa en `users`.
- **Creación de branch:** En `user-created` (owner, sin branchId) se inserta una branch "Sucursal Principal" y se actualiza `users.branch_id`. En `BranchManagementScreen` y `AuthContext` (ensureUserRow) no se crea branch; la creación explícita es en BranchManagementScreen vía `supabase.from('branches').insert(...)`.

### `public.subscriptions`

- Columnas relevantes: `owner_id`, `user_id`, `plan_id`, `plan_name`, `stripe_subscription_id`, `current_period_start`, `current_period_end`, `metadata` (jsonb). Reconcile usa `metadata->>'addonBranchesQty'` y `plan_id`.

---

## 4) RLS / Políticas (branches y dependientes)

### Branches (20260207213838_remote_schema.sql ~L.3533)

```sql
-- INSERT
create policy "Users can insert own branches"
on "public"."branches" for insert to public
with check ((auth.uid() = owner_id));

-- UPDATE
create policy "Users can update own branches"
on "public"."branches" for update to public
using ((auth.uid() = owner_id));

-- SELECT
create policy "Users can view own branches"
on "public"."branches" for select to public
using (
  (auth.uid() = owner_id)
  OR
  (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid() AND users.branch_id = branches.id
  ))
);
```

- Insert/Update: solo si `auth.uid() = owner_id`.
- Select: owner de la branch **o** usuario con `users.branch_id = branches.id` (staff asignado a esa sucursal).
- No se usa `auth.jwt()` claims; solo `auth.uid()`.
- Dependencia: para staff, `users.owner_id` no interviene en estas políticas; solo `users.branch_id`.

### Otras tablas que dependen de branch

- **cocktail_menu:** políticas por `owner_id` y `branch_id` (y usuarios con mismo owner_id/branch_id).
- **inventory_movements, wine_branch_stock, etc.:** en el schema aparecen condiciones que usan `branches.owner_id` y/o `users.owner_id` para permitir acceso. No se listan todas aquí; el patrón es “owner de la branch o usuario vinculado a esa branch/owner”.

### Función SECURITY DEFINER

- `reconcile_branch_locks(p_owner_id uuid)`: SECURITY DEFINER; lee/actualiza `branches` y `subscriptions`; no depende de RLS del caller.

---

## 5) Stripe / Suscripciones / Add-ons: flujo end-to-end

### Contrato add-ons (SubscriptionsScreen → update-subscription)

- **Pantalla:** `src/screens/SubscriptionsScreen.tsx` ~L.718–778.
- **Handler:** `handleUpdateAddonBranches`. Valida: user, plan Business (`isBusinessPlan()`), `addonBranchesQty` 0–50 (parseado desde estado local `addonBranchesQty`).
- **Llamada:** `invokeAuthedFunction('update-subscription', { addonBranchesQty: qty })`. `invokeAuthedFunction` hace `refreshSession()` + `getSession()`, luego `supabase.functions.invoke(functionName, { body, headers: { authorization: 'Bearer ' + session.access_token } })`.
- **Payload:** `{ addonBranchesQty: number }` (0–50).

### Edge: update-subscription (`supabase/functions/update-subscription/index.ts`)

- **Auth:** Header `Authorization` obligatorio; obtiene usuario con anon key + ese header; lee `public.users` por `authUser.id` (service role).
- **Restricciones:** Solo `role === 'owner'` y `id === ownerId`; plan debe ser `'additional-branch'`.
- **Body:** `addonBranchesQty` número entre 0 y 50; se redondea y acota con `Math.min(Math.max(Math.floor(addonBranchesQty), 0), 50)`.
- **Stripe:** GET price con `lookup_keys[0]=branch_addon_monthly`; GET subscription por `stripe_subscription_id` (desde tabla `subscriptions` por `owner_id`); construye `items` (añade/actualiza/elimina el ítem add-on según `safeQty`); POST `subscriptions/{id}` para actualizar.
- **BD:** `supabaseAdmin.from('users').update({ subscription_branch_addons_count: updatedQuantity }).eq('id', ownerId)`. Luego actualiza `subscriptions.metadata` con `addonBranchesQty: updatedQuantity` (para reconcile). Llama a `reconcile_branch_locks(p_owner_id: owner_id)`.
- **Logs:** `console.log('[update-subscription]', { stripe_subscription_id, addonPriceId, safeQty, hasBranchAddonItem })`.

### create-checkout-session

- No gestiona add-ons; solo planes (planLookupKey: pro_monthly, business_monthly). Metadata de sesión incluye owner_id, user_id, planLookupKey. Add-ons se compran después vía update-subscription.

### stripe-webhook (`supabase/functions/stripe-webhook/index.ts`)

- **users:** En el path compartido (checkout.session.completed, invoice.*) el `userUpdatePayload` incluye: `stripe_subscription_id`, `subscription_active`, `subscription_expires_at`, `subscription_plan`. **No** incluye `subscription_branches_count` ni `subscription_branch_addons_count`.
- **subscriptions:** Upsert por `stripe_subscription_id`; row con `plan_id`, `plan_name`, `metadata` (incl. lastEventType, etc.). El webhook no escribe `metadata.addonBranchesQty`; eso lo hace solo **update-subscription** tras cambiar add-ons.
- **Conclusión:** Tras checkout o eventos de invoice/subscription, el límite “3 base” para Business **no** se escribe en `users.subscription_branches_count` por el webhook. El addon count en users solo se actualiza al llamar explícitamente a update-subscription.

---

## 6) Bugs visibles (repro + logs)

### A) Business activo pero no aparece selector / lista vacía

**Pasos sugeridos:**

1. Usuario owner con plan Business en BD (`subscription_plan = 'additional-branch'`, suscripción activa).
2. Tener al menos 2 filas en `branches` con `owner_id = <user.id>` (o 1 si el problema es “no se ve ninguna”).
3. Abrir app, esperar `profileReady === true`, ir a Admin / Dashboard.
4. Pulsar el campo “Sucursal” (branch selector).

**Comportamiento esperado:** Modal con lista de sucursales.

**Posibles causas:**

- **RLS:** El SELECT a `branches` con `owner_id = user.id` podría no devolver filas si, por ejemplo, el token no tiene `auth.uid()` igual a ese owner (sesión incorrecta o usuario distinto).
- **Carga:** Si `loadBranchesFromDB` falla (error de red o 403), en el catch se hace `setAvailableBranches([])` y `setCurrentBranch(null)` → modal vacío.
- **profileReady / role:** Si `profileReady` es false o `user.role !== 'owner'`, el modal solo se muestra para owners; si el backend devolvió role distinto, no se abre el selector “real”.

**Logs a revisar:**

- En el cliente: ningún log explícito en BranchContext; añadir en __DEV__ algo como `console.log('loadBranchesFromDB', { ownerId, count: branches?.length, error: error?.message })`.
- Supabase: logs de RLS no suelen imprimirse por defecto; revisar que `auth.uid()` en la request coincida con el owner.

**Query útil:**

```sql
SELECT id, name, owner_id, is_main, is_locked
FROM public.branches
WHERE owner_id = '<user.uuid>';
```

Comprobar que existen filas y que ese `owner_id` es el mismo que el usuario con el que se hace login.

### B) Error al comprar add-ons

**Pasos:**

1. Owner con plan Business y suscripción Stripe activa (tabla `subscriptions` con `stripe_subscription_id`, `owner_id` correcto).
2. En SubscriptionsScreen, en la tarjeta Business, poner cantidad de add-ons (ej. 1) y pulsar el botón de actualizar/confirmar.
3. Confirmar en el Alert.

**Posibles errores:**

- **409 MISSING_STRIPE_LINK:** `users.stripe_customer_id` o fila en `subscriptions` con `stripe_subscription_id` faltante.
- **403 PLAN_NOT_ALLOWED:** `users.subscription_plan !== 'additional-branch'`.
- **502 / STRIPE_ERROR:** Fallo al obtener price (lookup_key `branch_addon_monthly`) o al actualizar la suscripción en Stripe.
- **500 INTERNAL:** Fallo al hacer update en `users` (subscription_branch_addons_count).

**Logs:**

- Cliente: `log.error('update-subscription failed', error.status, error.code)` (SubscriptionsScreen).
- Edge: `[update-subscription] auth`, `[update-subscription]` con `stripe_subscription_id`, `addonPriceId`, `safeQty`, `hasBranchAddonItem`; y en errores `console.error('[update-subscription] Error ...')`.

**Queries:**

```sql
SELECT id, subscription_plan, stripe_customer_id
FROM public.users
WHERE id = '<owner_id>';

SELECT id, owner_id, stripe_subscription_id, plan_id, status, current_period_end
FROM public.subscriptions
WHERE owner_id = '<owner_id>'
ORDER BY created_at DESC
LIMIT 1;
```

---

## 7) Checklist de consistencia y hallazgos

| Componente | Comportamiento esperado | Comportamiento actual | Sospecha | Evidencia |
|------------|-------------------------|------------------------|----------|-----------|
| **get_branch_limit_for_owner** | Business = 3 + addons, Free/Pro = 1 | Correcto en migración fix | - | 20250122130000, 20250122130100 |
| **branchLimit.ts** | included = 3 para Business si no hay subscription_branches_count | Usa subscription_branches_count si existe; si no, 3/1 por plan | Si BD nunca setea subscription_branches_count=3 para Business, frontend puede ver 1 | branchLimit.ts L.30–33 |
| **subscriptionPermissions** | additional-branch = ilimitado para branches | maxBranches = -1 | Coherente con “siempre permitido”; el límite real lo aplica BD y branchLimit | subscriptionPermissions.ts L.29–31 |
| **BranchContext load** | Carga branches por owner_id | Query .eq('owner_id', ownerId), sin status | RLS puede filtrar; si auth.uid() ≠ owner_id y no es staff de esa branch, 0 filas | BranchContext.tsx L.37–41 |
| **Selector modal** | Solo owners ven lista de sucursales | Modal solo si isOwner (profileReady && role === 'owner') | Si role no es 'owner' en frontend (hydrate), no se abre selector | AdminDashboardScreen L.78, 347 |
| **stripe-webhook → users** | Tras checkout Business, tener 3 base en algún lado | No escribe subscription_branches_count ni subscription_branch_addons_count | Límite “3” solo por plan en get_branch_limit; users.subscription_branches_count puede quedar 1 | stripe-webhook L.724–775 |
| **update-subscription** | Escribir addon en users y metadata | Update users.subscription_branch_addons_count; update subscriptions.metadata.addonBranchesQty | Correcto | update-subscription L.240–268 |
| **reconcile_branch_locks** | Plan additional-branch/business → 3 + addons | Lee subscriptions; plan_id IN ('additional-branch','business') → 3 + addons | Correcto en 20250122130100 | reconcile_branch_locks_business_base.sql |
| **RLS branches SELECT** | Owner ve sus branches; staff ve la suya | auth.uid() = owner_id OR (users.id = auth.uid() AND users.branch_id = branches.id) | Correcto; problema sería auth.uid() o datos users | remote_schema L.3549–3556 |
| **Add-on purchase error** | 200 y refresh de perfil | Puede 409/403/502/500 según BD/Stripe | 409 si falta stripe link; 502 si Stripe price/subscription falla | update-subscription L.104–109, 134–155 |

---

## Archivos clave (rutas y funciones)

| Archivo | Funciones / partes involucradas |
|---------|---------------------------------|
| `src/utils/branchLimit.ts` | getBranchLimit, canCreateBranch |
| `src/utils/subscriptionPermissions.ts` | PLAN_LIMITS, checkSubscriptionLimit |
| `src/contexts/BranchContext.tsx` | loadBranchesFromDB, useEffect carga, refreshBranches |
| `src/screens/AdminDashboardScreen.tsx` | handleBranchPress, handleBranchSelect, modal (availableBranches), isOwner |
| `src/screens/SubscriptionsScreen.tsx` | handleUpdateAddonBranches, invokeAuthedFunction('update-subscription', { addonBranchesQty }) |
| `src/screens/BranchManagementScreen.tsx` | getBranchLimit, canCreateBranch, creación de branch |
| `src/services/SubscriptionEnforcement.ts` | isActionAllowedForUser, create_branch, checkSubscriptionLimit |
| `src/contexts/AuthContext.tsx` | USERS_SELECT_COLUMNS (incl. subscription_branches_count, subscription_branch_addons_count) |
| `supabase/migrations/20250122130000_fix_branch_limit_plan_ids.sql` | get_branch_limit_for_owner |
| `supabase/migrations/20250122130100_reconcile_branch_locks_business_base.sql` | reconcile_branch_locks |
| `supabase/migrations/20260207213838_remote_schema.sql` | branches table, RLS branches, enforce_branch_limit, get_plan_id_effective |
| `supabase/functions/update-subscription/index.ts` | Validación plan/owner, addonBranchesQty, Stripe items, update users + metadata, reconcile_branch_locks |
| `supabase/functions/stripe-webhook/index.ts` | userUpdatePayload (sin subscription_branches_count ni subscription_branch_addons_count) |

---

## Hipótesis principal y alternativas

**Hipótesis principal (selector no aparece / lista vacía):**  
**Gating o carga:** `availableBranches` queda vacío porque (1) la query a `branches` con RLS devuelve 0 filas (por ejemplo `auth.uid()` no coincide con el owner o con el staff asignado a esa branch), o (2) `loadBranchesFromDB` falla (red o 4xx) y en el catch se hace `setAvailableBranches([])`. El modal solo se muestra a owners; si por timing o hydrate el `user.role` no es 'owner', el usuario no ve el selector “útil”.

**Alternativa 1:**  
**subscription_branches_count en frontend:** El límite mostrado en BranchManagement (y cualquier UI que use `getBranchLimit`) depende de `user.subscription_branches_count`. Si el webhook nunca setea 3 para Business, ese valor puede seguir en 1 y la UI mostrar “1 de 1” en lugar de “1 de 3” o “2 de 3”, aunque el backend (get_branch_limit_for_owner y el trigger) sí permita 3 por plan.

**Alternativa 2:**  
**Error al comprar add-ons:** Falta de `stripe_customer_id` o de fila activa en `subscriptions` con `stripe_subscription_id` (checkout no completado o webhook no creó/actualizó la fila), dando 409 MISSING_STRIPE_LINK. O el price `branch_addon_monthly` no existe/activo en Stripe, dando 502.

---

## Recomendación de fix mínimo (sin implementar aún)

1. **Selector / carga de branches:**  
   - Añadir en BranchContext (solo __DEV__) log tras la query: ownerId, número de filas, error si hay.  
   - Comprobar en BD que existan branches con `owner_id = <uid del usuario que hace login>` y que ese uid sea el que devuelve `auth.uid()` en las requests.  
   - No tocar Auth/hydrate; solo observabilidad y datos.

2. **Límite “3 base” en frontend:**  
   - Opción A: En stripe-webhook (o en un flujo que actualice users tras checkout/plan change), setear `subscription_branches_count` según plan (Business → 3, Free/Pro → 1) al actualizar `subscription_plan`.  
   - Opción B: En `branchLimit.ts`, ignorar `subscription_branches_count` para “included” y derivar solo de plan (como hace get_branch_limit_for_owner): Business → 3, resto → 1. Así la UI no depende de que la BD tenga ese campo actualizado.

3. **Add-ons:**  
   - Mantener update-subscription como única fuente que escribe `subscription_branch_addons_count` y metadata; asegurar que tras éxito se llame `refreshUser` para que el cliente tenga el nuevo valor.  
   - Si hay 409: verificar en BD `users.stripe_customer_id` y fila en `subscriptions` con `stripe_subscription_id` para ese owner; si faltan, guiar al usuario a completar checkout o a re-vincular desde el portal.

Con esto se mantiene el patrón optimistic + hydrate y no se toca el núcleo de Auth; solo fuentes de verdad (BD/webhook o frontend) y diagnóstico de RLS/carga.
