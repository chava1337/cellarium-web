import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { InventoryItem } from '../../services/InventoryService';
import { CELLARIUM, CELLARIUM_LAYOUT } from '../../theme/cellariumTheme';
import { isValidPrice, formatCurrencyMXN } from '../../utils/wineCatalogUtils';

const THUMB = 96;
const THUMB_R = 12;
const ACTION = 48;
const ACTION_R = 15;

export interface InventoryItemCardProps {
  item: InventoryItem;
  deletingWine: boolean;
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
  onEvent: (item: InventoryItem) => void;
  onCount: (item: InventoryItem) => void;
}

const InventoryItemCard: React.FC<InventoryItemCardProps> = ({
  item,
  deletingWine,
  onEdit,
  onDelete,
  onEvent,
  onCount,
}) => {
  if (!item.wines) return null;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {item.wines.image_url ? (
          <Image source={{ uri: item.wines.image_url }} style={styles.thumb} resizeMode="contain" />
        ) : (
          <View style={[styles.thumb, styles.thumbPh]}>
            <Text style={styles.phEmoji}>🍷</Text>
          </View>
        )}
        <View style={styles.textBlock}>
          {(item.wines as any).winery ? (
            <Text style={styles.winery} numberOfLines={1}>
              {(item.wines as any).winery}
            </Text>
          ) : null}
          <Text style={styles.wineName} numberOfLines={2}>
            {item.wines.name}
          </Text>
          <Text style={styles.region} numberOfLines={1}>
            {[item.wines.region, item.wines.country].filter(Boolean).join(', ') || '—'}
          </Text>
          <Text style={styles.price} numberOfLines={1}>
            Botella: {isValidPrice(item.price_by_bottle) ? formatCurrencyMXN(item.price_by_bottle) : '—'}
          </Text>
          <Text style={styles.priceCopa} numberOfLines={1}>
            Copa: {isValidPrice(item.price_by_glass) ? formatCurrencyMXN(item.price_by_glass) : '—'}
          </Text>
        </View>
        <View style={styles.actionsCol}>
          <TouchableOpacity style={[styles.actBtn, styles.actBtnSec]} onPress={() => onEdit(item)}>
            <Ionicons name="pencil" size={22} color={CELLARIUM.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actBtn, styles.actBtnSec]}
            onPress={() => onDelete(item)}
            disabled={deletingWine}
          >
            {deletingWine ? (
              <ActivityIndicator size="small" color={CELLARIUM.text} />
            ) : (
              <Ionicons name="trash-outline" size={20} color={CELLARIUM.text} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.stockBlock}>
        <Text style={styles.stockLabel}>Stock actual: </Text>
        <Text style={styles.stockNum}>{item.stock_quantity}</Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.divider} />
        <View style={styles.valueRow}>
          <Text style={styles.valueLabel}>Valor en inventario</Text>
          <Text style={styles.valueAmt}>
            {isValidPrice(item.price_by_bottle)
              ? formatCurrencyMXN(item.stock_quantity * item.price_by_bottle)
              : '—'}
          </Text>
        </View>
      </View>

      <View style={styles.bigActions}>
        <TouchableOpacity style={[styles.bigBtn, styles.bigBtnPri]} onPress={() => onEvent(item)}>
          <Text style={styles.bigBtnPriText}>Registrar evento</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.bigBtn, styles.bigBtnSec]} onPress={() => onCount(item)}>
          <Text style={styles.bigBtnSecText}>Conteo físico</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: CELLARIUM.card,
    borderRadius: CELLARIUM_LAYOUT.cardRadius,
    padding: 14,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB_R,
    backgroundColor: '#F2F2F2',
  },
  thumbPh: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  phEmoji: {
    fontSize: 28,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  winery: {
    fontSize: 15,
    fontWeight: '600',
    color: CELLARIUM.primary,
    marginBottom: 2,
  },
  wineName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  region: {
    fontSize: 13,
    color: CELLARIUM.muted,
    marginBottom: 4,
  },
  price: {
    fontSize: 14,
    fontWeight: '600',
    color: CELLARIUM.text,
  },
  priceCopa: {
    fontSize: 13,
    color: CELLARIUM.muted,
    marginTop: 2,
  },
  actionsCol: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
  },
  actBtn: {
    width: ACTION,
    height: ACTION,
    borderRadius: ACTION_R,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actBtnSec: {
    backgroundColor: '#E8E8ED',
  },
  stockBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 12,
  },
  stockLabel: {
    fontSize: 14,
    color: CELLARIUM.muted,
  },
  stockNum: {
    fontSize: 20,
    fontWeight: '700',
    color: CELLARIUM.primary,
  },
  footer: {
    marginTop: 12,
  },
  divider: {
    height: 1,
    backgroundColor: CELLARIUM.border,
    marginBottom: 10,
  },
  valueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  valueLabel: {
    fontSize: 13,
    color: CELLARIUM.muted,
  },
  valueAmt: {
    fontSize: 16,
    fontWeight: '700',
    color: CELLARIUM.text,
  },
  bigActions: {
    marginTop: 12,
    gap: 10,
  },
  bigBtn: {
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigBtnPri: {
    backgroundColor: CELLARIUM.primary,
  },
  bigBtnPriText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  bigBtnSec: {
    backgroundColor: CELLARIUM.card,
    borderWidth: 2,
    borderColor: CELLARIUM.primary,
  },
  bigBtnSecText: {
    color: CELLARIUM.primary,
    fontSize: 15,
    fontWeight: '700',
  },
});

export default InventoryItemCard;
