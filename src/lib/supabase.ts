import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://sejhpjfzznskhmbifrum.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlamhwamZ6em5za2htYmlmcnVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NDUxNjUsImV4cCI6MjA3NTQyMTE2NX0.TWV4LlM6v2MkQ7Sz1fuw-jzsjT4c6QrsOjJmdmOqSqY';

const FETCH_TIMEOUT_MS = 12000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const ourSignal = controller.signal;
  if (init?.signal) {
    init.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: ourSignal }).finally(() => clearTimeout(timeoutId));
}

if (__DEV__) {
  console.log('Supabase URL:', supabaseUrl);
  console.log('Supabase Key (first 20 chars):', supabaseAnonKey.substring(0, 20) + '...');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage, // CRÍTICO: Usar AsyncStorage para persistir sesión en React Native
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  },
  global: {
    fetch: fetchWithTimeout,
    headers: {
      'X-Client-Info': 'supabase-js-react-native'
    }
  },
  db: {
    schema: 'public'
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});





