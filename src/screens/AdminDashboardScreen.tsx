// NOTA: Este archivo ha sido refactorizado SOLO en UI/estilos.
// NO se ha alterado lógica de negocio, permisos, navegación, guards ni suscripciones.
// Cambios: header compacto, sin emoticons, sin flechas, cards elegantes.

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  FlatList,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList, Branch, normalizeRole } from '../types';
import { useBranch } from '../contexts/BranchContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { checkSubscriptionFeatureByPlan } from '../utils/subscriptionPermissions';
import { getEffectivePlan, getOwnerEffectivePlan, type EffectivePlanId } from '../utils/effectivePlan';
import { mapMenuItemIdToFeatureId } from '../constants/adminMenuFeatureMap';
import { canAccessFullAdminScreens } from '../utils/rolePermissions';
import { useAdminGuard } from '../hooks/useAdminGuard';
import { PendingApprovalMessage } from '../components/PendingApprovalMessage';
import { CELLARIUM_THEME } from '../theme/cellariumTheme';

type AdminDashboardScreenNavigationProp = StackNavigationProp<RootStackParamList, 'AdminDashboard'>;
type AdminDashboardScreenRouteProp = RouteProp<RootStackParamList, 'AdminDashboard'>;

interface Props {
  navigation: AdminDashboardScreenNavigationProp;
  route: AdminDashboardScreenRouteProp;
}

// Tipo explícito para items del menú
type MenuItem = {
  id: string;
  title: string;
  subtitle: string;
  color: string;
  onPress: () => void;
  requiresOwner?: boolean;
  requiresManager?: boolean;
};

// Tokens de diseño desde tema centralizado
const UI = CELLARIUM_THEME.admin;

