# Sistema de Fichas Extendidas con IA

## 📋 Descripción

Sistema completo de fichas extendidas de vino generadas con IA, implementado con estrategia local-first y caché global multi-tenant.

## 🏗️ Arquitectura

### 1. **Base de Datos Global** (`wine_details_global`)
- Tabla compartida para fichas de vino
- Caché global por `canonical_id` (EAN, fingerprint IA, o slug normalizado)
- TTL de 180 días por defecto
- Soporte para personalización por tenant (futuro)

### 2. **Servicio Local-First** (`WineDetailService`)
- Estrategia de caché en cascada: Local → Global → IA
- Caché local con AsyncStorage
- Caché global en Supabase
- Generación con IA como último recurso

### 3. **Pantalla Nativa** (`FichaExtendidaScreen`)
- UI completamente nativa (sin WebView)
- Secciones organizadas: Bodega, Región, Viñedo, Cata, Servicio, etc.
- Indicadores de confianza y fuente de datos
- Botón de actualización forzada

## 🚀 Uso

### Navegación
```typescript
navigation.navigate('FichaExtendidaScreen', { 
  wineId: 'wine-uuid',
  lang: 'es' // opcional, default 'es'
});
```

### Servicio
```typescript
import { wineDetailService } from '../services/WineDetailService';

// Obtener ficha (local-first)
const result = await wineDetailService.getWineDetailLocalFirst(wineId, 'es');

// Forzar regeneración
const newResult = await wineDetailService.forceRegenerate(wineId, 'es');

// Limpiar caché local
await wineDetailService.clearLocalCache();
```

## 📊 Estructura de Datos

### JSON de Salida de IA
```typescript
interface WineDetailJson {
  winery: string;
  winery_history: string;
  region: {
    country: string;
    macro_region: string;
    appellation: string;
    subregion?: string;
  };
  vineyard: {
    site: string;
    terroir: string;
  };
  grapes: string[];
  vintage: string;
  style: string;
  vinification: string;
  tasting_notes: {
    appearance: string;
    nose: string;
    palate: string;
    finish: string;
  };
  serving: {
    temperature_c: string;
    glassware: string;
    decanting: string;
  };
  food_pairings: string[];
  aging_potential: string;
  alcohol_abv: string;
  residual_sugar: string;
  awards: string[];
  sources: string[];
  confidence: 'low' | 'medium' | 'high';
  disclaimer: string;
}
```

## 🔧 Configuración

### Variables de Entorno
```bash
EXPO_PUBLIC_AI_API_KEY=your_ai_api_key
EXPO_PUBLIC_AI_API_URL=your_ai_api_url
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Migración de Base de Datos
```sql
-- Ejecutar: supabase/migrations/010_wine_details_global_cache.sql
-- Crea tabla, índices, funciones helper y RLS policies
```

## 🎯 Flujo de Funcionamiento

1. **Usuario toca "Más detalles (IA)"**
2. **Buscar en caché local** (AsyncStorage)
3. **Si no existe local** → Buscar en caché global (Supabase)
4. **Si existe global** → Descargar, guardar local, mostrar
5. **Si no existe global** → Generar con IA, guardar global + local, mostrar

## 📱 Características de la UI

### Secciones de la Ficha
- **🏛️ Historia de la Bodega**
- **🌍 Región** (País, Macrorregión, DO, Subregión)
- **🍇 Viñedo** (Sitio, Terroir)
- **🍷 Uvas** (Lista de variedades)
- **⚗️ Vinificación** (Método de elaboración)
- **👃 Notas de Cata** (Aspecto, Nariz, Boca, Final)
- **🍽️ Servicio** (Temperatura, Copa, Decantación)
- **🍖 Maridajes** (Lista de alimentos)
- **📊 Datos Técnicos** (Añada, Estilo, Alcohol, etc.)
- **🏆 Premios** (Lista de reconocimientos)
- **📚 Fuentes** (Guías y referencias)

### Indicadores de Estado
- **📱 Desde caché local** - Datos almacenados localmente
- **🌍 Desde caché global** - Datos compartidos entre tenants
- **🤖 Generado con IA** - Nueva generación
- **⚠️ Confianza baja** - Banner de advertencia

## 🔄 Gestión de Caché

### TTL (Time To Live)
- **Por defecto**: 180 días
- **Configurable** por ficha
- **Verificación automática** de expiración

### Limpieza de Caché
```typescript
// Limpiar solo caché local
await wineDetailService.clearLocalCache();

// Forzar regeneración (limpia local + genera nuevo)
await wineDetailService.forceRegenerate(wineId, lang);
```

## 🌐 Multi-Tenant

### Caché Global Compartido
- **`is_shared = true`** → Cualquier tenant puede reutilizar
- **`canonical_id`** → Identificador único del vino
- **`tenant_id`** → Reservado para personalizaciones futuras

### Canonical ID
Generado automáticamente basado en:
- Bodega + Nombre + DO + Añada
- Normalizado a slug (lowercase, sin caracteres especiales)
- Ejemplo: `marques-de-riscal-tempranillo-reserva-rioja-2018`

## 🚨 Manejo de Errores

### Estados de Error
- **Error de red** → Reintentar automáticamente
- **Error de IA** → Mostrar mensaje de error
- **Error de caché** → Fallback a generación

### Recuperación
- **Botón "Reintentar"** en pantalla de error
- **Botón "Actualizar"** para forzar regeneración
- **Fallback automático** a caché local si existe

## 📈 Rendimiento

### Optimizaciones
- **`getItemLayout`** en FlatList para scroll suave
- **Caché local** para acceso instantáneo
- **Caché global** para reducir llamadas a IA
- **Lazy loading** de secciones de la ficha

### Métricas
- **Tiempo de carga**: < 100ms desde caché local
- **Tiempo de generación**: 2-5 segundos con IA
- **Tamaño de caché**: ~2-5KB por ficha
- **TTL**: 180 días (configurable)

## 🔮 Futuras Mejoras

### Personalización por Tenant
- Overrides específicos por establecimiento
- Configuración de TTL por tenant
- Filtros de contenido por región

### Mejoras de IA
- Contexto adicional del establecimiento
- Personalización de maridajes locales
- Integración con inventario real

### Analytics
- Tracking de uso de fichas
- Métricas de satisfacción
- Optimización de caché basada en uso

## 🧪 Testing

### Casos de Prueba
1. **Primera carga** → Generación con IA
2. **Carga desde caché local** → Acceso instantáneo
3. **Carga desde caché global** → Descarga y guardado local
4. **Caché expirado** → Regeneración automática
5. **Error de red** → Manejo graceful
6. **Forzar actualización** → Regeneración manual

### Datos de Prueba
- Vino de ejemplo incluido en migración
- Canonical ID: `tempranillo-rioja-reserva-2018`
- Ficha completa con todos los campos

## 📝 Notas de Implementación

- **Sin WebView**: UI completamente nativa
- **Offline-first**: Funciona sin conexión después de primera carga
- **Multi-idioma**: Soporte para diferentes idiomas
- **Responsive**: Adaptado a móvil y tablet
- **Accesible**: Cumple estándares de accesibilidad
- **Escalable**: Arquitectura preparada para crecimiento





