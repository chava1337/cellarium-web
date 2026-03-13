import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { WineDetailJson, WineDetailResult } from '../types/wineDetails';
import { wineDetailService } from '../services/WineDetailService';
import { useAuth } from '../contexts/AuthContext';
import { fetchWineDetail, getBilingualValue } from '../services/GlobalWineCatalogService';
import { supabase } from '../services/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type FichaExtendidaScreenNavigationProp = StackNavigationProp<RootStackParamList, 'FichaExtendidaScreen'>;
type FichaExtendidaScreenRouteProp = RouteProp<RootStackParamList, 'FichaExtendidaScreen'>;

interface Props {
  navigation: FichaExtendidaScreenNavigationProp;
  route: FichaExtendidaScreenRouteProp;
}

const FichaExtendidaScreen: React.FC<Props> = ({ navigation, route }) => {
  const { wineId, lang = 'es' } = route.params;
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wineDetail, setWineDetail] = useState<WineDetailJson | null>(null);
  const [cacheInfo, setCacheInfo] = useState<{ fromCache: boolean; cacheSource: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGlobalWine, setIsGlobalWine] = useState(false);
  const [globalWineData, setGlobalWineData] = useState<any>(null);

  // Verificar si el usuario puede actualizar fichas
  const canUpdateFicha = user && (user.role === 'owner' || user.role === 'sommelier');

  // Cargar ficha al montar el componente
  useEffect(() => {
    loadWineDetail();
  }, [wineId, lang]);

  const loadWineDetail = async (forceRefresh = false) => {
    try {
      setError(null);
      
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      // PRIMERO: Verificar si el vino viene del catálogo global ANTES de llamar a IA
      console.log('🔍 Verificando si el vino viene del catálogo global...', wineId);
      const { data: wineData, error: wineError } = await supabase
        .from('wines')
        .select('name, tasting_notes, description')
        .eq('id', wineId)
        .single();

      if (wineError) {
        console.error('❌ Error obteniendo datos del vino:', wineError);
        throw new Error('Vino no encontrado');
      }

      console.log('📋 Datos del vino:', { 
        name: wineData?.name, 
        tasting_notes: wineData?.tasting_notes,
        description: wineData?.description?.substring(0, 50) 
      });

      // Verificar si viene del catálogo global (por tasting_notes o por descripción)
      const isFromGlobal = wineData?.tasting_notes === 'Del catálogo global' 
        || wineData?.description?.includes('catálogo global');
      
      console.log('🌐 ¿Viene del catálogo global?', isFromGlobal);
      
      if (isFromGlobal && wineData?.name) {
        console.log('🔎 Buscando en wines_canonical por nombre:', wineData.name);
        // Buscar en wines_canonical por label exacto
        // ✅ CORREGIDO: Selección explícita usando solo columnas reales del esquema
        // Usando: id, winery, label, abv, color, country, region, grapes, serving, image_canonical_url, is_shared, created_at, updated_at, taste_profile, flavors
        const { data: canonicalData, error: canonicalError } = await supabase
          .from('wines_canonical')
          .select(`
            id,
            winery,
            label,
            abv,
            color,
            country,
            region,
            grapes,
            serving,
            image_canonical_url,
            is_shared,
            created_at,
            updated_at,
            taste_profile,
            flavors
            -- ❌ EXCLUIDO: vector_embedding (solo para búsqueda semántica, ~1.5KB innecesario)
          `)
          .eq('label', wineData.name)
          .maybeSingle();

        console.log('📦 Resultado búsqueda canonical:', { 
          found: !!canonicalData, 
          error: canonicalError?.message 
        });

        if (canonicalData && !canonicalError) {
          console.log('✅ Vino encontrado en catálogo global, usando datos canónicos');
          setIsGlobalWine(true);
          setGlobalWineData(canonicalData);
          setWineDetail(null);
          setCacheInfo({
            fromCache: true,
            cacheSource: 'global catalog'
          });
          setLoading(false);
          setRefreshing(false);
          return;
        } else {
          console.log('⚠️ Vino marcado como global pero no encontrado en wines_canonical');
        }
      }

      // Si no es del catálogo global o no se encontró, usar el servicio de IA
      console.log('🤖 Usando servicio de IA para generar ficha');
      const result: WineDetailResult = forceRefresh 
        ? await wineDetailService.forceRegenerate(wineId, lang)
        : await wineDetailService.getWineDetailLocalFirst(wineId, lang);

      setIsGlobalWine(false);
      setWineDetail(result.detail);
      setCacheInfo({
        fromCache: result.fromCache,
        cacheSource: result.cacheSource
      });

    } catch (err: any) {
      console.error('Error cargando ficha:', err);
      setError(err.message || 'No se pudo cargar la ficha del vino');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    if (isGlobalWine) {
      Alert.alert(
        'Información',
        'Este vino proviene del catálogo global y no puede ser actualizado con IA.',
      );
      return;
    }
    
    Alert.alert(
      'Actualizar Ficha',
      '¿Deseas generar una nueva ficha con IA? Esto puede tomar unos momentos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Actualizar', onPress: () => loadWineDetail(true) }
      ]
    );
  };

  const renderLoadingState = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#8B0000" />
      <Text style={styles.loadingText}>🍷 Generando ficha extendida...</Text>
      <Text style={styles.loadingSubtext}>Esto puede tomar unos momentos</Text>
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.errorContainer}>
      <Text style={styles.errorIcon}>❌</Text>
      <Text style={styles.errorTitle}>Error al cargar la ficha</Text>
      <Text style={styles.errorMessage}>{error}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={() => loadWineDetail()}>
        <Text style={styles.retryButtonText}>Reintentar</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSection = (title: string, content: string | string[], icon: string) => {
    if (!content || (Array.isArray(content) && content.length === 0)) return null;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionIcon}>{icon}</Text>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <View style={styles.sectionContent}>
          {Array.isArray(content) ? (
            content.map((item, index) => (
              <Text key={index} style={styles.sectionText}>
                • {item}
              </Text>
            ))
          ) : (
            <Text style={styles.sectionText}>{content}</Text>
          )}
        </View>
      </View>
    );
  };

  const renderGlobalWineDetail = () => {
    if (!globalWineData) return null;

    const pairingArray = Array.isArray(globalWineData.serving?.pairing) 
      ? globalWineData.serving.pairing 
      : (typeof globalWineData.serving?.pairing === 'string' 
          ? globalWineData.serving.pairing.split(',').map((p: string) => p.trim())
          : []);

    return (
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.wineName}>
              {getBilingualValue(globalWineData.label, lang) || getBilingualValue(globalWineData.winery, lang) || 'Vino sin nombre'}
            </Text>
            <Text style={styles.wineSubtitle}>
              {getBilingualValue(globalWineData.country, lang) || ''}{getBilingualValue(globalWineData.region, lang) ? ` • ${getBilingualValue(globalWineData.region, lang)}` : ''}
            </Text>
          </View>
        </View>

        {/* Banner de catálogo global */}
        <View style={styles.cacheInfo}>
          <Text style={styles.cacheText}>
            📚 Información del Catálogo Global
          </Text>
        </View>

        {/* Región */}
        {renderSection('Región', [
          getBilingualValue(globalWineData.country, lang),
          getBilingualValue(globalWineData.region, lang),
        ].filter(Boolean), '🌍')}

        {/* Uvas */}
        {renderSection('Uvas', Array.isArray(globalWineData.grapes) 
          ? globalWineData.grapes 
          : (typeof globalWineData.grapes === 'string' 
              ? globalWineData.grapes.split(',').map((g: string) => g.trim())
              : []), '🍷')}

        {/* Perfil de cata */}
        {globalWineData.tasting_profile && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>👃</Text>
              <Text style={styles.sectionTitle}>Perfil de Cata</Text>
            </View>
            <View style={styles.sectionContent}>
              {(globalWineData.tasting_profile.body !== undefined && globalWineData.tasting_profile.body !== null) && (
                <View style={styles.tastingItem}>
                  <Text style={styles.tastingLabel}>Cuerpo:</Text>
                  <Text style={styles.tastingText}>
                    {Math.round((globalWineData.tasting_profile.body as number) / 20)}/5
                  </Text>
                </View>
              )}
              {(globalWineData.tasting_profile.sweetness !== undefined && globalWineData.tasting_profile.sweetness !== null) && (
                <View style={styles.tastingItem}>
                  <Text style={styles.tastingLabel}>Dulzura:</Text>
                  <Text style={styles.tastingText}>
                    {Math.round((globalWineData.tasting_profile.sweetness as number) / 20)}/5
                  </Text>
                </View>
              )}
              {(globalWineData.tasting_profile.acidity !== undefined && globalWineData.tasting_profile.acidity !== null) && (
                <View style={styles.tastingItem}>
                  <Text style={styles.tastingLabel}>Acidez:</Text>
                  <Text style={styles.tastingText}>
                    {Math.round((globalWineData.tasting_profile.acidity as number) / 20)}/5
                  </Text>
                </View>
              )}
              {(globalWineData.tasting_profile.tannin !== undefined && globalWineData.tasting_profile.tannin !== null) && (
                <View style={styles.tastingItem}>
                  <Text style={styles.tastingLabel}>Taninos:</Text>
                  <Text style={styles.tastingText}>
                    {Math.round((globalWineData.tasting_profile.tannin as number) / 20)}/5
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Servicio */}
        {globalWineData.serving && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>🍽️</Text>
              <Text style={styles.sectionTitle}>Servicio</Text>
            </View>
            <View style={styles.sectionContent}>
              {globalWineData.serving.temperature && (
                <View style={styles.servingItem}>
                  <Text style={styles.servingLabel}>Temperatura:</Text>
                  <Text style={styles.servingText}>{globalWineData.serving.temperature}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Maridajes */}
        {pairingArray.length > 0 && renderSection('Maridajes Recomendados', pairingArray.slice(0, 10), '🍖')}

        {/* Datos técnicos */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionIcon}>📊</Text>
            <Text style={styles.sectionTitle}>Datos Técnicos</Text>
          </View>
          <View style={styles.sectionContent}>
            {/* ✅ CORREGIDO: vintage no existe en esquema real, removido */}
            {globalWineData.abv && (
              <View style={styles.techItem}>
                <Text style={styles.techLabel}>Alcohol:</Text>
                <Text style={styles.techText}>{globalWineData.abv}% vol.</Text>
              </View>
            )}
            {globalWineData.color && (
              <View style={styles.techItem}>
                <Text style={styles.techLabel}>Color:</Text>
                <Text style={styles.techText}>{globalWineData.color}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Espacio inferior */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    );
  };

  const renderWineDetail = () => {
    if (isGlobalWine) {
      return renderGlobalWineDetail();
    }
    
    if (!wineDetail) return null;

    return (
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header con información de caché */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.wineName}>{wineDetail.winery}</Text>
            <Text style={styles.wineSubtitle}>{wineDetail.region.country} • {wineDetail.region.appellation}</Text>
          </View>
          {canUpdateFicha && !isGlobalWine && (
            <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
              <Text style={styles.refreshButtonText}>🔄</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Banner de confianza */}
        {wineDetail.confidence === 'low' && (
          <View style={styles.confidenceBanner}>
            <Text style={styles.confidenceText}>
              ⚠️ {wineDetail.disclaimer}
            </Text>
          </View>
        )}

        {/* Información de caché */}
        {cacheInfo && (
          <View style={styles.cacheInfo}>
            <Text style={styles.cacheText}>
              {cacheInfo.fromCache 
                ? `📱 Desde caché ${cacheInfo.cacheSource}` 
                : '🤖 Generado con IA'
              }
            </Text>
          </View>
        )}

        {/* Secciones de la ficha */}
        {renderSection('Historia de la Bodega', wineDetail.winery_history, '🏛️')}
        
        {renderSection('Región', [
          `${wineDetail.region.country}`,
          `${wineDetail.region.macro_region}`,
          `${wineDetail.region.appellation}`,
          wineDetail.region.subregion ? `${wineDetail.region.subregion}` : ''
        ].filter(Boolean), '🌍')}

        {renderSection('Viñedo', [
          wineDetail.vineyard.site,
          wineDetail.vineyard.terroir
        ], '🍇')}

        {renderSection('Uvas', wineDetail.grapes, '🍷')}

        {renderSection('Vinificación', wineDetail.vinification, '⚗️')}

        {/* Notas de cata */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionIcon}>👃</Text>
            <Text style={styles.sectionTitle}>Notas de Cata</Text>
          </View>
          <View style={styles.sectionContent}>
            <View style={styles.tastingItem}>
              <Text style={styles.tastingLabel}>Aspecto:</Text>
              <Text style={styles.tastingText}>{wineDetail.tasting_notes.appearance}</Text>
            </View>
            <View style={styles.tastingItem}>
              <Text style={styles.tastingLabel}>Nariz:</Text>
              <Text style={styles.tastingText}>{wineDetail.tasting_notes.nose}</Text>
            </View>
            <View style={styles.tastingItem}>
              <Text style={styles.tastingLabel}>Boca:</Text>
              <Text style={styles.tastingText}>{wineDetail.tasting_notes.palate}</Text>
            </View>
            <View style={styles.tastingItem}>
              <Text style={styles.tastingLabel}>Final:</Text>
              <Text style={styles.tastingText}>{wineDetail.tasting_notes.finish}</Text>
            </View>
          </View>
        </View>

        {/* Servicio */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionIcon}>🍽️</Text>
            <Text style={styles.sectionTitle}>Servicio</Text>
          </View>
          <View style={styles.sectionContent}>
            <View style={styles.servingItem}>
              <Text style={styles.servingLabel}>Temperatura:</Text>
              <Text style={styles.servingText}>{wineDetail.serving.temperature_c}°C</Text>
            </View>
            <View style={styles.servingItem}>
              <Text style={styles.servingLabel}>Copa:</Text>
              <Text style={styles.servingText}>{wineDetail.serving.glassware}</Text>
            </View>
            <View style={styles.servingItem}>
              <Text style={styles.servingLabel}>Decantación:</Text>
              <Text style={styles.servingText}>{wineDetail.serving.decanting}</Text>
            </View>
          </View>
        </View>

        {renderSection('Maridajes', wineDetail.food_pairings, '🍖')}

        {/* Datos técnicos */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionIcon}>📊</Text>
            <Text style={styles.sectionTitle}>Datos Técnicos</Text>
          </View>
          <View style={styles.sectionContent}>
            <View style={styles.techItem}>
              <Text style={styles.techLabel}>Añada:</Text>
              <Text style={styles.techText}>{wineDetail.vintage}</Text>
            </View>
            <View style={styles.techItem}>
              <Text style={styles.techLabel}>Estilo:</Text>
              <Text style={styles.techText}>{wineDetail.style}</Text>
            </View>
            <View style={styles.techItem}>
              <Text style={styles.techLabel}>Alcohol:</Text>
              <Text style={styles.techText}>{wineDetail.alcohol_abv}% vol.</Text>
            </View>
            <View style={styles.techItem}>
              <Text style={styles.techLabel}>Azúcar residual:</Text>
              <Text style={styles.techText}>{wineDetail.residual_sugar}</Text>
            </View>
            <View style={styles.techItem}>
              <Text style={styles.techLabel}>Potencial de guarda:</Text>
              <Text style={styles.techText}>{wineDetail.aging_potential}</Text>
            </View>
          </View>
        </View>

        {renderSection('Premios', wineDetail.awards, '🏆')}
        {renderSection('Fuentes', wineDetail.sources, '📚')}

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>{wineDetail.disclaimer}</Text>
        </View>

        {/* Espacio inferior */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header de navegación */}
      <View style={styles.navHeader}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Ficha Extendida</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Contenido principal */}
      {loading && renderLoadingState()}
      {error && renderErrorState()}
      {!loading && !error && renderWineDetail()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 24,
    color: '#8B0000',
  },
  navTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  placeholder: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  loadingText: {
    fontSize: 18,
    color: '#8B0000',
    marginTop: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#8B0000',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerContent: {
    flex: 1,
  },
  wineName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8B0000',
    marginBottom: 4,
  },
  wineSubtitle: {
    fontSize: 16,
    color: '#666',
  },
  refreshButton: {
    padding: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
  },
  refreshButtonText: {
    fontSize: 20,
  },
  confidenceBanner: {
    backgroundColor: '#fff3cd',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
  },
  confidenceText: {
    fontSize: 14,
    color: '#856404',
    fontWeight: '500',
  },
  cacheInfo: {
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cacheText: {
    fontSize: 12,
    color: '#1976d2',
    fontWeight: '500',
  },
  section: {
    backgroundColor: 'white',
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  sectionContent: {
    paddingLeft: 28,
  },
  sectionText: {
    fontSize: 15,
    color: '#555',
    lineHeight: 22,
    marginBottom: 8,
  },
  tastingItem: {
    marginBottom: 12,
  },
  tastingLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#8B0000',
    marginBottom: 4,
  },
  tastingText: {
    fontSize: 15,
    color: '#555',
    lineHeight: 20,
  },
  servingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  servingLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#8B0000',
    flex: 1,
  },
  servingText: {
    fontSize: 15,
    color: '#555',
    flex: 2,
    textAlign: 'right',
  },
  techItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  techLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#8B0000',
    flex: 1,
  },
  techText: {
    fontSize: 15,
    color: '#555',
    flex: 2,
    textAlign: 'right',
  },
  disclaimer: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  disclaimerText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  bottomSpacer: {
    height: 20,
  },
});

export default FichaExtendidaScreen;
