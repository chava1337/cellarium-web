import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LanguageSelector from '../LanguageSelector';

/** Misma paleta que WineCatalogScreen para estilos extraídos sin cambiar apariencia */
const CELLARIUM_LOCAL = {
  primary: '#924048',
} as const;

export type CatalogHeaderProps = {
  headerPaddingTop: number;
  isTablet: boolean;

  branchTitle: string;
  isBranchNameConfigured: boolean;
  canEditBranchName: boolean;

  isEditingBranchName: boolean;
  branchNameInput: string;
  isSavingBranchName: boolean;

  searchVisible: boolean;
  searchText: string;
  searchInputRef: React.RefObject<TextInput | null>;

  /** Reservado para coherencia con el padre (visibilidad admin va en showAdminButton) */
  isGuest: boolean;
  showAdminButton: boolean;

  onBranchNameInputChange: (value: string) => void;
  onStartEditingBranchName: () => void;
  onCancelEditingBranchName: () => void;
  onSaveBranchName: () => void;

  onOpenSearch: () => void;
  onSearchTextChange: (value: string) => void;
  onClearSearch: () => void;

  onPressAdmin: () => void;

  t: (key: string) => string;
};

const CatalogHeader: React.FC<CatalogHeaderProps> = ({
  headerPaddingTop,
  isTablet,
  branchTitle,
  isBranchNameConfigured,
  canEditBranchName,
  isEditingBranchName,
  branchNameInput,
  isSavingBranchName,
  searchVisible,
  searchText,
  searchInputRef,
  isGuest: _isGuest,
  showAdminButton,
  onBranchNameInputChange,
  onStartEditingBranchName,
  onCancelEditingBranchName,
  onSaveBranchName,
  onOpenSearch,
  onSearchTextChange,
  onClearSearch,
  onPressAdmin,
  t,
}) => (
  <>
    <View style={[styles.headerWrapper, { paddingTop: headerPaddingTop }]}>
      <View style={styles.headerDock}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <LanguageSelector />
          </View>

          <View style={styles.headerCenter}>
            <Text
              numberOfLines={2}
              style={[
                styles.branchName,
                { fontSize: isTablet ? 22 : 18 },
                !isBranchNameConfigured && styles.branchNamePending,
              ]}
            >
              {branchTitle}
            </Text>
            {canEditBranchName &&
              (isEditingBranchName ? (
                <View style={styles.branchEditContainer}>
                  <TextInput
                    value={branchNameInput}
                    onChangeText={onBranchNameInputChange}
                    placeholder={t('catalog.restaurant_name_placeholder')}
                    style={[
                      styles.branchEditInput,
                      { maxWidth: isTablet ? 400 : '100%' },
                    ]}
                    editable={!isSavingBranchName}
                    maxLength={80}
                  />
                  <View style={styles.branchEditActions}>
                    <TouchableOpacity
                      style={[styles.branchEditButton, styles.branchEditCancel]}
                      onPress={onCancelEditingBranchName}
                      disabled={isSavingBranchName}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={styles.branchEditButtonText}>{t('catalog.cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.branchEditButton, styles.branchEditSave]}
                      onPress={onSaveBranchName}
                      disabled={isSavingBranchName}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={styles.branchEditButtonText}>
                        {isSavingBranchName ? t('catalog.saving') : t('catalog.save')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity onPress={onStartEditingBranchName} style={styles.editNameChip}>
                  <Text style={styles.editNameChipText}>
                    {isBranchNameConfigured ? t('catalog.edit_name') : t('catalog.configure_name')}
                  </Text>
                </TouchableOpacity>
              ))}
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity
              style={[
                styles.headerChipButton,
                {
                  width: isTablet ? 40 : 36,
                  height: isTablet ? 40 : 36,
                },
              ]}
              onPress={onOpenSearch}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="search" size={22} color="#3A3534" />
            </TouchableOpacity>
            {showAdminButton && (
              <TouchableOpacity
                style={[
                  styles.headerChipButton,
                  {
                    width: isTablet ? 40 : 36,
                    height: isTablet ? 40 : 36,
                  },
                ]}
                onPress={onPressAdmin}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="settings-outline" size={22} color="#3A3534" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </View>

    {searchVisible && (
      <View
        style={[
          styles.searchBarContainer,
          { paddingHorizontal: isTablet ? 20 : 16 },
        ]}
      >
        <TextInput
          ref={searchInputRef}
          style={styles.searchInput}
          placeholder={t('catalog.search_placeholder')}
          placeholderTextColor="#999"
          value={searchText}
          onChangeText={onSearchTextChange}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          onPress={onClearSearch}
          style={styles.searchClearButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close-circle" size={24} color="#3A3534" />
        </TouchableOpacity>
      </View>
    )}
  </>
);

const styles = StyleSheet.create({
  headerWrapper: {
    paddingBottom: 3,
    paddingHorizontal: 10,
  },
  headerDock: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.04)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLeft: {
    minWidth: 52,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  headerRight: {
    minWidth: 52,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
  },
  headerChipButton: {
    borderRadius: 12,
    backgroundColor: 'rgba(58, 53, 52, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(58, 53, 52, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  editNameChip: {
    marginTop: 4,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(146, 64, 72, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(146, 64, 72, 0.16)',
  },
  editNameChipText: {
    fontSize: 11,
    color: CELLARIUM_LOCAL.primary,
    fontWeight: '600',
  },
  branchName: {
    marginTop: 2,
    fontWeight: '700',
    color: CELLARIUM_LOCAL.primary,
    textAlign: 'center',
  },
  branchNamePending: {
    color: '#B22222',
    fontStyle: 'italic',
  },
  branchEditContainer: {
    marginTop: 6,
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  branchEditInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    fontSize: 16,
    color: '#333',
  },
  branchEditActions: {
    flexDirection: 'row',
    gap: 12,
  },
  branchEditButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  branchEditCancel: {
    backgroundColor: '#bbb',
  },
  branchEditSave: {
    backgroundColor: CELLARIUM_LOCAL.primary,
  },
  branchEditButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  searchInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#000',
  },
  searchClearButton: {
    marginLeft: 8,
    padding: 4,
  },
});

export default CatalogHeader;
