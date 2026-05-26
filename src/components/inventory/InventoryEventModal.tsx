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
import { useLanguage } from '../../contexts/LanguageContext';

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
  const { t } = useLanguage();

  const reasonLabel = (r: InventoryEventReason) => {
    switch (r) {
      case 'compra':
        return t('inventory.reason_purchase');
      case 'cortesia_proveedor':
        return t('inventory.reason_supplier');
      case 'cortesia_cliente':
        return t('inventory.reason_client');
      case 'rotura':
        return t('inventory.reason_breakage');
      default:
        return r;
    }
  };

  const preview =
    eventItem && eventQty.trim() !== ''
      ? (() => {
          const q = parseInt(eventQty, 10);
          if (isNaN(q) || q <= 0) return null;
          const prev = eventItem.stock_quantity ?? 0;
          const next = eventDirection === 'in' ? prev + q : Math.max(0, prev - q);
          return (
            <View style={s.previewBox}>
              <Text style={s.previewLabel}>{t('inventory.preview')}</Text>
              <Text style={s.previewText}>
                {t('inventory.preview_bottles').replace('{prev}', String(prev)).replace('{next}', String(next))}
              </Text>
            </View>
          );
        })()
      : null;

  return (
    <CellariumModal
      visible={visible}
      onRequestClose={onRequestClose}
      title={t('inventory.event_modal_title')}
      subtitle={t('inventory.event_modal_subtitle')}
      animationType="slide"
      presentation="sheet"
      contentPaddingBottom={contentPaddingBottom}
    >
      {eventItem ? (
        <View style={s.wineInfoBox}>
          <Text style={s.wineName}>{eventItem.wines.name}</Text>
          <Text style={s.wineStock}>
            {t('inventory.current_stock')} {eventItem.stock_quantity} {t('inventory.bottles')}
          </Text>
        </View>
      ) : null}

      <Text style={s.inputLabel}>{t('inventory.type')}</Text>
      <View style={s.reasonRow}>
        <TouchableOpacity
          style={[s.reasonBtn, eventDirection === 'in' && s.reasonBtnActive]}
          onPress={() => {
            onChangeDirection('in');
            onChangeReason('compra');
          }}
        >
          <Text style={[s.reasonBtnText, eventDirection === 'in' && s.reasonBtnTextActive]}>
            {t('inventory.direction_in')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.reasonBtn, eventDirection === 'out' && s.reasonBtnActive]}
          onPress={() => {
            onChangeDirection('out');
            onChangeReason('cortesia_cliente');
          }}
        >
          <Text style={[s.reasonBtnText, eventDirection === 'out' && s.reasonBtnTextActive]}>
            {t('inventory.direction_out')}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={s.inputLabel}>{t('inventory.reason')}</Text>
      <View style={s.reasonRow}>
        {eventDirection === 'in'
          ? (['compra', 'cortesia_proveedor'] as InventoryEventReason[]).map((r) => (
              <TouchableOpacity
                key={r}
                style={[s.reasonBtn, eventReason === r && s.reasonBtnActive]}
                onPress={() => onChangeReason(r)}
              >
                <Text style={[s.reasonBtnText, eventReason === r && s.reasonBtnTextActive]}>
                  {reasonLabel(r)}
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
                  {reasonLabel(r)}
                </Text>
              </TouchableOpacity>
            ))}
      </View>

      <Text style={s.inputLabel}>{t('inventory.quantity')}</Text>
      <TextInput
        style={s.input}
        placeholder={t('inventory.qty_ph')}
        placeholderTextColor="#999"
        keyboardType="number-pad"
        value={eventQty}
        onChangeText={onChangeQty}
      />

      {preview}

      <Text style={s.inputLabel}>{t('inventory.notes_optional')}</Text>
      <TextInput
        style={[s.input, s.textArea]}
        placeholder={t('inventory.notes_ph')}
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
          <Text style={s.cancelBtnText}>{t('btn.cancel')}</Text>
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
            <Text style={s.confirmBtnText}>{t('btn.confirm')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </CellariumModal>
  );
};

export default InventoryEventModal;
