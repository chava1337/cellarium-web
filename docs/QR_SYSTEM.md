# Sistema de Códigos QR - Cellarium

## 📋 Descripción General

El sistema de códigos QR de Cellarium permite dos flujos principales:
1. **QR para Comensales**: Acceso directo al catálogo de vinos de una sucursal
2. **QR para Admins**: Invitaciones para registro de nuevos administradores

## 🎯 Flujo de QR para Comensales

### Generación del QR

1. **Admin genera QR** desde "Generación de QR" en el panel de administración
2. **Selecciona tipo**: "Comensales" 🍽️
3. **QR generado** con los siguientes datos:
   ```json
   {
     "type": "guest",
     "token": "unique-token-abc123",
     "branchId": "1",
     "branchName": "Restaurante Principal"
   }
   ```
4. **URL generada**: `https://cellarium.app/qr?data={encodedData}`
5. **Duración**: 24 horas

### Uso del QR por el Comensal

#### Escenario 1: App Instalada
```
Comensal escanea QR con cámara
    ↓
Sistema operativo detecta URL cellarium.app
    ↓
Abre app automáticamente
    ↓
App navega a QrProcessorScreen
    ↓
Valida token (verifica expiración, sucursal)
    ↓
Navega a WineCatalog
    - isGuest: true
    - branchId: "1"
    ↓
Comensal ve catálogo SIN botón de admin ✅
```

#### Escenario 2: App NO Instalada
```
Comensal escanea QR con cámara
    ↓
Sistema operativo abre navegador
    ↓
Carga: https://cellarium.app/qr?data=...
    ↓
Página web detecta sistema operativo
    ↓
Muestra botón "Descargar en App Store" (iOS)
    o
Muestra botón "Descargar en Google Play" (Android)
    ↓
Comensal descarga app
    ↓
Abre app y escanea QR de nuevo
    ↓
Accede al catálogo ✅
```

## 🔐 Flujo de QR para Admins

### Generación del QR

1. **Admin genera QR** desde "Generación de QR"
2. **Selecciona tipo**: "Invitación Admin" 👥
3. **QR generado** con datos:
   ```json
   {
     "type": "admin",
     "token": "unique-admin-token-xyz789",
     "branchId": "1",
     "branchName": "Restaurante Principal"
   }
   ```
4. **Duración**: 7 días
5. **Uso**: Una sola vez (one-time)

### Uso del QR por Admin Nuevo

```
Nuevo admin escanea QR
    ↓
App detecta type: "admin"
    ↓
Navega a AdminRegistrationScreen
    ↓
Muestra badge: "🏢 Restaurante Principal"
    ↓
Admin completa registro:
    - Usuario
    - Contraseña
    - Confirmar contraseña
    ↓
Estado: "pending"
    ↓
Owner/Gerente aprueba en "Gestión de Usuarios"
    ↓
Asigna rol (Gerente/Sommelier/Supervisor)
    ↓
Estado: "active"
    ↓
Admin puede hacer login ✅
```

## 🌐 URLs y Deep Links

### URL Universal (Web)
```
https://cellarium.app/qr?data={encodedData}
```
- ✅ Funciona en cualquier navegador
- ✅ Redirige a App Store/Play Store si app no instalada
- ✅ Compatible con QR escaneados desde cámara

### Deep Link (App)
```
cellarium://qr?data={encodedData}
```
- ✅ Abre app directamente si está instalada
- ❌ No funciona si app no está instalada

## 🔧 Configuración Técnica

### iOS (app.config.js)
```javascript
ios: {
  bundleIdentifier: "com.cellarium.winecatalog",
  associatedDomains: [
    "applinks:cellarium.app",
    "applinks:www.cellarium.app"
  ]
}
```

### Android (app.config.js)
```javascript
android: {
  package: "com.cellarium.winecatalog",
  intentFilters: [
    {
      action: "VIEW",
      autoVerify: true,
      data: [
        {
          scheme: "https",
          host: "cellarium.app",
          pathPrefix: "/qr"
        }
      ],
      category: ["BROWSABLE", "DEFAULT"]
    }
  ]
}
```

