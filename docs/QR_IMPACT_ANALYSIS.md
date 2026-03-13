# Análisis de impacto: endurecer RLS en qr_tokens y flujos QR

**Objetivo:** Cerrar el leak de SELECT público en `qr_tokens` (actualmente `OR expires_at > now()` permite a anon leer todos los tokens no expirados) sin romper flujos de invitación staff ni comensales/guest.  
**Restricción:** Solo análisis y documentación; no se implementan cambios en RLS ni en producción.

---

## 1. Inventario: dónde se lee/escribe `qr_tokens`

### 1.1 App (React Native / Expo)

| Ubicación | Operación | Tipo token | Campos usados | ¿Lee tokens ya existentes? |
|-----------|-----------|------------|---------------|-----------------------------|
| **src/services/QrTokenService.ts** | SELECT + UPDATE + (qr_scans INSERT) | guest, admin_invite | token, type, branch_id, expires_at, used, current_uses, max_uses, id, branches.* | Sí. `.eq('token', token).single()` para validar; luego UPDATE por id. |
| **src/services/QrGenerationService.ts** | INSERT (admin_invite), SELECT (listar) | admin_invite, guest (vía RPC) | token, type, branch_id, created_by, owner_id, expires_at, max_uses, current_uses, used; creador | Sí. `getUserQrTokens(userId)` → `.eq('created_by', userId)`. |
| **src/services/QrGenerationService.ts** | UPDATE (revoke) | cualquiera | expires_at, id | Sí. Por tokenId (owner solo por RLS). |
| **src/services/QrTokenService.ts** | UPDATE (markQrAsUsed) | admin_invite | used, used_at, token | Sí. Por token. |

**RPC desde app:**

| RPC | Archivo que invoca | Escribe/Lee qr_tokens |
|-----|--------------------|------------------------|
| **create_guest_qr_token** | QrGenerationService.ts | INSERT (SECURITY DEFINER, bypasea RLS con owner_id del branch). |
| **generate_qr_token** | QrGenerationService.ts (no usado en snippet; generateUniqueToken puede ser RPC) | Solo genera string único; el INSERT es desde app a qr_tokens. |

### 1.2 Edge Functions

| Edge | Operación | Tipo token | Campos | ¿Lee existentes? |
|------|-----------|------------|--------|-------------------|
| **supabase/functions/public-menu/index.ts** | SELECT | solo guest | id, token, type, branch_id, expires_at, max_uses, current_uses | Sí. Por token con **service_role** (no RLS). |
| **supabase/functions/user-created/index.ts** | SELECT | admin_invite | owner_id, branch_id | Sí. Por token con **service_role**. |

### 1.3 SQL / Migraciones / RPC

| Ubicación | Operación | Tipo | Campos / Notas |
|-----------|-----------|------|----------------|
| **create_staff_user(p_user_id, p_email, p_name, p_qr_token, ...)** | SELECT | admin_invite | owner_id, branch_id FROM qr_tokens WHERE token = p_qr_token AND expires_at > NOW(). SECURITY DEFINER. |
| **handle_new_user (trigger auth.users)** | (lectura implícita en lógica) | - | user-created Edge lee qr_tokens; el trigger no toca qr_tokens directamente. |
| **create_guest_qr_token RPC** | INSERT | guest | token, type, branch_id, created_by, owner_id, expires_at, max_uses, current_uses, used. SECURITY DEFINER. |
| **delete_user_account RPC** | DELETE | - | DELETE FROM qr_tokens WHERE owner_id = p_user_id. |

### 1.4 Tabla `qr_scans`

| Ubicación | Relación con qr_tokens |
|-----------|------------------------|
| QrTokenService.validateQrToken | INSERT qr_scans (qr_token_id, success) después de validar. |
| QrGenerationService.getTokenScanStats | SELECT qr_scans WHERE qr_token_id = tokenId (requiere ver el token; hoy por created_by en qr_tokens). |

---

## 2. Mapa de flujo end-to-end por tipo

### A) QR invitación staff (1 uso)

