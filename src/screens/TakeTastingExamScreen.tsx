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
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, Wine } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { TastingExamService, TastingExam, TastingWineResponse } from '../services/TastingExamService';
import {
  TASTING_AROMA_OPTIONS,
  TASTING_FIRST_IMPACT_OPTIONS,
  TASTING_FLAVOR_OPTIONS,
  tastingDisplayValue,
} from '../utils/tastingDisplay';

type TakeTastingExamScreenNavigationProp = StackNavigationProp<RootStackParamList, 'TakeTastingExam'>;

interface Props {
  navigation: TakeTastingExamScreenNavigationProp;
  route: { params: { examId: string } };
}

type Phase = 'visual' | 'olfative' | 'gustative';
type WineType = 'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified';

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
  buttonHeight: 50,
  buttonRadius: 14,
  primaryGradient: ['#4e2228', '#6f2f37', '#924048'] as const,
} as const;

const TakeTastingExamScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { examId } = route.params;
  const { user } = useAuth();
  const { t } = useLanguage();
  const [exam, setExam] = useState<TastingExam | null>(null);
  const [currentWineIndex, setCurrentWineIndex] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<Phase>('visual');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Respuestas por vino
  const [responses, setResponses] = useState<Map<string, Partial<TastingWineResponse>>>(new Map());

  useEffect(() => {
    loadExam();
  }, [examId]);

  const loadExam = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const ownerId = user.owner_id || user.id;
      const examData = await TastingExamService.getExamById(examId, ownerId);
      
      if (!examData) {
        Alert.alert(t('common.error'), t('tasting.error_not_found'), [
          { text: t('common.ok'), onPress: () => navigation.goBack() },
        ]);
        return;
      }

      // Verificar disponibilidad
      const isAvailable = await TastingExamService.isExamAvailable(examId, user.id);
      if (!isAvailable) {
        Alert.alert(
          t('tasting.unavailable_title'),
          t('tasting.unavailable_body'),
          [{ text: t('common.ok'), onPress: () => navigation.goBack() }]
        );
        return;
      }

      setExam(examData);
      
      // Inicializar respuestas para cada vino
      const initialResponses = new Map<string, Partial<TastingWineResponse>>();
      if (examData.wines) {
        examData.wines.forEach((examWine) => {
          if (examWine.wine) {
            initialResponses.set(examWine.wine.id, { wine_id: examWine.wine.id });
          }
        });
      }
      setResponses(initialResponses);
    } catch (error: any) {
      console.error('Error loading exam:', error);
      Alert.alert(t('common.error'), error.message || t('tasting.error_load_exam'));
    } finally {
      setLoading(false);
    }
  };

  const currentWine = exam?.wines?.[currentWineIndex]?.wine;
  const currentWineResponse = currentWine ? responses.get(currentWine.id) || { wine_id: currentWine.id } : null;
  const wineType = currentWine?.type as WineType;

  const updateResponse = (field: keyof TastingWineResponse, value: any) => {
    if (!currentWine) return;
    
    const updated = new Map(responses);
    const current = updated.get(currentWine.id) || { wine_id: currentWine.id };
    updated.set(currentWine.id, { ...current, [field]: value });
    setResponses(updated);
  };

  const validateCurrentPhase = (): boolean => {
    if (!currentWine || !currentWineResponse) return false;

    if (currentPhase === 'visual') {
      // Validar según tipo de vino
      if (wineType === 'red') {
        if (!currentWineResponse.body_intensity) return false;
      } else if (wineType === 'white' || wineType === 'rose') {
        if (!currentWineResponse.clarity) return false;
      } else if (wineType === 'sparkling') {
        if (!currentWineResponse.clarity || !currentWineResponse.effervescence) return false;
      }
      // Grado alcohólico es obligatorio para todos
      if (!currentWineResponse.alcohol_level) return false;
      return true;
    } else if (currentPhase === 'olfative') {
      // Intensidad, calidad y complejidad son obligatorias
      if (!currentWineResponse.aroma_intensity) return false;
      if (!currentWineResponse.aroma_quality) return false;
      if (!currentWineResponse.aroma_complexity) return false;
      return true;
    } else if (currentPhase === 'gustative') {
      // Primer impacto es obligatorio
      if (!currentWineResponse.first_impact) return false;
      // Si seleccionó "otra", debe completar el texto
      if (currentWineResponse.first_impact === 'otra' && !currentWineResponse.other_first_impact?.trim()) {
        return false;
      }
      // Acidez es obligatoria
      if (!currentWineResponse.acidity_level) return false;
      // Tanicidad solo para tintos
      if (wineType === 'red' && !currentWineResponse.tannin_level) return false;
      // Sensación de alcohol es obligatoria
      if (!currentWineResponse.alcohol_sensation) return false;
      // Cuerpo es obligatorio
      if (!currentWineResponse.body) return false;
      // Persistencia es obligatoria
      if (!currentWineResponse.persistence) return false;
      return true;
    }
    return true;
  };

  const handleNextPhase = () => {
    if (!validateCurrentPhase()) {
      Alert.alert(
        t('tasting.incomplete_fields_title'),
        t('tasting.incomplete_fields_body'),
        [{ text: t('tasting.understood') }]
      );
      return;
    }

    if (currentPhase === 'visual') {
      setCurrentPhase('olfative');
    } else if (currentPhase === 'olfative') {
      setCurrentPhase('gustative');
    }
  };

  const handlePreviousPhase = () => {
    if (currentPhase === 'olfative') {
      setCurrentPhase('visual');
    } else if (currentPhase === 'gustative') {
      setCurrentPhase('olfative');
    }
  };

  const handleNextWine = () => {
    if (!exam?.wines) return;
    
    // Validar que la fase gustativa esté completa antes de avanzar
    if (currentPhase !== 'gustative') {
      Alert.alert(
        t('tasting.incomplete_phase_title'),
        t('tasting.incomplete_phase_body'),
        [{ text: t('tasting.understood') }]
      );
      return;
    }

    // Validar que la fase gustativa esté completa
    if (!validateCurrentPhase()) {
      Alert.alert(
        t('tasting.incomplete_fields_title'),
        t('tasting.incomplete_gustative_body'),
        [{ text: t('tasting.understood') }]
      );
      return;
    }
    
    if (currentWineIndex < exam.wines.length - 1) {
      setCurrentWineIndex(currentWineIndex + 1);
      setCurrentPhase('visual');
    } else {
      // Último vino, mostrar confirmación para terminar
      Alert.alert(
        t('tasting.finish_title'),
        t('tasting.finish_body'),
        [
          { text: t('tasting.review'), style: 'cancel' },
          {
            text: t('tasting.finish'),
            onPress: handleSubmitExam,
          },
        ]
      );
    }
  };

  const handlePreviousWine = () => {
    if (currentWineIndex > 0) {
      setCurrentWineIndex(currentWineIndex - 1);
      setCurrentPhase('visual');
    }
  };

  const handleSubmitExam = async () => {
    if (!user || !exam) return;

    // Validar que todas las respuestas estén completas
    const allResponses = Array.from(responses.values());
    if (allResponses.length !== exam.wines?.length) {
      Alert.alert(t('common.error'), t('tasting.error_complete_all_wines'));
      return;
    }

    try {
      setSubmitting(true);
      
      await TastingExamService.createResponse({
        examId: exam.id,
        userId: user.id,
        userName: user.name || user.username || user.email || 'Usuario',
        wineResponses: allResponses as any,
      });

      Alert.alert(
        t('tasting.completed_title'),
        t('tasting.completed_body'),
        [
          {
            text: t('common.ok'),
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error: any) {
      console.error('Error submitting exam:', error);
      Alert.alert(t('common.error'), error.message || t('tasting.error_save'));
    } finally {
      setSubmitting(false);
    }
  };

  const renderVisualPhase = () => {
    if (!currentWine || !currentWineResponse) return null;

    return (
      <View style={styles.phaseContentInner}>
        {/* Guía de claridad y limpieza */}
        <View style={styles.guideSection}>
          <Text style={styles.guideTitle}>{t('tasting.guide_clarity_title')}</Text>
          <Text style={styles.guideText}>{t('tasting.guide_clarity_body')}</Text>
        </View>

        {/* Guía de brillo */}
        <View style={styles.guideSection}>
          <Text style={styles.guideTitle}>{t('tasting.guide_shine_title')}</Text>
          <Text style={styles.guideText}>{t('tasting.guide_shine_body')}</Text>
        </View>

        {/* Guía de color */}
        <View style={styles.guideSection}>
          <Text style={styles.guideTitle}>{t('tasting.guide_color_title')}</Text>
          <Text style={styles.guideText}>{t('tasting.guide_color_body')}</Text>
        </View>

        {/* Preguntas según tipo de vino */}
        {wineType === 'red' && (
          <View style={styles.questionSection}>
            <Text style={styles.questionLabel}>{t('tasting.q_body_intensity')}</Text>
            <View style={styles.scaleContainer}>
              {[1, 2, 3, 4, 5].map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[
                    styles.scaleButton,
                    currentWineResponse.body_intensity === value && styles.scaleButtonSelected,
                  ]}
                  onPress={() => updateResponse('body_intensity', value)}
                >
                  <Text
                    style={[
                      styles.scaleButtonText,
                      currentWineResponse.body_intensity === value && styles.scaleButtonTextSelected,
                    ]}
                  >
                    {value}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {(wineType === 'white' || wineType === 'rose') && (
          <View style={styles.questionSection}>
            <Text style={styles.questionLabel}>{t('tasting.q_clarity')}</Text>
            <View style={styles.scaleContainer}>
              {[1, 2, 3, 4, 5].map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[
                    styles.scaleButton,
                    currentWineResponse.clarity === value && styles.scaleButtonSelected,
                  ]}
                  onPress={() => updateResponse('clarity', value)}
                >
                  <Text
                    style={[
                      styles.scaleButtonText,
                      currentWineResponse.clarity === value && styles.scaleButtonTextSelected,
                    ]}
                  >
                    {value}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {wineType === 'sparkling' && (
          <>
            <View style={styles.questionSection}>
              <Text style={styles.questionLabel}>{t('tasting.q_clarity')}</Text>
              <View style={styles.scaleContainer}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.scaleButton,
                      currentWineResponse.clarity === value && styles.scaleButtonSelected,
                    ]}
                    onPress={() => updateResponse('clarity', value)}
                  >
                    <Text
                      style={[
                        styles.scaleButtonText,
                        currentWineResponse.clarity === value && styles.scaleButtonTextSelected,
                      ]}
                    >
                      {value}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.questionSection}>
              <Text style={styles.questionLabel}>{t('tasting.q_effervescence')}</Text>
              <View style={styles.scaleContainer}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.scaleButton,
                      currentWineResponse.effervescence === value && styles.scaleButtonSelected,
                    ]}
                    onPress={() => updateResponse('effervescence', value)}
                  >
                    <Text
                      style={[
                        styles.scaleButtonText,
                        currentWineResponse.effervescence === value && styles.scaleButtonTextSelected,
                      ]}
                    >
                      {value}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        )}

        {/* Grado alcohólico */}
        <View style={styles.questionSection}>
          <Text style={styles.questionLabel}>
            {t('tasting.q_alcohol_level')}{'\n'}
            <Text style={styles.questionHint}>{t('tasting.q_alcohol_level_hint')}</Text>
          </Text>
          <View style={styles.scaleContainer}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.scaleButton,
                  styles.scaleButtonSmall,
                  currentWineResponse.alcohol_level === value && styles.scaleButtonSelected,
                ]}
                onPress={() => updateResponse('alcohol_level', value)}
              >
                <Text
                  style={[
                    styles.scaleButtonText,
                    styles.scaleButtonTextSmall,
                    currentWineResponse.alcohol_level === value && styles.scaleButtonTextSelected,
                  ]}
                >
                  {value}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    );
  };

  const renderOlfativePhase = () => {
    if (!currentWine || !currentWineResponse) return null;

    return (
      <View style={styles.phaseContentInner}>
        <View style={styles.guideSection}>
          <Text style={styles.guideTitle}>{t('tasting.guide_first_nose_title')}</Text>
          <Text style={styles.guideText}>{t('tasting.guide_first_nose_body')}</Text>
        </View>

        {/* Guía segunda olfacción */}
        <View style={styles.guideSection}>
          <Text style={styles.guideTitle}>{t('tasting.guide_second_nose_title')}</Text>
          <Text style={styles.guideText}>{t('tasting.guide_second_nose_body')}</Text>
        </View>

        {/* Aromas detectados */}
        <View style={styles.questionSection}>
          <Text style={styles.questionLabel}>{t('tasting.q_detected_aromas')}</Text>
          <View style={styles.optionsContainer}>
            {TASTING_AROMA_OPTIONS.map((opt) => {
              const selected = currentWineResponse.detected_aromas?.includes(opt.store) || false;
              return (
                <TouchableOpacity
                  key={opt.store}
                  style={[styles.optionButton, selected && styles.optionButtonSelected]}
                  onPress={() => {
                    const current = currentWineResponse.detected_aromas || [];
                    const updated = selected
                      ? current.filter((a) => a !== opt.store)
                      : [...current, opt.store];
                    updateResponse('detected_aromas', updated);
                  }}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      selected && styles.optionButtonTextSelected,
                    ]}
                  >
                    {t(opt.labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            style={styles.textInput}
            placeholder={t('tasting.other_aromas_placeholder')}
            value={currentWineResponse.other_aromas || ''}
            onChangeText={(text) => updateResponse('other_aromas', text)}
            multiline
          />
        </View>

        {/* Intensidad */}
        <View style={styles.questionSection}>
          <Text style={styles.questionLabel}>{t('tasting.q_intensity')}</Text>
          <View style={styles.optionsContainer}>
            {['fuertes', 'sutiles'].map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.optionButton,
                  currentWineResponse.aroma_intensity === option && styles.optionButtonSelected,
                ]}
                onPress={() => updateResponse('aroma_intensity', option as any)}
              >
                <Text
                  style={[
                    styles.optionButtonText,
                    currentWineResponse.aroma_intensity === option && styles.optionButtonTextSelected,
                  ]}
                >
                  {tastingDisplayValue(t, option)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Calidad */}
        <View style={styles.questionSection}>
          <Text style={styles.questionLabel}>{t('tasting.q_quality')}</Text>
          <View style={styles.optionsContainer}>
            {['agradables', 'desagradables'].map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.optionButton,
                  currentWineResponse.aroma_quality === option && styles.optionButtonSelected,
                ]}
                onPress={() => updateResponse('aroma_quality', option as any)}
              >
                <Text
                  style={[
                    styles.optionButtonText,
                    currentWineResponse.aroma_quality === option && styles.optionButtonTextSelected,
                  ]}
                >
                  {tastingDisplayValue(t, option)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Complejidad */}
        <View style={styles.questionSection}>
          <Text style={styles.questionLabel}>{t('tasting.q_complexity')}</Text>
          <View style={styles.optionsContainer}>
            {['varios_mezclados', 'uno_destacado'].map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.optionButton,
                  currentWineResponse.aroma_complexity === option && styles.optionButtonSelected,
                ]}
                onPress={() => updateResponse('aroma_complexity', option as any)}
              >
                <Text
                  style={[
                    styles.optionButtonText,
                    currentWineResponse.aroma_complexity === option && styles.optionButtonTextSelected,
                  ]}
                >
                  {tastingDisplayValue(t, option)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    );
  };

  const renderGustativePhase = () => {
    if (!currentWine || !currentWineResponse) return null;

    return (
      <View style={styles.phaseContentInner}>
        <View style={styles.guideSection}>
          <Text style={styles.guideTitle}>{t('tasting.guide_gustative_title')}</Text>
          <Text style={styles.guideText}>{t('tasting.guide_gustative_body')}</Text>
        </View>

        {/* Primer impacto */}
        <View style={styles.questionSection}>
          <Text style={styles.questionLabel}>{t('tasting.q_first_impact')}</Text>
          <View style={styles.optionsContainer}>
            {TASTING_FIRST_IMPACT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.store}
                style={[
                  styles.optionButton,
                  currentWineResponse.first_impact === opt.store && styles.optionButtonSelected,
                ]}
                onPress={() => updateResponse('first_impact', opt.store)}
              >
                <Text
                  style={[
                    styles.optionButtonText,
                    currentWineResponse.first_impact === opt.store && styles.optionButtonTextSelected,
                  ]}
                >
                  {t(opt.labelKey)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {currentWineResponse.first_impact === 'otra' && (
            <TextInput
              style={styles.textInput}
              placeholder={t('tasting.other_first_impact_placeholder')}
              value={currentWineResponse.other_first_impact || ''}
              onChangeText={(text) => updateResponse('other_first_impact', text)}
            />
          )}
        </View>

        {/* Sabores reconocidos */}
        <View style={styles.questionSection}>
          <Text style={styles.questionLabel}>{t('tasting.q_recognized_flavors')}</Text>
          <View style={styles.optionsContainer}>
            {TASTING_FLAVOR_OPTIONS.map((opt) => {
              const selected = currentWineResponse.recognized_flavors?.includes(opt.store) || false;
              return (
                <TouchableOpacity
                  key={opt.store}
                  style={[styles.optionButton, selected && styles.optionButtonSelected]}
                  onPress={() => {
                    const current = currentWineResponse.recognized_flavors || [];
                    const updated = selected
                      ? current.filter((f) => f !== opt.store)
                      : [...current, opt.store];
                    updateResponse('recognized_flavors', updated);
                  }}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      selected && styles.optionButtonTextSelected,
                    ]}
                  >
                    {t(opt.labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {currentWineResponse.recognized_flavors?.includes('otro') && (
            <TextInput
              style={styles.textInput}
              placeholder={t('tasting.other_flavors_placeholder')}
              value={currentWineResponse.other_flavors || ''}
              onChangeText={(text) => updateResponse('other_flavors', text)}
            />
          )}
        </View>

        {/* Acidez */}
        <View style={styles.questionSection}>
          <Text style={styles.questionLabel}>{t('tasting.q_acidity')}</Text>
          <View style={styles.scaleContainer}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.scaleButton,
                  styles.scaleButtonSmall,
                  currentWineResponse.acidity_level === value && styles.scaleButtonSelected,
                ]}
                onPress={() => updateResponse('acidity_level', value)}
              >
                <Text
                  style={[
                    styles.scaleButtonText,
                    styles.scaleButtonTextSmall,
                    currentWineResponse.acidity_level === value && styles.scaleButtonTextSelected,
                  ]}
                >
                  {value}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Tanicidad (solo tintos) */}
        {wineType === 'red' && (
          <View style={styles.questionSection}>
            <Text style={styles.questionLabel}>{t('tasting.q_tannin')}</Text>
            <View style={styles.scaleContainer}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[
                    styles.scaleButton,
                    styles.scaleButtonSmall,
                    currentWineResponse.tannin_level === value && styles.scaleButtonSelected,
                  ]}
                  onPress={() => updateResponse('tannin_level', value)}
                >
                  <Text
                    style={[
                      styles.scaleButtonText,
                      styles.scaleButtonTextSmall,
                      currentWineResponse.tannin_level === value && styles.scaleButtonTextSelected,
                    ]}
                  >
                    {value}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Nivel de alcohol */}
        <View style={styles.questionSection}>
          <Text style={styles.questionLabel}>{t('tasting.q_alcohol_warmth')}</Text>
          <View style={styles.scaleContainer}>
            {[1, 2, 3, 4, 5].map((value) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.scaleButton,
                  currentWineResponse.alcohol_sensation === value && styles.scaleButtonSelected,
                ]}
                onPress={() => updateResponse('alcohol_sensation', value)}
              >
                <Text
                  style={[
                    styles.scaleButtonText,
                    currentWineResponse.alcohol_sensation === value && styles.scaleButtonTextSelected,
                  ]}
                >
                  {value}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Cuerpo */}
        <View style={styles.questionSection}>
          <Text style={styles.questionLabel}>{t('tasting.q_body')}</Text>
          <View style={styles.optionsContainer}>
            {['ligero', 'medio', 'robusto'].map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.optionButton,
                  currentWineResponse.body === option && styles.optionButtonSelected,
                ]}
                onPress={() => updateResponse('body', option as any)}
              >
                <Text
                  style={[
                    styles.optionButtonText,
                    currentWineResponse.body === option && styles.optionButtonTextSelected,
                  ]}
                >
                  {tastingDisplayValue(t, option)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Persistencia */}
        <View style={styles.questionSection}>
          <Text style={styles.questionLabel}>{t('tasting.q_persistence')}</Text>
          <View style={styles.optionsContainer}>
            {['baja', 'media', 'alta'].map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.optionButton,
                  currentWineResponse.persistence === option && styles.optionButtonSelected,
                ]}
                onPress={() => updateResponse('persistence', option as any)}
              >
                <Text
                  style={[
                    styles.optionButtonText,
                    currentWineResponse.persistence === option && styles.optionButtonTextSelected,
                  ]}
                >
                  {tastingDisplayValue(t, option)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Sabores detectados (texto libre) */}
        <View style={styles.questionSection}>
          <Text style={styles.questionLabel}>{t('tasting.q_detected_tastes')}</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            placeholder={t('tasting.detected_tastes_placeholder')}
            value={currentWineResponse.detected_tastes || ''}
            onChangeText={(text) => updateResponse('detected_tastes', text)}
            multiline
            numberOfLines={4}
          />
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={CELLARIUM.primary} />
          <Text style={styles.loadingText}>{t('tasting.loading_exam')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!exam || !currentWine) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{t('tasting.error_load_exam')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const phaseTitles = {
    visual: t('tasting.phase_visual'),
    olfative: t('tasting.phase_olfative'),
    gustative: t('tasting.phase_gustative'),
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient
        colors={UI.primaryGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.headerGradient}
      >
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{exam.name}</Text>
          <Text style={styles.headerSubtitle}>
            {t('tasting.wine_progress')
              .replace('{current}', String(currentWineIndex + 1))
              .replace('{total}', String(exam.wines?.length || 0))
              .replace('{phase}', phaseTitles[currentPhase])}
          </Text>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.mainScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {currentWine.image_url && (
          <View style={styles.wineImageContainer}>
            <Image
              source={{ uri: currentWine.image_url }}
              style={styles.wineImage}
              resizeMode="contain"
            />
            <Text style={styles.wineName}>{currentWine.name}</Text>
            {currentWine.winery && (
              <Text style={styles.wineWinery}>{currentWine.winery}</Text>
            )}
          </View>
        )}

        <View style={styles.phaseContent}>
          {currentPhase === 'visual' && renderVisualPhase()}
          {currentPhase === 'olfative' && renderOlfativePhase()}
          {currentPhase === 'gustative' && renderGustativePhase()}
        </View>

        <View style={[styles.navigation, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View style={styles.phaseNavigation}>
            {currentPhase !== 'visual' && (
              <TouchableOpacity
                style={styles.navButton}
                onPress={handlePreviousPhase}
                activeOpacity={0.85}
              >
                <Text style={styles.navButtonText}>{t('tasting.prev_phase')}</Text>
              </TouchableOpacity>
            )}
            {currentPhase !== 'gustative' && (
              <TouchableOpacity
                style={[styles.navButton, styles.navButtonPrimary]}
                onPress={handleNextPhase}
                activeOpacity={0.85}
              >
                <Text style={[styles.navButtonText, styles.navButtonTextPrimary]}>{t('tasting.next_phase')}</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.wineNavigation}>
            {currentWineIndex > 0 && (
              <TouchableOpacity
                style={styles.navButton}
                onPress={handlePreviousWine}
                activeOpacity={0.85}
              >
                <Text style={styles.navButtonText}>{t('tasting.prev_wine')}</Text>
              </TouchableOpacity>
            )}
            {currentPhase === 'gustative' && (
              <TouchableOpacity
                style={[styles.navButton, styles.navButtonPrimary]}
                onPress={handleNextWine}
                activeOpacity={0.85}
              >
                <Text style={[styles.navButtonText, styles.navButtonTextPrimary]}>
                  {currentWineIndex < (exam.wines?.length || 0) - 1
                    ? t('tasting.next_wine')
                    : t('tasting.finish_exam_button')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>

      {submitting && (
        <Modal transparent visible={submitting}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <ActivityIndicator size="large" color={CELLARIUM.primary} />
              <Text style={styles.modalText}>{t('tasting.saving_exam')}</Text>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CELLARIUM.bg,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#b91c1c',
    textAlign: 'center',
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
    fontSize: 24,
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
  mainScroll: {
    flex: 1,
  },
  mainScrollContent: {
    flexGrow: 1,
    paddingBottom: 16,
  },
  wineImageContainer: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: CELLARIUM.card,
    borderBottomWidth: 1,
    borderBottomColor: CELLARIUM.border,
  },
  wineImage: {
    width: 72,
    height: 130,
    marginBottom: 6,
  },
  wineName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2C2C2C',
    marginBottom: 2,
  },
  wineWinery: {
    fontSize: 13,
    color: CELLARIUM.muted,
  },
  phaseContent: {
    paddingHorizontal: UI.screenPadding,
    paddingTop: 16,
    paddingBottom: 8,
  },
  phaseContentInner: {
    paddingBottom: 8,
  },
  guideSection: {
    backgroundColor: CELLARIUM.card,
    borderRadius: UI.cardRadius,
    padding: UI.cardPadding,
    marginBottom: UI.cardGap,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  guideTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2C2C2C',
    marginBottom: 8,
  },
  guideText: {
    fontSize: 14,
    color: CELLARIUM.muted,
    lineHeight: 20,
  },
  questionSection: {
    backgroundColor: CELLARIUM.card,
    borderRadius: UI.cardRadius,
    padding: UI.cardPadding,
    marginBottom: UI.cardGap,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  questionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C2C2C',
    marginBottom: 12,
  },
  questionHint: {
    fontSize: 12,
    color: CELLARIUM.muted,
    fontWeight: 'normal',
  },
  scaleContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  scaleButton: {
    width: 50,
    height: 50,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: CELLARIUM.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CELLARIUM.card,
  },
  scaleButtonSmall: {
    width: 40,
    height: 40,
  },
  scaleButtonSelected: {
    backgroundColor: CELLARIUM.primary,
    borderColor: CELLARIUM.primary,
  },
  scaleButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C2C2C',
  },
  scaleButtonTextSmall: {
    fontSize: 14,
  },
  scaleButtonTextSelected: {
    color: '#fff',
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  optionButton: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: UI.buttonRadius,
    borderWidth: 2,
    borderColor: CELLARIUM.border,
    backgroundColor: CELLARIUM.card,
  },
  optionButtonSelected: {
    backgroundColor: CELLARIUM.primary,
    borderColor: CELLARIUM.primary,
  },
  optionButtonText: {
    fontSize: 14,
    color: '#2C2C2C',
    fontWeight: '600',
  },
  optionButtonTextSelected: {
    color: '#fff',
  },
  textInput: {
    borderWidth: 1,
    borderColor: CELLARIUM.border,
    borderRadius: 14,
    padding: 14,
    fontSize: 14,
    backgroundColor: CELLARIUM.card,
    marginTop: 8,
    color: '#2C2C2C',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  navigation: {
    marginTop: 24,
    paddingHorizontal: UI.screenPadding,
    paddingTop: 20,
    backgroundColor: CELLARIUM.card,
    borderTopWidth: 1,
    borderTopColor: CELLARIUM.border,
  },
  phaseNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  wineNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  navButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: UI.buttonRadius,
    backgroundColor: CELLARIUM.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  navButtonPrimary: {
    backgroundColor: CELLARIUM.primary,
  },
  navButtonText: {
    color: '#2C2C2C',
    fontSize: 14,
    fontWeight: '600',
  },
  navButtonTextPrimary: {
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: CELLARIUM.card,
    borderRadius: UI.cardRadius,
    padding: 24,
    alignItems: 'center',
  },
  modalText: {
    marginTop: 12,
    fontSize: 16,
    color: '#2C2C2C',
    fontWeight: '500',
  },
});

export default TakeTastingExamScreen;

