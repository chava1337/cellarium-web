import React from 'react';
import { View, Text, TextInput, TextInputProps, StyleSheet } from 'react-native';
import { CELLARIUM, CELLARIUM_LAYOUT, CELLARIUM_TEXT } from '../../theme/cellariumTheme';

export interface CellariumTextFieldProps extends TextInputProps {
  label?: string;
  containerStyle?: object;
}

const CellariumTextField: React.FC<CellariumTextFieldProps> = ({
  label,
  style,
  containerStyle,
  placeholderTextColor = CELLARIUM.muted,
  ...inputProps
}) => (
  <View style={containerStyle}>
    {label ? <Text style={CELLARIUM_TEXT.label}>{label}</Text> : null}
    <TextInput
      style={[styles.input, style]}
      placeholderTextColor={placeholderTextColor}
      {...inputProps}
    />
  </View>
);

const styles = StyleSheet.create({
  input: {
    minHeight: CELLARIUM_LAYOUT.inputHeight,
    backgroundColor: CELLARIUM.card,
    borderWidth: 1,
    borderColor: CELLARIUM.border,
    borderRadius: CELLARIUM_LAYOUT.inputRadius,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: CELLARIUM.text,
  },
});

export default CellariumTextField;
