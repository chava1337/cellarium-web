# 🔒 Verificación del Sistema de Aislamiento por Owner

## 🎯 **Objetivo del Sistema Multi-Tenant**

Cada Owner registrado debe tener su propio "universo" completamente aislado:
- ✅ **Sucursales propias** (puede crear ilimitadas)
- ✅ **Staff propio** (puede gestionar ilimitados admins)
- ✅ **Vinos propios** (catálogo independiente)
- ✅ **Inventario propio** (stock por sucursal)
- ✅ **Ventas propias** (análisis independiente)
- ✅ **QR propios** (tokens únicos por owner)

**❌ NINGÚN Owner debe ver datos de otro Owner**

---

## 📋 **Estado Actual del Sistema**

### ✅ **Lo que SÍ está implementado:**
1. **Jerarquías de roles** (Owner, Gerente, Sommelier, Supervisor)
2. **Control de acceso por rol** (permisos correctos)
3. **Filtrado por sucursal** (Gerentes solo ven su sucursal)
4. **Gestión de usuarios** con restricciones jerárquicas

### ❌ **Lo que FALTA implementar:**
1. **`owner_id` en todas las tablas** principales
2. **Filtrado por `owner_id`** en todos los servicios
3. **RLS (Row Level Security)** policies en Supabase
4. **Asignación automática** de `owner_id` en inserts
5. **Usuario.owner_id** debe apuntar al Owner del "universo"

---

## 🗄️ **Tablas que DEBEN tener `owner_id`:**

| Tabla | Estado | Notas |
|-------|--------|-------|
| `branches` | ⚠️ **Verificar** | Cada sucursal pertenece a un Owner |
| `users` | ⚠️ **Verificar** | Cada usuario pertenece a un "universo" |
| `wines` | ⚠️ **Verificar** | Cada vino pertenece a un Owner |
| `wine_branch_stock` | ⚠️ **Verificar** | Stock aislado por Owner |
| `sales` | ⚠️ **Verificar** | Ventas aisladas por Owner |
| `sale_items` | ⚠️ **Verificar** | Items de venta aislados |
| `qr_tokens` | ⚠️ **Verificar** | QR únicos por Owner |
| `guest_sessions` | ⚠️ **Verificar** | Sesiones aisladas |
| `inventory_movements` | ⚠️ **Verificar** | Movimientos aislados |

---

## 🔧 **Migraciones Necesarias**

### **1. Verificar si ya se aplicaron:**
```sql
-- Verificar si existe owner_id en branches
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'branches' AND column_name = 'owner_id';

-- Verificar si existe owner_id en users
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'owner_id';

-- Verificar si existe owner_id en wines
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'wines' AND column_name = 'owner_id';
```

### **2. Si NO existen, aplicar:**
- `supabase/migrations/001_add_owner_isolation_safe.sql`
- `supabase/migrations/002_add_rls_policies_safe.sql`

---

## 🔨 **Servicios que DEBEN filtrar por `owner_id`:**

### **1. WineService:**
```typescript
// ❌ ACTUAL (sin filtro)
.from('wine_branch_stock')
.select('...')
.eq('branch_id', branchId)

// ✅ CORRECTO (con filtro)
.from('wine_branch_stock')
.select('...')
.eq('branch_id', branchId)
.eq('wines.owner_id', currentUser.owner_id || currentUser.id)
```

### **2. InventoryService:**
```typescript
// ❌ ACTUAL (sin filtro)
.from('wine_branch_stock')
.select('...')
.eq('branch_id', branchId)

// ✅ CORRECTO (con filtro)
.from('wine_branch_stock')
.select('...')
.eq('branch_id', branchId)
.eq('owner_id', currentUser.owner_id || currentUser.id)
```

### **3. AnalyticsService:**
```typescript
// ❌ ACTUAL (sin filtro)
.from('branches')
.select('id')

// ✅ CORRECTO (con filtro)
.from('branches')
.select('id')
.eq('owner_id', currentUser.owner_id || currentUser.id)
```

### **4. UserManagementScreen:**
```typescript
// ✅ YA ESTÁ CORRECTO (filtra por sucursal)
// Pero debe agregar owner_id adicional
```

---

## 🔐 **RLS (Row Level Security) Policies**

Las policies deben garantizar que:

```sql
-- 1. Usuarios solo ven datos de su Owner
CREATE POLICY "users_isolation" ON users
  FOR ALL
  USING (
    owner_id = (SELECT owner_id FROM users WHERE id = auth.uid())
    OR id = auth.uid()
  );

-- 2. Sucursales solo del Owner
CREATE POLICY "branches_isolation" ON branches
  FOR ALL
  USING (
    owner_id = (SELECT COALESCE(owner_id, id) FROM users WHERE id = auth.uid())
  );

-- 3. Vinos solo del Owner
CREATE POLICY "wines_isolation" ON wines
  FOR ALL
  USING (
    owner_id = (SELECT COALESCE(owner_id, id) FROM users WHERE id = auth.uid())
  );
```

---

## 📝 **Lógica de `owner_id`:**

### **Para Owners:**
```typescript
user.owner_id = user.id  // El Owner es su propio "universo"
```

### **Para Staff (Gerente, Sommelier, Supervisor):**
```typescript
user.owner_id = owner.id  // Apunta al Owner que los invitó
```

### **Ejemplo:**
```
👑 Owner Principal (ID: 001)
  ├── user.id = 001
  ├── user.owner_id = 001 (apunta a sí mismo)
  └── "Universo": Todas sus sucursales, staff, vinos

👔 Gerente Norte (ID: 044)
  ├── user.id = 044
  ├── user.owner_id = 001 (apunta al Owner Principal)
  └── "Universo": Mismo que Owner Principal
```

---

## 🧪 **Pruebas de Aislamiento**

### **Test 1: Owner A no ve datos de Owner B**
1. Login como Owner A (`admin@cellarium.com`)
2. Crear una sucursal "Test A"
3. Login como Owner B (`owner.norte@cellarium.com`)
4. **Verificar**: NO debe ver "Test A"

### **Test 2: Staff solo ve su Owner**
1. Login como Gerente de Owner A
2. **Verificar**: Solo ve sucursales, vinos y staff de Owner A
3. Login como Gerente de Owner B
4. **Verificar**: Solo ve sucursales, vinos y staff de Owner B

---

## ✅ **Checklist de Implementación**

- [ ] Verificar columnas `owner_id` en todas las tablas
- [ ] Aplicar migraciones `001` y `002` si faltan
- [ ] Actualizar todos los servicios para filtrar por `owner_id`
- [ ] Implementar RLS policies en Supabase
- [ ] Actualizar `User` interface para incluir `owner_id`
- [ ] Modificar `AuthContext` para incluir `owner_id` correcto
- [ ] Agregar `owner_id` a todos los `INSERT` statements
- [ ] Probar aislamiento entre diferentes Owners

---

## 🚀 **Próximos Pasos**

1. **Verificar estado actual** de la BD (¿tienen las tablas `owner_id`?)
2. **Aplicar migraciones** faltantes
3. **Actualizar servicios** para filtrar por `owner_id`
4. **Implementar RLS** en Supabase
5. **Probar aislamiento** con múltiples Owners

**¿Procedemos con la implementación?**




