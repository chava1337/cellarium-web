const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Configuración adicional para resolver módulos
config.resolver.alias = {
  '@': './src',
  '@/components': './src/components',
  '@/screens': './src/screens',
  '@/services': './src/services',
  '@/types': './src/types',
  '@/utils': './src/utils',
  '@/contexts': './src/contexts',
  '@/hooks': './src/hooks',
};

// Agregar extensión .riv como asset source
config.resolver.assetExts.push('riv');

// Configuración para debugging
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

// Configuración de transformación
config.transformer.minifierConfig = {
  keep_fnames: true,
  mangle: {
    keep_fnames: true,
  },
};

console.log('🔧 Metro config cargado con debugging habilitado');

module.exports = config;
