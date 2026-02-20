# 🔌 APIs Necesarias - Cellarium Wine App

## 📋 Resumen de APIs por Prioridad

| API | Propósito | Prioridad | Costo/Mes | Status |
|-----|-----------|-----------|-----------|--------|
| **Supabase** | Backend completo | 🔴 Crítica | $25-50 | ✅ Configurado |
| **Google Vision** | Reconocimiento etiquetas | 🔴 Crítica | GRATIS-$5 | 🟡 Por integrar |
| **OpenAI GPT** | Descripciones IA | 🔴 Crítica | $1-5 | 🟡 Por integrar |
| **Google Custom Search** | Búsqueda imágenes | 🟡 Media | GRATIS | 🟡 Por integrar |
| **Expo Notifications** | Push notifications | 🟢 Baja | GRATIS | ✅ Instalado |
| **Google Maps** (Futuro) | Ubicación sucursales | 🟢 Baja | GRATIS | ⚪ Opcional |

---

## 1. 🗄️ Supabase (Backend-as-a-Service)

### **Propósito**
Backend completo: Base de datos, autenticación, storage, edge functions, real-time

### **Funcionalidades Específicas**

#### **A. Authentication (Auth)**
```typescript
// Login de administradores
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'admin@restaurant.com',
  password: 'password123'
});

// Registro de nuevos admins
const { data, error } = await supabase.auth.signUp({
  email: 'new@restaurant.com',
  password: 'password123',
  options: {
    data: {
      role: 'sommelier',
      branch_id: 'branch-uuid'
    }
  }
});

// OAuth con Google (futuro)
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google'
});
```

#### **B. Database (PostgreSQL)**
```sql
-- Tablas principales (según MARKDOWN.MD)

-- Sucursales
branches (
  id, name, address, phone, email,
  created_at, updated_at
)

-- Usuarios con roles jerárquicos
users (
  id, email, username, role, status,
  branch_id, invited_by, approved_by,
  created_at, updated_at
)

-- Vinos (catálogo completo)
wines (
  id, name, winery, vintage, grape_variety,
  type, region, country, alcohol_content,
  description, tasting_notes, food_pairings,
  serving_temperature,
  body_level, sweetness_level, acidity_level, intensity_level,
  image_url, created_at, updated_at
)

-- Stock por sucursal
wine_branch_stock (
  id, wine_id, branch_id,
  quantity, min_stock_alert,
  price_bottle, price_glass,
  available_by_glass, available_by_bottle,
  is_featured, is_promotion, promotion_text,
  created_at, updated_at
)

-- Movimientos de inventario
inventory_movements (
  id, wine_id, branch_id,
  movement_type, quantity, reason,
  cost, supplier_id, user_id,
  created_at
)

-- Proveedores
suppliers (
  id, name, contact_name, email, phone,
  address, notes, created_at
)

-- Ventas (para analytics)
sales (
  id, wine_id, branch_id,
  quantity, unit_price, total,
  sale_type, user_id, created_at
)

-- QR Tokens (acceso seguro)
qr_tokens (
  id, token, type, branch_id,
  created_by, expires_at, max_uses, current_uses,
  used, revoked, created_at
)

-- Sesiones de invitados
guest_sessions (
  id, qr_token_id, branch_id,
  started_at, ended_at, device_info, active
)

-- Escaneos de QR (analytics)
qr_scans (
  id, qr_token_id, scanned_at,
  user_agent, device_type, success, error_message
)

-- Calificaciones internas (staff)
staff_ratings (
  id, wine_id, user_id, rating,
  notes, created_at
)

-- Vinos destacados
featured_items (
  id, wine_id, branch_id,
  feature_type, display_order,
  active, created_at
)

-- Imágenes de vinos
wine_images (
  id, wine_id, image_url,
  is_primary, source, created_at
)
```

#### **C. Storage (Archivos)**
```typescript
// Subir imagen de botella
const { data, error } = await supabase.storage
  .from('wine-images')
  .upload(`bottles/${wineId}.jpg`, file, {
    contentType: 'image/jpeg',
    upsert: true
  });

// Obtener URL pública
const { data } = supabase.storage
  .from('wine-images')
  .getPublicUrl(`bottles/${wineId}.jpg`);

// Subir foto de etiqueta (temporal)
const { data, error } = await supabase.storage
  .from('label-scans')
  .upload(`temp/${scanId}.jpg`, file);
```

