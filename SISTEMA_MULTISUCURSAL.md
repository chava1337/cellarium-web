# 🏢 Sistema Multi-Sucursal - Cellarium

## 📊 Resumen del Sistema

El sistema Cellarium está diseñado para gestionar múltiples sucursales de restaurantes, con control de acceso específico por sucursal y roles jerárquicos.

---

## 🔐 Reglas de Acceso por Sucursal

### 👑 **Owner (Dueño)**
- ✅ **Acceso a TODAS las sucursales**
- ✅ **Puede cambiar de sucursal** en cualquier momento
- ✅ **Selector de sucursal visible** con flecha desplegable (▼)
- ✅ **Ve indicador de sucursal** en panel de administración
- ✅ **Puede gestionar sucursales**: Crear, editar, eliminar

### 👨‍💼 **Gerente**
- 🔒 **Acceso SOLO a su sucursal asignada**
- ❌ **NO puede cambiar de sucursal**
- 👁️ **Ve indicador de sucursal** (solo lectura)
- 📍 **Asignado permanentemente** a una sucursal
- ⚠️ **Restricción vinculada al QR** con el que fue invitado

### 🍷 **Sommelier**
- 🔒 **Acceso SOLO a su sucursal asignada**
- ❌ **NO puede cambiar de sucursal**
- 👁️ **Ve indicador de sucursal** (solo lectura)
- 📍 **Asignado permanentemente** a una sucursal
- ⚠️ **Restricción vinculada al QR** con el que fue invitado

### 👀 **Supervisor**
- 🔒 **Acceso SOLO a su sucursal asignada**
- ❌ **NO puede cambiar de sucursal**
- 👁️ **Ve indicador de sucursal** (solo lectura)
- 📍 **Asignado permanentemente** a una sucursal
- ⚠️ **Restricción vinculada al QR** con el que fue invitado

---

## 📱 Sistema de QR por Sucursal

### 🍽️ **QR para Comensales**
- **Vinculado a sucursal**: El QR se genera para una sucursal específica
- **Acceso temporal**: Solo al catálogo de esa sucursal
- **Duración**: 24 horas
- **Generado por**: Cualquier admin de la sucursal
- **Restricción**: Solo muestra vinos de esa sucursal

### 👥 **QR de Invitación Admin**
- **Vinculado a sucursal**: El admin tendrá acceso SOLO a esa sucursal
- **Permanente**: La restricción es permanente (excepto Owner)
- **Duración**: 7 días
- **Uso único**: max_uses = 1
- **Generado por**: Cualquier admin de la sucursal
- **⚠️ IMPORTANTE**: El admin solo tendrá acceso a la sucursal del QR

---

## 🏗️ Flujo de Invitación Multi-Sucursal

### Paso 1: Generación de QR
1. Admin abre "Generación de QR"
2. Selecciona "👥 Invitación Admin"
3. Click en "Generar QR de Invitación"
4. **QR vinculado a sucursal actual del admin**

### Paso 2: Nuevo Admin Escanea QR
1. Nuevo admin escanea el QR
2. Se registra con usuario y contraseña
3. **Queda vinculado a la sucursal del QR**
4. Status: 'pending' (esperando aprobación)

### Paso 3: Aprobación
1. Owner o Gerente revisa solicitud en "Gestión de Usuarios"
2. Verifica información del solicitante
3. Aprueba y asigna rol (Gerente, Sommelier, Supervisor)
4. **Usuario activo con acceso a esa sucursal únicamente**

### Paso 4: Acceso Restringido
1. Nuevo admin inicia sesión
2. **Solo ve datos de su sucursal**
3. **No puede cambiar de sucursal** (excepto Owner)
4. Panel muestra "Sucursal Actual: [Nombre]" sin opción de cambio

---

## 🎯 Indicador de Sucursal en Panel Admin

### Para **Owner**:
```
┌─────────────────────────────────────┐
│ Sucursal Actual:                  ▼ │
│ Restaurante Principal                │
└─────────────────────────────────────┘
```
- **Flecha desplegable (▼)**: Indica que puede cambiar
- **Click**: Abre selector de sucursales
- **Selección**: Cambia a otra sucursal

### Para **Otros Roles** (Gerente, Sommelier, Supervisor):
```
┌─────────────────────────────────────┐
│ Sucursal Actual:                    │
│ Restaurante Principal                │
└─────────────────────────────────────┘
```
- **Sin flecha**: No puede cambiar
- **Click**: Muestra mensaje informativo
- **Bloqueado**: Acceso solo a su sucursal

---

## 🗄️ Base de Datos

### Tabla `users`:
```sql
- branch_id: UUID (sucursal asignada)
- invited_by: UUID (quién generó el QR)
- approved_by: UUID (quién aprobó al usuario)
- approved_at: TIMESTAMP (cuándo fue aprobado)
```

### Tabla `qr_tokens`:
```sql
- branch_id: UUID (sucursal del QR)
- type: 'guest' | 'admin_invite'
- max_uses: INT (1 para invitaciones admin)
- uses_count: INT (contador de usos)
- created_by: UUID (admin que generó el QR)
```

---

## 🔒 Políticas RLS (Row Level Security)

### Restricción por Sucursal:
```sql
-- Los usuarios solo ven datos de su sucursal
WHERE users.branch_id = data.branch_id

-- Excepto Owner que ve todo
OR users.role = 'owner'
```

### Validación de Acceso:
- **Status activo**: Solo usuarios 'active' acceden
- **Branch ID**: Solo datos de su sucursal
- **Rol verificado**: Permisos según rol

---

## 📋 Casos de Uso

### Caso 1: Owner gestiona múltiples sucursales
1. Owner inicia sesión
2. Ve "Sucursal Actual: Restaurante Principal"
3. Click en selector → Ve lista de 3 sucursales
4. Selecciona "Sucursal Centro"
5. Ahora gestiona Sucursal Centro
6. Puede volver a cambiar cuando quiera

### Caso 2: Gerente limitado a su sucursal
1. Gerente de "Sucursal Norte" inicia sesión
2. Ve "Sucursal Actual: Sucursal Norte"
3. Click en selector → Solo ve mensaje informativo
4. **NO puede cambiar** a otra sucursal
5. Solo gestiona Sucursal Norte permanentemente

### Caso 3: Invitación vinculada a sucursal
1. Admin en "Restaurante Principal" genera QR de invitación
2. QR vinculado a "Restaurante Principal"
3. Nuevo admin escanea y registra
4. **Queda asignado permanentemente** a "Restaurante Principal"
5. Solo puede gestionar esa sucursal (excepto si es aprobado como Owner)

---

## 🎨 Interfaz de Usuario

### Indicador de Sucursal:
- **Posición**: Header del panel de administración
- **Tamaño**: Compacto, no intrusivo
- **Color**: Gris claro con texto en color vino
- **Interacción**: Click para Owner, solo vista para otros

### Modal de Selección (Owner):
- **Estilo**: Modal centrado con overlay semi-transparente
- **Contenido**: Lista de todas las sucursales
- **Indicador**: Checkmark (✓) en sucursal actual
- **Información**: Nombre y dirección de cada sucursal
- **Cierre**: Click fuera del modal

---

## 🚀 Próximas Mejoras

- [ ] Gestión de sucursales (crear, editar, eliminar) - Solo Owner
- [ ] Dashboard por sucursal con estadísticas específicas
- [ ] Transferencia de admins entre sucursales - Solo Owner
- [ ] Reportes consolidados de todas las sucursales - Solo Owner
- [ ] Configuración independiente por sucursal
- [ ] Inventario separado por sucursal
- [ ] Análisis comparativo entre sucursales
