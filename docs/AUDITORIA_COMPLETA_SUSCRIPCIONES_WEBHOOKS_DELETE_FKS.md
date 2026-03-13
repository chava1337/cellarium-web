# Auditoría completa: Suscripciones, Webhooks, Eliminación de cuenta e Integridad referencial

**Fecha:** 2026-01-22  
**Alcance:** Suscripciones (Stripe/Supabase/UI), Webhooks (stripe-webhook), Eliminación de cuenta (Edge + RPC), FKs y política de borrado con suscripción activa.

---

## A) MAPA DE ARCHIVOS

| Archivo | Rol |
|--------|-----|
| **src/screens/SubscriptionsScreen.tsx** | UI de suscripciones: checkout (create-checkout-session), portal (create-portal-session), estado (effectivePlan, subscription_expires_at, cancel_at_period_end), enforce_subscription_expiry + refreshUser, add-ons (update-subscription). |
| **src/services/SubscriptionService.ts** | Servicio legacy: createSubscription (free en BD; pagado vía PaymentService). **No importado por ninguna pantalla**; el flujo actual usa Edges create-checkout-session + stripe-webhook. |
| **src/contexts/AuthContext.tsx** | Hydrate de `public.users` con columnas de suscripción (`subscription_plan`, `subscription_active`, `subscription_expires_at`, `subscription_cancel_at_period_end`, etc.). `refreshUser` y selección con `USERS_BOOTSTRAP_SELECT` / `USERS_SELECT_COLUMNS`. |
| **src/utils/effectivePlan.ts** | `getEffectivePlan(user)`: free si no user, o `subscription_active !== true`, o `subscription_expires_at` en el pasado; si no, `user.subscription_plan`. No usa `cancel_at_period_end`. |
| **src/utils/subscriptionPermissions.ts** | Límites por plan (PLAN_LIMITS), `checkSubscriptionFeature`, `checkSubscriptionLimit`, `isSubscriptionActive`; usa `getEffectivePlan` y `subscription_expires_at`. |
| **src/utils/branchLimit.ts** | `getBranchLimit(user)`, `canCreateBranch(user, currentCount)`; alineado con RPC `get_branch_limit_for_owner`. |
| **src/utils/permissions.ts** | Permisos por rol y plan (si se usa en gating). |
| **src/constants/subscriptionFeatures.ts** | FeatureIds y mapeo a planes. |
| **supabase/functions/stripe-webhook/index.ts** | Recibe eventos Stripe; actualiza `public.users` y `public.subscriptions`. Eventos: checkout.session.completed, invoice.*, customer.subscription.updated/created/deleted. Fuente de verdad de plan en subscription.updated (lookup_key); invoice.* solo hace upgrade, no degrada. |
| **supabase/functions/create-portal-session/index.ts** | Crea sesión del Customer Portal de Stripe (Bearer obligatorio); solo owner con stripe_customer_id. |
| **supabase/functions/create-checkout-session/index.ts** | Crea Checkout Session (subscription); metadata owner_id/user_id/plan_name para el webhook; crea Stripe Customer si no existe. |
| **supabase/functions/update-subscription/index.ts** | (Si existe) Actualización de add-ons o plan desde app. |
| **supabase/functions/delete-user-account/index.ts** | Auth Bearer; obtiene user con anon + JWT; llama RPC `delete_user_account(p_user_id)`; luego `auth.admin.deleteUser(user.id)`. No toca Stripe. |
| **supabase/migrations/20250122140000_delete_user_account_exception_debug.sql** | Define RPC `public.delete_user_account(p_user_id uuid)` SECURITY DEFINER, SET search_path TO 'public'. Borra en orden: tasting_*, staff users, wines, branches, qr_tokens (por owner_id), rate_limits, sales (si existe), luego public.users. |
| **supabase/migrations/20260207213838_remote_schema.sql** | Schema remoto: tablas, FKs a auth.users y public.users, RPCs get_branch_limit_for_owner, get_plan_id_effective, is_subscription_effectively_active. No define `enforce_subscription_expiry` en este archivo. |
| **supabase/migrations/20260224100000_users_subscription_cancel_at_period_end.sql** | Añade `users.subscription_cancel_at_period_end` (boolean, default false). |
| **supabase/migrations/20260222120000_users_subscription_active_default_false.sql** | `subscription_active` default false; corrige usuarios free con active=true. |
| **supabase/functions/_shared/stripe_rest.ts** | Helpers para Stripe (verifyStripeWebhookSignature, stripeRequest) usados por stripe-webhook. |

