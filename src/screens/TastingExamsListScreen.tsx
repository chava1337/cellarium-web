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
import { CellariumHeader } from '../components/cellarium';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { useLanguage } from '../contexts/LanguageContext';
import { TastingExamService, TastingExam } from '../services/TastingExamService';
import { canCreateTastingExam, canManageTastingExams } from '../utils/rolePermissions';
import { getEffectivePlan, getOwnerEffectivePlan } from '../utils/effectivePlan';
import { checkSubscriptionFeatureByPlan } from '../utils/subscriptionPermissions';

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
  const { t } = useLanguage();
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
      Alert.alert('Error', error.message || 'No se pudieron cargar los exámenes');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateExam = () => {
    if (!canCreateExam) {
      Alert.alert('Sin permisos', 'Solo owners, gerentes y sommeliers pueden crear exámenes');
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
        Alert.alert('Éxito', 'Examen deshabilitado correctamente');
        setIsActionModalVisible(false);
        setSelectedExam(null);
        setActionType(null);
        loadExams();
      } else if (actionType === 'delete') {
        await TastingExamService.deleteExam({ examId: selectedExam.id, ownerId });
        Alert.alert('Éxito', 'Examen eliminado correctamente');
        setIsActionModalVisible(false);
        setSelectedExam(null);
        setActionType(null);
        loadExams();
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo completar la acción');
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
        'Habilitar Examen',
        `¿Estás seguro de que deseas habilitar el examen "${selectedExam.name}" por ${durationHours} hora(s)?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Habilitar',
            onPress: async () => {
              await TastingExamService.enableExam({
                examId: selectedExam.id,
                ownerId,
                durationHours,
              });
              Alert.alert('Éxito', `Examen habilitado por ${durationHours} hora(s)`);
              setDurationModalVisible(false);
              loadExams();
            },
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo habilitar el examen');
    }
  };

  const handleTakeExam = async (exam: TastingExam) => {
    if (!user) return;

    // Verificar si el examen está disponible
    const isAvailable = await TastingExamService.isExamAvailable(exam.id, user.id);
    if (!isAvailable) {
      Alert.alert(
        'Examen no disponible',
        'Este examen no está habilitado, ya expiró, o ya lo completaste.'
      );
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
      return { text: 'Deshabilitado permanentemente', color: '#b91c1c' };
    }
    if (!exam.enabled) {
      return { text: 'Deshabilitado', color: CELLARIUM.muted };
    }
    if (exam.enabled_until) {
      const until = new Date(exam.enabled_until);
      const now = new Date();
      if (until < now) {
        return { text: 'Expirado', color: '#b45309' };
      }
      const hoursLeft = Math.ceil((until.getTime() - now.getTime()) / (1000 * 60 * 60));
      return { text: `Habilitado (${hoursLeft}h restantes)`, color: CELLARIUM.primary };
    }
    return { text: 'Habilitado', color: CELLARIUM.primary };
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

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
        <CellariumHeader title="Catas y Degustaciones" subtitle="Cargando exámenes..." />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={CELLARIUM.primary} />
          <Text style={styles.loadingText}>Cargando exámenes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <CellariumHeader
        title="Catas y Degustaciones"
        subtitle={`${exams.length} examen${exams.length !== 1 ? 'es' : ''} en esta sucursal`}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) }}
        showsVerticalScrollIndicator={false}
      >
        {canCreateExam && (
          <TouchableOpacity style={styles.createButton} onPress={handleCreateExam} activeOpacity={0.85}>
            <Text style={styles.createButtonText}>+ Crear Nuevo Examen</Text>
          </TouchableOpacity>
        )}

        {/* Lista de exámenes */}
        {exams.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No hay exámenes creados</Text>
            {canCreateExam && (
              <Text style={styles.emptySubtext}>
                Presiona "Crear Nuevo Examen" para comenzar
              </Text>
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
                    {exam.wines_count || 0} vino{exam.wines_count !== 1 ? 's' : ''}
                  </Text>
                  <Text style={styles.examInfoText}>
                    Creado: {formatDate(exam.created_at)}
                  </Text>
                  {exam.enabled_until && (
                    <Text style={styles.examInfoText}>
                      Expira: {formatDate(exam.enabled_until)}
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
                      <Text style={styles.actionButtonText}>Realizar Examen</Text>
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
                          <Text style={styles.actionButtonText}>Habilitar</Text>
                        </TouchableOpacity>
                      )}
                      {exam.enabled && !exam.permanently_disabled && (
                        <TouchableOpacity
                          style={[styles.actionButton, styles.disableButton]}
                          onPress={() => handleDisableExam(exam)}
                        >
                          <Text style={styles.actionButtonText}>Deshabilitar</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[styles.actionButton, styles.resultsButton]}
                        onPress={() => handleViewResults(exam)}
                      >
                        <Text style={styles.actionButtonText}>Ver Resultados</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.deleteButton]}
                        onPress={() => handleDeleteExam(exam)}
                      >
                        <Text style={styles.actionButtonText}>Eliminar</Text>
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
              {actionType === 'delete' ? 'Eliminar Examen' : 'Deshabilitar Examen'}
            </Text>
            <Text style={styles.modalSubtitle}>
              {actionType === 'delete'
                ? `¿Estás seguro de que deseas eliminar permanentemente el examen "${selectedExam?.name}"? Esta acción no se puede deshacer.`
                : `¿Estás seguro de que deseas deshabilitar el examen "${selectedExam?.name}"?`}
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton, actionType === 'delete' && styles.deleteConfirmButton]}
                onPress={confirmAction}
              >
                <Text style={styles.modalButtonText}>
                  {actionType === 'delete' ? 'Eliminar' : 'Deshabilitar'}
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
                <Text style={[styles.modalButtonText, styles.cancelModalText]}>Cancelar</Text>
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
            <Text style={styles.modalTitle}>Seleccionar Duración</Text>
            <Text style={styles.modalSubtitle}>
              ¿Por cuánto tiempo deseas habilitar este examen?
            </Text>
            <TouchableOpacity
              style={styles.durationOption}
              onPress={() => handleDurationSelect(1)}
            >
              <Text style={styles.durationText}>1 hora</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.durationOption}
              onPress={() => handleDurationSelect(3)}
            >
              <Text style={styles.durationText}>3 horas</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.durationOption}
              onPress={() => handleDurationSelect(6)}
            >
              <Text style={styles.durationText}>6 horas</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.durationOption, styles.cancelOption]}
              onPress={() => setDurationModalVisible(false)}
            >
              <Text style={[styles.durationText, styles.cancelText]}>Cancelar</Text>
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

