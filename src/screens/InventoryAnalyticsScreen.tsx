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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { InventoryService, InventoryItem, InventoryStats } from '../services/InventoryService';
import { AnalyticsService, WineMetrics, BranchMetrics, ComparisonMetrics } from '../services/AnalyticsService';
import { PDFReportService } from '../services/PDFReportService';
import { WineService } from '../services/WineService';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { PieChart, BarChart } from 'react-native-chart-kit';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');

type InventoryAnalyticsScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'InventoryManagement'
>;
type InventoryAnalyticsScreenRouteProp = RouteProp<RootStackParamList, 'InventoryManagement'>;

interface Props {
  navigation: InventoryAnalyticsScreenNavigationProp;
  route: InventoryAnalyticsScreenRouteProp;
}

type ViewMode = 'stock' | 'sales' | 'comparison' | 'reports';
type SortBy = 'sales' | 'revenue' | 'rotation';
type ReductionReason = 'venta' | 'rotura' | 'expiracion' | 'otro';
type EntryReason = 'compra_producto' | 'cortesia_proveedor' | 'otro';

const InventoryAnalyticsScreen: React.FC<Props> = ({ navigation, route }) => {
  const { user } = useAuth();
  const { currentBranch, availableBranches } = useBranch();
  const insets = useSafeAreaInsets();
  const branchId = route.params?.branchId || currentBranch?.id || '';
  const isOwner = user?.role === 'owner';
  const canCompareBranches = isOwner && availableBranches.length >= 2;

  // Estado general
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('stock');

  // Estados de inventario
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [filteredInventory, setFilteredInventory] = useState<InventoryItem[]>([]);
  const [inventoryStats, setInventoryStats] = useState<InventoryStats>({
    totalWines: 0,
    totalBottles: 0,
    totalValue: 0,
    lowStockCount: 0,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'no_movement'>('all');

  // Estados de análisis
  const [branchMetrics, setBranchMetrics] = useState<BranchMetrics | null>(null);
  const [winesMetrics, setWinesMetrics] = useState<WineMetrics[]>([]);
  const [comparisonMetrics, setComparisonMetrics] = useState<ComparisonMetrics | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('sales');

  // Modal de ajuste de stock
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<'entrada' | 'salida'>('entrada');
  const [adjustmentQuantity, setAdjustmentQuantity] = useState('');
  const [entryReason, setEntryReason] = useState<EntryReason | ''>('');
  const [reductionReason, setReductionReason] = useState<ReductionReason | ''>('');
  const [customReason, setCustomReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);

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
    image_url: '', // Agregar campo para la imagen
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingWine, setSavingWine] = useState(false);
  const [deletingWine, setDeletingWine] = useState(false);

  // PDF generation
  const [generatingPDF, setGeneratingPDF] = useState(false);

  useEffect(() => {
    loadData();
  }, [branchId, viewMode]);

  useEffect(() => {
    if (viewMode === 'stock') {
      filterInventory();
    }
  }, [inventory, searchQuery, filterType]);

  const loadData = async () => {
    try {
      setLoading(true);
      console.log('📊 Cargando datos para modo:', viewMode);

      if (!user) {
        console.error('❌ No hay usuario autenticado');
        return;
      }

      // Obtener owner_id: si el usuario es owner, usa su propio ID; si no, usa owner_id
      const ownerId = user.owner_id || user.id;
      console.log('🔑 Owner ID:', ownerId);

      if (viewMode === 'comparison' && canCompareBranches) {
        // Cargar comparación entre sucursales
        console.log('🏢 Cargando comparación de sucursales...');
        try {
          const comparison = await AnalyticsService.getAllBranchesComparison(ownerId);
          setComparisonMetrics(comparison);
          console.log('✅ Comparación cargada:', comparison);
        } catch (error: any) {
          if (error?.code === 'PGRST205' && error?.message?.includes('sale_items')) {
            console.log('⚠️ Tabla sale_items no existe aún para comparación');
            setComparisonMetrics(null);
          }
        }
      } else if (viewMode === 'sales') {
        // Cargar métricas de ventas
        console.log('📈 Cargando métricas de ventas...');
        try {
          const [metrics, wines] = await Promise.all([
            AnalyticsService.getBranchMetrics(branchId, ownerId),
            AnalyticsService.getAllWinesMetrics(branchId, ownerId),
          ]);
          setBranchMetrics(metrics);
          setWinesMetrics(wines);
          console.log('✅ Ventas cargadas:', wines.length, 'vinos');
        } catch (error: any) {
          // Manejar errores cuando sale_items no existe
          if (error?.code === 'PGRST205' && error?.message?.includes('sale_items')) {
            console.log('⚠️ Tabla sale_items no existe aún, estableciendo valores por defecto');
            setBranchMetrics(null);
            setWinesMetrics([]);
          } else {
            throw error;
          }
        }
      } else {
        // Cargar inventario (modo stock)
        console.log('📦 Cargando inventario para branch:', branchId);
        const [inventoryData, statsData] = await Promise.all([
          InventoryService.getInventoryByBranch(branchId, ownerId),
          InventoryService.getInventoryStats(branchId, ownerId),
        ]);
        setInventory(inventoryData);
        setInventoryStats(statsData);
        console.log('✅ Inventario cargado:', inventoryData.length, 'vinos, stats:', statsData);
      }
    } catch (error) {
      console.error('❌ Error loading data:', error);
      Alert.alert('Error', 'No se pudieron cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  const filterInventory = () => {
    let filtered = [...inventory];

    // Filtrar por búsqueda
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

    // Filtrar por tipo
    if (filterType === 'no_movement') {
      // TODO: Implementar filtro de vinos sin movimiento
      // Por ahora, simular con vinos que tienen 0 ventas
      filtered = filtered.filter((item) => item.stock_quantity === item.stock_quantity); // Placeholder
    }

    setFilteredInventory(filtered);
  };

  const openAdjustmentModal = (item: InventoryItem, type: 'entrada' | 'salida') => {
    setSelectedItem(item);
    setAdjustmentType(type);
    setAdjustmentQuantity('');
    setEntryReason('');
    setReductionReason('');
    setCustomReason('');
    setModalVisible(true);
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
      image_url: item.wines.image_url || '', // Inicializar con la imagen actual
    });
    setEditModalVisible(true);
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
      // Entrada
      if (!entryReason) {
        Alert.alert('Error', 'Selecciona una razón para la entrada');
        return;
      }
      if (entryReason === 'otro') {
        if (!customReason.trim()) {
          Alert.alert('Error', 'Ingresa la razón personalizada');
          return;
        }
        reason = customReason.trim();
      } else {
        reason = entryReason === 'compra_producto' ? 'Compra de producto' : 
                 entryReason === 'cortesia_proveedor' ? 'Cortesía de proveedores' : entryReason;
      }
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
      loadData();
    } catch (error) {
      console.error('Error adjusting stock:', error);
      Alert.alert('Error', 'No se pudo actualizar el stock');
    } finally {
      setAdjusting(false);
    }
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
      const fileExt = imageUri.split('.').pop() || 'jpg';
      const fileName = `${editingWine.wine_id}-${Date.now()}.${fileExt}`;
      const filePath = `wines/${user.owner_id || user.id}/${fileName}`;

      // Convertir imagen a base64 para React Native
      let base64: string;
      if (imageUri.startsWith('file://') || imageUri.startsWith('/')) {
        // URI local: usar FileSystem legacy API (expo-file-system/legacy)
        const fileUri = imageUri.startsWith('file://') ? imageUri : `file://${imageUri}`;
        base64 = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        // URI remota: usar fetch y convertir a base64
        const response = await fetch(imageUri);
        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        base64 = btoa(String.fromCharCode(...uint8Array));
      }

      // Convertir base64 a ArrayBuffer para Supabase (React Native compatible)
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Subir usando Supabase Storage (acepta ArrayBuffer/Uint8Array)
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('wine-bottles')
        .upload(filePath, bytes.buffer, {
          contentType: `image/${fileExt}`,
          upsert: true,
        });

      if (uploadError) {
        console.error('Error uploading image:', uploadError);
        throw uploadError;
      }

      // Obtener URL pública
      const { data: urlData } = supabase.storage
        .from('wine-bottles')
        .getPublicUrl(filePath);

      if (!urlData?.publicUrl) {
        throw new Error('No se pudo obtener la URL pública de la imagen');
      }

      // Actualizar solo el estado local con la nueva URL de imagen
      // NO guardar en BD todavía - se guardará cuando presione "Guardar"
      setWineEditData(prev => ({
        ...prev,
        image_url: urlData.publicUrl,
      }));

      // También actualizar editingWine para que se vea inmediatamente en el preview
      if (editingWine) {
        setEditingWine({
          ...editingWine,
          wines: {
            ...editingWine.wines,
            image_url: urlData.publicUrl,
          },
        });
      }

      // No mostrar alert ni cerrar modal - el usuario puede seguir editando
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

      // Actualizar datos del vino (incluyendo imagen si fue cambiada)
      await WineService.updateWine(editingWine.wine_id, ownerId, {
        name: wineEditData.name,
        winery: wineEditData.winery || null,
        grape_variety: wineEditData.grape_variety,
        region: wineEditData.region || null,
        country: wineEditData.country || null,
        // Guardar vintage como string si contiene comas (múltiples añadas), 
        // de lo contrario como número (se convertirá a string en la BD después de la migración)
        vintage: wineEditData.vintage 
          ? (wineEditData.vintage.includes(',') 
              ? wineEditData.vintage.trim()
              : parseInt(wineEditData.vintage) || wineEditData.vintage.trim())
          : null,
        description: wineEditData.description || null,
        tasting_notes: wineEditData.tasting_notes || null,
        image_url: wineEditData.image_url || editingWine.wines.image_url || null, // Guardar nueva imagen si existe
      });

      // Actualizar precios en stock (solo si el stock pertenece al owner)
      const { error: stockUpdateError } = await supabase
        .from('wine_branch_stock')
        .update({
          price_by_bottle: wineEditData.price_bottle ? parseFloat(wineEditData.price_bottle) : null,
          price_by_glass: wineEditData.price_glass ? parseFloat(wineEditData.price_glass) : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingWine.id)
        .eq('wine_id', editingWine.wine_id); // SEGURIDAD: Verificar wine_id también

      if (stockUpdateError) {
        console.error('Error updating stock prices:', stockUpdateError);
        // No lanzamos error porque el vino ya se actualizó, solo logueamos
      }

      Alert.alert('Éxito', 'Vino actualizado correctamente');
      setEditModalVisible(false);
      loadData();
    } catch (error) {
      console.error('Error saving wine:', error);
      Alert.alert('Error', 'No se pudo actualizar el vino');
    } finally {
      setSavingWine(false);
    }
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

              // VERIFICAR primero que el vino pertenece al owner
              const { data: wineCheck, error: checkError } = await supabase
                .from('wines')
                .select('owner_id')
                .eq('id', item.wine_id)
                .eq('owner_id', ownerId)
                .single();

              if (checkError || !wineCheck) {
                throw new Error('No tienes permisos para eliminar este vino');
              }

              // Eliminar stock primero (solo del branch actual)
              await supabase
                .from('wine_branch_stock')
                .delete()
                .eq('wine_id', item.wine_id)
                .eq('branch_id', branchId);

              // Verificar si hay stock en otras sucursales antes de eliminar el vino
              const { data: otherStock, error: stockError } = await supabase
                .from('wine_branch_stock')
                .select('id')
                .eq('wine_id', item.wine_id)
                .limit(1);

              // Solo eliminar el vino si no hay stock en ninguna sucursal
              if (!otherStock || otherStock.length === 0) {
                await WineService.deleteWine(item.wine_id, ownerId);
              }

              Alert.alert('Éxito', 'Vino eliminado correctamente del catálogo');
              loadData();
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

  const generatePDF = async (type: 'inventory' | 'sales' | 'comparison') => {
    try {
      setGeneratingPDF(true);

      if (type === 'inventory') {
        // PDF de inventario
        const reportData = {
          branchName: currentBranch?.name || 'Sin sucursal',
          inventory: inventory,
          stats: inventoryStats,
          generatedDate: new Date().toLocaleString('es-MX', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
          generatedBy: user?.username || 'Usuario',
        };

        await PDFReportService.generateAndShareReport(reportData);
        Alert.alert('✅ Reporte Generado', 'El reporte de inventario ha sido generado exitosamente.');
      } else if (type === 'sales') {
        // TODO: PDF de análisis de ventas
        Alert.alert('Próximamente', 'PDF de análisis de ventas estará disponible pronto');
      } else if (type === 'comparison') {
        // TODO: PDF comparativo multi-sucursal
        Alert.alert('Próximamente', 'PDF comparativo multi-sucursal estará disponible pronto');
      }
    } catch (error: any) {
      console.error('Error generando PDF:', error);
      Alert.alert('Error', error.message || 'No se pudo generar el reporte');
    } finally {
      setGeneratingPDF(false);
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

  // ========================================
  // RENDER TAB 1: STOCK (INVENTARIO)
  // ========================================
  const renderStockTab = () => {
    const renderInventoryItem = ({ item }: { item: InventoryItem }) => {
      // Validar que item.wines exista
      if (!item.wines) {
        console.warn('⚠️ Vino sin datos en inventario:', item);
        return null;
      }


      return (
        <View style={styles.inventoryCard}>
          <View style={styles.inventoryHeader}>
            {item.wines.image_url ? (
              <Image source={{ uri: item.wines.image_url }} style={styles.wineImage} />
            ) : (
              <View style={[styles.wineImage, styles.placeholderImage]}>
                <Text style={styles.placeholderText}>🍷</Text>
              </View>
            )}

            <View style={styles.wineInfo}>
              {item.wines.winery && (
                <Text style={styles.wineWinery}>{item.wines.winery}</Text>
              )}
              <Text style={styles.wineName}>{item.wines.name}</Text>
              <Text style={styles.wineDetails}>
                {item.wines.grape_variety} • {item.wines.vintage}
              </Text>
              <Text style={styles.wineRegion}>
                {item.wines.region}, {item.wines.country}
              </Text>
              <Text style={styles.winePrice}>${item.price_by_bottle?.toFixed(2) || '0.00'} / botella</Text>
            </View>
          </View>

          {/* Indicador de stock */}
          <View style={styles.stockSection}>
            <View style={styles.stockHeader}>
              <View style={styles.stockInfo}>
                <Text style={styles.stockLabel}>Stock Actual:</Text>
                <Text style={styles.stockQuantity}>
                  {item.stock_quantity} botellas
                </Text>
              </View>
            </View>
          </View>

          {/* Botones de acción */}
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

            <TouchableOpacity
              style={[styles.actionButton, styles.editButton]}
              onPress={() => openEditModal(item)}
            >
              <Text style={styles.actionButtonText}>✏️</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={() => handleDeleteWine(item)}
              disabled={deletingWine}
            >
              {deletingWine ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.actionButtonText}>🗑️</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Valor total en inventario */}
          <View style={styles.valueSection}>
            <Text style={styles.valueLabel}>Valor en inventario:</Text>
            <Text style={styles.valueAmount}>${(item.stock_quantity * (item.price_by_bottle || 0)).toFixed(2)}</Text>
          </View>
        </View>
      );
    };

    return (
      <View style={styles.tabContent}>

        {/* Barra de búsqueda y filtros */}
        <View style={styles.searchSection}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar vino..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#999"
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.filterButtons}>
              <TouchableOpacity
                style={[styles.filterButton, filterType === 'all' && styles.filterButtonActive]}
                onPress={() => setFilterType('all')}
              >
                <Text style={[styles.filterButtonText, filterType === 'all' && styles.filterButtonTextActive]}>
                  Todos ({inventory.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterButton, filterType === 'no_movement' && styles.filterButtonActive]}
                onPress={() => setFilterType('no_movement')}
              >
                <Text style={[styles.filterButtonText, filterType === 'no_movement' && styles.filterButtonTextActive]}>
                  Sin Movimiento
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>

        {/* Lista de inventario */}
        <FlatList
          data={filteredInventory}
          renderItem={renderInventoryItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>📦</Text>
              <Text style={styles.emptyTitle}>No hay vinos en el inventario</Text>
            </View>
          }
        />
      </View>
    );
  };

  // ========================================
  // RENDER TAB 2: VENTAS (ANÁLISIS)
  // ========================================
  const renderSalesTab = () => {
    if (!branchMetrics) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>📊</Text>
          <Text style={styles.emptyTitle}>No hay datos de ventas</Text>
        </View>
      );
    }

    const sortedWines = getSortedWines();
    const topWines = [...winesMetrics].sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 5);
    const topSelling = [...winesMetrics].sort((a, b) => b.total_sales - a.total_sales).slice(0, 6);

    const pieData = topWines.map((wine, index) => ({
      name: wine.wine_name.substring(0, 15) + (wine.wine_name.length > 15 ? '...' : ''),
      population: wine.total_revenue,
      color: ['#8B0000', '#B22222', '#DC143C', '#FF6347', '#FFA07A'][index],
      legendFontColor: '#333',
      legendFontSize: 11,
    }));

    const barData = {
      labels: topSelling.map(w => w.wine_name.split(' ')[0].substring(0, 8)),
      datasets: [{ data: topSelling.map(w => w.total_sales) }],
    };

    return (
      <View style={styles.tabContent}>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Gráficas */}
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

          {barData.labels.length > 0 && (
            <View style={styles.chartSection}>
              <Text style={styles.sectionTitle}>📊 Top Ventas por Cantidad</Text>
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
                  }}
                  style={{ marginVertical: 8, borderRadius: 16 }}
                />
              </ScrollView>
            </View>
          )}

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

          {/* Lista de vinos con métricas */}
          <View style={styles.winesList}>
            {sortedWines.map((wine, index) => (
              <View key={wine.wine_id} style={styles.wineMetricCard}>
                <View style={styles.wineRank}>
                  <Text style={styles.wineRankText}>#{index + 1}</Text>
                </View>

                {wine.wine_image ? (
                  <Image source={{ uri: wine.wine_image }} style={styles.wineImageSmall} />
                ) : (
                  <View style={[styles.wineImageSmall, styles.placeholderImage]}>
                    <Text style={styles.placeholderTextSmall}>🍷</Text>
                  </View>
                )}

                <View style={styles.wineMetricInfo}>
                  <Text style={styles.wineMetricName}>{wine.wine_name}</Text>
                  <Text style={styles.wineMetricDetails}>
                    {wine.grape_variety} • {wine.region}
                  </Text>

                  <View style={styles.metricsRow}>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Vendidas:</Text>
                      <Text style={styles.metricValue}>{wine.total_sales}</Text>
                    </View>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Ingresos:</Text>
                      <Text style={styles.metricValue}>${wine.total_revenue.toFixed(0)}</Text>
                    </View>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Stock:</Text>
                      <Text style={[styles.metricValue, wine.current_stock <= 5 && styles.metricValueLow]}>
                        {wine.current_stock}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.wineExtraMetric}>
                    🍾 {wine.bottles_sold} botellas • 🍷 {wine.glasses_sold} copas • 📊 {wine.sales_per_day.toFixed(1)}/día
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  };

  // ========================================
  // RENDER TAB 4: REPORTS (REPORTES)
  // ========================================
  const renderReportsTab = () => {
    const totalRevenue = branchMetrics?.total_revenue || 0;
    const totalSales = branchMetrics?.total_sales || 0;

    return (
      <View style={styles.tabContent}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Estadísticas Resumen */}
          <View style={styles.reportsStatsGrid}>
            <View style={styles.reportStatCard}>
              <Text style={styles.reportStatIcon}>🍷</Text>
              <Text style={styles.reportStatValue}>{inventoryStats.totalWines}</Text>
              <Text style={styles.reportStatLabel}>Vinos</Text>
            </View>
            <View style={styles.reportStatCard}>
              <Text style={styles.reportStatIcon}>📦</Text>
              <Text style={styles.reportStatValue}>{inventoryStats.totalBottles}</Text>
              <Text style={styles.reportStatLabel}>Botellas</Text>
            </View>
            <View style={styles.reportStatCard}>
              <Text style={styles.reportStatIcon}>💰</Text>
              <Text style={styles.reportStatValue}>${inventoryStats.totalValue.toFixed(0)}</Text>
              <Text style={styles.reportStatLabel}>Valor Total</Text>
            </View>
            <View style={styles.reportStatCard}>
              <Text style={styles.reportStatIcon}>💵</Text>
              <Text style={styles.reportStatValue}>${totalRevenue.toFixed(0)}</Text>
              <Text style={styles.reportStatLabel}>Ingresos Totales</Text>
            </View>
            <View style={styles.reportStatCard}>
              <Text style={styles.reportStatIcon}>📈</Text>
              <Text style={styles.reportStatValue}>{totalSales}</Text>
              <Text style={styles.reportStatLabel}>Ventas Totales</Text>
            </View>
          </View>

          {/* Botones de generación de PDF */}
          <View style={styles.reportsButtonsContainer}>
            <TouchableOpacity
              style={styles.reportButton}
              onPress={() => generatePDF('inventory')}
              disabled={generatingPDF}
            >
              {generatingPDF ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.reportButtonIcon}>📄</Text>
                  <Text style={styles.reportButtonText}>Reporte de Inventario</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.reportButton}
              onPress={() => generatePDF('sales')}
              disabled={generatingPDF}
            >
              {generatingPDF ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.reportButtonIcon}>📊</Text>
                  <Text style={styles.reportButtonText}>Reporte de Ventas</Text>
                </>
              )}
            </TouchableOpacity>

            {canCompareBranches && (
              <TouchableOpacity
                style={styles.reportButton}
                onPress={() => generatePDF('comparison')}
                disabled={generatingPDF}
              >
                {generatingPDF ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.reportButtonIcon}>🏢</Text>
                    <Text style={styles.reportButtonText}>Reporte Comparativo</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </View>
    );
  };

  // ========================================
  // RENDER TAB 3: COMPARACIÓN (SOLO OWNER)
  // ========================================
  const renderComparisonTab = () => {
    if (!comparisonMetrics) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>🏢</Text>
          <Text style={styles.emptyTitle}>No hay datos de comparación</Text>
        </View>
      );
    }

    return (
      <View style={styles.tabContent}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Resumen Global */}
          <View style={styles.comparisonHeader}>
            <Text style={styles.comparisonTitle}>📊 Resumen Global del Sistema</Text>
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

            <TouchableOpacity
              style={[styles.pdfButton, { marginTop: 12 }]}
              onPress={() => generatePDF('comparison')}
              disabled={generatingPDF}
            >
              {generatingPDF ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.pdfButtonText}>📄 PDF Multi-Sucursal</Text>
              )}
            </TouchableOpacity>
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
                    <Text style={styles.branchComparisonLabel}>Ventas:</Text>
                    <Text style={styles.branchComparisonValue}>{branch.total_sales}</Text>
                  </View>
                  <View style={styles.branchComparisonMetricRow}>
                    <Text style={styles.branchComparisonLabel}>Ingresos:</Text>
                    <Text style={[styles.branchComparisonValue, styles.branchComparisonValueHighlight]}>
                      ${branch.total_revenue.toFixed(2)}
                    </Text>
                  </View>
                </View>

                <View style={styles.contributionBar}>
                  <Text style={styles.contributionLabel}>Contribución:</Text>
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
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8B0000" />
        <Text style={styles.loadingText}>Cargando datos...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { paddingBottom: Math.max(insets.bottom, 0) }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Inventario y Análisis</Text>
          <Text style={styles.subtitle}>{currentBranch?.name}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, viewMode === 'stock' && styles.tabActive]}
          onPress={() => setViewMode('stock')}
        >
          <Text style={[styles.tabText, viewMode === 'stock' && styles.tabTextActive]}>
            📦 Stock
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, viewMode === 'sales' && styles.tabActive]}
          onPress={() => setViewMode('sales')}
        >
          <Text style={[styles.tabText, viewMode === 'sales' && styles.tabTextActive]}>
            📈 Ventas
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            viewMode === 'comparison' && styles.tabActive,
            !canCompareBranches && styles.tabDisabled,
          ]}
          onPress={() => canCompareBranches && setViewMode('comparison')}
          disabled={!canCompareBranches}
        >
          <Text
            style={[
              styles.tabText,
              viewMode === 'comparison' && styles.tabTextActive,
              !canCompareBranches && styles.tabTextDisabled,
            ]}
          >
            🏢 Comparar
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, viewMode === 'reports' && styles.tabActive]}
          onPress={() => setViewMode('reports')}
        >
          <Text style={[styles.tabText, viewMode === 'reports' && styles.tabTextActive]}>
            📄 Reportes
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {viewMode === 'stock' && renderStockTab()}
      {viewMode === 'sales' && renderSalesTab()}
      {viewMode === 'comparison' && renderComparisonTab()}
      {viewMode === 'reports' && renderReportsTab()}

      {/* Modal de ajuste de stock */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                {adjustmentType === 'entrada' ? '➕ Entrada' : '➖ Salida'} de Stock
              </Text>

              {selectedItem && (
                <View style={styles.modalWineInfo}>
                  <Text style={styles.modalWineName}>{selectedItem.wines.name}</Text>
                  <Text style={styles.modalWineStock}>Stock actual: {selectedItem.stock_quantity} botellas</Text>
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

              {adjustmentType === 'entrada' && (
                <>
                  <Text style={styles.inputLabel}>Razón de entrada:</Text>
                  <View style={styles.reasonButtons}>
                    {(['compra_producto', 'cortesia_proveedor', 'otro'] as EntryReason[]).map((reason) => (
                      <TouchableOpacity
                        key={reason}
                        style={[
                          styles.reasonButton,
                          entryReason === reason && styles.reasonButtonActive,
                        ]}
                        onPress={() => setEntryReason(reason)}
                      >
                        <Text
                          style={[
                            styles.reasonButtonText,
                            entryReason === reason && styles.reasonButtonTextActive,
                          ]}
                        >
                          {reason === 'compra_producto' ? '🛒 Compra de producto' :
                           reason === 'cortesia_proveedor' ? '🎁 Cortesía de proveedores' : '📝 Otro'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

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

              {((adjustmentType === 'entrada' && entryReason === 'otro') || 
                (adjustmentType === 'salida' && reductionReason === 'otro')) && (
                <>
                  <Text style={styles.inputLabel}>Motivo adicional:</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Describe el motivo"
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
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>✏️ Editar Vino</Text>

              {(wineEditData.image_url || (editingWine && editingWine.wines.image_url)) && (
                <Image
                  source={{ uri: wineEditData.image_url || (editingWine?.wines.image_url || '') }}
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

              <Text style={styles.inputLabel}>Añada (puedes agregar múltiples separadas por coma: 2020, 2021)</Text>
              <TextInput
                style={styles.input}
                value={wineEditData.vintage}
                onChangeText={(text) => setWineEditData({ ...wineEditData, vintage: text })}
                keyboardType="default"
                placeholder="Ej: 2020 o 2020, 2021"
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
    padding: 20,
    backgroundColor: '#8B0000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    textAlign: 'center',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#8B0000',
  },
  tabText: {
    fontSize: 12,
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
  tabContent: {
    flex: 1,
  },
  statsHeader: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  statCardWarning: {
    backgroundColor: '#fff3cd',
  },
  statIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#8B0000',
    marginBottom: 2,
  },
  statValueWarning: {
    color: '#dc3545',
  },
  statLabel: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
  },
  pdfButton: {
    backgroundColor: '#007bff',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  pdfButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
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
    gap: 8,
  },
  filterButton: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filterButtonActive: {
    backgroundColor: '#8B0000',
    borderColor: '#8B0000',
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  filterButtonTextActive: {
    color: '#fff',
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
  inventoryHeader: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  wineImage: {
    width: 80,
    height: 120,
    borderRadius: 8,
    marginRight: 12,
    resizeMode: 'contain',
    backgroundColor: '#f8f9fa',
  },
  placeholderImage: {
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 32,
  },
  placeholderTextSmall: {
    fontSize: 20,
  },
  wineInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  wineWinery: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8B0000',
    marginBottom: 2,
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
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  actionButton: {
    flex: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginHorizontal: 2,
    minWidth: 50,
  },
  entradaButton: {
    backgroundColor: '#28a745',
  },
  salidaButton: {
    backgroundColor: '#dc3545',
  },
  ajusteButton: {
    backgroundColor: '#ffc107',
  },
  editButton: {
    backgroundColor: '#007bff',
  },
  deleteButton: {
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
  chartSection: {
    marginHorizontal: 16,
    marginBottom: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    marginHorizontal: 16,
  },
  sortButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
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
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  sortButtonTextActive: {
    color: '#fff',
  },
  winesList: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  wineMetricCard: {
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
  wineImageSmall: {
    resizeMode: 'contain',
    backgroundColor: '#f8f9fa',
    width: 60,
    height: 90,
    borderRadius: 8,
    marginRight: 12,
  },
  wineMetricInfo: {
    flex: 1,
  },
  wineMetricName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  wineMetricDetails: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  metricsRow: {
    flexDirection: 'row',
    marginBottom: 8,
    gap: 12,
  },
  metricItem: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 10,
    color: '#999',
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#8B0000',
  },
  metricValueLow: {
    color: '#dc3545',
  },
  wineExtraMetric: {
    fontSize: 10,
    color: '#666',
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
    height: 80,
    textAlignVertical: 'top',
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
  // Estilos para Reportes
  reportsStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
    gap: 12,
  },
  reportStatCard: {
    width: '47%',
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
  reportStatIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  reportStatValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8B0000',
    marginBottom: 4,
  },
  reportStatLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  reportsButtonsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  reportButton: {
    flexDirection: 'row',
    backgroundColor: '#8B0000',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  reportButtonIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  reportButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
});

export default InventoryAnalyticsScreen;

