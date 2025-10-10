# Cellarium Web - Sitio de Verificación y Redirección

Este sitio web sirve los archivos necesarios para que los códigos QR funcionen correctamente.

## 📁 Estructura

```
vercel-site/
├── public/
│   ├── .well-known/
│   │   ├── apple-app-site-association  # Verificación iOS
│   │   └── assetlinks.json             # Verificación Android
│   ├── index.html                       # Página principal
│   └── qr.html                          # Página de redirección QR
├── vercel.json                          # Configuración Vercel
└── README.md                            # Este archivo
```

## 🚀 Desplegar en Vercel

### Opción 1: Con Git (Recomendado)

```bash
# 1. Inicializar Git
git init
git add .
git commit -m "Initial commit"

# 2. Crear repositorio en GitHub
# Ve a: https://github.com/new

# 3. Conectar y subir
git remote add origin https://github.com/TU_USUARIO/cellarium-web.git
git branch -M main
git push -u origin main

# 4. Importar en Vercel
# Ve a: https://vercel.com/new
# Selecciona el repositorio
# Click "Deploy"
```

### Opción 2: Con Vercel CLI

```bash
# 1. Instalar Vercel CLI
npm i -g vercel

# 2. Login
vercel login

# 3. Deploy
vercel --prod
```

## ⚙️ Configuración Necesaria

### Antes de desplegar:

1. **Apple Team ID** (para iOS):
   - Obtener con: `eas credentials -p ios`
   - Reemplazar `TEAM_ID` en `apple-app-site-association`

2. **SHA-256 Fingerprint** (para Android):
   - Obtener con: `eas credentials -p android`
   - Reemplazar en `assetlinks.json`

3. **URLs de las Stores**:
   - Actualizar en `qr.html` cuando publiques la app

## ✅ Verificar Deployment

Después de desplegar, verificar que estos URLs funcionen:

```
✅ https://tu-dominio.vercel.app
✅ https://tu-dominio.vercel.app/.well-known/apple-app-site-association
✅ https://tu-dominio.vercel.app/.well-known/assetlinks.json
✅ https://tu-dominio.vercel.app/qr
```

## 🔗 Dominio Personalizado

Para usar tu propio dominio:

1. En Vercel: Settings → Domains → Add
2. Agregar: `turestaurante.com`
3. Configurar DNS:
   - Tipo A: 76.76.21.21
   - CNAME www: cname.vercel-dns.com

## 📝 Actualizar la App

Después de desplegar, actualizar estos archivos en tu proyecto Cellarium:

### app.config.js
```javascript
associatedDomains: [
  "applinks:tu-dominio.vercel.app"
]
```

### src/services/QrTokenService.ts
```typescript
const universalUrl = `https://tu-dominio.vercel.app/qr?data=${encodedData}`;
```

## 🆘 Troubleshooting

**Si el archivo de verificación no se descarga:**
- Verificar headers en `vercel.json`
- Verificar que Content-Type sea `application/json`

**Si el QR no abre la app:**
- Verificar que el dominio coincida en app.config.js
- Verificar que los archivos sean accesibles públicamente
- Esperar ~15 minutos para propagación DNS

## 💰 Costo

✅ **100% Gratis** en Vercel
- Hosting ilimitado
- SSL automático
- CDN global
- 100 GB bandwidth/mes

