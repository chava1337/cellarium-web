# ARCHITECTURE_MAP — Diagramas y fuentes de verdad

**Solo lectura.** Diagramas textuales y referencias a "source of truth".

---

## 1. Alta nivel

```
[App Expo RN]
  ├── AuthContext (session, user, profileReady, refreshUser)
  │     └── Source of truth: public.users (role, owner_id, branch_id, subscription_*)
  ├── BranchContext (currentBranch, availableBranches)
  │     └── Source of truth: public.branches (RLS por owner/staff)
  ├── Screens
  │     ├── QrProcessor → resolve-qr (staff) / public-menu (guest/legacy)
  │     ├── WineCatalog → loadGuestMenuByToken (guest) / getWinesByBranch (staff/owner)
  │     ├── QrGeneration → createGuestQrToken RPC / QrGenerationService
  │     ├── SubscriptionsScreen → checkout, portal, enforce_subscription_expiry, update-subscription
  │     └── SettingsScreen → delete-user-account Edge
  └── Utils: permissions (canGenerateGuestQr), effectivePlan (getEffectivePlan)

[Supabase]
  ├── Edge Functions (stripe-webhook, create-checkout-session, create-portal-session,
  │   update-subscription, delete-user-account, resolve-qr, public-menu, user-created, ...)
  ├── RPCs (delete_user_account, get_plan_id_effective, is_subscription_effectively_active,
  │   get_branch_limit_for_owner, reconcile_branch_locks, create_guest_qr_token, create_staff_user)
  └── Tables + RLS (users, branches, wines, wine_branch_stock, qr_tokens, subscriptions, ...)
```

---

## 2. Flujo QR (actual)

```
QR escaneado
  → QrProcessorScreen
  → Payload type?
       ├── admin / admin_invite → POST resolve-qr { token }
       │     → success → AdminRegistration (ownerId, branchId, branchName, qrToken)
       │     → fail → Alert + Welcome
       ├── guest → Navigate WineCatalog { isGuest: true, guestToken }
       │     → WineCatalogScreen: loadGuestMenuByToken(guestToken)
       │     → GET public-menu?token=... → branch + wines → UI
       └── sin type (legacy) → GET public-menu?token=...
             → ok → WineCatalog { isGuest: true, guestToken }
             → fail → POST resolve-qr { token }
                   → success → AdminRegistration
                   → fail → Alert "QR expiró o no válido"
```

**Source of truth token:** Edge resolve-qr y public-menu leen `qr_tokens` con service_role. App no hace SELECT a qr_tokens para validar.

---

## 3. Flujo suscripción / borrado cuenta

```
Checkout: App → create-checkout-session → Stripe → pago
  → Stripe webhook → stripe-webhook → users + subscriptions → reconcile_branch_locks

Portal: App → create-portal-session → Usuario cancela/cambia en Stripe
  → Stripe webhook → stripe-webhook → users (cancel_at_period_end, status, etc.)

Expiry: SubscriptionsScreen (focus) → enforce_subscription_expiry RPC → refreshUser
  (RPC no versionada en repo)

Delete account: SettingsScreen → invoke delete-user-account (Bearer)
  → Edge lee users.subscription_active, stripe_subscription_id
  → Si activo → 409 SUBSCRIPTION_ACTIVE → App alert + navega Suscripciones
  → Si no → RPC delete_user_account(p_user_id) → auth.admin.deleteUser
```

---

## 4. Fuentes de verdad por dominio

| Dominio | Fuente de verdad | Dónde se usa |
|---------|------------------|--------------|
| Rol / tenant | public.users.role, owner_id, branch_id | AuthContext, permissions, BranchContext, RLS |
| Plan efectivo | users.subscription_plan + subscription_active + subscription_expires_at | effectivePlan.ts, SubscriptionsScreen, delete-user-account Edge |
| Límite branches | get_branch_limit_for_owner(p_owner), reconcile_branch_locks | Trigger enforce_branch_limit; stripe-webhook; update-subscription |
| Token QR válido (staff) | resolve-qr Edge (lee qr_tokens con service_role) | QrProcessorScreen |
| Menú guest | public-menu Edge (lee qr_tokens, wine_branch_stock, wines con service_role) | PublicMenuService, WineCatalogScreen (guest) |

---

## 5. Dependencias críticas

- **WineCatalogScreen guest:** Depende solo de PublicMenuService.getPublicMenuByToken (Edge public-menu). No depende de RLS wine_branch_stock ni qr_tokens en cliente.
- **QrProcessorScreen:** Depende de resolve-qr y public-menu; no de validateQrToken ni SELECT cliente a qr_tokens.
- **SubscriptionsScreen:** Depende de enforce_subscription_expiry (RPC no versionada), create-checkout-session, create-portal-session, stripe-webhook, refreshUser.
- **delete-user-account:** Depende de users.subscription_* y stripe_subscription_id para bloquear 409; luego RPC delete_user_account y auth.admin.

Este mapa debe usarse junto con PROJECT_STATE_SNAPSHOT y los demás audits para cambios en RLS, Edges o RPCs.
