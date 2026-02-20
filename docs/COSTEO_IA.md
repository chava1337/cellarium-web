# 💰 Costeo de Alcance con IA - Cellarium Wine App

## 📊 Resumen Ejecutivo

### Costos Mensuales Estimados por Escenario

| Escenario | Vinos/Mes | Costo IA | Infraestructura | Total/Mes |
|-----------|-----------|----------|-----------------|-----------|
| **Restaurante Pequeño** | 20-30 vinos | $15-25 | $25 | **$40-50** |
| **Restaurante Mediano** | 50-100 vinos | $35-70 | $25 | **$60-95** |
| **Restaurante Grande** | 150-200 vinos | $100-140 | $25 | **$125-165** |
| **Multi-sucursal (5)** | 300-500 vinos | $200-350 | $50 | **$250-400** |

---

## 🤖 Desglose de Costos de IA

### 1. **Google Vision API** (Reconocimiento de Etiquetas)

#### Pricing (2024)
- **Primeras 1,000 llamadas/mes**: GRATIS
- **1,001 - 5,000,000**: $1.50 por 1,000 llamadas
- **Más de 5,000,000**: $0.60 por 1,000 llamadas

#### Features Usadas
- **TEXT_DETECTION**: Reconocimiento de texto en etiqueta
- **LOGO_DETECTION**: Identificación de bodegas conocidas
- **LABEL_DETECTION**: Clasificación de tipo de vino

**Costo por vino**: ~$0.0045 (3 features x $0.0015)

#### Ejemplos de Uso Mensual

| Vinos/Mes | Llamadas API | Costo |
|-----------|--------------|-------|
| 20 | 60 (3 por vino) | **GRATIS** |
| 50 | 150 | **GRATIS** |
| 100 | 300 | **GRATIS** |
| 200 | 600 | **GRATIS** |
| 500 | 1,500 | **$2.25** |
| 1,000 | 3,000 | **$4.50** |

✅ **Conclusión**: Hasta ~300 vinos/mes es completamente **GRATIS**

---

### 2. **OpenAI GPT-4** (Generación de Descripciones)

#### Pricing (2024)
- **GPT-4o** (recomendado):
  - Input: $2.50 por 1M tokens
  - Output: $10.00 por 1M tokens
- **GPT-3.5-turbo** (alternativa económica):
  - Input: $0.50 por 1M tokens
  - Output: $1.50 por 1M tokens

#### Tokens Estimados por Vino

**Prompt (Input)**:
```
"Eres un sommelier experto. Describe este vino:
Nombre: Château Margaux 2015
Bodega: Château Margaux
Tipo: Tinto
Uva: Cabernet Sauvignon
Región: Margaux, Bordeaux
País: Francia
Alcohol: 13.5%

Genera:
1. Descripción general (50 palabras)
2. Notas de cata (40 palabras)
3. Maridajes (20 palabras)
4. Temperatura de servicio
5. Niveles sensoriales (1-5)"
```

**Tokens aproximados**:
- Input: ~200 tokens
- Output: ~300 tokens

#### Costo por Vino

**Con GPT-4o**:
- Input: 200 tokens = $0.0005
- Output: 300 tokens = $0.0030
- **Total: ~$0.0035 por vino**

**Con GPT-3.5-turbo** (alternativa):
- Input: 200 tokens = $0.0001
- Output: 300 tokens = $0.00045
- **Total: ~$0.00055 por vino**

#### Ejemplos de Uso Mensual

| Vinos/Mes | GPT-4o | GPT-3.5-turbo |
|-----------|--------|---------------|
| 20 | **$0.07** | **$0.01** |
| 50 | **$0.18** | **$0.03** |
| 100 | **$0.35** | **$0.06** |
| 200 | **$0.70** | **$0.11** |
| 500 | **$1.75** | **$0.28** |
| 1,000 | **$3.50** | **$0.55** |

✅ **Conclusión**: Incluso con 200 vinos/mes, el costo es **menos de $1**

---

### 3. **Google Custom Search API** (Búsqueda de Imágenes)

#### Pricing (2024)
- **Primeras 100 búsquedas/día**: GRATIS
- **Más de 100**: $5 por 1,000 búsquedas

**Nota**: Buscamos 1 imagen por vino (5 resultados por búsqueda)

#### Ejemplos de Uso Mensual

| Vinos/Mes | Búsquedas/Día | Costo |
|-----------|---------------|-------|
| 20 | ~1 | **GRATIS** |
| 50 | ~2 | **GRATIS** |
| 100 | ~3 | **GRATIS** |
| 200 | ~7 | **GRATIS** |
| 500 | ~17 | **GRATIS** |
| 1,000 | ~33 | **GRATIS** |
| 3,000 | ~100 | **GRATIS** |
| 5,000 | ~167 | **$10/mes** |

