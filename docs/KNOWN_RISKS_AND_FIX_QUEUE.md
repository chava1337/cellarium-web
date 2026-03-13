# KNOWN_RISKS_AND_FIX_QUEUE — Pendientes y prioridad

**Solo lectura.** No se implementan fixes; solo se listan y priorizan.

---

## P0 — Crítico

| # | Qué rompe | Dónde | Cómo reproducir | Fix sugerido | Esfuerzo |
|---|------------|-------|------------------|--------------|----------|
| 1 | anon podría leer qr_tokens (tokens no expirados) | RLS qr_tokens "Owners can view their qr_tokens" con `OR (expires_at > now())`; grants anon SELECT | En BD: SELECT desde rol anon a qr_tokens. Si devuelve filas, anon ve tokens. | Migración: crear policy SELECT solo para authenticated (auth.uid() = owner_id) o eliminar la cláusula OR expires_at para anon. | S |
| 2 | enforce_subscription_expiry no existe tras deploy desde cero | SubscriptionsScreen llama supabase.rpc('enforce_subscription_expiry') | Nueva BD sin migración que cree la RPC; abrir Suscripciones. | Añadir migración que defina RPC enforce_subscription_expiry (poner subscription_active = false donde subscription_expires_at <= now()). | S |

---

## P1 — Alto

| # | Qué rompe | Dónde | Cómo reproducir | Fix sugerido | Esfuerzo |
|---|------------|-------|------------------|--------------|----------|
| 3 | Policy guests_can_view_public_stock redundante y con subquery a qr_tokens | wine_branch_stock RLS | Si anon no puede leer qr_tokens, la policy no da filas; app guest ya no usa ese path. | Migración: DROP policy guests_can_view_public_stock o restringirla a roles que ya no se usan para guest. | S |
| 4 | Código muerto: QrService y validateQrToken | src/services/QrService.ts; src/services/QrTokenService.ts (validateQrToken) | N/A (no se usan). | Eliminar o marcar @deprecated; quitar validateQrToken de QrTokenService si no hay otros consumidores. | S |
| 5 | reconcile_branch_locks plan_id 'business' vs 'additional-branch' | Algunas migraciones usan v_plan_id = 'business' | Business en app es 'additional-branch'; límite 3+addon podría no aplicarse. | Ver DIAGNOSTICO_UPDATE_SUBSCRIPTION.md; migración CREATE OR REPLACE reconcile_branch_locks con plan_id IN ('business','additional-branch'). | M |

---

## P2 — Medio

| # | Qué rompe | Dónde | Cómo reproducir | Fix sugerido | Esfuerzo |
|---|------------|-------|------------------|--------------|----------|
| 6 | Race en hydrateProfile / profileReady | AuthContext: loadUserData asíncrono; pantallas dependen de profileReady | Login rápido + navegación puede mostrar estado intermedio. | Asegurar que pantallas que requieren user+role esperen profileReady; evitar flashes de "Sin permiso". | M |
| 7 | Validación branchId/ownerId en queries | Varios servicios asumen branch_id/owner_id coherentes | Datos corruptos o cambio de tenant podrían filtrar mal. | Validar en capa servicio que branch.owner_id = ownerId cuando se filtra por branch; logs en __DEV__. | S |
| 8 | AdminRegistrationScreen SELECT a qr_tokens | Si se endurece RLS qr_tokens para anon | Staff después de resolve-qr ya tiene owner_id en params; si la pantalla hace SELECT por token para algo más, fallaría. | Verificar que AdminRegistrationScreen no dependa de SELECT qr_tokens; usar solo ownerId/branchId de resolve-qr. | S |
| 9 | Loaders o estados de carga pegados | Posibles setLoading(false) faltantes en ramas de error | Clic en "Generar QR" o "Eliminar cuenta" con error de red. | Revisar todos los catch/finally en handlers que llaman Edge/ Supabase; asegurar setLoading(false). | S |
| 10 | Inconsistencias plan_id (pro/basic, business/additional-branch) | Stripe lookup keys vs BD | Webhook normaliza; RPC get_plan_id_effective devuelve plan de users; reconcile puede usar 'business'. | Unificar en todo el backend uso de 'basic' y 'additional-branch'; mapear 'pro'/'business' solo en frontera. | M |

---

## Quick wins (S)

- Eliminar o restringir policy qr_tokens SELECT para anon (P0#1).
- Versionar enforce_subscription_expiry (P0#2).
- Eliminar/restringir guests_can_view_public_stock (P1#3).
- Quitar código muerto QrService; evaluar eliminar validateQrToken si no se usa (P1#4).
- Revisar AdminRegistrationScreen para no SELECT qr_tokens (P2#8).
- Revisar try/catch en handlers críticos (P2#9).

---

## Checklist antes de tocar RLS/DB en producción

- [ ] Confirmar en BD actual si anon puede SELECT qr_tokens (ej. `SELECT ... FROM qr_tokens` como anon).
- [ ] Backup de policies actuales de qr_tokens y wine_branch_stock.
- [ ] Desplegar migraciones en staging y probar: QR staff (resolve-qr → AdminRegistration), QR guest (public-menu → WineCatalog), generación QR (create_guest_qr_token).
- [ ] Verificar que ninguna app o script externo dependa de SELECT anon a qr_tokens o wine_branch_stock.
- [ ] Documentar enforce_subscription_expiry si existe solo en dashboard; o añadir migración.
