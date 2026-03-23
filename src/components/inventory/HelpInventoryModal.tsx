import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, StyleSheet, Modal } from 'react-native';
import { CELLARIUM } from '../../theme/cellariumTheme';

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
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
    <View style={styles.overlay}>
      <View style={styles.content}>
        <Text style={styles.title}>Cómo usar Inventario y Análisis</Text>
        <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
          <View style={styles.block}>
            <Text style={styles.blockTitle}>1. Registrar eventos de inventario</Text>
            <Text style={styles.blockText}>
              Cuando recibas o retires botellas usa:{'\n'}
              • Entrada → Compra o cortesía proveedor{'\n'}
              • Salida → Cortesía cliente o rotura
            </Text>
          </View>
          <View style={styles.block}>
            <Text style={styles.blockTitle}>2. Conteos físicos</Text>
            <Text style={styles.blockText}>
              Realiza conteos cada 15–30 días.{'\n'}
              Estos cortes permiten estimar ventas y consumo.
            </Text>
          </View>
          <View style={styles.block}>
            <Text style={styles.blockTitle}>3. Ventas estimadas</Text>
            <Text style={styles.blockText}>
              El sistema calcula consumo con:{'\n'}
              Stock inicio + Entradas − Salidas especiales − Stock final.
            </Text>
          </View>
          <View style={styles.block}>
            <Text style={styles.blockTitle}>4. Comparar sucursales</Text>
            <Text style={styles.blockText}>
              Si tienes varias sucursales puedes comparar su desempeño y ver qué vinos se venden más.
            </Text>
          </View>
          <Text style={styles.note}>
            Las ventas se estiman con base en conteos físicos y movimientos registrados.
          </Text>
          <View style={styles.checkRow}>
            <Switch
              value={dontShowHelpAgain}
              onValueChange={onDontShowChange}
              trackColor={{ false: '#ccc', true: CELLARIUM.primary }}
              thumbColor="#fff"
            />
            <Text style={styles.checkLabel}>No mostrar de nuevo</Text>
          </View>
        </ScrollView>
        <TouchableOpacity style={styles.closeBtn} onPress={onRequestClose}>
          <Text style={styles.closeText}>Cerrar</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
);

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
