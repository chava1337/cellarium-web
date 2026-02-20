import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { 
  WineDetailJson, 
  WineDetailCache, 
  WineDetailResult, 
  WineDetailContext,
  WineDetailApiRequest,
  WineDetailApiResponse 
} from '../types/wineDetails';

// Configuración del servicio
const CACHE_PREFIX = 'wine_detail_';
const TTL_DAYS = 180;
const DEFAULT_LANG = 'es';

// Clave para la API de IA (reutilizar la misma de etiquetas)
const AI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';

// Clave para la URL de la API de IA (OpenAI)
const AI_API_URL = 'https://api.openai.com/v1/chat/completions';

class WineDetailService {
  /**
   * Función principal: obtener ficha de vino con estrategia local-first
   */
  async getWineDetailLocalFirst(
    wineId: string, 
    lang: string = DEFAULT_LANG
  ): Promise<WineDetailResult> {
    try {
      // 1. Buscar en caché local
      const localCache = await this.getLocalCache(wineId, lang);
      if (localCache && this.isCacheValid(localCache)) {
        console.log('📱 Ficha encontrada en caché local');
        return {
          detail: localCache.detail_json,
          fromCache: true,
          cacheSource: 'local'
        };
      }

      // 2. Buscar en caché global
      const globalCache = await this.getGlobalCache(wineId, lang);
      if (globalCache && this.isCacheValid(globalCache)) {
        console.log('🌍 Ficha encontrada en caché global');
        // Guardar en caché local para futuras consultas
        await this.setLocalCache(wineId, lang, globalCache);
        return {
          detail: globalCache.detail_json,
          fromCache: true,
          cacheSource: 'global'
        };
      }

      // 3. Generar nueva ficha con IA
      console.log('🤖 Generando nueva ficha con IA');
      const newDetail = await this.generateWithAI(wineId, lang);
      
      // 4. Guardar en caché global y local
      await this.saveToCaches(wineId, lang, newDetail);

      return {
        detail: newDetail.detail_json,
        fromCache: false,
        cacheSource: 'generated'
      };

    } catch (error) {
      console.error('❌ Error en getWineDetailLocalFirst:', error);
      throw new Error('No se pudo obtener la ficha del vino');
    }
  }