✅ **Conclusión**: Hasta 3,000 vinos/mes es completamente **GRATIS**

---

## 🗄️ Costos de Infraestructura (Supabase)

### Planes Disponibles

#### **Plan Free** ($0/mes)
- ✅ 500 MB Database
- ✅ 1 GB File Storage
- ✅ 50,000 Monthly Active Users
- ✅ 500 MB Bandwidth
- ✅ 2 GB Edge Function Executions
- ❌ Sin email support

**Ideal para**: Testing y restaurantes pequeños (1-2 sucursales)

#### **Plan Pro** ($25/mes)
- ✅ 8 GB Database
- ✅ 100 GB File Storage
- ✅ 100,000 Monthly Active Users
- ✅ 50 GB Bandwidth
- ✅ 150 GB Edge Function Executions
- ✅ Email support
- ✅ Daily backups

**Ideal para**: 3-10 sucursales, ~500-1000 vinos

#### **Plan Team** ($50/mes)
- ✅ 100 GB Database
- ✅ 200 GB File Storage
- ✅ Unlimited Monthly Active Users
- ✅ 250 GB Bandwidth
- ✅ 500 GB Edge Function Executions
- ✅ Priority email support
- ✅ Multiple team members

**Ideal para**: Cadenas de restaurantes (10+ sucursales)

---

## 📈 Escenarios Reales con Costos

### 🍽️ Escenario 1: Restaurante Boutique

**Perfil**:
- 1 sucursal
- Carta de 50-80 vinos
- 10-15 vinos nuevos por mes
- ~200 comensales/mes escanean QR

**Costos Mensuales**:
```
Google Vision:         GRATIS (45 llamadas)
GPT-4o:                $0.05 (15 vinos)
Google Images:         GRATIS (15 búsquedas)
Supabase Free:         GRATIS
───────────────────────────────────
TOTAL:                 $0.05/mes
```

**Costo Anual**: **~$0.60** (insignificante)

---

### 🏪 Escenario 2: Restaurante Establecido

**Perfil**:
- 1 sucursal
- Carta de 150-200 vinos
- 30-40 vinos nuevos por mes
- ~800 comensales/mes escanean QR

**Costos Mensuales**:
```
Google Vision:         GRATIS (120 llamadas)
GPT-4o:                $0.14 (40 vinos)
Google Images:         GRATIS (40 búsquedas)
Supabase Pro:          $25.00
───────────────────────────────────
TOTAL:                 $25.14/mes
```

**Costo Anual**: **~$302**
**Costo por vino nuevo**: **$0.63**

---

### 🏢 Escenario 3: Cadena de Restaurantes (5 sucursales)

**Perfil**:
- 5 sucursales
- Carta promedio: 150 vinos por sucursal
- Total catálogo: ~500 vinos únicos
- 100 vinos nuevos por mes (entre todas)
- ~3,000 comensales/mes escanean QR

**Costos Mensuales**:
```
Google Vision:         GRATIS (300 llamadas)
GPT-4o:                $0.35 (100 vinos)
Google Images:         GRATIS (100 búsquedas)
Supabase Team:         $50.00
───────────────────────────────────
TOTAL:                 $50.35/mes
```

**Costo Anual**: **~$604**
**Costo por sucursal**: **$10.07/mes**
**Costo por vino nuevo**: **$0.50**

---

### 🏰 Escenario 4: Cadena Grande (20 sucursales)

**Perfil**:
- 20 sucursales
- Carta promedio: 200 vinos por sucursal
- Total catálogo: ~1,500 vinos únicos
- 300 vinos nuevos por mes
- ~15,000 comensales/mes escanean QR

**Costos Mensuales**:
```
Google Vision:         GRATIS (900 llamadas)
GPT-4o:                $1.05 (300 vinos)
Google Images:         GRATIS (300 búsquedas)
Supabase Team:         $50.00
Bandwidth adicional:   $10.00 (estimado)
───────────────────────────────────
TOTAL:                 $61.05/mes
```

**Costo Anual**: **~$733**
**Costo por sucursal**: **$3.05/mes**
**Costo por vino nuevo**: **$0.20**

---

## 💡 Optimizaciones para Reducir Costos

### 1. **Caché de Resultados**
```typescript
// Guardar resultados de IA en base de datos
// Si un vino ya fue procesado, reutilizar datos
// Ahorro: ~70% en vinos populares
```

