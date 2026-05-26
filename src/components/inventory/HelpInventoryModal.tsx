import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, StyleSheet, Modal } from 'react-native';
import { CELLARIUM } from '../../theme/cellariumTheme';
import { useLanguage } from '../../contexts/LanguageContext';

export interface HelpInventoryModalProps {
  visible: boolean;
  onRequestClose: () => void;
  dontShowHelpAgain: boolean;
  onDontShowChange: (v: boolean) => void;
}

const HelpInventoryModal: React.FC<HelpInventoryModalProps> = ({
  visible,
  onRequestClose,
  dontShowHelpAgain,
  onDontShowChange,
}) => {
  const { t } = useLanguage();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>{t('inventory.help_title')}</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
            <View style={styles.block}>
              <Text style={styles.blockTitle}>{t('inventory.help_block1_title')}</Text>
              <Text style={styles.blockText}>{t('inventory.help_block1_body')}</Text>
            </View>
            <View style={styles.block}>
              <Text style={styles.blockTitle}>{t('inventory.help_block2_title')}</Text>
              <Text style={styles.blockText}>{t('inventory.help_block2_body')}</Text>
            </View>
            <View style={styles.block}>
              <Text style={styles.blockTitle}>{t('inventory.help_block3_title')}</Text>
              <Text style={styles.blockText}>{t('inventory.help_block3_body')}</Text>
            </View>
            <View style={styles.block}>
              <Text style={styles.blockTitle}>{t('inventory.help_block4_title')}</Text>
              <Text style={styles.blockText}>{t('inventory.help_block4_body')}</Text>
            </View>
            <Text style={styles.note}>{t('inventory.help_note')}</Text>
            <View style={styles.checkRow}>
              <Switch
                value={dontShowHelpAgain}
                onValueChange={onDontShowChange}
                trackColor={{ false: '#ccc', true: CELLARIUM.primary }}
                thumbColor="#fff"
              />
              <Text style={styles.checkLabel}>{t('inventory.help_dont_show')}</Text>
            </View>
          </ScrollView>
          <TouchableOpacity style={styles.closeBtn} onPress={onRequestClose}>
            <Text style={styles.closeText}>{t('btn.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  content: {
    backgroundColor: CELLARIUM.card,
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: CELLARIUM.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  scroll: {
    maxHeight: 420,
  },
  block: {
    marginBottom: 14,
  },
  blockTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: CELLARIUM.primary,
    marginBottom: 6,
  },
  blockText: {
    fontSize: 14,
    color: CELLARIUM.muted,
    lineHeight: 20,
  },
  note: {
    fontSize: 12,
    color: CELLARIUM.muted,
    fontStyle: 'italic',
    marginTop: 8,
    marginBottom: 12,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  checkLabel: {
    fontSize: 14,
    color: CELLARIUM.text,
    flex: 1,
  },
  closeBtn: {
    marginTop: 12,
    backgroundColor: CELLARIUM.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default HelpInventoryModal;
