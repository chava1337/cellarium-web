/**
 * 🍷 Servicio Evidence-First para Cellarium
 * Sistema optimizado para datos reales y verificables usando solo OpenAI
 */

import { supabase } from '../lib/supabase';
import { normalizeCountryBilingual } from '../utils/countryNormalizer';

export interface WineEvidence {
  type: 'label_back' | 'techsheet_pdf' | 'pasted_text';
  content: string;
  source?: string;
}

export interface ExtractedWineData {
  // Campos obligatorios
  name: string;
  producer: string;
  vintage: number;
  
  // Campos opcionales (solo si están en la evidencia)
  appellation?: string;
  country?: string;
  grapes?: string[];
  abv?: number;
  aging_months?: number;
  oak_types?: string[];
  soils?: string[];
  altitude_m?: number;
  tasting_official?: string;
  pairing_official?: string[];
  awards?: string[];
}

export interface CanonicalWine {
  id: string;
  canonical_key: string;
  name: string;
  producer: string;
  vintage: number;
  appellation?: string;
  country?: string;
  grapes?: string[];
  abv?: number;
  aging_months?: number;
  oak_types?: string[];
  soils?: string[];
  altitude_m?: number;
  tasting_official?: string;
  pairing_official?: string[];
  awards?: string[];
  confidence: number;
  coverage: number;
  last_verified_at: string;
}

export interface WineDescription {
  summary: string;
  tasting_notes: {
    vista?: string;
    nariz?: string;
    boca?: string;
  };
  aging?: string;
  pairing: string[];
  facts: Record<string, string>;
}

export class EvidenceFirstWineService {
  
  /**
   * Procesa evidencia y extrae datos del vino usando OpenAI
   */
  async extractWineData(evidence: WineEvidence): Promise<ExtractedWineData> {
    try {
      console.log('🔍 Extrayendo datos del vino desde evidencia:', evidence.type);

      const prompt = this.buildExtractionPrompt(evidence);
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.EXPO_PUBLIC_OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `Eres un experto enólogo especializado en extraer datos precisos de etiquetas de vino. 
              IMPORTANTE: Solo extrae información que esté EXPLÍCITAMENTE presente en el texto. 
              NO inventes, infieras o asumas datos que no estén claramente escritos.
              Devuelve ÚNICAMENTE un JSON con los campos que encuentres.`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.1, // Baja temperatura para mayor precisión
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const extractedText = data.choices[0].message.content;
      
      console.log('📊 Respuesta de extracción:', extractedText);

      // Parsear JSON de respuesta
      const extractedData = JSON.parse(extractedText);
      
      // Validar datos extraídos
      const validatedData = this.validateExtractedData(extractedData);
      
      console.log('✅ Datos validados:', validatedData);
      
      return validatedData;

    } catch (error) {
      console.error('❌ Error extrayendo datos del vino:', error);
      throw error;
    }
  }

  /**
   * Construye el prompt de extracción basado en el tipo de evidencia
   */
  private buildExtractionPrompt(evidence: WineEvidence): string {
    const basePrompt = `Analiza el siguiente texto de una etiqueta de vino y extrae ÚNICAMENTE la información que esté explícitamente presente. 

Devuelve un JSON con estos campos (solo incluye los que encuentres):
{
  "name": "nombre del vino",
  "producer": "nombre del productor/bodega", 
  "vintage": año,
  "appellation": "denominación de origen (si aparece)",
  "country": "país (si aparece)",
  "grapes": ["variedad1", "variedad2"],
  "abv": porcentaje_alcohol,
  "aging_months": meses_crianza,
  "oak_types": ["tipo_roble"],
  "soils": ["tipo_suelo"],
  "altitude_m": altitud_metros,
  "tasting_official": "notas de cata oficiales",
  "pairing_official": ["maridaje1", "maridaje2"],
  "awards": ["premio1", "premio2"]
}

TEXTO A ANALIZAR:
${evidence.content}`;

    return basePrompt;
  }

