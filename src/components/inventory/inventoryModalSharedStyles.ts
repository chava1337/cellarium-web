import { StyleSheet } from 'react-native';
import { CELLARIUM, CELLARIUM_LAYOUT } from '../../theme/cellariumTheme';

/** Estilos compartidos por modales de inventario (evento, conteo, edición) */
export const inventoryModalSharedStyles = StyleSheet.create({
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: CELLARIUM.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: CELLARIUM.bg,
    borderRadius: CELLARIUM_LAYOUT.inputRadius,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: CELLARIUM.border,
    color: CELLARIUM.text,
  },
  textArea: {
    minHeight: 56,
    textAlignVertical: 'top',
  },
  wineInfoBox: {
    backgroundColor: CELLARIUM.bg,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  wineName: {
    fontSize: 16,
    fontWeight: '700',
    color: CELLARIUM.text,
    marginBottom: 4,
  },
  wineStock: {
    fontSize: 14,
    color: CELLARIUM.muted,
  },
  reasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
    gap: 8,
  },
  reasonBtn: {
    flexGrow: 1,
    minWidth: '45%',
    backgroundColor: CELLARIUM.bg,
    borderRadius: CELLARIUM_LAYOUT.inputRadius,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: CELLARIUM.border,
    minHeight: 44,
  },
  reasonBtnActive: {
    backgroundColor: CELLARIUM.primary,
    borderColor: CELLARIUM.primary,
  },
  reasonBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: CELLARIUM.muted,
    textAlign: 'center',
  },
  reasonBtnTextActive: {
    color: '#fff',
  },
  previewBox: {
    padding: 10,
    marginBottom: 12,
    backgroundColor: 'rgba(146,64,72,0.08)',
    borderRadius: 10,
  },
  previewLabel: {
    fontSize: 12,
    color: CELLARIUM.primary,
    marginBottom: 2,
  },
  previewText: {
    fontSize: 15,
    fontWeight: '600',
    color: CELLARIUM.primary,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    borderRadius: CELLARIUM_LAYOUT.buttonRadius,
    paddingVertical: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    backgroundColor: CELLARIUM.neutralButton,
  },
  cancelBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  confirmBtn: {
    backgroundColor: CELLARIUM.primary,
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
