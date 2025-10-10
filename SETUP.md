# 🚀 Guía de Configuración - Cellarium

## Configuración Inicial del Proyecto

### 1. Instalación de Dependencias

```bash
# Instalar dependencias principales
npm install

# Instalar dependencias adicionales si es necesario
npm install @supabase/supabase-js @react-navigation/native @react-navigation/stack
```

### 2. Configuración de Supabase

#### Paso 1: Crear Proyecto en Supabase
1. Ve a [supabase.com](https://supabase.com)
2. Crea una nueva cuenta o inicia sesión
3. Crea un nuevo proyecto
4. Anota la URL y la clave anónima

#### Paso 2: Configurar Base de Datos
1. Ve al SQL Editor en tu proyecto de Supabase
2. Copia y ejecuta el contenido completo del archivo `database.sql`
3. Verifica que todas las tablas se crearon correctamente

#### Paso 3: Configurar Autenticación
1. Ve a Authentication > Settings
2. Habilita "Enable email confirmations" si lo deseas
3. Configura las políticas de seguridad según tus necesidades

### 3. Configuración de Variables de Entorno

```bash
# Copiar archivo de ejemplo
cp env.example .env

# Editar con tus credenciales
# EXPO_PUBLIC_SUPABASE_URL=tu_url_de_supabase
# EXPO_PUBLIC_SUPABASE_ANON_KEY=tu_clave_anonima
```

### 4. Configuración de APIs Externas

#### Google Vision API (Opcional)
1. Ve a [Google Cloud Console](https://console.cloud.google.com)
2. Habilita la API de Vision
3. Crea una clave de API
4. Agrega la clave a tu archivo `.env`

#### OpenAI API (Opcional)
1. Ve a [OpenAI Platform](https://platform.openai.com)
2. Crea una cuenta y obtén tu clave de API
3. Agrega la clave a tu archivo `.env`

### 5. Ejecutar la Aplicación

```bash
# Modo desarrollo
npm start

# Para Android
npm run android

# Para iOS (requiere macOS)
npm run ios

# Para web
npm run web
```

## 📱 Configuración de Dispositivos

### Android
- Android 6.0 (API level 23) o superior
- Orientación horizontal recomendada
- Cámara para escaneo QR

### iOS
- iOS 11.0 o superior
- iPad recomendado
- Orientación horizontal

## 🗄️ Estructura de Base de Datos

### Tablas Principales
- `branches` - Sucursales del restaurante
- `wines` - Catálogo de vinos
- `wine_branch_stock` - Stock por sucursal
- `inventory_movements` - Movimientos de inventario
- `qr_tokens` - Tokens QR para acceso
- `guest_sessions` - Sesiones de invitados
- `users` - Usuarios del sistema

### Roles de Usuario
- **admin**: Acceso completo a todas las sucursales
- **manager**: Acceso a sucursal asignada
- **staff**: Acceso limitado a sucursal asignada

## 🔐 Seguridad

### Políticas RLS
- Todas las tablas tienen Row Level Security habilitado
- Políticas específicas por rol de usuario
- Validación de acceso por sucursal

### Tokens QR
- Tokens únicos con expiración automática
- Validación de sesiones de invitados
- Limpieza automática de tokens expirados

## 🛠️ Desarrollo

### Scripts Disponibles
```bash
npm run lint          # Verificar código
npm run lint:fix      # Corregir errores automáticamente
npm run format        # Formatear código
npm run type-check    # Verificar tipos TypeScript
npm run test          # Ejecutar pruebas
npm run clean         # Limpiar caché
```

### Estructura de Carpetas
```
src/
├── components/       # Componentes reutilizables
├── screens/         # Pantallas de la aplicación
├── navigation/      # Configuración de navegación
├── services/        # Servicios y APIs
├── types/          # Definiciones de tipos
├── utils/          # Utilidades y helpers
├── contexts/       # Contextos de React
└── hooks/         # Hooks personalizados
```

## 📊 Monitoreo y Análisis

### Métricas Disponibles
- Vinos más consultados
- Tendencias por región/variedad
- Movimientos de inventario
- Uso por sucursal
- Sesiones de invitados

### Dashboard de Administración
- Vista global de todas las sucursales
- Estadísticas consolidadas
- Gestión de usuarios
- Configuración del sistema

## 🚀 Despliegue

### Desarrollo
```bash
npm start
```

### Producción
```bash
# Build para Android
npm run build:android

# Build para iOS
npm run build:ios

# Build para ambas plataformas
npm run build:all
```

### EAS Build
```bash
# Instalar EAS CLI
npm install -g @expo/eas-cli

# Configurar proyecto
eas build:configure

# Crear build
eas build --platform android
```

## 🔧 Solución de Problemas

### Problemas Comunes

#### Error de conexión a Supabase
- Verificar URL y clave en `.env`
- Verificar políticas RLS
- Verificar conexión a internet

#### Error de permisos de cámara
- Verificar permisos en `app.json`
- Verificar configuración de Android/iOS
- Probar en dispositivo físico

#### Error de navegación
- Verificar configuración de React Navigation
- Verificar tipos de navegación
- Verificar importaciones

### Logs y Debugging
```bash
# Ver logs de Expo
expo logs

# Ver logs de Android
adb logcat

# Ver logs de iOS
# Usar Xcode Console
```

## 📞 Soporte

Para soporte técnico o preguntas sobre la implementación:
- Revisar documentación de Supabase
- Revisar documentación de Expo
- Revisar documentación de React Navigation
- Contactar al equipo de desarrollo

## 📝 Notas Adicionales

- La aplicación está optimizada para tablets en orientación horizontal
- Se recomienda usar dispositivos con pantalla de al menos 10 pulgadas
- La cámara es necesaria para el escaneo de códigos QR
- Se requiere conexión a internet para funcionar correctamente