**RPC `enforce_subscription_expiry`:** Llamada desde SubscriptionsScreen; **no aparece definida en migraciones del repo** (posible creación en dashboard o migración externa). Se asume que pone `subscription_active = false` (y quizá `subscription_plan = 'free'`) cuando `subscription_expires_at <= now()`.

---

## B) FLUJOS (diagramas textuales)

### Signup → Checkout → Webhook → users/subscriptions → UI

```
[App: Owner] → create-checkout-session (Bearer) → Stripe Checkout
       ↓
[Stripe] → pago → redirect success_url
       ↓
[Stripe] → webhook checkout.session.completed ( + customer.subscription.created/updated )
       ↓
stripe-webhook: resuelve owner_id/user_id (metadata o users.stripe_customer_id)
       ↓
UPSERT public.subscriptions (stripe_subscription_id, owner_id, user_id, plan_id, current_period_end, cancel_at_period_end, ...)
       ↓
UPDATE public.users SET stripe_subscription_id, subscription_active, subscription_expires_at, subscription_plan, subscription_cancel_at_period_end
       ↓
reconcile_branch_locks(p_owner_id)
       ↓
[App] AuthContext.refreshUser() / SubscriptionsScreen → UI (effectivePlan, expires_at, cancel_at_period_end)
```

### Cancelación (Portal) → customer.subscription.updated → DB → UI

```
[App] → create-portal-session (Bearer) → Stripe Portal URL
       ↓
[Usuario] cancela en Portal → Stripe marca cancel_at_period_end o cancela al instante
       ↓
[Stripe] → customer.subscription.updated (o .deleted al final del periodo)
       ↓
stripe-webhook: GET subscription (expand items.data.price) → period_end, cancel_at_period_end
       ↓
UPDATE users SET subscription_active, subscription_expires_at, subscription_plan, subscription_cancel_at_period_end
UPSERT subscriptions (cancel_at_period_end, current_period_end)
       ↓
[App] refreshUser → UI muestra "Se desactiva el {date}" si cancel_at_period_end
```

### Degradación por expiry (enforce_subscription_expiry) → DB → UI

```
SubscriptionsScreen (mount / focus) → supabase.rpc('enforce_subscription_expiry')
       ↓
(RPC no en repo; se asume) UPDATE users SET subscription_active = false, subscription_plan = 'free' WHERE subscription_expires_at <= now()
       ↓
refreshUser() → user.subscription_active false, subscription_expires_at pasado
       ↓
effectivePlan(user) → 'free' → UI muestra plan Gratis y estado coherente
```

### Delete account → (Stripe no tocado) → RPC → auth.admin.deleteUser

```
[App: Settings] Eliminar cuenta → getSession() → invoke('delete-user-account', { headers: { authorization: Bearer } })
       ↓
delete-user-account Edge: getUser(JWT) → supabaseAdmin.rpc('delete_user_account', { p_user_id: user.id })
       ↓
RPC: borra tasting_*, staff users, wines, branches, qr_tokens (owner_id), rate_limits, sales, luego DELETE public.users WHERE id = p_user_id
       ↓
Edge: supabaseAdmin.auth.admin.deleteUser(user.id) → borra auth.users(id)
       ↓
CASCADE en FKs a auth.users (subscriptions, cocktail_menu, invoices, payments, tasting_exams, tasting_responses, tasting_exam_pdfs) borra filas referenciadas
       ↓
[App] signOut + navigation.reset → Welcome
```

**Importante:** La Edge **no** cancela la suscripción en Stripe. El customer y la subscription en Stripe siguen existiendo.

---

## C) AUDITORÍA DE CONSISTENCIA

### 1) users actualizado pero subscriptions no (o viceversa)

