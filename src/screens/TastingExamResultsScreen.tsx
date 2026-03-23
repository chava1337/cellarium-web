import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { TastingExamService, TastingExam, TastingResponse } from '../services/TastingExamService';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

type TastingExamResultsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'TastingExamResults'>;

interface Props {
  navigation: TastingExamResultsScreenNavigationProp;
  route: { params: { examId: string } };
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
  buttonHeight: 50,
  buttonRadius: 14,
  primaryGradient: ['#4e2228', '#6f2f37', '#924048'] as const,
} as const;

const TastingExamResultsScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { examId } = route.params;
  const { user } = useAuth();
  const [exam, setExam] = useState<TastingExam | null>(null);
  const [responses, setResponses] = useState<TastingResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    loadData();
  }, [examId]);

  const loadData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const ownerId = user.owner_id || user.id;
      
      const [examData, responsesData] = await Promise.all([
        TastingExamService.getExamById(examId, ownerId),
        TastingExamService.getResponsesByExam(examId, ownerId),
      ]);

      if (!examData) {
        Alert.alert('Error', 'Examen no encontrado', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
        return;
      }

      setExam(examData);
      setResponses(responsesData);
    } catch (error: any) {
      console.error('Error loading results:', error);
      Alert.alert('Error', error.message || 'No se pudieron cargar los resultados');
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = async () => {
    if (!exam || responses.length === 0) {
      Alert.alert('Error', 'No hay resultados para generar el PDF');
      return;
    }

    try {
      setGeneratingPdf(true);

      // Debug: Verificar estructura de datos
      console.log('📊 Generando PDF con:');
      console.log('- Examen:', exam.name);
      console.log('- Número de respuestas:', responses.length);
      if (responses.length > 0) {
        const firstResponse = responses[0] as any;
        console.log('- Primera respuesta user_name:', firstResponse.user_name);
        console.log('- Campos disponibles en response:', Object.keys(firstResponse));
        console.log('- Tiene wine_responses?:', !!firstResponse.wine_responses);
        console.log('- Tiene tasting_wine_responses?:', !!firstResponse.tasting_wine_responses);
        
        const wineResponses = firstResponse.tasting_wine_responses || firstResponse.wine_responses || [];
        console.log('- Wine responses del primer participante:', wineResponses.length);
        if (wineResponses.length > 0) {
          console.log('- Primer wine_response:', JSON.stringify(wineResponses[0], null, 2));
        }
        if (exam.wines && exam.wines.length > 0) {
          console.log('- Primer vino del examen wine_id:', exam.wines[0].wine_id);
        }
      }

      // Generar HTML del PDF
      const htmlContent = generateHTMLContent(exam, responses);

      // Generar PDF usando expo-print en formato horizontal
      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
        base64: false,
      });
      
      // Compartir el PDF
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert('Éxito', `PDF generado en: ${uri}`);
      }
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      Alert.alert('Error', error.message || 'No se pudo generar el PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const generateHTMLContent = (exam: TastingExam, responses: TastingResponse[]): string => {
    const formatDate = (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    const getWineName = (wineId: string) => {
      const examWine = exam.wines?.find((ew) => ew.wine_id === wineId);
      const wine = examWine?.wine;
      if (!wine) return 'Vino desconocido';
      
      const name = wine.name?.trim() || '';
      const winery = wine.winery?.trim() || '';
      
      if (name && winery) {
        return `${name} - ${winery}`;
      } else if (name) {
        return name;
      } else if (winery) {
        return winery;
      } else {
        return 'Vino desconocido';
      }
    };

    const getWineType = (wineId: string): string => {
      const examWine = exam.wines?.find((ew) => ew.wine_id === wineId);
      return examWine?.wine?.type || 'red';
    };

    const formatValue = (value: any): string => {
      if (value === null || value === undefined || value === '') return '-';
      if (Array.isArray(value)) return value.join(', ');
      return String(value);
    };

    // Obtener todas las preguntas posibles para cada vino
    const getAllQuestions = (wineId: string): Array<{ phase: string; question: string; key: string }> => {
      const wineType = getWineType(wineId);
      const questions: Array<{ phase: string; question: string; key: string }> = [];

      // FASE VISUAL
      if (wineType === 'red') {
        questions.push({ phase: 'Visual', question: 'Intensidad del cuerpo (1-5)', key: 'body_intensity' });
      } else if (wineType === 'white' || wineType === 'rose') {
        questions.push({ phase: 'Visual', question: 'Claridad (1-5)', key: 'clarity' });
      } else if (wineType === 'sparkling') {
        questions.push({ phase: 'Visual', question: 'Claridad (1-5)', key: 'clarity' });
        questions.push({ phase: 'Visual', question: 'Efervescencia (1-5)', key: 'effervescence' });
      }
      questions.push({ phase: 'Visual', question: 'Grado alcohólico (1-10)', key: 'alcohol_level' });

      // FASE OLFATIVA
      questions.push({ phase: 'Olfativa', question: 'Aromas detectados', key: 'detected_aromas' });
      questions.push({ phase: 'Olfativa', question: 'Otros aromas', key: 'other_aromas' });
      questions.push({ phase: 'Olfativa', question: 'Intensidad', key: 'aroma_intensity' });
      questions.push({ phase: 'Olfativa', question: 'Calidad', key: 'aroma_quality' });
      questions.push({ phase: 'Olfativa', question: 'Complejidad', key: 'aroma_complexity' });

      // FASE GUSTATIVA
      questions.push({ phase: 'Gustativa', question: 'Primer impacto', key: 'first_impact' });
      questions.push({ phase: 'Gustativa', question: 'Otro primer impacto', key: 'other_first_impact' });
      questions.push({ phase: 'Gustativa', question: 'Sabores reconocidos', key: 'recognized_flavors' });
      questions.push({ phase: 'Gustativa', question: 'Otros sabores', key: 'other_flavors' });
      questions.push({ phase: 'Gustativa', question: 'Acidez (1-10)', key: 'acidity_level' });
      if (wineType === 'red') {
        questions.push({ phase: 'Gustativa', question: 'Tanicidad (1-10)', key: 'tannin_level' });
      }
      questions.push({ phase: 'Gustativa', question: 'Nivel de alcohol (1-5)', key: 'alcohol_sensation' });
      questions.push({ phase: 'Gustativa', question: 'Cuerpo', key: 'body' });
      questions.push({ phase: 'Gustativa', question: 'Persistencia', key: 'persistence' });
      questions.push({ phase: 'Gustativa', question: 'Sabores detectados', key: 'detected_tastes' });

      return questions;
    };

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          @page {
            size: A4 landscape;
            margin: 1cm;
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          html {
            width: 100%;
            height: 100%;
          }
          body { 
            font-family: Arial, sans-serif; 
            font-size: 12px;
            margin: 0;
            padding: 0.5cm;
            color: #333;
            width: 100%;
            min-height: 100%;
          }
          h1 { 
            color: #8B0000; 
            border-bottom: 2px solid #8B0000; 
            padding-bottom: 6px;
            font-size: 20px;
            margin-bottom: 8px;
            page-break-after: avoid;
            font-weight: bold;
          }
          h2 {
            color: #8B0000;
            font-size: 16px;
            margin: 6px 0 4px 0;
            page-break-after: avoid;
            font-weight: bold;
          }
          .header-info {
            background-color: #f5f5f5;
            padding: 6px 8px;
            border-radius: 4px;
            margin-bottom: 6px;
            font-size: 12px;
            border: 1px solid #e0e0e0;
          }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 4px 0;
            font-size: 11px;
            page-break-inside: auto;
            border: 1px solid #ccc;
          }
          th, td { 
            border: 1px solid #ccc; 
            padding: 4px 6px;
            text-align: left;
            vertical-align: top;
            word-wrap: break-word;
            overflow: hidden;
            line-height: 1.4;
          }
          th { 
            background-color: #6B6B6B; 
            color: white;
            font-weight: bold;
            font-size: 12px;
            padding: 6px 8px;
            text-align: center;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          .question-cell {
            background-color: #f9f9f9;
            font-weight: 600;
            width: 35%;
            font-size: 11px;
            padding: 4px 6px;
            border-right: 2px solid #ddd;
          }
          .phase-header {
            background-color: #e8e8e8;
            font-weight: bold;
            text-align: center;
            font-size: 11px;
            padding: 5px;
            color: #333;
          }
          .participant-cell {
            text-align: center;
            width: auto;
            font-size: 11px;
            padding: 4px 6px;
            background-color: #fff;
          }
          .wine-section {
            margin: 6px 0;
            page-break-inside: avoid;
          }
          tbody tr.question-row:nth-child(even) td.question-cell {
            background-color: #f5f5f5;
          }
          tbody tr.question-row:nth-child(odd) td.question-cell {
            background-color: #f9f9f9;
          }
          tbody tr.question-row:nth-child(even) td.participant-cell {
            background-color: #fafafa;
          }
          tbody tr.question-row:nth-child(odd) td.participant-cell {
            background-color: #ffffff;
          }
        </style>
      </head>
      <body>
        <h1>Resultados del Examen: ${exam.name}</h1>
        <div class="header-info">
          <p><strong>Fecha del Examen:</strong> ${formatDate(exam.created_at)} | 
          <strong>Total de Participantes:</strong> ${responses.length}${exam.description ? ` | <strong>Descripción:</strong> ${exam.description}` : ''}</p>
        </div>
    `;

    // Generar tabla comparativa por cada vino
    // IMPORTANTE: Una sola tabla por vino, con múltiples columnas de participantes
    if (exam.wines && exam.wines.length > 0) {
      exam.wines.forEach((examWine) => {
        const wineName = getWineName(examWine.wine_id);
        const wineType = examWine.wine?.type || 'red';
        const questions = getAllQuestions(examWine.wine_id);
        
        // Calcular número total de columnas: 1 (Pregunta) + N (participantes)
        const totalColumns = responses.length > 0 ? responses.length + 1 : 2;

        html += `
          <div class="wine-section">
            <h2>${wineName}</h2>
            <table>
              <thead>
                <tr>
                  <th class="question-cell">Pregunta</th>
        `;

        // Generar encabezados de columnas para cada participante
        // Orden: se mantiene el orden del array responses
        if (responses.length === 0) {
          html += `<th class="participant-cell">Sin participantes</th>`;
        } else {
          // IMPORTANTE: Este forEach genera exactamente N columnas (una por participante)
          responses.forEach((response) => {
            const userName = response.user_name || 'Usuario desconocido';
            html += `<th class="participant-cell">${userName}</th>`;
          });
        }

        html += `
                </tr>
              </thead>
              <tbody>
        `;

        // Generar filas de preguntas
        // Cada fila tendrá: 1 td (pregunta) + N tds (una respuesta por participante)
        let currentPhase = '';
        let rowIndex = 0;
        questions.forEach((q) => {
          // Agregar encabezado de fase si cambió
          if (currentPhase !== q.phase) {
            currentPhase = q.phase;
            html += `
              <tr>
                <td colspan="${totalColumns}" class="phase-header">FASE ${q.phase.toUpperCase()}</td>
              </tr>
            `;
            rowIndex++;
          }

          const rowClass = rowIndex % 2 === 0 ? 'question-row' : '';
          html += `<tr class="${rowClass}">`;
          html += `<td class="question-cell">${q.question}</td>`;

          // IMPORTANTE: Generar una celda por cada participante, en el mismo orden que los encabezados
          if (responses.length === 0) {
            html += `<td class="participant-cell">-</td>`;
          } else {
            // Este forEach genera exactamente N celdas (una por participante)
            // El orden debe coincidir con el orden de los <th> en el thead
            responses.forEach((response) => {
              // Supabase puede devolver tasting_wine_responses en lugar de wine_responses
              const wineResponses = (response as any).tasting_wine_responses || response.wine_responses || [];
              
              // Buscar la respuesta del vino - normalizar ambos IDs a string para matching
              const examWineIdStr = String(examWine.wine_id);
              const wineResponse = wineResponses.find((wr: any) => {
                const wrWineIdStr = String(wr.wine_id);
                return wrWineIdStr === examWineIdStr;
              });
              
              let value = '-';

              if (wineResponse) {
                const rawValue = (wineResponse as any)[q.key];
                
                // Debug para primera pregunta del primer vino
                if (rowIndex === 1 && responses.indexOf(response) === 0) {
                  console.log(`🔍 Debug PDF - Pregunta: ${q.key}, rawValue:`, rawValue);
                  console.log(`   wineResponse completo:`, wineResponse);
                  console.log(`   examWine.wine_id:`, examWine.wine_id);
                  console.log(`   wineResponse.wine_id:`, wineResponse.wine_id);
                }
                
                if (rawValue !== null && rawValue !== undefined && rawValue !== '') {
                  if (q.key === 'aroma_complexity') {
                    value = rawValue === 'varios_mezclados' ? 'Varios mezclados' : 'Uno destacado';
                  } else if (q.key === 'aroma_intensity') {
                    value = rawValue === 'fuertes' ? 'Fuertes' : 'Sutiles';
                  } else if (q.key === 'aroma_quality') {
                    value = rawValue === 'agradables' ? 'Agradables' : 'Desagradables';
                  } else if (q.key === 'body') {
                    value = rawValue === 'ligero' ? 'Ligero' : rawValue === 'medio' ? 'Medio' : 'Robusto';
                  } else if (q.key === 'persistence') {
                    value = rawValue === 'baja' ? 'Baja' : rawValue === 'media' ? 'Media' : 'Alta';
                  } else if (q.key === 'first_impact' && rawValue === 'otra' && wineResponse.other_first_impact) {
                    value = `Otra: ${wineResponse.other_first_impact}`;
                  } else if (q.key === 'detected_aromas' || q.key === 'recognized_flavors') {
                    value = Array.isArray(rawValue) ? rawValue.join(', ') : String(rawValue);
                    if (q.key === 'recognized_flavors' && wineResponse.other_flavors) {
                      value += ` (${wineResponse.other_flavors})`;
                    }
                  } else {
                    value = formatValue(rawValue);
                  }
                } else {
                  // Si no hay valor pero wineResponse existe, mostrar que está vacío
                  value = '-';
                }
              } else {
                // Debug si no encuentra wineResponse
                if (rowIndex === 1 && responses.indexOf(response) === 0) {
                  console.log(`⚠️ No se encontró wineResponse para wine_id: ${examWineIdStr}`);
                  console.log(`   wineResponses disponibles:`, wineResponses.length);
                  console.log(`   IDs disponibles:`, wineResponses.map((wr: any) => String(wr.wine_id)));
                  console.log(`   response completo:`, response);
                }
              }

              html += `<td class="participant-cell">${value}</td>`;
            });
          }

          html += `</tr>`;
          rowIndex++;
        });

        html += `
              </tbody>
            </table>
          </div>
        `;
      });
    }

    html += `
      </body>
      </html>
    `;

    return html;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={CELLARIUM.primary} />
          <Text style={styles.loadingText}>Cargando resultados...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!exam) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>No se pudo cargar el examen</Text>
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
          <Text style={styles.headerTitle}>Resultados del Examen</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{exam.name}</Text>
          <Text style={styles.headerInfo}>
            {responses.length} participante{responses.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) }}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={[styles.pdfButton, generatingPdf && styles.buttonDisabled]}
          onPress={generatePDF}
          disabled={generatingPdf || responses.length === 0}
          activeOpacity={0.85}
        >
          {generatingPdf ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.pdfButtonText}>Generar PDF de Resultados</Text>
          )}
        </TouchableOpacity>

        {responses.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No hay respuestas aún</Text>
            <Text style={styles.emptySubtext}>
              Los resultados aparecerán aquí cuando los participantes completen el examen.
            </Text>
          </View>
        ) : (
          responses.map((response, index) => (
            <View key={response.id} style={styles.responseCard}>
              <View style={styles.responseHeader}>
                <Text style={styles.responseTitle}>
                  Participante {index + 1}: {response.user_name}
                </Text>
                <Text style={styles.responseDate}>
                  Completado: {new Date(response.completed_at).toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>

              {response.wine_responses && response.wine_responses.length > 0 && (
                <View style={styles.wineResponsesContainer}>
                  {response.wine_responses.map((wineResponse) => {
                    const wine = exam.wines?.find((ew) => ew.wine_id === wineResponse.wine_id)?.wine;
                    return (
                      <View key={wineResponse.id} style={styles.wineResponseCard}>
                        <Text style={styles.wineName}>{wine?.name || 'Vino desconocido'}</Text>
                        
                        {/* Fase Visual */}
                        <View style={styles.phaseSection}>
                          <Text style={styles.phaseTitle}>Fase Visual</Text>
                          {wineResponse.body_intensity && (
                            <Text style={styles.phaseItem}>
                              Intensidad del cuerpo: {wineResponse.body_intensity}/5
                            </Text>
                          )}
                          {wineResponse.clarity && (
                            <Text style={styles.phaseItem}>Claridad: {wineResponse.clarity}/5</Text>
                          )}
                          {wineResponse.effervescence && (
                            <Text style={styles.phaseItem}>
                              Efervescencia: {wineResponse.effervescence}/5
                            </Text>
                          )}
                          {wineResponse.alcohol_level && (
                            <Text style={styles.phaseItem}>
                              Grado alcohólico: {wineResponse.alcohol_level}/10
                            </Text>
                          )}
                        </View>

                        {/* Fase Olfativa */}
                        <View style={styles.phaseSection}>
                          <Text style={styles.phaseTitle}>Fase Olfativa</Text>
                          {wineResponse.detected_aromas && wineResponse.detected_aromas.length > 0 && (
                            <Text style={styles.phaseItem}>
                              Aromas: {wineResponse.detected_aromas.join(', ')}
                            </Text>
                          )}
                          {wineResponse.other_aromas && (
                            <Text style={styles.phaseItem}>Otros: {wineResponse.other_aromas}</Text>
                          )}
                          {wineResponse.aroma_intensity && (
                            <Text style={styles.phaseItem}>Intensidad: {wineResponse.aroma_intensity}</Text>
                          )}
                          {wineResponse.aroma_quality && (
                            <Text style={styles.phaseItem}>Calidad: {wineResponse.aroma_quality}</Text>
                          )}
                          {wineResponse.aroma_complexity && (
                            <Text style={styles.phaseItem}>
                              Complejidad:{' '}
                              {wineResponse.aroma_complexity === 'varios_mezclados'
                                ? 'Varios aromas mezclados'
                                : 'Un aroma destacado'}
                            </Text>
                          )}
                        </View>

                        {/* Fase Gustativa */}
                        <View style={styles.phaseSection}>
                          <Text style={styles.phaseTitle}>Fase Gustativa</Text>
                          {wineResponse.first_impact && (
                            <Text style={styles.phaseItem}>
                              Primer impacto: {wineResponse.first_impact}
                              {wineResponse.other_first_impact && ` (${wineResponse.other_first_impact})`}
                            </Text>
                          )}
                          {wineResponse.recognized_flavors && wineResponse.recognized_flavors.length > 0 && (
                            <Text style={styles.phaseItem}>
                              Sabores: {wineResponse.recognized_flavors.join(', ')}
                              {wineResponse.other_flavors && ` (${wineResponse.other_flavors})`}
                            </Text>
                          )}
                          {wineResponse.acidity_level && (
                            <Text style={styles.phaseItem}>Acidez: {wineResponse.acidity_level}/10</Text>
                          )}
                          {wineResponse.tannin_level && (
                            <Text style={styles.phaseItem}>Tanicidad: {wineResponse.tannin_level}/10</Text>
                          )}
                          {wineResponse.alcohol_sensation && (
                            <Text style={styles.phaseItem}>
                              Alcohol: {wineResponse.alcohol_sensation}/5
                            </Text>
                          )}
                          {wineResponse.body && (
                            <Text style={styles.phaseItem}>Cuerpo: {wineResponse.body}</Text>
                          )}
                          {wineResponse.persistence && (
                            <Text style={styles.phaseItem}>Persistencia: {wineResponse.persistence}</Text>
                          )}
                          {wineResponse.detected_tastes && (
                            <Text style={styles.phaseItem}>{wineResponse.detected_tastes}</Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
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
    fontSize: 26,
    fontWeight: '700',
    color: CELLARIUM.textOnDark,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 17,
    color: CELLARIUM.textOnDarkMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  headerInfo: {
    fontSize: 13,
    color: CELLARIUM.textOnDarkMuted,
    marginTop: 2,
    opacity: 0.9,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    padding: UI.screenPadding,
  },
  pdfButton: {
    backgroundColor: CELLARIUM.primary,
    borderRadius: UI.buttonRadius,
    height: UI.buttonHeight,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  pdfButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: CELLARIUM.card,
    borderRadius: UI.cardRadius,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyText: {
    fontSize: 17,
    color: '#2C2C2C',
    marginBottom: 8,
    textAlign: 'center',
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 14,
    color: CELLARIUM.muted,
    textAlign: 'center',
  },
  responseCard: {
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
  responseHeader: {
    borderBottomWidth: 1,
    borderBottomColor: CELLARIUM.border,
    paddingBottom: 12,
    marginBottom: 12,
  },
  responseTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2C2C2C',
    marginBottom: 4,
  },
  responseDate: {
    fontSize: 13,
    color: CELLARIUM.muted,
  },
  wineResponsesContainer: {
    marginTop: 12,
  },
  wineResponseCard: {
    backgroundColor: CELLARIUM.bg,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: CELLARIUM.border,
  },
  wineName: {
    fontSize: 17,
    fontWeight: '700',
    color: CELLARIUM.primary,
    marginBottom: 12,
  },
  phaseSection: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: CELLARIUM.border,
  },
  phaseTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2C2C2C',
    marginBottom: 8,
  },
  phaseItem: {
    fontSize: 14,
    color: CELLARIUM.muted,
    marginBottom: 4,
    lineHeight: 20,
  },
});

export default TastingExamResultsScreen;