```
Owner/gerente en app (QrGenerationScreen)
  → generateQrToken({ type: 'admin_invite', branchId, createdBy, ownerId, maxUses: 1 })
  → INSERT qr_tokens (authenticated, policy "Owners can create qr_tokens": auth.uid() = owner_id)
  → generateUniversalQrUrl / generateDeepLink → QR impreso/compartido (URL web o cellarium://qr/...)

Comensal/staff escanea QR
  → Abre web o app (deep link)
  → App: QrProcessorScreen obtiene token de params/URL
  → validateQrToken(token) → SELECT qr_tokens (anon: permitido por expires_at > now())
  → Si type === 'admin_invite' y used → error "ya utilizado"
  → INSERT qr_scans, UPDATE qr_tokens (current_uses+1, used=true para admin_invite)
  → navigation.replace('AdminRegistration', { qrToken, branchName, branchId })

AdminRegistration
  → signUp con metadata { qrToken, invitationType: 'admin_invite' }
  → Auth → user-created Edge (service_role) lee qr_tokens por token → owner_id, branch_id → insert public.users (staff, pending)
  → O bien create_staff_user RPC (desde app) con p_qr_token → SELECT qr_tokens (SECURITY DEFINER) → insert users
```

**Dependencias críticas:**  
- App: SELECT y UPDATE en `qr_tokens` con cliente anon o authenticated. Si eliminamos `expires_at > now()` para anon, el SELECT falla y el flujo staff en app se rompe.  
- RPC create_staff_user y Edge user-created no dependen de RLS (SECURITY DEFINER / service_role).

### B) QR comensales/guest (1 uso o N usos)

```
Owner/gerente en app (QrGenerationScreen, tipo Comensales)
  → createGuestQrToken(branchId, duration, maxUses) → RPC create_guest_qr_token (SECURITY DEFINER)
  → INSERT qr_tokens (type 'guest') desde RPC
  → URL/QR con { type: 'guest', token, branchId, branchName }

Comensal escanea
  → Opción 1 – Web: visualizador Vercel abre GET /functions/v1/public-menu?token=...
  → public-menu Edge (service_role): SELECT qr_tokens por token, type === 'guest', expires, max_uses/current_uses → SELECT branches, wine_branch_stock+wines → responde JSON.
  → Opción 2 – App: QrProcessorScreen → validateQrToken(token) → SELECT qr_tokens (anon) + UPDATE (current_uses, used para admin; guest no marca used en lógica actual)
  → navigation.replace('WineCatalog', { isGuest: true, branchId })
  → WineCatalogScreen: WineService.getWinesByBranch(branchId, ownerId) → SELECT wine_branch_stock (anon)
  → RLS wine_branch_stock: policy "guests_can_view_public_stock" permite SELECT si branch_id IN (SELECT branch_id FROM qr_tokens WHERE type='guest' AND expires_at>now() AND (used=false OR used IS NULL))
  → Esa subquery corre como anon → RLS qr_tokens aplica → anon solo ve filas con (auth.uid()=owner_id) OR (expires_at>now()) → efectivamente ve todos los guest no expirados.
```

**Dependencias críticas:**  
- **Web:** public-menu no depende de RLS (service_role).  
- **App guest:** (1) validateQrToken necesita SELECT en qr_tokens (hoy anon por expires_at > now()). (2) getWinesByBranch como anon depende de la policy guests_can_view_public_stock, que hace subquery a qr_tokens; si anon ya no puede leer qr_tokens, esa subquery devuelve vacío y el guest no ve stock.

### C) Otros usos de QR

- **Listar “mis” QRs generados:** getUserQrTokens(userId) → SELECT qr_tokens WHERE created_by = userId (authenticated, owner_id en filas propias; policy "Owners can view" también permite expires_at > now() para otros, pero el filtro es created_by).  
- **Revocar:** revokeQrToken(tokenId) → UPDATE qr_tokens (solo owner por RLS).  
- **Estadísticas de escaneos:** getTokenScanStats(tokenId) → SELECT qr_scans; el tokenId lo tiene quien ya tiene el token (lista de QRs del usuario).

---

## 3. RLS actual y efecto de endurecer

### 3.1 Políticas en `qr_tokens` (20260207213838_remote_schema.sql)

- **SELECT – "Owners can view their qr_tokens"**  
  `USING ((auth.uid() = owner_id) OR (expires_at > now()))`  
  → Con anon, `auth.uid()` es null, solo cuenta `expires_at > now()`: **cualquier token no expirado es visible por anon**.  
- **INSERT** – "Owners can create qr_tokens": `WITH CHECK (auth.uid() = owner_id)`.  
- **UPDATE** – "Owners can update their qr_tokens": `USING (auth.uid() = owner_id)`.  
- **DELETE** – "Owners can delete their qr_tokens": `USING (auth.uid() = owner_id)`.

Si cambiamos SELECT a **solo owner/staff** (por ejemplo `auth.uid() = owner_id` o rol staff del branch) y **quitamos** `OR (expires_at > now())`:

