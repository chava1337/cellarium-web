# Fix RPC delete_user_account — orden de borrado y observabilidad

## Causa raíz exacta

1. **Tasting (catas)**  
   Se borraba `tasting_responses` y **después** `tasting_wine_responses` usando una subquery sobre `tasting_responses`.  
   - `tasting_wine_responses.response_id` → FK a `tasting_responses(id)`.  
   - Al borrar antes las responses, la subquery `SELECT id FROM tasting_responses WHERE ...` ya no devuelve filas (o las filas están borradas), y además el borrado de `tasting_wine_responses` debía hacerse **antes** que el de `tasting_responses` para no violar FK.  
   - En el código anterior se usaba además la columna `tasting_response_id` en `tasting_wine_responses`; en el esquema la columna correcta es **`response_id`**.

2. **Branches / sales**  
   Se borraba `branches` y **después** `sales` con `WHERE branch_id IN (SELECT id FROM branches WHERE owner_id = p_user_id)`.  
   - Al borrar antes las branches, la subquery queda sobre una tabla ya modificada y las filas de `sales` que referencian esas branches pueden provocar fallo o comportamiento errático.  
   - La regla correcta es borrar todo lo que depende de `branch_id` (sales, sale_items, guest_sessions, qr_tokens_backup, wine_branch_stock, inventory_movements) **antes** de borrar `branches`.

3. **Observabilidad**  
   El bloque `EXCEPTION` devolvía `message` genérico y solo exponía `error`/`sqlstate` cuando `app.debug = true`, por lo que en producción la RPC devolvía `error: null`, `sqlstate: null` y no se podía ver en qué paso fallaba.

---

## Cambios aplicados (resumen)

- **Variable `v_step`:** se actualiza antes de cada bloque de borrado; en `EXCEPTION` se devuelve siempre `step`, `error` (SQLERRM) y `sqlstate` (SQLSTATE).
- **Captura de IDs al inicio (owner):**  
  `v_staff_ids`, `v_branch_ids`, `v_exam_ids`, `v_response_ids` (respuestas de staff), `v_sale_ids` (ventas por branches). No se vuelve a leer tablas ya borradas.
- **Orden catas:**  
  1) `tasting_wine_responses` por `response_id IN v_response_ids`  
  2) `tasting_responses` por `user_id IN v_staff_ids`  
  3) `tasting_exam_pdfs` por `exam_id IN v_exam_ids`  
  4) `tasting_exam_wines` por `exam_id IN v_exam_ids`  
  5) `tasting_exams` por `owner_id`
- **Orden branches / ventas:**  
  1) `sale_items` por `sale_id IN v_sale_ids`  
  2) `sales` por `branch_id IN v_branch_ids`  
  3) `guest_sessions`, `qr_tokens_backup`, `wine_branch_stock`, `inventory_movements` por `branch_id IN v_branch_ids`  
  4) `wines` por `owner_id`  
  5) `branches` por `owner_id`  
  6) `qr_tokens` por `owner_id`  
  7) `rate_limits` (por email)  
  8) `users` staff, luego owner.
- **Staff:** se capturan `v_response_ids` del usuario, se borra `tasting_wine_responses` por `response_id`, luego `tasting_responses` por `user_id`, luego el usuario en `users`.
- **Columna correcta:** en `tasting_wine_responses` se usa **`response_id`** (no `tasting_response_id`).

---

## Por qué el orden nuevo es correcto

- **Catas:**  
  `tasting_wine_responses` referencia a `tasting_responses(id)`. Primero se borran los hijos (`tasting_wine_responses` por `response_id`), luego las responses, luego los hijos de exámenes (`tasting_exam_pdfs`, `tasting_exam_wines`) y por último `tasting_exams`. Así no se viola ninguna FK.

