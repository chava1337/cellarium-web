/**
 * Servicio de IA para reconocimiento y descripción de vinos
 * Integra Google Vision API y OpenAI GPT
 */

import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';

// Configuración de APIs
const GOOGLE_VISION_API_KEY = Constants.expoConfig?.extra?.googleVisionApiKey || process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY;
const OPENAI_API_KEY = Constants.expoConfig?.extra?.openaiApiKey || process.env.EXPO_PUBLIC_OPENAI_API_KEY;

// Interfaces para el servicio
interface WineRecognitionResult {
  name: string;
  winery: string;
  vintage?: number;
  grape_variety: string;
  type: 'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified';
  region?: string;
  country: string;
  alcohol_content?: number;
  confidence: number;
  raw_text?: string;
}

interface WineDescription {
  description: string;
  tasting_notes: string;
  food_pairings: string;
  serving_temperature: string;
  body_level: number;
  sweetness_level: number;
  acidity_level: number;
  intensity_level: number;
}

interface BottleImage {
  url: string;
  source: string;
  width: number;
  height: number;
}

/**
 * Analiza una imagen de etiqueta de vino usando Google Vision API
 * @param imageUri - URI de la imagen capturada
 * @returns Información básica del vino reconocida
 */
export const recognizeWineLabel = async (imageUri: string): Promise<WineRecognitionResult> => {
  console.log('🔍 Reconociendo etiqueta de vino:', imageUri);
  
  try {
    // Verificar que tenemos la API Key
    if (!GOOGLE_VISION_API_KEY) {
      console.error('❌ Google Vision API Key no configurada');
      throw new Error('Google Vision API Key no configurada');
    }

    // Verificar que la URI de imagen es válida
    if (!imageUri || typeof imageUri !== 'string') {
      console.error('❌ URI de imagen inválida:', imageUri);
      throw new Error('URI de imagen inválida');
    }

    console.log('🔄 Iniciando conversión de imagen...');
    // Convertir imagen a base64
    const base64Image = await convertImageToBase64(imageUri);
    console.log('✅ Imagen convertida, tamaño base64:', base64Image.length);
    
    // Llamar a Google Vision API
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
    });

    if (!response.ok) {
      throw new Error(`Vision API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('📊 Respuesta de Vision API:', data);

    // Procesar respuesta de Vision API
    const annotations = data.responses?.[0] || {};
    const textAnnotations = annotations.textAnnotations || [];
    const logoAnnotations = annotations.logoAnnotations || [];
    const labelAnnotations = annotations.labelAnnotations || [];

    // Extraer texto detectado
    const detectedText = textAnnotations.map((annotation: any) => annotation.description).join(' ');
    console.log('📝 Texto detectado:', detectedText);

    // Procesar información del vino usando IA
    const wineInfo = await processWineText(detectedText, labelAnnotations);
    
    return {
      ...wineInfo,
      raw_text: detectedText,
      confidence: calculateConfidence(textAnnotations, logoAnnotations)
    };

  } catch (error) {
    console.error('❌ Error en reconocimiento:', error);
    console.error('❌ Detalles del error:', {
      message: error.message,
      stack: error.stack,
      imageUri: imageUri
    });
    
    // Fallback a datos mock si hay error
    const mockResults: WineRecognitionResult[] = [
      {
        name: 'Château Margaux',
        winery: 'Château Margaux',
        vintage: 2015,
        grape_variety: 'Cabernet Sauvignon',
        type: 'red',
        region: 'Margaux, Bordeaux',
        country: 'Francia',
        alcohol_content: 13.5,
        confidence: 0.92,
        raw_text: 'CHÂTEAU MARGAUX 2015 PREMIER GRAND CRU CLASSÉ'
      },
      {
        name: 'Opus One',
        winery: 'Opus One Winery',
        vintage: 2018,
        grape_variety: 'Cabernet Sauvignon',
        type: 'red',
        region: 'Napa Valley',
        country: 'Estados Unidos',
        alcohol_content: 14.5,
        confidence: 0.88,
        raw_text: 'OPUS ONE 2018 NAPA VALLEY'
      }
    ];
    
    return mockResults[Math.floor(Math.random() * mockResults.length)];
  }
};

/**
 * Genera descripción detallada del vino usando GPT
 * @param wineInfo - Información básica del vino
 * @returns Descripción completa y notas de cata
 */
export const generateWineDescription = async (
  wineInfo: Partial<WineRecognitionResult>
): Promise<WineDescription> => {
  console.log('🤖 Generando descripción con IA:', wineInfo.name);
  
  try {
    // Verificar que tenemos la API Key
    if (!OPENAI_API_KEY) {
      throw new Error('OpenAI API Key no configurada');
    }

    // Preparar prompt para GPT
    const prompt = `Eres un sommelier experto. Analiza este vino y genera una descripción profesional en español.

Información del vino:
- Nombre: ${wineInfo.name || 'No especificado'}
- Bodega: ${wineInfo.winery || 'No especificada'}
- Añada: ${wineInfo.vintage || 'No especificada'}
- Tipo de uva: ${wineInfo.grape_variety || 'No especificado'}
- Región: ${wineInfo.region || 'No especificada'}
- País: ${wineInfo.country || 'No especificado'}
- Alcohol: ${wineInfo.alcohol_content || 'No especificado'}%

Responde en formato JSON con estos campos:
{
  "description": "Descripción general del vino",
  "tasting_notes": "Notas de cata detalladas (aromas, sabores, textura)",
  "food_pairings": ["Maridaje 1", "Maridaje 2", "Maridaje 3"],
  "serving_temperature": "Temperatura de servicio ideal",
  "body_level": 3,
  "sweetness_level": 2,
  "acidity_level": 3,
  "intensity_level": 4
}

Los niveles van de 1 (bajo) a 5 (alto).`;

    // Llamar a OpenAI GPT
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{
          role: 'system',
          content: 'Eres un sommelier experto. Genera descripciones profesionales de vinos en español. Responde siempre en formato JSON válido.'
        }, {
          role: 'user',
          content: prompt
        }],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('📊 Respuesta de OpenAI:', data);

    // Procesar respuesta
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No se recibió respuesta de OpenAI');
    }

    // Intentar parsear JSON - más robusto
    try {
      // Limpiar la respuesta de posibles caracteres extra
      const cleanContent = content.replace(/```json|```/g, '').trim();
      
      const parsedDescription = JSON.parse(cleanContent);
      return {
        description: parsedDescription.description || 'Descripción no disponible',
        tasting_notes: parsedDescription.tasting_notes || 'Notas de cata no disponibles',
        food_pairings: Array.isArray(parsedDescription.food_pairings) 
          ? parsedDescription.food_pairings 
          : [parsedDescription.food_pairings || 'Maridajes no especificados'],
        serving_temperature: parsedDescription.serving_temperature || 'Temperatura no especificada',
        body_level: Math.max(1, Math.min(5, parsedDescription.body_level || 3)),
        sweetness_level: Math.max(1, Math.min(5, parsedDescription.sweetness_level || 2)),
        acidity_level: Math.max(1, Math.min(5, parsedDescription.acidity_level || 3)),
        intensity_level: Math.max(1, Math.min(5, parsedDescription.intensity_level || 4))
      };
    } catch (parseError) {
      console.error('Error parseando JSON de OpenAI:', parseError);
      console.error('Contenido recibido:', content);
      
      // Fallback: intentar extraer información de texto plano
      return extractDescriptionFromText(content);
    }

  } catch (error) {
    console.error('❌ Error en generación de descripción:', error);
    
    // Fallback a datos mock
    const mockDescriptions: Record<string, WineDescription> = {
      red: {
        description: 'Un vino tinto elegante y complejo, con gran estructura y cuerpo. Presenta taninos suaves y un final persistente que revela su potencial de guarda.',
        tasting_notes: 'Aromas de frutas rojas maduras, notas de vainilla y especias dulces. En boca es equilibrado con toques de roble francés y un final largo y sedoso.',
        food_pairings: 'Carnes rojas a la parrilla, cordero asado, quesos maduros, risotto de hongos',
        serving_temperature: '16-18°C',
        body_level: 4,
        sweetness_level: 2,
        acidity_level: 3,
        intensity_level: 4
      },
      white: {
        description: 'Un vino blanco fresco y aromático, con una acidez vibrante y un paladar mineral. Perfecto para maridar con pescados y mariscos.',
        tasting_notes: 'Aromas cítricos de limón y pomelo, con notas florales. En boca es fresco, con buena acidez y un final limpio y mineral.',
        food_pairings: 'Pescados blancos, mariscos, ensaladas, quesos frescos',
        serving_temperature: '8-10°C',
        body_level: 2,
        sweetness_level: 1,
        acidity_level: 4,
        intensity_level: 3
      },
      rose: {
        description: 'Un rosado delicado y refrescante, ideal para los días cálidos. Combina la frescura de un blanco con la estructura de un tinto ligero.',
        tasting_notes: 'Aromas de fresas frescas y flores. En boca es ligero, con acidez equilibrada y un final refrescante.',
        food_pairings: 'Ensaladas, sushi, pastas ligeras, tapas',
        serving_temperature: '8-10°C',
        body_level: 2,
        sweetness_level: 2,
        acidity_level: 3,
        intensity_level: 2
      },
      sparkling: {
        description: 'Un espumoso elegante con burbujas finas y persistentes. Perfecto para celebraciones y aperitivos.',
        tasting_notes: 'Aromas de frutas blancas y brioche. Burbujas finas, paladar cremoso con buena acidez y un final refrescante.',
        food_pairings: 'Aperitivos, ostras, sushi, postres ligeros',
        serving_temperature: '6-8°C',
        body_level: 2,
        sweetness_level: 2,
        acidity_level: 4,
        intensity_level: 3
      }
    };
    
    const wineType = wineInfo.type || 'red';
    return mockDescriptions[wineType] || mockDescriptions.red;
  }
};

/**
 * Busca imágenes de la botella en la web
 * @param wineName - Nombre del vino
 * @param winery - Nombre de la bodega
 * @param vintage - Año (opcional)
 * @returns Array de imágenes encontradas
 */
export const searchBottleImages = async (
  wineName: string,
  winery: string,
  vintage?: number
): Promise<BottleImage[]> => {
  console.log('🔎 Buscando imágenes de botella:', wineName);
  
  // TODO: Implementar búsqueda real con Google Custom Search API o similar
  // const query = `${wineName} ${winery} ${vintage || ''} wine bottle`;
  // const response = await fetch(
  //   `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&searchType=image&num=5`
  // );
  
  // Simular delay de búsqueda
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Mock images
  return [
    {
      url: 'https://images.vivino.com/thumbs/red-wine-bottle-placeholder.png',
      source: 'Vivino',
      width: 400,
      height: 800
    },
    {
      url: 'https://images.vivino.com/thumbs/wine-bottle-2.png',
      source: 'Wine-Searcher',
      width: 400,
      height: 800
    },
    {
      url: 'https://images.vivino.com/thumbs/wine-bottle-3.png',
      source: 'Decanter',
      width: 400,
      height: 800
    }
  ];
};

/**
 * Proceso completo de reconocimiento y generación de ficha de vino
 * @param imageUri - URI de la imagen de la etiqueta
 * @returns Ficha completa del vino con descripción e imágenes sugeridas
 */
export const processWineLabel = async (imageUri: string) => {
  try {
    // 1. Reconocer etiqueta
    console.log('📸 Procesando imagen de etiqueta...');
    const recognition = await recognizeWineLabel(imageUri);
    
    // 2. Generar descripción
    console.log('✍️ Generando descripción con IA...');
    const description = await generateWineDescription(recognition);
    
    // 3. Buscar imágenes de botella
    console.log('🖼️ Buscando imágenes de botella...');
    const images = await searchBottleImages(
      recognition.name,
      recognition.winery,
      recognition.vintage
    );
    
    return {
      recognition,
      description,
      suggestedImages: images,
      success: true
    };
  } catch (error) {
    console.error('❌ Error procesando etiqueta:', error);
    throw new Error('No se pudo procesar la etiqueta. Intenta de nuevo.');
  }
};

/**
 * Convierte imagen a base64 para enviar a APIs
 * @param imageUri - URI de la imagen
 * @returns String en base64
 */
const convertImageToBase64 = async (imageUri: string): Promise<string> => {
  try {
    console.log('🔄 Convirtiendo imagen a base64:', imageUri);
    
    // Verificar si es una URI local (file:// o ruta del sistema) o remota (http://)
    if (imageUri.startsWith('file://') || imageUri.startsWith('/data/') || imageUri.startsWith('/storage/')) {
      // Para URIs locales, usar FileSystem
      
      // Convertir ruta del sistema a file:// si es necesario
      const fileUri = imageUri.startsWith('file://') ? imageUri : `file://${imageUri}`;
      
      console.log('📁 Usando FileSystem para URI local:', fileUri);
      const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      console.log('✅ Imagen local convertida a base64, tamaño:', base64.length);
      return base64;
    } else {
      // Para URIs remotas, usar fetch
      console.log('🌐 Usando fetch para URI remota:', imageUri);
      const response = await fetch(imageUri);
      if (!response.ok) {
        throw new Error(`Error descargando imagen: ${response.status}`);
      }
      const blob = await response.blob();
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          // Remover el prefijo "data:image/jpeg;base64,"
          const base64Data = base64.split(',')[1];
          console.log('✅ Imagen remota convertida a base64, tamaño:', base64Data.length);
          resolve(base64Data);
        };
        reader.onerror = (error) => {
          console.error('Error en FileReader:', error);
          reject(error);
        };
        reader.readAsDataURL(blob);
      });
    }
  } catch (error) {
    console.error('❌ Error convirtiendo imagen a base64:', error);
    throw new Error(`No se pudo procesar la imagen: ${error.message}`);
  }
};

