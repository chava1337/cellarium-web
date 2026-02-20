# 🍷 Sistema Evidence-First para Cellarium

## 📋 **Resumen del Sistema**

El sistema Evidence-First es una implementación optimizada que garantiza la mejor calidad de datos posible usando únicamente OpenAI, eliminando la dependencia de APIs externas no confiables.

## 🎯 **Principios Fundamentales**

### **1. Evidence-First (Evidencia Primero)**
- **Solo datos verificables**: No se inventan ni infieren datos
- **Evidencia obligatoria**: Requiere al menos una fuente de evidencia
- **Transparencia total**: Cada dato tiene una fuente identificable

### **2. Flujo de Alta Optimizado**
```
Usuario → Evidencia → Extracción IA → Validación → Vino Canónico → Descripción
```

### **3. Entrada Mínima Obligatoria**
- **Productor/Bodega**: Nombre del productor
- **Vino**: Nombre/marca del vino
- **Añada**: Año de cosecha

## 🔍 **Tipos de Evidencia Soportados**

### **1. Contraetiqueta (Recomendado)**
- **Foto nítida** de la contraetiqueta
- **Contiene**: % alcohol, D.O., crianza, composición
- **Procesamiento**: OCR + IA para extracción

### **2. Ficha Técnica PDF**
- **Documento oficial** del productor
- **Contiene**: Datos técnicos completos
- **Procesamiento**: Extracción de texto + IA

### **3. Texto Pegado**
- **Texto copiado** desde web oficial
- **Contiene**: Información verificable
- **Procesamiento**: IA directa

## 🏗️ **Arquitectura de Base de Datos**

### **Tablas Principales**

#### **`wines_canonical`**
```sql
- id: UUID único
- canonical_key: "bodega|vino|añada" normalizado
- name, producer, vintage: Campos obligatorios
- appellation, country, grapes[]: Campos opcionales
- abv, aging_months, oak_types[]: Datos técnicos
- confidence, coverage: Métricas de calidad
- last_verified_at: Timestamp de verificación
```

#### **`wine_sources`**
```sql
- id: UUID único
- wine_id: Referencia al vino canónico
- type: Tipo de evidencia
- url_or_storage_path: Ubicación de la evidencia
- extracted_json: Datos extraídos
- extracted_at: Timestamp de extracción
```

#### **`wine_images`**
```sql
- id: UUID único
- wine_id: Referencia al vino
- uploader_id: Usuario que subió la imagen
- quality_score: Puntuación de calidad
- is_canonical: Imagen oficial
- path: Ruta de almacenamiento
```

## 🤖 **Procesamiento con IA**

### **1. Extracción de Datos**
```typescript
// Prompt optimizado para precisión
const prompt = `
Eres un experto enólogo especializado en extraer datos precisos de etiquetas de vino.
IMPORTANTE: Solo extrae información que esté EXPLÍCITAMENTE presente en el texto.
NO inventes, infieras o asumas datos que no estén claramente escritos.
Devuelve ÚNICAMENTE un JSON con los campos que encuentres.
`;
```

### **2. Validación Automática**
- **Rangos lógicos**: % alcohol 5-18%, crianza 0-60 meses
- **D.O. conocidas**: Validación de denominaciones de origen
- **Coverage score**: % de campos presentes (mínimo 60%)

### **3. Generación de Descripciones**
```typescript
// Solo usa datos existentes
const descriptionPrompt = `
Eres un editor enológico profesional. 
Usa EXCLUSIVAMENTE los campos del objeto data.
Si un campo falta, NO lo inventes ni lo infieras.
PROHÍBE superlativos sin fuente.
`;
```

## 🔄 **Matching Sin APIs Externas**

### **1. Canonical Key**
```typescript
const canonicalKey = generateCanonicalKey(producer, wineName, vintage);
// Ejemplo: "vinicolaadobeguadalupe|rafael|2017"
```

