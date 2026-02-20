# 🔄 DIAGRAMA DE FLUJO: Pantalla de Alta de Vino con IA

```
┌─────────────────────────────────────────────────────────────────┐
│                    PANTALLA DE CAPTURA                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   📷 Tomar Foto │  │  🖼️ Galería     │  │ ✍️ Manual       │ │
│  │   de etiqueta   │  │  Seleccionar    │  │ Agregar         │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                 PANTALLA DE PROCESAMIENTO                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              ⏳ Procesando etiqueta...                  │   │
│  │        La IA está reconociendo el vino                  │   │
│  │                                                         │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │           [Imagen de la etiqueta]               │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                 PANTALLA DE REVISIÓN                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  📋 Información del Vino                                │   │
│  │                                                         │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │ Nombre del vino *        [Château Margaux    ] │   │   │
│  │  │ Bodega *                 [Château Margaux    ] │   │   │
│  │  │ Añada                    [2015              ] │   │   │
│  │  │ % Alcohol                [13.5              ] │   │   │
│  │  │ Tipo de uva *            [Cabernet Sauvignon] │   │   │
│  │  │ Región                   [Bordeaux          ] │   │   │
│  │  │ País *                   [Francia           ] │   │   │
│  │  │ Descripción              [Vino elegante...  ] │   │   │
│  │  │ Notas de cata            [Aromas frutales...] │   │   │
│  │  │ Maridajes                [Carnes rojas...   ] │   │   │
│  │  │ Temperatura de servicio  [16-18°C          ] │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │                                                         │   │
│  │  💰 Precios y Stock                                     │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │ Precio por Copa      [150    ] Precio Botella   │   │   │
│  │  │                     [850    ]                  │   │   │
│  │  │ Stock Inicial *      [12 botellas            ] │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │                                                         │   │
│  │  ┌─────────────────┐  ┌─────────────────┐               │   │
│  │  │ 🖼️ Seleccionar  │  │ ✅ Guardar Vino │               │   │
│  │  │    imagen       │  │                 │               │   │
│  │  └─────────────────┘  └─────────────────┘               │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                 PANTALLA DE IMÁGENES                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  🖼️ Imagen de la Botella                                │   │
│  │                                                         │   │
│  │  Imágenes sugeridas por IA:                             │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │   │
│  │  │ [IMG 1] │ │ [IMG 2] │ │ [IMG 3] │ │ [IMG 4] │       │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │   │
│  │                                                         │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │           📤 Subir mi propia imagen              │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │                                                         │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │                Continuar                        │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RESULTADO FINAL                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ✅ Vino registrado                                     │   │
│  │  Château Margaux ha sido agregado al catálogo          │   │
│  │  con 12 botellas en stock.                             │   │   │
│  │                                                         │   │
│  │  ┌─────────────────┐  ┌─────────────────┐               │   │
│  │  │ Agregar otro    │  │ Ver catálogo    │               │   │
│  │  └─────────────────┘  └─────────────────┘               │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 🔍 **VALIDACIONES EN CADA PASO:**

### **📸 Captura:**
- ✅ **Permisos de cámara** solicitados
- ✅ **Permisos de galería** solicitados
- ✅ **Calidad de imagen** configurada (0.8)
- ✅ **Aspecto de imagen** configurado (3:4)

### **⏳ Procesamiento:**
- ✅ **Google Vision API** para extraer texto
- ✅ **Datos mock seguros** como fallback
- ✅ **Manejo de errores** robusto

### **📋 Revisión:**
- ✅ **Campos obligatorios** validados
- ✅ **Tipos de datos** correctos
- ✅ **Rangos numéricos** validados
- ✅ **Stock inicial** > 0

### **🖼️ Imágenes:**
- ✅ **Imágenes sugeridas** (futuro)
- ✅ **Subida personalizada** disponible
- ✅ **Selección final** de imagen

### **💾 Guardado:**
- ✅ **Inserción en wines** con todos los campos
- ✅ **Inserción en wine_branch_stock** con precios
- ✅ **Relaciones correctas** entre tablas
- ✅ **Auditoría** con created_by/updated_by













