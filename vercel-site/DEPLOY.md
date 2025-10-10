# 🚀 Guía Rápida de Deployment

## Pasos para Desplegar en Vercel

### PASO 1: Crear Cuenta en Vercel

1. Ve a: https://vercel.com
2. Click "Sign Up"
3. Elige "Continue with GitHub"
4. Autoriza Vercel

### PASO 2: Crear Repositorio en GitHub

1. Ve a: https://github.com/new
2. Nombre: `cellarium-web`
3. Descripción: `Cellarium QR verification and redirect`
4. Público o Privado (tu elección)
5. Click "Create repository"

### PASO 3: Subir Código a GitHub

Desde esta carpeta `vercel-site`, ejecuta:

```powershell
# Inicializar Git
git init

# Agregar archivos
git add .

# Commit inicial
git commit -m "Initial commit: Cellarium web verification files"

# Conectar con GitHub (REEMPLAZA TU_USUARIO)
git remote add origin https://github.com/TU_USUARIO/cellarium-web.git

# Subir a GitHub
git branch -M main
git push -u origin main
```

### PASO 4: Importar en Vercel

1. Ve a: https://vercel.com/new
2. Click "Import Project"
3. Busca `cellarium-web` en la lista
4. Click "Import"
5. Configuración:
   - Framework Preset: `Other`
   - Root Directory: `./`
   - Build Command: (dejar vacío)
   - Output Directory: `public`
6. Click "Deploy"
7. ¡Espera 30-60 segundos!

### PASO 5: Verificar Deployment

Tu sitio estará en:
```
https://cellarium-web.vercel.app
```
(O nombre similar)

**Verificar URLs:**
```
✅ https://tu-url.vercel.app
✅ https://tu-url.vercel.app/.well-known/apple-app-site-association
✅ https://tu-url.vercel.app/.well-known/assetlinks.json
✅ https://tu-url.vercel.app/qr
```

### PASO 6: Actualizar Código de la App

En `C:\Users\chava\Desktop\Cellarium\app.config.js`:

```javascript
associatedDomains: [
  "applinks:cellarium-web.vercel.app"  // Tu URL de Vercel
]
```

En `C:\Users\chava\Desktop\Cellarium\src\services\QrTokenService.ts`:

```typescript
const universalUrl = `https://cellarium-web.vercel.app/qr?data=${encodedData}`;
```

## ✅ ¡LISTO!

Tu sitio está:
- ✅ Desplegado
- ✅ Con HTTPS
- ✅ CDN global
- ✅ 100% gratis

## 🔄 Para Actualizar Después

```powershell
# Hacer cambios en archivos
# Luego:
git add .
git commit -m "Update: descripción de cambios"
git push

# Vercel desplegará automáticamente ✅
```

## 🌐 Dominio Personalizado (Opcional)

### En Vercel:
1. Settings → Domains
2. Add Domain
3. Escribe: `turestaurante.com`
4. Sigue las instrucciones DNS

### En tu proveedor de dominio:
```
Tipo: A
Nombre: @
Valor: 76.76.21.21

Tipo: CNAME
Nombre: www
Valor: cname.vercel-dns.com
```

Esperar 10-30 minutos para propagación DNS.

