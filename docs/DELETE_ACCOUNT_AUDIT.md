# Eliminación de cuenta – Auditoría y política

## Política Opción B: Bloqueo por suscripción activa

La Edge Function `delete-user-account` **no permite** borrar la cuenta si el usuario tiene una suscripción activa o vinculada en Stripe. El usuario debe cancelar primero desde el Billing Portal y luego volver a intentar eliminar la cuenta.

### Código / Estatus

- **HTTP:** `409 Conflict`
- **Código en body:** `SUBSCRIPTION_ACTIVE`
- **Condición de bloqueo:**  
  `subscription_active === true` **o** `stripe_subscription_id` no nulo y no vacío (fuente: `public.users`).

La Edge no cancela en Stripe (eso sería Opción A). Solo comprueba el estado en BD y responde 409 con un mensaje claro.

### Pasos para el usuario

1. **Suscripciones** – Ir a la pantalla de suscripciones en la app.
2. **Administrar suscripción** – Pulsar “Administrar suscripción” (abre el Stripe Customer Portal).
3. **Cancelar** – En el Portal, cancelar la suscripción (al final del periodo o de inmediato).
4. **Regresar** – Volver a la app; los webhooks actualizarán `public.users` (`subscription_active`, `stripe_subscription_id`, etc.).
5. **Eliminar cuenta** – En Ajustes, volver a intentar “Eliminar cuenta”; la Edge permitirá el borrado si ya no hay suscripción activa ni `stripe_subscription_id`.

### Respuesta 409 (ejemplo)

```json
{
  "success": false,
  "code": "SUBSCRIPTION_ACTIVE",
  "message": "No puedes eliminar tu cuenta mientras tengas una suscripción activa. Cancélala desde 'Administrar suscripción' y vuelve a intentarlo.",
  "subscription": {
    "subscription_active": true,
    "subscription_plan": "basic",
    "subscription_expires_at": "2026-02-22T00:00:00.000Z",
    "has_stripe_subscription_id": true
  }
}
```

### UI

En **SettingsScreen**, si la invoke devuelve error con `status === 409` (FunctionsHttpError):

- **Alert:** título “No se puede eliminar la cuenta”, mensaje indicando cancelar desde “Administrar suscripción”.
- **Botones:** “OK” y “Ir a Suscripciones” (navega a la pantalla Subscriptions).
