# 🔍 DIAGNÓSTICO FORENSE: Node Polyfills en Supabase Edge Functions

**Fecha:** 2024-12-19  
**Error:** `event loop error: Deno.core.runMicrotasks() is not supported in this environment`  
**Stack trace apunta a:** `deno.land/std@0.177.1/node/_core.ts`, `_next_tick.ts`, `process.ts`

---

## 📋 RESUMEN EJECUTIVO

El error se origina por **dependencias transitivas del SDK de Stripe** que introducen polyfills de Node.js (`std@*/node/*`) en el runtime de Deno de Supabase Edge Functions.

**Archivos afectados:**
- ✅ `create-checkout-session/index.ts` - **YA CORREGIDO** (usa REST directo)
- ✅ `create-portal-session/index.ts` - **YA CORREGIDO** (usa REST directo)
- ❌ `stripe-webhook/index.ts` - **PROBLEMA DETECTADO** (usa Stripe SDK)
- ❌ `update-subscription/index.ts` - **PROBLEMA DETECTADO** (usa Stripe SDK)

---

## 🔬 FASE 1: ANÁLISIS POR ARCHIVO

### 1.1 `supabase/functions/create-checkout-session/index.ts`

**Imports directos:**
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3?target=deno';
```

**Análisis:**
- ✅ NO usa Stripe SDK
- ✅ Usa REST directo con `fetch`
- ✅ `serve` desde `deno.land/std@0.168.0` (compatible)
- ✅ `@supabase/supabase-js` con `?target=deno` (compatible)
- ✅ NO hay imports de `node:*`, `npm:`, `std@*/node/*`

**Veredicto:** ✅ **SIN PROBLEMAS** - Ya migrado a REST

---

### 2. `supabase/functions/create-portal-session/index.ts`

**Imports directos:**
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3?target=deno';
```

**Análisis:**
- ✅ NO usa Stripe SDK
- ✅ Usa REST directo con `fetch`
- ✅ `serve` desde `deno.land/std@0.168.0` (compatible)
- ✅ `@supabase/supabase-js` con `?target=deno` (compatible)
- ✅ NO hay imports de `node:*`, `npm:`, `std@*/node/*`

**Veredicto:** ✅ **SIN PROBLEMAS** - Ya migrado a REST

---

### 3. `supabase/functions/stripe-webhook/index.ts`

**Imports directos:**
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
```

**Análisis:**
- ❌ **USA Stripe SDK:** `import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'`
- ⚠️ `@supabase/supabase-js` **SIN** `?target=deno` (puede ser problema menor)
- ✅ `serve` desde `deno.land/std@0.168.0` (compatible)

**Uso del SDK:**
- Línea 101: `Stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)`
- Línea 123-125: `new Stripe(stripeSecretKey, { apiVersion: ... })`
- Línea 177: `stripe.subscriptions.retrieve(stripeSubscriptionId)`

**Veredicto:** ❌ **ROOT CAUSE CANDIDATE #1**

**Evidencia:**
- El SDK de Stripe (`stripe@14.21.0`) incluso con `?target=deno` puede traer dependencias transitivas que usan:
  - `process.nextTick()` → requiere `std@*/node/_next_tick.ts`
  - `Buffer` → requiere `std@*/node/buffer.ts`
  - `stream` → requiere `std@*/node/stream.ts`
  - `http`/`https` → requiere `std@*/node/http.ts`

**Dependency Graph (inferido):**
```
stripe-webhook/index.ts
  └─> esm.sh/stripe@14.21.0?target=deno
      ├─> [dependencias internas de Stripe]
      │   └─> [alguna dependencia usa]
      │       └─> deno.land/std@0.177.1/node/_core.ts
      │           └─> Deno.core.runMicrotasks() ❌
      └─> [otras dependencias que requieren node polyfills]
```

---

### 4. `supabase/functions/update-subscription/index.ts`

**Imports directos:**
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
```

**Análisis:**
- ❌ **USA Stripe SDK:** `import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'`
- ⚠️ `@supabase/supabase-js` **SIN** `?target=deno` (puede ser problema menor)
- ✅ `serve` desde `deno.land/std@0.168.0` (compatible)

**Uso del SDK:**
- Línea 166: `new Stripe(stripeSecretKey, { apiVersion: ... })`
- Línea 171: `stripe.prices.list({ lookup_keys: ['branch_addon_monthly'], ... })`
- Línea 190: `stripe.subscriptions.retrieve(...)`
- Línea 205: `stripe.subscriptionItems.del(...)`
- Línea 212: `stripe.subscriptionItems.update(...)`
- Línea 219: `stripe.subscriptionItems.create(...)`

