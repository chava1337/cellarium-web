/**
 * 🎯 Hook de Auto-Captura para Detección de Etiquetas
 * Maneja la lógica de estabilidad y auto-disparo
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Quad, StabilityState, CameraConfig, DEFAULT_CONFIG } from '../types';
import { geometryUtils } from '../lib/geometry';

export interface UseAutoCaptureOptions {
  config?: CameraConfig;
  onStabilityChange?: (isStable: boolean, count: number) => void;
  onShootTrigger?: () => void;
}

export interface UseAutoCaptureReturn {
  stabilityState: StabilityState;
  updateQuad: (quad: Quad | null) => void;
  resetStability: () => void;
  shouldShoot: boolean;
  isStable: boolean;
  stabilityCount: number;
}

/**
 * Hook personalizado para manejar la lógica de auto-captura
 * @param options - Opciones de configuración
 * @returns Estado y funciones para manejar la estabilidad
 */
export const useAutoCapture = (options: UseAutoCaptureOptions = {}): UseAutoCaptureReturn => {
  const { config = DEFAULT_CONFIG, onStabilityChange, onShootTrigger } = options;
  
  // Estado de estabilidad
  const [stabilityState, setStabilityState] = useState<StabilityState>({
    quad: null,
    isStable: false,
    stabilityCount: 0,
    shootNow: false,
    lastQuad: null,
    lastBoundingBox: null,
  });
  
  // Referencias para mantener estado entre renders
  const frameCountRef = useRef(0);
  const lastUpdateTimeRef = useRef(Date.now());
  const shootTriggeredRef = useRef(false);
  
  /**
   * Actualiza el quad detectado y evalúa la estabilidad
   * @param quad - Quad detectado en el frame actual
   */
  const updateQuad = useCallback((quad: Quad | null) => {
    const now = Date.now();
    const timeDelta = now - lastUpdateTimeRef.current;
    
    // Actualizar tiempo de última actualización
    lastUpdateTimeRef.current = now;
    
    setStabilityState(prevState => {
      // Si no hay quad, resetear estabilidad
      if (!quad) {
        return {
          ...prevState,
          quad: null,
          isStable: false,
          stabilityCount: 0,
          shootNow: false,
        };
      }
      
      // Validar quad según configuración
      if (!geometryUtils.isValidQuad(quad, config)) {
        return {
          ...prevState,
          quad,
          isStable: false,
          stabilityCount: 0,
          shootNow: false,
        };
      }
      
      // Si es el primer quad válido, inicializar
      if (!prevState.lastQuad) {
        return {
          ...prevState,
          quad,
          isStable: false,
          stabilityCount: 1,
          shootNow: false,
          lastQuad: quad,
          lastBoundingBox: geometryUtils.quadBoundingBox(quad),
        };
      }
      
      // Calcular métricas de estabilidad
      const currentBoundingBox = geometryUtils.quadBoundingBox(quad);
      const iou = geometryUtils.boxesIoU(prevState.lastBoundingBox!, currentBoundingBox);
      const drift = geometryUtils.avgCornerDrift(prevState.lastQuad!, quad);
      
      // Verificar si el quad es estable
      const isStableThisFrame = 
        iou >= (config.iouThreshold || DEFAULT_CONFIG.iouThreshold) &&
        drift <= (config.cornerDrift || DEFAULT_CONFIG.cornerDrift);
      
      let newStabilityCount = prevState.stabilityCount;
      let newIsStable = false;
      let newShootNow = false;
      
      if (isStableThisFrame) {
        newStabilityCount = Math.min(
          prevState.stabilityCount + 1,
          config.stabilityFrames || DEFAULT_CONFIG.stabilityFrames
        );
        
        // Verificar si alcanzamos la estabilidad requerida
        if (newStabilityCount >= (config.stabilityFrames || DEFAULT_CONFIG.stabilityFrames)) {
          newIsStable = true;
          
          // Trigger auto-shoot si está habilitado y no se ha disparado ya
          if (
            (config.autoShoot !== false) && 
            !shootTriggeredRef.current &&
            !prevState.shootNow
          ) {
            newShootNow = true;
            shootTriggeredRef.current = true;
            
            // Llamar callback de trigger
            onShootTrigger?.();
            
            // Resetear trigger después de un tiempo
            setTimeout(() => {
              shootTriggeredRef.current = false;
            }, 2000);
          }
        }
      } else {
        // Resetear contador si no es estable
        newStabilityCount = 0;
      }
      
      // Llamar callback de cambio de estabilidad
      if (newIsStable !== prevState.isStable || newStabilityCount !== prevState.stabilityCount) {
        onStabilityChange?.(newIsStable, newStabilityCount);
      }
      
      return {
        quad,
        isStable: newIsStable,
        stabilityCount: newStabilityCount,
        shootNow: newShootNow,
        lastQuad: quad,
        lastBoundingBox: currentBoundingBox,
      };
    });
  }, [config, onStabilityChange, onShootTrigger]);
  
  /**
   * Resetea el estado de estabilidad
   */
  const resetStability = useCallback(() => {
    setStabilityState(prevState => ({
      ...prevState,
      isStable: false,
      stabilityCount: 0,
      shootNow: false,
      lastQuad: null,
      lastBoundingBox: null,
    }));
    
    shootTriggeredRef.current = false;
    frameCountRef.current = 0;
  }, []);
  
  /**
   * Resetea el trigger de disparo
   */
  const resetShootTrigger = useCallback(() => {
    setStabilityState(prevState => ({
      ...prevState,
      shootNow: false,
    }));
    
    shootTriggeredRef.current = false;
  }, []);
  
  // Efecto para limpiar estado cuando se desmonta
  useEffect(() => {
    return () => {
      shootTriggeredRef.current = false;
    };
  }, []);
  
  // Efecto para resetear shootNow después de un tiempo
  useEffect(() => {
    if (stabilityState.shootNow) {
      const timer = setTimeout(() => {
        resetShootTrigger();
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [stabilityState.shootNow, resetShootTrigger]);
  
  return {
    stabilityState,
    updateQuad,
    resetStability,
    shouldShoot: stabilityState.shootNow,
    isStable: stabilityState.isStable,
    stabilityCount: stabilityState.stabilityCount,
  };
};

/**
 * Hook para obtener estadísticas de rendimiento del auto-captura
 */
export const useAutoCaptureStats = () => {
  const [stats, setStats] = useState({
    totalFrames: 0,
    stableFrames: 0,
    unstableFrames: 0,
    averageStabilityTime: 0,
    lastResetTime: Date.now(),
  });
  
  const updateStats = useCallback((isStable: boolean) => {
    setStats(prevStats => {
      const newTotalFrames = prevStats.totalFrames + 1;
      const newStableFrames = isStable ? prevStats.stableFrames + 1 : prevStats.stableFrames;
      const newUnstableFrames = !isStable ? prevStats.unstableFrames + 1 : prevStats.unstableFrames;
      
      return {
        totalFrames: newTotalFrames,
        stableFrames: newStableFrames,
        unstableFrames: newUnstableFrames,
        averageStabilityTime: newTotalFrames > 0 ? newStableFrames / newTotalFrames : 0,
        lastResetTime: prevStats.lastResetTime,
      };
    });
  }, []);
  
  const resetStats = useCallback(() => {
    setStats({
      totalFrames: 0,
      stableFrames: 0,
      unstableFrames: 0,
      averageStabilityTime: 0,
      lastResetTime: Date.now(),
    });
  }, []);
  
  return {
    stats,
    updateStats,
    resetStats,
  };
};

/**
 * Hook para debug del auto-captura
 */
export const useAutoCaptureDebug = (enabled: boolean = false) => {
  const [debugInfo, setDebugInfo] = useState<{
    lastQuad: Quad | null;
    lastIoU: number;
    lastDrift: number;
    frameRate: number;
    processingTime: number;
  }>({
    lastQuad: null,
    lastIoU: 0,
    lastDrift: 0,
    frameRate: 0,
    processingTime: 0,
  });
  
  const updateDebugInfo = useCallback((
    quad: Quad | null,
    iou: number,
    drift: number,
    processingTime: number
  ) => {
    if (!enabled) return;
    
    const now = Date.now();
    const frameRate = 1000 / processingTime; // Aproximación
    
    setDebugInfo({
      lastQuad: quad,
      lastIoU: iou,
      lastDrift: drift,
      frameRate,
      processingTime,
    });
  }, [enabled]);
  
  return {
    debugInfo,
    updateDebugInfo,
  };
};













































