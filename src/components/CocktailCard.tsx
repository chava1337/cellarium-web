/**
 * Card premium para ítem del Menú de Coctelería — layout horizontal estilo Catálogo
 * Thumbnail pequeño a la izquierda, texto al centro, acciones circulares a la derecha
 */

import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CocktailDrink } from '../services/CocktailService';

const CARD_PADDING_V = 16;
const CARD_PADDING_H = 14;
const CARD_RADIUS = 18;
const THUMB_SIZE = 88;
const THUMB_RADIUS = 14;
const WINE_COLOR = '#8E2C3A';
const ACTION_SIZE = 40;
const ACTION_RADIUS = 20;
const ACTION_GAP = 12;

export interface CocktailCardProps {
  drink: CocktailDrink;
  drinkName: string;
  drinkDescription: string;
  onView?: (drink: CocktailDrink) => void;
  onEdit: (drink: CocktailDrink) => void;
  onDelete: (drink: CocktailDrink) => void;
}

const CocktailCard: React.FC<CocktailCardProps> = ({
  drink,
  drinkName,
  drinkDescription,
  onView,
  onEdit,
  onDelete,
}) => {
  const handleView = () => onView?.(drink);

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.thumbWrap}
        onPress={handleView}
        activeOpacity={onView ? 0.8 : 1}
        disabled={!onView}
      >
        {drink.image_url ? (
          <Image source={{ uri: drink.image_url }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={styles.thumbPlaceholder}>
            <Ionicons name="wine" size={28} color="#B0B0B0" />
          </View>
        )}
      </TouchableOpacity>
      <View style={styles.content}>
        {drinkName ? (
          <Text style={styles.name} numberOfLines={2}>
            {drinkName}
          </Text>
        ) : null}
        {drinkDescription ? (
          <Text style={styles.description} numberOfLines={2}>
            {drinkDescription}
          </Text>
        ) : null}
        <Text style={styles.price}>${drink.price.toFixed(2)}</Text>
      </View>
      <View style={styles.actions}>
        {onView != null && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnView]}
            onPress={handleView}
            activeOpacity={0.8}
          >
            <Ionicons name="eye-outline" size={20} color="#2C2C2C" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnEdit]}
          onPress={() => onEdit(drink)}
          activeOpacity={0.8}
        >
          <Ionicons name="pencil" size={18} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnDelete]}
          onPress={() => onDelete(drink)}
          activeOpacity={0.8}
        >
          <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: CARD_RADIUS,
    paddingVertical: CARD_PADDING_V,
    paddingHorizontal: CARD_PADDING_H,
    marginVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    overflow: 'hidden',
  },
  thumbWrap: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_RADIUS,
    backgroundColor: '#f0f0f0',
    overflow: 'hidden',
    marginRight: 12,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    paddingVertical: 4,
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
    color: '#2C2C2C',
  },
  description: {
    fontSize: 13,
    color: '#6A6A6A',
    marginTop: 4,
  },
  price: {
    fontSize: 17,
    fontWeight: '700',
    color: WINE_COLOR,
    marginTop: 10,
  },
  actions: {
    flexDirection: 'column',
    alignItems: 'center',
    marginLeft: 12,
    gap: ACTION_GAP,
  },
  actionBtn: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: ACTION_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnView: {
    backgroundColor: '#E8E8E8',
  },
  actionBtnEdit: {
    backgroundColor: WINE_COLOR,
  },
  actionBtnDelete: {
    backgroundColor: '#C45C5C',
  },
});

export default CocktailCard;
