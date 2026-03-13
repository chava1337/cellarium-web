# Auditoría: Borrado de sucursal y borrado total de cuenta owner

**Fecha:** 2025-03-06  
**Objetivo:** Estado exacto de lo implementado y lo no implementado (frontend, backend, BD) para no romper el proyecto en fase final.

---

## A. Estado actual del borrado de sucursal

### Qué existe hoy en frontend

| Elemento | Ubicación | Descripción |
|----------|-----------|-------------|
| **Pantalla** | `src/screens/BranchManagementScreen.tsx` | Única pantalla que maneja borrado de sucursal. |
| **handleDeleteBranch** | Mismo archivo | Muestra Alert con 3 opciones: cancelar, generar PDF y luego eliminar, o eliminar sin PDF. No toca Supabase. |
| **confirmDeleteBranch** | Mismo archivo | Segundo Alert de confirmación; en `onPress` hace el delete. |
| **Delete real** | `confirmDeleteBranch` → `onPress` async | `supabase.from('branches').delete().eq('id', branch.id).select('id')`; comprueba `data?.length === 1`; si no, lanza error; si sí, `refreshBranches()` y Alert de éxito. Estado `isDeletingBranchId` evita doble tap. |
| **Protección principal** | Render del botón | Botón Eliminar solo se muestra cuando `!branch.is_main`. |

No hay otro servicio ni pantalla que llame a delete de branch. No existe `deleteBranch` en `supabaseDirect.ts` ni llamada a RPC/Edge para borrar sucursal.

### Qué existe hoy en backend

| Elemento | Estado |
|----------|--------|
| **RPC delete_branch / remove_branch / cleanup_branch** | No existe. |
| **Edge Function para borrar branch** | No existe. |
| **RLS DELETE en branches** | Sí: policy `"Users can delete own non-main branches"` en `supabase/migrations/20260306130000_branches_rls_delete_policy.sql` (owner, solo `is_main = false`). |
| **DELETE directo desde app** | La app usa solo `supabase.from('branches').delete().eq('id', branch.id).select('id')` con el cliente anon autenticado. |

### Qué sí está implementado

- Borrado desde app solo para sucursales no principales (UI + RLS).
- Verificación de que el delete afectó exactamente 1 fila (`data.length === 1`) antes de mostrar éxito.
- Refresh de lista tras éxito (`refreshBranches()`).
- Bloqueo de doble tap (`isDeletingBranchId`).
- FKs con **ON DELETE CASCADE** hacia `branches.id`: al borrar una fila en `branches`, Postgres borra automáticamente filas en:
  - `cocktail_menu`
  - `inventory_movements`
  - `qr_tokens`
  - `sales`
  - `tasting_exams`
  - `wine_branch_stock`
- Trigger en `cocktail_menu`: al borrarse filas (p. ej. por CASCADE), se encola la imagen en `storage_delete_queue`; la Edge `process-storage-delete-queue` procesa la cola y borra del bucket `cocktail-images`.

### Qué no está implementado

- **RPC o Edge** para borrar sucursal: no existe; el flujo es solo DELETE directo desde el cliente.
- **Manejo de usuarios asignados a la sucursal:** La tabla `users` tiene `users.branch_id` → `branches(id)` **sin** ON DELETE CASCADE. Si algún usuario (staff u owner) tiene `branch_id` igual al id de la sucursal que se quiere borrar, el DELETE en `branches` **falla** por violación de FK. La app no reasigna ni borra usuarios antes del delete; no hay mensaje específico “reasigna o elimina el personal de esta sucursal primero”.
- **guest_sessions:** Tiene columna `branch_id` pero **no** hay FK a `branches`. Al borrar una sucursal, las filas de `guest_sessions` con ese `branch_id` no se eliminan ni se actualizan → quedan **huérfanas** (referencian un branch que ya no existe).
- **Limpieza explícita de storage por branch:** Las fotos de vinos están en bucket `wine-bottles` con rutas por usuario (owner), no por branch; no hay limpieza específica “por branch” en storage para vinos. Sí hay limpieza indirecta de imágenes de cocktails vía CASCADE + trigger + cola.

---

## B. Estado actual del borrado de cuenta owner

### Qué existe hoy

