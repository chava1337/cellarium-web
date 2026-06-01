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
import { useLanguage } from '../contexts/LanguageContext';
import { TastingExamService, TastingExam, TastingResponse } from '../services/TastingExamService';
import { getAppLocaleTag } from '../utils/appLocale';
import { tastingDisplayValue } from '../utils/tastingDisplay';
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

type TranslateFn = (key: string) => string;

function formatPdfStoredValue(
  t: TranslateFn,
  qKey: string,
  rawValue: unknown,
  wineResponse: Record<string, unknown>
): string {
  if (rawValue === null || rawValue === undefined || rawValue === '') return '-';

  if (qKey === 'detected_aromas' || qKey === 'recognized_flavors') {
    const arr = Array.isArray(rawValue) ? rawValue : [rawValue];
    let value = arr.map((v) => tastingDisplayValue(t, String(v))).join(', ');
    if (qKey === 'recognized_flavors' && wineResponse.other_flavors) {
      value += ` (${wineResponse.other_flavors})`;
    }
    return value || '-';
  }

  if (qKey === 'first_impact' && rawValue === 'otra' && wineResponse.other_first_impact) {
    const label = tastingDisplayValue(t, String(rawValue));
    return `${label}: ${wineResponse.other_first_impact}`;
  }

  if (Array.isArray(rawValue)) {
    const mapped = rawValue.map((v) => tastingDisplayValue(t, String(v))).filter(Boolean);
    return mapped.length > 0 ? mapped.join(', ') : '-';
  }

  const displayed = tastingDisplayValue(t, String(rawValue));
  return displayed || String(rawValue);
}

