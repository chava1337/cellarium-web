import { supabase } from './supabase';
import { Wine, WineStock, WineFilters, User } from '../types';
import { isActionAllowedForUser } from './SubscriptionEnforcement';

export class WineService {
  // Obtener todos los vinos con stock de una sucursal
  static async getWinesByBranch(branchId: string, ownerId: string, filters?: WineFilters): Promise<WineStock[]> {
    try {
      let query = supabase
        .from('wine_branch_stock')
        .select(`
          id,
          wine_id,
          branch_id,
          stock_quantity,
          price_by_glass,
          price_by_bottle,
          created_at,
          updated_at,
          wines (
            id,
            name,
            canonical_wine_id,
            grape_variety,
            region,
            country,
            vintage,
            alcohol_content,
            description,
            image_url,
            body_level,
            sweetness_level,
            acidity_level,
            intensity_level,
            fizziness_level,
            type,
            food_pairings,
            serving_temperature,
            winery,
            created_at,
            updated_at,
            owner_id
          )
        `)
        .eq('branch_id', branchId)
        .eq('wines.owner_id', ownerId) // FILTRO POR OWNER
        .gte('stock_quantity', 0); // Incluir vinos aunque tengan stock 0

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
          query = query.gte('price_by_bottle', filters.price_min);
        }
        if (filters.price_max) {
          query = query.lte('price_by_bottle', filters.price_max);
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
  static async getWineById(wineId: string, ownerId: string): Promise<Wine | null> {
    try {
      const { data, error } = await supabase
        .from('wines')
        .select('*')
        .eq('id', wineId)
        .eq('owner_id', ownerId) // FILTRO POR OWNER
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
  static async createWine(wine: Omit<Wine, 'id' | 'created_at' | 'updated_at'>, ownerId: string): Promise<Wine> {
    try {
      const wineWithOwner = {
        ...wine,
        owner_id: ownerId, // AGREGAR owner_id
      };

      const { data, error } = await supabase
        .from('wines')
        .insert(wineWithOwner)
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
  static async updateWine(wineId: string, ownerId: string, updates: Partial<Wine>): Promise<Wine> {
    try {
      const { data, error } = await supabase
        .from('wines')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', wineId)
        .eq('owner_id', ownerId) // FILTRO POR OWNER
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
  static async deleteWine(wineId: string, ownerId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('wines')
        .delete()
        .eq('id', wineId)
        .eq('owner_id', ownerId); // FILTRO POR OWNER

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error deleting wine:', error);
      throw error;
    }
  }

  // Obtener variedades de uva únicas
  static async getGrapeVarieties(ownerId: string): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('wines')
        .select('grape_variety')
        .eq('owner_id', ownerId) // FILTRO POR OWNER
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
  static async getRegions(ownerId: string): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('wines')
        .select('region')
        .eq('owner_id', ownerId) // FILTRO POR OWNER
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
  static async getCountries(ownerId: string): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('wines')
        .select('country')
        .eq('owner_id', ownerId) // FILTRO POR OWNER
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
  static async searchWines(branchId: string, ownerId: string, searchTerm: string): Promise<WineStock[]> {
    try {
      const { data, error } = await supabase
        .from('wine_branch_stock')
        .select(`
          id,
          wine_id,
          branch_id,
          stock_quantity,
          price_by_glass,
          price_by_bottle,
          created_at,
          updated_at,
          wines (
            id,
            name,
            canonical_wine_id,
            grape_variety,
            region,
            country,
            vintage,
            alcohol_content,
            description,
            image_url,
            body_level,
            sweetness_level,
            acidity_level,
            intensity_level,
            fizziness_level,
            type,
            food_pairings,
            serving_temperature,
            winery,
            created_at,
            updated_at,
            owner_id
          )
        `)
        .eq('branch_id', branchId)
        .eq('wines.owner_id', ownerId) // FILTRO POR OWNER
        .gt('stock_quantity', 0)
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

  // Crear vino con stock inicial en una sucursal
  static async createWineWithStock(
    wine: Omit<Wine, 'id' | 'created_at' | 'updated_at'>,
    branchId: string,
    ownerId: string,
    initialStock: number,
    priceByGlass: number | null,
    priceByBottle: number | null,
    // TODO: DB ENFORCEMENT REQUIRED
    // Parámetros opcionales para validación de límites (preparación para enforcement real)
    // En el futuro, estos valores deben venir de RPC/trigger que valide en backend
    ownerUser?: User | null,
    currentWineCount?: number
  ): Promise<Wine> {
    try {
      console.log('🍷 Creando vino con stock inicial:', wine.name);
      
      // TODO: DB ENFORCEMENT REQUIRED
      // Esta validación solo ocurre en frontend. El backend debe implementar:
      // 1. RLS policy que prevenga INSERT en wines si se excede el límite
      // 2. Trigger BEFORE INSERT que valide subscription limits
      // 3. RPC function create_wine_with_validation() que encapsule esta lógica
      // 
      // Por ahora, solo validamos si tenemos los datos necesarios
      if (ownerUser && currentWineCount !== undefined) {
        const result = isActionAllowedForUser(ownerUser, 'create_wine', {
          currentWineCount,
        });
        if (!result.allowed) {
          throw new Error(result.reasonKey || 'subscription.wine_limit_reached');
        }
      }
      
      // Logging detallado del objeto wine
      console.log('🔍 Objeto wine completo para insertar:', wine);
      
      // Logging del owner_id
      console.log('🔍 Owner ID para insertar:', ownerId);
      console.log('🔍 Auth UID:', await supabase.auth.getUser().then(r => r.data.user?.id));
      
      // 1. Crear el vino
      const { data: wineData, error: wineError } = await supabase
        .from('wines')
        .insert({
          ...wine,
          owner_id: ownerId, // AGREGAR owner_id
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (wineError) {
        console.error('Error creando vino:', wineError);
        throw wineError;
      }

      console.log('✅ Vino creado:', wineData.id);

      // 2. Crear el stock inicial en la sucursal
      const { error: stockError } = await supabase
        .from('wine_branch_stock')
        .insert({
          wine_id: wineData.id,
          branch_id: branchId,
          owner_id: ownerId, // AGREGAR owner_id
          stock_quantity: initialStock,
          price_by_glass: priceByGlass ?? null,
          price_by_bottle: priceByBottle ?? null,
          min_stock: Math.max(1, Math.floor(initialStock * 0.2)), // 20% del stock como mínimo
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (stockError) {
        console.error('Error creando stock:', stockError);
        // Si falla el stock, eliminar el vino creado
        await supabase.from('wines').delete().eq('id', wineData.id);
        throw stockError;
      }

      console.log('✅ Stock inicial creado:', initialStock, 'botellas');

      return wineData;
    } catch (error) {
      console.error('Error creando vino con stock:', error);
      // Propagar error estructurado para manejo en UI
      const { createStructuredError } = await import('../utils/supabaseErrorMapper');
      // Necesitamos t() pero no está disponible aquí, así que lanzamos error original
      // El screen caller se encargará de mapearlo
      throw error;
    }
  }
}



