# 🧪 Testing del Sistema de QR - Cellarium

## 📱 Cómo Probar los Códigos QR

### Opción 1: Testing en Desarrollo (Expo Go)

#### Paso 1: Generar QR de Prueba
```bash
# Asegúrate de que la app está corriendo
npm start

# En la app:
1. Login como admin (modo desarrollo)
2. Ir a "Generación de QR"
3. Generar QR para comensales
4. El QR aparecerá en pantalla
```

#### Paso 2: Probar Deep Link Manualmente
```bash
# En terminal, simular escaneo de QR:
npx uri-scheme open "cellarium://qr?data=%7B%22type%22%3A%22guest%22%2C%22token%22%3A%22test123%22%2C%22branchId%22%3A%221%22%2C%22branchName%22%3A%22Restaurante%20Principal%22%7D" --ios

# O para Android:
npx uri-scheme open "cellarium://qr?data=%7B%22type%22%3A%22guest%22%2C%22token%22%3A%22test123%22%2C%22branchId%22%3A%221%22%2C%22branchName%22%3A%22Restaurante%20Principal%22%7D" --android
```

### Opción 2: Testing con QR Real

#### Paso 1: Generar QR Físico
```javascript
// En QrGenerationScreen, el QR ya incluye la URL universal
const qrUrl = "https://cellarium.app/qr?data={encodedData}";

// Puedes:
1. Tomar screenshot del QR en la app
2. Imprimir el QR
3. Enviarlo por WhatsApp/Email
```

#### Paso 2: Escanear con Cámara Real
```
1. Abrir cámara del teléfono (iOS/Android)
2. Apuntar al QR code
3. Hacer click en la notificación que aparece
4. Debería abrir la app (si está instalada)
   O redirigir a la página web (si no está instalada)
```

### Opción 3: Testing en Build de Desarrollo

#### Para iOS:
```bash
# 1. Crear build de desarrollo
eas build --profile development --platform ios

# 2. Instalar en dispositivo físico
# 3. Generar QR en la app
# 4. Escanear con otro dispositivo o imprimir
# 5. Verificar que abre la app automáticamente
```

#### Para Android:
```bash
# 1. Crear build de desarrollo
eas build --profile development --platform android

# 2. Instalar APK en dispositivo
# 3. Generar QR en la app
# 4. Escanear con otro dispositivo
# 5. Verificar deep linking
```

## 🎯 Escenarios de Prueba

### Test 1: QR de Comensal - App Instalada
**Objetivo**: Verificar que comensal accede al catálogo sin botón admin

```
✓ Generar QR tipo "guest"
✓ Escanear QR
✓ App abre automáticamente
✓ Muestra pantalla "Validando..."
✓ Redirige a WineCatalog
✓ Catálogo visible
✓ Botón admin (⚙️) NO visible
✓ Solo muestra vinos de esa sucursal
```

**Comandos de testing**:
```bash
# Simular escaneo
npx uri-scheme open "cellarium://qr?data=%7B%22type%22%3A%22guest%22%2C%22branchId%22%3A%221%22%7D"
```

### Test 2: QR de Comensal - App NO Instalada
**Objetivo**: Verificar redirección a stores

```
✓ Escanear QR sin app instalada
✓ Abre navegador
✓ Carga página cellarium.app/qr
✓ Detecta sistema operativo (iOS/Android)
✓ Muestra botón "Descargar en [Store]"
✓ Click redirige a store correcta
```

**URL de prueba**:
```
https://cellarium.app/qr?data=%7B%22type%22%3A%22guest%22%2C%22token%22%3A%22test%22%2C%22branchId%22%3A%221%22%7D
```

### Test 3: QR de Admin - Registro Nuevo
**Objetivo**: Verificar flujo completo de registro de admin

```
✓ Generar QR tipo "admin"
✓ Escanear QR
✓ App detecta type: "admin"
✓ Redirige a AdminRegistrationScreen
✓ Muestra badge de sucursal
✓ Formulario de registro visible
✓ Validaciones funcionan
✓ Registro exitoso → Estado "pending"
✓ Owner aprueba → Estado "active"
✓ Admin puede hacer login
✓ Admin ve solo su sucursal
```

**Comando de testing**:
```bash
npx uri-scheme open "cellarium://qr?data=%7B%22type%22%3A%22admin%22%2C%22token%22%3A%22admin-invite-123%22%2C%22branchId%22%3A%221%22%2C%22branchName%22%3A%22Restaurante%20Principal%22%7D"
```

### Test 4: QR Expirado
**Objetivo**: Verificar manejo de QR vencidos

```
✓ Generar QR con expiresAt en el pasado
✓ Escanear QR
✓ Muestra error "QR expirado"
✓ Mensaje: "Solicita uno nuevo"
✓ Redirige a Login después de 3s
```

