# Gestión de Usuarios vía RPCs SECURITY DEFINER

## Endurecimientos aplicados (versión final)

- **list_manageable_users:** actor debe estar `status = 'active'` (si no, retorna vacío). Gerente: se excluye explícitamente `role = 'owner'`. Owner sigue viendo toda la org incluyéndose a sí mismo.
- **Todas las funciones:** `SET row_security = off` y `SET search_path = public, pg_temp`.
- **Actor activo:** en las 4 funciones se valida que el actor tenga `status = 'active'` antes de gestionar (list retorna vacío; approve/change/reject devuelven error "Usuario inactivo").
- **approve_staff_request_managed:** se exige `target_status = 'pending'`; si no, error "Solo se puede aprobar un usuario con estado pendiente".
- **reject_staff_request_managed:** se exige `target_status = 'pending'`; si no, error "Solo se puede rechazar un usuario con estado pendiente".
- **change_staff_role_managed:** si `target_role = p_new_role` se devuelve `ok: true, message: 'El usuario ya tiene ese rol'` sin ejecutar UPDATE.
- **staff_join_requests:** la migración asume columnas `requester_user_id`, `owner_id`, `branch_id`, `status`. La tabla no está definida en este repo; si en tu BD tiene otros nombres, ajusta los UPDATE en la migración.

---

## Problema que resuelve

El gerente tiene permiso de UI para Gestión de Usuarios pero **no veía usuarios pendientes** porque:
- La pantalla cargaba datos con `SELECT` directo a `public.users`.
- Con RLS restringido (gerente solo misma sucursal, sin políticas que consulten `users` dentro de `users`), los pendientes no eran visibles o el ámbito no coincidía.
- Aprobación y cambio de rol hacían `UPDATE` directo a `public.users`, dependiendo de RLS.

La solución es **no depender de RLS para esta pantalla**: usar RPCs con `SECURITY DEFINER` que ejecutan con privilegios del dueño de la función y aplican la lógica de ámbito en código (owner vs gerente, misma org / misma sucursal).

## Diseño de las RPCs

### 1. `public.list_manageable_users()`

- **Retorno:** `SETOF public.users` (mismas columnas que la tabla).
- **Comportamiento:**
  - **Owner:** usuarios donde `owner_id = auth.uid()` o `id = auth.uid()` (toda la organización).
  - **Gerente:** usuarios donde `owner_id` y `branch_id` coinciden con los del actor (misma sucursal).
  - **Otros roles:** conjunto vacío.
- **Uso en frontend:** reemplaza las dos consultas (pendientes + activos) por una sola llamada; el cliente separa por `status === 'pending'` y `status === 'active'`.

### 2. `public.approve_staff_request_managed(p_target_user_id uuid, p_new_role text)`

- **Retorno:** `jsonb` con `{ "ok": true|false, "message": "..." }`.
- **Validaciones:**
  - Usuario autenticado y con fila en `public.users`.
  - Rol del actor `owner` o `gerente`.
  - Misma organización (owner) o misma sucursal (gerente).
  - Target no es owner.
  - `p_new_role` permitido: owner puede `gerente|sommelier|supervisor|personal`; gerente solo `sommelier|supervisor|personal`.
- **Efectos:** actualiza `public.users` (status, role, approved_by, approved_at). Si existe tabla `staff_join_requests`, marca la solicitud correspondiente como `approved`.

### 3. `public.change_staff_role_managed(p_target_user_id uuid, p_new_role text)`

- **Retorno:** `jsonb` con `ok` y `message`.
- **Validaciones:** mismas que en aprobación (actor owner/gerente, ámbito, target no owner, rol permitido).
- **Efecto:** `UPDATE public.users SET role = p_new_role, updated_at = now() WHERE id = p_target_user_id` (solo si pasa las comprobaciones).

### 4. `public.reject_staff_request_managed(p_target_user_id uuid)`

- **Retorno:** `jsonb` con `ok` y `message`.
- **Validaciones:** mismas de ámbito y rol (owner/gerente, target no owner).
- **Efectos:** si existe `staff_join_requests`, marca la solicitud como `rejected`; actualiza `public.users` poniendo `status = 'inactive'`.

## Por qué este enfoque es más seguro

