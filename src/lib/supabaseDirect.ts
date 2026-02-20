// Funciones directas de Supabase usando fetch para evitar problemas del cliente
import { supabase } from './supabase';

const SUPABASE_URL = 'https://sejhpjfzznskhmbifrum.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlamhwamZ6em5za2htYmlmcnVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NDUxNjUsImV4cCI6MjA3NTQyMTE2NX0.TWV4LlM6v2MkQ7Sz1fuw-jzsjT4c6QrsOjJmdmOqSqY';

export interface SupabaseResponse<T> {
  data: T | null;
  error: any | null;
}

// Función genérica para hacer requests directos a Supabase
async function supabaseRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: any,
  accessToken?: string
): Promise<SupabaseResponse<T>> {
  try {
    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    
    const headers: Record<string, string> = {
      'apikey': SUPABASE_KEY,
      'Authorization': accessToken ? `Bearer ${accessToken}` : `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    console.log(`🔍 Supabase direct request: ${method} ${url}`);
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Supabase direct error: ${response.status} ${errorText}`);
      return { data: null, error: { status: response.status, message: errorText } };
    }

    const data = await response.json();
    console.log(`✅ Supabase direct success: ${method} ${endpoint}`);
    return { data, error: null };

  } catch (error) {
    console.error(`❌ Supabase direct request failed:`, error);
    return { data: null, error };
  }
}

// Función para obtener usuario por ID
export async function getUserById(userId: string, accessToken?: string): Promise<SupabaseResponse<any[]>> {
  // Permitir consultas sin token para casos donde el usuario ya existe
  return supabaseRequest(`users?id=eq.${userId}&select=*`, 'GET', undefined, accessToken);
}

// Función para crear usuario
export async function createUser(userData: any, accessToken?: string): Promise<SupabaseResponse<any>> {
  // CRÍTICO: Usar el token de acceso del usuario autenticado para RLS
  if (!accessToken) {
    console.error('❌ Error: accessToken requerido para crear usuario');
    return { data: null, error: { message: 'Token de acceso requerido' } };
  }
  return supabaseRequest('users', 'POST', userData, accessToken);
}

// Función para crear sucursal
export async function createBranch(branchData: any, accessToken?: string): Promise<SupabaseResponse<any>> {
  return supabaseRequest('branches', 'POST', branchData, accessToken);
}

// Función para obtener sucursales por owner
export async function getBranchesByOwner(ownerId: string, accessToken?: string): Promise<SupabaseResponse<any[]>> {
  return supabaseRequest(`branches?owner_id=eq.${ownerId}&select=*`, 'GET', undefined, accessToken);
}

// Función para actualizar usuario
export async function updateUser(userId: string, updates: any, accessToken?: string): Promise<SupabaseResponse<any>> {
  return supabaseRequest(`users?id=eq.${userId}`, 'PATCH', updates, accessToken);
}

// Función para obtener vinos por owner
export async function getWinesByOwner(ownerId: string, accessToken?: string): Promise<SupabaseResponse<any[]>> {
  return supabaseRequest(`wines?owner_id=eq.${ownerId}&select=*`, 'GET', undefined, accessToken);
}

// Función para crear vino
export async function createWine(wineData: any, accessToken?: string): Promise<SupabaseResponse<any>> {
  return supabaseRequest('wines', 'POST', wineData, accessToken);
}

export default {
  getUserById,
  createUser,
  createBranch,
  getBranchesByOwner,
  updateUser,
  getWinesByOwner,
  createWine
};
