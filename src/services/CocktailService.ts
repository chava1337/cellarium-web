/**
 * Servicio para gestionar el menú de coctelería
 * Accede a la tabla cocktail_menu en Supabase
 */

import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';

export interface CocktailDrink {
  id: string;
  branch_id: string;
  owner_id: string;
  name: { en?: string; es?: string } | string;
  description?: { en?: string; es?: string } | string;
  ingredients: { en?: string[]; es?: string[] } | string[];
  image_url?: string;
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
  price: number;
  display_order?: number;
}

export interface UpdateCocktailDrinkData {
  name?: { en?: string; es?: string };
  description?: { en?: string; es?: string };
  ingredients?: { en?: string[]; es?: string[] };
  image_url?: string;
  price?: number;
  is_active?: boolean;
  display_order?: number;
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
 */
export async function createCocktailDrink(
  drinkData: CreateCocktailDrinkData,
  userId: string
): Promise<CocktailDrink> {
  try {
    // Obtener el siguiente display_order
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
      logger.error('[createCocktailDrink] Error:', error);
      throw error;
    }

    logger.success('[createCocktailDrink] Bebida creada:', data.id);
    return data;
  } catch (error) {
    logger.error('[createCocktailDrink] Excepción:', error);
    throw error;
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
): Promise<string> {
  try {
    // Importar FileSystem dinámicamente
    const FileSystem = require('expo-file-system/legacy');
    
    // Generar nombre único
    const fileExt = imageUri.split('.').pop() || 'jpg';
    const fileName = `${drinkId}.${fileExt}`;
    const filePath = `cocktails/${branchId}/${fileName}`;

    // Convertir imagen a base64 para React Native
    let base64: string;
    if (imageUri.startsWith('file://') || imageUri.startsWith('/')) {
      // URI local: usar FileSystem
      const fileUri = imageUri.startsWith('file://') ? imageUri : `file://${imageUri}`;
      base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } else {
      // URI remota: usar fetch y convertir a base64
      const response = await fetch(imageUri);
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      base64 = btoa(String.fromCharCode(...uint8Array));
    }

    // Convertir base64 a ArrayBuffer para Supabase (React Native compatible)
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Subir a storage (bucket dedicado para coctelería)
    const { data, error } = await supabase.storage
      .from('cocktail-images')
      .upload(filePath, bytes.buffer, {
        contentType: `image/${fileExt}`,
        upsert: true,
      });

    if (error) {
      logger.error('[uploadCocktailImage] Error subiendo:', error);
      throw error;
    }

    // Obtener URL pública
    const { data: { publicUrl } } = supabase.storage
      .from('cocktail-images')
      .getPublicUrl(filePath);

    if (!publicUrl) {
      throw new Error('No se pudo obtener la URL pública de la imagen');
    }

    logger.success('[uploadCocktailImage] Imagen subida:', publicUrl);
    return publicUrl;
  } catch (error) {
    logger.error('[uploadCocktailImage] Excepción:', error);
    throw error;
  }
}
