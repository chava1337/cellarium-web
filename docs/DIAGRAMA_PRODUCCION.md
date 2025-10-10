# 📊 Diagrama Visual - Sistema de Producción

## 🌐 Arquitectura Completa

```
┌─────────────────────────────────────────────────────────────────┐
│                         COMENSAL                                 │
│                                                                  │
│  1. Escanea QR con cámara del teléfono                         │
│     📱 → 📷 → [QR Code]                                         │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                    SISTEMA OPERATIVO                             │
│                                                                  │
│  2. Detecta URL: https://turestaurante.com/qr?data=...        │
│                                                                  │
│     ┌──────────────────┐      ┌──────────────────┐             │
│     │   App instalada  │      │  App NO instalada│             │
│     │                  │      │                  │             │
│     │   Abre app ✅    │      │  Abre browser 🌐 │             │
│     └──────────────────┘      └──────────────────┘             │
└─────────────────────────────────────────────────────────────────┘
          ↓                              ↓
┌──────────────────────┐    ┌────────────────────────────────────┐
│   CELLARIUM APP      │    │   PÁGINA WEB                       │
│                      │    │   (turestaurante.com)              │
│  QrProcessorScreen   │    │                                    │
│         ↓            │    │   Detecta sistema operativo:       │
│  Valida token en     │    │   - iOS → Link App Store           │
│  Supabase            │    │   - Android → Link Play Store      │
│         ↓            │    │                                    │
│  WineCatalog ✅      │    │   Usuario descarga app → Repite    │
└──────────────────────┘    └────────────────────────────────────┘
```

---

## 🔐 Flujo de Validación de Token

```
┌────────────────────────────────────────────────────────────────┐
│  1. ESCANEO DE QR                                              │
│     Usuario escanea → URL extraída                             │
│     https://turestaurante.com/qr?data={encodedToken}          │
└────────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────────┐
│  2. APP RECIBE DEEP LINK                                       │
│     NavigationContainer detecta URL                            │
│     → Navega a QrProcessorScreen                               │
│     → Extrae token de parámetros                               │
└────────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────────┐
│  3. VALIDACIÓN EN SUPABASE                                     │
│                                                                 │
│     validateQrToken(token)                                     │
│         ↓                                                       │
│     SELECT * FROM qr_tokens WHERE token = ?                    │
│         ↓                                                       │
│     Verificaciones:                                            │
│     ✓ Token existe                                             │
│     ✓ No expirado (expires_at > NOW())                        │
│     ✓ No usado (si es admin)                                  │
│     ✓ Dentro de límite de usos                                │
│         ↓                                                       │
│     Registrar escaneo:                                         │
│     INSERT INTO qr_scans (qr_token_id, ...)                   │
│         ↓                                                       │
│     Incrementar contador:                                      │
│     UPDATE qr_tokens SET current_uses = current_uses + 1      │
└────────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────────┐
│  4. NAVEGACIÓN SEGÚN TIPO                                      │
│                                                                 │
│     SI type = 'guest':                                         │
│         → WineCatalog(isGuest: true, branchId: X)             │
│         → Usuario ve catálogo sin botón admin                 │
│                                                                 │
│     SI type = 'admin':                                         │
│         → AdminRegistrationScreen(branchId: X)                │
│         → Usuario completa registro                            │
│         → Estado: pending → Espera aprobación                 │
└────────────────────────────────────────────────────────────────┘
```

---

## 🔒 Row Level Security (RLS) - Cómo Funciona

