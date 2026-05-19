import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { WINE_TYPES, type WineType } from '../../constants/wineTypeUi';

const CELLARIUM = {
  primary: '#924048',
  primaryDark: '#6f2f37',
  primaryDarker: '#4e2228',
  textOnDark: 'rgba(255,255,255,0.92)',
  textOnDarkMuted: 'rgba(255,255,255,0.75)',
  chipActiveBg: 'rgba(255,255,255,0.14)',
  chipBorder: 'rgba(255,255,255,0.16)',
} as const;

export type CatalogFilterItem = {
  key: string;
  label: string;
};

export type CatalogFilterBarProps = {
  items: ReadonlyArray<CatalogFilterItem>;
  activeKey: string;
  isTablet: boolean;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  onSelect: (key: string) => void;
  onListLayout: (event: LayoutChangeEvent) => void;
  onContentSizeChange: (contentWidth: number) => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
};

const FilterChip = ({
  item,
  active,
  onPress,
  isTablet,
}: {
  item: CatalogFilterItem;
  active: boolean;
  onPress: () => void;
  isTablet: boolean;
}) => {
  const isWineTypeChip = WINE_TYPES.includes(item.key as WineType);
  const baseMinWidth = isTablet ? 120 : 110;
  const chipMinWidth = isWineTypeChip ? baseMinWidth + (isTablet ? 4 : 4) : baseMinWidth;
  const borderRadius = isTablet ? 18 : 16;
  const paddingVertical = isTablet ? 14 : 10;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        styles.filterChipTextOnly,
        active && styles.filterChipActive,
        {
          minWidth: chipMinWidth,
          borderRadius,
          paddingVertical,
          transform: pressed ? [{ scale: 0.98 }] : [],
          opacity: pressed ? 0.95 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.filterChipLabelPremium,
          active && styles.filterChipLabelPremiumActive,
          { fontSize: isTablet ? 20 : 18, lineHeight: isTablet ? 24 : 22 },
        ]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {item.label}
      </Text>
    </Pressable>
  );
};

const CatalogFilterBar: React.FC<CatalogFilterBarProps> = ({
  items,
  activeKey,
  isTablet,
  canScrollLeft,
  canScrollRight,
  onSelect,
  onListLayout,
  onContentSizeChange,
  onScroll,
}) => (
  <View style={styles.filterBarOuter}>
    <LinearGradient
      colors={[CELLARIUM.primaryDarker, CELLARIUM.primary, CELLARIUM.primaryDark]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.filterBarGradient}
    >
      <FlatList
        horizontal
        data={items as CatalogFilterItem[]}
        keyExtractor={(item) => item.key}
        showsHorizontalScrollIndicator={false}
        onLayout={onListLayout}
        onContentSizeChange={onContentSizeChange}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[
          styles.filterBarContent,
          { paddingHorizontal: isTablet ? 18 : 14 },
        ]}
        ItemSeparatorComponent={() => <View style={{ width: isTablet ? 12 : 10 }} />}
        renderItem={({ item }) => (
          <FilterChip
            item={item}
            active={activeKey === item.key}
            onPress={() => onSelect(item.key)}
            isTablet={isTablet}
          />
        )}
      />
      {canScrollLeft && (
        <View style={[styles.filterBarScrollHint, styles.filterBarScrollHintLeft]} pointerEvents="none">
          <Ionicons name="chevron-back" size={16} color="rgba(255,255,255,0.92)" />
        </View>
      )}
      {canScrollRight && (
        <View style={[styles.filterBarScrollHint, styles.filterBarScrollHintRight]} pointerEvents="none">
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.92)" />
        </View>
      )}
    </LinearGradient>
  </View>
);

const styles = StyleSheet.create({
  filterBarOuter: {
    marginTop: 6,
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  filterBarGradient: {
    position: 'relative',
    borderRadius: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  filterBarScrollHint: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBarScrollHintLeft: {
    left: 10,
  },
  filterBarScrollHintRight: {
    right: 10,
  },
  filterBarContent: {
    paddingVertical: 2,
    alignItems: 'center',
  },
  filterChip: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterChipTextOnly: {
    paddingHorizontal: 14,
  },
  filterChipLabelPremium: {
    fontFamily: 'Cormorant_600SemiBold_Italic',
    color: CELLARIUM.textOnDarkMuted,
    textAlign: 'center',
  },
  filterChipLabelPremiumActive: {
    color: CELLARIUM.textOnDark,
  },
  filterChipActive: {
    backgroundColor: CELLARIUM.chipActiveBg,
    borderColor: CELLARIUM.chipBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
});

export default CatalogFilterBar;