- **App – validateQrToken:** Cliente anon (o sin JWT de ese owner) ya no vería la fila → "Código QR no encontrado o inválido". **Rompe** validación en app para guest y staff.
- **App – getUserQrTokens:** Usuario autenticado con created_by = userId; si las filas son de owner_id = auth.uid(), siguen visibles. Si en algún caso created_by ≠ owner_id, depende del modelo; normalmente owner crea, así que **puede** seguir bien.
- **wine_branch_stock – guests_can_view_public_stock:** La policy usa  
  `branch_id IN (SELECT qr_tokens.branch_id FROM qr_tokens WHERE type='guest' AND expires_at>now() AND (used=false OR used IS NULL))`.  
  Esa subquery se ejecuta con el rol del cliente (anon). Si anon ya no puede leer qr_tokens, el subquery devuelve 0 filas → **anon no vería ningún wine_branch_stock** por esta policy. **Rompe** carga de menú guest en app (WineService.getWinesByBranch como anon).

### 3.2 Política `guests_can_view_public_stock` (wine_branch_stock)

```sql
create policy "guests_can_view_public_stock"
on "public"."wine_branch_stock"
for select to public
using ((branch_id IN (
  SELECT qr_tokens.branch_id
  FROM qr_tokens
  WHERE qr_tokens.type = 'guest'
    AND qr_tokens.expires_at > now()
    AND (qr_tokens.used = false OR qr_tokens.used IS NULL)
)));
```

- Dependencia “silenciosa”: el SELECT a `wine_branch_stock` en modo guest (anon) **depende por completo** de que el rol que hace la query pueda leer `qr_tokens` con esa condición. Cualquier endurecimiento de qr_tokens que impida a anon leer esas filas **rompe** esta policy para anon.

### 3.3 Resumen de impacto al endurecer qr_tokens SELECT

| Qué se rompe | Cómo |
|--------------|------|
| Validación QR en app (guest y staff) | anon ya no puede SELECT qr_tokens por token. |
| Carga de menú guest en app (WineCatalog) | guests_can_view_public_stock hace subquery a qr_tokens; anon sin lectura → 0 filas en wine_branch_stock. |
| Lo que **no** se rompe | public-menu (Edge con service_role), create_staff_user (RPC SECURITY DEFINER), user-created (service_role), create_guest_qr_token (RPC SECURITY DEFINER). |

---

## 4. Dependencias silenciosas y alternativas

- **Policy wine_branch_stock "guests_can_view_public_stock":** Depende de que el cliente que hace SELECT a wine_branch_stock pueda ejecutar el subquery a qr_tokens. Hoy ese cliente es anon en el flujo guest en app.
- **Cualquier otra consulta** que use “branch_id en algún token guest válido” como condición y corra como anon tendría el mismo problema.

Para no depender de que anon lea qr_tokens:

- **Opción A – Edge resolve-qr + sesión temporal:**  
  La app (y en su caso la web) no hace SELECT a qr_tokens. Llama a una Edge (o RPC) que con service_role: valida token, comprueba type/expires/uses, opcionalmente marca uso, crea/actualiza una fila en `guest_sessions` (o similar) y devuelve branch_id, owner_id, type y un identificador de sesión (o JWT corto). El cliente guarda ese identificador y lo envía en siguientes requests. La policy de wine_branch_stock para guest podría ser “solo si hay una guest_session válida para ese branch_id” (leyendo guest_sessions con un criterio que no dependa de qr_tokens para anon), o el menú guest se sirve solo vía Edge (como ya hace public-menu).
- **Opción B – Edge resolve-qr + JWT/nonce en memoria:**  
  Edge valida token y devuelve un JWT (o nonce) de corta duración que incluye branch_id (y si aplica owner_id). El cliente usa ese JWT en header (ej. Authorization o X-Guest-Token). Una RPC o policy que valide ese JWT (con secret compartido o JWKS) podría autorizar SELECT a wine_branch_stock para ese branch. No hay tabla guest_sessions; la “sesión” es el JWT. Coste: implementar validación JWT en backend (RPC/Edge) y en cliente (guardar y enviar token).

---

## 5. Riesgos (P0/P1/P2)

| ID | Riesgo | Impacto | Probabilidad | Severidad |
|----|--------|---------|--------------|-----------|
| P0 | Cambiar solo qr_tokens SELECT (quitar anon/expires_at) sin sustituir por resolve-qr | App: validación QR y menú guest dejan de funcionar para anon | Cierta si se despliega | Crítico |
| P0 | Cambiar qr_tokens y no ajustar wine_branch_stock | Guest en app no ve stock (subquery vacío) | Cierta | Crítico |
| P1 | Edge resolve-qr no marca “used” o no incrementa current_uses | Tokens reutilizables, desvío de “1 uso” | Media si no se implementa en la Edge | Alto |
| P1 | Flujo web (public-menu) deja de recibir token válido (ej. tipo o formato) | Menú web guest no carga | Baja si no se toca public-menu | Alto |
| P2 | Listado de QRs del usuario (getUserQrTokens) deja de ver filas | Owner no ve sus QRs generados | Baja si policy sigue permitiendo owner_id = auth.uid() | Medio |
| P2 | create_staff_user o user-created no reciben token válido (formato/expiración) | Invitación staff falla | Baja (RPC/Edge no dependen de RLS) | Medio |

