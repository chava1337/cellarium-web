import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { CELLARIUM, CELLARIUM_LAYOUT } from '../../theme/cellariumTheme';

export interface CellariumSecondaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  /** outline = borde primary; neutral = fondo gris suave */
  variant?: 'outline' | 'neutral';
  style?: StyleProp<ViewStyle>;
}

const CellariumSecondaryButton: React.FC<CellariumSecondaryButtonProps> = ({
  title,
  onPress,
  disabled,
  variant = 'outline',
  style,
}) => (
  <TouchableOpacity
    style={[
      styles.btn,
      variant === 'outline' ? styles.outline : styles.neutral,
      disabled && styles.disabled,
      style,
    ]}
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.85}
  >
    <Text style={[styles.text, variant === 'outline' && styles.textOutline]}>
      {title}
    </Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  btn: {
    height: CELLARIUM_LAYOUT.buttonHeight,
    borderRadius: CELLARIUM_LAYOUT.buttonRadius,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  outline: {
    backgroundColor: CELLARIUM.card,
    borderWidth: 2,
    borderColor: CELLARIUM.primary,
  },
  neutral: {
    backgroundColor: CELLARIUM.border,
    borderWidth: 0,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
    color: CELLARIUM.text,
  },
  textOutline: {
    color: CELLARIUM.primary,
  },
  disabled: {
    opacity: 0.5,
  },
});

export default CellariumSecondaryButton;
