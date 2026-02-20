# 🔒 Reporte de Seguridad: Sistema de Registro con Username

## 📋 Resumen Ejecutivo

Este reporte analiza las capas de seguridad implementadas en el sistema de registro de staff mediante username (sin confirmación de email) y acceso al catálogo de la unidad.

**Fecha:** 2025-11-20  
**Sistema:** Cellarium - Registro Staff con Username  
**Nivel de Riesgo General:** 🟡 MEDIO (con recomendaciones de mejora)

---

## 🏗️ Arquitectura de Seguridad Actual

### 1. **Capa de Validación de QR Token** ✅

#### Implementación:
- **Validación en Base de Datos:** La función RPC `create_staff_user` valida el token antes de crear el usuario
- **Expiración:** Los tokens tienen `expires_at` y se validan contra `NOW()`
- **Uso Único:** Los tokens de tipo `admin_invite` se marcan como `used = true` después del primer uso
- **Límite de Usos:** Se valida `current_uses < max_uses`

#### Código de Validación:
```sql
-- En create_staff_user()
SELECT owner_id, branch_id 
INTO v_owner_id, v_branch_id
FROM public.qr_tokens
WHERE token = p_qr_token
AND expires_at > NOW()
LIMIT 1;

IF v_owner_id IS NULL THEN
  RAISE EXCEPTION 'Token QR inválido o expirado';
END IF;
```

#### Fortalezas:
- ✅ Validación en servidor (no puede ser bypaseada desde cliente)
- ✅ Expiración automática
- ✅ Uso único para invitaciones admin
- ✅ Vinculación a owner_id y branch_id

#### Debilidades:
- ⚠️ No hay rate limiting en la validación de tokens
- ⚠️ No hay registro de intentos fallidos de validación
- ⚠️ Los tokens expirados no se eliminan automáticamente

---

### 2. **Capa de Autenticación (Supabase Auth)** ✅

#### Implementación:
- **Email Ficticio:** Se genera un email único `username_ownerid@placeholder.com`
- **Password Hashing:** Supabase maneja el hashing de contraseñas automáticamente
- **Confirmación Automática:** El email se confirma automáticamente en la función RPC
- **Session Management:** Supabase maneja las sesiones JWT

#### Flujo:
1. Usuario se registra con username y password
2. Se genera email ficticio único
3. Se crea usuario en `auth.users` con email ficticio
4. Se confirma email automáticamente en RPC
5. Usuario puede hacer login con username (se busca email ficticio)

#### Fortalezas:
- ✅ Passwords hasheados con bcrypt (Supabase)
- ✅ JWT tokens con expiración
- ✅ Email único por owner (previene colisiones)
- ✅ Confirmación automática (no requiere email real)

#### Debilidades:
- ⚠️ No hay verificación de fortaleza de password (solo longitud mínima)
- ⚠️ No hay rate limiting en login
- ⚠️ No hay 2FA disponible
- ⚠️ Los emails ficticios podrían ser predecibles si se conoce el owner_id

---

### 3. **Capa de Autorización (RLS - Row Level Security)** ✅

#### Implementación:
- **RLS Habilitado:** Todas las tablas tienen RLS activado
- **Políticas por Owner:** Los usuarios solo pueden acceder a datos de su `owner_id`
- **Políticas por Rol:** Diferentes permisos según rol (owner, manager, staff)

#### Políticas Clave:

**Tabla `users`:**
```sql
-- Usuarios pueden ver su propio perfil
CREATE POLICY "Users can view own record"
  FOR SELECT USING (auth.uid() = id);

-- Owners pueden ver su staff
CREATE POLICY "Owners can view their staff"
  FOR SELECT USING (auth.uid() = owner_id);
```

**Tabla `wines`:**
```sql
-- Solo usuarios del mismo owner pueden ver vinos
CREATE POLICY "users_can_view_wines"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.owner_id = wines.owner_id
    )
  );
```

#### Fortalezas:
- ✅ Aislamiento total entre owners
- ✅ Validación en base de datos (no puede ser bypaseada)
- ✅ Políticas granulares por operación (SELECT, INSERT, UPDATE, DELETE)

#### Debilidades:
- ⚠️ No hay auditoría de accesos
- ⚠️ No hay logging de cambios en datos sensibles
- ⚠️ Las políticas RLS pueden ser complejas y difíciles de mantener

