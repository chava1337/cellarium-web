/**
 * Servicio para persistir normalizaciones de vinos desde datos canónicos
 */
import { supabase } from './supabase';
import type { WineUpdates } from '../utils/wineCatalogUtils';

/**
 * Persiste actualizaciones de un vino en la base de datos si hay cambios.
 * 
 * @param wineId - ID del vino a actualizar
 * @param wineName - Nombre del vino (para logging)
 * @param updatesToSave - Objeto con los campos a actualizar
 */
export const persistWineUpdatesIfNeeded = async (
  wineId: string,
  wineName: string,
  updatesToSave: WineUpdates
): Promise<void> => {
  if (Object.keys(updatesToSave).length === 0 || !wineId) {
    return;
  }

  const { error: updateError } = await supabase
    .from('wines')
    .update(updatesToSave)
    .eq('id', wineId);

  if (updateError) {
    // El error se loguea en el nivel superior para mantener contexto
    throw new Error(`Error al persistir actualizaciones para ${wineName}: ${updateError.message}`);
  }
  // No loguear éxito para evitar spam en catálogos grandes
};