/**
 * Procesa el texto detectado para extraer información del vino
 * @param text - Texto detectado por Vision API
 * @param labels - Etiquetas detectadas por Vision API
 * @returns Información básica del vino
 */
const processWineText = async (text: string, labels: any[]): Promise<Partial<WineRecognitionResult>> => {
  // Usar OpenAI para procesar el texto y extraer información estructurada
  if (!OPENAI_API_KEY) {
    // Fallback sin IA
    return extractWineInfoBasic(text, labels);
  }

  try {
    const prompt = `Analiza este texto de una etiqueta de vino y extrae la información en formato JSON:

Texto: "${text}"

Etiquetas detectadas: ${labels.map(l => l.description).join(', ')}

Responde SOLO con JSON válido:
{
  "name": "Nombre del vino",
  "winery": "Nombre de la bodega",
  "vintage": 2020,
  "grape_variety": "Tipo de uva principal",
  "type": "red|white|rose|sparkling|dessert|fortified",
  "region": "Región",
  "country": "País",
  "alcohol_content": 13.5
}

IMPORTANTE:
- vintage debe ser un número entero (año) o null
- alcohol_content debe ser un número decimal o null
- type debe ser uno de los valores permitidos o null

Si no encuentras información específica:
- Para campos de texto: usa "No especificado"
- Para campos numéricos: usa null o un valor por defecto apropiado
- Para alcohol_content: usa null si no se encuentra`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{
          role: 'user',
          content: prompt
        }],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (content) {
      const parsed = JSON.parse(content);
      
      // Limpiar y convertir valores numéricos
      const cleanedResult: Partial<WineRecognitionResult> = {
        name: parsed.name || 'No especificado',
        winery: parsed.winery || 'No especificado',
        grape_variety: parsed.grape_variety || 'No especificado',
        type: parsed.type || 'red',
        region: parsed.region || 'No especificado',
        country: parsed.country || 'No especificado',
        vintage: parsed.vintage ? parseInt(parsed.vintage.toString()) : undefined,
        alcohol_content: parsed.alcohol_content ? parseFloat(parsed.alcohol_content.toString()) : undefined,
        confidence: 0.8
      };
      
      return cleanedResult;
    }
  } catch (error) {
    console.error('Error procesando texto con IA:', error);
  }

  // Fallback a procesamiento básico
  return extractWineInfoBasic(text, labels);
};