#### **D. Edge Functions (Serverless)**
```typescript
// Edge Function: Generar token QR firmado
export async function generateQrToken(req: Request) {
  const { branchId, type, duration } = await req.json();
  
  const token = crypto.randomUUID();
  const signature = await signToken(token, SECRET_KEY);
  
  const { data, error } = await supabase
    .from('qr_tokens')
    .insert({
      token,
      type,
      branch_id: branchId,
      expires_at: new Date(Date.now() + duration).toISOString()
    });
  
  return new Response(JSON.stringify({ token, signature }));
}

// Edge Function: Validar token QR
export async function validateQrToken(req: Request) {
  const { token } = await req.json();
  
  const { data, error } = await supabase
    .from('qr_tokens')
    .select('*')
    .eq('token', token)
    .single();
  
  if (error || data.revoked || new Date(data.expires_at) < new Date()) {
    return new Response(JSON.stringify({ valid: false }), { status: 401 });
  }
  
  return new Response(JSON.stringify({ valid: true, data }));
}

// Edge Function: Generar PDF de catálogo
export async function generateCatalogPdf(req: Request) {
  const { branchId } = await req.json();
  
  const { data: wines } = await supabase
    .from('wines')
    .select(`*, wine_branch_stock!inner(*)`)
    .eq('wine_branch_stock.branch_id', branchId);
  
  const pdf = await generatePdf(wines);
  
  return new Response(pdf, {
    headers: { 'Content-Type': 'application/pdf' }
  });
}
```

#### **E. Realtime (Actualizaciones en vivo)**
```typescript
// Escuchar cambios en stock
const channel = supabase
  .channel('stock-updates')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'wine_branch_stock',
    filter: `branch_id=eq.${branchId}`
  }, (payload) => {
    console.log('Stock actualizado:', payload);
    updateUI(payload.new);
  })
  .subscribe();
```

### **Configuración Necesaria**

#### **Variables de Entorno**
```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key (solo backend)
```

#### **Row Level Security (RLS)**
```sql
-- Política: Usuarios solo ven su sucursal
CREATE POLICY "Users can view their branch wines"
ON wines FOR SELECT
USING (
  branch_id IN (
    SELECT branch_id FROM users WHERE id = auth.uid()
  )
);

-- Política: Solo Owner puede gestionar sucursales
CREATE POLICY "Only owner can manage branches"
ON branches FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'owner'
  )
);

-- Política: Invitados solo lectura
CREATE POLICY "Guests read-only access"
ON wines FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM guest_sessions gs
    JOIN qr_tokens qt ON gs.qr_token_id = qt.id
    WHERE gs.active = true
    AND qt.branch_id = wines.branch_id
  )
);
```

### **Pricing**
- **Free**: $0/mes (ideal para desarrollo)
- **Pro**: $25/mes (producción pequeña-mediana)
- **Team**: $50/mes (producción grande)

---

## 2. 👁️ Google Cloud Vision API

### **Propósito**
Reconocimiento óptico de caracteres (OCR) y análisis de imágenes de etiquetas de vino

### **Funcionalidades Específicas**

#### **A. TEXT_DETECTION (Reconocimiento de Texto)**
```typescript
import vision from '@google-cloud/vision';

async function recognizeWineLabel(imageUri: string) {
  const client = new vision.ImageAnnotatorClient({
    keyFilename: './google-credentials.json'
  });
  
  const [result] = await client.textDetection(imageUri);
  const detections = result.textAnnotations;
  
  // Texto completo detectado
  const fullText = detections[0].description;
  
  // Extraer información específica
  const wineInfo = {
    name: extractWineName(fullText),
    winery: extractWinery(fullText),
    vintage: extractVintage(fullText),
    region: extractRegion(fullText),
    alcohol: extractAlcohol(fullText)
  };
  
  return wineInfo;
}

// Ejemplo de respuesta
{
  textAnnotations: [
    {
      description: "CHÂTEAU MARGAUX\n2015\nPREMIER GRAND CRU CLASSÉ\nMARGAUX\n13.5% VOL",
      boundingPoly: {...}
    }
  ]
}
```

#### **B. LOGO_DETECTION (Detección de Logos)**
```typescript
async function detectWinery(imageUri: string) {
  const [result] = await client.logoDetection(imageUri);
  const logos = result.logoAnnotations;
  
  // Identificar bodega conocida
  if (logos.length > 0) {
    return {
      winery: logos[0].description,
      confidence: logos[0].score
    };
  }
}

// Ejemplo de respuesta
{
  logoAnnotations: [
    {
      description: "Château Margaux",
      score: 0.94
    }
  ]
}
```

