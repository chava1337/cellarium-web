import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { CellariumModal } from '../cellarium';
import { InventoryItem } from '../../services/InventoryService';
import { inventoryModalSharedStyles as s } from './inventoryModalSharedStyles';

export interface InventoryCountModalProps {
  visible: boolean;
  onRequestClose: () => void;
  countItem: InventoryItem | null;
  countPrevStock: number;
  countQuantity: string;
  countNotes: string;
  countSubmitting: boolean;
  contentPaddingBottom: number;
  onChangeQuantity: (q: string) => void;
  onChangeNotes: (n: string) => void;
  onConfirm: () => void;
}

const InventoryCountModal: React.FC<InventoryCountModalProps> = ({
  visible,
  onRequestClose,
  countItem,
  countPrevStock,
  countQuantity,
  countNotes,
  countSubmitting,
  contentPaddingBottom,
  onChangeQuantity,
  onChangeNotes,
  onConfirm,
}) => {
  const preview =
    countQuantity.trim() !== ''
      ? (() => {
          const count = parseInt(countQuantity, 10);
          if (isNaN(count) || count < 0) return null;
          const delta = count - countPrevStock;
          return (
            <View style={s.previewBox}>
              <Text style={s.previewLabel}>Vista previa</Text>
              <Text style={s.previewText}>
                {countPrevStock} → {count} botellas
              </Text>
              <Text style={[s.previewText, { fontSize: 14, marginTop: 4 }]}>
                Ajuste: {delta > 0 ? `+${delta}` : delta < 0 ? `-${Math.abs(delta)}` : '0'}
              </Text>
            </View>
          );
        })()
      : null;

  const confirmDisabled =
    countSubmitting ||
    countQuantity.trim() === '' ||
    (() => {
      const n = parseInt(countQuantity, 10);
      return isNaN(n) || n < 0;
    })();

  return (
    <CellariumModal
      visible={visible}
      onRequestClose={onRequestClose}
      title="Conteo físico"
      subtitle="Recomendado cada 15–30 días."
      animationType="slide"
      presentation="sheet"
      contentPaddingBottom={contentPaddingBottom}
    >
      {countItem ? (
        <View style={s.wineInfoBox}>
          <Text style={s.wineName}>{countItem.wines.name}</Text>
          <Text style={s.wineStock}>Stock actual en app: {countPrevStock} botellas</Text>
        </View>
      ) : null}

      <Text style={s.inputLabel}>Conteo físico ingresado</Text>
      <TextInput
        style={s.input}
        placeholder="Número de botellas contadas"
        placeholderTextColor="#999"
        keyboardType="number-pad"
        value={countQuantity}
        onChangeText={onChangeQuantity}
      />

      {preview}

      <Text style={s.inputLabel}>Notas (opcional)</Text>
      <TextInput
        style={[s.input, s.textArea]}
        placeholder="Notas del conteo"
        placeholderTextColor="#999"
        multiline
        numberOfLines={2}
        value={countNotes}
        onChangeText={onChangeNotes}
      />

      <View style={s.modalButtons}>
        <TouchableOpacity
          style={[s.modalButton, s.cancelBtn]}
          onPress={onRequestClose}
          disabled={countSubmitting}
        >
          <Text style={s.cancelBtnText}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.modalButton, s.confirmBtn]}
          onPress={onConfirm}
          disabled={confirmDisabled}
        >
          {countSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.confirmBtnText}>Confirmar</Text>
          )}
        </TouchableOpacity>
      </View>
    </CellariumModal>
  );
};

export default InventoryCountModal;