| Capa | Ubicación | Descripción |
|------|-----------|-------------|
| **Frontend** | `src/screens/SettingsScreen.tsx` | Botón “Eliminar cuenta”; modal con confirmación (texto “CONFIRMAR” para owner); invoca Edge `delete-user-account` con Bearer. Maneja 409 SUBSCRIPTION_ACTIVE (pedir cancelar suscripción primero). En éxito: signOut y navegación a Welcome. |
| **Edge Function** | `supabase/functions/delete-user-account/index.ts` | Verifica auth; lee `users.subscription_active` y `stripe_subscription_id`; si hay suscripción activa (o no cancelada en periodo) responde 409. Opcionalmente consulta Stripe para permitir borrado si la cancelación ya está programada. Obtiene IDs de staff; llama RPC `delete_user_account(p_user_id)` con service role; luego `auth.admin.deleteUser` para cada staff y para el owner. |
| **RPC** | `supabase/migrations/20250122140000_delete_user_account_exception_debug.sql` | `delete_user_account(p_user_id)`. Si rol = owner: borra en este orden: tasting_responses, tasting_wine_responses, tasting_exam_wines, tasting_exam_pdfs, tasting_exams; users (staff, por owner_id); wine_branch_stock (por branch_id IN branches del owner); inventory_movements (idem); wines (por owner_id); **branches** (por owner_id); qr_tokens (por owner_id); sales (por branch_id IN branches del owner, si existe tabla); rate_limits (por email). Luego borra el usuario en public.users (id = p_user_id). Si no es owner: solo tasting_responses / tasting_wine_responses y luego public.users. |

### Si ya borra todo o no

- **Datos de negocio (owner):** El RPC borra explícitamente: exámenes de cata y respuestas, staff (public.users), wine_branch_stock, inventory_movements, wines, **branches** (todas las del owner, incluyendo la principal), qr_tokens, sales, rate_limits y por último la fila del owner en public.users. No depende de CASCADE para branches; borra hijos y luego branches.
- **Auth:** La Edge borra en auth.users al owner y a los staff después del RPC.
- **Subscriptions / Stripe:** El RPC **no** borra filas de `subscriptions` ni `invoices` ni `payments`. La tabla `subscriptions` tiene FK `owner_id` → `auth.users(id)` con ON DELETE CASCADE; al hacer `auth.admin.deleteUser(owner_id)`, Supabase elimina la fila en auth.users y, si esa FK está aplicada en el proyecto, las filas de `subscriptions` que referencian a ese usuario pueden eliminarse por CASCADE (depende de la definición exacta en el schema; en `20260207213838_remote_schema.sql` aparece `subscriptions_owner_id_fkey` → auth.users ON DELETE CASCADE).
- **Huecos detectados:**
  - **guest_sessions:** El RPC no borra ni actualiza `guest_sessions`. Si hay filas con `branch_id` de branches del owner, al borrar las branches esas filas quedan con `branch_id` apuntando a IDs ya inexistentes (huérfanas). No hay FK de guest_sessions a branches, así que el delete de branches no las toca.
  - **Storage (wine-bottles):** No hay ninguna llamada a storage en el RPC ni en la Edge. Las imágenes del bucket `wine-bottles` (fotos de vinos del owner) pueden permanecer después de borrar la cuenta.
  - **Cocktail images:** Al borrarse las branches, CASCADE borra `cocktail_menu`; el trigger encola rutas en `storage_delete_queue`; si se ejecuta `process-storage-delete-queue`, las imágenes de cocktails se eliminan del bucket. No es “por owner” sino por filas de cocktail_menu borradas.

---

## C. Inventario de dependencias por branch

Tablas/recursos que referencian o usan `branch_id` (o la sucursal) y cómo se comportan hoy al borrar esa branch.

