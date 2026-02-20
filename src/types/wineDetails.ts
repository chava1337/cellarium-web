// Tipos para fichas extendidas de vino con IA
export interface WineRegion {
  country: string;
  macro_region: string;
  appellation: string;
  subregion?: string;
}

export interface WineVineyard {
  site: string;
  terroir: string;
}

export interface WineTastingNotes {
  appearance: string;
  nose: string;
  palate: string;
  finish: string;
}

export interface WineServing {
  temperature_c: string;
  glassware: string;
  decanting: string;
}

export interface WineDetailJson {
  winery: string;
  winery_history: string;
  region: WineRegion;
  vineyard: WineVineyard;
  grapes: string[];
  vintage: string;
  style: string;
  vinification: string;
  tasting_notes: WineTastingNotes;
  serving: WineServing;
  food_pairings: string[];
  aging_potential: string;
  alcohol_abv: string;
  residual_sugar: string;
  awards: string[];
  sources: string[];
  confidence: 'low' | 'medium' | 'high';
  disclaimer: string;
}

export interface WineDetailCache {
  canonical_id: string;
  lang: string;
  detail_json: WineDetailJson;
  model?: string;
  tokens_used?: number;
  is_shared: boolean;
  tenant_id?: string;
  ttl_days: number;
  created_at: string;
  updated_at: string;
}

export interface WineDetailResult {
  detail: WineDetailJson;
  fromCache: boolean;
  cacheSource: 'local' | 'global' | 'generated';
}

export interface WineDetailContext {
  wineId: string;
  canonicalId: string;
  name: string;
  winery: string;
  country: string;
  region: string;
  appellation: string;
  grapes: string[];
  vintage: string;
}

export interface WineDetailApiRequest {
  task: 'generate_wine_extended_sheet';
  lang: string;
  context: WineDetailContext;
  format: 'json';
}

export interface WineDetailApiResponse {
  success: boolean;
  data?: WineDetailJson;
  error?: string;
  model?: string;
  tokens_used?: number;
}



