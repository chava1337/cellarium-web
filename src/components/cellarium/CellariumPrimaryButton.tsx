import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { CELLARIUM, CELLARIUM_LAYOUT, CELLARIUM_TEXT } from '../../theme/cellariumTheme';

export interface CellariumPrimaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

const CellariumPrimaryButton: React.FC<CellariumPrimaryButtonProps> = ({
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
      <Text style={CELLARIUM_TEXT.buttonText}>{title}</Text>
    )}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  btn: {
    height: CELLARIUM_LAYOUT.buttonHeight,
    borderRadius: CELLARIUM_LAYOUT.buttonRadius,
    backgroundColor: CELLARIUM.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  disabled: {
    opacity: 0.55,
  },
});

export default CellariumPrimaryButton;