| Tabla/recurso | Tipo de relación | Cómo se borra hoy (al DELETE branch) | Riesgo si se borra la branch sin tratar eso |
|---------------|------------------|--------------------------------------|--------------------------------------------|
| **users** | FK `users.branch_id` → branches(id) **sin** ON DELETE CASCADE | No se borra ni se actualiza. | **Bloqueo:** El DELETE en branches falla si existe algún user con `branch_id` = esa branch. La app no reasigna ni elimina usuarios antes. |
| **cocktail_menu** | FK branch_id → branches(id) ON DELETE CASCADE | Postgres borra filas al borrar la branch. Trigger encola imágenes en storage_delete_queue. | Ninguno; CASCADE + cola resuelven. |
| **inventory_movements** | FK branch_id → branches(id) ON DELETE CASCADE | Postgres borra filas. | Ninguno. |
| **qr_tokens** | FK branch_id → branches(id) ON DELETE CASCADE | Postgres borra filas. | Ninguno. |
| **sales** | FK branch_id → branches(id) ON DELETE CASCADE | Postgres borra filas. | Ninguno. |
| **tasting_exams** | FK branch_id → branches(id) ON DELETE CASCADE | Postgres borra filas. | Ninguno. |
| **wine_branch_stock** | FK branch_id → branches(id) ON DELETE CASCADE | Postgres borra filas. | Ninguno. |
| **guest_sessions** | Columna `branch_id` (uuid), **sin FK** a branches | No se borra ni se actualiza. | **Huérfanos:** Filas con `branch_id` apuntando a la branch eliminada. No bloquean el delete. |
| **Storage cocktail-images** | Rutas por branch (cocktail_menu) | CASCADE borra cocktail_menu → trigger → storage_delete_queue → Edge process-storage-delete-queue. | Ninguno si la cola se procesa. |
| **Storage wine-bottles** | No es por branch; es por usuario (auth.uid()). | No se toca al borrar una branch. | N/A para borrado de una sola branch. |

Resumen: El único **bloqueante** para borrar una branch desde la app es que **no haya usuarios con `branch_id` = esa branch**. El único **huérfano** conocido al borrar una branch es **guest_sessions** con ese `branch_id`.

---

## D. Inventario de dependencias por owner

Tablas/recursos ligados al owner (owner_id o user id del owner) y cómo se limpian en el borrado total de cuenta.

| Tabla/recurso | Tipo de relación | Cómo se borra hoy (delete_user_account) | Riesgo |
|---------------|------------------|----------------------------------------|--------|
| **branches** | owner_id | RPC borra por owner_id. | Ninguno. |
| **users** (staff) | owner_id | RPC borra por owner_id antes que branches. | Ninguno. |
| **wines** | owner_id | RPC borra por owner_id. | Ninguno. |
| **wine_branch_stock** | branch_id IN branches del owner | RPC borra antes que branches. | Ninguno. |
| **inventory_movements** | branch_id IN branches del owner | RPC borra antes que branches. | Ninguno. |
| **tasting_exams / tasting_responses / tasting_exam_wines / tasting_exam_pdfs** | owner_id o vía exams | RPC borra en orden. | Ninguno. |
| **qr_tokens** | owner_id | RPC borra. | Ninguno. |
| **sales** | branch_id IN branches del owner | RPC borra si existe tabla. | Ninguno. |
| **rate_limits** | identifier (email) | RPC borra por email. | Ninguno. |
| **public.users** (owner) | id = p_user_id | RPC borra al final. | Ninguno. |
| **auth.users** (owner y staff) | Edge auth.admin.deleteUser | Edge borra después del RPC. | Ninguno. |
| **subscriptions** | owner_id → auth.users | No borrado explícito en RPC; FK a auth.users ON DELETE CASCADE puede limpiar al borrar auth user. | Depende del schema; típicamente CASCADE limpia. |
| **invoices / payments** | owner_id o user_id → auth.users | No borrados en RPC; pueden depender de CASCADE desde auth.users. | Posible hueco si no hay CASCADE; revisar FKs. |
| **guest_sessions** | Solo indirecto (branch_id de branches del owner) | RPC no toca guest_sessions. Al borrar branches, guest_sessions con esos branch_id quedan huérfanas (sin FK a branches). | **Huérfanos:** Filas con branch_id inexistente. |
| **Storage wine-bottles** | Rutas por auth.uid() (owner) | Ni RPC ni Edge borran objetos en storage. | **Huérfanos:** Objetos en wine-bottles del owner permanecen. |
| **Storage cocktail-images** | Vía cocktail_menu (CASCADE al borrar branches) | Trigger encola; process-storage-delete-queue limpia. | Ninguno si la cola se ejecuta. |
| **storage_delete_queue** | Tabla de cola | No se limpia explícitamente por owner; las filas “done” quedan. | Solo datos de cola; no crítico. |

Resumen: Borrado de cuenta owner está muy cubierto por el RPC + Edge. Huecos: **guest_sessions** huérfanas, **storage wine-bottles** no limpiado, y verificar **subscriptions / invoices / payments** (CASCADE desde auth.users).

