# 🚀 Plan de Implementación - App Pública

## 📋 **Checklist de Correcciones Necesarias**

### **1. 🏠 Pantalla Principal Nueva**

#### **Crear `WelcomeScreen.tsx`:**
```typescript
// Pantalla inicial para usuarios nuevos
- Botón "Registrarse como Owner" (Google OAuth)
- Botón "Escanear QR de invitación"
- Información sobre la app
- Sin acceso directo a catálogo
```

#### **Modificar `LoginScreen.tsx`:**
```typescript
// Solo para Owners ya registrados
- Eliminar modo desarrollo
- Solo Google OAuth
- Solo para Owners existentes
```

### **2. 🔐 Sistema de Autenticación**

#### **Flujo de Owner (Primera vez):**
```typescript
Google OAuth → Crear Owner → Configurar primera sucursal → Dashboard completo
```

#### **Flujo de Staff (Via QR):**
```typescript
Escanear QR → Validar token → Crear cuenta staff → Acceso limitado
```

#### **Flujo de Comensal (Via QR):**
```typescript
Escanear QR → Validar token → Acceso solo a catálogo
```

### **3. 🏢 Aislamiento por Owner**

#### **Base de Datos:**
```sql
-- Agregar owner_id a todas las tablas principales
ALTER TABLE branches ADD COLUMN owner_id UUID REFERENCES auth.users(id);
ALTER TABLE wines ADD COLUMN owner_id UUID REFERENCES auth.users(id);
ALTER TABLE users ADD COLUMN owner_id UUID REFERENCES auth.users(id);

-- RLS Policies
CREATE POLICY "owner_isolation" ON wines 
FOR ALL USING (owner_id = auth.uid());

CREATE POLICY "branch_isolation" ON wine_branch_stock 
FOR ALL USING (
  branch_id IN (
    SELECT id FROM branches WHERE owner_id = auth.uid()
  )
);
```

### **4. 📱 Navegación Corregida**

#### **Stack Navigator Actualizado:**
```typescript
const RootStack = {
  Welcome: undefined,           // Nueva pantalla inicial
  OwnerRegistration: undefined, // Registro de Owner
  QRScanner: undefined,         // Escanear QR
  OwnerLogin: undefined,        // Login de Owner
  StaffLogin: undefined,        // Login de Staff (via QR)
  OwnerDashboard: undefined,    // Dashboard completo
  StaffDashboard: undefined,    // Dashboard limitado
  WineCatalog: { 
    branchId: string; 
    isGuest: boolean; 
    ownerId: string; 
  },
  // ... resto de pantallas
}
```

---

## 🔧 **Implementación Paso a Paso**

### **Paso 1: Crear Pantalla Principal**

#### **1.1 Crear `WelcomeScreen.tsx`:**
```typescript
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const WelcomeScreen = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🍷 Cellarium</Text>
      <Text style={styles.subtitle}>
        Sistema de gestión de catálogo de vinos para restaurantes
      </Text>
      
      <TouchableOpacity 
        style={styles.primaryButton}
        onPress={() => navigation.navigate('OwnerRegistration')}
      >
        <Text style={styles.buttonText}>Registrarse como Owner</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.secondaryButton}
        onPress={() => navigation.navigate('QRScanner')}
      >
        <Text style={styles.buttonText}>Escanear QR de invitación</Text>
      </TouchableOpacity>
      
      <Text style={styles.info}>
        ¿Eres dueño de un restaurante? Regístrate para comenzar.{'\n'}
        ¿Trabajas en un restaurante? Escanea el QR que te proporcionaron.
      </Text>
    </View>
  );
};
```

#### **1.2 Actualizar `App.tsx`:**
```typescript
// Cambiar initialRouteName a 'Welcome'
<Stack.Navigator initialRouteName="Welcome">
  <Stack.Screen name="Welcome" component={WelcomeScreen} />
  <Stack.Screen name="OwnerRegistration" component={OwnerRegistrationScreen} />
  // ... resto de pantallas
</Stack.Navigator>
```

### **Paso 2: Sistema de Autenticación**

#### **2.1 Crear `AuthService.ts`:**
```typescript
export class AuthService {
  // Registrar Owner inicial
  static async registerOwner(googleUser: any) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google'
    });
    
    if (data.user) {
      // Crear registro de Owner
      await supabase.from('users').insert({
        id: data.user.id,
        email: data.user.email,
        role: 'owner',
        status: 'active',
        is_owner: true,
        owner_id: data.user.id // Self-ownership
      });
    }
  }
  
  // Registrar Staff via QR
  static async registerStaffViaQR(qrToken: string, userData: any) {
    const qrData = await validateQRToken(qrToken);
    
    const { data, error } = await supabase.from('users').insert({
      email: userData.email,
      role: qrData.role || 'staff',
      status: 'pending',
      owner_id: qrData.owner_id,
      invited_by: qrData.created_by,
      branch_id: qrData.branch_id
    });
  }
}
```

