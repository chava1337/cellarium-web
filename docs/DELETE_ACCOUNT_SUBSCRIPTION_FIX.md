# Fix: delete-user-account — permitir borrar con cancelación programada

## Resumen de cambios

1. **Select de `users`**  
   Se añade `subscription_cancel_at_period_end` al select para leer si la cancelación ya está programada en BD.

2. **Lógica de bloqueo**  
   - Antes: `blocked = subscriptionActive || hasStripeSubId` (bloqueaba con suscripción activa o con `stripe_subscription_id`).  
   - Ahora: `cancelScheduled = userCancelScheduled` (desde BD) y `blocked = subscriptionActive && !cancelScheduled`.  
   - Si hay `stripe_subscription_id`, se consulta Stripe, se calcula `stripeCancelScheduled` y se hace `cancelScheduled = cancelScheduled || stripeCancelScheduled` y `blocked = subscriptionActive && !cancelScheduled`.

3. **Consulta a Stripe**  
   Se hace siempre que exista `hasStripeSubId` (ya no solo cuando `blocked`), para normalizar y persistir el estado.  
   `stripeCancelScheduled` se define como: `cancel_at_period_end === true` o `cancel_at` numérico o `canceled_at` presente o `status === 'canceled'`.

4. **Persistencia**  
   Cuando la llamada a Stripe es correcta (`subRes.ok && stripeSub.id`):  
   - En `public.subscriptions`: se actualiza `metadata`, `cancel_at_period_end = cancelScheduled` y `updated_at`.  
   - En `public.users`: se actualiza `subscription_cancel_at_period_end = cancelScheduled` y `updated_at`.

5. **Logs**  
   - En `[DELETE_ACCOUNT] stripe sub check` se registran: `subscriptionActive`, `userCancelScheduled`, `stripeCancelScheduled`, `cancelScheduled`, `blocked`, `status`.  
   - En `[DELETE_ACCOUNT] SUBSCRIPTION_ACTIVE block` se añade `cancelScheduled` y se unifica el nombre a `subscriptionActive`.

No se ha tocado: RPC `delete_user_account`, limpieza de storage, borrado de staff/auth, CORS ni autenticación.

---

## Regla de negocio resultante

| Situación | Bloqueo |
|-----------|--------|
| Suscripción **activa** y **no cancelada** | **Sí** bloquea (no puede borrar cuenta). |
| Suscripción activa pero **cancelada/programada** (`cancel_at_period_end` o ya cancelada en Stripe) | **No** bloquea (sí puede borrar cuenta). |
| Suscripción no activa | No bloquea. |

---

## Diff exacto (fragmento relevante)

```diff
--- a/supabase/functions/delete-user-account/index.ts
+++ b/supabase/functions/delete-user-account/index.ts
@@ -64,28 +64,32 @@
-    // 0. Opción B: bloquear si tiene suscripción activa o vinculada (debe cancelar desde Portal primero)
+    // 0. Bloquear solo si suscripción activa y NO cancelada/programada. Permitir borrar si ya cancelada o cancel_at_period_end.
     const { data: userRow, error: userRowError } = await supabaseAdmin
       .from('users')
-      .select('subscription_active, subscription_plan, subscription_expires_at, stripe_subscription_id, stripe_customer_id')
+      .select('subscription_active, subscription_plan, subscription_expires_at, subscription_cancel_at_period_end, stripe_subscription_id, stripe_customer_id')
       .eq('id', user.id)
       .maybeSingle();
@@ -78,11 +82,14 @@
       }, 500);
     }

-    const subscriptionActive = userRow?.subscription_active === true;
+    const subscriptionActive = userRow?.subscription_active === true;
+    const userCancelScheduled = userRow?.subscription_cancel_at_period_end === true;
     const stripeSubId = userRow?.stripe_subscription_id?.trim?.() ?? '';
     const hasStripeSubId = stripeSubId.length > 0;
-    let blocked = subscriptionActive || hasStripeSubId;
+    let cancelScheduled = userCancelScheduled;
+    // Regla: permitir borrar si la suscripción ya está cancelada/programada, aunque siga activa hasta fin de periodo.
+    let blocked = subscriptionActive && !cancelScheduled;

-    // Si hay stripe_subscription_id, consultar Stripe para permitir borrado si la cancelación ya está programada
-    if (blocked && hasStripeSubId) {
+    // Si hay stripe_subscription_id, consultar Stripe para normalizar cancelScheduled y persistir estado
+    if (hasStripeSubId) {
       const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
       if (stripeSecretKey?.trim()) {
         try {
@@ -96,23 +103,27 @@
           const stripeSub = await subRes.json().catch(() => ({})) as Record<string, unknown>;
           const cancelAtPeriodEnd = stripeSub.cancel_at_period_end === true;
           const cancelAt = stripeSub.cancel_at;
           const canceledAt = stripeSub.canceled_at;
           const status = typeof stripeSub.status === 'string' ? stripeSub.status : '';
-          const cancelScheduled =
-            cancelAtPeriodEnd === true ||
-            (typeof cancelAt === 'number') ||
-            (canceledAt != null) ||
-            (status === 'canceled');
+          const stripeCancelScheduled =
+            cancelAtPeriodEnd === true ||
+            (typeof cancelAt === 'number') ||
+            (canceledAt != null) ||
+            (status === 'canceled');
+
+          cancelScheduled = cancelScheduled || stripeCancelScheduled;
+          blocked = subscriptionActive && !cancelScheduled;

           const subIdSuffix = stripeSubId.length >= 6 ? stripeSubId.slice(-6) : '***';
-          console.log('[DELETE_ACCOUNT] stripe sub check', { subIdSuffix, cancelScheduled, status });
+          console.log('[DELETE_ACCOUNT] stripe sub check', {
+            subIdSuffix,
+            subscriptionActive,
+            userCancelScheduled,
+            stripeCancelScheduled,
+            cancelScheduled,
+            blocked,
+            status,
+          });

-          if (cancelScheduled) {
-            blocked = false;
-          }
-
-          // Persistir en DB para que el frontend lo muestre
+          // Persistir estado normalizado en DB (subscriptions + users)
           if (subRes.ok && stripeSub.id) {
             ...
             await supabaseAdmin
               .from('subscriptions')
               .update({
                 metadata: meta,
+                cancel_at_period_end: cancelScheduled,
                 updated_at: nowIso,
               })
               .eq('stripe_subscription_id', stripeSubId);
+
+            await supabaseAdmin
+              .from('users')
+              .update({
+                subscription_cancel_at_period_end: cancelScheduled,
+                updated_at: nowIso,
+              })
+              .eq('id', user.id);
           }
         } catch (e) {
@@ -164,8 +175,9 @@
       console.log('[DELETE_ACCOUNT] SUBSCRIPTION_ACTIVE block', {
         userIdSuffix,
-        subscription_active: subscriptionActive,
+        subscriptionActive,
+        cancelScheduled,
         plan: userRow?.subscription_plan ?? null,
         hasStripeSubId,
       });
```

(El diff anterior es conceptual; el select se reemplazó en bloque por la nueva línea, no se duplicó.)

---

## Nota

- La columna `cancel_at_period_end` existe en `public.subscriptions` (remote_schema).  
- Si en tu entorno `subscriptions` no tuviera esa columna, el `update` fallaría hasta añadirla por migración; en el repo actual está definida.