```
┌─────────────────────────────────────────────────────────────┐
│  USUARIO HACE QUERY                                          │
│  const wines = await supabase.from('wines').select('*')     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  SUPABASE RLS INTERCEPTA                                     │
│                                                              │
│  1. ¿Usuario autenticado?                                   │
│     auth.uid() → UUID del usuario                           │
│                                                              │
│  2. ¿Qué rol tiene?                                         │
│     SELECT role FROM users WHERE id = auth.uid()            │
│                                                              │
│  3. Aplicar política:                                       │
│                                                              │
│     SI role = 'owner':                                      │
│         → Ver TODO (todas las sucursales)                   │
│                                                              │
│     SI role = 'gerente/sommelier/supervisor':              │
│         → Ver SOLO su sucursal                              │
│         WHERE branch_id = (                                 │
│           SELECT branch_id FROM users                       │
│           WHERE id = auth.uid()                             │
│         )                                                    │
│                                                              │
│  4. Ejecutar query FILTRADA automáticamente                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  RESULTADO SEGURO                                            │
│  Usuario recibe SOLO los datos que puede ver                │
│  No necesita filtrado manual en el código ✅                │
└─────────────────────────────────────────────────────────────┘
```

### Ejemplo Práctico:

```sql
-- Admin de Sucursal A hace esta query:
SELECT * FROM wines;

-- RLS automáticamente la convierte en:
SELECT * FROM wines 
WHERE branch_id = (
  SELECT branch_id FROM users 
  WHERE id = '123-abc'  -- ID del admin
);

-- Resultado: Solo vinos de Sucursal A ✅
```

---

## 📊 Analytics de Escaneos - Flujo de Datos

```
┌────────────────────────────────────────────────────────────┐
│  QR ESCANEADO                                               │
│  Usuario → QR Code → App                                    │
└────────────────────────────────────────────────────────────┘
                      ↓
┌────────────────────────────────────────────────────────────┐
│  REGISTRO AUTOMÁTICO                                        │
│                                                             │
│  INSERT INTO qr_scans (                                    │
│    qr_token_id: 'uuid-del-qr',                            │
│    scanned_at: NOW(),                                      │
│    user_agent: 'iPhone iOS 17.0',                         │
│    device_type: 'ios',                                     │
│    success: true                                           │
│  )                                                          │
└────────────────────────────────────────────────────────────┘
                      ↓
┌────────────────────────────────────────────────────────────┐
│  DATOS ALMACENADOS                                          │
│                                                             │
│  qr_scans table:                                           │
│  ┌─────┬───────────┬─────────────┬──────────┬─────────┐  │
│  │ ID  │ QR Token  │ Timestamp   │ Device   │ Success │  │
│  ├─────┼───────────┼─────────────┼──────────┼─────────┤  │
│  │ 001 │ abc-123   │ 10:30 AM    │ iOS      │ true    │  │
│  │ 002 │ abc-123   │ 11:15 AM    │ Android  │ true    │  │
│  │ 003 │ def-456   │ 12:00 PM    │ iOS      │ true    │  │
│  │ 004 │ abc-123   │ 2:30 PM     │ iOS      │ false   │  │
│  └─────┴───────────┴─────────────┴──────────┴─────────┘  │
└────────────────────────────────────────────────────────────┘
                      ↓
┌────────────────────────────────────────────────────────────┐
│  ANALYTICS & REPORTES                                       │
│                                                             │
│  Dashboard del Admin ve:                                   │
│                                                             │
│  📊 Escaneos totales: 1,234                                │
│  📈 Tendencia: +15% vs semana pasada                       │
│                                                             │
│  🏢 Por sucursal:                                          │
│     Sucursal A: 500 escaneos                               │
│     Sucursal B: 400 escaneos                               │
│     Sucursal C: 334 escaneos                               │
│                                                             │
│  📱 Por dispositivo:                                       │
│     iOS: 60%                                               │
│     Android: 40%                                           │
│                                                             │
│  ⏰ Por hora del día:                                      │
│     [Gráfico de barras]                                    │
│     12-2 PM: Pico máximo                                   │
└────────────────────────────────────────────────────────────┘
```

---

## 🌐 Dominio y Deep Linking - Diagrama Técnico

