# 📋 SQL para Rate Limiting - Ejecutar Manualmente

## ⚠️ IMPORTANTE
Ejecuta estos SQLs en el **Supabase SQL Editor** en el siguiente orden:

---

## 1️⃣ Crear Tabla rate_limits

```sql
-- ========================================
-- Migración: Rate Limiting
-- Descripción: Implementa rate limiting para prevenir ataques de fuerza bruta
-- ========================================

-- 1. Crear tabla rate_limits
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Clave única: "action:identifier"
  -- Ejemplo: "login:chava123_9b2bf581@placeholder.com"
  key TEXT NOT NULL UNIQUE,
  
  -- Tipo de acción
  action TEXT NOT NULL, -- 'login', 'register', 'password_reset', etc.
  
  -- Identificador (email, username, o IP)
  identifier TEXT NOT NULL,
  
  -- Contador de intentos
  attempts INTEGER NOT NULL DEFAULT 1,
  
  -- Timestamp de reset (en milisegundos desde epoch)
  reset_at BIGINT NOT NULL,
  
  -- Metadata
  last_attempt TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 2️⃣ Crear Índices

```sql
-- 2. Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON public.rate_limits(key);
CREATE INDEX IF NOT EXISTS idx_rate_limits_action ON public.rate_limits(action);
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON public.rate_limits(identifier);
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON public.rate_limits(reset_at);
```

---

## 3️⃣ Habilitar RLS

```sql
-- 3. RLS: Solo el sistema puede acceder (via Edge Functions)
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Política: Nadie puede acceder directamente (solo Edge Functions con service role)
CREATE POLICY "rate_limits_service_only"
ON public.rate_limits
FOR ALL
USING (false); -- Bloquea todo acceso directo
```

---

## 4️⃣ Crear Función de Limpieza

```sql
-- 4. Función para limpiar entradas expiradas
CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Eliminar entradas donde reset_at ya pasó (más de 1 hora de antigüedad)
  DELETE FROM public.rate_limits
  WHERE reset_at < EXTRACT(EPOCH FROM NOW()) * 1000 - (60 * 60 * 1000); -- 1 hora atrás
  
  RAISE NOTICE 'Limpieza de rate limits completada';
END;
$$;
```

---

## 5️⃣ Agregar Comentarios

```sql
-- 5. Comentarios
COMMENT ON TABLE public.rate_limits IS 
  'Tabla para almacenar límites de rate limiting y prevenir ataques de fuerza bruta';
COMMENT ON COLUMN public.rate_limits.key IS 
  'Clave única en formato "action:identifier" (ej: "login:user@email.com")';
COMMENT ON COLUMN public.rate_limits.action IS 
  'Tipo de acción: login, register, password_reset, etc.';
COMMENT ON COLUMN public.rate_limits.identifier IS 
  'Identificador único: email, username, o IP address';
COMMENT ON COLUMN public.rate_limits.attempts IS 
  'Número de intentos realizados en la ventana actual';
COMMENT ON COLUMN public.rate_limits.reset_at IS 
  'Timestamp en milisegundos cuando se resetea el contador';
```

---

## 6️⃣ Verificación

```sql
-- 6. Verificar que todo se creó correctamente
SELECT '✅ Tabla rate_limits creada exitosamente' as status;
SELECT '✅ Índices creados' as status;
SELECT '✅ RLS habilitado' as status;
SELECT '✅ Función de limpieza creada' as status;

-- Verificar tabla
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'rate_limits'
ORDER BY ordinal_position;

-- Verificar índices
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'rate_limits';

-- Verificar políticas RLS
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'rate_limits';
```

---

## 📝 Notas Importantes

1. **Edge Function**: Después de ejecutar estos SQLs, necesitas desplegar la Edge Function `rate-limiter` desde el archivo `supabase/functions/rate-limiter/index.ts`

2. **Limpieza Automática**: La función `cleanup_expired_rate_limits()` debe ejecutarse periódicamente (diariamente). Puedes configurarla con:
   - **pg_cron** (si está habilitado en tu Supabase)
   - **Un job externo** (cron job, Cloud Functions, etc.)

3. **Configuración**: Los límites están configurados en la Edge Function:
   - **Login**: 5 intentos cada 15 minutos
   - **Registro**: 3 intentos cada 1 hora
   - **Password Reset**: 3 intentos cada 1 hora

4. **Fail Open**: Si hay un error en el rate limiter, el sistema permite el intento (fail open) para no bloquear usuarios legítimos en caso de problemas técnicos.

---

## ✅ Checklist

- [ ] Ejecutar SQL 1 (Crear tabla)
- [ ] Ejecutar SQL 2 (Crear índices)
- [ ] Ejecutar SQL 3 (Habilitar RLS)
- [ ] Ejecutar SQL 4 (Crear función de limpieza)
- [ ] Ejecutar SQL 5 (Agregar comentarios)
- [ ] Ejecutar SQL 6 (Verificación)
- [ ] Desplegar Edge Function `rate-limiter`
- [ ] Probar login con múltiples intentos fallidos
- [ ] Verificar que se bloquea después de 5 intentos

---

**Después de ejecutar estos SQLs, el código de la app ya está actualizado para usar rate limiting automáticamente.**

