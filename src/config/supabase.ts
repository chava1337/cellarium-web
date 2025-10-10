/**
 * Configuración de Supabase
 * Conexión al backend para autenticación, base de datos y storage
 */

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// IMPORTANTE: Reemplazar con tus credenciales reales de Supabase
// Obtener de: https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'your-anon-key';

// Crear cliente de Supabase con configuración para React Native
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Usar AsyncStorage para persistir sesiones
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

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