---

## 6. Plan de migración en 2 fases (sin romper)

### Fase 1 – Instrumentación y “shadow path”

- Objetivo: Mantener comportamiento actual y agregar observabilidad.
- Acciones:
  1. En **QrTokenService.validateQrToken**: añadir log (solo __DEV__ o sin PII) con prefijo `[QR_VALIDATE]`: resultado (valid/invalid), tipo (guest/admin), sin token ni IDs completos (ej. últimos 4 caracteres del token).
  2. En **public-menu** Edge: log con prefijo `[PUBLIC_MENU]`: token recibido (solo últimos 4), type, branch_id (suffix), resultado (ok/invalid/expired/limit).
  3. En **QrGenerationService** (createGuestQrToken, generateQrToken, getUserQrTokens): log genérico de operación (create/list/revoke) sin tokens.
  4. Documentar en este doc o en QR_TEST_CHECKLIST.md qué logs revisar para cada flujo.
- No cambiar políticas RLS ni sustituir SELECT por Edge en esta fase.

### Fase 2 – Cortar acceso público y resolver vía Edge

- Objetivo: Que anon ya no lea qr_tokens; validación y datos guest pasan por Edge (o RPC) con service_role.
- Acciones propuestas (orden sugerido):
  1. Implementar Edge **resolve-qr** (o RPC equivalente SECURITY DEFINER): recibe token; con service_role lee qr_tokens, valida type/expires/uses, opcionalmente actualiza used/current_uses; devuelve { branch_id, owner_id, type, ... } (y opcionalmente session_id o JWT).
  2. En la app (QrProcessorScreen / QrTokenService): sustituir llamada a validateQrToken (SELECT directo) por invoke a resolve-qr (o RPC). Si respuesta “used” o “expired”, mostrar UI “Generar nuevo QR” / “Solicitar nuevo QR”.
  3. Para **guest en app**: o bien (a) WineCatalog en modo guest obtiene datos solo vía public-menu (o una Edge similar) con el token guardado, sin SELECT a wine_branch_stock desde cliente; o (b) resolve-qr devuelve un session_id/JWT y se añade mecanismo (guest_sessions o JWT) para que una policy de wine_branch_stock permita SELECT solo para ese branch sin subquery a qr_tokens.
  4. Ajustar policy **guests_can_view_public_stock**: eliminar dependencia del subquery a qr_tokens para anon; reemplazar por criterio basado en guest_sessions o en un RPC que verifique token/sesión (por ejemplo SELECT permitido solo si existe fila en guest_sessions para ese branch_id y no expirada).
  5. Por último, endurecer **qr_tokens** SELECT: quitar `OR (expires_at > now())` y restringir a `auth.uid() = owner_id` (y si se desea, staff del branch con policy adicional). Así anon ya no lee qr_tokens.

---

## 7. Diff plan (recomendaciones, sin aplicar)

### 7.1 Edge `resolve-qr` (o RPC equivalente)

- Entrada: token (query param o body).
- Con **service_role**: SELECT qr_tokens WHERE token = ?.
- Validar: existe, type in ('guest','admin_invite'), expires_at > now(), para admin_invite used = false, current_uses < max_uses.
- Opcional: INSERT qr_scans; UPDATE qr_tokens (current_uses+1, used=true si admin_invite).
- Respuesta: { valid, branch_id, owner_id, type, branch_name, ... } o { error: 'invalid_token'|'token_expired'|'token_used'|'limit_exceeded' }.
- Logs seguros: prefijo `[RESOLVE_QR]`, resultado, type, branch_id suffix; sin token completo ni PII.

### 7.2 Cliente (pantalla QR / QrProcessor)

- En lugar de `validateQrToken(token)` (SELECT + UPDATE directos a qr_tokens), llamar a **resolve-qr** con el token.
- Si respuesta válida: misma navegación que hoy (WineCatalog guest o AdminRegistration staff).
- Si error (used / expired / invalid): mostrar mensaje “Este código ya fue usado” / “Expirado” / “Inválido” y CTA “Generar nuevo QR” o “Solicitar nuevo QR al restaurante”.

