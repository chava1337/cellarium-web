import React from 'react';
import { Platform, TouchableOpacity } from 'react-native';
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
 * Chevron atrás solo en iOS, para `CellariumHeader` `leftSlot`.
 * Sin fondo, token CELLARIUM.textOnDark, área táctil vía hitSlop.
 */
export function IosHeaderBackSlot({ navigation, fallbackRoute }: IosHeaderBackSlotProps): React.ReactElement | null {
  if (Platform.OS !== 'ios') return null;

  const onPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate(fallbackRoute as never);
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
      accessibilityRole="button"
      accessibilityLabel="Volver"
    >
      <Ionicons name="chevron-back" size={22} color={CELLARIUM.textOnDark} />
    </TouchableOpacity>
  );
}
