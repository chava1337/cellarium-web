# 🚀 Guía Completa de Producción - Cellarium

## 📋 Resumen de Pasos

1. ✅ Configurar dominio web
2. ✅ Subir archivos de verificación
3. ✅ Conectar con Supabase
4. ✅ Implementar RLS (Row Level Security)
5. ✅ Agregar analytics de escaneos
6. ✅ Testing final
7. ✅ Publicar en stores

---

## 1️⃣ DOMINIO WEB

### ¿Qué necesitas?
Un dominio propio como `turestaurante.com`

### ¿Por qué?
Los QR codes contienen URLs como:
```
https://turestaurante.com/qr?data=ABC123
```

Cuando alguien escanea:
- **Si tiene la app**: Abre automáticamente
- **Si NO tiene la app**: Ve página web con links a stores

### Pasos:

#### A. Comprar dominio
```
Proveedores recomendados:
- Namecheap: https://namecheap.com (~$10/año)
- Cloudflare: https://cloudflare.com (~$10/año)
- GoDaddy: https://godaddy.com (~$15/año)
```

#### B. Configurar DNS
```bash
# En tu proveedor de dominio, agregar:
Tipo: A
Nombre: @
Valor: [IP de tu servidor]
TTL: Automático

# Verificar DNS configurado:
ping turestaurante.com
# Debe responder con tu IP
```

#### C. Configurar HTTPS
```bash
# Opción 1: Con Cloudflare (Gratis, Recomendado)
1. Agregar dominio a Cloudflare
2. Cambiar nameservers en tu registrador
3. Activar SSL/TLS en Cloudflare (Automático)

# Opción 2: Con Let's Encrypt (Si tienes servidor propio)
sudo certbot --nginx -d turestaurante.com -d www.turestaurante.com
```

#### D. Actualizar código
```javascript
// app.config.js
associatedDomains: [
  "applinks:turestaurante.com",
  "applinks:www.turestaurante.com"
]

// src/services/QrTokenService.ts
const universalUrl = `https://turestaurante.com/qr?data=${encodedData}`;
```

---

## 2️⃣ ARCHIVOS DE VERIFICACIÓN

### A. Apple App Site Association (iOS)

#### Paso 1: Obtener Team ID
```bash
# Opción 1: Desde Apple Developer
1. Ir a https://developer.apple.com/account
2. Login
3. Sidebar → "Membership"
4. Ver "Team ID" (ej: "ABC123XYZ")

# Opción 2: Con EAS CLI
eas credentials -p ios
# Buscar: "Apple Team ID: ABC123XYZ"
```

#### Paso 2: Crear archivo
```json
// apple-app-site-association (SIN extensión)
{
  "applinks": {
    "apps": [],
    "details": [{
      "appID": "ABC123XYZ.com.cellarium.winecatalog",
      "paths": ["/qr", "/qr/*"]
    }]
  }
}

// Reemplazar:
// ABC123XYZ → Tu Team ID real
// com.cellarium.winecatalog → Tu bundle identifier
```

#### Paso 3: Subir al servidor
```bash
# Ubicación exacta:
https://turestaurante.com/.well-known/apple-app-site-association

# Con FTP/SFTP:
/var/www/html/.well-known/apple-app-site-association

# Configuración Nginx:
server {
    location /.well-known/apple-app-site-association {
        default_type application/json;
        add_header Content-Type application/json;
        add_header Access-Control-Allow-Origin *;
    }
}
```

#### Paso 4: Verificar
```bash
# En navegador:
https://turestaurante.com/.well-known/apple-app-site-association

# Debe mostrar el JSON
# NO debe redirigir
# NO debe pedir descarga

# Verificar con herramienta Apple:
https://search.developer.apple.com/appsearch-validation-tool/
```

### B. Digital Asset Links (Android)

#### Paso 1: Obtener SHA-256 Fingerprint
```bash
# Con EAS (Recomendado):
eas credentials -p android

# Output:
# ✔ Android Keystore
# SHA1: 12:34:56...
# SHA256: AB:CD:EF:12:34...  ← ESTE