### Test 5: Restricción por Sucursal
**Objetivo**: Verificar que comensal solo ve vinos de su sucursal

```
✓ Generar QR de Sucursal A
✓ Escanear QR
✓ Ver catálogo
✓ Solo vinos de Sucursal A visibles
✓ Vinos de otras sucursales NO aparecen
```

### Test 6: Admin con QR Puede Acceder sin Re-Login
**Objetivo**: Verificar sesión persistente

```
✓ Admin nuevo registrado con QR
✓ Admin aprobado
✓ Admin hace login (primera vez)
✓ Admin ve catálogo
✓ Admin click en botón ⚙️
✓ Acceso DIRECTO al panel (sin pedir login)
✓ Admin ve su sucursal en header
```

## 🐛 Debugging

### Ver Logs de Deep Linking
```bash
# iOS
npx react-native log-ios

# Android
npx react-native log-android

# Buscar:
# - "Deep link received"
# - "QR validation"
# - "Navigation to QrProcessor"
```

### Verificar Configuración de Deep Linking
```bash
# Ver configuración actual
npx uri-scheme list

# Debería mostrar:
# cellarium://
# https://cellarium.app
```

### Probar URLs Manualmente

#### En navegador:
```
https://cellarium.app/qr?data=%7B%22type%22%3A%22guest%22%2C%22token%22%3A%22test%22%2C%22branchId%22%3A%221%22%2C%22branchName%22%3A%22Test%22%7D
```

#### En terminal:
```bash
# Decodificar URL para ver datos
node -e "console.log(decodeURIComponent('%7B%22type%22%3A%22guest%22...'))"
```

## 📊 Checklist de Testing

### QR de Comensales ✓
- [ ] Generación de QR funciona
- [ ] QR muestra URL correcta
- [ ] Escaneo abre app (si instalada)
- [ ] Escaneo redirige a web (si no instalada)
- [ ] Validación de token exitosa
- [ ] Catálogo se muestra correctamente
- [ ] Botón admin NO visible
- [ ] Solo vinos de sucursal correcta
- [ ] QR expira después de 24 horas

### QR de Admin ✓
- [ ] Generación de QR funciona
- [ ] Escaneo detecta tipo "admin"
- [ ] Redirige a registro
- [ ] Badge de sucursal visible
- [ ] Formulario completo
- [ ] Validaciones funcionan
- [ ] Registro crea usuario "pending"
- [ ] Aprobación cambia a "active"
- [ ] Admin puede hacer login
- [ ] Admin ve solo su sucursal
- [ ] QR expira después de 7 días
- [ ] QR one-time (no reutilizable)

### Deep Linking ✓
- [ ] cellarium:// funciona
- [ ] https://cellarium.app funciona
- [ ] Parámetros se pasan correctamente
- [ ] QrProcessor recibe datos
- [ ] Validación de token funciona
- [ ] Navegación correcta según tipo

### Redirección a Stores ✓
- [ ] Detecta iOS correctamente
- [ ] Detecta Android correctamente
- [ ] Muestra botón App Store (iOS)
- [ ] Muestra botón Play Store (Android)
- [ ] Links redirigen correctamente

## 🚀 Testing en Producción

### Pre-requisitos
```bash
# 1. Build de producción
eas build --profile production --platform all

# 2. Configurar dominio cellarium.app
# 3. Subir archivo apple-app-site-association
# 4. Subir archivo assetlinks.json
# 5. Verificar certificados SSL
```

### Verificación de Universal Links (iOS)
```bash
# Verificar archivo en:
https://cellarium.app/.well-known/apple-app-site-association

# Debe contener:
{
  "applinks": {
    "apps": [],
    "details": [{
      "appID": "TEAM_ID.com.cellarium.winecatalog",
      "paths": ["/qr", "/qr/*"]
    }]
  }
}
```

### Verificación de App Links (Android)
```bash
# Verificar archivo en:
https://cellarium.app/.well-known/assetlinks.json

# Debe contener:
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.cellarium.winecatalog",
    "sha256_cert_fingerprints": ["..."]
  }
}]
```

## 💡 Tips

1. **Usar QR físicos para testing realista**
2. **Probar en diferentes dispositivos** (iOS/Android)
3. **Verificar expiración** (cambiar fecha del sistema)
4. **Simular sin internet** (verificar manejo de errores)
5. **Probar con diferentes sucursales**
6. **Verificar que botón admin está oculto**
7. **Confirmar sesión persistente** (no pide re-login)

## 📝 Notas

- En desarrollo, usa `npx uri-scheme` para simular escaneos
- En producción, usa QR codes reales
- Verifica logs para debugging
- Usa React Navigation Devtools para ver estado de navegación