---

### 4. **Capa de Aprobación de Usuarios** ✅

#### Implementación:
- **Estado Inicial:** Los usuarios se crean con `status = 'pending'`
- **Aprobación Manual:** Solo owners/managers pueden aprobar usuarios
- **Verificación de Rol:** El rol se asigna durante la aprobación

#### Flujo:
1. Usuario se registra → `status = 'pending'`
2. Owner/Manager revisa y aprueba → `status = 'active'`
3. Usuario puede acceder al catálogo solo si `status = 'active'`

#### Fortalezas:
- ✅ Control manual de acceso
- ✅ Prevención de acceso no autorizado
- ✅ Trazabilidad (campo `approved_by` y `approved_at`)

#### Debilidades:
- ⚠️ No hay notificación automática al owner cuando hay usuarios pendientes
- ⚠️ No hay límite de tiempo para aprobación
- ⚠️ No hay rechazo explícito (solo queda en pending)

---

### 5. **Capa de Validación de Username** ✅

#### Implementación:
- **Unicidad:** Índice único `(username, owner_id)` para usuarios activos
- **Validación de Formato:** Regex `/^[a-zA-Z0-9_]{6,}$/` (mínimo 6 caracteres)
- **Verificación en RPC:** Se valida que el username no esté en uso antes de crear

#### Código:
```sql
-- Índice único
CREATE UNIQUE INDEX idx_users_username_owner 
ON public.users(username, owner_id) 
WHERE username IS NOT NULL AND status = 'active';

-- Validación en RPC
IF EXISTS (
  SELECT 1 FROM public.users 
  WHERE username = p_username 
  AND owner_id = v_owner_id 
  AND status = 'active'
) THEN
  RAISE EXCEPTION 'El nombre de usuario ya está en uso';
END IF;
```

#### Fortalezas:
- ✅ Prevención de duplicados
- ✅ Validación en servidor
- ✅ Aislamiento por owner

#### Debilidades:
- ⚠️ No hay protección contra enumeración de usernames
- ⚠️ No hay rate limiting en registro
- ⚠️ Los usernames pueden ser predecibles

---

## 🚨 Vulnerabilidades Identificadas

### 🔴 CRÍTICAS

1. **Falta de Rate Limiting**
   - **Riesgo:** Ataques de fuerza bruta en login y registro
   - **Impacto:** Alto
   - **Recomendación:** Implementar rate limiting en Supabase Edge Functions o usar servicios como Cloudflare

2. **Email Ficticio Predecible**
   - **Riesgo:** Si se conoce el owner_id, se puede predecir el email ficticio
   - **Impacto:** Medio-Alto
   - **Recomendación:** Agregar salt aleatorio al email ficticio

3. **Falta de Auditoría**
   - **Riesgo:** No hay registro de accesos, cambios o intentos fallidos
   - **Impacto:** Medio
   - **Recomendación:** Implementar tabla de auditoría

### 🟡 MEDIAS

4. **No hay 2FA**
   - **Riesgo:** Si se compromete la contraseña, acceso total
   - **Impacto:** Medio
   - **Recomendación:** Implementar 2FA opcional para roles administrativos

5. **Tokens QR No Revocados Automáticamente**
   - **Riesgo:** Tokens expirados permanecen en BD
   - **Impacto:** Bajo-Medio
   - **Recomendación:** Job periódico para limpiar tokens expirados

6. **Falta de Notificaciones de Seguridad**
   - **Riesgo:** Owners no son notificados de nuevos registros
   - **Impacto:** Bajo-Medio
   - **Recomendación:** Implementar notificaciones push/email

### 🟢 BAJAS

7. **Validación de Password Débil**
   - **Riesgo:** Passwords débiles pueden ser adivinados
   - **Impacto:** Bajo
   - **Recomendación:** Validar complejidad de password (mayúsculas, números, símbolos)

8. **Falta de Logging Detallado**
   - **Riesgo:** Dificultad para investigar incidentes
   - **Impacto:** Bajo
   - **Recomendación:** Implementar logging estructurado

---

## 🛡️ Recomendaciones de Mejora

### Prioridad ALTA 🔴

1. **Implementar Rate Limiting**
   ```typescript
   // Edge Function para rate limiting
   const rateLimiter = {
     maxAttempts: 5,
     windowMs: 15 * 60 * 1000, // 15 minutos
   };
   ```