### 7.3 wine_branch_stock – alternativa a subquery qr_tokens

- **Opción recomendada (alineada con 1 uso):** No permitir SELECT anon a wine_branch_stock para guest basado en “cualquier token guest válido”. Opciones:
  - **A)** Menú guest en app se carga solo vía **public-menu** (o Edge similar) con el token en la URL/body; el cliente no hace SELECT a wine_branch_stock. La policy guests_can_view_public_stock podría quedar solo para compatibilidad web que siga usando public-menu (y la Edge ya usa service_role para stock).
  - **B)** Resolver token una vez con resolve-qr; crear fila en **guest_sessions** (branch_id, qr_token_id, session_start, TTL); policy wine_branch_stock: SELECT para anon solo si existe guest_session válida para ese branch_id (y opcionalmente mismo token). Requiere que anon pueda leer guest_sessions con una condición acotada (ej. por session_id en cookie/header).
- Para no tocar mucho la app actual, la opción más segura es **A**: en modo guest en app, cargar menú llamando a public-menu (o una Edge que devuelva lo mismo) con el token; no usar WineService.getWinesByBranch directo como anon.

### 7.4 Staff – dónde se valida y dónde se marca used

- **Validación:** En app con validateQrToken (hoy SELECT qr_tokens); en futuro con resolve-qr. En backend: create_staff_user (RPC) y user-created (Edge) leen qr_tokens con privilegios elevados.
- **Marcar used:** Hoy en QrTokenService.validateQrToken (UPDATE qr_tokens, used=true y used_at para admin_invite). En el plan con resolve-qr, la Edge (o RPC) debe hacer ese UPDATE al resolver un token admin_invite para mantener “1 uso”.

---

## 8. Checklist de pruebas manuales (mínimo 12 casos)

Ver **docs/QR_TEST_CHECKLIST.md** (creado junto con este documento) con al menos:

1. Owner genera QR guest; comensal escanea; stock carga; token marcado/contador incrementado.
2. Re-escanear mismo QR guest (según política: N usos o 1 uso) → comportamiento esperado (éxito o “límite alcanzado”).
3. Token guest expirado → error claro; UI “Solicitar nuevo QR”.
4. Owner/gerente genera QR invitación staff; staff escanea; llega a AdminRegistration; completa registro; token marcado used.
5. Reutilizar mismo QR staff → “Este código ya fue utilizado”.
6. Token staff expirado → error “expirado”.
7. Owner puede regenerar QR (nuevo token); nuevo QR funciona.
8. En app, guest tras validar → WineCatalog muestra vinos del branch correcto.
9. Web: GET public-menu?token=<guest_token> → 200 y JSON branch + wines.
10. Web: GET public-menu?token=<staff_token> → 400 (solo guest).
11. Listado “Mis QRs” (getUserQrTokens): owner ve sus tokens; revocar uno y comprobar que no aparece como válido al escanear.
12. Logs: tras cada flujo, comprobar en consola/Edge logs que aparecen prefijos acordados ([QR_VALIDATE], [PUBLIC_MENU], etc.) sin tokens completos ni PII.

---

## 9. Diseños alternativos (evaluación breve)

### Diseño 1: Edge resolve-qr + guest_sessions + stock solo con sesión

- Flujo: resolve-qr valida token, crea/actualiza guest_sessions (branch_id, qr_token_id, TTL), devuelve session_id; cliente envía session_id (cookie o header); policy wine_branch_stock permite SELECT anon solo si existe guest_session válida para ese branch.
- Pros: Sesión explícita en BD, auditable. Contras: Requiere que anon lea guest_sessions de forma controlada (policy estricta); más tablas y flujo.

### Diseño 2: Edge resolve-qr + JWT/nonce en memoria

- Flujo: resolve-qr devuelve JWT con branch_id (y opcionalmente owner_id); cliente lo guarda y lo envía en header; RPC o Edge intermedia que valida JWT y devuelve datos de menú, o policy que no use qr_tokens (menú guest solo vía Edge).
- Pros: Sin tabla guest_sessions; stateless. Contras: Validación JWT en backend; manejo de refresh/expiración en cliente (Expo/React Native).

Recomendación: Para **no romper** y menor cambio en cliente, mantener menú guest en app vía **llamada a public-menu (o Edge equivalente)** con el token; no depender de SELECT anon a wine_branch_stock. Así la policy guests_can_view_public_stock puede relajarse o eliminarse para anon sin afectar el flujo guest en app si este ya no hace ese SELECT.

---

*Documento generado como análisis únicamente; no se han aplicado cambios en RLS, Edge ni cliente.*