- **customer.subscription.updated/created (early exit):** Actualiza **users** y hace **upsert** en **subscriptions** en paralelo; ambos con mismo owner_id/user_id, plan y cancel_at_period_end. Consistente.
- **Ruta genérica (checkout/invoice.*):** Hace upsert en **subscriptions** y luego UPDATE **users** con `userUpdatePayload`. En eventos **invoice.*** el payload no incluye `subscription_cancel_at_period_end` (solo en subscription.updated). Si el usuario canceló en Portal y solo llega un invoice.payment_succeeded, la UI podría no mostrar "Se desactiva el {date}" hasta que llegue un customer.subscription.updated.
- **customer.subscription.deleted:** Solo actualiza **users** (subscription_active false, stripe_subscription_id null, etc.); **no** borra ni actualiza filas en **subscriptions**. Las filas en `public.subscriptions` quedan con status que Stripe ya no tiene; es aceptable si la UI lee de users. Si en algún momento se lista historial desde `subscriptions`, conviene marcar como canceled/expired.

### 2) invoice.* pisando flags importantes

- El webhook **no degrada** plan desde invoice: solo aplica upgrade (planRank(newPlan) > planRank(dbPlan)) cuando `isInvoiceEvent` y subscription activa. No pisa `subscription_cancel_at_period_end` (ese flag solo lo setea customer.subscription.updated). Consistente con “subscription.updated es fuente de verdad del plan”.

### 3) UI deriva estado de forma incompleta

- **effectivePlan** no usa `subscription_cancel_at_period_end`; solo `subscription_active` y `subscription_expires_at`. Para mostrar "Se desactiva el {date}" la UI (SubscriptionsScreen) sí usa `user.subscription_cancel_at_period_end` y subscription_expires_at (CurrentStatusCard, expirationRowLabel). AuthContext ya incluye `subscription_cancel_at_period_end` en USERS_BOOTSTRAP_SELECT.
- **Riesgo:** Si el webhook no persiste `subscription_cancel_at_period_end` en algún path (p. ej. solo en early exit de subscription.updated), la UI no mostraría cancelación hasta refrescar tras otro evento.

### 4) Loaders que pueden quedarse pegados

- **SubscriptionsScreen:** `isProcessing` se usa en botones (portal, update add-ons). Si `invoke` o `rpc` no retornan (red/timeout), el loader puede quedar activo hasta que el usuario salga o se dispare otro refresh. Recomendación: timeout en llamadas a Edge/RPC y poner `setIsProcessing(false)` en finally.
- **SettingsScreen (Eliminar cuenta):** Mismo riesgo en `invoke('delete-user-account')`; ya hay try/catch y setIsDeleting(false) en todos los caminos.

---

## D) AUDITORÍA DE FKs

### SQL de solo lectura: FKs que referencian public.users(id)

```sql
-- Listar todas las FK que referencian public.users(id)
SELECT
  c.conname AS constraint_name,
  t_from.nspname AS schema_from,
  t_from.relname AS table_from,
  a_from.attname AS column_from,
  t_to.nspname AS schema_to,
  t_to.relname AS table_to,
  a_to.attname AS column_to,
  CASE c.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS on_delete_rule
FROM pg_constraint c
JOIN pg_class t_from ON t_from.oid = c.conrelid
JOIN pg_namespace n_from ON n_from.oid = t_from.relnamespace
JOIN pg_attribute a_from ON a_from.attrelid = c.conrelid AND a_from.attnum = ANY(c.conkey) AND a_from.attisdropped = false
JOIN pg_class t_to ON t_to.oid = c.confrelid
JOIN pg_namespace n_to ON n_to.oid = t_to.relnamespace
JOIN pg_attribute a_to ON a_to.attrelid = c.confrelid AND a_to.attnum = ANY(c.confkey) AND a_to.attisdropped = false
WHERE c.contype = 'f'
  AND n_to.nspname = 'public'
  AND t_to.relname = 'users'
ORDER BY schema_from, table_from, column_from;
```

**Resultado esperado (según schema en migraciones):**

| tabla_origen   | columna    | tabla_destino | on_delete_rule |
|----------------|------------|---------------|----------------|
| inventory_movements | user_id  | users         | SET NULL       |
| qr_tokens      | created_by | users         | (default RESTRICT) |
| qr_tokens      | owner_id   | users         | (default RESTRICT) |
| qr_tokens      | used_by    | users         | (default RESTRICT) |
| sales          | user_id    | users         | SET NULL       |
| users          | approved_by| users         | (default RESTRICT) |