# Copiar SHA256 SIN los dos puntos:
# ABCDEF1234...
```

#### Paso 2: Crear archivo
```json
// assetlinks.json (CON extensión)
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.cellarium.winecatalog",
    "sha256_cert_fingerprints": [
      "ABCDEF1234567890ABCDEF1234567890..."
    ]
  }
}]
```

#### Paso 3: Subir al servidor
```bash
# Ubicación exacta:
https://turestaurante.com/.well-known/assetlinks.json

# Con FTP/SFTP:
/var/www/html/.well-known/assetlinks.json
```

#### Paso 4: Verificar
```bash
# En navegador:
https://turestaurante.com/.well-known/assetlinks.json

# Verificar con Google:
https://developers.google.com/digital-asset-links/tools/generator
```

---

## 3️⃣ CONECTAR CON SUPABASE

### Paso 1: Obtener credenciales

```bash
# 1. Ir a tu proyecto Supabase
https://supabase.com/dashboard/project/YOUR_PROJECT_ID/settings/api

# 2. Copiar:
Project URL: https://abcdefg.supabase.co
anon public: eyJhbGciOiJIUzI1...

# 3. Agregar al .env:
EXPO_PUBLIC_SUPABASE_URL=https://abcdefg.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1...
```

### Paso 2: Crear tablas

```sql
-- En Supabase SQL Editor (https://supabase.com/dashboard/project/YOUR_PROJECT/sql)

-- 1. Tabla de tokens QR
CREATE TABLE qr_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('guest', 'admin')),
  branch_id UUID NOT NULL REFERENCES branches(id),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMP WITH TIME ZONE,
  max_uses INTEGER DEFAULT 1,
  current_uses INTEGER DEFAULT 0
);

-- 2. Tabla de escaneos (analytics)
CREATE TABLE qr_scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  qr_token_id UUID NOT NULL REFERENCES qr_tokens(id),
  scanned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_agent TEXT,
  device_type TEXT,
  success BOOLEAN DEFAULT true,
  error_message TEXT
);

-- 3. Índices para mejor rendimiento
CREATE INDEX idx_qr_tokens_token ON qr_tokens(token);
CREATE INDEX idx_qr_tokens_branch ON qr_tokens(branch_id);
CREATE INDEX idx_qr_scans_token ON qr_scans(qr_token_id);
```

### Paso 3: Activar código de producción

```typescript
// src/services/QrTokenService.ts

// Descomentar el bloque de PRODUCCIÓN
// Comentar el bloque de DESARROLLO

// Buscar línea ~32:
// PRODUCCIÓN: Descomentar este código cuando tengas Supabase configurado
/* <-- ELIMINAR ESTE COMENTARIO
import { supabase } from '../config/supabase';

const { data: qrToken, error } = await supabase
  .from('qr_tokens')
  ...
*/ <-- ELIMINAR ESTE COMENTARIO

// Y comentar el código mock:
// DESARROLLO: Código mock (eliminar en producción)
/*
await new Promise(resolve => setTimeout(resolve, 500));
...
*/
```

### Paso 4: Actualizar función de generación de QR

```typescript
// src/screens/QrGenerationScreen.tsx

const handleGenerateGuestQr = async () => {
  const token = generateToken();
  
  // AGREGAR: Guardar en Supabase
  const { data, error } = await supabase
    .from('qr_tokens')
    .insert({
      token: token,
      type: 'guest',
      branch_id: currentBranch.id,
      created_by: user.id,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      max_uses: 9999, // Ilimitado para guests
    })
    .select()
    .single();
    
  if (error) {
    Alert.alert('Error', 'No se pudo generar el QR');
    return;
  }
  
  // Continuar con el código existente...
};
```

---

## 4️⃣ IMPLEMENTAR RLS (Row Level Security)

### ¿Qué es RLS?
**Row Level Security** = Seguridad a nivel de fila

Controla **quién puede ver/modificar qué datos** en cada tabla.

### Ejemplo práctico:
```sql
-- Sin RLS:
User A puede ver vinos de TODAS las sucursales ❌

-- Con RLS:
User A solo ve vinos de SU sucursal ✅
```

### Implementación:

#### Paso 1: Habilitar RLS en tablas

```sql
-- En Supabase SQL Editor