### 2. **Usar GPT-3.5-turbo para vinos comunes**
```typescript
// GPT-4o: Solo para vinos premium/complejos
// GPT-3.5-turbo: Vinos estándar
// Ahorro: ~80% en costos de GPT
```

### 3. **Batch Processing**
```typescript
// Procesar múltiples vinos en una sola llamada a GPT
// Ahorro: ~40% en costos de API
```

### 4. **Imágenes Locales**
```typescript
// Subir imagen propia en lugar de buscar en web
// Ahorro: 100% de Google Custom Search
```

---

## 📊 Comparación con Alternativas

### Opción 1: **Sin IA (Manual)**
**Costo de tiempo**:
- 15-20 min por vino (investigación, redacción)
- 200 vinos/mes = 60 horas/mes
- Costo laboral: $15/hora × 60h = **$900/mes**

### Opción 2: **Con IA (Cellarium)**
**Costo de tiempo**:
- 2-3 min por vino (captura + revisión)
- 200 vinos/mes = 10 horas/mes
- Costo laboral: $15/hora × 10h = **$150/mes**
- Costo IA: **$25/mes**
- **Total: $175/mes**

### **Ahorro**: $725/mes (**80% reducción**)

---

## 🎯 Recomendaciones por Tamaño

### Restaurante Pequeño (1 sucursal, <100 vinos)
```
✅ Plan Free de Supabase
✅ GPT-3.5-turbo para descripción
✅ Google Vision (tier gratis)
💰 Costo: $0-5/mes
```

### Restaurante Mediano (1-3 sucursales, 100-300 vinos)
```
✅ Plan Pro de Supabase ($25/mes)
✅ GPT-4o para descripción
✅ Google Vision (tier gratis)
💰 Costo: $25-35/mes
```

### Cadena Grande (5+ sucursales, 500+ vinos)
```
✅ Plan Team de Supabase ($50/mes)
✅ GPT-4o para vinos premium
✅ GPT-3.5-turbo para vinos estándar
✅ Implementar caché inteligente
💰 Costo: $50-100/mes
```

---

## 🚀 ROI (Retorno de Inversión)

### Beneficios Cuantificables

1. **Ahorro de Tiempo**: 80% menos tiempo en gestión
2. **Consistencia**: Descripciones profesionales 100% del tiempo
3. **Escalabilidad**: Agregar 10 vinos o 100 vinos = mismo esfuerzo
4. **Experiencia**: Catálogo premium sin contratar sommelier
5. **Multi-idioma**: Traducción automática (futuro)

### Ejemplo de ROI (Restaurante Mediano)

**Inversión Mensual**: $30 (IA + infraestructura)
**Ahorro en Tiempo**: $750 (60 horas × $12.50/hora)
**ROI**: **2,400%**

**Payback Period**: Inmediato (mes 1)

---

## 📝 Conclusión

### **La IA es extremadamente económica**

- ✅ **Tier gratuito** cubre la mayoría de casos de uso
- ✅ **Costos escalables** crecen proporcionalmente al uso
- ✅ **ROI positivo** desde el primer mes
- ✅ **Sin costos ocultos** todo es pay-as-you-go
- ✅ **Ahorro masivo** vs. trabajo manual

### **Costo Real por Vino Nuevo**

| Componente | Costo |
|------------|-------|
| Google Vision | $0.0045 |
| GPT-4o | $0.0035 |
| Google Images | $0.00 (gratis hasta 3K/mes) |
| **TOTAL** | **$0.008 por vino** |

### **Menos de 1 centavo por vino** 🎉

---

## 🔮 Proyección a 3 Años

### Restaurante con 5 Sucursales

| Año | Vinos Nuevos | Costo IA | Costo Manual | Ahorro |
|-----|--------------|----------|--------------|--------|
| Año 1 | 1,200 | $420 | $10,800 | $10,380 |
| Año 2 | 800 | $280 | $7,200 | $6,920 |
| Año 3 | 600 | $210 | $5,400 | $5,190 |
| **Total** | **2,600** | **$910** | **$23,400** | **$22,490** |

**Ahorro Total en 3 años**: **$22,490** (96% reducción)

---

## 📞 Contacto

Para consultas sobre implementación o costos específicos:
- **Email**: support@cellarium.app
- **Documentación**: docs.cellarium.app
- **API Status**: status.cellarium.app

---

**Última actualización**: Enero 2025  
**Precios basados en**: Google Cloud, OpenAI, Supabase pricing públicos  
**Nota**: Los precios pueden variar según región y uso real



