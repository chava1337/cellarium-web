/**
 * Servicio mejorado para obtener información de vinos usando múltiples APIs
 * Integra Google Vision API, OpenAI GPT y 2 APIs adicionales
 */

import Constants from 'expo-constants';

// Configuración de APIs
const GOOGLE_VISION_API_KEY = Constants.expoConfig?.extra?.googleVisionApiKey || process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY;
const OPENAI_API_KEY = Constants.expoConfig?.extra?.openaiApiKey || process.env.EXPO_PUBLIC_OPENAI_API_KEY;

// APIs adicionales (configurar según necesidades)
const WINE_API_KEY_1 = Constants.expoConfig?.extra?.wineApiKey1 || process.env.EXPO_PUBLIC_WINE_API_KEY_1;
const WINE_API_KEY_2 = Constants.expoConfig?.extra?.wineApiKey2 || process.env.EXPO_PUBLIC_WINE_API_KEY_2;

// Interfaces para el servicio mejorado
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
  food_pairings: string[]; // Array de maridajes
  serving_temperature: string;
  body_level: number;
  sweetness_level: number;
  acidity_level: number;
  intensity_level: number;
}

/**
 * Procesa etiqueta de vino usando las APIs actuales (preparado para futuras APIs)
 */
export const processWineLabelEnhanced = async (imageUri: string): Promise<{
  recognition: WineRecognitionResult;
  description: WineDescription;
}> => {
  console.log('📸 Procesando imagen de etiqueta...');
  
  try {
    // 1. Reconocimiento con Google Vision API
    const visionResult = await recognizeWineLabel(imageUri);
    
    // 2. Descripción con OpenAI GPT
    const openaiResult = await generateWineDescription(visionResult);
    
    // 3. Validar y corregir tipos de datos
    const validatedResult = validateAndFixWineData(visionResult, {
      ...openaiResult,
      food_pairings: Array.isArray(openaiResult.food_pairings) 
        ? openaiResult.food_pairings 
        : [openaiResult.food_pairings || 'Maridajes no especificados']
    });
    
    return {
      recognition: validatedResult.recognition,
      description: validatedResult.description
    };
    
  } catch (error) {
    console.error('Error procesando etiqueta:', error);
    throw error;
  }
};

/**
 * Validar tipo de vino
 */
const validateWineType = (value: any): 'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified' => {
  const validTypes = ['red', 'white', 'rose', 'sparkling', 'dessert', 'fortified'];
  
  if (typeof value === 'string') {
    const lowerValue = value.toLowerCase().trim();
    
    // Mapear valores comunes a tipos válidos
    if (lowerValue.includes('tinto') || lowerValue.includes('red') || lowerValue.includes('rojo')) {
      return 'red';
    }
    if (lowerValue.includes('blanco') || lowerValue.includes('white') || lowerValue.includes('blanc')) {
      return 'white';
    }
    if (lowerValue.includes('rosado') || lowerValue.includes('rose') || lowerValue.includes('rosé')) {
      return 'rose';
    }
    if (lowerValue.includes('espumoso') || lowerValue.includes('sparkling') || lowerValue.includes('champagne')) {
      return 'sparkling';
    }
    if (lowerValue.includes('postre') || lowerValue.includes('dessert') || lowerValue.includes('dulce')) {
      return 'dessert';
    }
    if (lowerValue.includes('fortificado') || lowerValue.includes('fortified') || lowerValue.includes('jerez')) {
      return 'fortified';
    }
    
    // Si es un valor válido exacto
    if (validTypes.includes(lowerValue)) {
      return lowerValue as any;
    }
  }
  
  console.warn(`⚠️ Tipo de vino inválido: "${value}", usando valor por defecto: red`);
  return 'red'; // Valor por defecto
};

/**
 * Validar campo de nivel (1-5)
 */
const validateLevelField = (value: any, fieldName: string): number => {
  // Si es un número válido entre 1-5
  if (typeof value === 'number' && value >= 1 && value <= 5) {
    return Math.round(value);
  }
  
  // Si es un string que contiene números
  if (typeof value === 'string') {
    // Extraer números del string (ej: "16-18°C" -> extraer 16)
    const numbers = value.match(/\d+/g);
    if (numbers && numbers.length > 0) {
      const num = parseInt(numbers[0]);
      if (num >= 1 && num <= 5) {
        return num;
      }
    }
    
    // Si contiene palabras clave, mapear a números
    const lowerValue = value.toLowerCase();
    if (lowerValue.includes('bajo') || lowerValue.includes('light')) return 1;
    if (lowerValue.includes('medio') || lowerValue.includes('medium')) return 3;
    if (lowerValue.includes('alto') || lowerValue.includes('high') || lowerValue.includes('full')) return 5;
  }
  
  // Valores por defecto según el campo
  const defaults: Record<string, number> = {
    body_level: 3,
    sweetness_level: 2,
    acidity_level: 3,
    intensity_level: 4
  };
  
  console.warn(`⚠️ ${fieldName} inválido: "${value}", usando valor por defecto: ${defaults[fieldName]}`);
  return defaults[fieldName];
};

/**
 * Validar y corregir datos del vino
 */
const validateAndFixWineData = (
  visionResult: WineRecognitionResult,
  openaiResult: WineDescription
): {
  recognition: WineRecognitionResult;
  description: WineDescription;
} => {
  
  // Validar recognition
  const validatedRecognition: WineRecognitionResult = {
    ...visionResult,
    vintage: visionResult.vintage && visionResult.vintage >= 1900 && visionResult.vintage <= new Date().getFullYear() 
      ? visionResult.vintage 
      : undefined,
    alcohol_content: visionResult.alcohol_content && visionResult.alcohol_content >= 0 && visionResult.alcohol_content <= 25
      ? visionResult.alcohol_content
      : undefined,
    type: validateWineType(visionResult.type),
    confidence: Math.max(0, Math.min(1, visionResult.confidence))
  };
  
  // Validar description
  const validatedDescription: WineDescription = {
    ...openaiResult,
    food_pairings: Array.isArray(openaiResult.food_pairings) 
      ? openaiResult.food_pairings.filter(p => p && p.trim().length > 0)
      : [openaiResult.food_pairings || 'Maridajes no especificados'],
    serving_temperature: typeof openaiResult.serving_temperature === 'string' 
      ? openaiResult.serving_temperature 
      : 'Temperatura no especificada',
    body_level: validateLevelField(openaiResult.body_level, 'body_level'),
    sweetness_level: validateLevelField(openaiResult.sweetness_level, 'sweetness_level'),
    acidity_level: validateLevelField(openaiResult.acidity_level, 'acidity_level'),
    intensity_level: validateLevelField(openaiResult.intensity_level, 'intensity_level')
  };
  
  // Limpiar food_pairings vacíos
  if (validatedDescription.food_pairings.length === 0) {
    validatedDescription.food_pairings = ['Maridajes no especificados'];
  }
  
  return {
    recognition: validatedRecognition,
    description: validatedDescription
  };
};

// Importar funciones existentes
import { recognizeWineLabel, generateWineDescription } from './WineAIService';

// Re-exportar para compatibilidad
export { recognizeWineLabel, generateWineDescription };
