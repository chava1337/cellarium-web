import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { CELLARIUM, CELLARIUM_LAYOUT } from '../../theme/cellariumTheme';

export interface CellariumDangerButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

const CellariumDangerButton: React.FC<CellariumDangerButtonProps> = ({
  title,
  onPress,
  disabled,
  loading,
  style,
}) => (
  <TouchableOpacity
    style={[styles.btn, (disabled || loading) && styles.disabled, style]}
    onPress={onPress}
    disabled={disabled || loading}
    activeOpacity={0.85}
  >
    {loading ? (
      <ActivityIndicator color="#fff" />
    ) : (
      <Text style={styles.text}>{title}</Text>
    )}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  btn: {
    height: CELLARIUM_LAYOUT.buttonHeight,
    borderRadius: CELLARIUM_LAYOUT.buttonRadius,
    backgroundColor: CELLARIUM.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  disabled: {
    opacity: 0.55,
  },
});

export default CellariumDangerButton;
