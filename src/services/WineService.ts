import { supabase } from './supabase';
import { Wine, WineStock, WineFilters } from '../types';

export class WineService {
  // Obtener todos los vinos con stock de una sucursal
  static async getWinesByBranch(branchId: string, filters?: WineFilters): Promise<WineStock[]> {
    try {
      let query = supabase
        .from('wine_branch_stock')
        .select(`
          id,
          wine_id,
          branch_id,
          quantity,
          min_stock,
          created_at,
          updated_at,
          wines (
            id,
            name,
            grape_variety,
            region,
            country,
            vintage,
            alcohol_content,
            description,
            price,
            image_url,
            created_at,
            updated_at
          )
        `)
        .eq('branch_id', branchId)
        .gt('quantity', 0); // Solo vinos con stock disponible

      // Aplicar filtros si existen
      if (filters) {
        if (filters.grape_variety) {
          query = query.eq('wines.grape_variety', filters.grape_variety);
        }
        if (filters.region) {
          query = query.eq('wines.region', filters.region);
        }
        if (filters.country) {
          query = query.eq('wines.country', filters.country);
        }
        if (filters.price_min) {
          query = query.gte('wines.price', filters.price_min);
        }
        if (filters.price_max) {
          query = query.lte('wines.price', filters.price_max);
        }
        if (filters.vintage_min) {
          query = query.gte('wines.vintage', filters.vintage_min);
        }
        if (filters.vintage_max) {
          query = query.lte('wines.vintage', filters.vintage_max);
        }
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching wines by branch:', error);
      throw error;
    }
  }

  // Obtener un vino específico
  static async getWineById(wineId: string): Promise<Wine | null> {
    try {
      const { data, error } = await supabase
        .from('wines')
        .select('*')
        .eq('id', wineId)
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error fetching wine by ID:', error);
      throw error;
    }
  }

  // Crear un nuevo vino
  static async createWine(wine: Omit<Wine, 'id' | 'created_at' | 'updated_at'>): Promise<Wine> {
    try {
      const { data, error } = await supabase
        .from('wines')
        .insert(wine)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error creating wine:', error);
      throw error;
    }
  }

  // Actualizar un vino
  static async updateWine(wineId: string, updates: Partial<Wine>): Promise<Wine> {
    try {
      const { data, error } = await supabase
        .from('wines')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', wineId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error updating wine:', error);
      throw error;
    }
  }

  // Eliminar un vino
  static async deleteWine(wineId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('wines')
        .delete()
        .eq('id', wineId);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error deleting wine:', error);
      throw error;
    }
  }

  // Obtener variedades de uva únicas
  static async getGrapeVarieties(): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('wines')
        .select('grape_variety')
        .not('grape_variety', 'is', null);

      if (error) {
        throw error;
      }

      const varieties = [...new Set(data?.map(wine => wine.grape_variety) || [])];
      return varieties.sort();
    } catch (error) {
      console.error('Error fetching grape varieties:', error);
      throw error;
    }
  }

  // Obtener regiones únicas
  static async getRegions(): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('wines')
        .select('region')
        .not('region', 'is', null);

      if (error) {
        throw error;
      }

      const regions = [...new Set(data?.map(wine => wine.region) || [])];
      return regions.sort();
    } catch (error) {
      console.error('Error fetching regions:', error);
      throw error;
    }
  }

  // Obtener países únicos
  static async getCountries(): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('wines')
        .select('country')
        .not('country', 'is', null);

      if (error) {
        throw error;
      }

      const countries = [...new Set(data?.map(wine => wine.country) || [])];
      return countries.sort();
    } catch (error) {
      console.error('Error fetching countries:', error);
      throw error;
    }
  }

  // Buscar vinos por texto
  static async searchWines(branchId: string, searchTerm: string): Promise<WineStock[]> {
    try {
      const { data, error } = await supabase
        .from('wine_branch_stock')
        .select(`
          id,
          wine_id,
          branch_id,
          quantity,
          min_stock,
          created_at,
          updated_at,
          wines (
            id,
            name,
            grape_variety,
            region,
            country,
            vintage,
            alcohol_content,
            description,
            price,
            image_url,
            created_at,
            updated_at
          )
        `)
        .eq('branch_id', branchId)
        .gt('quantity', 0)
        .or(`wines.name.ilike.%${searchTerm}%,wines.grape_variety.ilike.%${searchTerm}%,wines.region.ilike.%${searchTerm}%,wines.country.ilike.%${searchTerm}%`);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error searching wines:', error);
      throw error;
    }
  }
}