**Veredicto:** ❌ **ROOT CAUSE CANDIDATE #2**

**Evidencia:**
- Mismo problema que `stripe-webhook`: el SDK de Stripe trae dependencias transitivas con node polyfills.

---

## 🔍 FASE 2: BÚSQUEDA EN REPOSITORIO

### 2.1 Búsqueda de referencias a `std@*/node/*`

```bash
# Resultado: NO se encontraron referencias directas
grep "std@.*node|deno.land/std.*node|/node/" supabase/functions
# → No matches found
```

**Conclusión:** No hay imports directos de `std@*/node/*` en el código fuente.

### 2.2 Búsqueda de `npm:`, `node:`, `process`, `nextTick`, `Buffer`

```bash
# Resultado: Solo referencias en comentarios o strings, NO en imports
grep "npm:|node:|process\.|nextTick|Buffer" supabase/functions
# → No matches found en imports directos
```

**Conclusión:** No hay imports directos de Node.js polyfills.

### 2.3 Búsqueda de `stripe` y `esm.sh/stripe`

```bash
# Resultado: 2 archivos usan Stripe SDK
grep "esm.sh/stripe" supabase/functions
# → stripe-webhook/index.ts:7
# → update-subscription/index.ts:7
```

**Conclusión:** Solo 2 archivos usan el SDK de Stripe.

### 2.4 Búsqueda de `target=deno`

```bash
# Resultado: 4 archivos usan ?target=deno
grep "target=deno" supabase/functions
# → create-checkout-session/index.ts:14 (@supabase/supabase-js)
# → create-portal-session/index.ts:13 (@supabase/supabase-js)
# → stripe-webhook/index.ts:7 (stripe)
# → update-subscription/index.ts:7 (stripe)
```

**Conclusión:** `?target=deno` no es suficiente para Stripe SDK.

### 2.5 Búsqueda de `deno.land/std@`

```bash
# Resultado: Todos usan std@0.168.0 (compatible)
grep "deno.land/std@" supabase/functions
# → Todos usan: deno.land/std@0.168.0/http/server.ts
```

**Conclusión:** Todos usan la versión correcta de Deno std, pero el error menciona `std@0.177.1` que viene de una dependencia transitiva.

---

## 🎯 ROOT CAUSE ANALYSIS

### Root Cause Candidate #1: Stripe SDK en `stripe-webhook/index.ts`

**Evidencia:**
1. **Línea 7:** `import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'`
2. **Stack trace:** Apunta a `deno.land/std@0.177.1/node/*` (versión diferente a la usada directamente)
3. **Uso:** `Stripe.webhooks.constructEvent()` y `stripe.subscriptions.retrieve()`

**Mecanismo:**
- `esm.sh/stripe@14.21.0?target=deno` intenta transpilar Stripe SDK para Deno
- Sin embargo, Stripe SDK internamente usa dependencias que requieren:
  - `process.nextTick()` → resuelto a `std@0.177.1/node/_next_tick.ts`
  - `Buffer` → resuelto a `std@0.177.1/node/buffer.ts`
  - Estas dependencias intentan usar `Deno.core.runMicrotasks()` que NO está disponible en Supabase Edge Runtime

**Confianza:** 🔴 **ALTA** (95%)

---

### Root Cause Candidate #2: Stripe SDK en `update-subscription/index.ts`

**Evidencia:**
1. **Línea 7:** `import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'`
2. **Uso extensivo:** `stripe.prices.list()`, `stripe.subscriptions.retrieve()`, `stripe.subscriptionItems.*`

**Mecanismo:**
- Mismo problema que Candidate #1
- Más uso del SDK = más probabilidad de activar el código problemático

**Confianza:** 🔴 **ALTA** (95%)

---

### Root Cause Candidate #3: `@supabase/supabase-js` sin `?target=deno`

**Evidencia:**
- `stripe-webhook/index.ts` línea 6: `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'` (sin `?target=deno`)
- `update-subscription/index.ts` línea 6: `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'` (sin `?target=deno`)

**Mecanismo:**
- `@supabase/supabase-js` puede traer dependencias de Node.js si no se especifica `?target=deno`
- Sin embargo, esto es menos probable que cause el error específico de `runMicrotasks()`

**Confianza:** 🟡 **MEDIA** (40%)

---

## 📊 DEPENDENCY GRAPH (INFERIDO)