#### **C. LABEL_DETECTION (Clasificación)**
```typescript
async function classifyWine(imageUri: string) {
  const [result] = await client.labelDetection(imageUri);
  const labels = result.labelAnnotations;
  
  // Identificar tipo de vino
  const wineType = labels.find(l => 
    ['red wine', 'white wine', 'rosé', 'champagne'].includes(l.description.toLowerCase())
  );
  
  return {
    type: wineType?.description,
    confidence: wineType?.score
  };
}

// Ejemplo de respuesta
{
  labelAnnotations: [
    { description: "Red wine", score: 0.98 },
    { description: "Bottle", score: 0.95 },
    { description: "Wine", score: 0.93 }
  ]
}
```

### **Integración en React Native**

```typescript
// src/services/WineAIService.ts
export const recognizeWineLabel = async (imageUri: string) => {
  // Convertir imagen a base64
  const base64Image = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64
  });
  
  // Llamar a Google Vision API
  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: base64Image },
          features: [
            { type: 'TEXT_DETECTION', maxResults: 10 },
            { type: 'LOGO_DETECTION', maxResults: 5 },
            { type: 'LABEL_DETECTION', maxResults: 10 }
          ]
        }]
      })
    }
  );
  
  const result = await response.json();
  
  // Procesar y estructurar datos
  return parseVisionApiResponse(result);
};
```

### **Configuración Necesaria**

#### **1. Google Cloud Console**
```bash
# 1. Crear proyecto en Google Cloud Console
# 2. Habilitar Cloud Vision API
# 3. Crear credenciales (API Key o Service Account)
# 4. Configurar billing (tier gratuito disponible)
```

#### **2. Variables de Entorno**
```env
GOOGLE_VISION_API_KEY=your-api-key-here
# O usando Service Account
GOOGLE_APPLICATION_CREDENTIALS=./google-credentials.json
```

### **Pricing**
- **0-1,000 llamadas/mes**: GRATIS
- **1,001-5,000,000**: $1.50 por 1,000 llamadas
- **5,000,001+**: $0.60 por 1,000 llamadas

**Ejemplo**: 100 vinos/mes = 300 llamadas = **GRATIS**

---

## 3. 🤖 OpenAI GPT API

### **Propósito**
Generación de descripciones profesionales, notas de cata y recomendaciones usando IA

### **Funcionalidades Específicas**

#### **A. Generación de Descripción Completa**
```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function generateWineDescription(wineInfo: any) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o", // o "gpt-3.5-turbo" para más economía
    messages: [
      {
        role: "system",
        content: `Eres un sommelier experto certificado. 
        Genera descripciones profesionales y atractivas de vinos.
        Usa lenguaje accesible pero sofisticado.
        Incluye detalles sensoriales específicos.`
      },
      {
        role: "user",
        content: `Describe este vino para un catálogo de restaurante:
        
        Nombre: ${wineInfo.name}
        Bodega: ${wineInfo.winery}
        Tipo: ${wineInfo.type}
        Uva: ${wineInfo.grape_variety}
        Región: ${wineInfo.region}, ${wineInfo.country}
        Añada: ${wineInfo.vintage}
        Alcohol: ${wineInfo.alcohol_content}%
        
        Genera en formato JSON:
        {
          "description": "Descripción general (50-80 palabras)",
          "tasting_notes": "Aromas y sabores específicos (40-60 palabras)",
          "food_pairings": "Maridajes recomendados (20-30 palabras)",
          "serving_temperature": "Temperatura ideal (ej: 16-18°C)",
          "body_level": 1-5,
          "sweetness_level": 1-5,
          "acidity_level": 1-5,
          "intensity_level": 1-5
        }`
      }
    ],
    temperature: 0.7,
    max_tokens: 800,
    response_format: { type: "json_object" }
  });
  
  return JSON.parse(completion.choices[0].message.content);
}
```

