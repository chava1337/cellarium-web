# SECURITY_RLS_AUDIT — Auditoría RLS, roles y permisos

**Solo lectura.** Referencia: `supabase/migrations/20260207213838_remote_schema.sql` y resto de migraciones.

---

## 1. Modelo de roles

- **Roles:** owner, gerente, sommelier, supervisor, personal. Fuente de verdad: columna `public.users.role`.
- **Guest/anon:** Usuario no autenticado; no tiene fila en `public.users`; `auth.uid()` es null.
- **owner_id / branch_id:** Staff tiene `owner_id` (owner al que pertenece) y `branch_id` (sucursal asignada). Owner tiene `owner_id` null o igual a su id según convención; branches se filtran por `branches.owner_id = auth.uid()`.

---

## 2. Matriz RLS por tabla (resumen)

### 2.1 qr_tokens

| Operación | Quién | Policy | Expresión resumida | Riesgo |
|-----------|--------|--------|--------------------|--------|
| SELECT | public | Owners can view their qr_tokens | `(auth.uid() = owner_id) OR (expires_at > now())` | **anon** cumple la segunda parte → ve todos los tokens no expirados. Si en producción se endureció (solo authenticated o se eliminó OR expires_at), anon = 0. Verificar en BD. |
| INSERT | public | Owners can create qr_tokens | WITH CHECK `auth.uid() = owner_id` | Solo owner. |
| UPDATE | public | Owners can update their qr_tokens | USING + WITH CHECK `auth.uid() = owner_id` | Solo owner. |
| DELETE | public | Owners can delete their qr_tokens | USING `auth.uid() = owner_id` | Solo owner. |

**Grants en schema:** anon tiene SELECT, INSERT, UPDATE, DELETE en `qr_tokens` (líneas 2819–2830). La restricción es solo RLS; con la policy actual anon podría leer filas con `expires_at > now()`.

### 2.2 wine_branch_stock

| Operación | Quién | Policy | Expresión resumida | Riesgo |
|-----------|--------|--------|--------------------|--------|
| SELECT | public | guests_can_view_public_stock | `branch_id IN (SELECT branch_id FROM qr_tokens WHERE type='guest' AND expires_at>now() AND (used=false OR used IS NULL))` | Subquery a qr_tokens; si anon no puede leer qr_tokens, subquery vacío → anon no ve filas. App guest ya no hace este SELECT (public-menu). |
| SELECT | public | owner_can_view_their_stock, staff_can_view_owner_stock | owner/staff por wines.owner_id / branches | Normal. |
| INSERT/UPDATE/DELETE | public | owner_* / staff_* | owner o staff del tenant | Normal. |

**Conclusión:** Eliminar o restringir `guests_can_view_public_stock` para anon es seguro respecto al flujo app actual (guest vía public-menu). Si existe otro consumidor (web) que haga SELECT anon a wine_branch_stock, debe migrarse a public-menu.

### 2.3 users

- SELECT: "Users can view own data", "Users can view own record", "Users can view their own profile", "Owners can view their staff" — auth.uid() = id o owner_id; staff ve owner.
- INSERT/UPDATE: propias filas o owner sobre staff. Sin políticas que permitan anon leer users.

### 2.4 branches

- SELECT: "Users can view own branches" (owner o staff por branch_id). No anon.
- INSERT/UPDATE: owner; enforce_branch_limit trigger.

### 2.5 subscriptions / payments / invoices

- SELECT/INSERT: owner_id = auth.uid() o users.owner_id; no anon. rate_limits: policy "rate_limits_service_only" USING (false) → nadie vía RLS (solo service_role).

---

## 3. Puntos sensibles

- **qr_tokens SELECT:** `OR (expires_at > now())` permite a anon ver tokens no expirados si no se ha aplicado una migración posterior que restrinja. **Acción:** Confirmar en BD si anon puede SELECT qr_tokens; si sí, añadir migración que restrinja a authenticated o elimine la cláusula para anon.
- **guests_can_view_public_stock:** Depende de subquery a qr_tokens; anon con qr_tokens bloqueado ya no obtiene filas. Policy redundante para el flujo app actual; se puede eliminar o limitar a roles que ya no se usan para guest.
- **rate_limits:** USING (false) → solo service_role; correcto.
- No se detectaron políticas con `OR true` ni expresiones triviales que desactiven RLS.

---

## 4. Resumen por rol

| Rol | qr_tokens | wine_branch_stock | users | branches |
|-----|-----------|-------------------|-------|----------|
| anon | SELECT si policy con expires_at (ver arriba) | SELECT solo si guests_can_view y subquery devuelve rows | No | No |
| authenticated (owner) | SELECT/INSERT/UPDATE/DELETE propias | SELECT/INSERT/UPDATE/DELETE por owner | Sí propias y staff | Sí propias |
| authenticated (staff) | No (owner_id distinto) | Sí por owner/staff policies | Sí propio y vista owner | Sí asignadas |
| service_role | Bypass RLS | Bypass RLS | Bypass | Bypass |

Este documento debe leerse junto con PROJECT_STATE_SNAPSHOT y QR_SYSTEM_AUDIT para decisiones de endurecimiento de qr_tokens y wine_branch_stock.