-- Habilitar RLS en todas las tablas
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE wines ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_scans ENABLE ROW LEVEL SECURITY;
```

#### Paso 2: Crear políticas para QR tokens

```sql
-- Política 1: Cualquiera puede validar QR (solo lectura)
CREATE POLICY "Anyone can validate QR tokens"
  ON qr_tokens
  FOR SELECT
  USING (
    expires_at > NOW() 
    AND (
      type = 'guest' 
      OR (type = 'admin' AND used = false)
    )
  );

-- Política 2: Solo admins pueden crear QR
CREATE POLICY "Only active admins can create QR tokens"
  ON qr_tokens
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.status = 'active'
      AND users.role IN ('owner', 'gerente', 'sommelier', 'supervisor')
    )
  );

-- Política 3: Solo creador puede ver sus QR
CREATE POLICY "Users can view their own QR tokens"
  ON qr_tokens
  FOR SELECT
  USING (created_by = auth.uid());

-- Política 4: Solo owner puede eliminar QR
CREATE POLICY "Only owners can delete QR tokens"
  ON qr_tokens
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'owner'
    )
  );
```

#### Paso 3: Crear políticas para vinos (por sucursal)

```sql
-- Política 1: Ver solo vinos de sucursales permitidas
CREATE POLICY "Users can view wines from their branches"
  ON wines
  FOR SELECT
  USING (
    -- Si es guest (sin auth), puede ver todos
    auth.uid() IS NULL
    OR
    -- Si es owner, puede ver todos
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'owner'
    )
    OR
    -- Si es admin, solo de su sucursal
    branch_id IN (
      SELECT branch_id FROM users
      WHERE users.id = auth.uid()
    )
  );

-- Política 2: Solo admins pueden agregar vinos
CREATE POLICY "Only admins can insert wines"
  ON wines
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.status = 'active'
      AND branch_id = wines.branch_id
    )
  );

-- Política 3: Solo admins pueden modificar vinos de su sucursal
CREATE POLICY "Admins can update wines from their branch"
  ON wines
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.status = 'active'
      AND (
        users.role = 'owner'
        OR users.branch_id = wines.branch_id
      )
    )
  );
```

#### Paso 4: Verificar políticas

```sql
-- Probar política de QR
SELECT * FROM qr_tokens WHERE token = 'test-token';
-- Debe funcionar sin auth

-- Probar política de vinos
SELECT * FROM wines WHERE branch_id = 'branch-uuid';
-- Debe filtrar según usuario autenticado
```

---

## 5️⃣ ANALYTICS DE ESCANEOS

### ¿Por qué es importante?
Te permite saber:
- ✅ Cuántas personas escanean tus QR
- ✅ Qué QR son más populares
- ✅ Qué sucursales tienen más visitas
- ✅ En qué horarios hay más escaneos
- ✅ Qué dispositivos usan (iOS/Android)

### Implementación:

#### Paso 1: Ya creaste la tabla `qr_scans` ✅

```sql
-- Ya ejecutaste esto en el Paso 3
CREATE TABLE qr_scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  qr_token_id UUID NOT NULL REFERENCES qr_tokens(id),
  scanned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_agent TEXT,
  device_type TEXT,
  success BOOLEAN DEFAULT true,
  error_message TEXT
);
```

#### Paso 2: Registrar escaneos automáticamente

Ya está implementado en `QrTokenService.ts` línea ~81:
```typescript
// Registrar escaneo
await supabase.from('qr_scans').insert({
  qr_token_id: qrToken.id,
  success: true,
  user_agent: navigator.userAgent, // Info del dispositivo
  device_type: Platform.OS, // 'ios' o 'android'
});
```

#### Paso 3: Crear dashboard de analytics

```typescript
// src/screens/QrAnalyticsScreen.tsx (NUEVO ARCHIVO)

import React, { useEffect, useState } from 'react';
import { supabase } from '../config/supabase';

