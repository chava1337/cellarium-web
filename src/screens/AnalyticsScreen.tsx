import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { AnalyticsService, WineMetrics, BranchMetrics, ComparisonMetrics } from '../services/AnalyticsService';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';

const { width } = Dimensions.get('window');

type AnalyticsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Analytics'>;
type AnalyticsScreenRouteProp = RouteProp<RootStackParamList, 'Analytics'>;

interface Props {
  navigation: AnalyticsScreenNavigationProp;
  route: AnalyticsScreenRouteProp;
}

type ViewMode = 'overview' | 'wines' | 'comparison';
type SortBy = 'sales' | 'revenue' | 'rotation';

const AnalyticsScreen: React.FC<Props> = ({ navigation, route }) => {
  const { user } = useAuth();
  const { currentBranch, availableBranches } = useBranch();
  const branchId = route.params?.branchId || currentBranch?.id || '';
  
  const isOwner = user?.role === 'owner';

  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [sortBy, setSortBy] = useState<SortBy>('sales');

  // Datos
  const [branchMetrics, setBranchMetrics] = useState<BranchMetrics | null>(null);
  const [winesMetrics, setWinesMetrics] = useState<WineMetrics[]>([]);
  const [comparisonMetrics, setComparisonMetrics] = useState<ComparisonMetrics | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, [branchId, viewMode]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);

      if (viewMode === 'comparison' && isOwner && user) {
        // Cargar comparación entre sucursales
        const comparison = await AnalyticsService.getAllBranchesComparison(user.owner_id || user.id);
        setComparisonMetrics(comparison);
      } else {
        // Cargar métricas de la sucursal actual
        const ownerId = user.owner_id || user.id;
        const [metrics, wines] = await Promise.all([
          AnalyticsService.getBranchMetrics(branchId, ownerId),
          AnalyticsService.getAllWinesMetrics(branchId, ownerId),
        ]);

        setBranchMetrics(metrics);
        setWinesMetrics(wines);
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
      Alert.alert('Error', 'No se pudieron cargar las métricas');
    } finally {
      setLoading(false);
    }
  };

  const getSortedWines = (): WineMetrics[] => {
    let sorted = [...winesMetrics];

    switch (sortBy) {
      case 'sales':
        return sorted.sort((a, b) => b.total_sales - a.total_sales);
      case 'revenue':
        return sorted.sort((a, b) => b.total_revenue - a.total_revenue);
      case 'rotation':
        return sorted.sort((a, b) => b.sales_per_day - a.sales_per_day);
      default:
        return sorted;
    }
  };

  const renderOverviewTab = () => {
    if (!branchMetrics) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No hay datos disponibles</Text>
        </View>
      );
    }

    // Preparar datos para gráfica de pastel (Top 5 vinos por ingresos)
    const topWines = [...winesMetrics]
      .sort((a, b) => b.total_revenue - a.total_revenue)
      .slice(0, 5);

    const pieData = topWines.map((wine, index) => ({
      name: wine.wine_name.substring(0, 15) + (wine.wine_name.length > 15 ? '...' : ''),
      population: wine.total_revenue,
      color: ['#8B0000', '#B22222', '#DC143C', '#FF6347', '#FFA07A'][index],
      legendFontColor: '#333',
      legendFontSize: 12,
    }));

    // Preparar datos para gráfica de barras (Ventas por vino)
    const topSelling = [...winesMetrics]
      .sort((a, b) => b.total_sales - a.total_sales)
      .slice(0, 6);

    const barData = {
      labels: topSelling.map(w => w.wine_name.split(' ')[0].substring(0, 8)),
      datasets: [
        {
          data: topSelling.map(w => w.total_sales),
        },
      ],
    };

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        {/* Estadísticas Principales */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>🍷</Text>
            <Text style={styles.statValue}>{branchMetrics.total_wines}</Text>
            <Text style={styles.statLabel}>Vinos</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>📦</Text>
            <Text style={styles.statValue}>{branchMetrics.total_stock}</Text>
            <Text style={styles.statLabel}>Stock Total</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>💰</Text>
            <Text style={styles.statValue}>${branchMetrics.total_revenue.toFixed(0)}</Text>
            <Text style={styles.statLabel}>Ingresos</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>📈</Text>
            <Text style={styles.statValue}>{branchMetrics.total_sales}</Text>
            <Text style={styles.statLabel}>Ventas</Text>
          </View>
        </View>

        {/* Información Adicional */}
        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Ticket Promedio:</Text>
            <Text style={styles.infoValue}>${branchMetrics.avg_ticket.toFixed(2)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Valor de Inventario:</Text>
            <Text style={styles.infoValue}>${branchMetrics.total_inventory_value.toFixed(2)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Más Vendido:</Text>
            <Text style={styles.infoValue}>{branchMetrics.top_selling_wine}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Mayor Ingreso:</Text>
            <Text style={styles.infoValue}>{branchMetrics.top_revenue_wine}</Text>
          </View>
        </View>

        {/* Alertas */}
        {(branchMetrics.low_stock_count > 0 || branchMetrics.out_of_stock_count > 0) && (
          <View style={styles.alertsSection}>
            <Text style={styles.sectionTitle}>⚠️ Alertas</Text>
            {branchMetrics.low_stock_count > 0 && (
              <View style={styles.alertCard}>
                <Text style={styles.alertIcon}>📉</Text>
                <View style={styles.alertContent}>
                  <Text style={styles.alertTitle}>Stock Bajo</Text>
                  <Text style={styles.alertText}>
                    {branchMetrics.low_stock_count} vino{branchMetrics.low_stock_count > 1 ? 's' : ''} con stock bajo
                  </Text>
                </View>
              </View>
            )}
            {branchMetrics.out_of_stock_count > 0 && (
              <View style={[styles.alertCard, styles.alertCardDanger]}>
                <Text style={styles.alertIcon}>❌</Text>
                <View style={styles.alertContent}>
                  <Text style={styles.alertTitle}>Sin Stock</Text>
                  <Text style={styles.alertText}>
                    {branchMetrics.out_of_stock_count} vino{branchMetrics.out_of_stock_count > 1 ? 's' : ''} agotado{branchMetrics.out_of_stock_count > 1 ? 's' : ''}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Gráfica de Pastel - Top 5 Ingresos */}
        {pieData.length > 0 && (
          <View style={styles.chartSection}>
            <Text style={styles.sectionTitle}>💰 Top 5 Vinos por Ingresos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <PieChart
                data={pieData}
                width={width - 40}
                height={220}
                chartConfig={{
                  color: (opacity = 1) => `rgba(139, 0, 0, ${opacity})`,
                }}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="15"
                absolute
              />
            </ScrollView>
          </View>
        )}

        {/* Gráfica de Barras - Top Ventas */}
        {barData.labels.length > 0 && (
          <View style={styles.chartSection}>
            <Text style={styles.sectionTitle}>📊 Top Vinos por Cantidad Vendida</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <BarChart
                data={barData}
                width={Math.max(width - 40, barData.labels.length * 80)}
                height={220}
                yAxisLabel=""
                yAxisSuffix=""
                chartConfig={{
                  backgroundColor: '#fff',
                  backgroundGradientFrom: '#fff',
                  backgroundGradientTo: '#fff',
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(139, 0, 0, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                  style: {
                    borderRadius: 16,
                  },
                  propsForBackgroundLines: {
                    strokeDasharray: '',
                    stroke: '#e3e3e3',
                  },
                }}
                style={{
                  marginVertical: 8,
                  borderRadius: 16,
                }}
              />
            </ScrollView>
          </View>
        )}
      </ScrollView>
    );
  };

  const renderWinesTab = () => {
    const sortedWines = getSortedWines();

    return (
      <View style={styles.tabContent}>
        {/* Botones de ordenamiento */}
        <View style={styles.sortButtons}>
          <TouchableOpacity
            style={[styles.sortButton, sortBy === 'sales' && styles.sortButtonActive]}
            onPress={() => setSortBy('sales')}
          >
            <Text style={[styles.sortButtonText, sortBy === 'sales' && styles.sortButtonTextActive]}>
              📈 Ventas
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortButton, sortBy === 'revenue' && styles.sortButtonActive]}
            onPress={() => setSortBy('revenue')}
          >
            <Text style={[styles.sortButtonText, sortBy === 'revenue' && styles.sortButtonTextActive]}>
              💰 Ingresos
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortButton, sortBy === 'rotation' && styles.sortButtonActive]}
            onPress={() => setSortBy('rotation')}
          >
            <Text style={[styles.sortButtonText, sortBy === 'rotation' && styles.sortButtonTextActive]}>
              🔄 Rotación
            </Text>
          </TouchableOpacity>
        </View>

        {/* Lista de vinos */}
        <ScrollView style={styles.winesList} showsVerticalScrollIndicator={false}>
          {sortedWines.map((wine, index) => (
            <View key={wine.wine_id} style={styles.wineCard}>
              {/* Ranking */}
              <View style={styles.wineRank}>
                <Text style={styles.wineRankText}>#{index + 1}</Text>
              </View>

              {/* Imagen */}
              {wine.wine_image ? (
                <Image source={{ uri: wine.wine_image }} style={styles.wineImage} />
              ) : (
                <View style={[styles.wineImage, styles.wineImagePlaceholder]}>
                  <Text style={styles.wineImagePlaceholderText}>🍷</Text>
                </View>
              )}

              {/* Información */}
              <View style={styles.wineInfo}>
                <Text style={styles.wineName}>{wine.wine_name}</Text>
                <Text style={styles.wineDetails}>
                  {wine.grape_variety} • {wine.region}, {wine.country}
                </Text>

                {/* Métricas */}
                <View style={styles.wineMetrics}>
                  <View style={styles.wineMetricItem}>
                    <Text style={styles.wineMetricLabel}>Vendidas:</Text>
                    <Text style={styles.wineMetricValue}>{wine.total_sales}</Text>
                  </View>
                  <View style={styles.wineMetricItem}>
                    <Text style={styles.wineMetricLabel}>Ingresos:</Text>
                    <Text style={styles.wineMetricValue}>${wine.total_revenue.toFixed(0)}</Text>
                  </View>
                  <View style={styles.wineMetricItem}>
                    <Text style={styles.wineMetricLabel}>Stock:</Text>
                    <Text style={[
                      styles.wineMetricValue,
                      wine.current_stock <= 5 && styles.wineMetricValueLow
                    ]}>
                      {wine.current_stock}
                    </Text>
                  </View>
                </View>

                {/* Métricas adicionales */}
                <View style={styles.wineExtraMetrics}>
                  <Text style={styles.wineExtraMetric}>
                    🍾 {wine.bottles_sold} botellas • 🍷 {wine.glasses_sold} copas
                  </Text>
                  <Text style={styles.wineExtraMetric}>
                    📊 {wine.sales_per_day.toFixed(2)} ventas/día • 💰 ${wine.revenue_per_day.toFixed(2)}/día
                  </Text>
                  {wine.stock_days_remaining < 30 && wine.stock_days_remaining > 0 && (
                    <Text style={[styles.wineExtraMetric, styles.wineExtraMetricWarning]}>
                      ⚠️ Stock para ~{Math.floor(wine.stock_days_remaining)} días
                    </Text>
                  )}
                </View>
              </View>
            </View>
          ))}

          {sortedWines.length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>📊</Text>
              <Text style={styles.emptyTitle}>No hay datos de ventas</Text>
              <Text style={styles.emptySubtitle}>Las métricas aparecerán cuando haya ventas registradas</Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  };

  const renderComparisonTab = () => {
    if (!comparisonMetrics) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No hay datos de comparación</Text>
        </View>
      );
    }

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        {/* Resumen Global */}
        <View style={styles.comparisonHeader}>
          <Text style={styles.comparisonTitle}>📊 Resumen Global</Text>
          <View style={styles.comparisonStats}>
            <View style={styles.comparisonStatCard}>
              <Text style={styles.comparisonStatValue}>
                ${comparisonMetrics.total_system_revenue.toFixed(0)}
              </Text>
              <Text style={styles.comparisonStatLabel}>Ingresos Totales</Text>
            </View>
            <View style={styles.comparisonStatCard}>
              <Text style={styles.comparisonStatValue}>{comparisonMetrics.total_system_sales}</Text>
              <Text style={styles.comparisonStatLabel}>Ventas Totales</Text>
            </View>
          </View>
          <View style={styles.comparisonInfo}>
            <Text style={styles.comparisonInfoText}>
              🏆 Mejor: {comparisonMetrics.best_performing_branch}
            </Text>
            <Text style={styles.comparisonInfoText}>
              📉 A mejorar: {comparisonMetrics.worst_performing_branch}
            </Text>
          </View>
        </View>

        {/* Comparación por Sucursal */}
        <Text style={styles.sectionTitle}>🏢 Comparación por Sucursal</Text>
        {comparisonMetrics.branches
          .sort((a, b) => b.total_revenue - a.total_revenue)
          .map((branch, index) => (
            <View key={branch.branch_id} style={styles.branchComparisonCard}>
              <View style={styles.branchComparisonHeader}>
                <View style={styles.branchRank}>
                  <Text style={styles.branchRankText}>#{index + 1}</Text>
                </View>
                <Text style={styles.branchComparisonName}>{branch.branch_name}</Text>
              </View>

              <View style={styles.branchComparisonMetrics}>
                <View style={styles.branchComparisonMetricRow}>
                  <Text style={styles.branchComparisonLabel}>Vinos:</Text>
                  <Text style={styles.branchComparisonValue}>{branch.total_wines}</Text>
                </View>
                <View style={styles.branchComparisonMetricRow}>
                  <Text style={styles.branchComparisonLabel}>Stock Total:</Text>
                  <Text style={styles.branchComparisonValue}>{branch.total_stock}</Text>
                </View>
                <View style={styles.branchComparisonMetricRow}>
                  <Text style={styles.branchComparisonLabel}>Ventas:</Text>
                  <Text style={styles.branchComparisonValue}>{branch.total_sales}</Text>
                </View>
                <View style={styles.branchComparisonMetricRow}>
                  <Text style={styles.branchComparisonLabel}>Ingresos:</Text>
                  <Text style={[styles.branchComparisonValue, styles.branchComparisonValueHighlight]}>
                    ${branch.total_revenue.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.branchComparisonMetricRow}>
                  <Text style={styles.branchComparisonLabel}>Ticket Promedio:</Text>
                  <Text style={styles.branchComparisonValue}>${branch.avg_ticket.toFixed(2)}</Text>
                </View>
              </View>

              {/* Progress bar de contribución */}
              <View style={styles.contributionBar}>
                <Text style={styles.contributionLabel}>Contribución al total:</Text>
                <View style={styles.contributionBarContainer}>
                  <View
                    style={[
                      styles.contributionBarFill,
                      {
                        width: `${(branch.total_revenue / comparisonMetrics.total_system_revenue) * 100}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.contributionPercent}>
                  {((branch.total_revenue / comparisonMetrics.total_system_revenue) * 100).toFixed(1)}%
                </Text>
              </View>
            </View>
          ))}
      </ScrollView>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8B0000" />
        <Text style={styles.loadingText}>Cargando análisis...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.title}>📊 Análisis y Reportes</Text>
          <Text style={styles.subtitle}>{currentBranch?.name}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, viewMode === 'overview' && styles.tabActive]}
          onPress={() => setViewMode('overview')}
        >
          <Text style={[styles.tabText, viewMode === 'overview' && styles.tabTextActive]}>
            📈 General
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, viewMode === 'wines' && styles.tabActive]}
          onPress={() => setViewMode('wines')}
        >
          <Text style={[styles.tabText, viewMode === 'wines' && styles.tabTextActive]}>
            🍷 Por Vino
          </Text>
        </TouchableOpacity>
        {isOwner && availableBranches.length > 1 && (
          <TouchableOpacity
            style={[styles.tab, viewMode === 'comparison' && styles.tabActive]}
            onPress={() => setViewMode('comparison')}
          >
            <Text style={[styles.tabText, viewMode === 'comparison' && styles.tabTextActive]}>
              🏢 Sucursales
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      {viewMode === 'overview' && renderOverviewTab()}
      {viewMode === 'wines' && renderWinesTab()}
      {viewMode === 'comparison' && renderComparisonTab()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    marginRight: 12,
    padding: 8,
  },
  backButtonText: {
    fontSize: 24,
    color: '#8B0000',
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#8B0000',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#8B0000',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#8B0000',
  },
  tabContent: {
    flex: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8B0000',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },
  infoSection: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  alertsSection: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  alertCard: {
    flexDirection: 'row',
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
  },
  alertCardDanger: {
    backgroundColor: '#f8d7da',
    borderLeftColor: '#dc3545',
  },
  alertIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  alertText: {
    fontSize: 12,
    color: '#666',
  },
  chartSection: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  sortButtons: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  sortButton: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  sortButtonActive: {
    backgroundColor: '#8B0000',
    borderColor: '#8B0000',
  },
  sortButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  sortButtonTextActive: {
    color: '#fff',
  },
  winesList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  wineCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  wineRank: {
    width: 32,
    height: 32,
    backgroundColor: '#8B0000',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  wineRankText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  wineImage: {
    width: 60,
    height: 90,
    borderRadius: 8,
    marginRight: 12,
  },
  wineImagePlaceholder: {
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  wineImagePlaceholderText: {
    fontSize: 24,
  },
  wineInfo: {
    flex: 1,
  },
  wineName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  wineDetails: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  wineMetrics: {
    flexDirection: 'row',
    marginBottom: 8,
    gap: 12,
  },
  wineMetricItem: {
    flex: 1,
  },
  wineMetricLabel: {
    fontSize: 10,
    color: '#999',
    marginBottom: 2,
  },
  wineMetricValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#8B0000',
  },
  wineMetricValueLow: {
    color: '#dc3545',
  },
  wineExtraMetrics: {
    gap: 4,
  },
  wineExtraMetric: {
    fontSize: 10,
    color: '#666',
  },
  wineExtraMetricWarning: {
    color: '#dc3545',
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  comparisonHeader: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  comparisonTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  comparisonStats: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  comparisonStatCard: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  comparisonStatValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#8B0000',
    marginBottom: 4,
  },
  comparisonStatLabel: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
  },
  comparisonInfo: {
    gap: 8,
  },
  comparisonInfoText: {
    fontSize: 13,
    color: '#666',
  },
  branchComparisonCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  branchComparisonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  branchRank: {
    width: 32,
    height: 32,
    backgroundColor: '#8B0000',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  branchRankText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  branchComparisonName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  branchComparisonMetrics: {
    gap: 8,
    marginBottom: 12,
  },
  branchComparisonMetricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  branchComparisonLabel: {
    fontSize: 13,
    color: '#666',
  },
  branchComparisonValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#333',
  },
  branchComparisonValueHighlight: {
    color: '#8B0000',
    fontSize: 14,
  },
  contributionBar: {
    marginTop: 8,
  },
  contributionLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
  },
  contributionBarContainer: {
    height: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  contributionBarFill: {
    height: '100%',
    backgroundColor: '#8B0000',
  },
  contributionPercent: {
    fontSize: 11,
    color: '#8B0000',
    fontWeight: 'bold',
    marginTop: 4,
    textAlign: 'right',
  },
});

export default AnalyticsScreen;