/**
 * Extrae información básica del vino sin IA
 * @param text - Texto detectado
 * @param labels - Etiquetas detectadas
 * @returns Información básica del vino
 */
const extractWineInfoBasic = (text: string, labels: any[]): Partial<WineRecognitionResult> => {
  // Extraer año (vintage)
  const vintageMatch = text.match(/\b(19|20)\d{2}\b/);
  const vintage = vintageMatch ? parseInt(vintageMatch[0]) : undefined;

  // Determinar tipo de vino por etiquetas
  const wineType = determineWineType(labels);

  // Extraer país por etiquetas
  const country = extractCountry(labels);

  return {
    name: extractWineName(text),
    winery: extractWineryName(text),
    vintage,
    grape_variety: 'No especificado',
    type: wineType,
    region: 'No especificado',
    country,
    alcohol_content: undefined,
    confidence: 0.3
  };
};

/**
 * Determina el tipo de vino por las etiquetas detectadas
 */
const determineWineType = (labels: any[]): 'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified' => {
  const labelTexts = labels.map(l => l.description.toLowerCase()).join(' ');
  
  if (labelTexts.includes('champagne') || labelTexts.includes('sparkling') || labelTexts.includes('cava')) {
    return 'sparkling';
  }
  if (labelTexts.includes('rose') || labelTexts.includes('rosado')) {
    return 'rose';
  }
  if (labelTexts.includes('white') || labelTexts.includes('blanco') || labelTexts.includes('chardonnay')) {
    return 'white';
  }
  if (labelTexts.includes('port') || labelTexts.includes('sherry') || labelTexts.includes('madeira')) {
    return 'fortified';
  }
  if (labelTexts.includes('dessert') || labelTexts.includes('sweet') || labelTexts.includes('dulce')) {
    return 'dessert';
  }
  
  return 'red'; // Default
};

