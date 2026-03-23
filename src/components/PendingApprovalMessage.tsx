import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CELLARIUM } from '../theme/cellariumTheme';

export function PendingApprovalMessage() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pendiente de aprobación</Text>
      <Text style={styles.subtitle}>
        Tu cuenta está en revisión. Un administrador debe aprobarte para acceder a esta sección.
      </Text>
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
