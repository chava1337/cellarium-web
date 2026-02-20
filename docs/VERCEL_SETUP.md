# 🚀 Guía Paso a Paso - Desplegar en Vercel

## 📋 Lo que Vamos a Hacer

Crear un sitio web gratis en Vercel que:
- ✅ Sirva los archivos de verificación para iOS/Android
- ✅ Tenga una página de redirección elegante
- ✅ Use tu dominio personalizado
- ✅ Tenga HTTPS automático
- ✅ CDN global gratis

**Tiempo estimado: 15-20 minutos**

---

## PASO 1: Preparar los Archivos Localmente

### 1.1 Crear estructura de carpetas
```bash
# En tu proyecto Cellarium, crear:
cd C:\Users\chava\Desktop\Cellarium
mkdir vercel-site
cd vercel-site
```

### 1.2 Crear carpeta public
```bash
mkdir public
mkdir public\.well-known
```

---

## PASO 2: Crear los Archivos Necesarios

Ya los tenemos casi listos, solo hay que copiarlos y ajustar.

### 2.1 Archivo de verificación iOS

Archivo: `vercel-site/public/.well-known/apple-app-site-association`

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAM_ID.com.cellarium.winecatalog",
        "paths": [
          "/qr",
          "/qr/*",
          "/catalog",
          "/catalog/*"
        ]
      }
    ]
  },
  "webcredentials": {
    "apps": [
      "TEAM_ID.com.cellarium.winecatalog"
    ]
  }
}
```

**Importante**: Reemplaza `TEAM_ID` cuando lo obtengas de Apple.

### 2.2 Archivo de verificación Android

Archivo: `vercel-site/public/.well-known/assetlinks.json`

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.cellarium.winecatalog",
      "sha256_cert_fingerprints": [
        "REPLACE_WITH_YOUR_SHA256_FINGERPRINT"
      ]
    }
  }
]
```

**Importante**: Reemplaza `REPLACE_WITH_YOUR_SHA256_FINGERPRINT` cuando hagas el build.

### 2.3 Página de redirección

Ruta en el sitio web: `/qr` (App Router; antes `vercel-site/public/qr.html`)

```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cellarium - Redirigiendo...</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #8B0000 0%, #5a0000 100%);
            color: white;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 500px;
            width: 100%;
            text-align: center;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .logo {
            font-size: 64px;
            margin-bottom: 20px;
        }

        h1 {
            font-size: 32px;
            margin-bottom: 10px;
            font-weight: 700;
        }

        .subtitle {
            font-size: 18px;
            opacity: 0.9;
            margin-bottom: 30px;
        }

        .loading {
            display: inline-block;
            width: 50px;
            height: 50px;
            border: 5px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top-color: white;
            animation: spin 1s linear infinite;
            margin: 20px 0;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .message {
            font-size: 16px;
            opacity: 0.8;
            margin: 20px 0;
        }

        .store-buttons {
            display: flex;
            flex-direction: column;
            gap: 15px;
            margin-top: 30px;
        }

        .store-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: white;
            color: #8B0000;
            text-decoration: none;
            padding: 15px 30px;
            border-radius: 12px;
            font-weight: 600;
            font-size: 16px;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .store-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .store-button svg {
            width: 24px;
            height: 24px;
            margin-right: 10px;
        }

        .info {
            margin-top: 30px;
            padding-top: 30px;
            border-top: 1px solid rgba(255, 255, 255, 0.2);
            font-size: 14px;
            opacity: 0.7;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🍷</div>
        <h1>Cellarium</h1>
        <p class="subtitle">Catálogo de Vinos</p>
        
        <div class="loading"></div>
        <p class="message" id="message">Abriendo la aplicación...</p>

        <div class="store-buttons" id="storeButtons" style="display: none;">
            <a href="#" id="appStoreButton" class="store-button">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                Descargar en App Store
            </a>
            <a href="#" id="playStoreButton" class="store-button">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.5,12.92 20.16,13.19L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z"/>
                </svg>
                Descargar en Google Play
            </a>
        </div>

        <div class="info">
            <p>Si la aplicación no se abre automáticamente, descárgala desde tu tienda de aplicaciones.</p>
        </div>
    </div>

    <script>
        // Obtener parámetros del QR desde la URL
        const urlParams = new URLSearchParams(window.location.search);
        const qrDataParam = urlParams.get('data');
        
        // Detectar sistema operativo
        function getMobileOperatingSystem() {
            const userAgent = navigator.userAgent || navigator.vendor || window.opera;
            
            if (/android/i.test(userAgent)) {
                return "Android";
            }
            
            if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
                return "iOS";
            }
            
            return "unknown";
        }

        // Intentar abrir la app
        function tryOpenApp() {
            const os = getMobileOperatingSystem();
            let appUrl = '';
            
            if (qrDataParam) {
                appUrl = `cellarium://qr?data=${qrDataParam}`;
            } else {
                appUrl = 'cellarium://';
            }
            
            // Intentar abrir la app
            window.location.href = appUrl;
            
            // Después de 2 segundos, mostrar opciones de descarga
            setTimeout(() => {
                document.getElementById('message').textContent = '¿No tienes la app instalada?';
                document.getElementById('storeButtons').style.display = 'flex';
                
                // Configurar enlaces de las stores
                if (os === 'iOS') {
                    document.getElementById('appStoreButton').style.display = 'flex';
                    document.getElementById('playStoreButton').style.display = 'none';
                    document.getElementById('appStoreButton').href = 'https://apps.apple.com/app/cellarium/id123456789';
                } else if (os === 'Android') {
                    document.getElementById('appStoreButton').style.display = 'none';
                    document.getElementById('playStoreButton').style.display = 'flex';
                    document.getElementById('playStoreButton').href = 'https://play.google.com/store/apps/details?id=com.cellarium.winecatalog';
                } else {
                    document.getElementById('appStoreButton').style.display = 'flex';
                    document.getElementById('playStoreButton').style.display = 'flex';
                    document.getElementById('message').textContent = 'Descarga Cellarium en tu dispositivo móvil';
                }
            }, 2000);
        }

        // Ejecutar al cargar la página
        tryOpenApp();
    </script>
