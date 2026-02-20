# 🔄 Flujos Corregidos - App Pública

## 📱 **Flujo Principal Correcto**

### **1. 🏠 Pantalla Inicial (Splash/Onboarding)**
```
┌─────────────────────────────────┐
│         🍷 Cellarium            │
│                                 │
│  [REGISTRARSE COMO OWNER]       │ ← Google OAuth
│                                 │
│  [ESCANEAR QR DE INVITACIÓN]    │ ← Solo para staff/comensales
│                                 │
└─────────────────────────────────┘
```

### **2. 👑 Registro de Owner (Primera vez)**
```
┌─────────────────────────────────┐
│    REGISTRO DE OWNER            │
│                                 │
│  🔐 Google OAuth                │
│                                 │
│  → Crea cuenta Owner            │
│  → Configura primera sucursal   │
│  → Acceso completo a la app     │
│                                 │
└─────────────────────────────────┘
```

### **3. 📱 Acceso via QR (Staff/Comensales)**
```
┌─────────────────────────────────┐
│    ESCANEAR QR                  │
│                                 │
│  📷 QR Scanner                  │
│                                 │
│  → Valida token                 │
│  → Determina tipo de acceso:    │
│    • Comensal → Solo catálogo   │
│    • Staff → Catálogo + Panel   │
│                                 │
└─────────────────────────────────┘
```

---

## 🔐 **Sistema de Aislamiento por Owner**

### **Estructura de Datos:**
```
Owner A (Restaurante A)
├── Sucursal A1
│   ├── Catálogo A1
│   ├── Staff A1 (invitados por QR)
│   └── QR Comensales A1
├── Sucursal A2
│   ├── Catálogo A2
│   └── QR Comensales A2

Owner B (Restaurante B)  ← COMPLETAMENTE AISLADO
├── Sucursal B1
│   ├── Catálogo B1
│   └── QR Comensales B1
```

### **Reglas de Aislamiento:**
1. **Owner solo ve sus datos** - RLS por `owner_id`
2. **Staff solo ve datos de su Owner** - RLS por `owner_id`
3. **Comensales solo ven catálogo específico** - RLS por `qr_token.branch_id`
4. **QRs son únicos por Owner** - No pueden acceder a otros Owners

---

## 📋 **Pantallas Necesarias**

### **1. 🏠 Pantalla Principal (Nueva)**
- **Registrarse como Owner** (Google OAuth)
- **Escanear QR de invitación**
- **Información sobre la app**

### **2. 👑 Owner Dashboard**
- **Gestión de Sucursales**
- **Crear QR para Staff**
- **Crear QR para Comensales**
- **Gestión de Vinos**
- **Panel de Control Completo**

### **3. 👥 Staff Dashboard**
- **Acceso limitado según permisos**
- **Solo datos de su Owner**
- **Funciones según rol asignado**

### **4. 🍷 Catálogo de Vinos**
- **Solo vinos de la sucursal del QR**
- **Sin acceso a panel admin** (para comensales)
- **Con acceso a panel admin** (para staff)

---

## 🔧 **Implementación Técnica**

### **Autenticación:**
```typescript
// Owner inicial
const owner = await signInWithGoogle(); // Primera vez
await createOwnerAccount(owner);

// Staff via QR
const qrData = await scanQR();
const staff = await validateQRToken(qrData);
await createStaffAccount(staff, qrData.owner_id);
```

### **RLS (Row Level Security):**
```sql
-- Solo ver datos de tu Owner
CREATE POLICY "Users can only see their owner's data" 
ON wines FOR ALL 
USING (owner_id = auth.jwt() ->> 'owner_id');

-- Solo ver datos de tu sucursal
CREATE POLICY "Users can only see their branch data" 
ON wine_branch_stock FOR ALL 
USING (branch_id = auth.jwt() ->> 'branch_id');
```

### **Validación de QR:**
```typescript
interface QRToken {
  type: 'guest' | 'staff_invite';
  owner_id: string;
  branch_id: string;
  permissions: string[];
  expires_at: string;
  max_uses?: number;
}
```

---

## 🚀 **Plan de Implementación**

### **Fase 1: Pantalla Principal**
- [ ] Crear pantalla de onboarding
- [ ] Implementar Google OAuth
- [ ] Separar registro de Owner vs QR

### **Fase 2: Sistema de Aislamiento**
- [ ] Implementar RLS en Supabase
- [ ] Añadir `owner_id` a todas las tablas
- [ ] Validar aislamiento de datos

### **Fase 3: QR System Mejorado**
- [ ] QR específicos por Owner
- [ ] Validación de tokens
- [ ] Redirección correcta según tipo

### **Fase 4: Permisos y Roles**
- [ ] Sistema de permisos granular
- [ ] Roles específicos por Owner
- [ ] Dashboard adaptativo

---

## 🎯 **Resultado Final**

### **Para Owner:**
- App completa como panel de control
- Gestión total de sus restaurantes
- Invitación controlada de staff
- QR para comensales

### **Para Staff:**
- Acceso via QR del Owner
- Permisos limitados según asignación
- Solo datos del Owner que los invitó
- Funciones según rol

### **Para Comensales:**
- Acceso via QR específico del restaurante
- Solo catálogo de vinos de esa sucursal
- Sin acceso a panel administrativo
- Experiencia enfocada en selección

### **Aislamiento Garantizado:**
- Cada Owner tiene su "universo" separado
- Imposible acceder a datos de otros Owners
- QR específicos y únicos
- Privacidad total entre restaurantes


