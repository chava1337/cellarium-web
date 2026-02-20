import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Switch,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native';
import { Wine } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';

interface WineGlassSaleConfigProps {
  wine: Wine;
  visible: boolean;
  onClose: () => void;
  onSave: (wineId: string, enabled: boolean, price?: number) => void;
}

const WineGlassSaleConfig: React.FC<WineGlassSaleConfigProps> = ({
  wine,
  visible,
  onClose,
  onSave,
}) => {
  const { user } = useAuth();
  const { currentBranch } = useBranch();
  
  const [glassSaleEnabled, setGlassSaleEnabled] = useState(wine.available_by_glass || false);
  const [glassPrice, setGlassPrice] = useState(wine.price_per_glass?.toString() || '');

  const handleSave = () => {
    if (glassSaleEnabled && (!glassPrice || isNaN(Number(glassPrice)) || Number(glassPrice) <= 0)) {
      Alert.alert('Error', 'Por favor ingresa un precio válido para la copa');
      return;
    }

    onSave(wine.id, glassSaleEnabled, glassSaleEnabled ? Number(glassPrice) : undefined);
    onClose();
  };

  const handleCancel = () => {
    // Restaurar valores originales
    setGlassSaleEnabled(wine.available_by_glass || false);
    setGlassPrice(wine.price_per_glass?.toString() || '');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={handleCancel}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Configurar Venta por Copa</Text>
            <Text style={styles.wineName}>{wine.name}</Text>
          </View>

          <View style={styles.modalContent}>
            <View style={styles.configSection}>
              <View style={styles.switchRow}>
                <View style={styles.switchLabel}>
                  <Text style={styles.switchTitle}>Venta por Copa</Text>
                  <Text style={styles.switchDescription}>
                    Habilitar la venta de este vino por copa
                  </Text>
                </View>
                <Switch
                  value={glassSaleEnabled}
                  onValueChange={setGlassSaleEnabled}
                  trackColor={{ false: '#e5e7eb', true: '#10b981' }}
                  thumbColor={glassSaleEnabled ? '#ffffff' : '#f3f4f6'}
                />
              </View>

              {glassSaleEnabled && (
                <View style={styles.priceSection}>
                  <Text style={styles.priceLabel}>Precio por Copa</Text>
                  <View style={styles.priceInputContainer}>
                    <Text style={styles.currencySymbol}>$</Text>
                    <TextInput
                      style={styles.priceInput}
                      value={glassPrice}
                      onChangeText={setGlassPrice}
                      placeholder="0.00"
                      keyboardType="numeric"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                  <Text style={styles.priceHint}>
                    Precio sugerido: ${((wine.price || 0) / 5).toFixed(2)} (1/5 del precio de botella)
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={handleCancel}
            >
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.saveButton]}
              onPress={handleSave}
            >
              <Text style={styles.saveButtonText}>Guardar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 20,
    width: '95%',
    maxWidth: 600,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  modalHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 6,
  },
  wineName: {
    fontSize: 16,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  modalContent: {
    padding: 20,
    flex: 0,
  },
  configSection: {
    marginBottom: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
  },
  switchLabel: {
    flex: 1,
    marginRight: 20,
  },
  switchTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  switchDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  priceSection: {
    backgroundColor: '#f0f9ff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#bae6fd',
  },
  priceLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 10,
  },
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#8b0000',
    paddingHorizontal: 16,
    marginBottom: 8,
    minHeight: 56,
  },
  currencySymbol: {
    fontSize: 20,
    fontWeight: '600',
    color: '#8b0000',
    marginRight: 10,
  },
  priceInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    paddingVertical: 12,
  },
  priceHint: {
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
    lineHeight: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
    backgroundColor: '#f9fafb',
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 56,
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  saveButton: {
    backgroundColor: '#8b0000',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});

export default WineGlassSaleConfig;


