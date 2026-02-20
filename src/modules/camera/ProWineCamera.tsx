/**
 * 🎥 Componente Principal de Cámara Profesional
 * Sistema avanzado de captura de etiquetas de vino con detección automática
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useFrameProcessor,
  CameraPermissionStatus,
} from 'react-native-vision-camera';
import { runOnJS } from 'react-native-reanimated';
import { ProWineCameraProps, Quad, CameraState, DEFAULT_CONFIG } from './types';
import { useAutoCapture } from './hooks/useAutoCapture';
import { warpUtils } from './lib/warp';
import { geometryUtils } from './lib/geometry';
import CameraOverlay from './ui/Overlay';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

/**
 * Componente principal de cámara profesional para captura de etiquetas
 */
export const ProWineCamera: React.FC<ProWineCameraProps> = ({
  onWarped,
  onOriginal,
  onDebugQuad,
  onError,
  config = DEFAULT_CONFIG,
  style,
}) => {
  // Estado de la cámara
  const [cameraState, setCameraState] = useState<CameraState>({
    isInitialized: false,
    hasPermission: false,
    isShooting: false,
    isProcessing: false,
    error: null,
    torchEnabled: false,
    cameraPosition: 'back',
  });
  
  // Referencias
  const cameraRef = useRef<Camera>(null);
  const device = useCameraDevice(cameraState.cameraPosition);
  
  // Hook de auto-captura
  const {
    stabilityState,
    updateQuad,
    resetStability,
    shouldShoot,
    isStable,
    stabilityCount,
  } = useAutoCapture({
    config,
    onShootTrigger: handleAutoShoot,
  });
  
  // Estado del preview
  const [previewSize, setPreviewSize] = useState({ width: screenWidth, height: screenHeight });
  
  /**
   * Maneja el auto-disparo cuando se alcanza la estabilidad
   */
  function handleAutoShoot() {
    if (cameraState.isShooting || cameraState.isProcessing) return;
    
    console.log('🎯 Auto-disparo activado');
    capturePhoto();
  }
  
  /**
   * Solicita permisos de cámara
   */
  const requestCameraPermission = useCallback(async () => {
    try {
      const permission = await Camera.requestCameraPermission();
      
      setCameraState(prev => ({
        ...prev,
        hasPermission: permission === 'granted',
        error: permission === 'denied' ? 'Permisos de cámara denegados' : null,
      }));
      
      if (permission === 'denied') {
        onError?.('Permisos de cámara requeridos');
      }
      
    } catch (error) {
      console.error('Error solicitando permisos:', error);
      setCameraState(prev => ({
        ...prev,
        error: 'Error solicitando permisos',
      }));
      onError?.('Error solicitando permisos de cámara');
    }
  }, [onError]);
  
  /**
   * Inicializa la cámara
   */
  const initializeCamera = useCallback(async () => {
    try {
      console.log('🎥 Inicializando cámara profesional...');
      setCameraState(prev => ({ ...prev, isInitialized: false }));
      
      await requestCameraPermission();
      
      console.log('📱 Dispositivo actual:', {
        device: device ? 'encontrado' : 'no encontrado',
        position: cameraState.cameraPosition,
        hasDevice: !!device
      });
      
      if (device) {
        console.log('✅ Dispositivo de cámara encontrado');
        setCameraState(prev => ({
          ...prev,
          isInitialized: true,
          error: null,
        }));
      } else {
        console.error('❌ No se encontró dispositivo de cámara');
        setCameraState(prev => ({
          ...prev,
          error: 'No se encontró dispositivo de cámara',
        }));
        onError?.('No se encontró dispositivo de cámara');
      }
      
    } catch (error) {
      console.error('Error inicializando cámara:', error);
      setCameraState(prev => ({
        ...prev,
        error: 'Error inicializando cámara',
      }));
      onError?.('Error inicializando cámara');
    }
  }, [device, cameraState.cameraPosition, requestCameraPermission, onError]);
  
  /**
   * Procesador de frames para detección de rectángulos
   * TEMPORALMENTE DESHABILITADO - problemas con worklets
   */
  // const frameProcessor = useFrameProcessor((frame) => {
  //   'worklet';
  //   
  //   try {
  //     // Simulación de detección de rectángulos
  //     // En una implementación real, aquí se usaría una librería como:
  //     // - react-native-vision-camera-code-scanner
  //     // - react-native-opencv
  //     // - Una implementación nativa personalizada
  //     
  //     const mockQuads = detectRectanglesMock(frame);
  //     
  //     if (mockQuads.length > 0) {
  //       const bestQuad = geometryUtils.findBestQuad(mockQuads, config);
  //       
  //       if (bestQuad) {
  //         runOnJS(updateQuad)(bestQuad);
  //         runOnJS(onDebugQuad)?.(bestQuad);
  //       } else {
  //         runOnJS(updateQuad)(null);
  //         runOnJS(onDebugQuad)?.(null);
  //       }
  //     } else {
  //       runOnJS(updateQuad)(null);
  //       runOnJS(onDebugQuad)?.(null);
  //     }
  //     
  //   } catch (error) {
  //     console.error('Error en frame processor:', error);
  //     runOnJS(updateQuad)(null);
  //   }
  // }, [config, updateQuad, onDebugQuad]);
  
  /**
   * Simulación de detección de rectángulos
   * En producción, reemplazar con implementación real
   */
  const detectRectanglesMock = (frame: any): Quad[] => {
    // Simulación simple - en producción usar detección real
    const mockQuad: Quad = [
      { x: frame.width * 0.2, y: frame.height * 0.2 },
      { x: frame.width * 0.8, y: frame.height * 0.2 },
      { x: frame.width * 0.8, y: frame.height * 0.8 },
      { x: frame.width * 0.2, y: frame.height * 0.8 },
    ];
    
    // Simular detección intermitente
    return Math.random() > 0.3 ? [mockQuad] : [];
  };
  
  /**
   * Captura una foto
   */
  const capturePhoto = useCallback(async () => {
    if (!cameraRef.current || cameraState.isShooting || cameraState.isProcessing) {
      return;
    }
    
    try {
      setCameraState(prev => ({ ...prev, isShooting: true }));
      
      console.log('📸 Capturando foto...');
      
      const photo = await cameraRef.current.takePhoto({
        qualityPrioritization: 'quality',
        flash: cameraState.torchEnabled ? 'on' : 'off',
        enableAutoStabilization: true,
        enableAutoRedEyeReduction: true,
      });
      
      console.log('✅ Foto capturada:', photo.path);
      
      // Llamar callback de imagen original
      onOriginal?.(photo.path);
      
      // Procesar warp si hay quad estable
      if (stabilityState.quad && isStable) {
        await processWarp(photo.path, stabilityState.quad);
      } else {
        // Si no hay quad estable, usar imagen original
        onWarped?.(photo.path);
      }
      
    } catch (error) {
      console.error('Error capturando foto:', error);
      setCameraState(prev => ({ ...prev, error: 'Error capturando foto' }));
      onError?.('Error capturando foto');
    } finally {
      setCameraState(prev => ({ ...prev, isShooting: false }));
    }
  }, [cameraState.isShooting, cameraState.isProcessing, cameraState.torchEnabled, stabilityState.quad, isStable, onOriginal, onWarped, onError]);
  
  /**
   * Procesa el warp de perspectiva
   */
  const processWarp = useCallback(async (photoPath: string, quad: Quad) => {
    try {
      setCameraState(prev => ({ ...prev, isProcessing: true }));
      
      console.log('🔄 Procesando warp de perspectiva...');
      
      const result = await warpUtils.warpLabelFromQuad(photoPath, quad, config);
      
      if (result.success && result.uri) {
        console.log('✅ Warp completado:', result.uri);
        onWarped?.(result.uri);
      } else {
        console.warn('⚠️ Warp falló, usando imagen original');
        onWarped?.(photoPath);
      }
      
    } catch (error) {
      console.error('Error procesando warp:', error);
      console.warn('⚠️ Usando imagen original debido a error en warp');
      onWarped?.(photoPath);
    } finally {
      setCameraState(prev => ({ ...prev, isProcessing: false }));
    }
  }, [config, onWarped]);
  
  /**
   * Alterna el flash/torch
   */
  const toggleTorch = useCallback(() => {
    setCameraState(prev => ({
      ...prev,
      torchEnabled: !prev.torchEnabled,
    }));
  }, []);
  
  /**
   * Alterna entre cámara frontal y trasera
   */
  const toggleCamera = useCallback(() => {
    setCameraState(prev => ({
      ...prev,
      cameraPosition: prev.cameraPosition === 'back' ? 'front' : 'back',
    }));
  }, []);
  
  /**
   * Reinicia la detección
   */
  const resetDetection = useCallback(() => {
    resetStability();
  }, [resetStability]);
  
  // Efectos
  useEffect(() => {
    initializeCamera();
  }, [initializeCamera]);
  
  useEffect(() => {
    if (shouldShoot) {
      capturePhoto();
    }
  }, [shouldShoot, capturePhoto]);
  
  // Renderizado de estados de error
  if (cameraState.error) {
    return (
      <View style={[styles.container, styles.errorContainer, style]}>
        <Text style={styles.errorText}>{cameraState.error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={initializeCamera}>
          <Text style={styles.retryButtonText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }
  
  // Renderizado de carga
  if (!cameraState.isInitialized || !cameraState.hasPermission) {
    return (
      <View style={[styles.container, styles.loadingContainer, style]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>
          {!cameraState.hasPermission ? 'Solicitando permisos...' : 'Inicializando cámara...'}
        </Text>
      </View>
    );
  }
  
  // Renderizado de cámara
  if (!device) {
    return (
      <View style={[styles.container, styles.errorContainer, style]}>
        <Text style={styles.errorText}>No se encontró dispositivo de cámara</Text>
      </View>
    );
  }
  
  return (
    <View style={[styles.container, style]}>
      <Camera
        ref={cameraRef}
        style={styles.camera}
        device={device}
        isActive={true}
        photo={true}
        // frameProcessor={frameProcessor} // TEMPORALMENTE DESHABILITADO
        torch={cameraState.torchEnabled ? 'on' : 'off'}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setPreviewSize({ width, height });
        }}
      />
      
      {/* Overlay */}
      <CameraOverlay
        quad={stabilityState.quad}
        isStable={isStable}
        stabilityCount={stabilityCount}
        maxStabilityFrames={config.stabilityFrames || DEFAULT_CONFIG.stabilityFrames}
        showGuide={config.showGuide !== false}
        guideShape={config.guideShape || DEFAULT_CONFIG.guideShape}
        previewSize={previewSize}
      />
      
      {/* Botón de captura manual */}
      <View style={styles.captureButtonContainer}>
        <TouchableOpacity
          style={styles.captureButton}
          onPress={capturePhoto}
          disabled={cameraState.isShooting || cameraState.isProcessing}
        >
          <Text style={styles.captureButtonText}>
            {cameraState.isShooting ? '📸' : '📷'}
          </Text>
        </TouchableOpacity>
      </View>
      
      {/* Controles */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlButton} onPress={toggleTorch}>
          <Text style={styles.controlButtonText}>
            {cameraState.torchEnabled ? '🔦' : '💡'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.controlButton} onPress={toggleCamera}>
          <Text style={styles.controlButtonText}>🔄</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.controlButton} onPress={resetDetection}>
          <Text style={styles.controlButtonText}>🔄</Text>
        </TouchableOpacity>
      </View>
      
      {/* Indicador de procesamiento */}
      {(cameraState.isShooting || cameraState.isProcessing) && (
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color="white" />
          <Text style={styles.processingText}>
            {cameraState.isShooting ? 'Capturando...' : 'Procesando...'}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    flex: 1,
  },
  controls: {
    position: 'absolute',
    top: 50,
    right: 20,
    flexDirection: 'column',
    gap: 10,
  },
  controlButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonText: {
    fontSize: 20,
    color: 'white',
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingText: {
    color: 'white',
    fontSize: 18,
    marginTop: 20,
    fontWeight: 'bold',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    fontSize: 16,
    marginTop: 20,
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  captureButtonContainer: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  captureButtonText: {
    fontSize: 32,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default ProWineCamera;
