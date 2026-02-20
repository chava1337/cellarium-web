# Verificación: Add-on de sucursales (update-subscription)

## Cómo probar el flujo "Sucursales adicionales"

1. **Requisito:** Un owner con plan Business (`subscription_plan = 'additional-branch'`) y una suscripción activa en Stripe (y fila en `subscriptions` con `stripe_subscription_id` y `status = 'active'`).

2. **Crear add-on (qty = 1)**  
   Desde la app: Suscripciones → sección "Sucursales adicionales" → elegir cantidad 1 → "Actualizar add-ons".  
   - Debe devolver 200 y el item add-on debe crearse en la suscripción de Stripe.  
   - Verificar en BD: `users.subscription_branch_addons_count = 1` y `subscriptions.metadata.addonBranchesQty = 1` (para esa suscripción).

3. **Actualizar cantidad (qty = 3)**  
   Repetir con cantidad 3.  
   - Debe devolver 200 y el quantity del item add-on en Stripe debe ser 3.  
   - `users.subscription_branch_addons_count = 3`, `subscriptions.metadata.addonBranchesQty = 3`.

4. **Quitar add-on (qty = 0)**  
   Poner cantidad 0 y actualizar.  
   - Debe devolver 200 y el item add-on debe desaparecer de la suscripción en Stripe (deleted).  
   - `users.subscription_branch_addons_count = 0`, metadata sin addon o en 0.

5. **Reconciliación de locks**  
   Con `base_included = 1` y addon = 2: `allowed_count = 3`.  
   - Ejecutar `SELECT * FROM reconcile_branch_locks('<owner_id>');`  
   - Debe desbloquear hasta 3 sucursales (1 main + 2 adicionales).  
   - Si el owner tiene más de 3 sucursales, las que sobran deben quedar `is_locked = true` con `lock_reason = 'subscription_limit'`.

## Nota sobre cuentas de prueba

En entornos de prueba puede haber **varias filas en `subscriptions` con `status = 'active'` para el mismo `owner_id`** por múltiples checkouts. El **webhook de Stripe** ahora, tras hacer upsert de la suscripción vigente, marca como `status = 'canceled'` el resto de suscripciones activas de ese owner, dejando solo una activa. No es necesario ejecutar scripts manuales salvo para limpiezas puntuales.