```
┌──────────────────────────────────────────────────────────────┐
│  QR CODE CONTIENE                                             │
│  https://turestaurante.com/qr?data=ABC123                    │
└──────────────────────────────────────────────────────────────┘
                            ↓
            ┌───────────────┴───────────────┐
            ↓                               ↓
┌──────────────────────┐        ┌──────────────────────┐
│   iOS DEVICE         │        │   ANDROID DEVICE     │
│                      │        │                      │
│  1. Lee QR           │        │  1. Lee QR           │
│  2. Detecta domain   │        │  2. Detecta domain   │
│  3. Busca en:        │        │  3. Busca en:        │
│     .well-known/     │        │     .well-known/     │
│     apple-app-       │        │     assetlinks.json  │
│     site-association │        │                      │
│  4. Encuentra:       │        │  4. Encuentra:       │
│     appID match ✓    │        │     package match ✓  │
│  5. Abre app         │        │  5. Abre app         │
└──────────────────────┘        └──────────────────────┘
            ↓                               ↓
            └───────────────┬───────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  CELLARIUM APP RECIBE DEEP LINK                              │
│                                                               │
│  NavigationContainer.linking.config {                        │
│    screens: {                                                │
│      QrProcessor: {                                          │
│        path: 'qr',                                           │
│        parse: { qrData: ... }                               │
│      }                                                        │
│    }                                                          │
│  }                                                            │
│                                                               │
│  App.tsx detecta: /qr?data=ABC123                           │
│       ↓                                                       │
│  Extrae: qrData = "ABC123"                                  │
│       ↓                                                       │
│  Navega: QrProcessorScreen({ qrData: "ABC123" })           │
└──────────────────────────────────────────────────────────────┘
```

### Archivo en servidor web:

```
turestaurante.com/
├── index.html
├── .well-known/
│   ├── apple-app-site-association  ← iOS busca aquí
│   └── assetlinks.json              ← Android busca aquí
└── qr/
    └── redirect.html                 ← Fallback si no hay app
```

---

## 🚀 Checklist de Producción - Visual

```
ANTES DE PUBLICAR:

┌─────────────────────────────────────┐
│ ☐ Dominio configurado               │
│   └─ DNS apuntando                  │
│   └─ HTTPS activo                   │
│   └─ Verificado con ping            │
├─────────────────────────────────────┤
│ ☐ Archivos de verificación          │
│   └─ apple-app-site-association ✓   │
│   └─ assetlinks.json ✓              │
│   └─ Accesibles públicamente        │
├─────────────────────────────────────┤
│ ☐ Supabase configurado               │
│   └─ URL y Key en .env              │
│   └─ Tablas creadas                 │
│   └─ RLS habilitado                 │
│   └─ Políticas configuradas         │
├─────────────────────────────────────┤
│ ☐ Código actualizado                │
│   └─ Dominio en app.config.js       │
│   └─ URLs en QrTokenService         │
│   └─ Producción descomen tada       │
├─────────────────────────────────────┤
│ ☐ Testing completo                  │
│   └─ QR guest funciona              │
│   └─ QR admin funciona              │
│   └─ Validación funciona            │
│   └─ RLS funciona                   │
│   └─ Analytics registra             │
├─────────────────────────────────────┤
│ ☐ Builds de producción              │
│   └─ iOS build ✓                    │
│   └─ Android build ✓                │
├─────────────────────────────────────┤
│ ☐ Subido a stores                   │
│   └─ App Store                      │
│   └─ Google Play                    │
└─────────────────────────────────────┘

TIEMPO TOTAL: ~1-2 días + 1-2 semanas revisión
```

---

## 💡 Resumen Super Simple

### 1. **Dominio** = Dirección web de tus QR
   - Comprar: turestaurante.com
   - Configurar: DNS + HTTPS
   - Actualizar código con tu dominio

### 2. **Archivos de verificación** = Prueba de que la app es tuya
   - iOS: apple-app-site-association
   - Android: assetlinks.json
   - Subir a: turestaurante.com/.well-known/

### 3. **Supabase** = Base de datos en la nube
   - Guardar QR tokens
   - Validar escaneos
   - Almacenar analytics

### 4. **RLS** = Seguridad automática
   - Cada admin ve solo su sucursal
   - Sin código extra
   - Supabase lo hace automáticamente

### 5. **Analytics** = Estadísticas de uso
   - Cuántos escaneos
   - Qué sucursales más populares
   - iOS vs Android
   - Horarios pico