/**
 * Extrae el país por las etiquetas detectadas
 */
const extractCountry = (labels: any[]): string => {
  // Import dinámico para evitar dependencias circulares
  const { normalizeCountry } = require('../utils/countryNormalizer');
  
  const countryKeywords = {
    'francia': 'Francia',
    'france': 'Francia',
    'italia': 'Italia',
    'italy': 'Italia',
    'españa': 'España',
    'spain': 'España',
    'alemania': 'Alemania',
    'germany': 'Alemania',
    'portugal': 'Portugal',
    'argentina': 'Argentina',
    'chile': 'Chile',
    'australia': 'Australia',
    'nueva zelanda': 'Nueva Zelanda',
    'new zealand': 'Nueva Zelanda',
    'sudáfrica': 'Sudáfrica',
    'south africa': 'Sudáfrica',
    'estados unidos': 'Estados Unidos',
    'united states': 'Estados Unidos',
    'usa': 'Estados Unidos'
  };

  const labelTexts = labels.map(l => l.description.toLowerCase()).join(' ');
  
  for (const [keyword, country] of Object.entries(countryKeywords)) {
    if (labelTexts.includes(keyword)) {
      // Normalizar el país antes de retornarlo
      return normalizeCountry(country) || country;
    }
  }
  
  return 'No especificado';
};