2. **Agregar Salt Aleatorio al Email Ficticio**
   ```typescript
   const salt = crypto.randomBytes(8).toString('hex');
   const fakeEmail = `${username}_${salt}_${ownerIdShort}@placeholder.com`;
   ```

3. **Implementar Auditoría**
   ```sql
   CREATE TABLE audit_logs (
     id UUID PRIMARY KEY,
     user_id UUID,
     action TEXT,
     resource TEXT,
     details JSONB,
     ip_address TEXT,
     created_at TIMESTAMP
   );
   ```

### Prioridad MEDIA 🟡

4. **Job de Limpieza de Tokens**
   ```sql
   -- Ejecutar diariamente
   DELETE FROM qr_tokens 
   WHERE expires_at < NOW() - INTERVAL '7 days';
   ```

5. **Notificaciones de Seguridad**
   - Push notifications cuando hay usuarios pendientes
   - Email al owner cuando se registra nuevo staff
   - Alertas de intentos fallidos de login

6. **Mejorar Validación de Password**
   ```typescript
   const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
   ```

### Prioridad BAJA 🟢

7. **Implementar 2FA Opcional**
   - TOTP (Google Authenticator, Authy)
   - SMS (menos seguro)
   - Solo para roles administrativos

8. **Logging Estructurado**
   - Usar servicios como Sentry, LogRocket
   - Logs de todas las operaciones críticas
   - Alertas automáticas para patrones sospechosos

---

## 📊 Matriz de Riesgo

| Vulnerabilidad | Probabilidad | Impacto | Riesgo Total | Prioridad |
|---------------|--------------|---------|--------------|-----------|
| Falta de Rate Limiting | Alta | Alto | 🔴 CRÍTICO | ALTA |
| Email Ficticio Predecible | Media | Medio-Alto | 🟡 MEDIO | ALTA |
| Falta de Auditoría | Media | Medio | 🟡 MEDIO | ALTA |
| No hay 2FA | Baja | Medio | 🟡 MEDIO | MEDIA |
| Tokens No Limpiados | Baja | Bajo-Medio | 🟢 BAJO | MEDIA |
| Password Débil | Media | Bajo | 🟢 BAJO | BAJA |

---

## ✅ Puntos Fuertes del Sistema

1. **Aislamiento Total entre Owners**
   - RLS garantiza que los datos están completamente aislados
   - No hay posibilidad de acceso cruzado entre owners

2. **Validación en Servidor**
   - Todas las validaciones críticas están en el servidor
   - No pueden ser bypaseadas desde el cliente

3. **Aprobación Manual**
   - Control humano sobre quién puede acceder
   - Prevención de acceso no autorizado

4. **Tokens con Expiración**
   - Los QR tokens expiran automáticamente
   - Uso único para invitaciones admin

5. **Password Hashing Seguro**
   - Supabase usa bcrypt con salt automático
   - Passwords nunca se almacenan en texto plano

---

## 🎯 Conclusión

El sistema actual tiene **capas de seguridad sólidas** en:
- ✅ Validación de QR tokens
- ✅ Aislamiento de datos (RLS)
- ✅ Aprobación manual de usuarios
- ✅ Password hashing seguro

Sin embargo, hay **áreas de mejora críticas**:
- 🔴 Rate limiting
- 🔴 Email ficticio más seguro
- 🔴 Auditoría de accesos

**Recomendación General:** El sistema es **seguro para uso en producción** con las mejoras de prioridad ALTA implementadas. Las mejoras de prioridad MEDIA y BAJA pueden implementarse gradualmente.

---

## 📝 Checklist de Seguridad para Producción

- [ ] Implementar rate limiting en login y registro
- [ ] Agregar salt aleatorio a emails ficticios
- [ ] Crear tabla de auditoría y registrar accesos críticos
- [ ] Configurar job de limpieza de tokens expirados
- [ ] Implementar notificaciones de seguridad
- [ ] Mejorar validación de password
- [ ] Configurar logging estructurado
- [ ] Documentar procedimientos de respuesta a incidentes
- [ ] Realizar pruebas de penetración
- [ ] Configurar monitoreo y alertas

---

**Última actualización:** 2025-11-20  
**Próxima revisión:** 2025-12-20


