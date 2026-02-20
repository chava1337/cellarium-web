# 🔒 Vulnerabilidades Detalladas y Soluciones

## 📋 Índice
1. [Rate Limiting en Login/Registro](#1-rate-limiting-en-loginregistro)
2. [Salt Aleatorio al Email Ficticio](#2-salt-aleatorio-al-email-ficticio)
3. [Tabla de Auditoría](#3-tabla-de-auditoría)

---

## 1. Rate Limiting en Login/Registro

### 🔍 ¿Qué es?

**Rate Limiting** es un mecanismo que limita la cantidad de intentos de una acción (login, registro) que un usuario o IP puede realizar en un período de tiempo determinado.

### ⚠️ ¿Por qué es una vulnerabilidad?

**Sin rate limiting:**
- Un atacante puede intentar **millones de contraseñas** en segundos
- Puede **crear miles de cuentas** automáticamente
- Puede **sobrecargar el servidor** con requests
- Puede **enumerar usernames** válidos probando combinaciones

**Ejemplo de ataque:**
```javascript
// Un atacante podría ejecutar esto:
for (let i = 0; i < 1000000; i++) {
  // Intentar login con diferentes contraseñas
  await supabase.auth.signInWithPassword({
    email: 'chava123_9b2bf581@placeholder.com',
    password: `password${i}`
  });
}
// Sin rate limiting, esto podría funcionar
```

### 🎯 ¿Cómo afecta a la funcionalidad?

**Impacto en usuarios legítimos:**
- ✅ **Ninguno** si está bien configurado
- Los usuarios normales no alcanzan los límites
- Solo afecta a atacantes o bots

**Impacto en seguridad:**
- 🔴 **Crítico**: Permite fuerza bruta
- 🔴 **Crítico**: Permite creación masiva de cuentas
- 🔴 **Crítico**: Puede causar DoS (Denial of Service)

### ✅ Solución: Implementar Rate Limiting

#### Opción 1: Edge Function de Supabase (Recomendado)

**Crear Edge Function: `rate-limiter`**

```typescript
// supabase/functions/rate-limiter/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS = 5; // Máximo 5 intentos por ventana

interface RateLimitEntry {
  key: string;
  attempts: number;
  resetAt: number;
}

serve(async (req) => {
  const { action, identifier } = await req.json();
  
  // identifier puede ser: email, username, o IP address
  const key = `${action}:${identifier}`;
  const now = Date.now();
  
  // Crear cliente Supabase con service role
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  
  // Buscar o crear entrada de rate limit
  const { data: existing } = await supabase
    .from('rate_limits')
    .select('*')
    .eq('key', key)
    .single();
  
  if (existing) {
    // Si la ventana expiró, resetear
    if (existing.reset_at < now) {
      await supabase
        .from('rate_limits')
        .update({
          attempts: 1,
          reset_at: now + RATE_LIMIT_WINDOW,
          last_attempt: new Date().toISOString()
        })
        .eq('key', key);
      
      return new Response(JSON.stringify({ allowed: true, remaining: MAX_ATTEMPTS - 1 }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Si excedió el límite
    if (existing.attempts >= MAX_ATTEMPTS) {
      return new Response(JSON.stringify({ 
        allowed: false, 
        remaining: 0,
        resetAt: existing.reset_at,
        message: 'Demasiados intentos. Intenta de nuevo en ' + 
                 Math.ceil((existing.reset_at - now) / 1000 / 60) + ' minutos'
      }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Incrementar intentos
    await supabase
      .from('rate_limits')
      .update({
        attempts: existing.attempts + 1,
        last_attempt: new Date().toISOString()
      })
      .eq('key', key);
    
    return new Response(JSON.stringify({ 
      allowed: true, 
      remaining: MAX_ATTEMPTS - existing.attempts - 1 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } else {
    // Crear nueva entrada
    await supabase.from('rate_limits').insert({
      key,
      action,
      identifier,
      attempts: 1,
      reset_at: now + RATE_LIMIT_WINDOW,
      last_attempt: new Date().toISOString()
    });
    
    return new Response(JSON.stringify({ allowed: true, remaining: MAX_ATTEMPTS - 1 }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
```

**Crear tabla de rate limits:**

```sql
-- supabase/migrations/028_create_rate_limits.sql
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE, -- Formato: "action:identifier"
  action TEXT NOT NULL, -- 'login', 'register', 'password_reset'
  identifier TEXT NOT NULL, -- email, username, o IP
  attempts INTEGER NOT NULL DEFAULT 1,
  reset_at BIGINT NOT NULL, -- Timestamp en milisegundos
  last_attempt TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para búsquedas rápidas
CREATE INDEX idx_rate_limits_key ON public.rate_limits(key);
CREATE INDEX idx_rate_limits_reset_at ON public.rate_limits(reset_at);

-- RLS: Solo el sistema puede acceder
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rate_limits_service_only"
ON public.rate_limits
FOR ALL
USING (false); -- Nadie puede acceder directamente, solo Edge Functions

-- Job para limpiar entradas expiradas (ejecutar diariamente)
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.rate_limits
  WHERE reset_at < EXTRACT(EPOCH FROM NOW()) * 1000;
END;
$$;
```

**Integrar en el código de login:**

```typescript
// src/screens/AuthScreen.tsx
const handleEmailPasswordAuth = async () => {
  // ... validaciones existentes ...
  
  try {
    // 1. Verificar rate limit ANTES de intentar login
    const identifier = isEmail ? cleanInput : authEmail; // Usar email o username
    const { data: rateLimitData, error: rateLimitError } = await supabase.functions.invoke('rate-limiter', {
      body: {
        action: 'login',
        identifier: identifier
      }
    });
    
    if (rateLimitError || !rateLimitData?.allowed) {
      const resetMinutes = rateLimitData?.resetAt 
        ? Math.ceil((rateLimitData.resetAt - Date.now()) / 1000 / 60)
        : 15;
      
      Alert.alert(
        'Demasiados intentos',
        `Has excedido el límite de intentos de login. Intenta de nuevo en ${resetMinutes} minutos.`
      );
      return;
    }
    
    // 2. Intentar login
    const { data, error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: cleanPassword,
    });
    
    // 3. Si el login falla, el rate limit ya se incrementó
    // Si el login es exitoso, podemos resetear el rate limit para ese usuario
    if (data?.user) {
      // Login exitoso - opcional: resetear rate limit
      await supabase.functions.invoke('rate-limiter', {
        body: {
          action: 'login_success',
          identifier: identifier
        }
      });
    }
    
    // ... resto del código ...
  } catch (error) {
    // ... manejo de errores ...
  }
};
```

**Integrar en el registro:**

```typescript
// src/screens/AdminRegistrationScreen.tsx
const handleUsernameRegister = async () => {
  // ... validaciones existentes ...
  
  try {
    // 1. Verificar rate limit para registro
    const { data: rateLimitData, error: rateLimitError } = await supabase.functions.invoke('rate-limiter', {
      body: {
        action: 'register',
        identifier: fakeEmail // o usar IP address
      }
    });
    
    if (rateLimitError || !rateLimitData?.allowed) {
      Alert.alert(
        'Límite alcanzado',
        'Has intentado registrarte demasiadas veces. Intenta de nuevo más tarde.'
      );
      return;
    }
    
    // 2. Proceder con registro
    const { data, error } = await supabase.auth.signUp({
      email: fakeEmail,
      password: normalizedPassword,
      // ...
    });
    
    // ... resto del código ...
  } catch (error) {
    // ... manejo de errores ...
  }
};
```

#### Opción 2: Rate Limiting Simple en Cliente (Menos Seguro)

```typescript
// src/utils/rateLimiter.ts
class RateLimiter {
  private attempts: Map<string, { count: number; resetAt: number }> = new Map();
  
  checkLimit(key: string, maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000): boolean {
    const now = Date.now();
    const entry = this.attempts.get(key);
    
    if (!entry || entry.resetAt < now) {
      // Resetear o crear nueva entrada
      this.attempts.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    
    if (entry.count >= maxAttempts) {
      return false; // Límite excedido
    }
    
    entry.count++;
    return true;
  }
  
  reset(key: string) {
    this.attempts.delete(key);
  }
}

export const rateLimiter = new RateLimiter();
```

**⚠️ Nota:** Esta opción es menos segura porque se puede bypasear desde el cliente. La Opción 1 (Edge Function) es la recomendada.

### 📊 Configuración Recomendada

| Acción | Máximo Intentos | Ventana de Tiempo | Bloqueo |
|--------|----------------|-------------------|---------|
| Login | 5 | 15 minutos | 15 minutos |
| Registro | 3 | 1 hora | 1 hora |
| Password Reset | 3 | 1 hora | 1 hora |

---

## 2. Salt Aleatorio al Email Ficticio

### 🔍 ¿Qué es?

Actualmente, el email ficticio se genera así:
```typescript
const ownerIdShort = ownerId.substring(0, 8).replace(/-/g, '');
const fakeEmail = `${username}_${ownerIdShort}@placeholder.com`;
// Ejemplo: chava123_9b2bf581@placeholder.com
```

**Problema:** Si alguien conoce el `owner_id` y el `username`, puede predecir el email.

### ⚠️ ¿Por qué es una vulnerabilidad?

**Escenario de ataque:**
1. Un atacante obtiene el `owner_id` de alguna forma (logs, errores, etc.)
2. Conoce o adivina un `username` (ej: "admin", "test", "user1")
3. Puede predecir el email: `admin_9b2bf581@placeholder.com`
4. Puede intentar hacer login con ese email y diferentes contraseñas

**Ejemplo:**
```typescript
// Atacante conoce owner_id = "9b2bf581-9c99-4d3d-80d8-566b80e63739"
const ownerIdShort = "9b2bf581".substring(0, 8).replace(/-/g, '');
// ownerIdShort = "9b2bf581"

// Intenta diferentes usernames comunes
const commonUsernames = ['admin', 'test', 'user', 'staff', 'manager'];
for (const username of commonUsernames) {
  const predictedEmail = `${username}_${ownerIdShort}@placeholder.com`;
  // Intenta login con predictedEmail
}
```

### 🎯 ¿Cómo afecta a la funcionalidad?

**Impacto en usuarios legítimos:**
- ✅ **Ninguno**: El salt es transparente para el usuario
- El login sigue funcionando igual (username → busca email)
- No cambia la experiencia del usuario

**Impacto en seguridad:**
- 🔴 **Alto**: Permite enumeración de usuarios
- 🔴 **Alto**: Facilita ataques de fuerza bruta dirigidos
- 🟡 **Medio**: Reduce la privacidad (emails predecibles)

### ✅ Solución: Agregar Salt Aleatorio

#### Implementación en el Registro

```typescript
// src/screens/AdminRegistrationScreen.tsx
import * as Crypto from 'expo-crypto';

const handleUsernameRegister = async () => {
  // ... validaciones existentes ...
  
  try {
    // ... código existente hasta generar email ...
    
    // Generar salt aleatorio de 16 caracteres
    const salt = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${username}_${ownerId}_${Date.now()}_${Math.random()}`
    ).then(hash => hash.substring(0, 16)); // Tomar primeros 16 caracteres
    
    // O alternativa más simple (si no tienes expo-crypto):
    // const salt = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    //   .map(b => b.toString(16).padStart(2, '0'))
    //   .join('')
    //   .substring(0, 16);
    
    const ownerIdShort = ownerId.substring(0, 8).replace(/-/g, '');
    
    // Email ficticio con salt: username_salt_ownerid@placeholder.com
    const fakeEmail = `${username}_${salt}_${ownerIdShort}@placeholder.com`;
    
    console.log('📝 Email ficticio generado (con salt):', fakeEmail);
    
    // Guardar el salt en la metadata del usuario para poder buscarlo después
    const { data, error } = await supabase.auth.signUp({
      email: fakeEmail,
      password: normalizedPassword,
      options: {
        data: {
          qrToken,
          branchId,
          branchName,
          invitationType: 'admin_invite',
          username: username,
          emailSalt: salt, // ⚠️ IMPORTANTE: Guardar salt para búsqueda
        },
      },
    });
    
    // ... resto del código ...
  } catch (error) {
    // ... manejo de errores ...
  }
};
```

#### Actualizar Función RPC para Guardar Salt

```sql
-- Actualizar create_staff_user para guardar salt
-- En supabase/migrations/027_add_username_support.sql (actualizar)

