# UserManagementScreen — Uso exclusivo de RPCs

## 1. Archivos modificados

| Archivo | Cambio |
|--------|--------|
| `src/screens/UserManagementScreen.tsx` | Ya usaba las 4 RPCs (carga, aprobar, rechazar, cambiar rol). Se añadió comentario de arquitectura, y en cambio de rol se muestra `result.message` en éxito cuando la RPC lo devuelve (p. ej. "El usuario ya tiene ese rol"). |

No se modifican migraciones ni otros módulos.

---

## 2. Diff propuesto

### `src/screens/UserManagementScreen.tsx`

**A) Comentario de arquitectura (después de imports):**

```diff
 import { mapSupabaseErrorToUi } from '../utils/supabaseErrorMapper';

+/**
+ * Gestión de Usuarios usa exclusivamente RPCs SECURITY DEFINER:
+ * - list_manageable_users() para carga
+ * - approve_staff_request_managed(uuid, text) para aprobar
+ * - reject_staff_request_managed(uuid) para rechazar
+ * - change_staff_role_managed(uuid, text) para cambiar rol
+ * No hay select/update directo a public.users para estos flujos.
+ * Eliminar usuario sigue usando delete directo (sin RPC en ámbito).
+ */
+
 type UserManagementScreenNavigationProp
```

**B) Mensaje de éxito en cambio de rol (usar `result.message` cuando exista):**

```diff
               await loadUsers();
               setIsChangeRoleModalVisible(false);
               setSelectedUser(null);
-              Alert.alert(t('msg.success'), `${t('users.role_updated')} ${selectedUser.name || selectedUser.username || selectedUser.email} ${t('users.role_updated_to')} ${getRoleName(newRole)}`);
+              const successMsg = result?.message ?? `${t('users.role_updated')} ${selectedUser.name || selectedUser.username || selectedUser.email} ${t('users.role_updated_to')} ${getRoleName(newRole)}`;
+              Alert.alert(t('msg.success'), successMsg);
```

El resto del archivo ya estaba alineado con los requisitos (loadUsers con RPC, pendientes/activos por `status`, aprobar/rechazar/cambiar rol con RPCs, mensajes con `ok`/`message`, refresh y estados de carga).

---

## 3. Resumen del flujo final

| Acción | Origen de datos / Acción | RPC |
|--------|--------------------------|-----|
| **Cargar lista** | `loadUsers()` | `supabase.rpc('list_manageable_users')` → se separa en `pendingUsers` (`status === 'pending'`) y `activeUsers` (`status === 'active'`). |
| **Abrir modal aprobar** | Usuario toca "Aprobar" en un pendiente | `handleApproveUser(user)` → abre modal con roles asignables. |
| **Aprobar con rol** | Usuario elige rol en modal | `approve_staff_request_managed(p_target_user_id, p_new_role)`. Se muestra `result.message` si `!result?.ok`; si `result?.ok` se llama `loadUsers()`, se cierra el modal y se muestra éxito. Estados: `approvingUserId` / `approvalSubmitting` evitan doble submit. |
| **Rechazar** | Usuario toca "Rechazar" en un pendiente | Confirmación con `Alert`; luego `reject_staff_request_managed(p_target_user_id)`. Si `result?.ok` → `loadUsers()` y mensaje de rechazado. Estado `rejectingUserId` durante la petición. |
| **Abrir modal cambio de rol** | Usuario toca "Cambiar rol" en un activo (no owner) | `handleOpenChangeRole(user)` → comprueba permisos y abre modal. |
| **Cambiar rol** | Usuario elige nuevo rol en modal | `change_staff_role_managed(p_target_user_id, p_new_role)`. Si `!result?.ok` se muestra `result.message`. Si `result?.ok` → `loadUsers()`, cierre de modal y éxito; el mensaje mostrado es `result.message` si existe (p. ej. "El usuario ya tiene ese rol"), si no el texto habitual. Estado `changingRoleUserId` evita doble submit. |
| **Eliminar usuario** | Fuera del ámbito de las RPCs de gestión | Sigue usando `supabase.from('users').delete()` con las validaciones actuales (owner/gerente, no eliminar owner). |

No hay `select` ni `update` directos a `public.users` para listar, aprobar, rechazar ni cambiar rol; solo las RPCs indicadas.

---

## 4. Checklist manual de pruebas

### Carga
- [ ] Al entrar como **owner**, la lista muestra todos los usuarios de la organización (pendientes y activos) y el owner se ve a sí mismo en activos.
- [ ] Al entrar como **gerente**, la lista muestra solo usuarios de su sucursal (pendientes y activos) y no aparece la fila del owner.
- [ ] Tras abrir la pantalla, no quedan llamadas directas a `from('users').select(...)` en red (solo `list_manageable_users`).

### Aprobar
- [ ] Aprobar un pendiente con un rol: modal de selección de rol → elegir rol → mensaje de éxito y lista actualizada (el usuario pasa a activos).
- [ ] Si la RPC devuelve `ok: false` (p. ej. usuario no pendiente): se muestra el `message` en un Alert.
- [ ] Durante la aprobación el botón muestra estado de carga y no se puede enviar dos veces.

### Rechazar
- [ ] Rechazar un pendiente: confirmación → mensaje de rechazado y lista actualizada (el usuario desaparece de pendientes).
- [ ] Si la RPC devuelve `ok: false`: se muestra el `message` en un Alert.
- [ ] Durante el rechazo el botón muestra estado de carga.

### Cambiar rol
- [ ] Cambiar rol de un activo (no owner): modal con roles → elegir rol distinto → mensaje de éxito y lista actualizada.
- [ ] Si se elige el mismo rol que ya tiene: se muestra el mensaje de la RPC (p. ej. "El usuario ya tiene ese rol") y el modal se cierra; la lista se refresca.
- [ ] Si la RPC devuelve `ok: false`: se muestra el `message` en un Alert.
- [ ] Durante el cambio de rol el botón está deshabilitado / cargando y no se puede enviar dos veces.

### Owner y gerente
- [ ] Owner puede aprobar, rechazar y cambiar rol en su organización (sin romper flujo).
- [ ] Gerente solo ve y actúa sobre usuarios de su sucursal; no ve ni edita al owner.

### Modales
- [ ] Modal de aprobación: se cierra correctamente al aprobar con éxito o al cancelar.
- [ ] Modal de cambio de rol: se cierra correctamente al guardar con éxito o al cancelar.

### Errores y red
- [ ] Errores de Supabase (red, permisos) se traducen con `mapSupabaseErrorToUi` y se muestran en Alert; si aplica, el CTA de suscripciones funciona.
