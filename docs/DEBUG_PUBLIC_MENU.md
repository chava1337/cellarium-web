# Diagnóstico: public-menu 404

Pasos para verificar por qué `public-menu` devuelve 404 y dejar evidencia con SQL + script de test.

---

## A) Verificar en la base de datos (SQL)

Ejecuta las queries en **Supabase Dashboard → SQL Editor** (mismo proyecto que la Edge Function).

**Archivo:** `docs/debug_public_menu.sql`

1. **Buscar el token exacto**  
   Si la query no devuelve filas, el token no existe en `qr_tokens` → 404 esperado.

2. **Últimos 20 tokens guest**  
   Para ver tokens válidos y un `branch_id` que puedas usar.

3. **Branch del token**  
   Si el token existe, comprueba que la branch exista y tenga `owner_id`.

4. **Listar branches**  
   Para elegir `branch_id` (y `owner_id`) si vas a crear un token de prueba.

5. **Insert manual de token de prueba**  
   En el SQL hay un bloque comentado para insertar el token `2203ebdc8295fb46db80f17fe3db5f575` (o el que quieras) con `expires_at = now() + 7 days`, `max_uses = 100`, `current_uses = 0`. Sustituye los UUIDs por un `branch_id` y `owner_id` reales obtenidos de la query 4.

---

## B) Probar el endpoint desde el repo (Node)

### Requisitos

- Node 18+ (o el que use el repo).
- Variable de entorno `SUPABASE_ANON_KEY` (clave anon del proyecto).

### Cómo correr

```bash
# Desde la raíz del repo
export SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
node scripts/test-public-menu.mjs 2203ebdc8295fb46db80f17fe3db5f575
```

Con otro token:

```bash
node scripts/test-public-menu.mjs <TOKEN>
```

URL por defecto (se puede sobreescribir):

```bash
export SUPABASE_REF_URL=https://sejhpjfzznskhmbifrum.supabase.co
export SUPABASE_ANON_KEY=eyJ...
node scripts/test-public-menu.mjs 2203ebdc8295fb46db80f17fe3db5f575
```

### Qué hace el script

1. **Health check**  
   `GET ${SUPABASE_REF_URL}/rest/v1/branches?select=id&limit=1` con `apikey` y `Authorization: Bearer <ANON_KEY>`.  
   - Si falla: ref o anon key no corresponden al proyecto (o red/URL incorrecta).  
   - Si responde 200: mismo proyecto y clave correcta.

2. **Llamada a public-menu**  
   `GET ${SUPABASE_REF_URL}/functions/v1/public-menu?token=<TOKEN>` con los mismos headers.  
   - Imprime `status` y cuerpo (JSON formateado si la respuesta es JSON).

### Output esperado

**Health OK (mismo proyecto):**

```
Supabase Ref URL: https://sejhpjfzznskhmbifrum.supabase.co
Token (argv o default): 2203ebdc...

--- 1) Health: REST /rest/v1/branches ---
Status: 200 OK

--- 2) GET /functions/v1/public-menu?token=... ---
Status: 200 OK
Body: {
  "branch": { "id": "...", "name": "...", "address": "..." },
  "wines": [ ... ]
}
```

**Token inexistente o inválido (404/400):**

```
--- 2) GET /functions/v1/public-menu?token=... ---
Status: 404 FAIL
Body: { "error": "invalid_token" }
```

**Health FAIL (ref/key incorrectos):**

```
--- 1) Health: REST /rest/v1/branches ---
Status: 401 FAIL
El ref/anon key no corresponden al proyecto o la URL es incorrecta.
```

Si el health pasa y `public-menu` sigue en 404, el token no está en `qr_tokens` o la función no está desplegada en ese proyecto. Usa `docs/debug_public_menu.sql` para comprobar el token y, si hace falta, crear uno de prueba con el insert comentado.
