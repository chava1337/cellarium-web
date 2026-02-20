/**
 * Configuración de Supabase
 * Re-exporta el cliente único desde lib/supabase para evitar múltiples instancias.
 */

import { supabase } from '../lib/supabase';

export { supabase };

// Helper para obtener el usuario actual
export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
};

// Helper para verificar si hay sesión activa
export const hasActiveSession = async () => {
  const { data: { session }, error } = await supabase.auth.getSession();
  return !error && session !== null;
};

// Helper para hacer logout
export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};
