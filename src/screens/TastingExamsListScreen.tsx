import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CellariumHeader, IosHeaderBackSlot } from '../components/cellarium';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { useLanguage } from '../contexts/LanguageContext';
import { TastingExamService, TastingExam } from '../services/TastingExamService';
import { canCreateTastingExam, canManageTastingExams } from '../utils/rolePermissions';
import { getEffectivePlan, getOwnerEffectivePlan } from '../utils/effectivePlan';
import { checkSubscriptionFeatureByPlan } from '../utils/subscriptionPermissions';
import { getAppLocaleTag } from '../utils/appLocale';

type TastingExamsListScreenNavigationProp = StackNavigationProp<RootStackParamList, 'TastingExamsList'>;

interface Props {
  navigation: TastingExamsListScreenNavigationProp;
}

const FEATURE_ID_TASTINGS = 'tastings' as const;

const CELLARIUM = {
  primary: '#924048',
  primaryDark: '#6f2f37',
  primaryDarker: '#4e2228',
  textOnDark: 'rgba(255,255,255,0.92)',
  textOnDarkMuted: 'rgba(255,255,255,0.75)',
  bg: '#F4F4F6',
  card: '#FFFFFF',
  muted: '#6A6A6A',
  border: '#E5E5E8',
} as const;

const UI = {
  screenPadding: 16,
  cardRadius: 18,
  cardPadding: 16,
  cardGap: 14,
  buttonHeight: 50,
  buttonRadius: 14,
  chipRadius: 14,
} as const;

const TastingExamsListScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { currentBranch } = useBranch();
  const { t, language } = useLanguage();
  const [subscriptionAllowed, setSubscriptionAllowed] = useState<'pending' | true | false>('pending');
  const alertedBlockedRef = useRef(false);
  const [exams, setExams] = useState<TastingExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExam, setSelectedExam] = useState<TastingExam | null>(null);
  const [isActionModalVisible, setIsActionModalVisible] = useState(false);
  const [actionType, setActionType] = useState<'enable' | 'disable' | 'delete' | null>(null);
  const [durationModalVisible, setDurationModalVisible] = useState(false);

  const canCreateExam = canCreateTastingExam(user?.role as 'owner' | 'gerente' | 'sommelier' | 'supervisor' | 'personal');
  const canManageExam = canManageTastingExams(user?.role as 'owner' | 'gerente' | 'sommelier' | 'supervisor' | 'personal');

  useEffect(() => {
    if (!user) {
      setSubscriptionAllowed(false);
      navigation.replace('AdminDashboard');
      return;
    }
    let cancelled = false;
    const run = async () => {
      const plan = user.role === 'owner'
        ? getEffectivePlan(user)
        : await getOwnerEffectivePlan(user);
      if (cancelled) return;
      const allowed = checkSubscriptionFeatureByPlan(plan, FEATURE_ID_TASTINGS);
      if (!allowed) {
        setSubscriptionAllowed(false);
        navigation.replace('AdminDashboard');
        if (!alertedBlockedRef.current) {
          alertedBlockedRef.current = true;
          Alert.alert(t('subscription.feature_blocked'), undefined, [{ text: 'OK' }]);
        }
      } else {
        setSubscriptionAllowed(true);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [user?.id, user?.role, navigation, t]);

  useEffect(() => {
    loadExams();
  }, [currentBranch, user]);

  // Recargar exámenes cuando la pantalla vuelve a enfocarse
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (user && currentBranch) {
        loadExams();
      }
    });
    return unsubscribe;
  }, [navigation, user, currentBranch]);

  const loadExams = async () => {
    if (!currentBranch || !user) return;

    try {
      setLoading(true);
      const ownerId = user.owner_id || user.id;
      const examsData = await TastingExamService.getExamsByBranch(currentBranch.id, ownerId);
      setExams(examsData);
    } catch (error: any) {
      console.error('Error loading exams:', error);
      Alert.alert(t('common.error'), error.message || t('tasting.error_load'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateExam = () => {
    if (!canCreateExam) {
      Alert.alert(t('tasting.no_permission_title'), t('tasting.no_permission_create'));
      return;
    }
    navigation.navigate('CreateTastingExam');
  };

  const handleEnableExam = (exam: TastingExam) => {
    if (!canManageExam) return;
    setSelectedExam(exam);
    setActionType('enable');
    setDurationModalVisible(true);
  };

  const handleDisableExam = (exam: TastingExam) => {
    if (!canManageExam) return;
    setSelectedExam(exam);
    setActionType('disable');
    setIsActionModalVisible(true);
  };

  const handleDeleteExam = (exam: TastingExam) => {
    if (!canManageExam) return;
    setSelectedExam(exam);
    setActionType('delete');
    setIsActionModalVisible(true);
  };

  const confirmAction = async () => {
    if (!selectedExam || !user || !currentBranch) return;

    try {
      const ownerId = user.owner_id || user.id;

      if (actionType === 'disable') {
        await TastingExamService.disableExam({ examId: selectedExam.id, ownerId });
        Alert.alert(t('msg.success'), t('tasting.success_disabled'));
        setIsActionModalVisible(false);
        setSelectedExam(null);
        setActionType(null);
        loadExams();
      } else if (actionType === 'delete') {
        await TastingExamService.deleteExam({ examId: selectedExam.id, ownerId });
        Alert.alert(t('msg.success'), t('tasting.success_deleted'));
        setIsActionModalVisible(false);
        setSelectedExam(null);
        setActionType(null);
        loadExams();
      }
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message || t('tasting.error_action'));
      setIsActionModalVisible(false);
      setSelectedExam(null);
      setActionType(null);
    }
  };

  const handleDurationSelect = async (durationHours: 1 | 3 | 6) => {
    if (!selectedExam || !user || !currentBranch) return;

    try {
      const ownerId = user.owner_id || user.id;
      Alert.alert(
        t('tasting.enable_title'),
        t('tasting.enable_confirm')
          .replace('{name}', selectedExam.name)
          .replace('{hours}', String(durationHours)),
        [
          { text: t('btn.cancel'), style: 'cancel' },
          {
            text: t('tasting.enable'),
            onPress: async () => {
              await TastingExamService.enableExam({
                examId: selectedExam.id,
                ownerId,
                durationHours,
              });
              Alert.alert(
                t('msg.success'),
                t('tasting.success_enabled').replace('{hours}', String(durationHours))
              );
              setDurationModalVisible(false);
              loadExams();
            },
          },
        ]
      );
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message || t('tasting.error_enable'));
    }
  };

  const handleTakeExam = async (exam: TastingExam) => {
    if (!user) return;

    // Verificar si el examen está disponible
    const isAvailable = await TastingExamService.isExamAvailable(exam.id, user.id);
    if (!isAvailable) {
      Alert.alert(t('tasting.unavailable_title'), t('tasting.unavailable_body'));
      return;
    }

    navigation.navigate('TakeTastingExam', { examId: exam.id });
  };

  const handleViewResults = (exam: TastingExam) => {
    if (!canManageExam) return;
    navigation.navigate('TastingExamResults', { examId: exam.id });
  };

  const getExamStatus = (exam: TastingExam): { text: string; color: string } => {
    if (exam.permanently_disabled) {
      return { text: t('tasting.status_permanent'), color: '#b91c1c' };
    }
    if (!exam.enabled) {
      return { text: t('tasting.status_disabled'), color: CELLARIUM.muted };
    }
    if (exam.enabled_until) {
      const until = new Date(exam.enabled_until);
      const now = new Date();
      if (until < now) {
        return { text: t('tasting.status_expired'), color: '#b45309' };
      }
      const hoursLeft = Math.ceil((until.getTime() - now.getTime()) / (1000 * 60 * 60));
      return {
        text: t('tasting.status_enabled_hours').replace('{hours}', String(hoursLeft)),
        color: CELLARIUM.primary,
      };
    }
    return { text: t('tasting.status_enabled'), color: CELLARIUM.primary };
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return t('common.na');
    const date = new Date(dateString);
    return date.toLocaleDateString(getAppLocaleTag(language), {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const examSubtitle =
    exams.length === 1
      ? t('tasting.subtitle_one').replace('{count}', String(exams.length))
      : t('tasting.subtitle_many').replace('{count}', String(exams.length));

  if (subscriptionAllowed === 'pending') {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={CELLARIUM.primary} />
        </View>
      </SafeAreaView>
    );
  }
  if (subscriptionAllowed === false) {
    return null;
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <CellariumHeader
          title={t('tasting.title')}
          subtitle={t('tasting.loading')}
          leftSlot={<IosHeaderBackSlot navigation={navigation} fallbackRoute="AdminDashboard" />}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={CELLARIUM.primary} />
          <Text style={styles.loadingText}>{t('tasting.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <CellariumHeader
        title={t('tasting.title')}
        subtitle={examSubtitle}
        leftSlot={<IosHeaderBackSlot navigation={navigation} fallbackRoute="AdminDashboard" />}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) }}
        showsVerticalScrollIndicator={false}
      >
        {canCreateExam && (
          <TouchableOpacity style={styles.createButton} onPress={handleCreateExam} activeOpacity={0.85}>
            <Text style={styles.createButtonText}>{t('tasting.create_new')}</Text>
          </TouchableOpacity>
        )}

        {/* Lista de exámenes */}
        {exams.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('tasting.empty_title')}</Text>
            {canCreateExam && (
              <Text style={styles.emptySubtext}>{t('tasting.empty_subtitle')}</Text>
            )}
          </View>
        ) : (
          exams.map((exam) => {
            const status = getExamStatus(exam);
            const isAvailable = exam.enabled && !exam.permanently_disabled && 
              (!exam.enabled_until || new Date(exam.enabled_until) > new Date());

            return (
              <View key={exam.id} style={styles.examCard}>
                <View style={styles.examHeader}>
                  <View style={styles.examTitleContainer}>
                    <Text style={styles.examName}>{exam.name}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: status.color + '20' }]}>
                      <Text style={[styles.statusText, { color: status.color }]}>
                        {status.text}
                      </Text>
                    </View>
                  </View>
                  {exam.description && (
                    <Text style={styles.examDescription}>{exam.description}</Text>
                  )}
                </View>

                <View style={styles.examInfo}>
                  <Text style={styles.examInfoText}>
                    {(exam.wines_count || 0) === 1
                      ? t('tasting.wine_one').replace('{count}', String(exam.wines_count || 0))
                      : t('tasting.wine_many').replace('{count}', String(exam.wines_count || 0))}
                  </Text>
                  <Text style={styles.examInfoText}>
                    {t('tasting.created')} {formatDate(exam.created_at)}
                  </Text>
                  {exam.enabled_until && (
                    <Text style={styles.examInfoText}>
                      {t('tasting.expires')} {formatDate(exam.enabled_until)}
                    </Text>
                  )}
                  {exam.permanently_disabled && exam.disabled_reason && (
                    <Text style={[styles.examInfoText, styles.warningText]}>
                      {exam.disabled_reason}
                    </Text>
                  )}
                </View>

                <View style={styles.examActions}>
                  {/* Botón realizar examen (todos los usuarios si está disponible) */}
                  {isAvailable && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.takeButton]}
                      onPress={() => handleTakeExam(exam)}
                    >
                      <Text style={styles.actionButtonText}>{t('tasting.take_exam')}</Text>
                    </TouchableOpacity>
                  )}

                  {/* Botones de gestión (solo owners, gerentes, sommeliers) */}
                  {canManageExam && (
                    <>
                      {!exam.enabled && !exam.permanently_disabled && (
                        <TouchableOpacity
                          style={[styles.actionButton, styles.enableButton]}
                          onPress={() => handleEnableExam(exam)}
                        >
                          <Text style={styles.actionButtonText}>{t('tasting.enable')}</Text>
                        </TouchableOpacity>
                      )}
                      {exam.enabled && !exam.permanently_disabled && (
                        <TouchableOpacity
                          style={[styles.actionButton, styles.disableButton]}
                          onPress={() => handleDisableExam(exam)}
                        >
                          <Text style={styles.actionButtonText}>{t('tasting.disable')}</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[styles.actionButton, styles.resultsButton]}
                        onPress={() => handleViewResults(exam)}
                      >
                        <Text style={styles.actionButtonText}>{t('tasting.view_results')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.deleteButton]}
                        onPress={() => handleDeleteExam(exam)}
                      >
                        <Text style={styles.actionButtonText}>{t('tasting.delete')}</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Modal de confirmación para deshabilitar/eliminar */}
      <Modal
        visible={isActionModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setIsActionModalVisible(false);
          setSelectedExam(null);
          setActionType(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {actionType === 'delete' ? t('tasting.modal_delete_title') : t('tasting.modal_disable_title')}
            </Text>
            <Text style={styles.modalSubtitle}>
              {actionType === 'delete'
                ? t('tasting.modal_delete_body').replace('{name}', selectedExam?.name ?? '')
                : t('tasting.modal_disable_body').replace('{name}', selectedExam?.name ?? '')}
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton, actionType === 'delete' && styles.deleteConfirmButton]}
                onPress={confirmAction}
              >
                <Text style={styles.modalButtonText}>
                  {actionType === 'delete' ? t('tasting.delete') : t('tasting.disable')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelModalButton]}
                onPress={() => {
                  setIsActionModalVisible(false);
                  setSelectedExam(null);
                  setActionType(null);
                }}
              >
                <Text style={[styles.modalButtonText, styles.cancelModalText]}>{t('btn.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de duración para habilitar */}
      <Modal
        visible={durationModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setDurationModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('tasting.duration_title')}</Text>
            <Text style={styles.modalSubtitle}>{t('tasting.duration_subtitle')}</Text>
            <TouchableOpacity
              style={styles.durationOption}
              onPress={() => handleDurationSelect(1)}
            >
              <Text style={styles.durationText}>{t('tasting.duration_1h')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.durationOption}
              onPress={() => handleDurationSelect(3)}
            >
              <Text style={styles.durationText}>{t('tasting.duration_3h')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.durationOption}
              onPress={() => handleDurationSelect(6)}
            >
              <Text style={styles.durationText}>{t('tasting.duration_6h')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.durationOption, styles.cancelOption]}
              onPress={() => setDurationModalVisible(false)}
            >
              <Text style={[styles.durationText, styles.cancelText]}>{t('btn.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CELLARIUM.bg,
  },
  content: {
    flex: 1,
    padding: UI.screenPadding,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: CELLARIUM.muted,
  },
  createButton: {
    backgroundColor: CELLARIUM.primary,
    borderRadius: UI.buttonRadius,
    height: UI.buttonHeight,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: CELLARIUM.card,
    borderRadius: UI.cardRadius,
  },
  emptyText: {
    fontSize: 17,
    color: CELLARIUM.muted,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 13,
    color: CELLARIUM.muted,
    textAlign: 'center',
  },
  examCard: {
    backgroundColor: CELLARIUM.card,
    borderRadius: UI.cardRadius,
    padding: UI.cardPadding,
    marginBottom: UI.cardGap,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  examHeader: {
    marginBottom: 12,
  },
  examTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  examName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2C2C2C',
    marginRight: 8,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: UI.chipRadius,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  examDescription: {
    fontSize: 14,
    color: CELLARIUM.muted,
    marginTop: 4,
  },
  examInfo: {
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: CELLARIUM.border,
  },
  examInfoText: {
    fontSize: 13,
    color: CELLARIUM.muted,
    marginBottom: 4,
  },
  warningText: {
    color: '#b91c1c',
    fontWeight: '600',
  },
  examActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: CELLARIUM.border,
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: UI.buttonRadius,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  takeButton: {
    backgroundColor: CELLARIUM.primary,
  },
  enableButton: {
    backgroundColor: CELLARIUM.primary,
  },
  disableButton: {
    backgroundColor: '#b45309',
  },
  resultsButton: {
    backgroundColor: '#4e2228',
  },
  deleteButton: {
    backgroundColor: '#b91c1c',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: CELLARIUM.card,
    borderRadius: UI.cardRadius,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2C2C2C',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: CELLARIUM.muted,
    marginBottom: 20,
    textAlign: 'center',
  },
  durationOption: {
    backgroundColor: CELLARIUM.primary,
    borderRadius: UI.buttonRadius,
    height: 50,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cancelOption: {
    backgroundColor: CELLARIUM.border,
    marginTop: 8,
  },
  durationText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelText: {
    color: '#2C2C2C',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    height: UI.buttonHeight,
    borderRadius: UI.buttonRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButton: {
    backgroundColor: CELLARIUM.primary,
  },
  deleteConfirmButton: {
    backgroundColor: '#b91c1c',
  },
  cancelModalButton: {
    backgroundColor: CELLARIUM.border,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelModalText: {
    color: '#2C2C2C',
  },
});

export default TastingExamsListScreen;

