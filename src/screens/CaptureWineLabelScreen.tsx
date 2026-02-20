/**
 * 📱 Pantalla de Ejemplo para Captura de Etiquetas
 * Demuestra el uso del módulo de cámara profesional
 */

import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  SafeAreaView,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../types';
import ProWineCamera from '../modules/camera/ProWineCamera';
import { Quad, CameraConfig, DEFAULT_CONFIG } from '../modules/camera/types';

type CaptureWineLabelScreenNavigationProp = StackNavigationProp<RootStackParamList, 'CaptureWineLabel'>;

interface Props {
  navigation: CaptureWineLabelScreenNavigationProp;
}

interface CaptureResult {
  originalUri: string;
  warpedUri?: string;
  quad?: Quad;
  timestamp: number;
}

export default function CaptureWineLabelScreen({ navigation }: Props) {
  const [captureResults, setCaptureResults] = useState<CaptureResult[]>([]);
  const [showCamera, setShowCamera] = useState(true);
  const [currentConfig, setCurrentConfig] = useState<CameraConfig>(DEFAULT_CONFIG);
  const [debugMode, setDebugMode] = useState(false);

  /**
   * Maneja la captura de imagen original
   */
  const handleOriginalCapture = (uri: string) => {
    console.log('📸 Imagen original capturada:', uri);
    
    setCaptureResults(prev => [...prev, {
      originalUri: uri,
      timestamp: Date.now(),
    }]);
  };

  /**
   * Maneja la captura de imagen procesada (warped)
   */
  const handleWarpedCapture = (uri: string) => {
    console.log('🔄 Imagen procesada:', uri);
    
    setCaptureResults(prev => {
      const updated = [...prev];
      const lastResult = updated[updated.length - 1];
      
      if (lastResult && lastResult.timestamp === Date.now()) {
        lastResult.warpedUri = uri;
      } else {
        updated.push({
          originalUri: uri,
          warpedUri: uri,
          timestamp: Date.now(),
        });
      }
      
      return updated;
    });
    
    // Mostrar confirmación
    Alert.alert(
      '¡Captura Exitosa!',
      'La etiqueta ha sido capturada y procesada correctamente.',
      [
        { text: 'Continuar', style: 'default' },
        { text: 'Ver Resultado', style: 'default', onPress: () => setShowCamera(false) },
      ]
    );
  };

  /**
   * Maneja el quad detectado (debug)
   */
  const handleDebugQuad = (quad: Quad | null) => {
    if (debugMode && quad) {
      console.log('🔍 Quad detectado:', quad);
    }
  };

  /**
   * Maneja errores de la cámara
   */
  const handleCameraError = (error: string) => {
    console.error('❌ Error de cámara:', error);
    Alert.alert('Error de Cámara', error);
  };

  /**
   * Alterna el modo debug
   */
  const toggleDebugMode = () => {
    setDebugMode(!debugMode);
  };

  /**
   * Alterna la configuración de la cámara
   */
  const toggleCameraConfig = () => {
    setCurrentConfig(prev => ({
      ...prev,
      autoShoot: !prev.autoShoot,
    }));
  };

  /**
   * Resetea los resultados de captura
   */
  const resetResults = () => {
    setCaptureResults([]);
  };

  /**
   * Navega de vuelta
   */
  const goBack = () => {
    navigation.goBack();
  };

  /**
   * Procesa la imagen capturada (simulación de OCR)
   */
  const processCapturedImage = async (uri: string) => {
    try {
      // Aquí se integraría con el sistema de OCR existente
      console.log('🔍 Procesando imagen con OCR:', uri);
      
      // Simular procesamiento
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      Alert.alert(
        'Procesamiento Completado',
        'La imagen ha sido procesada con éxito. Los datos del vino han sido extraídos.',
        [{ text: 'OK' }]
      );
      
    } catch (error) {
      console.error('Error procesando imagen:', error);
      Alert.alert('Error', 'No se pudo procesar la imagen');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {showCamera ? (
        <View style={styles.cameraContainer}>
          <ProWineCamera
            onOriginal={handleOriginalCapture}
            onWarped={handleWarpedCapture}
            onDebugQuad={debugMode ? handleDebugQuad : undefined}
            onError={handleCameraError}
            config={currentConfig}
            style={styles.camera}
          />
          
          {/* Controles superiores */}
          <View style={styles.topControls}>
            <TouchableOpacity style={styles.backButton} onPress={goBack}>
              <Text style={styles.backButtonText}>← Volver</Text>
            </TouchableOpacity>
            
            <View style={styles.rightControls}>
              <TouchableOpacity 
                style={[styles.controlButton, debugMode && styles.activeButton]} 
                onPress={toggleDebugMode}
              >
                <Text style={styles.controlButtonText}>🔍</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.controlButton, currentConfig.autoShoot && styles.activeButton]} 
                onPress={toggleCameraConfig}
              >
                <Text style={styles.controlButtonText}>🎯</Text>
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Información de estado */}
          <View style={styles.statusInfo}>
            <Text style={styles.statusText}>
              Modo: {currentConfig.autoShoot ? 'Auto-disparo' : 'Manual'}
            </Text>
            <Text style={styles.statusText}>
              Debug: {debugMode ? 'ON' : 'OFF'}
            </Text>
            <Text style={styles.statusText}>
              Capturas: {captureResults.length}
            </Text>
          </View>
          
          {/* Botón para ver resultados */}
          {captureResults.length > 0 && (
            <TouchableOpacity 
              style={styles.resultsButton} 
              onPress={() => setShowCamera(false)}
            >
              <Text style={styles.resultsButtonText}>
                Ver Resultados ({captureResults.length})
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView style={styles.resultsContainer}>
          <View style={styles.resultsHeader}>
            <TouchableOpacity style={styles.backButton} onPress={() => setShowCamera(true)}>
              <Text style={styles.backButtonText}>← Volver a Cámara</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.resetButton} onPress={resetResults}>
              <Text style={styles.resetButtonText}>Limpiar</Text>
            </TouchableOpacity>
          </View>
          
          <Text style={styles.resultsTitle}>Resultados de Captura</Text>
          
          {captureResults.map((result, index) => (
            <View key={result.timestamp} style={styles.resultItem}>
              <Text style={styles.resultItemTitle}>Captura #{index + 1}</Text>
              
              <View style={styles.imageContainer}>
                <Text style={styles.imageLabel}>Original:</Text>
                <Image source={{ uri: result.originalUri }} style={styles.resultImage} />
              </View>
              
              {result.warpedUri && (
                <View style={styles.imageContainer}>
                  <Text style={styles.imageLabel}>Procesada:</Text>
                  <Image source={{ uri: result.warpedUri }} style={styles.resultImage} />
                </View>
              )}
              
              <TouchableOpacity 
                style={styles.processButton}
                onPress={() => processCapturedImage(result.warpedUri || result.originalUri)}
              >
                <Text style={styles.processButtonText}>Procesar con OCR</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  cameraContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  topControls: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  backButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  rightControls: {
    flexDirection: 'row',
    gap: 10,
  },
  controlButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeButton: {
    backgroundColor: 'rgba(0,122,255,0.8)',
  },
  controlButtonText: {
    fontSize: 18,
    color: 'white',
  },
  statusInfo: {
    position: 'absolute',
    top: 100,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 10,
    borderRadius: 8,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    marginBottom: 2,
  },
  resultsButton: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    right: 20,
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    borderRadius: 25,
    alignItems: 'center',
  },
  resultsButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  resultsContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  resetButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  resetButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resultsTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 20,
    color: '#333',
  },
  resultItem: {
    margin: 20,
    padding: 15,
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  resultItemTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  imageContainer: {
    marginBottom: 15,
  },
  imageLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 5,
    color: '#666',
  },
  resultImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    resizeMode: 'contain',
  },
  processButton: {
    backgroundColor: '#34C759',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  processButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
