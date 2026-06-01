import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, Wine } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { useLanguage } from '../contexts/LanguageContext';
import { TastingExamService } from '../services/TastingExamService';
import { canCreateTastingExam } from '../utils/rolePermissions';

type CreateTastingExamScreenNavigationProp = StackNavigationProp<RootStackParamList, 'CreateTastingExam'>;

interface Props {
  navigation: CreateTastingExamScreenNavigationProp;
}

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
  headerHeight: 96,
  headerHorizontalPadding: 20,
  cardRadius: 18,
  cardPadding: 16,
  cardGap: 14,
  thumbSize: 72,
  thumbRadius: 12,
  inputHeight: 52,
  inputRadius: 14,
  buttonHeight: 50,
  buttonRadius: 14,
  chipHeight: 42,
  chipRadius: 14,
  primaryGradient: ['#4e2228', '#6f2f37', '#924048'] as const,
} as const;

const CreateTastingExamScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { currentBranch } = useBranch();
  const { t } = useLanguage();
  const [name, setName] = useState('');

  if (user && !canCreateTastingExam(user.role as 'owner' | 'gerente' | 'sommelier' | 'supervisor' | 'personal')) {
    return (
      <View style={styles.guardContainer}>
        <Text style={styles.guardTitle}>{t('tasting.no_permission_title')}</Text>
        <Text style={styles.guardSubtitle}>{t('tasting.no_permission_create')}</Text>
        <TouchableOpacity style={styles.guardButton} onPress={() => navigation.goBack()}>
          <Text style={styles.guardButtonText}>{t('tasting.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  const [description, setDescription] = useState('');
  const [availableWines, setAvailableWines] = useState<Wine[]>([]);
  const [selectedWineIds, setSelectedWineIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadAvailableWines();
  }, [currentBranch, user]);

  const loadAvailableWines = async () => {
    if (!currentBranch || !user) return;

    try {
      setLoading(true);
      const ownerId = user.owner_id || user.id;
      const wines = await TastingExamService.getAvailableWines(currentBranch.id, ownerId);
      setAvailableWines(wines);
    } catch (error: any) {
      console.error('Error loading wines:', error);
      Alert.alert(t('common.error'), error.message || t('tasting.error_load_wines'));
    } finally {
      setLoading(false);
    }
  };

  const toggleWineSelection = (wineId: string) => {
    const newSelection = new Set(selectedWineIds);
    if (newSelection.has(wineId)) {
      newSelection.delete(wineId);
    } else {
      newSelection.add(wineId);
    }
    setSelectedWineIds(newSelection);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert(t('common.error'), t('tasting.error_name_required'));
      return;
    }

    if (selectedWineIds.size === 0) {
      Alert.alert(t('common.error'), t('tasting.error_select_wine'));
      return;
    }

    if (!currentBranch || !user) {
      Alert.alert(t('common.error'), t('tasting.error_no_branch_user'));
      return;
    }

    try {
      setSubmitting(true);
      const ownerId = user.owner_id || user.id;

      await TastingExamService.createExam({
        branchId: currentBranch.id,
        ownerId,
        userId: user.id,
        name: name.trim(),
        description: description.trim() || undefined,
        wineIds: Array.from(selectedWineIds),
      });

      Alert.alert(t('msg.success'), t('tasting.success_created'), [
        {
          text: t('common.ok'),
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error: any) {
      console.error('Error creating exam:', error);
      Alert.alert(t('common.error'), error.message || t('tasting.error_create'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <LinearGradient
          colors={UI.primaryGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{t('tasting.create_title')}</Text>
            <Text style={styles.headerSubtitle}>{t('tasting.loading_wines')}</Text>
          </View>
        </LinearGradient>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={CELLARIUM.primary} />
          <Text style={styles.loadingText}>{t('tasting.loading_wines')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient
        colors={UI.primaryGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.headerGradient}
      >
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('tasting.create_title')}</Text>
          <Text style={styles.headerSubtitle}>{t('tasting.create_subtitle')}</Text>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 80 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formSection}>
          <Text style={styles.label}>{t('tasting.name_label')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('tasting.name_placeholder')}
            placeholderTextColor={CELLARIUM.muted}
            value={name}
            onChangeText={setName}
            maxLength={100}
          />

          <Text style={styles.label}>{t('tasting.description_label')}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder={t('tasting.description_placeholder')}
            placeholderTextColor={CELLARIUM.muted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            maxLength={500}
          />
        </View>

        <View style={styles.winesSection}>
          <Text style={styles.sectionTitle}>
            {selectedWineIds.size === 1
              ? t('tasting.catalog_wines_one').replace('{count}', String(selectedWineIds.size))
              : t('tasting.catalog_wines_many').replace('{count}', String(selectedWineIds.size))}
          </Text>
          <Text style={styles.sectionSubtitle}>{t('tasting.create_subtitle')}</Text>

          {availableWines.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{t('tasting.empty_no_wines')}</Text>
              <Text style={styles.emptySubtext}>{t('tasting.empty_add_wines_hint')}</Text>
            </View>
          ) : (
            availableWines.map((wine) => {
              const isSelected = selectedWineIds.has(wine.id);
              return (
                <TouchableOpacity
                  key={wine.id}
                  style={[styles.wineCard, isSelected && styles.wineCardSelected]}
                  onPress={() => toggleWineSelection(wine.id)}
                  activeOpacity={0.85}
                >
                  <View style={styles.wineThumbWrap}>
                    {wine.image_url ? (
                      <Image
                        source={{ uri: wine.image_url }}
                        style={styles.wineImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.wineThumbPlaceholder} />
                    )}
                  </View>
                  <View style={styles.wineInfo}>
                    <Text style={styles.wineName}>{wine.name}</Text>
                    {wine.winery && (
                      <Text style={styles.wineWinery}>{wine.winery}</Text>
                    )}
                    {wine.vintage && (
                      <Text style={styles.wineMeta}>
                        {t('tasting.vintage_label').replace('{vintage}', String(wine.vintage))}
                      </Text>
                    )}
                    {wine.type && (
                      <Text style={styles.wineMeta}>
                        {wine.type.charAt(0).toUpperCase() + wine.type.slice(1)}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={[styles.actions, { marginBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={() => navigation.goBack()}
            disabled={submitting}
            activeOpacity={0.85}
          >
            <Text style={styles.cancelButtonText}>{t('tasting.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.submitButton, submitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting || selectedWineIds.size === 0 || !name.trim()}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>{t('tasting.create_button')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CELLARIUM.bg,
  },
  guardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: CELLARIUM.bg,
    padding: 24,
  },
  guardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C2C2C',
    textAlign: 'center',
  },
  guardSubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: CELLARIUM.muted,
    textAlign: 'center',
  },
  guardButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: CELLARIUM.primary,
    borderRadius: UI.buttonRadius,
  },
  guardButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  headerGradient: {
    height: UI.headerHeight,
    paddingHorizontal: UI.headerHorizontalPadding,
    paddingBottom: 12,
    justifyContent: 'flex-end',
  },
  headerCenter: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: CELLARIUM.textOnDark,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 13,
    color: CELLARIUM.textOnDarkMuted,
    marginTop: 2,
    textAlign: 'center',
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
  formSection: {
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
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2C2C2C',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: CELLARIUM.border,
    borderRadius: UI.inputRadius,
    paddingHorizontal: 14,
    height: UI.inputHeight,
    fontSize: 16,
    backgroundColor: CELLARIUM.card,
    marginBottom: 16,
    color: '#2C2C2C',
  },
  textArea: {
    height: 100,
    paddingTop: 14,
    textAlignVertical: 'top',
  },
  winesSection: {
    marginBottom: UI.cardGap,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2C2C2C',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: CELLARIUM.muted,
    marginBottom: 14,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: CELLARIUM.card,
    borderRadius: UI.cardRadius,
  },
  emptyText: {
    fontSize: 16,
    color: CELLARIUM.muted,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 13,
    color: CELLARIUM.muted,
    textAlign: 'center',
  },
  wineCard: {
    flexDirection: 'row',
    backgroundColor: CELLARIUM.card,
    borderRadius: UI.cardRadius,
    padding: 14,
    marginBottom: UI.cardGap,
    borderWidth: 2,
    borderColor: CELLARIUM.border,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  wineCardSelected: {
    borderColor: CELLARIUM.primary,
    backgroundColor: 'rgba(146,64,72,0.06)',
  },
  wineThumbWrap: {
    width: UI.thumbSize,
    height: UI.thumbSize,
    borderRadius: UI.thumbRadius,
    backgroundColor: CELLARIUM.border,
    overflow: 'hidden',
    marginRight: 14,
  },
  wineImage: {
    width: '100%',
    height: '100%',
  },
  wineThumbPlaceholder: {
    width: '100%',
    height: '100%',
  },
  wineInfo: {
    flex: 1,
    minWidth: 0,
  },
  wineName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C2C2C',
    marginBottom: 2,
  },
  wineWinery: {
    fontSize: 14,
    color: CELLARIUM.muted,
    marginBottom: 2,
  },
  wineMeta: {
    fontSize: 12,
    color: CELLARIUM.muted,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: CELLARIUM.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  checkboxSelected: {
    backgroundColor: CELLARIUM.primary,
    borderColor: CELLARIUM.primary,
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  button: {
    flex: 1,
    height: UI.buttonHeight,
    borderRadius: UI.buttonRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: CELLARIUM.border,
  },
  cancelButtonText: {
    color: '#2C2C2C',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: CELLARIUM.primary,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

export default CreateTastingExamScreen;
