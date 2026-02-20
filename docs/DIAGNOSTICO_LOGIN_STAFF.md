# 🔍 Diagnóstico: Problema de Login después de Registro con QR

## 📋 Resumen del Problema

**Síntoma**: Usuario se registra con QR, owner lo aprueba, pero al intentar hacer login dice "credenciales inválidas".

**Causa probable**: El usuario se crea en `auth.users` pero NO se crea en `public.users`, por lo que `loadUserData` no lo encuentra y falla el login.

## 🔍 Puntos de Verificación en los Logs

### 1. Durante el Registro (AdminRegistrationScreen)

Buscar logs con prefijo `📝`:

#### ✅ Registro Exitoso debería mostrar:
```
📝 ==================== INICIO REGISTRO CON QR ====================
📝 Email: usuario@ejemplo.com
📝 QR Token: [token]
📝 ✅ Sesión activa - Usuario autenticado inmediatamente
📝 Invocando Edge Function user-created...
📝 Respuesta de Edge Function:
📝 - Success: SI
✅ Usuario verificado en BD:
✅ - Status: pending
✅ - Role: staff
```

#### ❌ Problema si ves:
```
❌ Error en Edge Function: [error]
❌ Usuario NO encontrado en BD después de Edge Function
❌ Esto significa que el usuario NO podrá hacer login hasta que se cree en public.users
```

### 2. Durante el Login (AuthContext)

Buscar logs con prefijo `🔐`:

#### ✅ Login Exitoso debería mostrar:
```
🔐 ==================== INICIO LOGIN ====================
🔐 Email: usuario@ejemplo.com
🔐 Llamando a supabase.auth.signInWithPassword...
🔐 Respuesta de Supabase auth:
🔐 - Error: null
🔐 - User: [user-id] (usuario@ejemplo.com)
🔐 - Session: EXISTE
✅ Usuario encontrado en BD:
✅ - Status: active (o pending)
✅ - Role: staff
```

#### ❌ Problema si ves:
```
❌ Error en signInWithPassword: [error]
❌ Error code: [código]
❌ PROBLEMA CRÍTICO: Usuario NO existe en public.users
❌ El usuario se creó en auth.users pero NO en public.users
```

## 🔧 Soluciones según el Problema Detectado

### Problema 1: Edge Function no se invoca o falla

**Síntoma**: Logs muestran `❌ Error en Edge Function` o `❌ Usuario NO encontrado en BD después de Edge Function`

**Solución**:
1. Verificar que la Edge Function `user-created` esté desplegada en Supabase
2. Verificar los logs de la Edge Function en Supabase Dashboard → Edge Functions → user-created → Logs
3. Si la Edge Function falla, el código intentará usar RPC `create_staff_user` como fallback
4. Verificar que la función RPC `create_staff_user` exista en la base de datos

### Problema 2: Usuario no existe en public.users después del registro

**Síntoma**: Logs muestran `❌ Usuario NO encontrado en BD después de Edge Function`

**Solución Manual**:
```sql
-- Verificar si el usuario existe en auth.users
SELECT id, email, email_confirmed_at, created_at 
FROM auth.users 
WHERE email = 'usuario@ejemplo.com';

-- Si existe en auth.users pero NO en public.users, crearlo manualmente:
-- 1. Obtener el QR token usado
SELECT owner_id, branch_id FROM qr_tokens WHERE token = '[qr-token]';

-- 2. Insertar usuario en public.users
INSERT INTO public.users (
  id,
  email,
  name,
  role,
  status,
  owner_id,
  branch_id,
  created_at,
  updated_at
) VALUES (
  '[user-id-de-auth-users]',
  'usuario@ejemplo.com',
  'Nombre del Usuario',
  'staff',
  'pending',
  '[owner-id-del-qr]',
  '[branch-id-del-qr]',
  NOW(),
  NOW()
);

-- 3. Confirmar email automáticamente
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE id = '[user-id-de-auth-users]'
AND email_confirmed_at IS NULL;
```