## 📱 Validación de Token

### Proceso de Validación
```typescript
const validation = await validateQrToken(token);

if (!validation.valid) {
  // Token inválido o expirado
  return error;
}

// Token válido
const { type, branchId, branchName } = validation.data;
```

### Verificaciones
1. ✅ **Formato correcto**: JSON válido
2. ✅ **No expirado**: `expiresAt` > fecha actual
3. ✅ **Sucursal existe**: `branchId` válido
4. ✅ **Tipo válido**: 'guest' o 'admin'

## 🎨 Restricciones por Sucursal

### Para Comensales
- ✅ Solo ven catálogo de **su sucursal**
- ✅ QR vinculado a sucursal específica
- ❌ No pueden cambiar de sucursal
- ❌ No ven botón de admin

### Para Admins
- ✅ Registrados en sucursal del QR
- ✅ Acceso SOLO a esa sucursal (excepto Owner)
- ✅ Pueden gestionar su sucursal
- ❌ No pueden ver otras sucursales (excepto Owner)

## 📊 Ejemplo Completo

### 1. Admin genera QR para comensales
```javascript
// En QrGenerationScreen
handleGenerateGuestQr() {
  const qr = {
    type: 'guest',
    token: 'cellarium-1234567890-abc123',
    branchId: '1',
    branchName: 'Restaurante Principal',
    expiresAt: '2025-10-10T12:00:00Z' // 24 horas
  };
  
  const url = generateUniversalQrUrl(qr);
  // url = "https://cellarium.app/qr?data=%7B%22type%22%3A%22guest%22..."
}
```

### 2. Comensal escanea QR
```
📱 Cámara del iPhone detecta QR
    ↓
🌐 iOS abre: https://cellarium.app/qr?data=...
    ↓
📲 Sistema detecta cellarium.app está asociado con la app
    ↓
🚀 Abre app Cellarium
    ↓
⚙️ App navega a QrProcessorScreen
    ↓
✓ Valida token
    ↓
🍷 Muestra WineCatalog (isGuest: true, branchId: '1')
```

### 3. Comensal ve catálogo
```javascript
// En WineCatalogScreen
const isGuest = route.params?.isGuest; // true
const branchId = route.params?.branchId; // '1'

// Catálogo filtrado por sucursal
const wines = filterWinesByBranch(allWines, branchId);

// Botón admin oculto
{!isGuest && <AdminButton />} // No se muestra
```

## 🔒 Seguridad

### Medidas Implementadas
1. ✅ **Tokens únicos**: Generados con UUID
2. ✅ **Expiración**: 24h comensales, 7 días admins
3. ✅ **One-time para admins**: Se marca como usado
4. ✅ **Validación en servidor**: Supabase RLS
5. ✅ **Vinculación a sucursal**: No se puede cambiar
6. ✅ **HTTPS obligatorio**: URLs seguras

### En Producción (Supabase)
```sql
-- Tabla qr_tokens
CREATE TABLE qr_tokens (
  id UUID PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL, -- 'guest' | 'admin'
  branch_id UUID NOT NULL,
  created_by UUID NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMP,
  max_uses INTEGER DEFAULT 1
);

-- Row Level Security
CREATE POLICY "QR tokens can be validated by anyone"
  ON qr_tokens FOR SELECT
  USING (expires_at > NOW() AND (used = false OR type = 'guest'));
```

## 📚 Referencias

- **Expo Deep Linking**: https://docs.expo.dev/guides/linking/
- **iOS Universal Links**: https://developer.apple.com/ios/universal-links/
- **Android App Links**: https://developer.android.com/training/app-links

## 🚀 Próximos Pasos

1. ✅ Implementar validación en Supabase
2. ✅ Agregar analytics de uso de QR
3. ✅ Implementar notificaciones push para admins nuevos
4. ✅ Agregar opción de "compartir QR" (WhatsApp, Email, etc.)
5. ✅ Implementar estadísticas de QR más escaneados