**FKs que referencian auth.users(id)** (se disparan al borrar con auth.admin.deleteUser): cocktail_menu (created_by, owner_id), invoices (owner_id, user_id), payments (owner_id, user_id), subscriptions (owner_id, user_id), tasting_exam_pdfs (generated_by), tasting_exams (created_by, owner_id), tasting_responses (user_id). Varios CASCADE, algunos RESTRICT.

### Sugerencias CASCADE / SET NULL

- **public.users:**  
  - **qr_tokens (created_by, used_by):** Para staff, el RPC no borra qr_tokens por created_by/used_by; solo borra por owner_id. Si un staff tiene filas en qr_tokens con created_by o used_by = su id, el DELETE de public.users falla con 23503. **Recomendación:** En el RPC, antes de borrar el usuario, ejecutar `DELETE FROM qr_tokens WHERE created_by = p_user_id OR used_by = p_user_id` (o cambiar FK a ON DELETE SET NULL si el negocio lo permite).
  - **users.approved_by:** Si se borra un usuario que aprobó a otros, RESTRICT bloquearía. Valorar SET NULL en approved_by para el usuario borrado.

- **auth.users:** Las tablas que referencian auth.users con CASCADE ya se limpian al llamar auth.admin.deleteUser. No hace falta cambiar FKs para el flujo actual.

### Orden correcto de borrado (evitar 23503)

El RPC actual (owner):

1. tasting_responses (staff), tasting_wine_responses, tasting_exam_wines, tasting_exam_pdfs, tasting_exams  
2. users (staff con owner_id = p_user_id)  
3. wine_branch_stock, inventory_movements, wines, branches  
4. qr_tokens (owner_id), rate_limits, sales (por branch)  
5. public.users (id = p_user_id)

Para **staff** solo borra: tasting_responses, tasting_wine_responses, luego public.users. **Falta:** limpiar o anular referencias a ese user en qr_tokens (created_by, used_by) e inventory_movements/sales ya tienen SET NULL, así que no bloquean. El único bloqueante posible es **qr_tokens** (created_by, used_by → users(id) sin ON DELETE). Añadir en el RPC antes del DELETE final a users:

```sql
DELETE FROM public.qr_tokens WHERE created_by = p_user_id OR used_by = p_user_id;
```

( o bien migrar esas FK a ON DELETE SET NULL si el negocio lo permite. )

---

## E) DUDA CRÍTICA: Borrar cuenta con suscripción activa

### Qué pasa si se borra el user sin cancelar en Stripe

- **Base de datos:** El RPC borra public.users; la Edge borra auth.users. Las filas de public.subscriptions que referencian a ese auth.users se eliminan por CASCADE al borrar auth.users (subscriptions_owner_id_fkey y subscriptions_user_id_fkey → auth.users ON DELETE CASCADE).
- **Stripe:** El **customer** y la **subscription** siguen existiendo. Stripe seguirá cobrando y generando eventos. El webhook puede recibir invoice.payment_succeeded o customer.subscription.updated para un customer que ya no tiene usuario en la app; el webhook hace UPDATE users WHERE stripe_customer_id = X y no encuentra fila, devuelve 200 y no rompe nada, pero queda suscripción “huérfana” en Stripe y cobros recurrentes.

### Política recomendada (una de dos)

**Opción 1 – Cancelar automáticamente en Stripe desde la Edge**

- Antes de llamar al RPC, si el usuario tiene `stripe_subscription_id` no nulo, llamar a Stripe API para cancelar la suscripción (cancel at period end o inmediato).
- Ventaja: no quedan cobros ni suscripciones huérfanas.
- Desventaja: requiere STRIPE_SECRET_KEY en la Edge y un poco más de lógica.

**Opción 2 – Bloquear eliminación si hay suscripción activa**

