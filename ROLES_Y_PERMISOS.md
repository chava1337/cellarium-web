# 🔐 Sistema de Roles y Permisos - Cellarium

## 📊 Jerarquía de Roles

### 1. 🏆 **Dueño (Owner)**
**Admin Maestro del Sistema**

#### Permisos:
- ✅ Acceso completo a todas las funcionalidades
- ✅ Puede aprobar todos los roles (Gerente, Sommelier, Supervisor)
- ✅ Gestión de vinos con IA
- ✅ Control de inventario completo
- ✅ Análisis y reportes globales
- ✅ Gestión de promociones
- ✅ Generación de QR (comensales e invitaciones)
- ✅ Catas y degustaciones
- ✅ Gestión de usuarios (aprobar, desactivar, asignar roles)
- ✅ Configuración del sistema

#### Características:
- Es el primer usuario que crea la cuenta
- No puede ser desactivado
- Puede otorgar cualquier tipo de permiso

---

### 2. 👨‍💼 **Gerente**
**Segundo al mando con permisos de gestión**

#### Permisos:
- ✅ Gestión de vinos con IA
- ✅ Control de inventario
- ✅ Análisis y reportes de sucursal
- ✅ Gestión de promociones
- ✅ Generación de QR (comensales e invitaciones)
- ✅ Catas y degustaciones
- ✅ Puede aprobar: Sommelier y Supervisor
- ❌ No puede aprobar: Gerentes (solo Owner)

#### Características:
- Requiere aprobación de Owner
- Puede otorgar permisos limitados
- Acceso a catas y degustaciones

---

### 3. 🍷 **Sommelier**
**Especialista en vinos con acceso a catas**

#### Permisos:
- ✅ Gestión de vinos con IA
- ✅ Control de inventario (lectura y registro)
- ✅ Análisis básicos
- ✅ Generación de QR (comensales e invitaciones)
- ✅ **Catas y degustaciones** (Exclusivo)
- ❌ No puede aprobar usuarios
- ❌ No puede gestionar promociones

#### Características:
- Requiere aprobación de Owner o Gerente
- Acceso especial a catas y degustaciones
- No puede otorgar permisos a nadie

---

### 4. 👀 **Supervisor**
**Acceso básico de supervisión**

#### Permisos:
- ✅ Gestión de vinos (lectura y registro)
- ✅ Control de inventario (lectura)
- ✅ Análisis básicos
- ✅ Generación de QR (comensales e invitaciones)
- ❌ No puede aprobar usuarios
- ❌ No puede gestionar promociones
- ❌ No puede acceder a catas y degustaciones

#### Características:
- Requiere aprobación de Owner o Gerente
- Acceso más limitado que Sommelier
- No puede otorgar permisos a nadie

---

## 🎯 Sistema de Aprobación

### Flujo de Registro:
1. **Usuario solicita acceso** con nombre de usuario y contraseña
2. **Solicitud queda pendiente** (status: 'pending')
3. **Owner o Gerente revisa** la solicitud en Gestión de Usuarios
4. **Aprobación o rechazo** según permisos del aprobador
5. **Usuario activado** (status: 'active') si es aprobado
6. **Auditoría registrada** (quién invitó, quién aprobó, cuándo)

### Matriz de Aprobaciones:

| Rol del Aprobador | Puede Aprobar |
|-------------------|---------------|
| Owner | Gerente, Sommelier, Supervisor |
| Gerente | Sommelier, Supervisor |
| Sommelier | Ninguno |
| Supervisor | Ninguno |

---

## 📱 Sistema de Generación de QR

### Tipos de QR:

#### 1. 🍽️ **QR para Comensales**
- **Acceso**: Todos los roles pueden generar
- **Duración**: 24 horas de caducidad
- **Uso**: Único (one-time use)
- **Permisos**: Solo lectura del catálogo
- **Características**:
  - Token firmado en Edge Function
  - Sin registro requerido
  - Acceso temporal al catálogo
  - RLS: solo datos públicos

#### 2. 👥 **QR de Invitación Admin**
- **Acceso**: Todos los roles pueden generar
- **Aprobación**: Solo Owner/Gerente aprueban
- **Uso**: Único (max_uses = 1)
- **Proceso**:
  1. Admin genera QR de invitación
  2. Nuevo usuario escanea y registra datos
  3. Solicitud queda pendiente
  4. Owner/Gerente aprueba y asigna rol
  5. Usuario obtiene acceso activo

---

## 🔒 Seguridad y Control

### Políticas de Seguridad (RLS):
- **Usuarios pending**: Sin acceso al panel ni datos sensibles
- **Usuarios active**: Acceso según rol y permisos
- **Tokens QR**: Firmados con clave secreta en Edge Function
- **Validación**: En cada solicitud (revoked, expires_at, max_uses)
- **Scope**: Por sucursal y permisos de rol

### Auditoría:
- Quién invitó (invited_by)
- Quién aprobó (approved_by)
- Cuándo se aprobó (approved_at)
- Desde qué sucursal (branch_id)
- Estado del usuario (status)

---

## 🎨 Funcionalidades por Rol

### Gestión de Usuarios:
- **Owner**: ✅ Visible y accesible
- **Gerente**: ✅ Visible y accesible
- **Sommelier**: ❌ No visible
- **Supervisor**: ❌ No visible

### Catas y Degustaciones:
- **Owner**: ✅ Visible y accesible
- **Gerente**: ✅ Visible y accesible
- **Sommelier**: ✅ Visible y accesible
- **Supervisor**: ❌ No visible

### Generación de QR:
- **Todos los roles**: ✅ Visible y accesible
- **QR Comensales**: Todos pueden generar
- **QR Invitación**: Todos pueden generar, solo Owner/Gerente aprueban

---

## 📝 Notas de Implementación

### Base de Datos:
- Tabla `users` actualizada con campos de auditoría
- Índices para búsquedas eficientes
- Triggers para updated_at
- RLS configurado por rol y estado

### Frontend:
- Utilidad `permissions.ts` para validación de permisos
- Pantallas específicas por funcionalidad
- Validación de acceso en cada pantalla
- UI adaptativa según rol del usuario

### Backend (Supabase):
- Edge Functions para generación de tokens QR
- Validación de permisos en RLS
- Auditoría automática de acciones
- Notificaciones de solicitudes pendientes
