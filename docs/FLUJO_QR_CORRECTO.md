# 🔄 Flujo Correcto de QR - Cellarium

## 📱 **Cómo Funcionan los QR**

### **1. 🍷 QR para Comensales**
```
Restaurante genera QR → Comensal escanea → App se abre automáticamente → Catálogo de vinos
```

**Proceso:**
1. **Owner/Admin** genera QR para comensales en el panel
2. **Comensal** escanea QR con cualquier app de cámara
3. **Sistema** detecta que es un QR de Cellarium
4. **App se abre** automáticamente (o redirige a Play Store/App Store)
5. **Comensal ve** directamente el catálogo de vinos de esa sucursal

### **2. 👥 QR para Staff (Invitación)**
```
Owner genera QR invitación → Staff escanea → Registro → Login → Catálogo con permisos
```

**Proceso:**
1. **Owner** genera QR de invitación para staff en el panel
2. **Staff** escanea QR con cualquier app de cámara
3. **Sistema** detecta que es un QR de invitación
4. **App se abre** y redirige a pantalla de registro
5. **Staff se registra** con usuario/contraseña
6. **Staff ya registrado** usa Login normal → Accede al catálogo con sus permisos

---

## 🚀 **Flujos de Usuario**

### **👑 Owner (Primera vez)**
```
WelcomeScreen → "Registrarse como Owner" → OwnerRegistration → AdminDashboard
```

### **👥 Staff (Después del registro)**
```
WelcomeScreen → "Iniciar Sesión" → Login → WineCatalog (con permisos)
```

### **🍷 Comensal (Siempre)**
```
QR del restaurante → App se abre → WineCatalog (solo lectura)
```

---

## 🔧 **Implementación Técnica**

### **Deep Linking**
```typescript
// URL del QR para comensales
https://cellarium.app/qr/guest?token=ABC123&branch=demo-branch

// URL del QR para staff
https://cellarium.app/qr/invite?token=XYZ789&owner=owner-id&branch=demo-branch
```

### **Detección Automática**
```typescript
// App.tsx - Manejo de deep links
const linking = {
  prefixes: ['cellarium://', 'https://cellarium.app'],
  config: {
    screens: {
      QrProcessor: 'qr/:type',
      WineCatalog: 'catalog/:branchId',
      AdminRegistration: 'register/:token',
    },
  },
};
```

### **Validación de QR**
```typescript
// QrProcessorScreen.tsx
const processQR = async (qrData) => {
  const { type, token } = qrData;
  
  if (type === 'guest') {
    // Redirigir a catálogo
    navigation.navigate('WineCatalog', { 
      branchId: token.branch_id, 
      isGuest: true 
    });
  } else if (type === 'invite') {
    // Redirigir a registro
    navigation.navigate('AdminRegistration', {
      qrToken: token,
      branchName: token.branch_name,
      branchId: token.branch_id
    });
  }
};
```

---

## 📋 **Pantallas Necesarias**

### **1. WelcomeScreen** ✅
- **"Registrarse como Owner"** - Para nuevos owners
- **"Iniciar Sesión"** - Para staff y owners existentes
- **Sin botón de QR** - Los QR funcionan automáticamente

### **2. QrProcessorScreen** ✅
- **Procesa QR automáticamente**
- **Redirige según tipo** (comensal vs staff)
- **No requiere interacción del usuario**

### **3. AdminRegistrationScreen** ✅
- **Solo accesible via QR de invitación**
- **Registra staff con rol específico**
- **Asigna a sucursal del QR**

### **4. WineCatalogScreen** ✅
- **Comensal**: Solo catálogo, sin panel admin
- **Staff**: Catálogo + panel admin (según permisos)
- **Owner**: Catálogo + panel admin completo

---

## 🎯 **Resultado Final**

### **Para Comensales:**
- **Experiencia simple**: QR → Catálogo
- **Sin registro**: Acceso directo
- **Sin complicaciones**: Solo ven vinos

### **Para Staff:**
- **Una vez registrado**: Login normal → Catálogo
- **Con permisos**: Acceso a funciones según rol
- **Sin QR repetitivo**: Solo el primer registro

### **Para Owners:**
- **Control total**: Generan QR, gestionan staff
- **Acceso directo**: Login → Dashboard completo
- **Privacidad**: Solo ven sus datos

---

## ✅ **Beneficios del Flujo Corregido**

1. **🎯 Simplicidad**: QR funcionan automáticamente
2. **🚀 Eficiencia**: Sin pasos innecesarios
3. **🔒 Seguridad**: Cada QR tiene propósito específico
4. **📱 UX Mejorada**: Flujo intuitivo para cada tipo de usuario
5. **⚡ Rapidez**: Acceso directo según necesidad

---

**El QR scanner manual era innecesario porque los QR deben funcionar automáticamente desde cualquier app de cámara.** 📱✨