#### **Ejemplo de Respuesta**
```json
{
  "description": "Un Cabernet Sauvignon excepcional de Margaux, esta añada 2015 muestra la elegancia y estructura que han hecho famosa a la región. Con un perfil complejo y equilibrado, este vino combina poder y fineza de manera magistral, siendo ideal tanto para disfrutar ahora como para guardar.",
  
  "tasting_notes": "En nariz, despliega aromas intensos de cassis, mora y grosella negra, complementados con notas de cedro, grafito y un toque de vainilla del roble francés. En boca es elegante y estructurado, con taninos sedosos, buena acidez y un final largo y persistente con toques de especias dulces.",
  
  "food_pairings": "Ideal con cortes de carne premium como ribeye o filet mignon, cordero asado con hierbas, quesos maduros como Comté o Manchego curado, y risotto de hongos.",
  
  "serving_temperature": "16-18°C",
  
  "body_level": 5,
  "sweetness_level": 1,
  "acidity_level": 4,
  "intensity_level": 5
}
```

#### **B. Generación de Maridajes Específicos**
```typescript
async function generatePairingsForMenu(wine: any, menuItems: string[]) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "Eres un sommelier experto en maridajes."
      },
      {
        role: "user",
        content: `Dado este vino:
        ${wine.name} - ${wine.type} - ${wine.grape_variety}
        
        Y estos platillos de nuestro menú:
        ${menuItems.join('\n')}
        
        Sugiere los 3 mejores maridajes y explica por qué.`
      }
    ],
    temperature: 0.7,
    max_tokens: 500
  });
  
  return completion.choices[0].message.content;
}
```

#### **C. Traducción a Múltiples Idiomas (Futuro)**
```typescript
async function translateDescription(description: string, targetLang: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Traduce descripciones de vinos manteniendo el tono profesional y técnico.`
      },
      {
        role: "user",
        content: `Traduce al ${targetLang}:\n\n${description}`
      }
    ],
    temperature: 0.3,
    max_tokens: 1000
  });
  
  return completion.choices[0].message.content;
}
```

### **Configuración Necesaria**

#### **1. OpenAI Account**
```bash
# 1. Crear cuenta en platform.openai.com
# 2. Agregar método de pago
# 3. Generar API Key
# 4. Configurar límites de gasto (opcional pero recomendado)
```

#### **2. Variables de Entorno**
```env
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx
OPENAI_ORGANIZATION_ID=org-xxxxxxxx (opcional)
```

#### **3. Instalación**
```bash
npm install openai --legacy-peer-deps
```

### **Pricing**
#### **GPT-4o** (Recomendado)
- Input: $2.50 por 1M tokens
- Output: $10.00 por 1M tokens
- **Costo por vino**: ~$0.0035

#### **GPT-3.5-turbo** (Alternativa económica)
- Input: $0.50 por 1M tokens
- Output: $1.50 por 1M tokens
- **Costo por vino**: ~$0.00055

**Ejemplo**: 100 vinos/mes con GPT-4o = **$0.35/mes**

---

## 4. 🔍 Google Custom Search API

### **Propósito**
Búsqueda de imágenes de botellas de vino en la web

### **Funcionalidades Específicas**

#### **A. Búsqueda de Imágenes**
```typescript
async function searchBottleImages(
  wineName: string,
  winery: string,
  vintage?: number
) {
  const query = `${wineName} ${winery} ${vintage || ''} wine bottle`;
  
  const response = await fetch(
    `https://www.googleapis.com/customsearch/v1?` +
    `key=${GOOGLE_SEARCH_API_KEY}&` +
    `cx=${SEARCH_ENGINE_ID}&` +
    `q=${encodeURIComponent(query)}&` +
    `searchType=image&` +
    `num=5&` +
    `imgSize=medium&` +
    `fileType=jpg`
  );
  
  const result = await response.json();
  
  return result.items.map(item => ({
    url: item.link,
    thumbnail: item.image.thumbnailLink,
    width: item.image.width,
    height: item.image.height,
    source: item.displayLink
  }));
}
```

#### **Ejemplo de Respuesta**
```json
{
  "items": [
    {
      "link": "https://example.com/chateau-margaux-2015.jpg",
      "image": {
        "thumbnailLink": "https://...",
        "width": 800,
        "height": 1200
      },
      "displayLink": "vivino.com"
    }
  ]
}
```

### **Configuración Necesaria**

#### **1. Google Cloud Console**
```bash
# 1. Habilitar Custom Search API
# 2. Crear Custom Search Engine en https://cse.google.com
# 3. Configurar para buscar imágenes
# 4. Obtener Search Engine ID (cx parameter)
```

#### **2. Variables de Entorno**
```env
GOOGLE_SEARCH_API_KEY=your-api-key
GOOGLE_SEARCH_ENGINE_ID=your-cx-id
```

### **Pricing**
- **0-100 búsquedas/día**: GRATIS
- **101+**: $5 por 1,000 búsquedas adicionales

**Ejemplo**: 100 vinos/mes = 3-4 búsquedas/día = **GRATIS**

---

## 5. 📱 Expo Notifications (Push Notifications)

### **Propósito**
Notificaciones push para alertas de stock bajo, nuevos vinos, promociones

### **Funcionalidades Específicas**

#### **A. Configuración de Notificaciones**
```typescript
import * as Notifications from 'expo-notifications';