const AdminDashboardScreen: React.FC<Props> = ({ navigation, route }) => {
  const { status: guardStatus } = useAdminGuard({ navigation, route });
  const { currentBranch, setCurrentBranch, availableBranches } = useBranch();
  const { user, profileReady } = useAuth();
  const { t } = useLanguage();
  const [isBranchSelectorVisible, setIsBranchSelectorVisible] = useState(false);
  /** Plan del owner para gating de menú cuando el usuario es staff (gerente/supervisor/etc). Null = aún no cargado. */
  const [ownerPlanForGating, setOwnerPlanForGating] = useState<EffectivePlanId | null>(null);

  if (guardStatus === 'loading' || guardStatus === 'profile_loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa' }}>
        <ActivityIndicator size="large" color="#8B0000" />
        <Text style={{ marginTop: 12, color: '#666' }}>{guardStatus === 'profile_loading' ? (t('msg.loading') || 'Cargando perfil…') : ''}</Text>
      </View>
    );
  }
  if (guardStatus === 'pending') {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
        <PendingApprovalMessage />
      </View>
    );
  }
  if (guardStatus === 'denied') return null;

  // No calcular menú hasta que el rol esté hidratado (evita fallback a 'personal' y menú reducido)
  if (profileReady && (user?.role == null || user?.role === undefined)) {
    if (__DEV__) console.log('[AdminDashboard] waiting for role', { user_id: user?.id, 'user?.role': user?.role });
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa' }}>
        <ActivityIndicator size="large" color="#8B0000" />
        <Text style={{ marginTop: 12, color: '#666' }}>{t('msg.loading') || 'Cargando perfil…'}</Text>
      </View>
    );
  }

  const currentUserRole = normalizeRole(user?.role);
  const isOwner = profileReady && currentUserRole === 'owner';
  const isManager = profileReady && (currentUserRole === 'owner' || currentUserRole === 'gerente');

  const roleReadyForMenu = profileReady && user?.role != null;

  // Cargar plan efectivo del owner para staff (gerente, etc.) y usarlo en gating del menú
  useEffect(() => {
    if (!user || !profileReady) {
      setOwnerPlanForGating(null);
      return;
    }
    if (user.role === 'owner') {
      setOwnerPlanForGating(null);
      return;
    }
    if (user.owner_id) {
      getOwnerEffectivePlan(user).then(setOwnerPlanForGating);
    } else {
      setOwnerPlanForGating('cafe');
    }
  }, [user?.id, user?.role, user?.owner_id, profileReady]);

  const handleBranchSelect = useCallback((branch: Branch) => {
    setCurrentBranch(branch);
    setIsBranchSelectorVisible(false);
    Alert.alert(t('admin.branch_changed'), `${t('admin.branch_managing')} ${branch.name}`);
  }, [setCurrentBranch, t, setIsBranchSelectorVisible]);

  const handleWineManagement = useCallback(() => {
    navigation.navigate('WineManagement');
  }, [navigation]);

  const handleInventoryAnalytics = useCallback(() => {
    if (!currentBranch) {
      Alert.alert(t('msg.error'), t('admin.error_no_branch'));
      return;
    }
    navigation.navigate('InventoryManagement', { branchId: currentBranch.id });
  }, [currentBranch, navigation, t]);

  const handleUserManagement = useCallback(() => {
    navigation.navigate('UserManagement');
  }, [navigation]);

  const handleQrGeneration = useCallback(() => {
    navigation.navigate('QrGeneration');
  }, [navigation]);

  const handleBranchManagement = useCallback(() => {
    navigation.navigate('BranchManagement');
  }, [navigation]);

  const handleSubscriptions = useCallback(() => {
    navigation.navigate('Subscriptions');
  }, [navigation]);

  const handleGlobalWineCatalog = useCallback(() => {
    navigation.navigate('GlobalWineCatalog');
  }, [navigation]);

  const handleCocktailMenu = useCallback(() => {
    if (!currentBranch) {
      Alert.alert(t('msg.error'), t('admin.error_no_branch'));
      return;
    }
    navigation.navigate('CocktailManagement');
  }, [currentBranch, navigation, t]);

  const handleTastingExams = useCallback(() => {
    navigation.navigate('TastingExamsList');
  }, [navigation]);

  const handleSettings = useCallback(() => {
    navigation.navigate('Settings');
  }, [navigation]);

  const handleBranchPress = useCallback(() => {
    if (isOwner) {
      setIsBranchSelectorVisible(true);
    } else {
      Alert.alert(t('msg.success'), `${t('admin.branch_managing')} ${currentBranch?.name || t('admin.branch_none')}`);
    }
  }, [isOwner, currentBranch?.name, t, setIsBranchSelectorVisible]);

  const menuItems = useMemo<MenuItem[]>(() => [
    {
      id: 'global-catalog',
      title: t('admin.global_catalog'),
      subtitle: t('admin.global_catalog_sub'),
      color: '#28a745',
      onPress: handleGlobalWineCatalog,
    },
    {
      id: 'cocktail-menu',
      title: t('admin.cocktail_menu'),
      subtitle: t('admin.cocktail_menu_sub'),
      color: '#ff6b6b',
      onPress: handleCocktailMenu,
    },
    {
      id: 'wines',
      title: t('admin.scan_bottle'),
      subtitle: t('admin.scan_bottle_sub'),
      color: UI.wine1,
      onPress: handleWineManagement,
    },
    {
      id: 'inventory',
      title: t('admin.inventory'),
      subtitle: t('admin.inventory_sub'),
      color: '#17a2b8',
      onPress: handleInventoryAnalytics,
    },
    {
      id: 'qr',
      title: t('admin.qr_generation'),
      subtitle: t('admin.qr_generation_sub'),
      color: '#007bff',
      onPress: handleQrGeneration,
    },
    {
      id: 'tasting-exams',
      title: t('admin.tasting_exams'),
      subtitle: t('admin.tasting_exams_sub'),
      color: '#e83e8c',
      onPress: handleTastingExams,
    },
    {
      id: 'users',
      title: t('admin.users'),
      subtitle: t('admin.users_sub'),
      color: '#6f42c1',
      onPress: handleUserManagement,
      requiresOwner: false, // Owner y Gerente pueden acceder
      requiresManager: true, // Solo Owner y Gerente
    },
    {
      id: 'branches',
      title: t('admin.branches'),
      subtitle: t('admin.branches_sub'),
      color: '#20c997',
      onPress: handleBranchManagement,
      requiresOwner: true, // Solo Owner
    },
    {
      id: 'subscriptions',
      title: t('admin.subscriptions'),
      subtitle: t('admin.subscriptions_sub'),
      color: '#fd7e14',
      onPress: handleSubscriptions,
      requiresOwner: true, // Solo Owner
    },
    {
      id: 'settings',
      title: t('admin.settings'),
      subtitle: t('admin.settings_sub'),
      color: '#6c757d',
      onPress: handleSettings,
    },
  ], [t, handleGlobalWineCatalog, handleCocktailMenu, handleWineManagement, handleInventoryAnalytics, handleQrGeneration, handleTastingExams, handleUserManagement, handleBranchManagement, handleSubscriptions, handleSettings]);

  // Filtrar items del menú por rol (alineado con rolePermissions.ADMIN_FULL_ACCESS_ROLES)
  const filteredMenuItems = useMemo(() => {
    const hasFullMenuAccess = canAccessFullAdminScreens(currentUserRole as 'owner' | 'gerente' | 'sommelier' | 'supervisor' | 'personal');
    const filtered = menuItems.filter(item => {
      // Solo personal tiene menú reducido (Catas + Configuración). Supervisor, sommelier, gerente y owner ven el resto según requiresOwner/requiresManager.
      if (!hasFullMenuAccess) {
        return item.id === 'tasting-exams' || item.id === 'settings';
      }
      if (item.requiresOwner && !isOwner) return false;
      if (item.requiresManager && !isManager) return false;
      return true;
    });
    if (__DEV__) {
      const menuReducedToTwo = filtered.length === 2 && filtered.every(i => i.id === 'tasting-exams' || i.id === 'settings');
      console.log('[AdminDashboard] menu role check', {
        user_id: user?.id,
        user_email: user?.email,
        'user?.role': user?.role,
        currentUserRole,
        profileReady,
        roleReadyForMenu,
        hasFullMenuAccess,
        MENU_REDUCED_REASON: !hasFullMenuAccess ? `hasFullMenuAccess=false (currentUserRole=${currentUserRole})` : null,
        menuItemIdsBefore: menuItems.map(i => i.id),
        menuItemIdsAfter: filtered.map(i => i.id),
        menuReducedToTwo,
      });
    }
    return filtered;
  }, [menuItems, currentUserRole, isOwner, isManager, user?.id, user?.email, user?.role, profileReady, roleReadyForMenu]);

  // Precalcular features bloqueadas para optimizar render (solo items visibles).
  // Owner: plan de su propia fila. Staff: plan del owner (ownerPlanForGating); si aún no cargó, tratamos como 'cafe'.
  const blockedFeatureIds = useMemo(() => {
    const set = new Set<string>();
    const effectivePlan: EffectivePlanId = isOwner
      ? getEffectivePlan(user)
      : (ownerPlanForGating ?? 'cafe');
    for (const item of filteredMenuItems) {
      const featureId = mapMenuItemIdToFeatureId(item.id);
      if (featureId) {
        const blocked = !checkSubscriptionFeatureByPlan(effectivePlan, featureId);
        if (blocked) set.add(item.id);
      }
    }
    return set;
  }, [user, isOwner, ownerPlanForGating, filteredMenuItems]);

  // Staff: ocultar ítems cuyo feature está bloqueado por plan del owner (p. ej. free → sin inventario/tastings).
  // Owner: ver todas las tarjetas; las bloqueadas muestran candado en renderMenuItem.
  const visibleMenuItems = useMemo(() => {
    if (isOwner) return filteredMenuItems;
    return filteredMenuItems.filter((item) => !blockedFeatureIds.has(item.id));
  }, [isOwner, filteredMenuItems, blockedFeatureIds]);

  // Renderizar item del menú
  const renderMenuItem = useCallback(({ item }: { item: MenuItem }) => {
    const isBlocked = blockedFeatureIds.has(item.id);

    return (
      <TouchableOpacity
        style={[styles.menuItem, { borderLeftColor: item.color }]}
        onPress={() => {
          if (isBlocked) {
            Alert.alert(
              t('admin.feature_locked'),
              t('admin.feature_locked_msg'),
              [
                { text: t('btn.cancel'), style: 'cancel' },
                {
                  text: t('admin.view_plans'),
                  onPress: () => navigation.navigate('Subscriptions'),
                },
              ]
            );
          } else {
            item.onPress();
          }
        }}
        accessibilityRole="button"
        accessibilityLabel={item.title}
        accessibilityHint={isBlocked ? t('admin.feature_locked_msg') : item.subtitle}
      >
        <View style={styles.menuItemContent}>
          {/* Texto sin icono */}
          <View style={styles.menuText}>
            <Text style={styles.menuItemTitle}>
              {item.title}
            </Text>
            <Text 
              style={[styles.menuItemSubtitle, isBlocked && styles.menuItemSubtitleBlocked]}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {isBlocked ? t('admin.requires_subscription') : item.subtitle}
            </Text>
          </View>
          
          {/* Acción derecha: solo lock si está bloqueado */}
          {isBlocked && (
            <View style={styles.lockPill}>
              <Text style={styles.lockIcon}>🔒</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [blockedFeatureIds, t, navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header con gradiente burdeos - compacto */}
      <LinearGradient
        colors={[UI.wine2, UI.wine1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.headerGradient}
      >
        <View style={styles.headerContent}>
          <Text style={styles.title}>{t('admin.title')}</Text>
        </View>
        
        {/* Selector de sucursal como field premium */}
        <TouchableOpacity
          style={styles.branchSelector}
          onPress={handleBranchPress}
          accessibilityRole="button"
          accessibilityLabel={isOwner ? t('admin.branch_change') : t('admin.branch_current')}
          accessibilityHint={isOwner ? t('admin.branch_select') : t('admin.branch_managing')}
        >
          <View style={styles.branchInfo}>
            <Text 
              style={styles.branchName}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {currentBranch?.name || t('admin.branch_none')}
            </Text>
          </View>
          <View style={styles.branchRight}>
            <View style={styles.branchBadge}>
              <Text style={styles.branchBadgeText}>
                {isOwner ? t('admin.branch_change') : t('admin.branch_readonly')}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </LinearGradient>

      {/* Modal selector de sucursal (solo para Owner) */}
      {isOwner && (
        <Modal
          visible={isBranchSelectorVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setIsBranchSelectorVisible(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setIsBranchSelectorVisible(false)}
            accessibilityRole="button"
            accessibilityLabel={t('admin.close_modal')}
          >
            <View
              style={styles.branchSelectorModal}
              onStartShouldSetResponder={() => true}
              accessible
              accessibilityLabel={t('admin.branch_select')}
            >
              <Text style={styles.modalTitle}>{t('admin.branch_select')}</Text>
              <FlatList
                data={availableBranches}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.branchItem,
                      currentBranch?.id === item.id && styles.branchItemActive
                    ]}
                    onPress={() => handleBranchSelect(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('admin.branch_select')}: ${item.name}`}
                    accessibilityHint={currentBranch?.id === item.id ? t('admin.branch_changed') : ''}
                  >
                    <View>
                      <Text style={[
                        styles.branchItemName,
                        currentBranch?.id === item.id && styles.branchItemNameActive
                      ]}>
                        {item.name}
                      </Text>
                      <Text style={styles.branchItemAddress}>{item.address}</Text>
                    </View>
                    {currentBranch?.id === item.id && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </TouchableOpacity>
                )}
                showsVerticalScrollIndicator={false}
              />
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Menú principal */}
      <FlatList
        data={visibleMenuItems}
        keyExtractor={(item) => item.id}
        renderItem={renderMenuItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.menuListContent}
        ListHeaderComponent={
          <Text style={styles.menuTitle}>{t('admin.menu_title')}</Text>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI.bg,
  },
  headerGradient: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  headerContent: {
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  // Selector de sucursal como field premium
  branchSelector: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  branchInfo: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 18,
    paddingRight: 12,
  },
  branchName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'left',
  },
  branchRight: {
    marginLeft: 12,
  },
  branchBadge: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  branchBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  // Estilos del modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  branchSelectorModal: {
    backgroundColor: UI.card,
    borderRadius: 20,
    padding: 18,
    maxHeight: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: UI.text,
    marginBottom: 18,
    textAlign: 'center',
  },
  branchItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: UI.bg,
    marginBottom: 10,
  },
  branchItemActive: {
    backgroundColor: 'rgba(90, 31, 43, 0.08)',
    borderWidth: 1.5,
    borderColor: UI.wine1,
  },
  branchItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: UI.text,
    marginBottom: 4,
  },
  branchItemNameActive: {
    color: UI.wine1,
    fontWeight: '700',
  },
  branchItemAddress: {
    fontSize: 12,
    color: UI.subtext,
  },
  checkmark: {
    fontSize: 20,
    color: UI.wine1,
    fontWeight: 'bold',
  },
  menuListContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  menuTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: UI.text,
    marginBottom: 20,
    marginTop: 8,
  },
  menuItem: {
    backgroundColor: UI.card,
    borderRadius: 18,
    marginBottom: 14,
    borderLeftWidth: 5,
    shadowColor: UI.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  menuItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    paddingVertical: 12,
  },
  menuText: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: UI.text,
    marginBottom: 5,
  },
  menuItemSubtitle: {
    fontSize: 13,
    color: UI.subtext,
    lineHeight: 18,
  },
  menuItemSubtitleBlocked: {
    color: UI.warning,
    fontWeight: '500',
  },
  lockPill: {
    backgroundColor: UI.graphite,
    borderRadius: 18,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  lockIcon: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

export default AdminDashboardScreen;
