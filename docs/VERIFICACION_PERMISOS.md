# 🔒 Verificación de Permisos por Jerarquías

## ✅ **Sistema de Control de Acceso Implementado**

### 🎯 **Funcionamiento:**

#### **👑 Owner (Cualquier Sucursal):**
- ✅ **Acceso a TODAS las sucursales** (3 sucursales disponibles)
- ✅ **Selector de sucursal visible** en Panel Admin
- ✅ **Comparaciones multi-sucursal** en Analytics
- ✅ **Todas las funciones administrativas** habilitadas

#### **👔 Gerente:**
- ✅ **Solo su sucursal asignada** (1 sucursal visible)
- ❌ **Sin selector de sucursal** (no aparece el botón)
- ❌ **Sin comparaciones multi-sucursal**
- ✅ **Funciones administrativas limitadas** (según permisos)

#### **🍷 Sommelier:**
- ✅ **Solo su sucursal asignada** (1 sucursal visible)
- ❌ **Sin selector de sucursal**
- ❌ **Sin comparaciones multi-sucursal**
- ✅ **Funciones de gestión de vinos**

#### **👨‍💼 Supervisor:**
- ✅ **Solo su sucursal asignada** (1 sucursal visible)
- ❌ **Sin selector de sucursal**
- ❌ **Sin comparaciones multi-sucursal**
- ✅ **Vista de inventario** (solo lectura)

---

## 🧪 **Cómo Probar los Permisos:**

### **1. Aplicar la Migración:**
```sql
-- Copiar y ejecutar en Supabase SQL Editor:
supabase/migrations/005_complete_mock_data.sql
```

### **2. Probar Cada Jerarquía:**

#### **👑 Probar Owner:**
1. **Login** → "🚀 Modo Desarrollo" → **Seleccionar cualquier Owner**
2. **Verificar:** Panel Admin muestra **botón de selector de sucursal**
3. **Verificar:** Puede cambiar entre **todas las sucursales**
4. **Verificar:** Pestaña "Comparar" **disponible** en Inventario y Análisis

#### **👔 Probar Gerente:**
1. **Login** → "🚀 Modo Desarrollo" → **Seleccionar Gerente Norte/Sur**
2. **Verificar:** Panel Admin **NO muestra** selector de sucursal
3. **Verificar:** Solo ve **su sucursal asignada**
4. **Verificar:** Pestaña "Comparar" **NO disponible**

#### **🍷 Probar Sommelier:**
1. **Login** → "🚀 Modo Desarrollo" → **Seleccionar Sommelier**
2. **Verificar:** Solo ve **su sucursal asignada**
3. **Verificar:** **Sin selector de sucursal**
4. **Verificar:** Funciones de **gestión de vinos** disponibles

#### **👨‍💼 Probar Supervisor:**
1. **Login** → "🚀 Modo Desarrollo" → **Seleccionar Supervisor**
2. **Verificar:** Solo ve **su sucursal asignada**
3. **Verificar:** **Sin selector de sucursal**
4. **Verificar:** Solo **vista de inventario** (lectura)

---

## 📊 **Datos de Prueba Disponibles:**

### **🏢 Sucursales:**
| Sucursal | UUID | Usuarios Disponibles |
|----------|------|---------------------|
| **Restaurante Principal** | `550e8400-e29b-41d4-a716-446655440001` | Owner, Gerente, Sommelier, Supervisor |
| **Sucursal Norte** | `550e8400-e29b-41d4-a716-446655440005` | Owner, Gerente, Sommelier, Supervisor |
| **Sucursal Sur** | `550e8400-e29b-41d4-a716-446655440006` | Owner, Gerente, Sommelier, Supervisor |

### **👥 Usuarios por Sucursal:**

#### **Restaurante Principal:**
- 👑 **Owner Principal**: `admin@cellarium.com`
- 👔 **Gerente Principal**: `gerente.principal@cellarium.com`
- 🍷 **Sommelier Principal**: `sommelier.principal@cellarium.com`
- 👨‍💼 **Supervisor Principal**: `supervisor.principal@cellarium.com`

#### **Sucursal Norte:**
- 👑 **Owner Norte**: `owner.norte@cellarium.com`
- 👔 **Gerente Norte**: `gerente.norte@cellarium.com`
- 🍷 **Sommelier Norte**: `sommelier.norte@cellarium.com`
- 👨‍💼 **Supervisor Norte**: `supervisor.norte@cellarium.com`

#### **Sucursal Sur:**
- 👑 **Owner Sur**: `owner.sur@cellarium.com`
- 👔 **Gerente Sur**: `gerente.sur@cellarium.com`
- 🍷 **Sommelier Sur**: `sommelier.sur@cellarium.com`
- 👨‍💼 **Supervisor Sur**: `supervisor.sur@cellarium.com`

---

## 🔍 **Puntos de Verificación:**

### **✅ AuthContext:**
- ✅ **signIn** recibe `roleData` y configura usuario correcto
- ✅ **Usuario configurado** con rol, branch_id y datos correctos
- ✅ **Sucursal configurada** según el usuario autenticado

### **✅ BranchContext:**
- ✅ **Filtrado dinámico** de sucursales según rol del usuario
- ✅ **Owner ve todas** las sucursales (3)
- ✅ **Otros roles ven solo su sucursal** asignada (1)

### **✅ RoleSelector:**
- ✅ **12 opciones de roles** organizadas por sucursal
- ✅ **IDs correctos** de usuarios de la migración
- ✅ **Datos completos** (email, rol, branch_id, etc.)

### **✅ AdminDashboardScreen:**
- ✅ **Selector de sucursal** solo visible para Owner
- ✅ **Funciones administrativas** según jerarquía

### **✅ InventoryAnalyticsScreen:**
- ✅ **Pestaña "Comparar"** solo disponible para Owner
- ✅ **Datos filtrados** por sucursal del usuario

---

## 🚨 **Errores a Reportar:**

Si encuentras alguno de estos problemas, repórtalos:

1. **Owner ve menos de 3 sucursales**
2. **Gerente/Sommelier/Supervisor ve más de 1 sucursal**
3. **Selector de sucursal visible para roles no-Owner**
4. **Pestaña "Comparar" visible para roles no-Owner**
5. **Datos de sucursal incorrecta** en inventario/analytics
6. **Error de autenticación** al seleccionar rol

---

## 🎯 **Resultado Esperado:**

Después de aplicar la migración y probar:

- ✅ **12 usuarios** con jerarquías correctas
- ✅ **3 sucursales** con datos únicos
- ✅ **Control de acceso** funcionando perfectamente
- ✅ **Permisos por rol** respetados en toda la app

**¡El sistema de jerarquías está listo para probar!** 🚀






