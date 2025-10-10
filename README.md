# Cellarium - Catálogo de Vinos para Restaurantes

Una aplicación móvil desarrollada con React Native y Expo para la gestión de catálogos de vinos en restaurantes, con acceso QR para comensales y panel administrativo completo.

## 🍷 Características Principales

- **Catálogo de Vinos**: Visualización atractiva para comensales con fichas descriptivas
- **Acceso QR Seguro**: Los comensales acceden escaneando un código QR sin registro manual
- **Panel Administrativo**: Gestión completa con roles jerárquicos (Admin, Gerente, Personal)
- **Control de Inventario**: Gestión de stock multi-sucursal con alertas de stock bajo
- **Inteligencia Artificial**: Reconocimiento de etiquetas y generación automática de fichas
- **Dashboard de Análisis**: Estadísticas de ventas y rendimiento por sucursal

## 🛠️ Stack Tecnológico

- **Frontend**: React Native (Expo)
- **Backend**: Supabase (Auth, Database, Storage, Edge Functions)
- **IA**: Google Vision API + OpenAI GPT
- **Navegación**: React Navigation
- **Gráficas**: Recharts/Victory Native

## 📋 Requisitos Previos

- Node.js (versión 18 o superior)
- npm o yarn
- Expo CLI
- Cuenta de Supabase
- Cuenta de Google Cloud (para Vision API)
- Cuenta de OpenAI (para GPT)

## 🚀 Instalación y Configuración

### 1. Clonar e Instalar Dependencias

```bash
# Instalar dependencias
npm install

# Instalar dependencias adicionales si es necesario
npm install @supabase/supabase-js @react-navigation/native @react-navigation/stack
```

### 2. Configurar Variables de Entorno

Copia el archivo `env.example` a `.env` y configura las variables:

```bash
cp env.example .env
```

Edita el archivo `.env` con tus credenciales:

```env
# Supabase
EXPO_PUBLIC_SUPABASE_URL=tu_url_de_supabase
EXPO_PUBLIC_SUPABASE_ANON_KEY=tu_clave_anonima_de_supabase

# Google Vision API
EXPO_PUBLIC_GOOGLE_VISION_API_KEY=tu_clave_de_google_vision

# OpenAI
EXPO_PUBLIC_OPENAI_API_KEY=tu_clave_de_openai
```

### 3. Configurar Supabase

1. Crea un nuevo proyecto en [Supabase](https://supabase.com)
2. Ejecuta el script SQL para crear las tablas (ver sección Base de Datos)
3. Configura las políticas de seguridad (RLS)
4. Habilita la autenticación por email

### 4. Ejecutar la Aplicación

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

## 🗄️ Base de Datos

### Tablas Principales

- `branches` - Sucursales del restaurante
- `wines` - Catálogo de vinos
- `wine_branch_stock` - Stock de vinos por sucursal
- `inventory_movements` - Movimientos de inventario
- `qr_tokens` - Tokens QR para acceso de comensales
- `guest_sessions` - Sesiones de invitados
- `users` - Usuarios del sistema

### Script SQL de Creación

```sql
-- Crear tabla de sucursales
CREATE TABLE branches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla de vinos
CREATE TABLE wines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  grape_variety VARCHAR(100) NOT NULL,
  region VARCHAR(100) NOT NULL,
  country VARCHAR(100) NOT NULL,
  vintage INTEGER NOT NULL,
  alcohol_content DECIMAL(4,2) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla de stock por sucursal
CREATE TABLE wine_branch_stock (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wine_id UUID REFERENCES wines(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(wine_id, branch_id)
);

-- Crear tabla de movimientos de inventario
CREATE TABLE inventory_movements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wine_id UUID REFERENCES wines(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('in', 'out', 'adjustment')),
  quantity INTEGER NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla de tokens QR
CREATE TABLE qr_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla de sesiones de invitados
CREATE TABLE guest_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  qr_token_id UUID REFERENCES qr_tokens(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  session_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  session_end TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla de usuarios
CREATE TABLE users (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'manager', 'staff')),
  branch_id UUID REFERENCES branches(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE wines ENABLE ROW LEVEL SECURITY;
ALTER TABLE wine_branch_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
```

## 👥 Roles y Permisos

### Administrador
- Acceso completo a todas las sucursales
- Gestión de usuarios y roles
- Creación y eliminación de vinos
- Acceso a todas las estadísticas

### Gerente
- Acceso a sucursal asignada
- Gestión de inventario
- Generación de tokens QR
- Acceso a estadísticas de sucursal

### Personal
- Acceso a sucursal asignada
- Consulta de inventario
- Registro de movimientos básicos

## 🔐 Seguridad

- Autenticación JWT con Supabase
- Tokens QR con expiración automática
- Políticas de seguridad a nivel de fila (RLS)
- Validación de roles en frontend y backend

## 📱 Características de la App

### Para Comensales (Acceso QR)
- Catálogo visual de vinos disponibles
- Filtros por variedad, región, país, precio
- Fichas detalladas con descripción y características
- Búsqueda por texto
- Interfaz optimizada para tablets en horizontal

### Para Personal
- Dashboard con resumen de inventario
- Alertas de stock bajo
- Registro rápido de movimientos
- Escáner QR para acceso de comensales

### Para Gerentes
- Panel completo de gestión
- Estadísticas de ventas y rendimiento
- Gestión de usuarios de sucursal
- Generación y renovación de tokens QR

### Para Administradores
- Vista global de todas las sucursales
- Gestión completa de usuarios y roles
- Estadísticas consolidadas
- Configuración del sistema

## 🤖 Integración con IA

### Reconocimiento de Etiquetas
- Google Vision API para extraer texto de etiquetas
- Procesamiento de imágenes de botellas de vino
- Extracción automática de datos (nombre, añada, región, etc.)

### Generación de Fichas
- OpenAI GPT para crear descripciones atractivas
- Análisis de características del vino
- Sugerencias de maridaje y temperatura de servicio

## 📊 Análisis y Reportes

- Estadísticas de vinos más consultados
- Análisis de tendencias por región/variedad
- Reportes de movimientos de inventario
- Métricas de uso por sucursal
- Dashboard interactivo con gráficas

## 🚀 Despliegue

### Desarrollo
```bash
npm start
```

### Producción
```bash
# Build para Android
expo build:android

# Build para iOS
expo build:ios
```

## 📝 Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor, abre un issue o pull request para sugerir mejoras.

## 📞 Soporte

Para soporte técnico o preguntas sobre la implementación, contacta al equipo de desarrollo.



