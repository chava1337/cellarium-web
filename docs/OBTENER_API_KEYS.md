# 🔑 Cómo Obtener API Keys - Guía Paso a Paso

## 📋 Resumen Rápido

| API | Link Directo | Tiempo | Costo Inicial |
|-----|--------------|--------|---------------|
| **Google Vision** | [console.cloud.google.com](https://console.cloud.google.com) | 10 min | GRATIS ($300 crédito) |
| **OpenAI GPT** | [platform.openai.com](https://platform.openai.com/signup) | 5 min | $5 mínimo |

---

## 1. 👁️ Google Cloud Vision API

### **Link Directo**: https://console.cloud.google.com

### **Paso a Paso**:

#### **A. Crear Cuenta (si no tienes)**
1. Ve a: https://console.cloud.google.com
2. Clic en **"Get started for free"** o **"Comenzar gratis"**
3. Inicia sesión con tu cuenta de Google
4. ✅ **Beneficio**: $300 USD en créditos gratis por 90 días

#### **B. Crear Proyecto**
1. En el dashboard, clic en el dropdown de proyecto (arriba)
2. Clic en **"NEW PROJECT"** o **"NUEVO PROYECTO"**
3. Nombre del proyecto: `cellarium-wine-app`
4. Clic en **"CREATE"** o **"CREAR"**
5. Espera unos segundos mientras se crea

#### **C. Habilitar Vision API**
1. En el menú lateral, ve a: **"APIs & Services"** → **"Library"**
   
   O usa este link directo:
   https://console.cloud.google.com/apis/library

2. En la búsqueda, escribe: **"Cloud Vision API"**

3. Clic en **"Cloud Vision API"**

4. Clic en **"ENABLE"** o **"HABILITAR"**

5. Espera unos segundos mientras se habilita

#### **D. Crear API Key**
1. Ve a: **"APIs & Services"** → **"Credentials"**
   
   O usa este link directo:
   https://console.cloud.google.com/apis/credentials

2. Clic en **"+ CREATE CREDENTIALS"** (arriba)

3. Selecciona **"API key"**

4. ✅ Tu API Key aparecerá en un modal

5. **COPIA LA KEY** (la necesitarás)

6. (Opcional pero recomendado) Clic en **"RESTRICT KEY"**:
   - En "API restrictions", selecciona **"Restrict key"**
   - Marca solo **"Cloud Vision API"**
   - Clic en **"SAVE"**

#### **E. Configurar Billing (Importante)**
1. Ve a: **"Billing"** en el menú lateral
   
   O: https://console.cloud.google.com/billing

2. Vincula una tarjeta de crédito/débito

3. **No te preocupes**: 
   - Tienes $300 USD gratis
   - Las primeras 1,000 llamadas/mes son **GRATIS**
   - Puedes configurar alertas de presupuesto

#### **F. Configurar Alerta de Presupuesto (Recomendado)**
1. En Billing, clic en **"Budgets & alerts"**

2. Clic en **"CREATE BUDGET"**

3. Nombre: `Vision API Budget`

4. Target amount: `$50` (o el monto que quieras)

5. Alert threshold: `50%, 90%, 100%`

6. Clic en **"FINISH"**

### **✅ Resultado Final**:
```env
GOOGLE_VISION_API_KEY=AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 2. 🤖 OpenAI GPT API

### **Link Directo**: https://platform.openai.com/signup

### **Paso a Paso**:

#### **A. Crear Cuenta**
1. Ve a: https://platform.openai.com/signup

2. Opciones para registrarte:
   - Email
   - Google
   - Microsoft

3. Verifica tu email (si usas email)

4. **Nota**: Nueva cuenta incluye $5 USD de crédito gratis (hasta 3 meses)

#### **B. Configurar Billing**
1. Ve a: https://platform.openai.com/account/billing/overview

2. Clic en **"Add payment method"**

3. Ingresa tarjeta de crédito/débito

4. **Mínimo de carga**: $5 USD

5. **Recomendación**: Empieza con $10-20 USD

#### **C. Configurar Límites de Gasto (MUY IMPORTANTE)**
1. En Billing, ve a **"Usage limits"**
   
   O: https://platform.openai.com/account/limits

2. Configura:
   - **Monthly budget**: $20 (o el monto que quieras)
   - **Email threshold**: $15 (te avisará antes de llegar al límite)

3. **Beneficio**: Nunca gastarás más de lo configurado

#### **D. Crear API Key**
1. Ve a: https://platform.openai.com/api-keys

2. Clic en **"+ Create new secret key"**

3. Opciones:
   - Name: `cellarium-wine-app`
   - Permissions: **All** (o selecciona solo lo necesario)
   - Project: Default (o crea uno específico)

4. Clic en **"Create secret key"**

5. ✅ **COPIA LA KEY INMEDIATAMENTE**
   
   ⚠️ **IMPORTANTE**: Solo se muestra una vez, no podrás verla después

6. Guárdala en un lugar seguro

#### **E. Verificar que Funciona**
1. Ve a: https://platform.openai.com/playground

2. Escribe un prompt de prueba: `"Describe un vino tinto"`

3. Clic en **"Submit"**

4. Si funciona, ¡listo!

#### **F. Monitorear Uso**
1. Ve a: https://platform.openai.com/usage

2. Aquí verás:
   - Uso diario
   - Costo acumulado
   - Tokens consumidos
   - Breakdown por modelo

### **✅ Resultado Final**:
```env
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 3. 🔍 Google Custom Search API (Opcional)

### **Link Directo**: https://console.cloud.google.com

### **Paso a Paso**:

#### **A. Habilitar Custom Search API**
1. En Google Cloud Console (mismo proyecto)

2. Ve a: **APIs & Services** → **Library**

3. Busca: **"Custom Search API"**

4. Clic en **"ENABLE"**

5. Usa la misma API Key que creaste para Vision

#### **B. Crear Custom Search Engine**
1. Ve a: https://programmablesearchengine.google.com/

2. Clic en **"Add"** o **"Get started"**

3. Configuración:
   - Name: `Wine Bottle Images`
   - What to search: **Search the entire web**
   - Image search: **ON** ✅
   - SafeSearch: **ON** ✅

4. Clic en **"Create"**

5. ✅ Copia el **Search engine ID** (cx parameter)

### **✅ Resultado Final**:
```env
GOOGLE_SEARCH_API_KEY=AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_SEARCH_ENGINE_ID=0123456789abcdef
```

---

## 4. 📝 Configurar en tu Proyecto

### **A. Crear archivo .env**

En la raíz del proyecto `Cellarium/`:

```bash
# Google Cloud APIs
GOOGLE_VISION_API_KEY=AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_SEARCH_API_KEY=AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_SEARCH_ENGINE_ID=0123456789abcdef

# OpenAI
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Supabase (ya lo tienes)
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### **B. Agregar a .gitignore**

Asegúrate que `.env` está en `.gitignore`:

```gitignore
# Environment variables
.env
.env.local
.env.development
.env.production
```

### **C. Probar las APIs**

Crea archivo de prueba: `test-apis.ts`

```typescript
// Test Google Vision
async function testVision() {
  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`,
    {
      method: 'POST',
      body: JSON.stringify({
        requests: [{
          image: { source: { imageUri: 'https://example.com/wine-label.jpg' } },
          features: [{ type: 'TEXT_DETECTION' }]
        }]
      })
    }
  );
  
  console.log('Vision API:', response.status === 200 ? '✅' : '❌');
}

// Test OpenAI
async function testOpenAI() {
  const response = await fetch(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Say hello!' }]
      })
    }
  );
  
  console.log('OpenAI API:', response.status === 200 ? '✅' : '❌');
}
```

---

## 5. 💰 Costos Reales (Referencia)

### **Google Vision API**
```
Primeras 1,000 llamadas/mes:  GRATIS
1,001 - 5,000,000:            $1.50 por 1,000
```

**Ejemplo**:
- 100 vinos/mes = 300 llamadas = **$0** ✅
- 500 vinos/mes = 1,500 llamadas = **$0.75**

### **OpenAI GPT API**

#### **GPT-4o** (Recomendado)
```
Input:  $2.50 por 1M tokens
Output: $10.00 por 1M tokens
```

**Ejemplo**:
- 100 vinos/mes = **$0.35**
- 500 vinos/mes = **$1.75**

#### **GPT-3.5-turbo** (Más económico)
```
Input:  $0.50 por 1M tokens
Output: $1.50 por 1M tokens
```

**Ejemplo**:
- 100 vinos/mes = **$0.06** ✅
- 500 vinos/mes = **$0.28**

---

## 6. 🔒 Seguridad de API Keys

### **❌ NUNCA hagas esto**:
```typescript
// ❌ NO hardcodear keys en el código
const API_KEY = "AIzaSyDxxxxxxxxxxxxx";

// ❌ NO subir .env a GitHub
git add .env  // ❌ MAL
```

### **✅ SÍ haz esto**:
```typescript
// ✅ Usar variables de entorno
const API_KEY = process.env.GOOGLE_VISION_API_KEY;

// ✅ Verificar que .env está en .gitignore
// ✅ Usar .env.example para documentar
```

### **Crear .env.example**:
```bash
# Google Cloud APIs
GOOGLE_VISION_API_KEY=your-key-here
GOOGLE_SEARCH_API_KEY=your-key-here
GOOGLE_SEARCH_ENGINE_ID=your-cx-here

# OpenAI
OPENAI_API_KEY=your-key-here

# Supabase
EXPO_PUBLIC_SUPABASE_URL=your-url-here
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-key-here
```

---

## 7. ⚠️ Problemas Comunes

### **"API Key inválida"**
- ✅ Verifica que copiaste la key completa
- ✅ Revisa que no haya espacios al inicio/final
- ✅ Asegúrate de habilitar la API en Cloud Console

### **"Billing no configurado"**
- ✅ Agrega método de pago en Google Cloud
- ✅ Acepta los términos y condiciones

### **"Cuota excedida"**
- ✅ Revisa tu uso en: console.cloud.google.com/apis/dashboard
- ✅ Espera al siguiente mes o aumenta cuota

### **"API Key rechazada en OpenAI"**
- ✅ Verifica que agregaste fondos ($5 mínimo)
- ✅ Revisa que la key no haya expirado
- ✅ Crea una nueva key si es necesario

---

## 8. 📞 Links de Soporte

### **Google Cloud**
- Dashboard: https://console.cloud.google.com
- Documentación Vision: https://cloud.google.com/vision/docs
- Soporte: https://cloud.google.com/support
- Pricing: https://cloud.google.com/vision/pricing

### **OpenAI**
- Dashboard: https://platform.openai.com
- Documentación: https://platform.openai.com/docs
- Playground: https://platform.openai.com/playground
- Pricing: https://openai.com/api/pricing/
- Status: https://status.openai.com

---

## 9. ✅ Checklist Final

Antes de continuar con la integración:

- [ ] Cuenta de Google Cloud creada
- [ ] Vision API habilitada
- [ ] API Key de Google generada y copiada
- [ ] Billing configurado en Google Cloud
- [ ] Alerta de presupuesto configurada
- [ ] Cuenta de OpenAI creada
- [ ] Fondos agregados en OpenAI ($5-20)
- [ ] Límite de gasto configurado
- [ ] API Key de OpenAI generada y copiada
- [ ] Archivo `.env` creado con todas las keys
- [ ] `.env` está en `.gitignore`
- [ ] `.env.example` creado para documentación

---

## 🚀 ¿Listo?

Una vez que tengas todas las keys:

1. ✅ Cópialas al archivo `.env`
2. ✅ Reinicia el servidor de desarrollo
3. ✅ Prueba la captura de etiquetas
4. ✅ Verifica que la IA funciona

**¿Ya obtuviste las keys?** 🔑

**Avísame cuando las tengas para continuar con la integración** 🍷