  /**
   * Valida los datos extraídos según reglas lógicas
   */
  private validateExtractedData(data: any): ExtractedWineData {
    const validated: ExtractedWineData = {
      name: data.name || '',
      producer: data.producer || '',
      vintage: data.vintage || new Date().getFullYear()
    };

    // Validar campos opcionales
    if (data.appellation && typeof data.appellation === 'string') {
      validated.appellation = data.appellation;
    }

    if (data.country && typeof data.country === 'string') {
      validated.country = data.country;
    }

    if (Array.isArray(data.grapes) && data.grapes.length > 0) {
      validated.grapes = data.grapes.filter((g: any) => typeof g === 'string');
    }

    if (typeof data.abv === 'number' && data.abv >= 5 && data.abv <= 18) {
      validated.abv = data.abv;
    }

    if (typeof data.aging_months === 'number' && data.aging_months >= 0 && data.aging_months <= 60) {
      validated.aging_months = data.aging_months;
    }

    if (Array.isArray(data.oak_types) && data.oak_types.length > 0) {
      validated.oak_types = data.oak_types.filter((o: any) => typeof o === 'string');
    }

    if (Array.isArray(data.soils) && data.soils.length > 0) {
      validated.soils = data.soils.filter((s: any) => typeof s === 'string');
    }

    if (typeof data.altitude_m === 'number' && data.altitude_m >= 0 && data.altitude_m <= 3000) {
      validated.altitude_m = data.altitude_m;
    }

    if (data.tasting_official && typeof data.tasting_official === 'string') {
      validated.tasting_official = data.tasting_official;
    }

    if (Array.isArray(data.pairing_official) && data.pairing_official.length > 0) {
      validated.pairing_official = data.pairing_official.filter((p: any) => typeof p === 'string');
    }

    if (Array.isArray(data.awards) && data.awards.length > 0) {
      validated.awards = data.awards.filter((a: any) => typeof a === 'string');
    }

    return validated;
  }

  /**
   * Busca vino canónico existente o crea uno nuevo
   */
  async findOrCreateCanonicalWine(extractedData: ExtractedWineData): Promise<CanonicalWine> {
    try {
      console.log('🔍 Buscando vino canónico existente...');

      // ✅ CORREGIDO: Buscar por winery + label (esquema real no tiene canonical_key)
      // Mapear producer -> winery, name -> label
      const wineryToSearch = extractedData.producer || '';
      const labelToSearch = extractedData.name || '';

      // Buscar vino existente por winery y label
      // ✅ CORREGIDO: Usando solo columnas reales del esquema
      const { data: existingWine, error: searchError } = await supabase
        .from('wines_canonical')
        .select('id, winery, label, abv, color, country, region, grapes, serving, image_canonical_url, is_shared, created_at, updated_at, taste_profile, flavors')
        .eq('winery', wineryToSearch)
        .eq('label', labelToSearch)
        .maybeSingle();

      if (existingWine && !searchError) {
        console.log('✅ Vino canónico encontrado:', existingWine);
        // Mapear campos reales a CanonicalWine (para compatibilidad con interfaz)
        return this.mapToCanonicalWine(existingWine, extractedData);
      }

      // ⚠️ NOTA: El esquema real de wines_canonical no soporta todos los campos de ExtractedWineData
      // Solo se pueden insertar: winery, label, abv, color, country, region, grapes, serving, image_canonical_url, is_shared, taste_profile, flavors
      // Campos NO soportados: vintage, appellation, aging_months, oak_types, soils, altitude_m, tasting_official, pairing_official, awards, confidence, coverage
      // 
      // Por ahora, solo insertamos los campos básicos soportados
      console.log('🆕 Creando nuevo vino canónico (solo campos soportados por esquema)...');
      
      // Normalizar el país antes de guardarlo (en formato bilingüe)
      const normalizedCountry = normalizeCountryBilingual(extractedData.country);
      
      // ✅ CORREGIDO: Insertar solo campos que existen en el esquema real
      const { data: newWine, error: insertError } = await supabase
        .from('wines_canonical')
        .insert({
          winery: extractedData.producer || '', // producer -> winery
          label: extractedData.name || '', // name -> label
          country: normalizedCountry,
          grapes: extractedData.grapes || [],
          abv: extractedData.abv || null,
          // Nota: vintage, appellation, aging_months, etc. no existen en el esquema
        })
        .select('id, winery, label, abv, color, country, region, grapes, serving, image_canonical_url, is_shared, created_at, updated_at, taste_profile, flavors')
        .single();

      if (insertError) {
        throw new Error(`Error creando vino canónico: ${insertError.message}`);
      }

      console.log('✅ Nuevo vino canónico creado:', newWine);
      // Mapear campos reales a CanonicalWine (para compatibilidad con interfaz)
      return this.mapToCanonicalWine(newWine, extractedData);

    } catch (error) {
      console.error('❌ Error en findOrCreateCanonicalWine:', error);
      throw error;
    }
  }

