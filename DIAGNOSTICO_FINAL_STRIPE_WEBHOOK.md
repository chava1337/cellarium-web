# DIAGNÓSTICO FORENSE COMPLETO: Stripe Webhook HTTP 401

**Fecha:** 2025-01-27  
**Problema:** Stripe recibe HTTP 401 y Supabase no muestra logs, indicando bloqueo antes de ejecutar código.

---

## RESUMEN EJECUTIVO

El webhook `stripe-webhook` está configurado correctamente en el código (sin CORS, sin Authorization Bearer, con `deno.json` con `verify_jwt: false`). Sin embargo, Stripe sigue recibiendo HTTP 401, lo que indica que Supabase Edge Functions está bloqueando el request en el gateway ANTES de ejecutar el código. La causa raíz más probable es que **el archivo `deno.json` no está siendo respetado por Supabase** o **la función no fue desplegada correctamente** después de crear el `deno.json`.

---

## 1. VERIFICACIÓN DE ARCHIVOS Y RUTAS

### ✅ Archivo Principal
- **Ruta:** `supabase/functions/stripe-webhook/index.ts`
- **Estado:** EXISTE
- **Líneas:** 463
- **Evidencia:**
  - No tiene validación de `Authorization Bearer`
  - No tiene CORS headers
  - No maneja OPTIONS
  - Solo verifica `stripe-signature` header
  - Responde siempre 200 si la firma es válida

### ✅ Archivo de Configuración
- **Ruta:** `supabase/functions/stripe-webhook/deno.json`
- **Estado:** EXISTE
- **Contenido:**
```json
{
  "verify_jwt": false
}
```
- **Evidencia:** El archivo contiene exactamente `{ "verify_jwt": false }` como se requiere.

### ❌ Comparación con Otras Funciones
- **create-checkout-session:** NO tiene `deno.json` (requiere JWT)
- **create-portal-session:** NO tiene `deno.json` (requiere JWT)
- **update-subscription:** NO tiene `deno.json` (requiere JWT)
- **stripe-webhook:** ✅ SÍ tiene `deno.json` con `verify_jwt: false`

**Conclusión:** Solo `stripe-webhook` tiene `deno.json`, lo cual es correcto.

---

## 2. VERIFICACIÓN DE DEPLOY

### ⚠️ NO VERIFICABLE DESDE EL REPO

**Evidencia encontrada:**
- No existe archivo `.supabase/config.toml` en el repo
- No existe archivo `supabase/config.toml` en el repo
- No hay evidencia de comandos de deploy en el historial del repo
- No hay archivos de configuración de Supabase CLI

**Posibles problemas:**
1. La función `stripe-webhook` fue desplegada ANTES de crear el `deno.json`
2. El `deno.json` fue creado pero la función NO fue redesplegada
3. El deploy se hizo a un proyecto Supabase diferente
4. Hay múltiples proyectos Supabase vinculados y se desplegó al incorrecto

**Recomendación:** Verificar manualmente en Supabase Dashboard:
- Ir a Edge Functions → `stripe-webhook`
- Verificar fecha de último deploy
- Comparar con fecha de creación/modificación del `deno.json`

---

## 3. VERIFICACIÓN DE CONFIGURACIÓN DE SUPABASE

### ✅ No hay Override Global

**Evidencia:**
- No existe `supabase/config.toml`
- No existe `.supabase/config.toml`
- No hay archivos de configuración global de Supabase en el repo
- No hay referencias a `verify_jwt` en otros archivos del repo

**Conclusión:** No hay configuración global que pueda estar forzando `verify_jwt=true`.

---

## 4. VERIFICACIÓN DE ENDPOINT

### ⚠️ NO VERIFICABLE DESDE EL REPO

**Información requerida (no disponible en repo):**
- URL exacta del webhook configurada en Stripe Dashboard
- URL de la función generada por Supabase
- Formato esperado: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`

**Posibles problemas:**
1. URL en Stripe tiene trailing slash (`/stripe-webhook/` vs `/stripe-webhook`)
2. URL apunta a un proyecto Supabase diferente
3. URL tiene un typo en el nombre de la función
4. Stripe está en TEST MODE pero el endpoint es de PRODUCTION (o viceversa)

**Recomendación:** Verificar manualmente:
- En Stripe Dashboard → Webhooks → Verificar URL exacta
- En Supabase Dashboard → Edge Functions → `stripe-webhook` → Copiar Function URL
- Comparar ambas URLs carácter por carácter

---

## 5. VERIFICACIÓN DE HEADERS ESPERADOS VS RECIBIDOS

### Headers que Stripe Envía (según documentación oficial):
```
POST /functions/v1/stripe-webhook HTTP/1.1
Host: <project-ref>.supabase.co
Content-Type: application/json
Stripe-Signature: t=1234567890,v1=abc123...
User-Agent: Stripe/1.0
```

**NO incluye:**
- `Authorization: Bearer <token>`
- `apikey` header

### Headers que Supabase Edge Functions Exige (por defecto):
- **Con `verify_jwt: true` (default):** Requiere `Authorization: Bearer <JWT>` o `apikey` header
- **Con `verify_jwt: false`:** NO requiere ningún header de autenticación

### Análisis del Código:
**Línea 53-63:** El handler acepta solo POST, no valida Authorization  
**Línea 67:** Lee `rawBody` con `req.text()`  
**Línea 70:** Lee `stripe-signature` header  
**Línea 98:** Verifica firma Stripe manualmente  

**Conclusión:** El código NO espera `Authorization Bearer`. Si Supabase está bloqueando con 401, es porque el gateway está aplicando `verify_jwt: true` a pesar del `deno.json`.

---

## 6. PRUEBA LOCAL / SIMULADA

### Comando curl Mínimo para Probar:

```bash
# Simular webhook de Stripe (sin firma válida, solo para probar que llega al handler)
curl -X POST https://<project-ref>.supabase.co/functions/v1/stripe-webhook \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: t=1234567890,v1=test" \
  -d '{"type":"test.event","id":"evt_test"}'
