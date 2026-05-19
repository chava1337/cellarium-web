import React from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';

type CocktailCardShellProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

const CocktailCardShell = ({ children, style }: CocktailCardShellProps) => {
  return <View style={[styles.cocktailCard, style]}>{children}</View>;
};

const styles = StyleSheet.create({
  cocktailCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'visible',
    position: 'relative',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: 520,
  },
});

export default CocktailCardShell;