  /**
   * Mapea datos reales de wines_canonical a interfaz CanonicalWine (para compatibilidad)
   * ⚠️ NOTA: El esquema real no tiene todos los campos de CanonicalWine
   */
  private mapToCanonicalWine(wineData: any, extractedData: ExtractedWineData): CanonicalWine {
    // ✅ PRE-FASE 3: Canonical key estable con normalización robusta
    const wineryNorm = ((wineData.winery ?? '') as string).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const labelNorm = ((wineData.label ?? '') as string).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const vintageNorm = (extractedData.vintage ?? '').toString().trim(); // Si no existe, usa '' (vacío)
    const canonical_key = `${wineryNorm}|${labelNorm}|${vintageNorm}`;
    
    return {
      id: wineData.id,
      canonical_key, // Generado localmente con normalización estable
      name: wineData.label || '', // label -> name
      producer: wineData.winery || '', // winery -> producer
      vintage: extractedData.vintage || new Date().getFullYear(), // No existe en BD, usar de extractedData
      appellation: undefined, // No existe en esquema
      country: typeof wineData.country === 'string' ? wineData.country : (wineData.country?.es || wineData.country?.en || ''),
      grapes: Array.isArray(wineData.grapes) ? wineData.grapes : [],
      abv: wineData.abv || undefined,
      aging_months: undefined, // No existe en esquema
      oak_types: undefined, // No existe en esquema
      soils: undefined, // No existe en esquema
      altitude_m: undefined, // No existe en esquema
      tasting_official: undefined, // No existe en esquema
      pairing_official: undefined, // No existe en esquema
      awards: undefined, // No existe en esquema
      confidence: 0.8, // Valor por defecto
      coverage: this.calculateCoverage(extractedData),
      last_verified_at: wineData.updated_at || new Date().toISOString(),
    };
  }

  /**
   * Calcula el porcentaje de cobertura de campos
   */
  private calculateCoverage(data: ExtractedWineData): number {
    const totalFields = 14;
    let presentFields = 3; // name, producer, vintage siempre presentes

    if (data.appellation) presentFields++;
    if (data.country) presentFields++;
    if (data.grapes && data.grapes.length > 0) presentFields++;
    if (data.abv) presentFields++;
    if (data.aging_months) presentFields++;
    if (data.oak_types && data.oak_types.length > 0) presentFields++;
    if (data.soils && data.soils.length > 0) presentFields++;
    if (data.altitude_m) presentFields++;
    if (data.tasting_official) presentFields++;
    if (data.pairing_official && data.pairing_official.length > 0) presentFields++;
    if (data.awards && data.awards.length > 0) presentFields++;

    return Math.round((presentFields / totalFields) * 100);
  }