```

### Respuesta Esperada:
- **Si `deno.json` funciona:** HTTP 400 con `{"error":"Invalid signature"}` (llega al handler)
- **Si `deno.json` NO funciona:** HTTP 401 con `{"message":"JWT expired"}` o similar (bloqueado en gateway)

### Respuesta Real:
**NO VERIFICABLE** - Requiere ejecutar el comando manualmente.

---

## 7. CONCLUSIÓN OBLIGATORIA

### CAUSA RAÍZ ÚNICA: **C) verify_jwt=false no está siendo aplicado**

**Razón:**
1. El código está correcto (no valida Authorization Bearer)
2. El `deno.json` existe y tiene el contenido correcto
3. No hay configuración global que lo sobrescriba
4. El HTTP 401 ocurre ANTES de ejecutar código (no hay logs)
5. Esto solo puede significar que Supabase Edge Functions está ignorando el `deno.json`

**Causas posibles:**
- La función fue desplegada ANTES de crear el `deno.json` y NO fue redesplegada
- El `deno.json` no está siendo incluido en el bundle de deploy
- Hay un bug en Supabase Edge Functions que ignora `deno.json` en ciertas condiciones
- El deploy se hizo con un método que no incluye `deno.json` (ej: deploy manual sin CLI)

---

## RECOMENDACIÓN EXACTA Y MÍNIMA

### ACCIÓN ÚNICA REQUERIDA:

**Redesplegar la función `stripe-webhook` usando Supabase CLI para asegurar que el `deno.json` sea incluido en el bundle:**

```bash
# Desde la raíz del proyecto
supabase functions deploy stripe-webhook
```

**Verificación post-deploy:**
1. Ir a Supabase Dashboard → Edge Functions → `stripe-webhook`
2. Verificar que la fecha de "Last updated" sea reciente
3. Probar con curl (comando de la sección 6)
4. Verificar que ahora responde 400 (invalid signature) en vez de 401 (JWT expired)

**Si después del redeploy sigue fallando:**
- Verificar que el `deno.json` esté en el bundle desplegado (Supabase Dashboard → Ver código fuente)
- Contactar soporte de Supabase con el issue
- Considerar usar `supabase functions deploy stripe-webhook --no-verify-jwt` (si existe esta flag)

---

## CHECKLIST DE VERIFICACIÓN

- ✅ `supabase/functions/stripe-webhook/index.ts` existe y es correcto
- ✅ `supabase/functions/stripe-webhook/deno.json` existe con `verify_jwt: false`
- ✅ No hay configuración global que sobrescriba `verify_jwt`
- ✅ El código no valida Authorization Bearer
- ✅ El código no usa CORS
- ⚠️ **NO VERIFICABLE:** Fecha de deploy vs fecha de creación de `deno.json`
- ⚠️ **NO VERIFICABLE:** URL del webhook en Stripe vs URL de la función
- ⚠️ **NO VERIFICABLE:** Si el `deno.json` está en el bundle desplegado

---

## EVIDENCIA CONCRETA

### Archivos Relevantes:
1. `supabase/functions/stripe-webhook/index.ts` (463 líneas)
2. `supabase/functions/stripe-webhook/deno.json` (3 líneas: `{ "verify_jwt": false }`)

### Archivos NO Encontrados (lo cual es correcto):
- `supabase/config.toml` (no existe, correcto)
- `.supabase/config.toml` (no existe, correcto)
- `deno.json` en otras funciones (correcto, solo stripe-webhook lo necesita)

### Líneas Clave del Código:
- **Línea 53:** Handler principal (`serve(async (req) => {`)
- **Línea 55:** Solo acepta POST
- **Línea 67:** Lee rawBody (no valida JWT)
- **Línea 70:** Lee stripe-signature header
- **Línea 98:** Verifica firma Stripe (no JWT)

---

**FIN DEL REPORTE**

