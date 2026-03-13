# BILLING_SUBSCRIPTIONS_AUDIT — Suscripciones y Stripe

**Solo lectura.** Referencia: stripe-webhook, create-checkout-session, create-portal-session, update-subscription, SubscriptionsScreen, AuthContext.

---

## 1. Fuente de verdad del plan

**En `public.users`:**
- `subscription_plan`: 'free' | 'basic' | 'additional-branch'
- `subscription_active`: boolean
- `subscription_expires_at`: timestamp
- `subscription_cancel_at_period_end`: boolean
- `stripe_customer_id`, `stripe_subscription_id` (si existen)
- `subscription_branches_count`, `subscription_branch_addons_count` (límites/add-ons)

**En app:** `src/utils/effectivePlan.ts` — `getEffectivePlan(user)`: si no user o subscription_active !== true o expirado → 'free'; si no → user.subscription_plan ?? 'free'.

**Lookup keys → plan_id (webhook):** En stripe-webhook, `mapPlanFromLookupKey` / `normalizePlanId`: pro_* → basic, business_* → additional-branch; ALLOWED_PLAN_IDS = ['free','basic','additional-branch'].

---

## 2. Flujos

- **Checkout:** App → create-checkout-session (Bearer) → Stripe Checkout → pago → Stripe envía customer.subscription.* / invoice.* → stripe-webhook actualiza `subscriptions` y `public.users` (subscription_plan, subscription_active, subscription_expires_at, stripe_*). Webhook llama `reconcile_branch_locks(owner_id)` en eventos críticos.
- **Portal:** App → create-portal-session (Bearer) → usuario en Stripe Portal (cancelar/cambiar) → eventos subscription.updated / customer.subscription.* → webhook actualiza status y cancel_at_period_end; reconcile_branch_locks.
- **Expiry:** SubscriptionsScreen en mount/focus llama `supabase.rpc('enforce_subscription_expiry')` y luego refreshUser. **RPC no está definida en migraciones del repo** (USED_BUT_NOT_VERSIONED). Asumido: pone subscription_active = false (y quizá plan = 'free') cuando subscription_expires_at <= now().
- **Add-ons:** update-subscription Edge (addonBranchesQty); actualiza users.subscription_branch_addons_count y subscriptions.metadata; llama reconcile_branch_locks.

---

## 3. Riesgos

- **enforce_subscription_expiry no versionada:** Si se pierde la BD o se recrea, la RPC no existe. Crear migración que la defina o documentar en dashboard.
- **Desincronización:** Si el webhook falla o no recibe un evento, users puede quedar desactualizado respecto a Stripe. Mitigación: reintentos Stripe; logs y alertas.
- **Usuario borrado con suscripción activa (Opción B):** delete-user-account bloquea con 409 si subscription_active o stripe_subscription_id; no se borra la cuenta hasta que cancele. La suscripción en Stripe sigue activa hasta cancelación en Portal; no se cancela automáticamente al borrar cuenta.

---

## 4. Archivos clave

| Archivo | Uso |
|---------|-----|
| `supabase/functions/stripe-webhook/index.ts` | Eventos Stripe → users + subscriptions; reconcile_branch_locks; normalización plan_id. |
| `supabase/functions/create-checkout-session/index.ts` | Crea sesión Stripe Checkout. |
| `supabase/functions/create-portal-session/index.ts` | Crea sesión Stripe Portal. |
| `supabase/functions/update-subscription/index.ts` | Add-ons; actualiza users y metadata; reconcile_branch_locks. |
| `src/screens/SubscriptionsScreen.tsx` | UI checkout/portal; enforce_subscription_expiry + refreshUser; effectivePlan. |
| `src/contexts/AuthContext.tsx` | USERS_SELECT_COLUMNS incluye subscription_plan, subscription_active, subscription_expires_at, etc. |
