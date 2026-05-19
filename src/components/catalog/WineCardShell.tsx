import React from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp, type ViewProps } from 'react-native';

type WineCardShellProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
} & Pick<ViewProps, 'onLayout'>;

const WineCardShell = ({ children, style, onLayout }: WineCardShellProps) => {
  return (
    <View style={[styles.wineCard, style]} onLayout={onLayout}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  wineCard: {
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

export default WineCardShell;
