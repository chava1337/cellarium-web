import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../types';
import { CELLARIUM } from '../../theme/cellariumTheme';

export type IosHeaderBackNavigationProp = StackNavigationProp<RootStackParamList>;

export interface IosHeaderBackSlotProps {
  navigation: IosHeaderBackNavigationProp;
  /** Ruta si el stack no permite goBack() */
  fallbackRoute: keyof RootStackParamList;
}

/**
 * Chevron de regreso cross-platform para `CellariumHeader` `leftSlot`.
 * Mantiene la estética actual y asegura área táctil mínima 44x44.
 */
export function IosHeaderBackSlot({ navigation, fallbackRoute }: IosHeaderBackSlotProps): React.ReactElement | null {
  const onPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate(fallbackRoute as never);
    }
  };

  return (
    <TouchableOpacity
      style={styles.touchTarget}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel="Volver"
    >
      <Ionicons name="chevron-back" size={22} color={CELLARIUM.textOnDark} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touchTarget: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