// Configurar handler de notificaciones
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Solicitar permisos
async function registerForPushNotifications() {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus !== 'granted') {
    return;
  }
  
  const token = (await Notifications.getExpoPushTokenAsync()).data;
  
  // Guardar token en Supabase
  await supabase
    .from('user_push_tokens')
    .upsert({ user_id: userId, token });
  
  return token;
}
```

#### **B. Envío de Notificaciones**
```typescript
// Alerta de stock bajo (desde Edge Function)
export async function sendLowStockAlert(wineId: string, branchId: string) {
  const { data: users } = await supabase
    .from('users')
    .select('push_token')
    .eq('branch_id', branchId)
    .in('role', ['owner', 'gerente', 'sommelier']);
  
  const { data: wine } = await supabase
    .from('wines')
    .select('name')
    .eq('id', wineId)
    .single();
  
  const message = {
    to: users.map(u => u.push_token),
    sound: 'default',
    title: '⚠️ Stock Bajo',
    body: `${wine.name} tiene stock bajo. Considera reordenar.`,
    data: { wineId, type: 'low_stock' }
  };
  
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(message)
  });
}
```

### **Pricing**
- **Completamente GRATIS**
- Sin límites de notificaciones
- Incluido con Expo

---

## 6. 🗺️ Google Maps API (Opcional - Futuro)

### **Propósito**
Mostrar ubicación de sucursales, navegación para delivery

### **Funcionalidades**
```typescript
import MapView, { Marker } from 'react-native-maps';

<MapView
  initialRegion={{
    latitude: branch.latitude,
    longitude: branch.longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  }}
>
  <Marker
    coordinate={{
      latitude: branch.latitude,
      longitude: branch.longitude
    }}
    title={branch.name}
  />
</MapView>
```

### **Pricing**
- **Maps SDK**: Primeras cargas gratis
- **Geocoding**: $5 por 1,000 llamadas

---

## 📊 Resumen de Costos Mensuales

### **Escenario: 100 vinos/mes**

| API | Llamadas | Costo |
|-----|----------|-------|
| Supabase Pro | - | $25.00 |
| Google Vision | 300 | GRATIS |
| OpenAI GPT-4o | 100 | $0.35 |
| Google Images | 100 | GRATIS |
| Expo Push | Ilimitado | GRATIS |
| **TOTAL** | - | **$25.35/mes** |

**Costo por vino nuevo**: **$0.25**  
**Margen con plan Starter ($49)**: **$23.65 (48%)**

---

## 🔧 Prioridad de Implementación

### **Fase 1: MVP (Semana 1-2)**
1. ✅ Supabase (ya configurado)
2. 🟡 Google Vision API
3. 🟡 OpenAI GPT API

### **Fase 2: Mejoras (Semana 3-4)**
4. 🟡 Google Custom Search
5. ✅ Expo Notifications (ya instalado)

### **Fase 3: Expansión (Mes 2+)**
6. ⚪ Google Maps (opcional)
7. ⚪ Stripe (pagos)
8. ⚪ SendGrid (emails)

---

## 📝 Checklist de Configuración

### **Para Desarrollo**
- [ ] Crear cuenta Google Cloud
- [ ] Habilitar Vision API
- [ ] Obtener API Key de Vision
- [ ] Crear cuenta OpenAI
- [ ] Obtener API Key de OpenAI
- [ ] Configurar variables de entorno
- [ ] Probar con datos mock primero

### **Para Producción**
- [ ] Configurar billing en Google Cloud
- [ ] Configurar límites de gasto en OpenAI
- [ ] Habilitar RLS en Supabase
- [ ] Configurar alertas de costos
- [ ] Implementar rate limiting
- [ ] Configurar monitoreo de errores

---

## 🎯 Siguiente Paso

**¿Quieres que integre las APIs reales ahora?**

Puedo ayudarte a:
1. Configurar credenciales
2. Implementar Google Vision
3. Implementar OpenAI GPT
4. Probar el flujo completo

**¿Con cuál API empezamos?** 🚀



