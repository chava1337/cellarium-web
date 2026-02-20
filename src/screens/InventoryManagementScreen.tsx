import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { RootStackParamList } from '../types';
import { InventoryService, InventoryItem, InventoryStats } from '../services/InventoryService';
import { PDFReportService } from '../services/PDFReportService';
import { AnalyticsService, WineMetrics, ComparisonMetrics } from '../services/AnalyticsService';
import { WineService } from '../services/WineService';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { useDeviceInfo } from '../hooks/useDeviceInfo';
import { useAdminGuard } from '../hooks/useAdminGuard';
import { PendingApprovalMessage } from '../components/PendingApprovalMessage';
import { supabase } from '../lib/supabase';

type InventoryManagementScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'InventoryManagement'
>;
type InventoryManagementScreenRouteProp = RouteProp<RootStackParamList, 'InventoryManagement'>;

interface Props {
  navigation: InventoryManagementScreenNavigationProp;
  route: InventoryManagementScreenRouteProp;
}

type ReductionReason = 'venta' | 'rotura' | 'expiracion' | 'otro';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isTablet = SCREEN_WIDTH >= 768;

const InventoryManagementScreen: React.FC<Props> = ({ navigation, route }) => {
  const { status: guardStatus } = useAdminGuard({ navigation, route });
  const { user } = useAuth();
  const { currentBranch, availableBranches } = useBranch();
  const deviceInfo = useDeviceInfo();
  const insets = useSafeAreaInsets();
  const branchId = route.params?.branchId || currentBranch?.id || '';

  const isOwner = user?.role === 'owner';
  const canCompareBranches = isOwner && availableBranches.length >= 2;

  // Estados principales
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [filteredInventory, setFilteredInventory] = useState<InventoryItem[]>([]);
  const [stats, setStats] = useState<InventoryStats>({
    totalWines: 0,
    totalBottles: 0,
    totalValue: 0,
    lowStockCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'low_stock'>('all');
  const [activeTab, setActiveTab] = useState<'inventory' | 'sales' | 'analytics'>('inventory');

  // Estados de ventas y analytics
  const [topWines, setTopWines] = useState<WineMetrics[]>([]);
  const [bottomWines, setBottomWines] = useState<WineMetrics[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesStats, setSalesStats] = useState({
    totalSales: 0,
    totalRevenue: 0,
    avgTicket: 0,
  });
  const [comparisonMetrics, setComparisonMetrics] = useState<ComparisonMetrics | null>(null);
  const [deletingWine, setDeletingWine] = useState(false);

  // Modal de ajuste de stock
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<'entrada' | 'salida' | 'ajuste'>('entrada');
  const [adjustmentQuantity, setAdjustmentQuantity] = useState('');
  const [reductionReason, setReductionReason] = useState<ReductionReason | ''>('');
  const [customReason, setCustomReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);

  // Modal de edición de vino
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingWine, setEditingWine] = useState<InventoryItem | null>(null);
  const [wineEditData, setWineEditData] = useState({
    name: '',
    winery: '',
    grape_variety: '',
    region: '',
    country: '',
    vintage: '',
    description: '',
    tasting_notes: '',
    price_bottle: '',
    price_glass: '',
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingWine, setSavingWine] = useState(false);

  useEffect(() => {
    loadInventory();
    if (activeTab === 'sales' || activeTab === 'analytics') {
      loadSalesData();
    }
  }, [branchId, activeTab]);

  useEffect(() => {
    filterInventory();
  }, [inventory, searchQuery, filterType]);

  if (guardStatus === 'loading' || guardStatus === 'profile_loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa' }}>
        <ActivityIndicator size="large" color="#8B0000" />
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

  const loadInventory = async () => {
    try {
      setLoading(true);
      
      if (!user) {
        Alert.alert('Error', 'Usuario no autenticado');
        return;
      }
      
      const ownerId = user.owner_id || user.id;
      const [inventoryData, statsData] = await Promise.all([
        InventoryService.getInventoryByBranch(branchId, ownerId),
        InventoryService.getInventoryStats(branchId, ownerId),
      ]);

      setInventory(inventoryData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading inventory:', error);
      Alert.alert('Error', 'No se pudo cargar el inventario');
    } finally {
      setLoading(false);
    }
  };

  const loadSalesData = async () => {
    if (!user || !branchId) return;
    
    try {
      setSalesLoading(true);
      const ownerId = user.owner_id || user.id;
      
      try {
        const [top, bottom, branchMetrics] = await Promise.all([
          AnalyticsService.getTopSellingWines(branchId, ownerId, 10),
          AnalyticsService.getSlowestMovingWines(branchId, ownerId, 10),
          AnalyticsService.getBranchMetrics(branchId, ownerId),
        ]);

        setTopWines(top);
        setBottomWines(bottom);

        if (branchMetrics) {
          setSalesStats({
            totalSales: branchMetrics.total_sales,
            totalRevenue: branchMetrics.total_revenue,
            avgTicket: branchMetrics.avg_ticket,
          });
        }
      } catch (error: any) {
        // Manejar errores cuando sale_items no existe
        if (error?.code === 'PGRST205' && error?.message?.includes('sale_items')) {
          console.log('⚠️ Tabla sale_items no existe aún, estableciendo valores por defecto');
          setTopWines([]);
          setBottomWines([]);
          setSalesStats({
            totalSales: 0,
            totalRevenue: 0,
            avgTicket: 0,
          });
        } else {
          throw error;
        }
      }

      // Cargar comparación si es owner y hay 2+ sucursales
      if (activeTab === 'analytics' && canCompareBranches) {
        try {
          const comparison = await AnalyticsService.getAllBranchesComparison(ownerId);
          setComparisonMetrics(comparison);
        } catch (error: any) {
          if (error?.code === 'PGRST205' && error?.message?.includes('sale_items')) {
            console.log('⚠️ Tabla sale_items no existe aún para comparación');
            setComparisonMetrics(null);
          }
        }
      }
    } catch (error) {
      console.error('Error loading sales data:', error);
    } finally {
      setSalesLoading(false);
    }
  };

  const filterInventory = () => {
    let filtered = [...inventory];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.wines.name.toLowerCase().includes(query) ||
          item.wines.grape_variety?.toLowerCase().includes(query) ||
          item.wines.region?.toLowerCase().includes(query) ||
          item.wines.country?.toLowerCase().includes(query)
      );
    }

    if (filterType === 'low_stock') {
      filtered = filtered.filter((item) => item.stock_quantity <= 5);
    }

    setFilteredInventory(filtered);
  };

  const openAdjustmentModal = (item: InventoryItem, type: 'entrada' | 'salida' | 'ajuste') => {
    setSelectedItem(item);
    setAdjustmentType(type);
    setAdjustmentQuantity('');
    setReductionReason('');
    setCustomReason('');
    setModalVisible(true);
  };

  const handleStockAdjustment = async () => {
    if (!selectedItem || !user) {
      Alert.alert('Error', 'Datos insuficientes');
      return;
    }

    const quantity = parseInt(adjustmentQuantity);
    if (isNaN(quantity) || quantity <= 0) {
      Alert.alert('Error', 'Ingresa una cantidad válida');
      return;
    }

    let reason = '';
    if (adjustmentType === 'salida') {
      if (!reductionReason) {
        Alert.alert('Error', 'Selecciona una razón para la reducción');
        return;
      }
      if (reductionReason === 'otro') {
        if (!customReason.trim()) {
          Alert.alert('Error', 'Ingresa la razón personalizada');
          return;
        }
        reason = customReason.trim();
      } else {
        reason = reductionReason;
      }
    } else {
      if (!customReason.trim()) {
        Alert.alert('Error', 'Ingresa un motivo para el ajuste');
        return;
      }
      reason = customReason.trim();
    }

    try {
      setAdjusting(true);

      let quantityChange = quantity;
      if (adjustmentType === 'salida') {
        quantityChange = -quantity;
      }

      await InventoryService.updateStock(
        selectedItem.id,
        selectedItem.wine_id,
        branchId,
        quantityChange,
        adjustmentType,
        reason,
        user.id,
        user.owner_id || user.id
      );

      Alert.alert('Éxito', 'Stock actualizado correctamente');
      setModalVisible(false);
      loadInventory();
    } catch (error) {
      console.error('Error adjusting stock:', error);
      Alert.alert('Error', 'No se pudo actualizar el stock');
    } finally {
      setAdjusting(false);
    }
  };

  const openEditModal = (item: InventoryItem) => {
    setEditingWine(item);
    setWineEditData({
      name: item.wines.name || '',
      winery: (item.wines as any).winery || '',
      grape_variety: item.wines.grape_variety || '',
      region: item.wines.region || '',
      country: item.wines.country || '',
      vintage: item.wines.vintage?.toString() || '',
      description: (item.wines as any).description || '',
      tasting_notes: (item.wines as any).tasting_notes || '',
      price_bottle: item.price_by_bottle?.toString() || '',
      price_glass: item.price_by_glass?.toString() || '',
    });
    setEditModalVisible(true);
  };

  const handleDeleteWine = async (item: InventoryItem) => {
    if (!user || !item) return;

    Alert.alert(
      'Eliminar Vino',
      `¿Estás seguro de que deseas eliminar "${item.wines.name}" del catálogo?\n\nEsta acción eliminará el vino y todo su stock. Podrás volver a agregarlo desde el catálogo global.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingWine(true);
              const ownerId = user.owner_id || user.id;

              // Eliminar stock primero
              await supabase
                .from('wine_branch_stock')
                .delete()
                .eq('wine_id', item.wine_id)
                .eq('branch_id', branchId);

              // Eliminar el vino
              await WineService.deleteWine(item.wine_id, ownerId);

              Alert.alert('Éxito', 'Vino eliminado correctamente del catálogo');
              loadInventory();
            } catch (error) {
              console.error('Error deleting wine:', error);
              Alert.alert('Error', 'No se pudo eliminar el vino');
            } finally {
              setDeletingWine(false);
            }
          },
        },
      ]
    );
  };

  const handleSelectImage = async () => {
    if (!editingWine || !user) return;

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a la galería');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaType.Images,
        quality: 0.8,
        allowsEditing: true,
        aspect: [3, 4],
      });

      if (result.canceled || !result.assets[0]) return;

      setUploadingImage(true);

      // Subir imagen a Supabase Storage
      const imageUri = result.assets[0].uri;
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const fileExt = imageUri.split('.').pop();
      const fileName = `${editingWine.wine_id}-${Date.now()}.${fileExt}`;
      const filePath = `wines/${user.owner_id || user.id}/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('wine-images')
        .upload(filePath, blob, {
          contentType: `image/${fileExt}`,
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Obtener URL pública
      const { data: urlData } = supabase.storage
        .from('wine-images')
        .getPublicUrl(filePath);

      // Actualizar vino con nueva imagen
      const ownerId = user.owner_id || user.id;
      await WineService.updateWine(editingWine.wine_id, ownerId, {
        image_url: urlData.publicUrl,
      });

      Alert.alert('Éxito', 'Imagen actualizada correctamente');
      loadInventory();
      setEditModalVisible(false);
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', 'No se pudo actualizar la imagen');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveWine = async () => {
    if (!editingWine || !user) return;

    try {
      setSavingWine(true);
      const ownerId = user.owner_id || user.id;

      // Actualizar datos del vino
      await WineService.updateWine(editingWine.wine_id, ownerId, {
        name: wineEditData.name,
        winery: wineEditData.winery || null,
        grape_variety: wineEditData.grape_variety,
        region: wineEditData.region || null,
        country: wineEditData.country || null,
        vintage: wineEditData.vintage ? parseInt(wineEditData.vintage) : null,
        description: wineEditData.description || null,
        tasting_notes: wineEditData.tasting_notes || null,
      });

      // Actualizar precios en stock
      await supabase
        .from('wine_branch_stock')
        .update({
          price_by_bottle: wineEditData.price_bottle ? parseFloat(wineEditData.price_bottle) : null,
          price_by_glass: wineEditData.price_glass ? parseFloat(wineEditData.price_glass) : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingWine.id);

      Alert.alert('Éxito', 'Vino actualizado correctamente');
      setEditModalVisible(false);
      loadInventory();
    } catch (error) {
      console.error('Error saving wine:', error);
      Alert.alert('Error', 'No se pudo actualizar el vino');
    } finally {
      setSavingWine(false);
    }
  };

  const generatePDFReport = async () => {
    try {
      Alert.alert(
        'Generar Reporte PDF',
        `Se generará un reporte con:\n\n` +
          `• ${stats.totalWines} vinos\n` +
          `• ${stats.totalBottles} botellas en stock\n` +
          `• Valor total: $${stats.totalValue.toFixed(2)}\n` +
          `• ${stats.lowStockCount} vinos con stock bajo\n\n` +
          `¿Deseas continuar?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Generar',
            onPress: async () => {
              try {
                setGeneratingPDF(true);
                const reportData = {
                  branchName: currentBranch?.name || 'Sin sucursal',
                  inventory: inventory,
                  stats: stats,
                  generatedDate: new Date().toLocaleString('es-MX'),
                  generatedBy: user?.username || 'Usuario',
                };
                await PDFReportService.generateAndShareReport(reportData);
                Alert.alert('✅ Reporte Generado', 'El reporte ha sido generado exitosamente.');
              } catch (error: any) {
                console.error('Error generando reporte:', error);
                Alert.alert('Error', error.message || 'No se pudo generar el reporte.');
              } finally {
                setGeneratingPDF(false);
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error en generatePDFReport:', error);
    }
  };

  const renderInventoryItem = ({ item }: { item: InventoryItem }) => {
    // Validación para asegurar que el item tiene todos los datos necesarios
    if (!item || !item.wines || !item.wine_id) {
      console.warn('⚠️ Item inválido en inventario:', item);
      return null;
    }

    const isLowStock = item.stock_quantity <= 5;
    const stockPercentage = Math.min(100, (item.stock_quantity / 10) * 100);

    return (
      <View style={[styles.inventoryCard, isTablet && styles.inventoryCardTablet]} key={`wine-card-${item.id}`}>
        {/* Botones de acción - Siempre visibles */}
        <View style={styles.cardActions}>
          <TouchableOpacity 
            onPress={() => {
              console.log('📝 Abriendo modal de edición para:', item.wines.name);
              openEditModal(item);
            }} 
            style={styles.editButton}
            activeOpacity={0.7}
          >
            <Text style={styles.editButtonText}>✏️ Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              console.log('🗑️ Eliminando vino:', item.wines.name);
              handleDeleteWine(item);
            }}
            style={styles.deleteButton}
            disabled={deletingWine}
            activeOpacity={0.7}
          >
            {deletingWine ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.deleteButtonText}>🗑️ Eliminar</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.inventoryHeader}>
          {item.wines.image_url ? (
            <Image source={{ uri: item.wines.image_url }} style={styles.wineImage} resizeMode="contain" />
          ) : (
            <View style={[styles.wineImage, styles.placeholderImage]}>
              <Text style={styles.placeholderText}>🍷</Text>
            </View>
          )}

          <View style={styles.wineInfo}>
            <Text style={styles.wineName}>{item.wines.name}</Text>
            <Text style={styles.wineDetails}>
              {item.wines.grape_variety} • {item.wines.vintage || 'NV'}
            </Text>
            <Text style={styles.wineRegion}>
              {item.wines.region}, {item.wines.country}
            </Text>
            <Text style={styles.winePrice}>
              ${item.price_by_bottle?.toFixed(2) || '0.00'} / botella
            </Text>
          </View>
        </View>

        <View style={styles.stockSection}>
          <View style={styles.stockHeader}>
            <View style={styles.stockInfo}>
              <Text style={styles.stockLabel}>Stock Actual:</Text>
              <Text style={[styles.stockQuantity, isLowStock && styles.stockQuantityLow]}>
                {item.stock_quantity} botellas
              </Text>
            </View>
          </View>

          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBar,
                {
                  width: `${Math.max(0, stockPercentage)}%`,
                  backgroundColor: isLowStock ? '#dc3545' : '#28a745',
                },
              ]}
            />
          </View>

          {isLowStock && (
            <View style={styles.lowStockBadge}>
              <Text style={styles.lowStockText}>⚠️ Stock Bajo</Text>
            </View>
          )}
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, styles.entradaButton]}
            onPress={() => openAdjustmentModal(item, 'entrada')}
          >
            <Text style={styles.actionButtonText}>➕</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.salidaButton]}
            onPress={() => openAdjustmentModal(item, 'salida')}
          >
            <Text style={styles.actionButtonText}>➖</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.valueSection}>
          <Text style={styles.valueLabel}>Valor en inventario:</Text>
          <Text style={styles.valueAmount}>
            ${((item.stock_quantity * (item.price_by_bottle || 0))).toFixed(2)}
          </Text>
        </View>
      </View>
    );
  };

  const renderComparisonTab = () => {
    if (!canCompareBranches) {
      return (
        <View style={styles.loadingContainer}>
          <Text style={styles.emptyTitle}>Comparación de Sucursales</Text>
          <Text style={styles.emptySubtitle}>
            {!isOwner
              ? 'Solo disponible para propietarios'
              : 'Se requieren 2 o más sucursales para comparar'}
          </Text>
        </View>
      );
    }

    if (salesLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B0000" />
          <Text style={styles.loadingText}>Cargando comparación...</Text>
        </View>
      );
    }

    if (!comparisonMetrics || !comparisonMetrics.branches.length) {
      return (
        <View style={styles.loadingContainer}>
          <Text style={styles.emptyTitle}>No hay datos de comparación</Text>
          <Text style={styles.emptySubtitle}>
            Registra ventas en múltiples sucursales para ver comparaciones
          </Text>
        </View>
      );
    }

    return (
      <ScrollView style={styles.salesContainer}>
        <View style={styles.salesStatsCard}>
          <Text style={styles.salesStatsTitle}>📊 Comparación de Sucursales</Text>
          <View style={styles.salesStatsGrid}>
            <View style={styles.salesStatItem}>
              <Text style={styles.salesStatValue}>{comparisonMetrics.branches.length}</Text>
              <Text style={styles.salesStatLabel}>Sucursales</Text>
            </View>
            <View style={styles.salesStatItem}>
              <Text style={styles.salesStatValue}>${comparisonMetrics.total_system_revenue.toFixed(2)}</Text>
              <Text style={styles.salesStatLabel}>Ingresos Totales</Text>
            </View>
            <View style={styles.salesStatItem}>
              <Text style={styles.salesStatValue}>{comparisonMetrics.total_system_sales}</Text>
              <Text style={styles.salesStatLabel}>Ventas Totales</Text>
            </View>
          </View>
        </View>

        <View style={styles.comparisonSection}>
          <Text style={styles.sectionTitle}>🏆 Mejor Sucursal: {comparisonMetrics.best_performing_branch}</Text>
          <Text style={styles.sectionTitle}>📉 Menor Rendimiento: {comparisonMetrics.worst_performing_branch}</Text>
        </View>

        {comparisonMetrics.branches.map((branch) => (
          <View key={branch.branch_id} style={styles.branchComparisonCard}>
            <Text style={styles.branchComparisonName}>{branch.branch_name}</Text>
            <View style={styles.comparisonStats}>
              <View style={styles.comparisonStatItem}>
                <Text style={styles.comparisonStatValue}>{branch.total_wines}</Text>
                <Text style={styles.comparisonStatLabel}>Vinos</Text>
              </View>
              <View style={styles.comparisonStatItem}>
                <Text style={styles.comparisonStatValue}>${branch.total_revenue.toFixed(2)}</Text>
                <Text style={styles.comparisonStatLabel}>Ingresos</Text>
              </View>
              <View style={styles.comparisonStatItem}>
                <Text style={styles.comparisonStatValue}>{branch.total_sales}</Text>
                <Text style={styles.comparisonStatLabel}>Ventas</Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    );
  };

  const renderSalesTab = () => {
    if (salesLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B0000" />
          <Text style={styles.loadingText}>Cargando datos de ventas...</Text>
        </View>
      );
    }

    return (
      <ScrollView style={styles.salesContainer}>
        <View style={styles.salesStatsCard}>
          <Text style={styles.salesStatsTitle}>📊 Resumen de Ventas</Text>
          <View style={styles.salesStatsGrid}>
            <View style={styles.salesStatItem}>
              <Text style={styles.salesStatValue}>{salesStats.totalSales}</Text>
              <Text style={styles.salesStatLabel}>Total Vendido</Text>
            </View>
            <View style={styles.salesStatItem}>
              <Text style={styles.salesStatValue}>${salesStats.totalRevenue.toFixed(2)}</Text>
              <Text style={styles.salesStatLabel}>Ingresos Totales</Text>
            </View>
            <View style={styles.salesStatItem}>
              <Text style={styles.salesStatValue}>${salesStats.avgTicket.toFixed(2)}</Text>
              <Text style={styles.salesStatLabel}>Ticket Promedio</Text>
            </View>
          </View>
        </View>

        <View style={styles.topWinesSection}>
          <Text style={styles.sectionTitle}>🏆 Top 10 Más Vendidos</Text>
          {topWines.length === 0 ? (
            <Text style={styles.emptyText}>No hay datos de ventas disponibles</Text>
          ) : (
            topWines.map((wine, index) => (
              <View key={wine.wine_id} style={styles.wineRankingCard}>
                <Text style={styles.rankingNumber}>#{index + 1}</Text>
                {wine.wine_image && (
                  <Image source={{ uri: wine.wine_image }} style={styles.rankingImage} />
                )}
                <View style={styles.rankingInfo}>
                  <Text style={styles.rankingName}>{wine.wine_name}</Text>
                  <Text style={styles.rankingDetails}>
                    {wine.total_sales} unidades • ${wine.total_revenue.toFixed(2)} ingresos
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.bottomWinesSection}>
          <Text style={styles.sectionTitle}>📉 Menos Vendidos</Text>
          {bottomWines.length === 0 ? (
            <Text style={styles.emptyText}>No hay datos disponibles</Text>
          ) : (
            bottomWines.map((wine, index) => (
              <View key={wine.wine_id} style={styles.wineRankingCard}>
                <Text style={styles.rankingNumber}>#{index + 1}</Text>
                {wine.wine_image && (
                  <Image source={{ uri: wine.wine_image }} style={styles.rankingImage} />
                )}
                <View style={styles.rankingInfo}>
                  <Text style={styles.rankingName}>{wine.wine_name}</Text>
                  <Text style={styles.rankingDetails}>
                    {wine.total_sales} unidades • Última venta: {wine.last_sale_date ? new Date(wine.last_sale_date).toLocaleDateString() : 'Nunca'}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    );
  };

  if (loading && activeTab === 'inventory') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8B0000" />
        <Text style={styles.loadingText}>Cargando inventario...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { paddingBottom: Math.max(insets.bottom, 0) }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Inventario y Análisis</Text>
        <Text style={styles.branchName}>{currentBranch?.name}</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'inventory' && styles.tabActive]}
          onPress={() => setActiveTab('inventory')}
        >
          <Text style={[styles.tabText, activeTab === 'inventory' && styles.tabTextActive]}>
            📦 Inventario
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'sales' && styles.tabActive]}
          onPress={() => setActiveTab('sales')}
        >
          <Text style={[styles.tabText, activeTab === 'sales' && styles.tabTextActive]}>
            📊 Ventas
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'analytics' && styles.tabActive,
            !canCompareBranches && styles.tabDisabled,
          ]}
          onPress={() => canCompareBranches && setActiveTab('analytics')}
          disabled={!canCompareBranches}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'analytics' && styles.tabTextActive,
              !canCompareBranches && styles.tabTextDisabled,
            ]}
          >
            🔄 Comparar Sucursales
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'inventory' && (
        <>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.totalWines}</Text>
              <Text style={styles.statLabel}>Vinos</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.totalBottles}</Text>
              <Text style={styles.statLabel}>Botellas</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>${stats.totalValue.toFixed(0)}</Text>
              <Text style={styles.statLabel}>Valor Total</Text>
            </View>
            <View style={[styles.statCard, stats.lowStockCount > 0 && styles.statCardWarning]}>
              <Text style={[styles.statValue, stats.lowStockCount > 0 && styles.statValueWarning]}>
                {stats.lowStockCount}
              </Text>
              <Text style={styles.statLabel}>Stock Bajo</Text>
            </View>
          </View>

          <View style={styles.searchSection}>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar vino..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#999"
            />

            <View style={styles.filterButtons}>
              <TouchableOpacity
                style={[styles.filterButton, filterType === 'all' && styles.filterButtonActive]}
                onPress={() => setFilterType('all')}
              >
                <Text
                  style={[styles.filterButtonText, filterType === 'all' && styles.filterButtonTextActive]}
                >
                  Todos ({inventory.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterButton, filterType === 'low_stock' && styles.filterButtonActive]}
                onPress={() => setFilterType('low_stock')}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    filterType === 'low_stock' && styles.filterButtonTextActive,
                  ]}
                >
                  Stock Bajo ({stats.lowStockCount})
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.pdfButton, generatingPDF && styles.pdfButtonDisabled]}
              onPress={generatePDFReport}
              disabled={generatingPDF}
            >
              {generatingPDF ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.pdfButtonText}>📄 Generar Reporte PDF</Text>
              )}
            </TouchableOpacity>
          </View>

          <FlatList
            data={filteredInventory}
            renderItem={renderInventoryItem}
            keyExtractor={(item) => `wine-${item.wine_id}-${item.id}`}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            extraData={filteredInventory.length}
            removeClippedSubviews={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>📦</Text>
                <Text style={styles.emptyTitle}>No hay vinos en el inventario</Text>
                <Text style={styles.emptySubtitle}>
                  {searchQuery ? 'Intenta con otra búsqueda' : 'Agrega vinos desde Alta con IA'}
                </Text>
              </View>
            }
          />
        </>
      )}

      {activeTab === 'sales' && renderSalesTab()}

      {activeTab === 'analytics' && renderComparisonTab()}

      {/* Modal de ajuste de stock */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isTablet && styles.modalContentTablet]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                {adjustmentType === 'entrada' ? '➕ Entrada' : '➖ Salida'} de Stock
              </Text>

              {selectedItem && (
                <View style={styles.modalWineInfo}>
                  <Text style={styles.modalWineName}>{selectedItem.wines.name}</Text>
                  <Text style={styles.modalWineStock}>
                    Stock actual: {selectedItem.stock_quantity} botellas
                  </Text>
                </View>
              )}

              <Text style={styles.inputLabel}>Cantidad:</Text>
              <TextInput
                style={styles.input}
                placeholder="Número de botellas"
                keyboardType="numeric"
                value={adjustmentQuantity}
                onChangeText={setAdjustmentQuantity}
              />

              {adjustmentType === 'salida' && (
                <>
                  <Text style={styles.inputLabel}>Razón de reducción:</Text>
                  <View style={styles.reasonButtons}>
                    {(['venta', 'rotura', 'expiracion', 'otro'] as ReductionReason[]).map((reason) => (
                      <TouchableOpacity
                        key={reason}
                        style={[
                          styles.reasonButton,
                          reductionReason === reason && styles.reasonButtonActive,
                        ]}
                        onPress={() => setReductionReason(reason)}
                      >
                        <Text
                          style={[
                            styles.reasonButtonText,
                            reductionReason === reason && styles.reasonButtonTextActive,
                          ]}
                        >
                          {reason === 'venta' ? '💰 Venta' :
                           reason === 'rotura' ? '💔 Rotura' :
                           reason === 'expiracion' ? '📅 Expiración' : '📝 Otro'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {((adjustmentType === 'salida' && reductionReason === 'otro') || adjustmentType !== 'salida') && (
                <>
                  <Text style={styles.inputLabel}>
                    {adjustmentType === 'salida' ? 'Motivo adicional:' : 'Motivo:'}
                  </Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder={
                      adjustmentType === 'entrada'
                        ? 'Ej: Compra a proveedor, pedido #123'
                        : adjustmentType === 'salida'
                        ? 'Describe el motivo'
                        : 'Ej: Corrección de inventario'
                    }
                    multiline
                    numberOfLines={3}
                    value={customReason}
                    onChangeText={setCustomReason}
                  />
                </>
              )}

              {selectedItem && adjustmentQuantity && (
                <View style={styles.previewSection}>
                  <Text style={styles.previewLabel}>Resultado:</Text>
                  <Text style={styles.previewText}>
                    {selectedItem.stock_quantity} →{' '}
                    {adjustmentType === 'salida'
                      ? Math.max(0, selectedItem.stock_quantity - parseInt(adjustmentQuantity || '0'))
                      : selectedItem.stock_quantity + parseInt(adjustmentQuantity || '0')}{' '}
                    botellas
                  </Text>
                </View>
              )}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => setModalVisible(false)}
                  disabled={adjusting}
                >
                  <Text style={styles.cancelButtonText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={handleStockAdjustment}
                  disabled={adjusting}
                >
                  {adjusting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.confirmButtonText}>Confirmar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal de edición de vino */}
      <Modal
        visible={editModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isTablet && styles.modalContentTablet]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>✏️ Editar Vino</Text>

              {editingWine && editingWine.wines.image_url && (
                <Image
                  source={{ uri: editingWine.wines.image_url }}
                  style={styles.editImagePreview}
                  resizeMode="contain"
                />
              )}

              <TouchableOpacity
                style={styles.imageButton}
                onPress={handleSelectImage}
                disabled={uploadingImage}
              >
                {uploadingImage ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.imageButtonText}>📷 Cambiar Imagen</Text>
                )}
              </TouchableOpacity>

              <Text style={styles.inputLabel}>Nombre del vino *</Text>
              <TextInput
                style={styles.input}
                value={wineEditData.name}
                onChangeText={(text) => setWineEditData({ ...wineEditData, name: text })}
              />

              <Text style={styles.inputLabel}>Bodega</Text>
              <TextInput
                style={styles.input}
                value={wineEditData.winery}
                onChangeText={(text) => setWineEditData({ ...wineEditData, winery: text })}
              />

              <Text style={styles.inputLabel}>Tipo de uva *</Text>
              <TextInput
                style={styles.input}
                value={wineEditData.grape_variety}
                onChangeText={(text) => setWineEditData({ ...wineEditData, grape_variety: text })}
              />

              <View style={styles.rowInputs}>
                <View style={styles.halfInput}>
                  <Text style={styles.inputLabel}>Región</Text>
                  <TextInput
                    style={styles.input}
                    value={wineEditData.region}
                    onChangeText={(text) => setWineEditData({ ...wineEditData, region: text })}
                  />
                </View>
                <View style={styles.halfInput}>
                  <Text style={styles.inputLabel}>País</Text>
                  <TextInput
                    style={styles.input}
                    value={wineEditData.country}
                    onChangeText={(text) => setWineEditData({ ...wineEditData, country: text })}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Añada</Text>
              <TextInput
                style={styles.input}
                value={wineEditData.vintage}
                onChangeText={(text) => setWineEditData({ ...wineEditData, vintage: text })}
                keyboardType="numeric"
              />

              <Text style={styles.inputLabel}>Precio por botella</Text>
              <TextInput
                style={styles.input}
                value={wineEditData.price_bottle}
                onChangeText={(text) => setWineEditData({ ...wineEditData, price_bottle: text })}
                keyboardType="decimal-pad"
              />

              <Text style={styles.inputLabel}>Precio por copa</Text>
              <TextInput
                style={styles.input}
                value={wineEditData.price_glass}
                onChangeText={(text) => setWineEditData({ ...wineEditData, price_glass: text })}
                keyboardType="decimal-pad"
              />

              <Text style={styles.inputLabel}>Descripción</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={wineEditData.description}
                onChangeText={(text) => setWineEditData({ ...wineEditData, description: text })}
                multiline
                numberOfLines={4}
              />

              <Text style={styles.inputLabel}>Notas de cata</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={wineEditData.tasting_notes}
                onChangeText={(text) => setWineEditData({ ...wineEditData, tasting_notes: text })}
                multiline
                numberOfLines={4}
              />

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => setEditModalVisible(false)}
                  disabled={savingWine || uploadingImage}
                >
                  <Text style={styles.cancelButtonText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={handleSaveWine}
                  disabled={savingWine || uploadingImage}
                >
                  {savingWine ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.confirmButtonText}>Guardar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8B0000',
    textAlign: 'center',
  },
  branchName: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
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
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#8B0000',
    fontWeight: 'bold',
  },
  tabDisabled: {
    opacity: 0.5,
    backgroundColor: '#f0f0f0',
  },
  tabTextDisabled: {
    color: '#999',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  statCard: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  statCardWarning: {
    backgroundColor: '#fff3cd',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#8B0000',
    marginBottom: 4,
  },
  statValueWarning: {
    color: '#dc3545',
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
  },
  searchSection: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  searchInput: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  filterButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  filterButton: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filterButtonActive: {
    backgroundColor: '#8B0000',
    borderColor: '#8B0000',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  pdfButton: {
    backgroundColor: '#007bff',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  pdfButtonDisabled: {
    backgroundColor: '#6c757d',
    opacity: 0.7,
  },
  pdfButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  listContainer: {
    padding: 16,
  },
  inventoryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  inventoryCardTablet: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  editButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#8B0000',
    marginRight: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  editButtonText: {
    color: '#8B0000',
    fontSize: 14,
    fontWeight: '700',
  },
  deleteButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#dc3545',
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  inventoryHeader: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  wineImage: {
    width: isTablet ? 120 : 80,
    height: isTablet ? 180 : 120,
    borderRadius: 8,
    marginRight: 12,
  },
  placeholderImage: {
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 32,
  },
  wineInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  wineName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  wineDetails: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  wineRegion: {
    fontSize: 13,
    color: '#999',
    marginBottom: 6,
  },
  winePrice: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#8B0000',
  },
  stockSection: {
    marginBottom: 16,
  },
  stockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stockInfo: {
    flex: 1,
  },
  stockLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  stockQuantity: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#28a745',
  },
  stockQuantityLow: {
    color: '#dc3545',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#e9ecef',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  lowStockBadge: {
    backgroundColor: '#fff3cd',
    borderRadius: 4,
    padding: 6,
    alignSelf: 'flex-start',
  },
  lowStockText: {
    fontSize: 12,
    color: '#856404',
    fontWeight: 'bold',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  entradaButton: {
    backgroundColor: '#28a745',
  },
  salidaButton: {
    backgroundColor: '#dc3545',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  valueSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  valueLabel: {
    fontSize: 14,
    color: '#666',
  },
  valueAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#8B0000',
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
  // Estilos para pestaña de ventas
  salesContainer: {
    flex: 1,
    padding: 16,
  },
  salesStatsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  salesStatsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  salesStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  salesStatItem: {
    alignItems: 'center',
  },
  salesStatValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8B0000',
    marginBottom: 4,
  },
  salesStatLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  topWinesSection: {
    marginBottom: 20,
  },
  bottomWinesSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  wineRankingCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  rankingNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#8B0000',
    marginRight: 12,
    minWidth: 30,
  },
  rankingImage: {
    width: 50,
    height: 75,
    borderRadius: 4,
    marginRight: 12,
  },
  rankingInfo: {
    flex: 1,
  },
  rankingName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  rankingDetails: {
    fontSize: 12,
    color: '#666',
  },
  // Estilos de modales
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '90%',
  },
  modalContentTablet: {
    maxWidth: 600,
    alignSelf: 'center',
    borderRadius: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalWineInfo: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  modalWineName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  modalWineStock: {
    fontSize: 14,
    color: '#666',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  reasonButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    marginHorizontal: -4,
  },
  reasonButton: {
    width: '48%',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ddd',
    minHeight: 50,
    marginHorizontal: '1%',
    marginVertical: 4,
  },
  reasonButtonActive: {
    backgroundColor: '#8B0000',
    borderColor: '#8B0000',
  },
  reasonButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
  },
  reasonButtonTextActive: {
    color: '#fff',
  },
  previewSection: {
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  previewLabel: {
    fontSize: 12,
    color: '#1976d2',
    marginBottom: 4,
  },
  previewText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1976d2',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    borderRadius: 8,
    padding: 14,
    marginHorizontal: 6,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#6c757d',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  confirmButton: {
    backgroundColor: '#28a745',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Estilos para edición
  editImagePreview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 16,
    backgroundColor: '#f8f9fa',
  },
  imageButton: {
    backgroundColor: '#007bff',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  imageButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  rowInputs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfInput: {
    flex: 1,
    marginHorizontal: 4,
  },
  comparisonSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    marginHorizontal: 16,
  },
  branchComparisonCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  branchComparisonName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  comparisonStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  comparisonStatItem: {
    alignItems: 'center',
  },
  comparisonStatValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#8B0000',
    marginBottom: 4,
  },
  comparisonStatLabel: {
    fontSize: 12,
    color: '#666',
  },
});

export default InventoryManagementScreen;