### Problema 3: Email no confirmado

**Síntoma**: Logs muestran `📝 Email confirmado: NO`

**Solución**:
```sql
-- Confirmar email manualmente
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email = 'usuario@ejemplo.com'
AND email_confirmed_at IS NULL;
```

### Problema 4: Usuario existe pero status es 'pending'

**Síntoma**: Logs muestran `✅ - Status: pending`

**Solución**:
- El owner debe aprobar al usuario desde la app (UserManagementScreen)
- O manualmente:
```sql
UPDATE public.users
SET status = 'active',
    role = 'personal', -- o el rol que corresponda
    approved_by = '[owner-id]',
    approved_at = NOW()
WHERE id = '[user-id]';
```

## 📊 Verificación Completa del Usuario

Ejecutar esta consulta para verificar el estado completo:

```sql
SELECT 
  au.id as auth_user_id,
  au.email,
  au.email_confirmed_at IS NOT NULL as email_confirmado,
  pu.id as public_user_id,
  pu.role,
  pu.status,
  pu.owner_id,
  pu.branch_id,
  CASE 
    WHEN au.id IS NULL THEN '❌ NO existe en auth.users'
    WHEN pu.id IS NULL THEN '❌ NO existe en public.users'
    WHEN au.email_confirmed_at IS NULL THEN '⚠️ Email NO confirmado'
    WHEN pu.status = 'pending' THEN '⚠️ Status pendiente (necesita aprobación)'
    ELSE '✅ Usuario OK'
  END as estado
FROM auth.users au
LEFT JOIN public.users pu ON au.id = pu.id
WHERE au.email = 'usuario@ejemplo.com';
```

## 🎯 Flujo Correcto Esperado

1. **Registro con QR**:
   - Usuario se crea en `auth.users` ✅
   - Email se confirma automáticamente ✅
   - Usuario se crea en `public.users` con status='pending' ✅

2. **Aprobación por Owner**:
   - Owner aprueba al usuario desde la app
   - Status cambia a 'active' ✅
   - Se asigna un rol ✅

3. **Login**:
   - Usuario ingresa email/contraseña
   - Supabase auth valida credenciales ✅
   - `loadUserData` encuentra usuario en `public.users` ✅
   - Login exitoso ✅

## ⚠️ Notas Importantes

- **El email DEBE estar confirmado automáticamente** para staff invitados (no requiere confirmación manual)
- **El usuario DEBE existir en public.users** para que `loadUserData` funcione
- **El status puede ser 'pending'** y el usuario aún debería poder hacer login (solo no tendrá acceso completo hasta aprobación)

## 🔧 Solución Rápida: Usuario Existe pero No Puede Hacer Login

Si el usuario existe en `public.users` con status `active` pero aún no puede hacer login, el problema es casi siempre que **el email NO está confirmado en `auth.users`**.

### Solución SQL Rápida:

```sql
-- Confirmar email automáticamente
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email = 'usuario@ejemplo.com'
AND email_confirmed_at IS NULL;
```

### Verificar el Problema:

```sql
-- Verificar si el email está confirmado
SELECT 
  email,
  email_confirmed_at IS NOT NULL as email_confirmado,
  email_confirmed_at
FROM auth.users
WHERE email = 'usuario@ejemplo.com';
```

Si `email_confirmado` es `false`, ese es el problema. Ejecuta el UPDATE de arriba.

### Si el Problema Persiste:

1. **Contraseña incorrecta**: El usuario puede estar usando una contraseña diferente a la que registró
   - Solución: Usar "Olvidé mi contraseña" en la app
   - O resetear desde Supabase Dashboard → Authentication → Users → [Usuario] → Reset Password

2. **Usuario eliminado de auth.users**: Si el usuario fue eliminado de `auth.users` pero quedó en `public.users`
   - Solución: El usuario debe registrarse de nuevo o restaurar desde Supabase Dashboard