  /**
   * Genera descripción del vino usando solo datos existentes
   */
  async generateWineDescription(wine: CanonicalWine): Promise<WineDescription> {
    try {
      console.log('✍️ Generando descripción del vino...');

      const prompt = this.buildDescriptionPrompt(wine);
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.EXPO_PUBLIC_OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `Eres un editor enológico profesional. Usa EXCLUSIVAMENTE los campos del objeto data. 
              Si un campo falta, NO lo inventes ni lo infieras. 
              Devuelve JSON con summary (120-180 palabras), tasting_notes (Vista/Nariz/Boca solo con datos disponibles), 
              aging (solo si hay datos de crianza), pairing (lista), facts (clave:valor).
              PROHÍBE superlativos sin fuente.`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 800
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const descriptionText = data.choices[0].message.content;
      
      console.log('📝 Descripción generada:', descriptionText);

      const description = JSON.parse(descriptionText);
      
      console.log('✅ Descripción procesada:', description);
      
      return description;

    } catch (error) {
      console.error('❌ Error generando descripción:', error);
      throw error;
    }
  }

  /**
   * Construye el prompt para generar descripción
   */
  private buildDescriptionPrompt(wine: CanonicalWine): string {
    return `Genera una descripción profesional del siguiente vino usando ÚNICAMENTE los datos proporcionados:

DATOS DEL VINO:
${JSON.stringify(wine, null, 2)}

INSTRUCCIONES:
- summary: 120-180 palabras sobre el vino
- tasting_notes: Solo incluye Vista/Nariz/Boca si hay datos de tasting_official
- aging: Solo si hay aging_months u oak_types
- pairing: Lista de maridajes (usar pairing_official si existe)
- facts: Objetos clave:valor con datos técnicos disponibles

Devuelve JSON válido.`;
  }

  /**
   * Guarda evidencia en la base de datos
   */
  async saveWineSource(wineId: string, evidence: WineEvidence, extractedData: ExtractedWineData): Promise<void> {
    try {
      console.log('💾 Guardando evidencia del vino...');

      const { error } = await supabase
        .from('wine_sources')
        .insert({
          wine_id: wineId,
          type: evidence.type,
          url_or_storage_path: evidence.source,
          extracted_json: extractedData
        });

      if (error) {
        throw new Error(`Error guardando evidencia: ${error.message}`);
      }

      console.log('✅ Evidencia guardada correctamente');

    } catch (error) {
      console.error('❌ Error guardando evidencia:', error);
      throw error;
    }
  }

  /**
   * Busca vinos similares usando fuzzy matching
   */
  async findSimilarWines(producer: string, wineName: string, vintage: number): Promise<CanonicalWine[]> {
    try {
      console.log('🔍 Buscando vinos similares...');

      // ✅ CORREGIDO: Usar campos reales (winery/label) en lugar de producer/name/vintage
      // Excluir vector_embedding (columna pesada innecesaria)
      // ⚠️ NOTA: vintage no existe en esquema, no podemos filtrar por él
      const { data: wines, error } = await supabase
        .from('wines_canonical')
        .select('id, winery, label, country, region, abv, color, image_canonical_url, grapes, serving, taste_profile, flavors, created_at, updated_at, is_shared')
        .or(`winery.ilike.%${producer}%,label.ilike.%${wineName}%`)
        // .eq('vintage', vintage) // ❌ REMOVIDO: vintage no existe en esquema
        .limit(10);

      if (error) {
        throw new Error(`Error buscando vinos similares: ${error.message}`);
      }

      console.log('✅ Vinos similares encontrados:', wines?.length || 0);
      
      // ✅ CORREGIDO: Mapear resultados reales a CanonicalWine (para compatibilidad)
      return (wines || []).map(wine => this.mapToCanonicalWine(wine, {
        name: wine.label || '',
        producer: wine.winery || '',
        vintage: new Date().getFullYear(), // No existe en BD, usar año actual como fallback
      }));

    } catch (error) {
      console.error('❌ Error buscando vinos similares:', error);
      return [];
    }
  }
}

// Instancia singleton
export const evidenceFirstWineService = new EvidenceFirstWineService();

























