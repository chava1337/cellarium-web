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
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, Wine } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { TastingExamService, TastingExam, TastingWineResponse } from '../services/TastingExamService';

type TakeTastingExamScreenNavigationProp = StackNavigationProp<RootStackParamList, 'TakeTastingExam'>;

interface Props {
  navigation: TakeTastingExamScreenNavigationProp;
  route: { params: { examId: string } };
}

type Phase = 'visual' | 'olfative' | 'gustative';
type WineType = 'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified';

const TakeTastingExamScreen: React.FC<Props> = ({ navigation, route }) => {
  const { examId } = route.params;
  const { user } = useAuth();
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
        Alert.alert('Error', 'Examen no encontrado', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
        return;
      }

      // Verificar disponibilidad
      const isAvailable = await TastingExamService.isExamAvailable(examId, user.id);
      if (!isAvailable) {
        Alert.alert(
          'Examen no disponible',
          'Este examen no está habilitado, ya expiró, o ya lo completaste.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
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
      Alert.alert('Error', error.message || 'No se pudo cargar el examen');
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
        'Campos incompletos',
        'Por favor completa todas las preguntas de esta fase antes de continuar.',
        [{ text: 'Entendido' }]
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
        'Fase incompleta',
        'Debes completar todas las fases (Visual, Olfativa y Gustativa) antes de avanzar al siguiente vino.',
        [{ text: 'Entendido' }]
      );
      return;
    }

    // Validar que la fase gustativa esté completa
    if (!validateCurrentPhase()) {
      Alert.alert(
        'Campos incompletos',
        'Por favor completa todas las preguntas de la fase gustativa antes de continuar.',
        [{ text: 'Entendido' }]
      );
      return;
    }
    
    if (currentWineIndex < exam.wines.length - 1) {
      setCurrentWineIndex(currentWineIndex + 1);
      setCurrentPhase('visual');
    } else {
      // Último vino, mostrar confirmación para terminar
      Alert.alert(
        'Finalizar Examen',
        'Has completado todos los vinos. ¿Deseas terminar el examen?',
        [
          { text: 'Revisar', style: 'cancel' },
          {
            text: 'Terminar',
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
      Alert.alert('Error', 'Debes completar todos los vinos del examen');
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
        'Examen Completado',
        'Tu examen ha sido guardado correctamente.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error: any) {
      console.error('Error submitting exam:', error);
      Alert.alert('Error', error.message || 'No se pudo guardar el examen');
    } finally {
      setSubmitting(false);
    }
  };

  const renderVisualPhase = () => {
    if (!currentWine || !currentWineResponse) return null;

    return (
      <ScrollView style={styles.phaseContent} showsVerticalScrollIndicator={false}>
        {/* Guía de claridad y limpieza */}
        <View style={styles.guideSection}>
          <Text style={styles.guideTitle}>Limpieza y Transparencia</Text>
          <Text style={styles.guideText}>
            Lo primero que observamos en la copa es la claridad y limpieza del vino. 
            Un vino de calidad debe ser cristalino y brillante, sin aspecto turbio.
          </Text>
        </View>

        {/* Guía de brillo */}
        <View style={styles.guideSection}>
          <Text style={styles.guideTitle}>El Brillo del Vino</Text>
          <Text style={styles.guideText}>
            Para evaluar el brillo, inclina la copa sobre un fondo blanco y bien iluminado. 
            La brillantez del vino es indicativa de su acidez y frescura.
          </Text>
        </View>

        {/* Guía de color */}
        <View style={styles.guideSection}>
          <Text style={styles.guideTitle}>El Color y su Evolución</Text>
          <Text style={styles.guideText}>
            1️⃣ Inclina la copa a 45° sobre un fondo blanco.{'\n'}
            2️⃣ Observa la parte central para detectar su color principal.{'\n'}
            3️⃣ Fíjate en el ribete (zona más delgada) para notar su evolución.
          </Text>
        </View>

        {/* Preguntas según tipo de vino */}
        {wineType === 'red' && (
          <View style={styles.questionSection}>
            <Text style={styles.questionLabel}>Intensidad del cuerpo (1-5)</Text>
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
            <Text style={styles.questionLabel}>Claridad (1-5)</Text>
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
              <Text style={styles.questionLabel}>Claridad (1-5)</Text>
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
              <Text style={styles.questionLabel}>Efervescencia (1-5)</Text>
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
            Grado Alcohólico (1-10){'\n'}
            <Text style={styles.questionHint}>
              Observa las lágrimas o piernas del vino en las paredes de la copa. 
              Si son densas y caen lentamente, indican un alto contenido alcohólico.
            </Text>
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
      </ScrollView>
    );
  };

  const renderOlfativePhase = () => {
    if (!currentWine || !currentWineResponse) return null;

    const aromaOptions = [
      'Frutales',
      'Florales',
      'Vegetales',
      'Balsámicos',
      'Tostados o especiados',
      'Minerales',
    ];

    return (
      <ScrollView style={styles.phaseContent} showsVerticalScrollIndicator={false}>
        {/* Guía primera olfacción */}
        <View style={styles.guideSection}>
          <Text style={styles.guideTitle}>Primera Olfacción (copa parada)</Text>
          <Text style={styles.guideText}>
            Acerca la copa a la nariz sin moverla para percibir los aromas primarios más volátiles. 
            Estos aromas provienen directamente de la uva y pueden ser frutales, florales o herbales.
          </Text>
        </View>

        {/* Guía segunda olfacción */}
        <View style={styles.guideSection}>
          <Text style={styles.guideTitle}>Segunda Olfacción (copa agitada)</Text>
          <Text style={styles.guideText}>
            Agita la copa en círculos para oxigenar el vino, lo que libera compuestos aromáticos más complejos. 
            Aquí se aprecian los aromas secundarios (fermentación) y terciarios (envejecimiento).
          </Text>
        </View>

        {/* Aromas detectados */}
        <View style={styles.questionSection}>
          <Text style={styles.questionLabel}>Aromas Detectados</Text>
          <View style={styles.optionsContainer}>
            {aromaOptions.map((aroma) => {
              const selected = currentWineResponse.detected_aromas?.includes(aroma) || false;
              return (
                <TouchableOpacity
                  key={aroma}
                  style={[styles.optionButton, selected && styles.optionButtonSelected]}
                  onPress={() => {
                    const current = currentWineResponse.detected_aromas || [];
                    const updated = selected
                      ? current.filter((a) => a !== aroma)
                      : [...current, aroma];
                    updateResponse('detected_aromas', updated);
                  }}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      selected && styles.optionButtonTextSelected,
                    ]}
                  >
                    {aroma}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            style={styles.textInput}
            placeholder="Otros aromas detectados..."
            value={currentWineResponse.other_aromas || ''}
            onChangeText={(text) => updateResponse('other_aromas', text)}
            multiline
          />
        </View>

        {/* Intensidad */}
        <View style={styles.questionSection}>
          <Text style={styles.questionLabel}>Intensidad</Text>
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
                  {option === 'fuertes' ? 'Fuertes' : 'Sutiles'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Calidad */}
        <View style={styles.questionSection}>
          <Text style={styles.questionLabel}>Calidad</Text>
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
                  {option === 'agradables' ? 'Agradables' : 'Desagradables'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Complejidad */}
        <View style={styles.questionSection}>
          <Text style={styles.questionLabel}>Complejidad</Text>
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
                  {option === 'varios_mezclados'
                    ? 'Varios aromas mezclados'
                    : 'Un aroma destacado'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    );
  };

  const renderGustativePhase = () => {
    if (!currentWine || !currentWineResponse) return null;

    const firstImpactOptions = ['suave', 'vibrante', 'dulce', 'ácido', 'cálido', 'otra'];
    const flavorOptions = ['madera', 'especias', 'flores', 'minerales', 'frutos rojos', 'citricos', 'otro'];

    return (
      <ScrollView style={styles.phaseContent} showsVerticalScrollIndicator={false}>
        {/* Guía gustativa */}
        <View style={styles.guideSection}>
          <Text style={styles.guideTitle}>Fase Gustativa</Text>
          <Text style={styles.guideText}>
            Toma un sorbo generoso y muévelo por toda la boca para percibir todos los sabores 
            (dulce, ácido, amargo, salado) y sensaciones táctiles (cuerpo, acidez, taninos, alcohol).
          </Text>
        </View>

        {/* Primer impacto */}
        <View style={styles.questionSection}>
          <Text style={styles.questionLabel}>Primer Impacto del Vino</Text>
          <View style={styles.optionsContainer}>
            {firstImpactOptions.map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.optionButton,
                  currentWineResponse.first_impact === option && styles.optionButtonSelected,
                ]}
                onPress={() => updateResponse('first_impact', option)}
              >
                <Text
                  style={[
                    styles.optionButtonText,
                    currentWineResponse.first_impact === option && styles.optionButtonTextSelected,
                  ]}
                >
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {currentWineResponse.first_impact === 'otra' && (
            <TextInput
              style={styles.textInput}
              placeholder="Describe el primer impacto..."
              value={currentWineResponse.other_first_impact || ''}
              onChangeText={(text) => updateResponse('other_first_impact', text)}
            />
          )}
        </View>

        {/* Sabores reconocidos */}
        <View style={styles.questionSection}>
          <Text style={styles.questionLabel}>Sabores Reconocidos</Text>
          <View style={styles.optionsContainer}>
            {flavorOptions.map((flavor) => {
              const selected = currentWineResponse.recognized_flavors?.includes(flavor) || false;
              return (
                <TouchableOpacity
                  key={flavor}
                  style={[styles.optionButton, selected && styles.optionButtonSelected]}
                  onPress={() => {
                    const current = currentWineResponse.recognized_flavors || [];
                    const updated = selected
                      ? current.filter((f) => f !== flavor)
                      : [...current, flavor];
                    updateResponse('recognized_flavors', updated);
                  }}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      selected && styles.optionButtonTextSelected,
                    ]}
                  >
                    {flavor.charAt(0).toUpperCase() + flavor.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {currentWineResponse.recognized_flavors?.includes('otro') && (
            <TextInput
              style={styles.textInput}
              placeholder="Otros sabores detectados..."
              value={currentWineResponse.other_flavors || ''}
              onChangeText={(text) => updateResponse('other_flavors', text)}
            />
          )}
        </View>

        {/* Acidez */}
        <View style={styles.questionSection}>
          <Text style={styles.questionLabel}>Acidez (1-10)</Text>
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
            <Text style={styles.questionLabel}>Tanicidad (1-10)</Text>
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
          <Text style={styles.questionLabel}>Nivel de Alcohol: Sensación de Calidez (1-5)</Text>
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
          <Text style={styles.questionLabel}>Cuerpo del Vino</Text>
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
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Persistencia */}
        <View style={styles.questionSection}>
          <Text style={styles.questionLabel}>Persistencia o Retrogusto</Text>
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
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Sabores detectados (texto libre) */}
        <View style={styles.questionSection}>
          <Text style={styles.questionLabel}>Sabores Detectados (texto libre)</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            placeholder="Describe los sabores que detectaste..."
            value={currentWineResponse.detected_tastes || ''}
            onChangeText={(text) => updateResponse('detected_tastes', text)}
            multiline
            numberOfLines={4}
          />
        </View>
      </ScrollView>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B0000" />
          <Text style={styles.loadingText}>Cargando examen...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!exam || !currentWine) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>No se pudo cargar el examen</Text>
        </View>
      </SafeAreaView>
    );
  }

  const phaseTitles = {
    visual: 'Fase Visual',
    olfative: 'Fase Olfativa',
    gustative: 'Fase Gustativa',
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{exam.name}</Text>
        <Text style={styles.headerSubtitle}>
          Vino {currentWineIndex + 1} de {exam.wines?.length || 0} - {phaseTitles[currentPhase]}
        </Text>
      </View>

      {/* Imagen del vino */}
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

      {/* Contenido de la fase actual */}
      {currentPhase === 'visual' && renderVisualPhase()}
      {currentPhase === 'olfative' && renderOlfativePhase()}
      {currentPhase === 'gustative' && renderGustativePhase()}

      {/* Navegación */}
      <View style={styles.navigation}>
        <View style={styles.phaseNavigation}>
          {currentPhase !== 'visual' && (
            <TouchableOpacity
              style={styles.navButton}
              onPress={handlePreviousPhase}
            >
              <Text style={styles.navButtonText}>← Fase Anterior</Text>
            </TouchableOpacity>
          )}
          {currentPhase !== 'gustative' && (
            <TouchableOpacity
              style={[styles.navButton, styles.navButtonPrimary]}
              onPress={handleNextPhase}
            >
              <Text style={styles.navButtonText}>Siguiente Fase →</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.wineNavigation}>
          {currentWineIndex > 0 && (
            <TouchableOpacity
              style={styles.navButton}
              onPress={handlePreviousWine}
            >
              <Text style={styles.navButtonText}>← Vino Anterior</Text>
            </TouchableOpacity>
          )}
          {currentPhase === 'gustative' && (
            <TouchableOpacity
              style={[styles.navButton, styles.navButtonPrimary]}
              onPress={handleNextWine}
            >
              <Text style={styles.navButtonText}>
                {currentWineIndex < (exam.wines?.length || 0) - 1
                  ? 'Siguiente Vino →'
                  : 'Terminar Examen'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Modal de carga al enviar */}
      {submitting && (
        <Modal transparent visible={submitting}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <ActivityIndicator size="large" color="#8B0000" />
              <Text style={styles.modalText}>Guardando examen...</Text>
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
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#dc3545',
    textAlign: 'center',
  },
  header: {
    padding: 20,
    backgroundColor: '#8B0000',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    textAlign: 'center',
  },
  wineImageContainer: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  wineImage: {
    width: 120,
    height: 200,
    marginBottom: 12,
  },
  wineName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  wineWinery: {
    fontSize: 16,
    color: '#666',
  },
  phaseContent: {
    flex: 1,
    padding: 16,
  },
  guideSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  guideTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  guideText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  questionSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  questionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  questionHint: {
    fontSize: 12,
    color: '#999',
    fontWeight: 'normal',
  },
  scaleContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  scaleButton: {
    width: 50,
    height: 50,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  scaleButtonSmall: {
    width: 40,
    height: 40,
  },
  scaleButtonSelected: {
    backgroundColor: '#8B0000',
    borderColor: '#8B0000',
  },
  scaleButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
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
    gap: 8,
    marginBottom: 12,
  },
  optionButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  optionButtonSelected: {
    backgroundColor: '#8B0000',
    borderColor: '#8B0000',
  },
  optionButtonText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  optionButtonTextSelected: {
    color: '#fff',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: '#fff',
    marginTop: 8,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  navigation: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#6c757d',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  navButtonPrimary: {
    backgroundColor: '#8B0000',
  },
  navButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  modalText: {
    marginTop: 12,
    fontSize: 16,
    color: '#333',
  },
});

export default TakeTastingExamScreen;