### **2. Fuzzy Matching Local**
- **Trigramas**: Tolerancia a variaciones de escritura
- **Levenshtein**: Distancia de edición para nombres similares
- **Score 0.85-0.95**: Solicita confirmación al usuario

### **3. Reutilización de Datos**
- **Vino canónico**: Un vino, una entrada
- **TTL por añada**: 24 meses de validez
- **Reverificación**: Mejora con nueva evidencia

## 📊 **Métricas de Calidad**

### **1. Coverage Score**
```typescript
const coverage = (presentFields / totalFields) * 100;
// Mínimo recomendado: 60%
```

### **2. Confidence Score**
```typescript
const confidence = evidenceQuality * dataCompleteness;
// Rango: 0.0 - 1.0
```

### **3. Validación Automática**
- **Rangos lógicos**: Validación de valores numéricos
- **Formato**: Validación de tipos de datos
- **Consistencia**: Verificación de coherencia

## 🎨 **Interfaz de Usuario**

### **1. Pantalla de Registro**
- **Campos obligatorios**: Productor, vino, añada
- **Evidencias**: Botones para cada tipo de evidencia
- **Progreso**: Indicador de procesamiento
- **Resultado**: Información extraída y coverage

### **2. Flujo de Evidencia**
```
1. Capturar/Seleccionar evidencia
2. Procesar con IA
3. Mostrar datos extraídos
4. Confirmar y guardar
```

### **3. Validación Visual**
- **Coverage < 60%**: Advertencia visual
- **Campos faltantes**: Indicación clara
- **Calidad de imagen**: Puntuación visible

## 🔧 **Implementación Técnica**

### **1. Servicios**
- **`EvidenceFirstWineService`**: Lógica principal
- **`OpenAI Integration`**: Procesamiento con IA
- **`Database Operations`**: CRUD optimizado

### **2. Componentes**
- **`EvidenceFirstWineScreen`**: Pantalla principal
- **`EvidenceModal`**: Modal de evidencia
- **`WineInfoDisplay`**: Visualización de datos

### **3. Validaciones**
- **Client-side**: Validación inmediata
- **Server-side**: Validación robusta
- **Database**: Constraints y triggers

## 📈 **Beneficios del Sistema**

### **1. Calidad de Datos**
- ✅ **Datos verificables**: Cada dato tiene fuente
- ✅ **Sin inventar**: No se infieren datos
- ✅ **Transparencia**: Trazabilidad completa

### **2. Eficiencia**
- ✅ **Reutilización**: Un vino, una entrada
- ✅ **Matching inteligente**: Evita duplicados
- ✅ **Caché global**: Datos compartidos

### **3. Escalabilidad**
- ✅ **Sin APIs externas**: Independiente
- ✅ **Procesamiento local**: Control total
- ✅ **Base de datos optimizada**: Búsquedas rápidas

## 🚀 **Próximos Pasos**

### **1. Implementación Inmediata**
- [ ] Aplicar migración de base de datos
- [ ] Integrar pantalla Evidence-First
- [ ] Probar con vinos reales

### **2. Mejoras Futuras**
- [ ] OCR mejorado para imágenes
- [ ] Validación de D.O. automática
- [ ] Sistema de votación comunitaria

### **3. Optimizaciones**
- [ ] Caché de respuestas OpenAI
- [ ] Procesamiento en lotes
- [ ] Métricas de rendimiento

## 🎯 **Resultado Esperado**

Con este sistema Evidence-First:

1. **✅ Datos 100% verificables** - Cada dato tiene fuente
2. **✅ Calidad garantizada** - No se inventan datos
3. **✅ Eficiencia máxima** - Reutilización de datos
4. **✅ Escalabilidad** - Sin dependencias externas
5. **✅ Transparencia total** - Trazabilidad completa

**¡El sistema más robusto y confiable para gestión de vinos!** 🍷✨














































