import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CELLARIUM, CELLARIUM_LAYOUT } from '../../theme/cellariumTheme';

export type InventoryViewMode = 'stock' | 'sales' | 'comparison' | 'reports';

export interface InventoryAnalyticsTabsProps {
  viewMode: InventoryViewMode;
  onChangeMode: (m: InventoryViewMode) => void;
  canCompareBranches: boolean;
}

const InventoryAnalyticsTabs: React.FC<InventoryAnalyticsTabsProps> = ({
  viewMode,
  onChangeMode,
  canCompareBranches,
}) => (
  <View style={styles.outer}>
    <View style={styles.inner}>
      <TouchableOpacity
        style={[styles.tab, viewMode === 'stock' && styles.tabActive]}
        onPress={() => onChangeMode('stock')}
      >
        <Text style={[styles.tabText, viewMode === 'stock' && styles.tabTextActive]}>Inventario</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, viewMode === 'sales' && styles.tabActive]}
        onPress={() => onChangeMode('sales')}
      >
        <Text style={[styles.tabText, viewMode === 'sales' && styles.tabTextActive]}>Ventas estimadas</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.tab,
          viewMode === 'comparison' && styles.tabActive,
          !canCompareBranches && styles.tabDisabled,
        ]}
        onPress={() => canCompareBranches && onChangeMode('comparison')}
        disabled={!canCompareBranches}
      >
        <Text
          style={[
            styles.tabText,
            viewMode === 'comparison' && styles.tabTextActive,
            !canCompareBranches && styles.tabTextDisabled,
          ]}
        >
          Comparar
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, viewMode === 'reports' && styles.tabActive]}
        onPress={() => onChangeMode('reports')}
      >
        <Text style={[styles.tabText, viewMode === 'reports' && styles.tabTextActive]}>Reportes</Text>
      </TouchableOpacity>
    </View>
  </View>
);

const styles = StyleSheet.create({
  outer: {
    marginHorizontal: CELLARIUM_LAYOUT.screenPadding,
    marginTop: 12,
    height: 54,
    borderRadius: 28,
    backgroundColor: CELLARIUM.card,
    overflow: 'hidden',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: '100%',
    paddingHorizontal: 6,
  },
  tab: {
    flex: 1,
    paddingHorizontal: 6,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 0,
  },
  tabActive: {
    backgroundColor: 'rgba(146,64,72,0.12)',
  },
  tabDisabled: {
    opacity: 0.4,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: CELLARIUM.muted,
    textAlign: 'center',
  },
  tabTextActive: {
    color: CELLARIUM.primary,
  },
  tabTextDisabled: {
    color: '#999',
  },
});

export default InventoryAnalyticsTabs;