1. **Sin RLS recursiva:** Las políticas de `public.users` no necesitan subconsultas a `public.users` en `USING`/`WITH CHECK`. Se evitan ciclos y políticas amplias por “misma organización” para todo el staff.
2. **Un solo punto de control:** Quién puede ver y modificar qué se define en las RPCs (rol + owner_id/branch_id), no en múltiples políticas RLS.
3. **Auditable:** La lógica está en funciones SQL versionadas; es fácil revisar condiciones y mensajes de error.
4. **Escalable:** Añadir más roles o reglas (p. ej. “solo gerente de sede principal”) se hace en la función, sin tocar RLS de la tabla.
5. **Compatible con staff_join_requests:** Si la tabla existe, las RPCs actualizan su estado; si no, solo actualizan `users`. No se rompe el flujo de aprobación/rechazo existente.

## Cambios en el frontend

- **`UserManagementScreen.tsx`:**
  - **Carga:** `loadUsers()` llama solo a `supabase.rpc('list_manageable_users')` y divide el resultado en pendientes/activos por `status`.
  - **Aprobación:** `approveUserWithRole` llama a `approve_staff_request_managed(p_target_user_id, p_new_role)` y muestra éxito/error según `ok` y `message`.
  - **Rechazo:** `handleRejectUser` llama a `reject_staff_request_managed(p_target_user_id)`.
  - **Cambio de rol:** `handleChangeRole` llama a `change_staff_role_managed(p_target_user_id, p_new_role)`.
- Se eliminó la consulta a `staff_join_requests` y las rutas duales (RPC `approve_staff_request` + update legacy); todo pasa por las RPCs managed.
- No se tocan branches, delete owner, analytics ni flujos de owner más allá de lo ya descrito.

## Migración

- **Archivo:** `supabase/migrations/20260307200000_user_management_rpcs_security_definer.sql`
- Crea las cuatro funciones con `SECURITY DEFINER`, `SET search_path = public, pg_temp` y `SET row_security = off`.
- Concede `GRANT EXECUTE ... TO authenticated` para cada una.

## Checklist manual de validación (versión endurecida)

### Owner
- [ ] Ve todos los usuarios (pendientes y activos) de su organización.
- [ ] Se ve a sí mismo en la lista (usuarios activos).
- [ ] Puede aprobar pendientes asignando rol (gerente, sommelier, supervisor, personal).
- [ ] Puede rechazar pendientes.
- [ ] Puede cambiar rol de usuarios activos (no owner).
- [ ] No puede aprobar/cambiar/rechazar al owner.
- [ ] Si el owner está inactivo (status <> active), la lista sale vacía o no puede aprobar/rechazar/cambiar (según RPC).

### Gerente
- [ ] Ve solo usuarios (pendientes y activos) de su misma sucursal.
- [ ] No ve la fila del owner en la lista (excluido explícitamente).
- [ ] Ve usuarios pendientes de su sucursal.
- [ ] Puede aprobar pendientes de su sucursal (roles: sommelier, supervisor, personal).
- [ ] Puede rechazar pendientes de su sucursal.
- [ ] Puede cambiar rol de activos de su sucursal.
- [ ] No ve ni puede editar usuarios de otras sucursales ni al owner.
- [ ] Si el gerente está inactivo, lista vacía o mensaje "Usuario inactivo" en acciones.

### Validaciones endurecidas
- [ ] Aprobar un usuario que no está pendiente → mensaje "Solo se puede aprobar un usuario con estado pendiente".
- [ ] Rechazar un usuario que no está pendiente → mensaje "Solo se puede rechazar un usuario con estado pendiente".
- [ ] Cambiar rol al mismo rol que ya tiene → mensaje "El usuario ya tiene ese rol", sin error y sin update innecesario.
- [ ] Actor inactivo en approve/change/reject → mensaje "Usuario inactivo".

### Otros roles y general
- [ ] Sommelier/supervisor/personal: no acceden a la pantalla; si llaman RPC, conjunto vacío o `ok: false`.
- [ ] Tras aprobar o rechazar, la lista se actualiza.
- [ ] Tras cambiar rol, la lista se actualiza y el modal se cierra.
- [ ] Mensajes de error de las RPCs se muestran en Alert.