/**
 * Extrae el nombre del vino del texto
 */
const extractWineName = (text: string): string => {
  // Buscar patrones comunes de nombres de vino
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  
  // Buscar en las primeras líneas que no sean muy largas
  for (const line of lines.slice(0, 3)) {
    if (line.length > 5 && line.length < 50) {
      return line.trim();
    }
  }
  
  return 'Vino no identificado';
};

/**
 * Extrae el nombre de la bodega del texto
 */
const extractWineryName = (text: string): string => {
  // Buscar palabras clave de bodegas
  const wineryKeywords = ['château', 'domaine', 'bodega', 'vineyard', 'winery', 'estate'];
  
  const lines = text.split('\n');
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    for (const keyword of wineryKeywords) {
      if (lowerLine.includes(keyword)) {
        return line.trim();
      }
    }
  }
  
  return 'Bodega no identificada';
};

/**
 * Calcula la confianza basada en las anotaciones detectadas
 */
const calculateConfidence = (textAnnotations: any[], logoAnnotations: any[]): number => {
  let confidence = 0;
  
  // Confianza por texto detectado
  if (textAnnotations.length > 0) {
    confidence += 0.6;
  }
  
  // Confianza por logo detectado
  if (logoAnnotations.length > 0) {
    confidence += 0.3;
  }
  
  // Confianza por calidad del texto
  const avgTextConfidence = textAnnotations.reduce((sum, annotation) => 
    sum + (annotation.score || 0), 0) / textAnnotations.length;
  
  if (avgTextConfidence > 0.8) {
    confidence += 0.1;
  }
  
  return Math.min(1, confidence);
};

/**
 * Extrae información de descripción de texto plano cuando JSON falla
 * @param text - Texto de respuesta de OpenAI
 * @returns Descripción del vino
 */
const extractDescriptionFromText = (text: string): WineDescription => {
  console.log('📝 Extrayendo información de texto plano...');
  
  // Extraer descripción general
  const descriptionMatch = text.match(/descripción[:\s]*([^.\n]+)/i);
  const description = descriptionMatch ? descriptionMatch[1].trim() : 'Descripción generada por IA';
  
  // Extraer notas de cata
  const tastingMatch = text.match(/notas de cata[:\s]*([^.\n]+)/i);
  const tasting_notes = tastingMatch ? tastingMatch[1].trim() : 'Notas de cata generadas por IA';
  
  // Extraer maridajes
  const pairingMatch = text.match(/maridajes?[:\s]*([^.\n]+)/i);
  const food_pairings = pairingMatch 
    ? pairingMatch[1].trim().split(',').map(p => p.trim())
    : ['Maridajes sugeridos por IA'];
  
  // Extraer temperatura
  const tempMatch = text.match(/temperatura[:\s]*([0-9°C\-\s]+)/i);
  const serving_temperature = tempMatch ? tempMatch[1].trim() : '16-18°C';
  
  return {
    description,
    tasting_notes,
    food_pairings,
    serving_temperature,
    body_level: 3,
    sweetness_level: 2,
    acidity_level: 3,
    intensity_level: 4
  };
};

