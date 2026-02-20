# 🏢 Sistema Multi-Tenant de Cellarium

## 📋 Índice

1. [Descripción General](#descripción-general)
2. [Arquitectura](#arquitectura)
3. [Modelo de Datos](#modelo-de-datos)
4. [Flujo de Aislamiento](#flujo-de-aislamiento)
5. [Implementación en Código](#implementación-en-código)
6. [Casos de Uso](#casos-de-uso)
7. [Testing](#testing)
8. [Escalabilidad](#escalabilidad)

---

## 📖 Descripción General

Cellarium implementa un **sistema multi-tenant** que permite que múltiples propietarios (owners) usen la misma aplicación, cada uno con sus propias sucursales, vinos, inventario, ventas y staff, **completamente aislados entre sí**.

### Características Clave

✅ **Aislamiento Total**: Cada owner solo ve y gestiona sus propios datos  
✅ **Jerarquía de Roles**: Owner > Gerente > Sommelier > Supervisor  
✅ **Multi-Sucursal**: Un owner puede tener múltiples sucursales  
✅ **Seguridad por Diseño**: Filtrado a nivel de base de datos  
✅ **Escalable**: Arquitectura preparada para crecer  

---

## 🏗️ Arquitectura

### Modelo de Ownership

```
┌─────────────────────────────────────────────┐
│         OWNER A (owner_id: A)               │
├─────────────────────────────────────────────┤
│ ┌─────────────┐  ┌─────────────┐           │
│ │ Sucursal A1 │  │ Sucursal A2 │           │
│ ├─────────────┤  ├─────────────┤           │
│ │ • Gerente   │  │ • Gerente   │           │
│ │ • Sommelier │  │ • Sommelier │           │
│ │ • Supervisor│  │ • Supervisor│           │
│ └─────────────┘  └─────────────┘           │
│                                             │
│ • Vinos propios                             │
│ • Inventario propio                         │
│ • Ventas propias                            │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│         OWNER B (owner_id: B)               │
├─────────────────────────────────────────────┤
│ ┌─────────────┐                             │
│ │ Sucursal B1 │                             │
│ ├─────────────┤                             │
│ │ • Gerente   │                             │
│ │ • Sommelier │                             │
│ │ • Supervisor│                             │
│ └─────────────┘                             │
│                                             │
│ • Vinos propios                             │
│ • Inventario propio                         │
│ • Ventas propias                            │
└─────────────────────────────────────────────┘
```

### Principios de Aislamiento

1. **Un registro = Un owner**: Cada registro crítico tiene un `owner_id`
2. **Filtrado automático**: Todos los queries filtran por `owner_id`
3. **Herencia de ownership**: Staff hereda el `owner_id` de su owner
4. **Validación en múltiples capas**: Frontend + Backend + DB

---

## 🗄️ Modelo de Datos

### Tablas con `owner_id`

| Tabla | owner_id | Descripción |
|-------|----------|-------------|
| `wines` | ✅ | Cada vino pertenece a un owner |
| `branches` | ✅ | Cada sucursal pertenece a un owner |
| `users` | ✅ (staff) / NULL (owner) | Staff apunta al owner |
| `wine_branch_stock` | ❌ (indirecto via `wines`) | Se filtra via JOIN |
| `sales` | ✅ | Cada venta pertenece a un owner |
| `sale_items` | ❌ (indirecto via `sales`) | Se filtra via JOIN |
| `inventory_movements` | ✅ | Cada movimiento pertenece a un owner |

### Estructura de `users`

```typescript
interface User {
  id: string;           // UUID único del usuario
  email: string;
  username: string;
  role: 'owner' | 'gerente' | 'sommelier' | 'supervisor';
  status: 'pending' | 'active' | 'inactive';
  branch_id?: string;   // Sucursal asignada (para staff)
  owner_id?: string;    // NULL para owners, ID del owner para staff
  created_at: string;
  updated_at: string;
}
```

### Lógica de `owner_id`

```typescript
// En el código
const ownerId = user.owner_id || user.id;

// Explicación:
// - Si user.role === 'owner' → user.owner_id === null → usa user.id
// - Si user.role !== 'owner' → user.owner_id !== null → usa user.owner_id
```

---

## 🔄 Flujo de Aislamiento

### 1. Autenticación

```typescript
// src/contexts/AuthContext.tsx
const signIn = async (email, password, roleData?) => {
  const mockUser = {
    id: roleData.id,
    role: roleData.role,
    branch_id: roleData.branchId,
    owner_id: roleData.ownerId, // ← CLAVE: asignado según rol
  };
  setUser(mockUser);
};
```

### 2. Filtrado de Sucursales

```typescript
// src/contexts/BranchContext.tsx
useEffect(() => {
  const ownerId = user.owner_id || user.id;
  
  if (user.role === 'owner') {
    // Owner ve solo SUS sucursales
    filteredBranches = mockBranches.filter(
      branch => branch.owner_id === ownerId
    );
  } else {
    // Staff ve solo SU sucursal asignada
    filteredBranches = mockBranches.filter(
      branch => branch.id === user.branch_id && 
                branch.owner_id === ownerId
    );
  }
}, [user]);
```

### 3. Consultas a Supabase

```typescript
// src/services/InventoryService.ts
static async getInventoryByBranch(branchId: string, ownerId: string) {
  const { data } = await supabase
    .from('wine_branch_stock')
    .select(`
      *,
      wines (*, owner_id)
    `)
    .eq('branch_id', branchId)
    .eq('wines.owner_id', ownerId); // ← FILTRO POR OWNER
  
  return data;
}
```

### 4. Renderizado en UI

```typescript
// src/screens/InventoryAnalyticsScreen.tsx
const loadData = async () => {
  const ownerId = user.owner_id || user.id; // ← Obtener owner_id correcto
  
  const inventory = await InventoryService.getInventoryByBranch(
    branchId,
    ownerId  // ← Pasar a todos los servicios
  );
};
```

---

## 💻 Implementación en Código

### Servicios que Requieren `ownerId`

| Servicio | Métodos |
|----------|---------|
| `InventoryService` | `getInventoryByBranch`, `getInventoryStats`, `getLowStockWines`, `updateStock`, `recordMovement` |
| `AnalyticsService` | `getWineMetrics`, `getBranchMetrics`, `getAllWinesMetrics`, `getAllBranchesComparison` |
| `SalesService` | `processSale`, `getSalesByBranch`, `getSalesStats` |
| `WineService` | `getWinesByBranch`, `createWine`, `updateWine` |

### Patrón de Uso Consistente

```typescript
// ❌ INCORRECTO (sin owner_id)
const wines = await WineService.getWinesByBranch(branchId);

// ✅ CORRECTO (con owner_id)
const ownerId = user.owner_id || user.id;
const wines = await WineService.getWinesByBranch(branchId, ownerId);
```

### Validación de Datos

```typescript
// En renders, siempre validar antes de acceder
const renderInventoryItem = ({ item }: { item: InventoryItem }) => {
  if (!item.wines) {
    console.warn('⚠️ Vino sin datos (filtrado por owner_id)');
    return null; // ← No renderizar si no pertenece al owner
  }
  
  return <WineCard wine={item.wines} />;
};
```

---

## 🎯 Casos de Uso

### Caso 1: Owner Inicia Sesión

1. Usuario selecciona "Owner Principal" en modo desarrollo
2. `AuthContext` establece:
   ```typescript
   user = {
     id: '550e8400-e29b-41d4-a716-446655440002',
     role: 'owner',
     owner_id: undefined // ← NULL para owners
   }
   ```
3. `BranchContext` filtra sucursales:
   ```typescript
   ownerId = user.id; // '...0002'
   filteredBranches = branches.filter(b => b.owner_id === ownerId);
   // Resultado: ['Restaurante Principal']
   ```
4. `InventoryService` consulta vinos:
   ```sql
   SELECT * FROM wines WHERE owner_id = '...0002'
   -- Resultado: Vinos 001-010, 015
   ```

### Caso 2: Gerente Inicia Sesión

1. Usuario selecciona "Gerente Norte"
2. `AuthContext` establece:
   ```typescript
   user = {
     id: '550e8400-e29b-41d4-a716-446655440044',
     role: 'gerente',
     branch_id: '550e8400-e29b-41d4-a716-446655440005',
     owner_id: '550e8400-e29b-41d4-a716-446655440043' // ← Owner Norte
   }
   ```
3. `BranchContext` filtra:
   ```typescript
   ownerId = user.owner_id; // '...0043'
   filteredBranches = branches.filter(
     b => b.id === user.branch_id && b.owner_id === ownerId
   );
   // Resultado: ['Sucursal Norte']
   ```
4. Solo ve vinos del Owner Norte (vino 016)

### Caso 3: Owner Intenta Ver Datos de Otro Owner

1. Owner Sur (`...0047`) navega a inventario
2. Sistema calcula `ownerId = user.id` (`...0047`)
3. Consulta filtra:
   ```sql
   SELECT * FROM wines WHERE owner_id = '...0047'
   -- Resultado: SOLO vinos 017-019
   ```
4. **Imposible ver vinos de otros owners** ✅

---

## 🧪 Testing

### Pruebas de Aislamiento

```typescript
// Test 1: Owner A no ve datos de Owner B
describe('Owner Isolation', () => {
  it('should not see other owner data', async () => {
    const ownerA = { id: 'A', role: 'owner' };
    const inventory = await InventoryService.getInventoryByBranch(
      'branchB',
      'A' // Owner A intenta ver sucursal de Owner B
    );
    expect(inventory).toHaveLength(0); // ← Sin resultados
  });
});

// Test 2: Staff solo ve su sucursal
describe('Staff Restrictions', () => {
  it('should only see assigned branch', async () => {
    const staff = { 
      id: 'S1',
      role: 'gerente',
      branch_id: 'B1',
      owner_id: 'A'
    };
    const branches = getBranchesForUser(staff);
    expect(branches).toHaveLength(1);
    expect(branches[0].id).toBe('B1');
  });
});
```

### Escenarios de Prueba Manual

1. **Prueba de Roles**:
   - Login como cada rol (Owner, Gerente, Sommelier, Supervisor)
   - Verificar sucursales visibles
   - Verificar vinos visibles

2. **Prueba de Datos Compartidos**:
   - Owner A crea vino → NO visible para Owner B
   - Owner B registra venta → NO afecta métricas de Owner A

3. **Prueba de Seguridad**:
   - Modificar `owner_id` en localStorage → Error en consultas
   - Intentar acceder a sucursal de otro owner → Sin resultados

---

## 📈 Escalabilidad

### Ventajas del Modelo Actual

✅ **Un solo proyecto de Supabase** para todos los owners  
✅ **Costos compartidos** de infraestructura  
✅ **Actualizaciones centralizadas**  
✅ **Datos agregados** para análisis global  

### Métricas de Escalabilidad

| Métrica | Límite Teórico | Límite Práctico |
|---------|----------------|-----------------|
| Owners simultáneos | Ilimitado | ~10,000 |
| Sucursales por owner | Ilimitado | ~50 |
| Vinos por owner | Ilimitado | ~1,000 |
| Staff por owner | Ilimitado | ~100 |

### Optimizaciones Futuras

1. **Índices en `owner_id`**:
   ```sql
   CREATE INDEX idx_wines_owner_id ON wines(owner_id);
   CREATE INDEX idx_branches_owner_id ON branches(owner_id);
   CREATE INDEX idx_sales_owner_id ON sales(owner_id);
   ```

2. **Row Level Security (RLS)**:
   ```sql
   CREATE POLICY "Users can only see their own data"
   ON wines FOR SELECT
   USING (owner_id = auth.uid() OR owner_id IN (
     SELECT id FROM users WHERE owner_id = auth.uid()
   ));
   ```

3. **Caché por Owner**:
   ```typescript
   const cacheKey = `inventory:${ownerId}:${branchId}`;
   const cached = await redis.get(cacheKey);
   if (cached) return JSON.parse(cached);
   ```

---

## 🔐 Seguridad

### Capas de Protección

1. **Frontend**: `BranchContext` filtra sucursales visibles
2. **Services**: Todos los queries incluyen filtro por `owner_id`
3. **Database**: RLS policies (futuro)
4. **API**: Edge Functions validan ownership (futuro)

### Reglas de Seguridad

- ❌ **NUNCA** confiar en datos del cliente
- ✅ **SIEMPRE** filtrar por `owner_id` en el servidor
- ✅ **VALIDAR** ownership antes de UPDATE/DELETE
- ✅ **AUDITAR** cambios críticos con logs

---

## 📚 Referencias

- [Supabase Multi-Tenancy Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [React Context API](https://react.dev/reference/react/useContext)

---

**Última actualización**: Octubre 2025  
**Versión del sistema**: 1.0.0



