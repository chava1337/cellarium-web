/**
 * 🎥 Módulo de Cámara Profesional - Índice Principal
 * Exporta todos los componentes y utilidades del módulo
 */

// Componente principal
export { default as ProWineCamera } from './ProWineCamera';

// Hook de auto-captura
export { useAutoCapture } from './hooks/useAutoCapture';

// Utilidades
export * from './lib/geometry';
export * from './lib/warp';

// Componentes UI
export { default as CameraOverlay } from './ui/Overlay';

// Tipos
export * from './types';

// Configuración por defecto
export { DEFAULT_CONFIG } from './types';













