- **Ventas y branches:**  
  `sale_items` → `sales` → `branches`; además `guest_sessions`, `qr_tokens_backup`, `wine_branch_stock`, `inventory_movements` referencian `branch_id`. Se borran primero `sale_items` (por `v_sale_ids`), luego `sales` (por `v_branch_ids`), luego el resto por `v_branch_ids`, luego `wines` (owner), luego `branches`. Así ninguna fila referenciada se borra antes que sus dependientes.

- **Staff:**  
  Se borran las respuestas de cata (wine_responses, luego responses) antes de borrar al usuario en `public.users`, respetando la FK `tasting_responses.user_id` → `users(id)`.

- **IDs capturados al inicio:**  
  Se evita depender de subqueries sobre tablas que ya fueron borradas; todos los deletes usan arrays rellenados al principio.

---

## Diff SQL (migración nueva)

Se añade la migración **`20260308000000_delete_user_account_order_and_observability.sql`**, que reemplaza la función por completo (no hay diff línea a línea contra la anterior; es reemplazo de la función). Contenido mínimo del cambio:

- `DECLARE`: añadir `v_step`, `v_staff_ids`, `v_branch_ids`, `v_exam_ids`, `v_response_ids`, `v_sale_ids`.
- Bloque inicial: `v_step := 'select_user'` y lectura del usuario.
- Owner: `v_step := 'capture_ids'` y varios `SELECT array_agg(...) INTO v_*` sin borrar nada.
- Owner: secuencia de deletes con `v_step` actualizado antes de cada uno (`tasting_wine_responses` → `tasting_responses` → `tasting_exam_pdfs` → `tasting_exam_wines` → `tasting_exams` → `sale_items` → `sales` → `guest_sessions` → `qr_tokens_backup` → `wine_branch_stock` → `inventory_movements` → `wines` → `branches` → `qr_tokens` → `rate_limits` → `users` staff).
- Staff: captura `v_response_ids`, delete `tasting_wine_responses` por `response_id`, delete `tasting_responses` por `user_id`.
- Al final: delete `users` donde `id = p_user_id`.
- `EXCEPTION`: `RETURN json_build_object('success', false, 'message', '...', 'error', SQLERRM, 'sqlstate', SQLSTATE, 'step', v_step)`.

---

## Función final completa

La función completa está en:

**`supabase/migrations/20260308000000_delete_user_account_order_and_observability.sql`**

(Incluye DECLARE con v_step y arrays, captura de IDs, todos los deletes en orden y EXCEPTION con step/error/sqlstate.)

---

## Checklist manual de validación

- [ ] **Owner – borrado completo**  
  Eliminar cuenta de un owner con staff, branches, vinos, exámenes de cata, respuestas, ventas (y sale_items), guest_sessions, qr_tokens_backup, wine_branch_stock, inventory_movements, qr_tokens, rate_limits. La RPC devuelve `success: true` y en BD no quedan filas del owner ni de sus branches/staff.

- [ ] **Owner – sin staff**  
  Owner sin usuarios staff; solo branches, vinos, exámenes. Mismo resultado: `success: true` y datos relacionados borrados.

- [ ] **Staff**  
  Eliminar cuenta de un usuario staff. Se borran sus tasting_responses y tasting_wine_responses y su fila en `users`. No se tocan datos del owner ni de otros staff.

- [ ] **Observabilidad en error**  
  Provocar un fallo (por ejemplo tabla inexistente o FK en otro orden simulada). Comprobar que la respuesta incluye `success: false`, `message`, `error` (SQLERRM), `sqlstate` (SQLSTATE) y `step` con el nombre del paso donde falló.

- [ ] **Edge delete-user-account**  
  Llamar al flujo completo desde la app (eliminar cuenta). La Edge llama a la RPC; si la RPC devuelve `success: true`, la Edge sigue con storage y auth; si devuelve `success: false`, la Edge devuelve el JSON al cliente. Comprobar que el cliente recibe el mensaje (y si aplica, step/error/sqlstate para depuración).

- [ ] **Sin regresiones**  
  No se modifican CORS, autenticación, limpieza de storage ni borrado en auth.users; solo la RPC y el orden/persistencia de borrado en public.
