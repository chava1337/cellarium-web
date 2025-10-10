import { Platform } from 'react-native';

// Debug configuration for Cellarium
console.log('🔧 Debug: Archivo de configuración cargado');

// Verificar que Expo está funcionando
if (typeof expo !== 'undefined') {
  console.log('✅ Debug: Expo disponible');
} else {
  console.log('❌ Debug: Expo no disponible');
}

// Verificar que estamos en el entorno correcto
console.log('🌍 Debug: Entorno:', __DEV__ ? 'Desarrollo' : 'Producción');
console.log('📱 Debug: Plataforma:', Platform?.OS || 'Desconocida');

export const debugInfo = {
  expoAvailable: typeof expo !== 'undefined',
  isDev: __DEV__,
  platform: Platform?.OS || 'Desconocida',
  timestamp: new Date().toISOString(),
};