#### **2.2 Actualizar `AuthContext.tsx`:**
```typescript
interface AuthContextType {
  user: User | null;
  owner: Owner | null;
  currentOwner: Owner | null;
  signInAsOwner: () => Promise<void>;
  signInViaQR: (qrToken: string) => Promise<void>;
  signOut: () => Promise<void>;
}
```

### **Paso 3: Aislamiento de Datos**

#### **3.1 Actualizar Tablas en Supabase:**
```sql
-- Migración para agregar owner_id
ALTER TABLE branches ADD COLUMN owner_id UUID REFERENCES auth.users(id);
ALTER TABLE wines ADD COLUMN owner_id UUID REFERENCES auth.users(id);
ALTER TABLE wine_branch_stock ADD COLUMN owner_id UUID REFERENCES auth.users(id);

-- Actualizar datos existentes (para desarrollo)
UPDATE branches SET owner_id = '550e8400-e29b-41d4-a716-446655440002';
UPDATE wines SET owner_id = '550e8400-e29b-41d4-a716-446655440002';
```

#### **3.2 RLS Policies:**
```sql
-- Solo ver datos de tu Owner
CREATE POLICY "owner_data_isolation" ON wines 
FOR ALL USING (owner_id = auth.uid());

CREATE POLICY "branch_data_isolation" ON wine_branch_stock 
FOR ALL USING (
  branch_id IN (
    SELECT id FROM branches WHERE owner_id = auth.uid()
  )
);

-- Staff solo ve datos de su Owner
CREATE POLICY "staff_owner_isolation" ON wines 
FOR ALL USING (
  owner_id = (
    SELECT owner_id FROM users WHERE id = auth.uid()
  )
);
```

### **Paso 4: QR System Mejorado**

#### **4.1 Actualizar `QrTokenService.ts`:**
```typescript
interface QRTokenData {
  type: 'guest' | 'staff_invite';
  owner_id: string;        // Owner que creó el QR
  branch_id: string;       // Sucursal específica
  role?: string;           // Rol para staff
  permissions?: string[];  // Permisos específicos
  expires_at: string;
  max_uses?: number;
}
```

#### **4.2 Validación de QR:**
```typescript
export const validateQRToken = async (token: string) => {
  const qrData = await supabase
    .from('qr_tokens')
    .select('*')
    .eq('token', token)
    .eq('revoked', false)
    .single();
    
  if (!qrData.data) throw new Error('QR inválido');
  if (new Date(qrData.data.expires_at) < new Date()) {
    throw new Error('QR expirado');
  }
  
  return qrData.data;
};
```

---

## 🎯 **Resultado Final**

### **Flujo de Usuario Nuevo:**
1. **Descarga app** → Ve `WelcomeScreen`
2. **Clic "Registrarse como Owner"** → Google OAuth
3. **Configura primera sucursal** → Dashboard completo
4. **Crea QR para staff** → Staff puede registrarse
5. **Crea QR para comensales** → Comensales pueden ver catálogo

### **Flujo de Staff:**
1. **Escanear QR del Owner** → Validación
2. **Crear cuenta** → Acceso limitado según permisos
3. **Dashboard staff** → Solo funciones permitidas
4. **Catálogo** → Solo vinos del Owner

### **Flujo de Comensal:**
1. **Escanear QR del restaurante** → Validación
2. **Acceso directo** → Solo catálogo de vinos
3. **Sin registro** → Experiencia temporal

### **Aislamiento Garantizado:**
- ✅ Cada Owner tiene su universo separado
- ✅ Staff solo ve datos de su Owner
- ✅ Comensales solo ven catálogo específico
- ✅ Imposible acceder a datos de otros Owners
- ✅ QR específicos y únicos por Owner

---

## 📱 **Pantallas Finales**

### **Para Owner:**
- Welcome → Owner Registration → Owner Dashboard → [Todas las funciones]

### **Para Staff:**
- Welcome → QR Scanner → Staff Registration → Staff Dashboard → [Funciones limitadas]

### **Para Comensal:**
- Welcome → QR Scanner → Wine Catalog → [Solo catálogo]

---

## 🔒 **Seguridad**

### **Nivel 1: Aislamiento de Datos**
- RLS en Supabase por `owner_id`
- Validación en frontend y backend

### **Nivel 2: Autenticación**
- Google OAuth para Owners
- QR tokens firmados para Staff/Comensales
- Tokens con expiración y límites de uso

### **Nivel 3: Autorización**
- Roles granulares por Owner
- Permisos específicos por función
- Validación en cada operación

---

**¿Quieres que empecemos con la implementación de estos cambios?** 🚀


