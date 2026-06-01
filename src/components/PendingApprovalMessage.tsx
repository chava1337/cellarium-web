import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CELLARIUM } from '../theme/cellariumTheme';
import { useLanguage } from '../contexts/LanguageContext';

export function PendingApprovalMessage() {
  const { t } = useLanguage();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('common.pending_approval_title')}</Text>
      <Text style={styles.subtitle}>{t('common.pending_approval_body')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: CELLARIUM.bg,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: CELLARIUM.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: CELLARIUM.muted,
    textAlign: 'center',
  },
});
