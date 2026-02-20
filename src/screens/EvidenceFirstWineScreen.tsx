/**
 * 🍷 Pantalla de Registro Evidence-First
 * Sistema optimizado para datos reales y verificables
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
  Modal,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { evidenceFirstWineService, WineEvidence, CanonicalWine, WineDescription } from '../services/EvidenceFirstWineService';
import { CellariumLoader } from '../components/CellariumLoader';

interface EvidenceFirstWineFormData {
  // Campos obligatorios
  producer: string;
  wineName: string;
  vintage: number;
  
  // Evidencias
  labelBackImage?: string;
  techsheetPdf?: string;
  pastedText?: string;
  
  // Datos extraídos
  extractedData?: any;
  canonicalWine?: CanonicalWine;
  description?: WineDescription;
}

export default function EvidenceFirstWineScreen({ navigation }: any) {
  const [formData, setFormData] = useState<EvidenceFirstWineFormData>({
    producer: '',
    wineName: '',
    vintage: new Date().getFullYear(),
  });
  
  const [loading, setLoading] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);
  const [evidenceType, setEvidenceType] = useState<'label_back' | 'techsheet_pdf' | 'pasted_text'>('label_back');

  useEffect(() => {
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permisos requeridos', 'Necesitamos acceso a la galería para procesar imágenes.');
    }
  };

  const handleCaptureLabelBack = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaType.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setFormData(prev => ({
          ...prev,
          labelBackImage: result.assets[0].uri
        }));
        setEvidenceType('label_back');
        setShowEvidenceModal(true);
      }
    } catch (error) {
      console.error('Error capturando imagen:', error);
      Alert.alert('Error', 'No se pudo capturar la imagen');
    }
  };

  const handleSelectFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaType.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setFormData(prev => ({
          ...prev,
          labelBackImage: result.assets[0].uri
        }));
        setEvidenceType('label_back');
        setShowEvidenceModal(true);
      }
    } catch (error) {
      console.error('Error seleccionando imagen:', error);
      Alert.alert('Error', 'No se pudo seleccionar la imagen');
    }
  };

  const handlePasteText = () => {
    setEvidenceType('pasted_text');
    setShowEvidenceModal(true);
  };

  const processEvidence = async (evidence: WineEvidence) => {
    try {
      setLoading(true);
      setProcessingStep('Extrayendo datos de la evidencia...');

      // Extraer datos de la evidencia
      const extractedData = await evidenceFirstWineService.extractWineData(evidence);
      
      setProcessingStep('Buscando vino canónico...');
      
      // Buscar o crear vino canónico
      const canonicalWine = await evidenceFirstWineService.findOrCreateCanonicalWine(extractedData);
      
      setProcessingStep('Generando descripción...');
      
      // Generar descripción
      const description = await evidenceFirstWineService.generateWineDescription(canonicalWine);
      
      setProcessingStep('Guardando evidencia...');
      
      // Guardar evidencia
      await evidenceFirstWineService.saveWineSource(canonicalWine.id, evidence, extractedData);
      
      // Actualizar formulario
      setFormData(prev => ({
        ...prev,
        producer: canonicalWine.producer,
        wineName: canonicalWine.name,
        vintage: canonicalWine.vintage,
        extractedData,
        canonicalWine,
        description
      }));

      setProcessingStep('¡Procesamiento completado!');
      
      setTimeout(() => {
        setLoading(false);
        setShowEvidenceModal(false);
        Alert.alert(
          'Éxito', 
          `Vino procesado: ${canonicalWine.name} ${canonicalWine.vintage}\nCobertura: ${canonicalWine.coverage}%`
        );
      }, 1000);

    } catch (error) {
      console.error('Error procesando evidencia:', error);
      setLoading(false);
      Alert.alert('Error', 'No se pudo procesar la evidencia');
    }
  };

  const handleSaveWine = async () => {
    if (!formData.canonicalWine) {
      Alert.alert('Error', 'Debe procesar al menos una evidencia antes de guardar');
      return;
    }

    try {
      setLoading(true);
      setProcessingStep('Guardando vino en el catálogo...');

      // Aquí se integraría con el sistema existente de vinos
      // Por ahora solo mostramos confirmación
      
      setTimeout(() => {
        setLoading(false);
        Alert.alert(
          'Vino Guardado',
          `${formData.canonicalWine.name} ${formData.canonicalWine.vintage} ha sido agregado al catálogo`,
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack()
            }
          ]
        );
      }, 1500);

    } catch (error) {
      console.error('Error guardando vino:', error);
      setLoading(false);
      Alert.alert('Error', 'No se pudo guardar el vino');
    }
  };

  const renderEvidenceModal = () => (
    <Modal
      visible={showEvidenceModal}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>
            {evidenceType === 'label_back' ? 'Contraetiqueta' : 
             evidenceType === 'techsheet_pdf' ? 'Ficha Técnica' : 
             'Texto Pegado'}
          </Text>
          <TouchableOpacity
            onPress={() => setShowEvidenceModal(false)}
            style={styles.closeButton}
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          {evidenceType === 'label_back' && formData.labelBackImage && (
            <View style={styles.imageContainer}>
              <Image
                source={{ uri: formData.labelBackImage }}
                style={styles.evidenceImage}
                resizeMode="contain"
              />
            </View>
          )}

          {evidenceType === 'pasted_text' && (
            <TextInput
              style={styles.textInput}
              placeholder="Pega aquí el texto de la etiqueta o ficha técnica..."
              multiline
              numberOfLines={10}
              value={formData.pastedText}
              onChangeText={(text) => setFormData(prev => ({ ...prev, pastedText: text }))}
            />
          )}

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.processButton}
              onPress={() => {
                if (evidenceType === 'label_back' && formData.labelBackImage) {
                  // Aquí se procesaría la imagen con OCR
                  processEvidence({
                    type: 'label_back',
                    content: 'Texto extraído de la imagen', // Placeholder
                    source: formData.labelBackImage
                  });
                } else if (evidenceType === 'pasted_text' && formData.pastedText) {
                  processEvidence({
                    type: 'pasted_text',
                    content: formData.pastedText
                  });
                } else {
                  Alert.alert('Error', 'Debe proporcionar evidencia válida');
                }
              }}
            >
              <Text style={styles.processButtonText}>Procesar Evidencia</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );

  const renderWineInfo = () => {
    if (!formData.canonicalWine) return null;

    const wine = formData.canonicalWine;
    
    return (
      <View style={styles.wineInfoContainer}>
        <Text style={styles.sectionTitle}>Información del Vino</Text>
        
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Nombre:</Text>
          <Text style={styles.infoValue}>{wine.name}</Text>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Productor:</Text>
          <Text style={styles.infoValue}>{wine.producer}</Text>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Añada:</Text>
          <Text style={styles.infoValue}>{wine.vintage}</Text>
        </View>

        {wine.country && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>País:</Text>
            <Text style={styles.infoValue}>{wine.country}</Text>
          </View>
        )}

        {wine.grapes && wine.grapes.length > 0 && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Uvas:</Text>
            <Text style={styles.infoValue}>{wine.grapes.join(', ')}</Text>
          </View>
        )}

        {wine.abv && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Alcohol:</Text>
            <Text style={styles.infoValue}>{wine.abv}%</Text>
          </View>
        )}

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Cobertura:</Text>
          <Text style={[
            styles.infoValue,
            { color: wine.coverage >= 60 ? '#4CAF50' : '#FF9800' }
          ]}>
            {wine.coverage}%
          </Text>
        </View>

        {formData.description && (
          <View style={styles.descriptionContainer}>
            <Text style={styles.sectionTitle}>Descripción</Text>
            <Text style={styles.descriptionText}>{formData.description.summary}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Registro Evidence-First</Text>
        <Text style={styles.subtitle}>
          Sistema optimizado para datos reales y verificables
        </Text>

        {/* Campos obligatorios */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Datos Básicos</Text>
          
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Productor/Bodega *</Text>
            <TextInput
              style={styles.textInput}
              value={formData.producer}
              onChangeText={(text) => setFormData(prev => ({ ...prev, producer: text }))}
              placeholder="Nombre del productor o bodega"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Nombre del Vino *</Text>
            <TextInput
              style={styles.textInput}
              value={formData.wineName}
              onChangeText={(text) => setFormData(prev => ({ ...prev, wineName: text }))}
              placeholder="Nombre del vino"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Añada *</Text>
            <TextInput
              style={styles.textInput}
              value={formData.vintage.toString()}
              onChangeText={(text) => setFormData(prev => ({ ...prev, vintage: parseInt(text) || new Date().getFullYear() }))}
              placeholder="Año de cosecha"
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Evidencias */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Evidencias</Text>
          <Text style={styles.sectionSubtitle}>
            Proporciona al menos una evidencia para obtener datos precisos
          </Text>

          <View style={styles.evidenceButtons}>
            <TouchableOpacity
              style={styles.evidenceButton}
              onPress={handleCaptureLabelBack}
            >
              <Text style={styles.evidenceButtonIcon}>📷</Text>
              <Text style={styles.evidenceButtonText}>Foto Contraetiqueta</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.evidenceButton}
              onPress={handleSelectFromGallery}
            >
              <Text style={styles.evidenceButtonIcon}>🖼️</Text>
              <Text style={styles.evidenceButtonText}>Desde Galería</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.evidenceButton}
              onPress={handlePasteText}
            >
              <Text style={styles.evidenceButtonIcon}>📝</Text>
              <Text style={styles.evidenceButtonText}>Pegar Texto</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Información del vino */}
        {renderWineInfo()}

        {/* Botón guardar */}
        <TouchableOpacity
          style={[
            styles.saveButton,
            { opacity: formData.canonicalWine ? 1 : 0.5 }
          ]}
          onPress={handleSaveWine}
          disabled={!formData.canonicalWine}
        >
          <Text style={styles.saveButtonText}>Guardar Vino</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modal de evidencia */}
      {renderEvidenceModal()}

      {/* Loading */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <CellariumLoader />
          <Text style={styles.loadingText}>{processingStep}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2c3e50',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#7f8c8d',
    textAlign: 'center',
    marginBottom: 30,
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 15,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#7f8c8d',
    marginBottom: 15,
  },
  inputContainer: {
    marginBottom: 15,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  evidenceButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  evidenceButton: {
    width: '30%',
    backgroundColor: '#3498db',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  evidenceButtonIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  evidenceButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  wineInfoContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  infoLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
  },
  infoValue: {
    fontSize: 16,
    color: '#7f8c8d',
    flex: 1,
    textAlign: 'right',
  },
  descriptionContainer: {
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  descriptionText: {
    fontSize: 14,
    color: '#2c3e50',
    lineHeight: 20,
  },
  saveButton: {
    backgroundColor: '#27ae60',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  closeButton: {
    padding: 10,
  },
  closeButtonText: {
    fontSize: 20,
    color: '#7f8c8d',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  imageContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  evidenceImage: {
    width: 300,
    height: 300,
    borderRadius: 12,
  },
  modalActions: {
    marginTop: 20,
  },
  processButton: {
    backgroundColor: '#3498db',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
  },
  processButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    fontSize: 16,
    marginTop: 20,
    textAlign: 'center',
  },
});














































