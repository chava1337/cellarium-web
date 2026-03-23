import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { CELLARIUM, CELLARIUM_LAYOUT } from '../../theme/cellariumTheme';

export interface CellariumCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Padding interno; por defecto screenPadding */
  padding?: number;
}

const CellariumCard: React.FC<CellariumCardProps> = ({
  children,
  style,
  padding = CELLARIUM_LAYOUT.screenPadding,
}) => (
  <View style={[styles.card, { padding }, style]}>{children}</View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: CELLARIUM.card,
    borderRadius: CELLARIUM_LAYOUT.cardRadius,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
});

export default CellariumCard;
