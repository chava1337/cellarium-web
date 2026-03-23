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
import { InventoryEventReason } from './inventoryAnalyticsTypes';
import { inventoryModalSharedStyles as s } from './inventoryModalSharedStyles';

export interface InventoryEventModalProps {
  visible: boolean;
  onRequestClose: () => void;
  eventItem: InventoryItem | null;
  eventDirection: 'in' | 'out';
  eventReason: InventoryEventReason;
  eventQty: string;
  eventNotes: string;
  eventSubmitting: boolean;
  contentPaddingBottom: number;
  onChangeDirection: (d: 'in' | 'out') => void;
  onChangeReason: (r: InventoryEventReason) => void;
  onChangeQty: (q: string) => void;
  onChangeNotes: (n: string) => void;
  onConfirm: () => void;
}

const InventoryEventModal: React.FC<InventoryEventModalProps> = ({
  visible,
  onRequestClose,
  eventItem,
  eventDirection,
  eventReason,
  eventQty,
  eventNotes,
  eventSubmitting,
  contentPaddingBottom,
  onChangeDirection,
  onChangeReason,
  onChangeQty,
  onChangeNotes,
  onConfirm,
}) => {
  const preview =
    eventItem && eventQty.trim() !== ''
      ? (() => {
          const q = parseInt(eventQty, 10);
          if (isNaN(q) || q <= 0) return null;
          const prev = eventItem.stock_quantity ?? 0;
          const next = eventDirection === 'in' ? prev + q : Math.max(0, prev - q);
          return (
            <View style={s.previewBox}>
              <Text style={s.previewLabel}>Vista previa</Text>
              <Text style={s.previewText}>
                {prev} → {next} botellas
              </Text>
            </View>
          );
        })()
      : null;

  return (
    <CellariumModal
      visible={visible}
      onRequestClose={onRequestClose}
      title="Registrar evento"
      subtitle="Registra solo lo que ocurrió. Notas opcional."
      animationType="slide"
      presentation="sheet"
      contentPaddingBottom={contentPaddingBottom}
    >
      {eventItem ? (
        <View style={s.wineInfoBox}>
          <Text style={s.wineName}>{eventItem.wines.name}</Text>
          <Text style={s.wineStock}>Stock actual: {eventItem.stock_quantity} botellas</Text>
        </View>
      ) : null}

      <Text style={s.inputLabel}>Tipo</Text>
      <View style={s.reasonRow}>
        <TouchableOpacity
          style={[s.reasonBtn, eventDirection === 'in' && s.reasonBtnActive]}
          onPress={() => {
            onChangeDirection('in');
            onChangeReason('compra');
          }}
        >
          <Text style={[s.reasonBtnText, eventDirection === 'in' && s.reasonBtnTextActive]}>Entrada</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.reasonBtn, eventDirection === 'out' && s.reasonBtnActive]}
          onPress={() => {
            onChangeDirection('out');
            onChangeReason('cortesia_cliente');
          }}
        >
          <Text style={[s.reasonBtnText, eventDirection === 'out' && s.reasonBtnTextActive]}>Salida</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.inputLabel}>Motivo</Text>
      <View style={s.reasonRow}>
        {eventDirection === 'in'
          ? (['compra', 'cortesia_proveedor'] as InventoryEventReason[]).map((r) => (
              <TouchableOpacity
                key={r}
                style={[s.reasonBtn, eventReason === r && s.reasonBtnActive]}
                onPress={() => onChangeReason(r)}
              >
                <Text style={[s.reasonBtnText, eventReason === r && s.reasonBtnTextActive]}>
                  {r === 'compra' ? 'Compra' : 'Cortesía proveedor'}
                </Text>
              </TouchableOpacity>
            ))
          : (['cortesia_cliente', 'rotura'] as InventoryEventReason[]).map((r) => (
              <TouchableOpacity
                key={r}
                style={[s.reasonBtn, eventReason === r && s.reasonBtnActive]}
                onPress={() => onChangeReason(r)}
              >
                <Text style={[s.reasonBtnText, eventReason === r && s.reasonBtnTextActive]}>
                  {r === 'cortesia_cliente' ? 'Cortesía cliente' : 'Rotura/Merma'}
                </Text>
              </TouchableOpacity>
            ))}
      </View>

      <Text style={s.inputLabel}>Cantidad</Text>
      <TextInput
        style={s.input}
        placeholder="Número de botellas"
        placeholderTextColor="#999"
        keyboardType="number-pad"
        value={eventQty}
        onChangeText={onChangeQty}
      />

      {preview}

      <Text style={s.inputLabel}>Notas (opcional)</Text>
      <TextInput
        style={[s.input, s.textArea]}
        placeholder="Notas"
        placeholderTextColor="#999"
        multiline
        numberOfLines={2}
        value={eventNotes}
        onChangeText={onChangeNotes}
      />

      <View style={s.modalButtons}>
        <TouchableOpacity
          style={[s.modalButton, s.cancelBtn]}
          onPress={onRequestClose}
          disabled={eventSubmitting}
        >
          <Text style={s.cancelBtnText}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.modalButton, s.confirmBtn]}
          onPress={onConfirm}
          disabled={
            eventSubmitting || eventQty.trim() === '' || !(parseInt(eventQty, 10) > 0)
          }
        >
          {eventSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.confirmBtnText}>Confirmar</Text>
          )}
        </TouchableOpacity>
      </View>
    </CellariumModal>
  );
};

export default InventoryEventModal;