function generateHTMLContent(
  exam: TastingExam,
  responses: TastingResponse[],
  t: TranslateFn,
  localeTag: string
): string {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(localeTag, {
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
    if (!wine) return t('tasting.unknown_wine');

    const name = wine.name?.trim() || '';
    const winery = wine.winery?.trim() || '';

    if (name && winery) return `${name} - ${winery}`;
    if (name) return name;
    if (winery) return winery;
    return t('tasting.unknown_wine');
  };

  const getWineType = (wineId: string): string => {
    const examWine = exam.wines?.find((ew) => ew.wine_id === wineId);
    return examWine?.wine?.type || 'red';
  };

  const getAllQuestions = (
    wineId: string
  ): Array<{ phaseKey: string; question: string; key: string }> => {
    const wineType = getWineType(wineId);
    const questions: Array<{ phaseKey: string; question: string; key: string }> = [];

    if (wineType === 'red') {
      questions.push({
        phaseKey: 'tasting.phase_visual',
        question: t('tasting.q_body_intensity'),
        key: 'body_intensity',
      });
    } else if (wineType === 'white' || wineType === 'rose') {
      questions.push({
        phaseKey: 'tasting.phase_visual',
        question: t('tasting.q_clarity'),
        key: 'clarity',
      });
    } else if (wineType === 'sparkling') {
      questions.push({
        phaseKey: 'tasting.phase_visual',
        question: t('tasting.q_clarity'),
        key: 'clarity',
      });
      questions.push({
        phaseKey: 'tasting.phase_visual',
        question: t('tasting.q_effervescence'),
        key: 'effervescence',
      });
    }
    questions.push({
      phaseKey: 'tasting.phase_visual',
      question: t('tasting.q_alcohol_level'),
      key: 'alcohol_level',
    });

    questions.push({
      phaseKey: 'tasting.phase_olfative',
      question: t('tasting.q_detected_aromas'),
      key: 'detected_aromas',
    });
    questions.push({
      phaseKey: 'tasting.phase_olfative',
      question: t('tasting.other_aromas_placeholder'),
      key: 'other_aromas',
    });
    questions.push({
      phaseKey: 'tasting.phase_olfative',
      question: t('tasting.q_intensity'),
      key: 'aroma_intensity',
    });
    questions.push({
      phaseKey: 'tasting.phase_olfative',
      question: t('tasting.q_quality'),
      key: 'aroma_quality',
    });
    questions.push({
      phaseKey: 'tasting.phase_olfative',
      question: t('tasting.q_complexity'),
      key: 'aroma_complexity',
    });

    questions.push({
      phaseKey: 'tasting.phase_gustative',
      question: t('tasting.q_first_impact'),
      key: 'first_impact',
    });
    questions.push({
      phaseKey: 'tasting.phase_gustative',
      question: t('tasting.other_first_impact_placeholder'),
      key: 'other_first_impact',
    });
    questions.push({
      phaseKey: 'tasting.phase_gustative',
      question: t('tasting.q_recognized_flavors'),
      key: 'recognized_flavors',
    });
    questions.push({
      phaseKey: 'tasting.phase_gustative',
      question: t('tasting.other_flavors_placeholder'),
      key: 'other_flavors',
    });
    questions.push({
      phaseKey: 'tasting.phase_gustative',
      question: t('tasting.q_acidity'),
      key: 'acidity_level',
    });
    if (wineType === 'red') {
      questions.push({
        phaseKey: 'tasting.phase_gustative',
        question: t('tasting.q_tannin'),
        key: 'tannin_level',
      });
    }
    questions.push({
      phaseKey: 'tasting.phase_gustative',
      question: t('tasting.q_alcohol_warmth'),
      key: 'alcohol_sensation',
    });
    questions.push({
      phaseKey: 'tasting.phase_gustative',
      question: t('tasting.q_body'),
      key: 'body',
    });
    questions.push({
      phaseKey: 'tasting.phase_gustative',
      question: t('tasting.q_persistence'),
      key: 'persistence',
    });
    questions.push({
      phaseKey: 'tasting.phase_gustative',
      question: t('tasting.q_detected_tastes'),
      key: 'detected_tastes',
    });

    return questions;
  };

  const participantCountLabel =
    responses.length === 1
      ? t('tasting.participant_one').replace('{count}', String(responses.length))
      : t('tasting.participant_many').replace('{count}', String(responses.length));

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
        <h1>${t('tasting.results_title')}: ${exam.name}</h1>
        <div class="header-info">
          <p><strong>${t('tasting.created')}</strong> ${formatDate(exam.created_at)} | 
          <strong>${participantCountLabel}</strong>${exam.description ? ` | <strong>${t('tasting.description_label')}</strong> ${exam.description}` : ''}</p>
        </div>
    `;

  if (exam.wines && exam.wines.length > 0) {
    exam.wines.forEach((examWine) => {
      const wineName = getWineName(examWine.wine_id);
      const questions = getAllQuestions(examWine.wine_id);
      const totalColumns = responses.length > 0 ? responses.length + 1 : 2;
      const questionHeader = t('tasting.q_detected_aromas');

      html += `
          <div class="wine-section">
            <h2>${wineName}</h2>
            <table>
              <thead>
                <tr>
                  <th class="question-cell">${questionHeader}</th>
        `;

      if (responses.length === 0) {
        html += `<th class="participant-cell">${t('tasting.empty_no_responses')}</th>`;
      } else {
        responses.forEach((response) => {
          const userName = response.user_name || '-';
          html += `<th class="participant-cell">${userName}</th>`;
        });
      }

      html += `
                </tr>
              </thead>
              <tbody>
        `;

      let currentPhaseKey = '';
      let rowIndex = 0;
      questions.forEach((q) => {
        if (currentPhaseKey !== q.phaseKey) {
          currentPhaseKey = q.phaseKey;
          html += `
              <tr>
                <td colspan="${totalColumns}" class="phase-header">${t(q.phaseKey).toUpperCase()}</td>
              </tr>
            `;
          rowIndex++;
        }

        const rowClass = rowIndex % 2 === 0 ? 'question-row' : '';
        html += `<tr class="${rowClass}">`;
        html += `<td class="question-cell">${q.question}</td>`;

        if (responses.length === 0) {
          html += `<td class="participant-cell">-</td>`;
        } else {
          responses.forEach((response) => {
            const wineResponsesList =
              (response as { tasting_wine_responses?: TastingResponse['wine_responses'] })
                .tasting_wine_responses || response.wine_responses || [];
            const examWineIdStr = String(examWine.wine_id);
            const wineResponse = wineResponsesList.find(
              (wr) => String(wr.wine_id) === examWineIdStr
            ) as Record<string, unknown> | undefined;

            let value = '-';
            if (wineResponse) {
              const rawValue = wineResponse[q.key];
              if (rawValue !== null && rawValue !== undefined && rawValue !== '') {
                value = formatPdfStoredValue(t, q.key, rawValue, wineResponse);
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
}

const TastingExamResultsScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { examId } = route.params;
  const { user } = useAuth();
  const { t, language } = useLanguage();
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
        Alert.alert(t('common.error'), t('tasting.error_not_found'), [
          { text: t('common.ok'), onPress: () => navigation.goBack() },
        ]);
        return;
      }

      setExam(examData);
      setResponses(responsesData);
    } catch (error: any) {
      console.error('Error loading results:', error);
      Alert.alert(t('common.error'), error.message || t('tasting.error_load_results'));
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = async () => {
    if (!exam || responses.length === 0) {
      Alert.alert(t('common.error'), t('tasting.error_no_pdf_data'));
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
      const htmlContent = generateHTMLContent(exam, responses, t, getAppLocaleTag(language));

      // Generar PDF usando expo-print en formato horizontal
      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
        base64: false,
      });
      
      // Compartir el PDF
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert(t('common.ok'), uri);
      }
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      Alert.alert(t('common.error'), error.message || t('tasting.error_pdf'));
    } finally {
      setGeneratingPdf(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={CELLARIUM.primary} />
          <Text style={styles.loadingText}>{t('tasting.loading_results')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!exam) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{t('tasting.error_load_exam')}</Text>
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
          <Text style={styles.headerTitle}>{t('tasting.results_title')}</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{exam.name}</Text>
          <Text style={styles.headerInfo}>
            {responses.length === 1
              ? t('tasting.participant_one').replace('{count}', String(responses.length))
              : t('tasting.participant_many').replace('{count}', String(responses.length))}
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
            <Text style={styles.pdfButtonText}>{t('tasting.generate_pdf')}</Text>
          )}
        </TouchableOpacity>

        {responses.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('tasting.empty_no_responses')}</Text>
            <Text style={styles.emptySubtext}>{t('tasting.empty_responses_hint')}</Text>
          </View>
        ) : (
          responses.map((response, index) => (
            <View key={response.id} style={styles.responseCard}>
              <View style={styles.responseHeader}>
                <Text style={styles.responseTitle}>
                  {t('tasting.participant_label')
                    .replace('{index}', String(index + 1))
                    .replace('{name}', response.user_name || '-')}
                </Text>
                <Text style={styles.responseDate}>
                  {t('tasting.completed_at').replace(
                    '{date}',
                    new Date(response.completed_at).toLocaleDateString(getAppLocaleTag(language), {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  )}
                </Text>
              </View>

              {response.wine_responses && response.wine_responses.length > 0 && (
                <View style={styles.wineResponsesContainer}>
                  {response.wine_responses.map((wineResponse) => {
                    const wine = exam.wines?.find((ew) => ew.wine_id === wineResponse.wine_id)?.wine;
                    return (
                      <View key={wineResponse.id} style={styles.wineResponseCard}>
                        <Text style={styles.wineName}>{wine?.name || t('tasting.unknown_wine')}</Text>

                        <View style={styles.phaseSection}>
                          <Text style={styles.phaseTitle}>{t('tasting.phase_visual')}</Text>
                          {wineResponse.body_intensity && (
                            <Text style={styles.phaseItem}>
                              {t('tasting.q_body_intensity')}: {wineResponse.body_intensity}/5
                            </Text>
                          )}
                          {wineResponse.clarity && (
                            <Text style={styles.phaseItem}>
                              {t('tasting.q_clarity')}: {wineResponse.clarity}/5
                            </Text>
                          )}
                          {wineResponse.effervescence && (
                            <Text style={styles.phaseItem}>
                              {t('tasting.q_effervescence')}: {wineResponse.effervescence}/5
                            </Text>
                          )}
                          {wineResponse.alcohol_level && (
                            <Text style={styles.phaseItem}>
                              {t('tasting.q_alcohol_level')}: {wineResponse.alcohol_level}/10
                            </Text>
                          )}
                        </View>

                        <View style={styles.phaseSection}>
                          <Text style={styles.phaseTitle}>{t('tasting.phase_olfative')}</Text>
                          {wineResponse.detected_aromas && wineResponse.detected_aromas.length > 0 && (
                            <Text style={styles.phaseItem}>
                              {t('tasting.q_detected_aromas')}:{' '}
                              {wineResponse.detected_aromas
                                .map((a) => tastingDisplayValue(t, a))
                                .join(', ')}
                            </Text>
                          )}
                          {wineResponse.other_aromas && (
                            <Text style={styles.phaseItem}>
                              {t('tasting.other_aromas_placeholder')}: {wineResponse.other_aromas}
                            </Text>
                          )}
                          {wineResponse.aroma_intensity && (
                            <Text style={styles.phaseItem}>
                              {t('tasting.q_intensity')}: {tastingDisplayValue(t, wineResponse.aroma_intensity)}
                            </Text>
                          )}
                          {wineResponse.aroma_quality && (
                            <Text style={styles.phaseItem}>
                              {t('tasting.q_quality')}: {tastingDisplayValue(t, wineResponse.aroma_quality)}
                            </Text>
                          )}
                          {wineResponse.aroma_complexity && (
                            <Text style={styles.phaseItem}>
                              {t('tasting.q_complexity')}:{' '}
                              {tastingDisplayValue(t, wineResponse.aroma_complexity)}
                            </Text>
                          )}
                        </View>

                        <View style={styles.phaseSection}>
                          <Text style={styles.phaseTitle}>{t('tasting.phase_gustative')}</Text>
                          {wineResponse.first_impact && (
                            <Text style={styles.phaseItem}>
                              {t('tasting.q_first_impact')}: {tastingDisplayValue(t, wineResponse.first_impact)}
                              {wineResponse.other_first_impact && ` (${wineResponse.other_first_impact})`}
                            </Text>
                          )}
                          {wineResponse.recognized_flavors && wineResponse.recognized_flavors.length > 0 && (
                            <Text style={styles.phaseItem}>
                              {t('tasting.q_recognized_flavors')}:{' '}
                              {wineResponse.recognized_flavors
                                .map((f) => tastingDisplayValue(t, f))
                                .join(', ')}
                              {wineResponse.other_flavors && ` (${wineResponse.other_flavors})`}
                            </Text>
                          )}
                          {wineResponse.acidity_level && (
                            <Text style={styles.phaseItem}>
                              {t('tasting.q_acidity')}: {wineResponse.acidity_level}/10
                            </Text>
                          )}
                          {wineResponse.tannin_level && (
                            <Text style={styles.phaseItem}>
                              {t('tasting.q_tannin')}: {wineResponse.tannin_level}/10
                            </Text>
                          )}
                          {wineResponse.alcohol_sensation && (
                            <Text style={styles.phaseItem}>
                              {t('tasting.q_alcohol_warmth')}: {wineResponse.alcohol_sensation}/5
                            </Text>
                          )}
                          {wineResponse.body && (
                            <Text style={styles.phaseItem}>
                              {t('tasting.q_body')}: {tastingDisplayValue(t, wineResponse.body)}
                            </Text>
                          )}
                          {wineResponse.persistence && (
                            <Text style={styles.phaseItem}>
                              {t('tasting.q_persistence')}: {tastingDisplayValue(t, wineResponse.persistence)}
                            </Text>
                          )}
                          {wineResponse.detected_tastes && (
                            <Text style={styles.phaseItem}>
                              {t('tasting.q_detected_tastes')}: {wineResponse.detected_tastes}
                            </Text>
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