```
stripe-webhook/index.ts
  ├─> deno.land/std@0.168.0/http/server.ts ✅
  ├─> esm.sh/@supabase/supabase-js@2.39.3 ⚠️ (sin ?target=deno)
  └─> esm.sh/stripe@14.21.0?target=deno ❌
      └─> [dependencias internas de Stripe]
          └─> [alguna dependencia]
              └─> deno.land/std@0.177.1/node/_core.ts ❌
                  └─> Deno.core.runMicrotasks() ❌ NOT SUPPORTED

update-subscription/index.ts
  ├─> deno.land/std@0.168.0/http/server.ts ✅
  ├─> esm.sh/@supabase/supabase-js@2.39.3 ⚠️ (sin ?target=deno)
  └─> esm.sh/stripe@14.21.0?target=deno ❌
      └─> [mismo problema que stripe-webhook]
```

---

## 🔧 RECOMENDACIONES DE FIX

### Fix Mínimo Recomendado: **Opción B** (Eliminar Stripe SDK)

**Razón:** Ya tenemos evidencia de que REST directo funciona (ver `create-checkout-session` y `create-portal-session`).

---

## 📝 PLAN DE ACCIÓN

### FASE 2A: Fix Alternativo A (Mantener Stripe SDK pero Deno-first)

**Problema:** No hay forma garantizada de hacer que Stripe SDK funcione sin node polyfills en Supabase Edge Runtime.

**Intentos posibles:**
1. Usar `esm.sh/stripe@latest?target=denonext` (no garantizado)
2. Usar `npm:stripe@latest` con `deno.json` config (no soportado en Supabase)
3. Usar versión específica de Stripe que no use node polyfills (no existe)

**Conclusión:** ❌ **NO RECOMENDADO** - Alto riesgo, bajo éxito.

---

### FASE 2B: Fix Alternativo B (Eliminar Stripe SDK - RECOMENDADO)

**Archivos a modificar:**
1. `supabase/functions/stripe-webhook/index.ts`
2. `supabase/functions/update-subscription/index.ts`

**Cambios requeridos:**

#### Para `stripe-webhook/index.ts`:
- ❌ Eliminar: `import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'`
- ✅ Implementar verificación de firma webhook manualmente usando `crypto.subtle`
- ✅ Reemplazar `stripe.subscriptions.retrieve()` con REST `GET /v1/subscriptions/{id}`
- ✅ Usar `fetch` para todas las llamadas a Stripe API

#### Para `update-subscription/index.ts`:
- ❌ Eliminar: `import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'`
- ✅ Reemplazar `stripe.prices.list()` con REST `GET /v1/prices?lookup_keys[]=...`
- ✅ Reemplazar `stripe.subscriptions.retrieve()` con REST `GET /v1/subscriptions/{id}`
- ✅ Reemplazar `stripe.subscriptionItems.*` con REST:
  - `DELETE /v1/subscription_items/{id}`
- - `PATCH /v1/subscription_items/{id}`
  - `POST /v1/subscription_items`
- ✅ Usar `fetch` para todas las llamadas a Stripe API

**Ventajas:**
- ✅ Elimina completamente el problema de node polyfills
- ✅ Ya tenemos código de referencia en `create-checkout-session` y `create-portal-session`
- ✅ Más control sobre las llamadas a Stripe
- ✅ Menor tamaño de bundle

**Desventajas:**
- ⚠️ Requiere implementar verificación de firma webhook manualmente
- ⚠️ Más código manual para manejar form-urlencoded

**Estimación:** 2-3 horas de desarrollo + testing

---

## ✅ CHECKLIST DE VALIDACIÓN POST-FIX

- [ ] Eliminar todos los imports de `esm.sh/stripe`
- [ ] Verificar que no hay referencias a `Stripe` class
- [ ] Implementar verificación de firma webhook con `crypto.subtle`
- [ ] Reemplazar todas las llamadas del SDK con REST `fetch`
- [ ] Probar `stripe-webhook` con eventos reales de Stripe
- [ ] Probar `update-subscription` con diferentes cantidades
- [ ] Verificar logs de Supabase: NO debe aparecer `runMicrotasks` error
- [ ] Verificar que `create-checkout-session` y `create-portal-session` siguen funcionando

---

## 📚 REFERENCIAS

- [Stripe REST API Docs](https://stripe.com/docs/api)
- [Stripe Webhook Signature Verification](https://stripe.com/docs/webhooks/signatures)
- [Supabase Edge Functions Deno Runtime](https://supabase.com/docs/guides/functions)
- [Deno std/node compatibility](https://deno.land/std/node/README.md)

---

**Reporte generado por:** Auto (Cursor AI)  
**Última actualización:** 2024-12-19

