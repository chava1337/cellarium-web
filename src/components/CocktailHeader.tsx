/**
 * Header premium para Menú de Coctelería — estilo Catálogo
 * Gradiente vino, título, subtítulo con count, botón + flotante
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CELLARIUM, CELLARIUM_GRADIENT } from '../theme/cellariumTheme';

export interface CocktailHeaderProps {
  title: string;
  subtitle: string;
  onAddPress: () => void;
}

const ADD_BUTTON_SIZE = 36;
const PLACEHOLDER_WIDTH = ADD_BUTTON_SIZE;

const CocktailHeader: React.FC<CocktailHeaderProps> = ({ title, subtitle, onAddPress }) => {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={[...CELLARIUM_GRADIENT]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[styles.gradient, { paddingTop: Math.max(insets.top, 16) }]}
    >
      <View style={styles.inner}>
        <View style={[styles.placeholder, { width: PLACEHOLDER_WIDTH }]} />
        <View style={styles.center}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={onAddPress}
          activeOpacity={0.85}
          accessibilityLabel="Agregar bebida"
        >
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingBottom: 20,
    paddingHorizontal: 20,
    ...(Platform.OS === 'android' && { overflow: 'hidden' }),
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  placeholder: {
    height: ADD_BUTTON_SIZE,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: CELLARIUM.textOnDark,
    marginBottom: 4,
    textAlign: 'center',
    lineHeight: 30,
  },
  subtitle: {
    fontSize: 14,
    color: CELLARIUM.textOnDarkMuted,
    textAlign: 'center',
  },
  addButton: {
    width: ADD_BUTTON_SIZE,
    height: ADD_BUTTON_SIZE,
    borderRadius: ADD_BUTTON_SIZE / 2,
    backgroundColor: CELLARIUM.chipActiveBg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
});

export default CocktailHeader;
