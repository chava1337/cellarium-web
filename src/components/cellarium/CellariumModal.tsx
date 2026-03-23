import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { CELLARIUM, CELLARIUM_LAYOUT, CELLARIUM_TEXT } from '../../theme/cellariumTheme';

export interface CellariumModalProps {
  visible: boolean;
  onRequestClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** slide | fade */
  animationType?: 'none' | 'slide' | 'fade';
  /** Padding inferior extra (p. ej. insets.bottom) */
  contentPaddingBottom?: number;
  scrollable?: boolean;
  /**
   * card = centrado (overlay premium)
   * sheet = anclado abajo (Inventario / formularios largos)
   */
  presentation?: 'card' | 'sheet';
}

const CellariumModal: React.FC<CellariumModalProps> = ({
  visible,
  onRequestClose,
  title,
  subtitle,
  children,
  footer,
  animationType = 'fade',
  contentPaddingBottom = 0,
  scrollable = true,
  presentation = 'card',
}) => {
  const inner = (
    <>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {scrollable ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType={animationType}
      onRequestClose={onRequestClose}
    >
      <KeyboardAvoidingView
        style={[
          styles.overlay,
          presentation === 'sheet' && styles.overlaySheet,
        ]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            presentation === 'sheet' ? styles.sheet : styles.card,
            { paddingBottom: 20 + contentPaddingBottom },
          ]}
        >
          {inner}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  overlaySheet: {
    justifyContent: 'flex-end',
    alignItems: 'stretch',
    padding: 0,
    paddingHorizontal: 0,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '88%',
    backgroundColor: CELLARIUM.card,
    borderRadius: CELLARIUM_LAYOUT.cardRadius,
    paddingHorizontal: 20,
    paddingTop: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  sheet: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: CELLARIUM.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: CELLARIUM.text,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    ...CELLARIUM_TEXT.caption,
    textAlign: 'center',
    marginBottom: 14,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  footer: {
    marginTop: 12,
    gap: 10,
  },
});

export default CellariumModal;