- En la Edge, antes del RPC: leer de public.users (o del user ya cargado) stripe_subscription_id / subscription_active; si hay suscripción activa, devolver 409 con mensaje “Cancela tu suscripción desde Configuración de suscripción antes de eliminar la cuenta”.
- Ventaja: implementación mínima, sin tocar Stripe desde la Edge.
- Desventaja: el usuario debe ir al Portal, cancelar y luego volver a Eliminar cuenta.

### Recomendación

**Opción 1** (cancelar en Stripe desde la Edge) evita cobros y huérfanos. Cambios mínimos y seguros:

1. En la Edge **delete-user-account**, después de obtener el user y antes del RPC:
   - Leer de BD (con supabaseAdmin) la fila de public.users por user.id y obtener stripe_subscription_id (y opcionalmente subscription_active).
   - Si stripe_subscription_id no es null:
     - Llamar a Stripe para cancelar: `POST /v1/subscriptions/{sub_id}` con `cancel_at_period_end=true` o cancelación inmediata (según política).
     - Log seguro: `[DELETE_ACCOUNT] canceling_stripe_subscription` con `subIdSuffix: sub_id.slice(-6)` (nunca token ni id completo en logs).
   - Si la llamada a Stripe falla (4xx/5xx): decidir si se bloquea el delete (403) o se sigue con el delete y se loguea el error para soporte. Recomendación: seguir con el delete y loguear para no bloquear al usuario.

2. Pseudocódigo (solo lectura de BD + cancelación Stripe + logs seguros):

```text
// 1) Después de getUser(), antes del RPC:
const { data: userRow } = await supabaseAdmin
  .from('users')
  .select('stripe_subscription_id')
  .eq('id', user.id)
  .maybeSingle();

const subId = userRow?.stripe_subscription_id?.trim?.();
if (subId) {
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (stripeSecretKey) {
    try {
      const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'cancel_at_period_end=true',
      });
      if (__DEV__ || res.status >= 400) {
        console.log('[DELETE_ACCOUNT] stripe_cancel_result', {
          status: res.status,
          subIdSuffix: subId.slice(-6),
        });
      }
      // Opcional: si res.status === 404, subscription ya no existe en Stripe, ok.
    } catch (e) {
      console.error('[DELETE_ACCOUNT] stripe_cancel_error', {
        message: e instanceof Error ? e.message : 'unknown',
        subIdSuffix: subId.slice(-6),
      });
      // Continuar con delete: no bloquear al usuario
    }
  } else {
    console.warn('[DELETE_ACCOUNT] stripe_subscription_id present but STRIPE_SECRET_KEY not set');
  }
}

// 2) Seguir con RPC y auth.admin.deleteUser como hoy.
```

3. Puntos de log seguro (sin tokens ni IDs completos):

   - Antes de llamar a Stripe: `[DELETE_ACCOUNT] canceling_stripe_subscription` con `subIdSuffix: sub_id.slice(-6)`.
   - Tras respuesta Stripe: `[DELETE_ACCOUNT] stripe_cancel_result` con `status`, `subIdSuffix`.
   - En catch: `[DELETE_ACCOUNT] stripe_cancel_error` con `message`, `subIdSuffix`.

No se cambia la lógica de negocio de borrado (RPC + auth.admin.deleteUser); solo se añade un paso previo de cancelación en Stripe y logs seguros.

---

## Resumen de riesgos y fixes mínimos

| Riesgo | Fix mínimo |
|--------|------------|
| Staff con qr_tokens (created_by/used_by) bloquea DELETE users | En RPC delete_user_account: `DELETE FROM qr_tokens WHERE created_by = p_user_id OR used_by = p_user_id` antes del DELETE final a users (o FK ON DELETE SET NULL). |
| Borrar cuenta con suscripción activa deja cobros en Stripe | Opción A: En Edge delete-user-account, cancelar suscripción en Stripe antes del RPC (pseudocódigo arriba). Opción B: Devolver 409 si stripe_subscription_id presente y pedir cancelar desde Portal. |
| Loaders pegados en Subscriptions/Settings | Timeout en invoke/rpc y setIsProcessing(false) / setIsDeleting(false) en finally. |
| enforce_subscription_expiry no en repo | Documentar o añadir migración con la definición de la RPC para que expiry quede versionado. |

Todos los logs en __DEV__ o sin PII; no imprimir tokens ni secrets.