---

## E. Riesgos de implementar borrado total sin auditoría

- **Romper borrado de sucursal desde app:** Si se añade lógica que asuma que “siempre hay RPC” o se cambia el flujo sin mantener la policy RLS y la comprobación `data.length === 1`, se podría volver a éxito falso o a bloqueos inesperados.
- **Bloqueo por users.branch_id:** Cualquier cambio que permita borrar una branch sin asegurar que ningún user tenga ese `branch_id` (reasignando o eliminando antes) puede chocar con la FK actual y fallar el delete.
- **Datos huérfanos:** guest_sessions con branch_id de branch borrada; storage wine-bottles del owner tras borrar cuenta; posiblemente filas en subscriptions/invoices/payments si no hay CASCADE correcto.
- **Duplicar lógica:** Crear un RPC `delete_branch` que repita el orden de deletes que ya hace CASCADE podría ser redundante y propenso a desincronización; mejor definir un único “contrato” (RPC que reasigne users + delete branch, o solo delete branch y documentar que CASCADE + trigger cubren el resto).
- **Sucursal principal:** Cualquier cambio que permita DELETE en branches con `is_main = true` desde la app rompería la regla de negocio; la policy RLS y la UI actual lo evitan.

---

## F. Recomendación técnica final (sin implementar aún)

### Borrado de sucursal (solo no principal)

- **Mantener** el DELETE directo desde la app con `.select('id')` y comprobación de 1 fila, y la policy RLS actual.
- **Decidir** qué hacer con usuarios asignados a esa branch:
  - **Opción A:** Antes de permitir el delete, en la app o vía RPC: reasignar todos los `users` con ese `branch_id` a la sucursal principal (o a otra), o dar error amigable “Reasigna o elimina el personal de esta sucursal antes de borrarla”.
  - **Opción B:** RPC `delete_branch(branch_id)` que: (1) compruebe `is_main = false` y `owner_id = auth.uid()`; (2) actualice `users SET branch_id = (id de sucursal principal del owner) WHERE branch_id = branch_id`; (3) opcionalmente borre o anule `guest_sessions` con ese `branch_id`; (4) `DELETE FROM branches WHERE id = branch_id`. Así el orden y las dependencias quedan en un solo sitio.
- **guest_sessions:** En migración o en el RPC anterior: o bien borrar filas con `branch_id` = la branch, o bien añadir FK a branches con ON DELETE SET NULL y columna nullable, para no dejar huérfanos.

### Borrado de cuenta owner

- **Mantener** el flujo actual: SettingsScreen → Edge delete-user-account → RPC delete_user_account.
- **Completar** si se desea borrado 100%:
  - En el RPC (o en la Edge antes del RPC): borrar o anular `guest_sessions` ligadas a branches del owner (p. ej. DELETE por branch_id IN (SELECT id FROM branches WHERE owner_id = p_user_id)).
  - En la Edge, después del RPC y antes/después de auth.admin.deleteUser: listar objetos del bucket `wine-bottles` bajo el path del owner (p. ej. `{owner_uid}/`) y borrarlos, o encolar en una cola de storage si ya existe patrón similar a cocktail-images.
- **Verificar** en el schema: que subscriptions (y si aplica invoices/payments) tengan ON DELETE CASCADE hacia auth.users donde corresponda, para que al borrar el usuario de auth no queden filas huérfanas.

### Orden sugerido

1. Corregir/cerrar huecos de **borrado de cuenta owner** (guest_sessions, storage wine-bottles, FKs subscriptions/invoices/payments).
2. Luego endurecer **borrado de sucursal**: RPC o flujo que reasigne users + opcionalmente guest_sessions, y mantener un solo camino (app → DELETE con RLS o app → invoke RPC delete_branch).

### Reaprovechar

- **delete_user_account:** Ya hace casi todo; solo añadir guest_sessions y storage wine-bottles (o cola).
- **CASCADE y trigger de cocktail_menu:** No tocar; ya cubren cocktails e imágenes por branch y por owner (al borrar branches en el RPC).
- **process-storage-delete-queue:** Patrón para limpieza de storage; wine-bottles podría encolarse en la misma cola o en una dedicada si se quiere borrado asíncrono.

---

*Auditoría completada sin modificar código; solo diagnóstico y propuesta.*