-- Agregar columna email_salt a users (si no existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name = 'email_salt'
  ) THEN
    ALTER TABLE public.users 
    ADD COLUMN email_salt TEXT;
    
    COMMENT ON COLUMN public.users.email_salt IS 
      'Salt aleatorio usado en el email ficticio para prevenir enumeración';
  END IF;
END $$;

-- Actualizar función create_staff_user para aceptar salt
CREATE OR REPLACE FUNCTION public.create_staff_user(
  p_user_id UUID,
  p_email TEXT,
  p_name TEXT,
  p_qr_token TEXT,
  p_username TEXT DEFAULT NULL,
  p_email_salt TEXT DEFAULT NULL -- ⚠️ NUEVO PARÁMETRO
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_branch_id UUID;
  v_result JSON;
BEGIN
  -- ... validaciones existentes ...
  
  -- Insertar usuario con salt
  INSERT INTO public.users (
    id,
    email,
    name,
    username,
    email_salt, -- ⚠️ GUARDAR SALT
    role,
    status,
    owner_id,
    branch_id,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_email,
    p_name,
    NULLIF(p_username, ''),
    p_email_salt, -- ⚠️ GUARDAR SALT
    'staff',
    'pending',
    v_owner_id,
    v_branch_id,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    username = COALESCE(EXCLUDED.username, users.username),
    email_salt = COALESCE(EXCLUDED.email_salt, users.email_salt), -- ⚠️ ACTUALIZAR SALT
    updated_at = NOW();
  
  -- ... resto del código ...
END;
$$;
```

#### Actualizar Búsqueda por Username

```sql
-- Actualizar get_user_email_by_username para usar salt
CREATE OR REPLACE FUNCTION public.get_user_email_by_username(
  p_username TEXT
)
RETURNS TABLE (
  email TEXT,
  user_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.email,
    u.id as user_id,
    u.status
  FROM public.users u
  WHERE u.username = p_username
    AND u.status IN ('pending', 'active')
    AND u.email LIKE '%@placeholder.com'
    -- ⚠️ El email ya contiene el salt, así que la búsqueda sigue funcionando
    -- porque buscamos por username, no por email
  LIMIT 1;
END;
$$;
```

**⚠️ Nota:** La función `get_user_email_by_username` no necesita cambios porque busca por `username`, no por email. El salt solo afecta la generación del email, no la búsqueda.

#### Actualizar Edge Function

```typescript
// supabase/functions/user-created/index.ts
serve(async (req) => {
  // ... código existente ...
  
  const username = payload.username || user.user_metadata?.username || null;
  const emailSalt = payload.emailSalt || user.user_metadata?.email_salt || null; // ⚠️ NUEVO
  
  // ... código existente ...
  
  const insertData: any = {
    id: user.id,
    email: user.email,
    name: userName,
    role,
    status,
    branch_id: branchId,
    owner_id: ownerId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  
  if (username) {
    insertData.username = username;
  }
  
  if (emailSalt) { // ⚠️ GUARDAR SALT
    insertData.email_salt = emailSalt;
  }
  
  // ... resto del código ...
});
```

### 📊 Comparación: Antes vs Después

**Antes (Vulnerable):**
```
username: "chava123"
owner_id: "9b2bf581-9c99-4d3d-80d8-566b80e63739"
email: "chava123_9b2bf581@placeholder.com"
```
**Predecible:** ✅ Sí (si conoces owner_id y username)

**Después (Seguro):**
```
username: "chava123"
owner_id: "9b2bf581-9c99-4d3d-80d8-566b80e63739"
salt: "a3f8b2c9d1e4f5a6" (aleatorio)
email: "chava123_a3f8b2c9d1e4f5a6_9b2bf581@placeholder.com"
```
**Predecible:** ❌ No (el salt es aleatorio e impredecible)

---

## 3. Tabla de Auditoría

### 🔍 ¿Qué es?

Una **tabla de auditoría** registra todas las acciones importantes que realizan los usuarios: logins, registros, cambios de datos, accesos a información sensible, etc.

### ⚠️ ¿Por qué es una vulnerabilidad?

**Sin auditoría:**
- ❌ No hay registro de quién accedió a qué
- ❌ No se puede investigar incidentes de seguridad
- ❌ No se puede detectar actividad sospechosa
- ❌ No hay trazabilidad de cambios en datos críticos
- ❌ No se cumple con regulaciones (GDPR, etc.)

**Ejemplo de problema:**
```
Un usuario reporta que sus datos fueron modificados.
Sin auditoría: No sabemos quién, cuándo, ni qué cambió.
Con auditoría: Podemos ver exactamente qué pasó.
```

### 🎯 ¿Cómo afecta a la funcionalidad?

**Impacto en usuarios legítimos:**
- ✅ **Ninguno**: La auditoría es transparente
- No afecta la velocidad de la app (inserciones asíncronas)
- No requiere acción del usuario

**Impacto en seguridad:**
- 🔴 **Crítico**: Sin capacidad de investigar incidentes
- 🔴 **Crítico**: Sin detección de actividad sospechosa
- 🟡 **Medio**: No cumple con compliance/regulaciones

### ✅ Solución: Crear Tabla de Auditoría

#### 1. Crear Tabla de Auditoría

```sql
-- supabase/migrations/029_create_audit_logs.sql
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Usuario que realizó la acción
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT, -- Email del usuario (por si se elimina)
  user_role TEXT, -- Rol del usuario al momento de la acción
  
  -- Acción realizada
  action TEXT NOT NULL, -- 'login', 'register', 'update', 'delete', 'view', etc.
  resource TEXT, -- 'users', 'wines', 'branches', etc.
  resource_id UUID, -- ID del recurso afectado
  
  -- Detalles de la acción
  details JSONB, -- Información adicional (valores anteriores/nuevos, etc.)
  
  -- Contexto
  ip_address TEXT, -- IP del cliente
  user_agent TEXT, -- User agent del cliente
  session_id TEXT, -- ID de sesión de Supabase
  
  -- Metadata
  success BOOLEAN DEFAULT true, -- Si la acción fue exitosa
  error_message TEXT, -- Mensaje de error si falló
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON public.audit_logs(resource);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_user_id_created_at ON public.audit_logs(user_id, created_at DESC);

-- Índice GIN para búsquedas en JSONB
CREATE INDEX idx_audit_logs_details ON public.audit_logs USING GIN(details);

-- RLS: Solo owners pueden ver logs de sus usuarios
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners_can_view_their_audit_logs"
ON public.audit_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = audit_logs.user_id
    AND users.owner_id = (SELECT owner_id FROM public.users WHERE id = auth.uid())
  )
  OR user_id = auth.uid() -- Usuario puede ver sus propios logs
);

-- Comentarios
COMMENT ON TABLE public.audit_logs IS 'Registro de auditoría de todas las acciones importantes del sistema';
COMMENT ON COLUMN public.audit_logs.action IS 'Tipo de acción: login, register, update, delete, view, etc.';
COMMENT ON COLUMN public.audit_logs.details IS 'Información adicional en formato JSON (valores anteriores/nuevos, etc.)';
```

#### 2. Crear Función Helper para Auditoría

```sql
-- Función helper para insertar logs de auditoría
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_user_id UUID,
  p_action TEXT,
  p_resource TEXT DEFAULT NULL,
  p_resource_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_success BOOLEAN DEFAULT true,
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email TEXT;
  v_user_role TEXT;
  v_log_id UUID;
BEGIN
  -- Obtener email y rol del usuario
  SELECT email, role INTO v_user_email, v_user_role
  FROM public.users
  WHERE id = p_user_id
  LIMIT 1;
  
  -- Insertar log
  INSERT INTO public.audit_logs (
    user_id,
    user_email,
    user_role,
    action,
    resource,
    resource_id,
    details,
    success,
    error_message
  ) VALUES (
    p_user_id,
    v_user_email,
    v_user_role,
    p_action,
    p_resource,
    p_resource_id,
    p_details,
    p_success,
    p_error_message
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Dar permisos
GRANT EXECUTE ON FUNCTION public.log_audit_event TO authenticated;
```

#### 3. Crear Edge Function para Auditoría

```typescript
// supabase/functions/audit-log/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const { 
    userId, 
    action, 
    resource, 
    resourceId, 
    details, 
    success = true, 
    errorMessage,
    ipAddress,
    userAgent 
  } = await req.json();
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  
  // Insertar log de auditoría
  const { data, error } = await supabase.rpc('log_audit_event', {
    p_user_id: userId,
    p_action: action,
    p_resource: resource,
    p_resource_id: resourceId,
    p_details: details,
    p_success: success,
    p_error_message: errorMessage
  });
  
  if (error) {
    console.error('Error logging audit event:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({ success: true, logId: data }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
```

#### 4. Integrar Auditoría en Login

```typescript
// src/screens/AuthScreen.tsx
const handleEmailPasswordAuth = async () => {
  // ... código existente ...
  
  try {
    // ... intento de login ...
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: cleanPassword,
    });
    
    // Registrar en auditoría
    if (data?.user) {
      // Login exitoso
      await supabase.functions.invoke('audit-log', {
        body: {
          userId: data.user.id,
          action: 'login',
          resource: 'auth',
          details: {
            method: isEmail ? 'email' : 'username',
            identifier: isEmail ? authEmail : cleanInput
          },
          success: true,
          ipAddress: await getClientIP(), // Función helper
          userAgent: navigator.userAgent
        }
      });
    } else if (error) {
      // Login fallido
      await supabase.functions.invoke('audit-log', {
        body: {
          userId: null, // No hay usuario
          action: 'login_failed',
          resource: 'auth',
          details: {
            method: isEmail ? 'email' : 'username',
            identifier: isEmail ? authEmail : cleanInput,
            errorCode: error.code
          },
          success: false,
          errorMessage: error.message,
          ipAddress: await getClientIP(),
          userAgent: navigator.userAgent
        }
      });
    }
    
    // ... resto del código ...
  } catch (error) {
    // ... manejo de errores ...
  }
};

// Helper para obtener IP (simplificado)
async function getClientIP(): Promise<string> {
  // En producción, esto debería venir del servidor
  // Por ahora, retornar 'unknown'
  return 'unknown';
}
```

#### 5. Integrar Auditoría en Registro

```typescript
// src/screens/AdminRegistrationScreen.tsx
const handleUsernameRegister = async () => {
  // ... código existente ...
  
  try {
    // ... registro ...
    
    const { data, error } = await supabase.auth.signUp({
      email: fakeEmail,
      password: normalizedPassword,
      // ...
    });
    
    if (data?.user) {
      // Registrar registro exitoso
      await supabase.functions.invoke('audit-log', {
        body: {
          userId: data.user.id,
          action: 'register',
          resource: 'users',
          resourceId: data.user.id,
          details: {
            username: username,
            branchId: branchId,
            branchName: branchName,
            invitationType: 'admin_invite'
          },
          success: true
        }
      });
    }
    
    // ... resto del código ...
  } catch (error) {
    // ... manejo de errores ...
  }
};
```

#### 6. Integrar Auditoría en Cambios de Datos

```sql
-- Trigger para auditar cambios en users
CREATE OR REPLACE FUNCTION audit_users_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Registrar cambio
  PERFORM public.log_audit_event(
    NEW.id, -- user_id
    'update', -- action
    'users', -- resource
    NEW.id, -- resource_id
    jsonb_build_object(
      'old', row_to_json(OLD),
      'new', row_to_json(NEW),
      'changed_fields', (
        SELECT jsonb_object_agg(key, value)
        FROM jsonb_each(row_to_json(NEW)::jsonb)
        WHERE value IS DISTINCT FROM (row_to_json(OLD)::jsonb -> key)
      )
    ), -- details
    true, -- success
    NULL -- error_message
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_audit_trigger
AFTER UPDATE ON public.users
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION audit_users_changes();
```

#### 7. Consultar Logs de Auditoría

```typescript
// src/services/AuditService.ts
export const AuditService = {
  // Obtener logs de un usuario
  async getUserLogs(userId: string, limit: number = 50) {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data;
  },
  
  // Obtener logs de una acción específica
  async getActionLogs(action: string, limit: number = 50) {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('action', action)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data;
  },
  
  // Obtener logs de un recurso
  async getResourceLogs(resource: string, resourceId: string) {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('resource', resource)
      .eq('resource_id', resourceId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },
  
  // Buscar actividad sospechosa
  async getSuspiciousActivity(threshold: number = 10) {
    // Buscar usuarios con muchos intentos fallidos de login
    const { data, error } = await supabase
      .rpc('get_suspicious_login_attempts', { 
        p_threshold: threshold 
      });
    
    if (error) throw error;
    return data;
  }
};
```

### 📊 Ejemplos de Queries Útiles

```sql
-- Ver todos los logins de un usuario
SELECT * FROM audit_logs
WHERE user_id = '...' AND action = 'login'
ORDER BY created_at DESC;

-- Ver intentos fallidos de login
SELECT * FROM audit_logs
WHERE action = 'login_failed'
ORDER BY created_at DESC
LIMIT 100;

-- Ver cambios en un usuario específico
SELECT * FROM audit_logs
WHERE resource = 'users' AND resource_id = '...'
ORDER BY created_at DESC;

-- Detectar actividad sospechosa (muchos intentos fallidos)
SELECT 
  user_email,
  COUNT(*) as failed_attempts,
  MIN(created_at) as first_attempt,
  MAX(created_at) as last_attempt
FROM audit_logs
WHERE action = 'login_failed'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY user_email
HAVING COUNT(*) > 5
ORDER BY failed_attempts DESC;
```

---

## 📋 Resumen de Implementación

### Prioridad de Implementación

1. **Rate Limiting** 🔴 ALTA
   - Tiempo estimado: 4-6 horas
   - Impacto en UX: Mínimo (solo afecta a atacantes)
   - Complejidad: Media

2. **Salt Aleatorio** 🟡 MEDIA
   - Tiempo estimado: 2-3 horas
   - Impacto en UX: Ninguno
   - Complejidad: Baja

3. **Auditoría** 🟡 MEDIA
   - Tiempo estimado: 6-8 horas
   - Impacto en UX: Ninguno
   - Complejidad: Media-Alta

### Orden Recomendado

1. **Semana 1:** Rate Limiting
2. **Semana 2:** Salt Aleatorio
3. **Semana 3:** Auditoría (puede ser gradual)

---

**Última actualización:** 2025-11-20