const QrAnalyticsScreen = () => {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    // Escaneos totales
    const { data: totalScans } = await supabase
      .from('qr_scans')
      .select('*', { count: 'exact', head: true });

    // Escaneos por día (últimos 7 días)
    const { data: scansByDay } = await supabase
      .from('qr_scans')
      .select('scanned_at')
      .gte('scanned_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    // Escaneos por sucursal
    const { data: scansByBranch } = await supabase
      .from('qr_scans')
      .select(`
        qr_token_id,
        qr_tokens (
          branch_id,
          branches (
            name
          )
        )
      `);

    // Top 5 QR más escaneados
    const { data: topQrs } = await supabase
      .from('qr_scans')
      .select('qr_token_id, count')
      .groupBy('qr_token_id')
      .order('count', { ascending: false })
      .limit(5);

    setStats({
      total: totalScans,
      byDay: scansByDay,
      byBranch: scansByBranch,
      topQrs: topQrs,
    });
  };

  return (
    <View>
      <Text>Total de escaneos: {stats?.total}</Text>
      {/* Agregar gráficos aquí */}
    </View>
  );
};
```

#### Paso 4: Crear queries útiles

```sql
-- Escaneos hoy
SELECT COUNT(*) as total
FROM qr_scans
WHERE scanned_at > CURRENT_DATE;

-- Escaneos por sucursal (últimos 30 días)
SELECT 
  branches.name,
  COUNT(qr_scans.id) as escaneos
FROM qr_scans
JOIN qr_tokens ON qr_scans.qr_token_id = qr_tokens.id
JOIN branches ON qr_tokens.branch_id = branches.id
WHERE qr_scans.scanned_at > NOW() - INTERVAL '30 days'
GROUP BY branches.name
ORDER BY escaneos DESC;

-- Escaneos por hora del día
SELECT 
  EXTRACT(HOUR FROM scanned_at) as hora,
  COUNT(*) as escaneos
FROM qr_scans
GROUP BY hora
ORDER BY hora;

-- Dispositivos más usados
SELECT 
  device_type,
  COUNT(*) as cantidad
FROM qr_scans
GROUP BY device_type;
```

---

## 6️⃣ TESTING FINAL

### Checklist antes de publicar:

```bash
# ✅ Dominio configurado
curl https://turestaurante.com/.well-known/apple-app-site-association
curl https://turestaurante.com/.well-known/assetlinks.json

# ✅ Supabase conectado
# Verificar en app: Generar QR → Debe guardarse en Supabase

# ✅ RLS funcionando
# Verificar: Admin solo ve vinos de su sucursal

# ✅ QR reales
# Generar QR → Imprimir → Escanear → Debe abrir app

# ✅ Expiración
# Generar QR expirado → Escanear → Debe mostrar error

# ✅ Analytics
# Escanear QR → Verificar registro en qr_scans table
```

---

## 7️⃣ PUBLICAR EN STORES

### A. App Store (iOS)

```bash
# 1. Build de producción
eas build --profile production --platform ios

# 2. Subir a TestFlight
eas submit --platform ios

# 3. Crear app en App Store Connect
# https://appstoreconnect.apple.com

# 4. Completar información
# - Screenshots
# - Descripción
# - Keywords
# - Privacy policy URL

# 5. Submit for review
```

### B. Google Play (Android)

```bash
# 1. Build de producción
eas build --profile production --platform android

# 2. Subir a Google Play Console
eas submit --platform android

# 3. Crear app en Google Play Console
# https://play.google.com/console

# 4. Completar información
# - Screenshots
# - Descripción
# - Categoría
# - Privacy policy URL

# 5. Enviar para revisión
```

---

## 📊 RESUMEN

| Paso | Estado | Tiempo estimado |
|------|--------|-----------------|
| 1. Dominio | ⏳ | 1-2 horas |
| 2. Archivos verificación | ⏳ | 30 mins |
| 3. Supabase | ⏳ | 2-3 horas |
| 4. RLS | ⏳ | 1-2 horas |
| 5. Analytics | ⏳ | 1 hora |
| 6. Testing | ⏳ | 2-4 horas |
| 7. Publicar stores | ⏳ | 1-2 semanas (revisión) |

**Total**: ~1-2 días de trabajo + 1-2 semanas de revisión

---

## 🆘 AYUDA

Si algo no funciona:

1. **Verificar logs**:
```bash
# iOS
npx react-native log-ios

# Android
npx react-native log-android
```

2. **Verificar Supabase**:
```bash
# En Supabase Dashboard → Logs
# Ver errores de queries
```

3. **Verificar dominio**:
```bash
# Debe responder
curl -I https://turestaurante.com/.well-known/apple-app-site-association

# Debe ser status 200
```

4. **Verificar deep linking**:
```bash
# Simular escaneo
npx uri-scheme open "cellarium://qr?data=test"
```

