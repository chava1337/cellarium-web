# Auditoría: Permisos del owner en plan gratis — ¿Puede invitar staff al branch?

**Alcance:** Plan FREE, permisos del owner para invitar/aprobar staff en el branch.  
**Conclusión:** **Sí puede invitar staff**, con límites estrictos (1 usuario staff en total; como máximo 1 gerente). El backend hace el enforcement; el frontend no bloquea preventivamente la invitación.

---

## 1. Límites de plan FREE (definición)

| Límite        | Valor | Fuente |
|---------------|--------|--------|
| Sucursales    | 1      | `subscriptionPermissions.ts` → `PLAN_LIMITS.free.maxBranches` |
| Vinos         | 10     | `subscriptionPermissions.ts` → `PLAN_LIMITS.free.maxWines` |
| **Gerentes**  | **1**  | `subscriptionPermissions.ts` → `PLAN_LIMITS.free.maxManagers` |
| Usuarios total (owner + staff) | **2** | Backend: trigger `enforce_free_user_limits_on_update` en `20260207213838_remote_schema.sql` |

En la UI (SubscriptionsScreen / LanguageContext) el plan gratis se describe como:
- "1 gerente máximo"
- "Gestión de usuarios básica"

Eso es coherente: en la práctica el owner puede tener **como mucho 1 miembro de staff** (ese único staff puede ser gerente, sommelier, supervisor o personal; y solo puede haber 1 gerente).

---

## 2. Enforcement en backend

Trigger `enforce_free_user_limits_on_update()` (en `users`):

1. **Solo aplica si** `get_plan_id_effective(owner) = 'free'`.
2. **Solo el owner** puede modificar asignaciones de staff en plan FREE:  
   `auth.uid() <> owner` → `'Only owner can modify staff assignments in FREE plan.'`
3. **Máximo 2 usuarios** (owner + 1):  
   `total_users > 2` → `'FREE plan limit: max 2 users total (owner + 1).'`
4. **Máximo 1 gerente** por owner:  
   `manager_count > 1` → `'FREE plan limit: max 1 gerente.'`

Los RPCs de user management (`approve_staff_request_managed`, `change_staff_role_managed`, etc.) no comprueban el plan explícitamente: hacen `UPDATE` en `public.users`, y el **trigger** es quien aplica estos límites. Si el owner en FREE intenta aprobar un segundo staff (o un segundo gerente), el trigger lanza la excepción correspondiente.

---

## 3. Flujo “invitar staff” en plan FREE

- **Generar QR de invitación (admin/staff):**  
  En `QrGenerationScreen` no se comprueba el plan ni el número de managers/usuarios antes de generar el QR. El owner (o gerente) puede generar el enlace; el límite se aplica **al aprobar** al usuario.

- **Aprobar solicitud (pendiente → activo + rol):**  
  `UserManagementScreen` llama a `approve_staff_request_managed`. El `UPDATE` en `users` dispara el trigger:
  - Si ya hay 2 usuarios (owner + 1) → error `max 2 users total (owner + 1)`.
  - Si ya hay 1 gerente y se intenta aprobar/poner otro como gerente → error `max 1 gerente`.

- **Errores en UI:**  
  `supabaseErrorMapper` trata mensajes que contienen `FREE plan limit` (y similares) como límite de suscripción y muestra CTA a "Ver planes" / Subscriptions.

---

## 4. Gaps en frontend (recomendaciones)

| Punto | Estado | Recomendación |
|-------|--------|----------------|
| Límite “invitar_manager” en UI | No usado en UserManagementScreen | Opcional: antes de abrir el modal de aprobación (o de mostrar botón “Generar QR de invitación”), llamar a `isActionAllowedForUser(user, 'invite_manager', { currentManagerCount })` y deshabilitar o mostrar mensaje si el plan FREE ya tiene 1 staff. |
| Conteo “managers” vs “staff” | En código: `maxManagers` = 1; en backend: max 1 **gerente** y max **2 usuarios total** | El frontend solo tiene noción de “managers” (gerentes). Para FREE, el límite real es “1 staff en total”. Si se quiere un gating preciso en UI, habría que usar “cantidad de usuarios con `owner_id = owner` (excl. owner)” y comparar con 1 para FREE. |
| QR de invitación staff | No se comprueba plan/límite antes de generar | Opcional: en owner con plan FREE, si ya tiene 1 usuario staff, no permitir generar nuevo QR de invitación o mostrar advertencia. |

---

## 5. Respuesta directa

- **¿Es posible invitar staff al branch en plan gratis?**  
  **Sí.** El owner puede tener **exactamente 1 miembro de staff** en su única sucursal. Ese staff puede ser gerente, sommelier, supervisor o personal; si es gerente, solo puede haber ese único gerente.

- **¿Quién puede hacerlo?**  
  Solo el **owner** puede modificar asignaciones de staff en plan FREE (el trigger lo exige). En la práctica, la invitación (QR) y la aprobación las hace el owner; si hubiera un gerente ya aprobado, en FREE no podría aprobar a un segundo usuario porque el límite es 2 usuarios total.

- **¿Dónde se aplica el límite?**  
  En el **backend**, con el trigger `enforce_free_user_limits_on_update` en la tabla `users`. El frontend no bloquea preventivamente la acción; si se intenta superar el límite, el backend devuelve error y la app muestra el mensaje de límite con enlace a suscripciones.
