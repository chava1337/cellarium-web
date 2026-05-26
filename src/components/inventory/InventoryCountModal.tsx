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
import { useLanguage } from '../../contexts/LanguageContext';

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
  const { t } = useLanguage();

  const preview =
    countQuantity.trim() !== ''
      ? (() => {
          const count = parseInt(countQuantity, 10);
          if (isNaN(count) || count < 0) return null;
          const delta = count - countPrevStock;
          const deltaStr = delta > 0 ? `+${delta}` : delta < 0 ? `-${Math.abs(delta)}` : '0';
          return (
            <View style={s.previewBox}>
              <Text style={s.previewLabel}>{t('inventory.preview')}</Text>
              <Text style={s.previewText}>
                {t('inventory.preview_bottles')
                  .replace('{prev}', String(countPrevStock))
                  .replace('{next}', String(count))}
              </Text>
              <Text style={[s.previewText, { fontSize: 14, marginTop: 4 }]}>
                {t('inventory.adjustment')} {deltaStr}
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
      title={t('inventory.count_modal_title')}
      subtitle={t('inventory.count_modal_subtitle')}
      animationType="slide"
      presentation="sheet"
      contentPaddingBottom={contentPaddingBottom}
    >
      {countItem ? (
        <View style={s.wineInfoBox}>
          <Text style={s.wineName}>{countItem.wines.name}</Text>
          <Text style={s.wineStock}>
            {t('inventory.current_stock_app')} {countPrevStock} {t('inventory.bottles')}
          </Text>
        </View>
      ) : null}

      <Text style={s.inputLabel}>{t('inventory.count_input_label')}</Text>
      <TextInput
        style={s.input}
        placeholder={t('inventory.count_input_ph')}
        placeholderTextColor="#999"
        keyboardType="number-pad"
        value={countQuantity}
        onChangeText={onChangeQuantity}
      />

      {preview}

      <Text style={s.inputLabel}>{t('inventory.notes_optional')}</Text>
      <TextInput
        style={[s.input, s.textArea]}
        placeholder={t('inventory.count_notes_ph')}
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
          <Text style={s.cancelBtnText}>{t('btn.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.modalButton, s.confirmBtn]}
          onPress={onConfirm}
          disabled={confirmDisabled}
        >
          {countSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.confirmBtnText}>{t('btn.confirm')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </CellariumModal>
  );
};

export default InventoryCountModal;
