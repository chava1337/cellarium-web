/**
 * Servicio para gestionar el menú de coctelería
 * Accede a la tabla cocktail_menu en Supabase
 */

import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';
import { PLAN_LIMITS, type SubscriptionPlan } from '../utils/subscriptionPermissions';

export interface CocktailDrink {
  id: string;
  branch_id: string;
  owner_id: string;
  name: { en?: string; es?: string } | string;
  description?: { en?: string; es?: string } | string;
  ingredients: { en?: string[]; es?: string[] } | string[];
  image_url?: string;
  image_path?: string;
  price: number;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface CreateCocktailDrinkData {
  branch_id: string;
  owner_id: string;
  name: { en?: string; es?: string };
  description?: { en?: string; es?: string };
  ingredients: { en?: string[]; es?: string[] };
  image_url?: string;
  image_path?: string;
  price: number;
  display_order?: number;
}

export interface UpdateCocktailDrinkData {
  name?: { en?: string; es?: string };
  description?: { en?: string; es?: string };
  ingredients?: { en?: string[]; es?: string[] };
  image_url?: string;
  image_path?: string;
  price?: number;
  is_active?: boolean;
  display_order?: number;
}

export interface UploadCocktailImageResult {
  publicUrl: string;
  path: string;
}

/**
 * Obtiene todas las bebidas del menú de coctelería de una sucursal
 */
export async function getCocktailMenu(branchId: string): Promise<CocktailDrink[]> {
  try {
    const { data, error } = await supabase
      .from('cocktail_menu')
      .select('*')
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('[getCocktailMenu] Error:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    logger.error('[getCocktailMenu] Excepción:', error);
    throw error;
  }
}

/**
 * Obtiene una bebida específica por ID
 */
export async function getCocktailDrink(id: string): Promise<CocktailDrink | null> {
  try {
    const { data, error } = await supabase
      .from('cocktail_menu')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      logger.error('[getCocktailDrink] Error:', error);
      return null;
    }

    return data;
  } catch (error) {
    logger.error('[getCocktailDrink] Excepción:', error);
    return null;
  }
}

/**
 * Crea una nueva bebida en el menú
 * @param effectivePlan - Plan efectivo del owner para aplicar límite Free (10 cocteles). Si no se pasa, no se aplica límite en app.
 */
export async function createCocktailDrink(
  drinkData: CreateCocktailDrinkData,
  userId: string,
  effectivePlan?: SubscriptionPlan
): Promise<CocktailDrink> {
  try {
    const allowed: SubscriptionPlan[] = ['free', 'basic', 'additional-branch'];
    const plan = effectivePlan && allowed.includes(effectivePlan) ? effectivePlan : 'free';
    const maxCocktails = PLAN_LIMITS[plan].maxCocktails;

    if (maxCocktails !== -1) {
      const { count: activeCount } = await supabase
        .from('cocktail_menu')
        .select('*', { count: 'exact', head: true })
        .eq('branch_id', drinkData.branch_id)
        .eq('owner_id', drinkData.owner_id)
        .eq('is_active', true);

      if ((activeCount ?? 0) >= maxCocktails) {
        throw new Error('COCKTAIL_LIMIT_REACHED');
      }
    }

    const { count } = await supabase
      .from('cocktail_menu')
      .select('*', { count: 'exact', head: true })
      .eq('branch_id', drinkData.branch_id);

    const displayOrder = drinkData.display_order ?? (count || 0);

    const { data, error } = await supabase
      .from('cocktail_menu')
      .insert({
        ...drinkData,
        display_order: displayOrder,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      if (__DEV__) {
        console.log('[createCocktailDrink] Supabase error:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
      }
      logger.error('[createCocktailDrink] Error:', error);
      const msg = [error.code, error.message].filter(Boolean).join(': ') || error.message || 'Error creando bebida';
      throw new Error(msg);
    }

    logger.success('[createCocktailDrink] Bebida creada:', data.id);
    return data;
  } catch (error: any) {
    logger.error('[createCocktailDrink] Excepción:', error);
    const msg =
      typeof error?.message === 'string' && error.message
        ? (error?.code ? `${error.code}: ${error.message}` : error.message)
        : error?.code
          ? `${error.code}: ${String(error)}`
          : String(error) || 'Error creando bebida';
    throw new Error(msg);
  }
}

/**
 * Actualiza una bebida existente
 */
export async function updateCocktailDrink(
  id: string,
  drinkData: UpdateCocktailDrinkData
): Promise<CocktailDrink> {
  try {
    const { data, error } = await supabase
      .from('cocktail_menu')
      .update(drinkData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('[updateCocktailDrink] Error:', error);
      throw error;
    }

    logger.success('[updateCocktailDrink] Bebida actualizada:', id);
    return data;
  } catch (error) {
    logger.error('[updateCocktailDrink] Excepción:', error);
    throw error;
  }
}

/**
 * Elimina una bebida (marca como inactiva)
 */
export async function deleteCocktailDrink(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('cocktail_menu')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      logger.error('[deleteCocktailDrink] Error:', error);
      throw error;
    }

    logger.success('[deleteCocktailDrink] Bebida eliminada:', id);
  } catch (error) {
    logger.error('[deleteCocktailDrink] Excepción:', error);
    throw error;
  }
}

/**
 * Sube una imagen de bebida a Supabase Storage
 */
export async function uploadCocktailImage(
  imageUri: string,
  drinkId: string,
  branchId: string
): Promise<UploadCocktailImageResult> {
  try {
    const fileExt = imageUri.split('.').pop() || 'jpg';
    const fileName = `${drinkId}.${fileExt}`;
    const filePath = `cocktails/${branchId}/${fileName}`;

    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    if (__DEV__) {
      console.log('[CocktailUpload]', { uri: imageUri, path: filePath });
    }

    const { data, error } = await supabase.storage
      .from('cocktail-images')
      .upload(filePath, bytes, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) {
      if (__DEV__) {
        console.log('[uploadCocktailImage] Storage error:', {
          message: error.message,
          code: (error as any)?.code,
          details: (error as any)?.details,
          hint: (error as any)?.hint,
        });
      }
      logger.error('[uploadCocktailImage] Error subiendo:', error);
      const msg = [(error as any)?.code, error.message].filter(Boolean).join(': ') || error.message || 'Error subiendo imagen';
      throw new Error(msg);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('cocktail-images')
      .getPublicUrl(filePath);

    if (!publicUrl) {
      throw new Error('No se pudo obtener la URL pública de la imagen');
    }

    logger.success('[uploadCocktailImage] Imagen subida:', publicUrl);
    return { publicUrl, path: filePath };
  } catch (error: any) {
    logger.error('[uploadCocktailImage] Excepción:', error);
    const msg =
      typeof error?.message === 'string' && error.message
        ? (error?.code ? `${error.code}: ${error.message}` : error.message)
        : error?.code
          ? `${error.code}: ${String(error)}`
          : String(error) || 'Error subiendo imagen';
    throw new Error(msg);
  }
}