</body>
</html>
```

### 2.4 Configuración de Vercel

Archivo: `vercel-site/vercel.json`

```json
{
  "version": 2,
  "public": true,
  "headers": [
    {
      "source": "/.well-known/apple-app-site-association",
      "headers": [
        {
          "key": "Content-Type",
          "value": "application/json"
        },
        {
          "key": "Access-Control-Allow-Origin",
          "value": "*"
        }
      ]
    },
    {
      "source": "/.well-known/assetlinks.json",
      "headers": [
        {
          "key": "Content-Type",
          "value": "application/json"
        },
        {
          "key": "Access-Control-Allow-Origin",
          "value": "*"
        }
      ]
    }
  ],
  "redirects": [
    {
      "source": "/qr.html",
      "destination": "/qr"
    }
  ]
}
```

### 2.5 Página principal (opcional)

Archivo: `vercel-site/public/index.html`

```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cellarium - Catálogo de Vinos</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #8B0000 0%, #5a0000 100%);
            color: white;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
        }
        .container {
            text-align: center;
            max-width: 600px;
        }
        h1 {
            font-size: 48px;
            margin-bottom: 20px;
        }
        .logo {
            font-size: 80px;
            margin-bottom: 20px;
        }
        p {
            font-size: 20px;
            line-height: 1.6;
            opacity: 0.9;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🍷</div>
        <h1>Cellarium</h1>
        <p>Sistema de gestión de catálogo de vinos para restaurantes</p>
        <p style="margin-top: 40px; font-size: 16px;">
            Descarga la aplicación móvil para acceder al catálogo
        </p>
    </div>
</body>
</html>
```

---

## PASO 3: Crear Cuenta en Vercel

### 3.1 Ir a Vercel
```
🌐 Abre tu navegador y ve a:
https://vercel.com
```

### 3.2 Crear cuenta
```
Click en "Sign Up" (arriba derecha)

Opciones:
✅ GitHub (Recomendado - más fácil)
✅ GitLab
✅ Bitbucket
✅ Email

👉 Elige GitHub para más fácil
```

### 3.3 Autorizar Vercel
```
GitHub te pedirá permisos
Click en "Authorize Vercel"
```

---

## PASO 4: Subir Proyecto a GitHub

### 4.1 Crear repositorio en GitHub

```
1. Ve a: https://github.com/new
2. Nombre del repositorio: "cellarium-web"
3. Descripción: "Cellarium QR redirect and verification files"
4. Público o Privado (tu elección)
5. Click "Create repository"
```

### 4.2 Subir archivos

```bash
# En tu terminal (PowerShell)
cd C:\Users\chava\Desktop\Cellarium\vercel-site

# Inicializar Git
git init
git add .
git commit -m "Initial commit: Cellarium web files"

# Conectar con GitHub (reemplaza TU_USUARIO)
git remote add origin https://github.com/TU_USUARIO/cellarium-web.git
git branch -M main
git push -u origin main
```

---

## PASO 5: Desplegar en Vercel

### 5.1 Importar proyecto

```
1. En Vercel Dashboard: https://vercel.com/dashboard
2. Click "Add New..." → "Project"
3. Busca "cellarium-web" en la lista
4. Click "Import"
```

### 5.2 Configurar proyecto

```
Framework Preset: "Other"
Root Directory: "./" (dejar como está)
Build Command: (dejar vacío)
Output Directory: "public"

Click "Deploy"
```

### 5.3 Esperar deployment

```
⏳ Vercel construirá tu sitio (30-60 segundos)
✅ Cuando termine, verás: "Congratulations! 🎉"
```

---

## PASO 6: Probar el Sitio

### 6.1 URL automática

```
Vercel te da una URL gratis:
https://cellarium-web.vercel.app

O similar (puede variar)
```

### 6.2 Verificar archivos

```
Abre en navegador:

✅ https://cellarium-web.vercel.app
   → Debe mostrar página principal

✅ https://cellarium-web.vercel.app/.well-known/apple-app-site-association
   → Debe mostrar JSON

✅ https://cellarium-web.vercel.app/.well-known/assetlinks.json
   → Debe mostrar JSON

✅ https://cellarium-web.vercel.app/qr
   → Debe mostrar página de redirección
```

---

## PASO 7: Conectar Dominio Personalizado (Opcional)

### 7.1 En Vercel Dashboard

```
1. Click en tu proyecto "cellarium-web"
2. Tab "Settings"
3. Sidebar → "Domains"
4. Click "Add"
```

### 7.2 Agregar dominio

```
Escribe tu dominio: turestaurante.com
Click "Add"

Vercel te dará instrucciones DNS:
- Tipo: A
- Nombre: @
- Valor: 76.76.21.21 (IP de Vercel)
```

### 7.3 Configurar DNS

```
1. Ve a tu proveedor de dominio (Namecheap, GoDaddy, etc.)
2. DNS Settings
3. Agregar registro A:
   - Type: A
   - Host: @
   - Value: 76.76.21.21
   - TTL: Automatic

4. Agregar registro CNAME (para www):
   - Type: CNAME
   - Host: www
   - Value: cname.vercel-dns.com
   - TTL: Automatic

5. Guardar cambios
```

### 7.4 Verificar en Vercel

```
Volver a Vercel → "Domains"
Click "Refresh" después de 10-15 minutos
Cuando esté listo: ✅ "Valid Configuration"
```

---

## PASO 8: Actualizar Código de la App

### 8.1 Actualizar URLs en app.config.js

```javascript
// C:\Users\chava\Desktop\Cellarium\app.config.js

export default {
  expo: {
    // Si usas dominio custom:
    associatedDomains: [
      "applinks:turestaurante.com",
      "applinks:www.turestaurante.com"
    ],
    
    // Si usas Vercel gratis:
    associatedDomains: [
      "applinks:cellarium-web.vercel.app"
    ],
  }
};
```

### 8.2 Actualizar servicio QR

```typescript
// src/services/QrTokenService.ts

export const generateUniversalQrUrl = (qrData: QrTokenData): string => {
  const encodedData = encodeURIComponent(JSON.stringify(qrData));
  
  // Con dominio custom:
  const universalUrl = `https://turestaurante.com/qr?data=${encodedData}`;
  
  // O con Vercel gratis:
  // const universalUrl = `https://cellarium-web.vercel.app/qr?data=${encodedData}`;
  
  return universalUrl;
};
```

---

## ✅ CHECKLIST FINAL

```
☐ Archivos creados en vercel-site/
☐ Cuenta Vercel creada
☐ Repositorio GitHub creado
☐ Proyecto desplegado en Vercel
☐ URLs verificadas (apple-app-site-association, assetlinks.json)
☐ Página /qr funciona
☐ Dominio conectado (si aplica)
☐ app.config.js actualizado
☐ QrTokenService.ts actualizado
```

---

## 🎉 ¡LISTO!

Tu sitio web está:
✅ Desplegado en Vercel
✅ Con HTTPS automático
✅ CDN global
✅ 100% gratis
✅ Listo para QR codes

**Próximos pasos:**
1. Cuando hagas build de iOS → Actualizar TEAM_ID
2. Cuando hagas build de Android → Actualizar SHA256
3. Probar QR en dispositivos reales