  /**
   * Obtener caché local
   */
  private async getLocalCache(wineId: string, lang: string): Promise<WineDetailCache | null> {
    try {
      const key = `${CACHE_PREFIX}${wineId}_${lang}`;
      const cached = await AsyncStorage.getItem(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Error obteniendo caché local:', error);
      return null;
    }
  }

  /**
   * Guardar en caché local
   */
  private async setLocalCache(
    wineId: string, 
    lang: string, 
    cache: WineDetailCache
  ): Promise<void> {
    try {
      const key = `${CACHE_PREFIX}${wineId}_${lang}`;
      await AsyncStorage.setItem(key, JSON.stringify(cache));
    } catch (error) {
      console.error('Error guardando caché local:', error);
    }
  }

  /**
   * Obtener caché global desde Supabase
   */
  private async getGlobalCache(wineId: string, lang: string): Promise<WineDetailCache | null> {
    try {
      const canonicalId = await this.getCanonicalId(wineId);
      
      const { data, error } = await supabase
        .from('wine_details_global')
        .select('*')
        .eq('canonical_id', canonicalId)
        .eq('lang', lang)
        .eq('is_shared', true)
        .single();

      if (error) {
        console.log('No se encontró caché global:', error.message);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error obteniendo caché global:', error);
      return null;
    }
  }

  /**
   * Guardar en caché global y local
   */
  private async saveToCaches(
    wineId: string, 
    lang: string, 
    cache: WineDetailCache
  ): Promise<void> {
    try {
      // Guardar en caché global
      const { error: globalError } = await supabase
        .from('wine_details_global')
        .upsert({
          canonical_id: cache.canonical_id,
          lang: cache.lang,
          detail_json: cache.detail_json,
          model: cache.model,
          tokens_used: cache.tokens_used,
          is_shared: cache.is_shared,
          tenant_id: cache.tenant_id,
          ttl_days: cache.ttl_days
        });

      if (globalError) {
        console.error('Error guardando en caché global:', globalError);
      } else {
        console.log('✅ Guardado en caché global');
      }

      // Guardar en caché local
      await this.setLocalCache(wineId, lang, cache);
      console.log('✅ Guardado en caché local');

    } catch (error) {
      console.error('Error guardando en cachés:', error);
    }
  }

  /**
   * Verificar si el caché es válido (no ha expirado)
   */
  private isCacheValid(cache: WineDetailCache): boolean {
    const now = new Date();
    const updatedAt = new Date(cache.updated_at);
    const ttlMs = cache.ttl_days * 24 * 60 * 60 * 1000; // Convertir días a ms
    
    return (now.getTime() - updatedAt.getTime()) < ttlMs;
  }

  /**
   * Generar ficha con IA usando OpenAI
   */
  private async generateWithAI(wineId: string, lang: string): Promise<WineDetailCache> {
    try {
      // Obtener contexto del vino
      const context = await this.getWineContext(wineId);
      
      const prompt = this.buildPrompt(context, lang);

      const response = await fetch(AI_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'Eres un experto sommelier y enólogo. Genera fichas técnicas detalladas de vinos en formato JSON estructurado.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 2000
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API Error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.choices || !result.choices[0]) {
        throw new Error('No se recibió respuesta válida de OpenAI');
      }

      const content = result.choices[0].message.content;
      let wineDetail: WineDetailJson;

      try {
        // Intentar parsear el JSON de la respuesta
        wineDetail = JSON.parse(content);
      } catch (parseError) {
        // Si falla el parseo, crear una ficha básica
        wineDetail = this.createFallbackWineDetail(context);
      }

      // Crear objeto de caché
      const cache: WineDetailCache = {
        canonical_id: context.canonicalId,
        lang,
        detail_json: wineDetail,
        model: 'gpt-4',
        tokens_used: result.usage?.total_tokens || 0,
        is_shared: true,
        tenant_id: undefined, // Reservado para futuras personalizaciones
        ttl_days: TTL_DAYS,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      return cache;

    } catch (error) {
      console.error('Error generando con IA:', error);
      throw new Error('No se pudo generar la ficha con IA');
    }
  }

  /**
   * Construir prompt para OpenAI
   */
  private buildPrompt(context: WineDetailContext, lang: string): string {
    return `Genera una ficha técnica completa del siguiente vino en formato JSON. Responde SOLO con el JSON válido, sin texto adicional.

Vino: ${context.name}
Bodega: ${context.winery}
País: ${context.country}
Región: ${context.region}
Denominación: ${context.appellation}
Uvas: ${context.grapes.join(', ')}
Añada: ${context.vintage}

Genera un JSON con esta estructura exacta:
{
  "winery": "Nombre de la bodega",
  "winery_history": "Historia breve de la bodega",
  "region": {
    "country": "País",
    "macro_region": "Región/macrorregión",
    "appellation": "Denominación/DO/AOC",
    "subregion": "Subregión (si aplica)"
  },
  "vineyard": {
    "site": "Viñedo/origen",
    "terroir": "Suelo, clima, altitud, exposición"
  },
  "grapes": ["Uva1", "Uva2"],
  "vintage": "Año o 'NV'",
  "style": "Tipo (tinto/blanco/rosado/espumoso...)",
  "vinification": "Método de vinificación o crianza típica",
  "tasting_notes": {
    "appearance": "Color, brillo...",
    "nose": "Aromas",
    "palate": "Sabores",
    "finish": "Final o retrogusto"
  },
  "serving": {
    "temperature_c": "Temperatura °C",
    "glassware": "Tipo de copa",
    "decanting": "Decantación (sí/no/tiempo)"
  },
  "food_pairings": ["Maridaje1", "Maridaje2"],
  "aging_potential": "Rango estimado de guarda (años)",
  "alcohol_abv": "ABV o N/D",
  "residual_sugar": "g/L o N/D",
  "awards": ["Premios o menciones"],
  "sources": ["Fuentes o guías generales"],
  "confidence": "low|medium|high",
  "disclaimer": "Ficha generada con IA; puede contener imprecisiones."
}`;
  }

  /**
   * Crear ficha de respaldo si falla la IA
   */
  private createFallbackWineDetail(context: WineDetailContext): WineDetailJson {
    return {
      winery: context.winery,
      winery_history: 'Información de la bodega no disponible.',
      region: {
        country: context.country,
        macro_region: context.region,
        appellation: context.appellation,
        subregion: ''
      },
      vineyard: {
        site: 'Información no disponible',
        terroir: 'Información no disponible'
      },
      grapes: context.grapes,
      vintage: context.vintage,
      style: 'Tipo no especificado',
      vinification: 'Información no disponible',
      tasting_notes: {
        appearance: 'Información no disponible',
        nose: 'Información no disponible',
        palate: 'Información no disponible',
        finish: 'Información no disponible'
      },
      serving: {
        temperature_c: '16-18',
        glassware: 'Copa universal',
        decanting: 'Opcional'
      },
      food_pairings: ['Maridajes no especificados'],
      aging_potential: 'No especificado',
      alcohol_abv: 'N/D',
      residual_sugar: 'N/D',
      awards: [],
      sources: [],
      confidence: 'low',
      disclaimer: 'Ficha generada con IA; puede contener imprecisiones.'
    };
  }

  /**
   * Obtener contexto del vino para la IA
   */
  private async getWineContext(wineId: string): Promise<WineDetailContext> {
    try {
      // Obtener datos del vino desde Supabase
      const { data: wine, error } = await supabase
        .from('wines')
        .select('*')
        .eq('id', wineId)
        .single();

      if (error || !wine) {
        throw new Error('Vino no encontrado');
      }

      // Generar canonical_id basado en datos del vino
      const canonicalId = this.generateCanonicalId(wine);

      return {
        wineId: wine.id,
        canonicalId,
        name: wine.name,
        winery: wine.winery || '',
        country: wine.country,
        region: wine.region,
        appellation: wine.appellation || '',
        grapes: wine.grape_variety ? [wine.grape_variety] : [],
        vintage: wine.vintage || 'NV'
      };

    } catch (error) {
      console.error('Error obteniendo contexto del vino:', error);
      throw new Error('No se pudo obtener información del vino');
    }
  }

  /**
   * Generar canonical_id único para el vino
   */
  private generateCanonicalId(wine: any): string {
    // Crear slug normalizado: bodega + nombre + DO + añada
    const winery = (wine.winery || wine.name).toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    const name = wine.name.toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    const appellation = (wine.appellation || wine.region || '').toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    const vintage = wine.vintage || 'nv';
    
    return `${winery}-${name}-${appellation}-${vintage}`;
  }

  /**
   * Obtener canonical_id para un vino
   */
  private async getCanonicalId(wineId: string): Promise<string> {
    const context = await this.getWineContext(wineId);
    return context.canonicalId;
  }

  /**
   * Limpiar caché local (para testing o reset)
   */
  async clearLocalCache(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const wineDetailKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
      await AsyncStorage.multiRemove(wineDetailKeys);
      console.log('✅ Caché local limpiado');
    } catch (error) {
      console.error('Error limpiando caché local:', error);
    }
  }

  /**
   * Forzar regeneración de ficha (ignorar caché)
   */
  async forceRegenerate(wineId: string, lang: string = DEFAULT_LANG): Promise<WineDetailResult> {
    try {
      // Limpiar caché local
      const key = `${CACHE_PREFIX}${wineId}_${lang}`;
      await AsyncStorage.removeItem(key);

      // Generar nueva ficha
      const newDetail = await this.generateWithAI(wineId, lang);
      
      // Guardar en cachés
      await this.saveToCaches(wineId, lang, newDetail);

      return {
        detail: newDetail.detail_json,
        fromCache: false,
        cacheSource: 'generated'
      };

    } catch (error) {
      console.error('Error forzando regeneración:', error);
      throw new Error('No se pudo regenerar la ficha');
    }
  }
}

// Exportar instancia singleton
export const wineDetailService = new WineDetailService();
export default wineDetailService;
