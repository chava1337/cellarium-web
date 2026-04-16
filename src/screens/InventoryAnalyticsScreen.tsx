import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { InventoryService, InventoryItem, InventoryStats, RegisterCountResult, SalesFromCountsRow, SalesFromCountsSummary, BranchComparisonRow, BranchComparisonSummary } from '../services/InventoryService';
import { AnalyticsService, WineMetrics, BranchMetrics } from '../services/AnalyticsService';
import { PDFReportService } from '../services/PDFReportService';
import { WineService } from '../services/WineService';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useAdminGuard } from '../hooks/useAdminGuard';
import { getEffectivePlan, getOwnerEffectivePlan } from '../utils/effectivePlan';
import { checkSubscriptionFeatureByPlan } from '../utils/subscriptionPermissions';
import { PendingApprovalMessage } from '../components/PendingApprovalMessage';
import { PieChart, BarChart } from 'react-native-chart-kit';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import { isValidPrice, formatCurrencyMXN } from '../utils/wineCatalogUtils';
import { CELLARIUM, CELLARIUM_LAYOUT } from '../theme/cellariumTheme';
import { CellariumHeader, IosHeaderBackSlot } from '../components/cellarium';
import InventoryAnalyticsTabs from '../components/inventory/InventoryAnalyticsTabs';
import type { InventoryViewMode } from '../components/inventory/InventoryAnalyticsTabs';
import InventoryItemCard from '../components/inventory/InventoryItemCard';
import InventoryEventModal from '../components/inventory/InventoryEventModal';
import InventoryCountModal from '../components/inventory/InventoryCountModal';
import EditInventoryWineModal from '../components/inventory/EditInventoryWineModal';
import HelpInventoryModal from '../components/inventory/HelpInventoryModal';
import type { InventoryEventReason } from '../components/inventory/inventoryAnalyticsTypes';

const { width } = Dimensions.get('window');
const HELP_MODAL_DONT_SHOW_KEY = 'inventory_analytics_help_dont_show';

type InventoryAnalyticsScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'InventoryManagement'
>;
type InventoryAnalyticsScreenRouteProp = RouteProp<RootStackParamList, 'InventoryManagement'>;

interface Props {
  navigation: InventoryAnalyticsScreenNavigationProp;
  route: InventoryAnalyticsScreenRouteProp;
}

type ViewMode = InventoryViewMode;
type SortBy = 'sales' | 'revenue' | 'rotation';

const FEATURE_ID_INVENTORY = 'inventory' as const;

const InventoryAnalyticsScreen: React.FC<Props> = ({ navigation, route }) => {
  const { status: guardStatus } = useAdminGuard({
    navigation,
    route,
    allowedRoles: ['owner', 'gerente', 'sommelier', 'supervisor'],
  });
  const { user } = useAuth();
  const { currentBranch, availableBranches } = useBranch();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const branchId = route.params?.branchId || currentBranch?.id || '';

  const [subscriptionAllowed, setSubscriptionAllowed] = useState<'pending' | true | false>('pending');
  const alertedBlockedRef = useRef(false);

  useEffect(() => {
    if (guardStatus !== 'allowed' || !user) return;
    let cancelled = false;
    const run = async () => {
      const plan = user.role === 'owner'
        ? getEffectivePlan(user)
        : await getOwnerEffectivePlan(user);
      if (cancelled) return;
      const allowed = checkSubscriptionFeatureByPlan(plan, FEATURE_ID_INVENTORY);
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
  }, [user?.id, user?.role, guardStatus, navigation, t]);

  const isOwner = user?.role === 'owner';
  const canCompareBranches = isOwner && availableBranches.length >= 2;

  // Estado general (todos los hooks deben ir antes de cualquier return condicional)
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
  const [searchVisible, setSearchVisible] = useState(false);
  const [filterType, setFilterType] = useState<'all'>('all');

  // Estados de análisis (Ventas estimadas desde cortes)
  const [salesFromCounts, setSalesFromCounts] = useState<SalesFromCountsRow[] | null>(null);
  const [salesFromCountsSummary, setSalesFromCountsSummary] = useState<SalesFromCountsSummary | null>(null);
  const [salesFromCountsDays, setSalesFromCountsDays] = useState<7 | 30 | 90>(30);
  const [branchMetrics, setBranchMetrics] = useState<BranchMetrics | null>(null);
  const [winesMetrics, setWinesMetrics] = useState<WineMetrics[]>([]);
  const [comparisonFromCounts, setComparisonFromCounts] = useState<{ branches: BranchComparisonRow[]; summary: BranchComparisonSummary } | null>(null);
  const [comparisonDays, setComparisonDays] = useState<7 | 30 | 90>(30);
  const [sortBy, setSortBy] = useState<SortBy>('sales');

  // Modal "Registrar evento" (entrada/salida)
  const [eventModalVisible, setEventModalVisible] = useState(false);
  const [eventItem, setEventItem] = useState<InventoryItem | null>(null);
  const [eventDirection, setEventDirection] = useState<'in' | 'out'>('in');
  const [eventReason, setEventReason] = useState<InventoryEventReason>('compra');
  const [eventQty, setEventQty] = useState('');
  const [eventNotes, setEventNotes] = useState('');
  const [eventSubmitting, setEventSubmitting] = useState(false);

  // Modal "Conteo físico" (correctivo 15–30 días)
  const [countModalVisible, setCountModalVisible] = useState(false);
  const [countItem, setCountItem] = useState<InventoryItem | null>(null);
  const [countPrevStock, setCountPrevStock] = useState(0);
  const [countQuantity, setCountQuantity] = useState('');
  const [countNotes, setCountNotes] = useState('');
  const [countSubmitting, setCountSubmitting] = useState(false);
  const [lastCountResult, setLastCountResult] = useState<RegisterCountResult | null>(null);

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
  const [estimatedReportPeriod, setEstimatedReportPeriod] = useState<7 | 30 | 90>(30);
  const [generatingEstimatedPDF, setGeneratingEstimatedPDF] = useState(false);

  // Modal de ayuda
  const [helpModalVisible, setHelpModalVisible] = useState(false);
  const [dontShowHelpAgain, setDontShowHelpAgain] = useState(false);
  const [helpHidden, setHelpHidden] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      if (__DEV__) console.log('📊 Cargando datos para modo:', viewMode);

      if (!user) {
        if (__DEV__) console.error('❌ No hay usuario autenticado');
        return;
      }

      const ownerId = user.owner_id || user.id;
      if (__DEV__) console.log('🔑 Owner ID:', ownerId);

      if (viewMode === 'comparison' && canCompareBranches) {
        if (__DEV__) console.log('🏢 Cargando comparación desde cortes...');
        try {
          const { branches, summary } = await InventoryService.getBranchesComparisonFromCounts({
            ownerId,
            days: comparisonDays,
          });
          setComparisonFromCounts({ branches, summary });
          if (__DEV__) console.log('✅ Comparación desde cortes:', branches.length, 'sucursales');
        } catch (error: any) {
          if (__DEV__) console.error('Error getBranchesComparisonFromCounts:', error);
          setComparisonFromCounts(null);
        }
      } else if (viewMode === 'sales' || viewMode === 'reports') {
        if (__DEV__) console.log('📈 Cargando ventas estimadas desde cortes...');
        const days = viewMode === 'reports' ? estimatedReportPeriod : salesFromCountsDays;
        try {
          const { rows, summary } = await InventoryService.getSalesFromCountsByPeriod({
            ownerId,
            branchId,
            days,
          });
          setSalesFromCounts(rows);
          setSalesFromCountsSummary(summary);
          if (__DEV__) console.log('✅ Ventas estimadas desde cortes:', rows.length, 'vinos, sufficient:', summary.sufficient);
        } catch (error: any) {
          if (__DEV__) console.error('Error getSalesFromCountsByPeriod (ventas estimadas):', error);
          setSalesFromCounts([]);
          setSalesFromCountsSummary({ total_sold_estimated: 0, total_revenue_estimated: null, total_entries: 0, total_special_outs: 0, count_start_at: null, count_end_at: null, sufficient: false, valid_wines_count: 0, unpriced_consumption_total: 0, unpriced_wines_count: 0 });
        }
        if (viewMode === 'reports') {
          try {
            const [invData, statsData] = await Promise.all([
              InventoryService.getInventoryByBranch(branchId, ownerId),
              InventoryService.getInventoryStats(branchId, ownerId),
            ]);
            setInventory(invData);
            setInventoryStats(statsData);
          } catch (e) {
            if (__DEV__) console.error('Error loading inventory for reports:', e);
          }
        }
      } else {
        if (__DEV__) console.log('📦 Cargando inventario para branch:', branchId);
        const [inventoryData, statsData] = await Promise.all([
          InventoryService.getInventoryByBranch(branchId, ownerId),
          InventoryService.getInventoryStats(branchId, ownerId),
        ]);
        setInventory(inventoryData);
        setInventoryStats(statsData);
        if (__DEV__) console.log('✅ Inventario cargado:', inventoryData.length, 'vinos, stats:', statsData);
      }
    } catch (error) {
      if (__DEV__) console.error('❌ Error loading data:', error);
      Alert.alert('Error', 'No se pudieron cargar los datos');
    } finally {
      setLoading(false);
    }
  }, [
    branchId,
    viewMode,
    user,
    canCompareBranches,
    comparisonDays,
    estimatedReportPeriod,
    salesFromCountsDays,
  ]);

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

    setFilteredInventory(filtered);
  };

  useEffect(() => {
    if (guardStatus !== 'allowed' || subscriptionAllowed !== true) return;
    loadData();
  }, [guardStatus, subscriptionAllowed, loadData]);

  useEffect(() => {
    if (viewMode === 'stock') {
      filterInventory();
    }
  }, [inventory, searchQuery, filterType]);

  useEffect(() => {
    AsyncStorage.getItem(HELP_MODAL_DONT_SHOW_KEY).then((v) => {
      setHelpHidden(v === 'true');
    });
  }, []);

  const guardLoadingView = (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={CELLARIUM.primary} />
      <Text style={styles.loadingText}>{t('msg.loading') || 'Cargando…'}</Text>
    </View>
  );

  if (guardStatus === 'pending') {
    return (
      <View style={{ flex: 1, backgroundColor: CELLARIUM.bg }}>
        <PendingApprovalMessage />
      </View>
    );
  }
  if (guardStatus === 'loading' || guardStatus === 'profile_loading') {
    return guardLoadingView;
  }
  if (guardStatus === 'denied') {
    return null;
  }
  if (guardStatus !== 'allowed') {
    return null;
  }
  if (subscriptionAllowed === 'pending') {
    return guardLoadingView;
  }
  if (subscriptionAllowed === false) {
    return null;
  }

  const openEventModal = (item: InventoryItem) => {
    setEventItem(item);
    setEventDirection('in');
    setEventReason('compra');
    setEventQty('');
    setEventNotes('');
    setEventModalVisible(true);
  };

  const closeEventModal = () => {
    setEventModalVisible(false);
    setEventItem(null);
    setEventQty('');
    setEventNotes('');
    setEventSubmitting(false);
  };

  const handleRegisterEvent = async () => {
    if (!eventItem || !user) return;
    const qty = parseInt(eventQty, 10);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert('Dato inválido', 'La cantidad debe ser mayor a 0.');
      return;
    }
    const bid = (branchId || currentBranch?.id || '');
    if (!bid) {
      Alert.alert('Error', 'No se pudo determinar la sucursal.');
      return;
    }
    try {
      setEventSubmitting(true);
      await InventoryService.registerInventoryEvent({
        ownerId: user.owner_id || user.id,
        branchId: bid,
        wineId: eventItem.wine_id,
        stockId: eventItem.id,
        userId: user.id,
        direction: eventDirection,
        qty,
        reason: eventReason,
        notes: eventNotes.trim() || null,
      });
      Alert.alert('Listo', 'Evento registrado correctamente.');
      closeEventModal();
      loadData();
    } catch (err: any) {
      if (__DEV__) console.error('Error registering event:', err);
      Alert.alert('Error', err?.message || 'No se pudo registrar el evento.');
    } finally {
      setEventSubmitting(false);
    }
  };

  const openCountModal = (item: InventoryItem) => {
    const prev = item.stock_quantity ?? (item as any).quantity ?? 0;
    setCountItem(item);
    setCountPrevStock(prev);
    setCountQuantity(String(prev));
    setCountNotes('');
    setLastCountResult(null);
    setCountModalVisible(true);
  };

  const closeCountModal = () => {
    setCountModalVisible(false);
    setCountItem(null);
    setCountPrevStock(0);
    setCountQuantity('');
    setCountNotes('');
    setCountSubmitting(false);
  };

  const handleRegisterCount = async () => {
    if (!countItem || !user) return;
    const counted = parseInt(countQuantity, 10);
    if (isNaN(counted) || counted < 0) {
      Alert.alert('Dato inválido', 'El conteo actual debe ser un número mayor o igual a 0.');
      return;
    }
    const prev = countPrevStock;
    const bid = (branchId || currentBranch?.id || '');
    if (!bid) {
      Alert.alert('Error', 'No se pudo determinar la sucursal.');
      return;
    }
    try {
      setCountSubmitting(true);
      const result = await InventoryService.registerInventoryCount({
        ownerId: user.owner_id || user.id,
        branchId: bid,
        wineId: countItem.wine_id,
        countedQuantity: counted,
        receivedQuantity: 0,
        reason: 'conteo',
        notes: countNotes.trim() || null,
      });
      setLastCountResult(result);
      const finalPrev = result?.previous_count ?? prev;
      const finalCount = result?.new_count ?? counted;
      const finalDelta = finalCount - finalPrev;
      Alert.alert(
        'Conteo registrado',
        `Se ajustó el stock a ${finalCount} botellas (antes: ${finalPrev}, ajuste: ${finalDelta >= 0 ? '+' : ''}${finalDelta}).`
      );
      closeCountModal();
      loadData();
    } catch (err: any) {
      if (__DEV__) console.error('Error registering count:', err);
      Alert.alert('Error', err?.message || 'No se pudo registrar el conteo.');
    } finally {
      setCountSubmitting(false);
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
      image_url: item.wines.image_url || '', // Inicializar con la imagen actual
    });
    setEditModalVisible(true);
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
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
        if (__DEV__) console.error('Error uploading image:', uploadError);
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
      if (__DEV__) console.error('Error uploading image:', error);
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
        winery: wineEditData.winery || undefined,
        grape_variety: wineEditData.grape_variety,
        region: wineEditData.region || undefined,
        country: wineEditData.country || undefined,
        // Guardar vintage como string si contiene comas (múltiples añadas), 
        // de lo contrario como número (se convertirá a string en la BD después de la migración)
        vintage: wineEditData.vintage 
          ? (wineEditData.vintage.includes(',') 
              ? wineEditData.vintage.trim()
              : parseInt(wineEditData.vintage) || wineEditData.vintage.trim())
          : undefined,
        description: wineEditData.description || undefined,
        tasting_notes: wineEditData.tasting_notes || undefined,
        image_url: wineEditData.image_url || editingWine.wines.image_url || undefined,
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
        if (__DEV__) console.error('Error updating stock prices:', stockUpdateError);
        // No lanzamos error porque el vino ya se actualizó, solo logueamos
      }

      Alert.alert('Éxito', 'Vino actualizado correctamente');
      setEditModalVisible(false);
      loadData();
    } catch (error) {
      if (__DEV__) console.error('Error saving wine:', error);
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
              const bid = branchId || currentBranch?.id || '';
              if (!bid) {
                Alert.alert('Error', 'No se pudo determinar la sucursal.');
                return;
              }

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
                .eq('branch_id', bid);

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
              if (__DEV__) console.error('Error deleting wine:', error);
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
        // PDF de inventario: usar API real del servicio
        if (!inventoryStats) {
          Alert.alert('Datos no disponibles', 'Carga el inventario antes de generar el reporte.');
          return;
        }
        await PDFReportService.exportInventoryReport(
          currentBranch?.name ?? 'Sucursal',
          inventory,
          inventoryStats
        );
        Alert.alert('✅ Reporte Generado', 'El reporte de inventario ha sido generado exitosamente.');
      } else if (type === 'sales') {
        if (!user) return;
        const ownerId = user.owner_id ?? user.id;
        const bid = (branchId || currentBranch?.id || '');
        if (!bid) {
          Alert.alert('Error', 'No se pudo determinar la sucursal.');
          return;
        }
        setGeneratingEstimatedPDF(true);
        try {
          // Misma fuente y lógica que la pestaña Ventas estimadas (getSalesFromCountsByPeriod).
          const { rows, summary } = await InventoryService.getSalesFromCountsByPeriod({
            ownerId,
            branchId: bid,
            days: estimatedReportPeriod,
          });
          if (summary.valid_wines_count === 0 || rows.length === 0) {
            Alert.alert(
              'Datos insuficientes',
              'Necesitas al menos un vino con 2 conteos físicos (corte inicial y final) para generar el reporte de ventas estimadas.'
            );
            return;
          }
          const toDate = new Date();
          const fromDate = new Date();
          fromDate.setDate(fromDate.getDate() - estimatedReportPeriod);
          const fromStr = fromDate.toISOString().slice(0, 10);
          const toStr = toDate.toISOString().slice(0, 10);
          await PDFReportService.exportSalesFromCountsReport(
            currentBranch?.name ?? 'Sucursal',
            { from: fromStr, to: toStr, label: `Últimos ${estimatedReportPeriod} días` },
            rows,
            summary
          );
          Alert.alert('✅ Reporte generado', 'El reporte de ventas estimadas (desde cortes) se ha generado.');
        } catch (err: any) {
          if (__DEV__) console.error('Error generating sales from counts PDF:', err);
          Alert.alert('Error', err?.message ?? 'No se pudo generar el reporte.');
        } finally {
          setGeneratingEstimatedPDF(false);
        }
      } else if (type === 'comparison') {
        if (!comparisonFromCounts || comparisonFromCounts.summary.valid_branches_count === 0) {
          Alert.alert('Datos insuficientes', 'No hay sucursales con datos suficientes para generar el reporte comparativo.');
          return;
        }
        try {
          await PDFReportService.exportBranchComparisonReport(
            { from: '', to: '', label: `Últimos ${comparisonDays} días` },
            comparisonFromCounts.branches,
            comparisonFromCounts.summary
          );
          Alert.alert('✅ Reporte generado', 'El reporte comparativo se ha generado.');
        } catch (err: any) {
          if (__DEV__) console.error('Error generating comparison PDF:', err);
          Alert.alert('Error', err?.message ?? 'No se pudo generar el reporte.');
        }
      }
    } catch (error: any) {
      if (__DEV__) console.error('Error generando PDF:', error);
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

  const closeHelpModal = () => {
    if (dontShowHelpAgain) {
      setHelpHidden(true);
      AsyncStorage.setItem(HELP_MODAL_DONT_SHOW_KEY, 'true');
    }
    setHelpModalVisible(false);
    setDontShowHelpAgain(false);
  };

  const getSortedSalesFromCounts = (): SalesFromCountsRow[] => {
    const list = salesFromCounts ?? [];
    switch (sortBy) {
      case 'sales':
        return [...list].sort((a, b) => b.sold_estimated - a.sold_estimated);
      case 'revenue':
        return [...list].sort((a, b) => (b.revenue_estimated ?? 0) - (a.revenue_estimated ?? 0));
      case 'rotation':
        return [...list].sort((a, b) => b.sold_estimated - a.sold_estimated);
      default:
        return [...list];
    }
  };

  // ========================================
  // RENDER TAB 1: STOCK (INVENTARIO)
  // ========================================
  const renderStockTab = () => {
    const renderInventoryItem = ({ item }: { item: InventoryItem }) => {
      if (!item.wines) {
        return null;
      }
      return (
        <InventoryItemCard
          item={item}
          deletingWine={deletingWine}
          onEdit={openEditModal}
          onDelete={handleDeleteWine}
          onEvent={openEventModal}
          onCount={openCountModal}
        />
      );
    };

    return (
      <View style={styles.tabContent}>
        {!searchVisible ? (
          <TouchableOpacity
            style={styles.searchChip}
            onPress={() => setSearchVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="search" size={18} color="#666" style={styles.searchChipIcon} />
            <Text style={styles.searchChipText}>Buscar vino</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.searchWrapper}>
            <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar vino..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#999"
              autoFocus
            />
            <TouchableOpacity
              onPress={() => setSearchVisible(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.searchCloseButton}
            >
              <Ionicons name="close-circle" size={22} color="#999" />
            </TouchableOpacity>
          </View>
        )}

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
  // RENDER TAB 2: VENTAS (DESDE CORTES)
  // ========================================
  const renderSalesTab = () => {
    const salesPeriodSelector = (
      <View style={{ marginBottom: 16 }}>
        <Text style={[styles.inputLabel, { marginBottom: 8 }]}>Periodo (ventas estimadas)</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {([7, 30, 90] as const).map((days) => (
            <TouchableOpacity
              key={days}
              style={[
                styles.filterButton,
                salesFromCountsDays === days && styles.filterButtonActive,
                { paddingVertical: 10, paddingHorizontal: 16 },
              ]}
              onPress={() => setSalesFromCountsDays(days)}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  salesFromCountsDays === days && styles.filterButtonTextActive,
                ]}
              >
                {days} días
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );

    const validWinesCount = salesFromCountsSummary?.valid_wines_count ?? (salesFromCounts?.length ?? 0);
    if (validWinesCount === 0) {
      return (
        <View style={styles.tabContent}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {salesPeriodSelector}
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>📊</Text>
              <Text style={styles.emptyTitle}>Necesitas 2 conteos físicos (corte inicial y final) para ventas estimadas</Text>
              <Text style={styles.emptySubtitle}>Por cada vino: un conteo al inicio del periodo y otro al final. Las estimaciones se basan en cortes. Realiza conteos en la pestaña Stock.</Text>
            </View>
          </ScrollView>
        </View>
      );
    }

    const sorted = getSortedSalesFromCounts();
    const topByRevenue = [...sorted].sort((a, b) => (b.revenue_estimated ?? 0) - (a.revenue_estimated ?? 0)).slice(0, 5);
    const topBySold = [...sorted].sort((a, b) => b.sold_estimated - a.sold_estimated).slice(0, 5);

    const renderRow = ({ item, index }: { item: SalesFromCountsRow; index: number }) => (
      <View style={styles.wineMetricCard}>
        <View style={styles.wineRank}>
          <Text style={styles.wineRankText}>#{index + 1}</Text>
        </View>
        <View style={[styles.wineImageSmall, styles.placeholderImage]}>
          <Text style={styles.placeholderTextSmall}>🍷</Text>
        </View>
        <View style={styles.wineMetricInfo}>
          <Text style={styles.wineMetricName} numberOfLines={2}>{item.wine_name}</Text>
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Consumo est.:</Text>
              <Text style={styles.metricValue}>{item.sold_estimated}</Text>
              <Text style={styles.wineCalculationHint}>
                Cálculo: {item.start_count} + {item.entries_total} - {item.special_out_total} - {item.end_count}
              </Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Ingresos:</Text>
              <Text style={styles.metricValue} numberOfLines={1}>
                {item.revenue_estimated != null && item.revenue_estimated > 0 ? formatCurrencyMXN(item.revenue_estimated) : '—'}
              </Text>
              {item.sold_estimated > 0 && !isValidPrice(item.price_by_bottle) && (
                <Text style={styles.wineUnpricedHint}>Sin precio configurado</Text>
              )}
            </View>
          </View>
          <Text style={styles.wineExtraMetric}>
            Stock inicio: {item.start_count} · Entradas: {item.entries_total} · Salidas esp.: {item.special_out_total} · Stock fin: {item.end_count}
          </Text>
        </View>
      </View>
    );

    return (
      <View style={styles.tabContent}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {salesPeriodSelector}
            <View style={styles.chartSection}>
            <Text style={styles.sectionTitle}>💰 Top 5 por ingresos estimados (desde cortes)</Text>
            {topByRevenue.map((w, i) => (
              <View key={w.wine_id} style={styles.topRow}>
                <Text style={styles.topRank}>#{i + 1}</Text>
                <Text style={styles.topName} numberOfLines={1}>{w.wine_name}</Text>
                <Text style={styles.topValue} numberOfLines={1}>
                  {w.revenue_estimated != null && w.revenue_estimated > 0 ? formatCurrencyMXN(w.revenue_estimated) : '—'}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.chartSection}>
            <Text style={styles.sectionTitle}>📊 Top 5 por consumo estimado (botellas)</Text>
            {topBySold.map((w, i) => (
              <View key={w.wine_id} style={styles.topRow}>
                <Text style={styles.topRank}>#{i + 1}</Text>
                <Text style={styles.topName} numberOfLines={1}>{w.wine_name}</Text>
                <Text style={styles.topValue}>{w.sold_estimated} bot.</Text>
              </View>
            ))}
          </View>

          <View style={styles.sortButtons}>
            <TouchableOpacity
              style={[styles.sortButton, sortBy === 'sales' && styles.sortButtonActive]}
              onPress={() => setSortBy('sales')}
            >
              <Text style={[styles.sortButtonText, sortBy === 'sales' && styles.sortButtonTextActive]}>📈 Ventas est.</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sortButton, sortBy === 'revenue' && styles.sortButtonActive]}
              onPress={() => setSortBy('revenue')}
            >
              <Text style={[styles.sortButtonText, sortBy === 'revenue' && styles.sortButtonTextActive]}>💰 Ingresos</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sortButton, sortBy === 'rotation' && styles.sortButtonActive]}
              onPress={() => setSortBy('rotation')}
            >
              <Text style={[styles.sortButtonText, sortBy === 'rotation' && styles.sortButtonTextActive]}>🔄 Rotación</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={sorted}
            renderItem={renderRow}
            keyExtractor={(item) => item.wine_id}
            scrollEnabled={false}
            ListEmptyComponent={null}
          />
        </ScrollView>
      </View>
    );
  };

  // ========================================
  // RENDER TAB 4: REPORTS (REPORTES)
  // ========================================
  const renderReportsTab = () => {
    const summary = salesFromCountsSummary;
    const validWinesCount = summary?.valid_wines_count ?? 0;
    const totalRevenue = summary?.total_revenue_estimated ?? null;
    const totalSales = summary?.total_sold_estimated ?? 0;
    const hasValidRevenue = totalRevenue != null && totalRevenue > 0 && isValidPrice(totalRevenue);

    return (
      <View style={styles.tabContent}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Estadísticas Resumen (misma fuente que pestaña Ventas estimadas) */}
          <View style={styles.reportsStatsGrid}>
            <View style={styles.reportStatCard}>
              <Text style={styles.reportStatIcon}>🍷</Text>
              <Text style={styles.reportStatValue} numberOfLines={1}>{inventoryStats.totalWines}</Text>
              <Text style={styles.reportStatLabel}>Vinos</Text>
            </View>
            <View style={styles.reportStatCard}>
              <Text style={styles.reportStatIcon}>📦</Text>
              <Text style={styles.reportStatValue} numberOfLines={1}>{inventoryStats.totalBottles}</Text>
              <Text style={styles.reportStatLabel}>Botellas</Text>
            </View>
            <View style={styles.reportStatCard}>
              <Text style={styles.reportStatIcon}>💰</Text>
              <Text style={[styles.reportStatValue, styles.reportStatValueCurrency]} numberOfLines={1}>
                {inventoryStats.totalValue > 0
                  ? formatCurrencyMXN(inventoryStats.totalValue)
                  : inventoryStats.totalBottles > 0
                    ? '—'
                    : formatCurrencyMXN(0)}
              </Text>
              <Text style={styles.reportStatLabel}>Valor total</Text>
            </View>
            <View style={styles.reportStatCard}>
              <Text style={styles.reportStatIcon}>💵</Text>
              <Text style={[styles.reportStatValue, styles.reportStatValueCurrency]} numberOfLines={1}>
                {hasValidRevenue ? formatCurrencyMXN(totalRevenue) : '—'}
              </Text>
              <Text style={styles.reportStatLabel}>Ingresos estimados</Text>
            </View>
            <View style={styles.reportStatCard}>
              <Text style={styles.reportStatIcon}>📈</Text>
              <Text style={styles.reportStatValue} numberOfLines={1}>
                {validWinesCount > 0 ? totalSales : '—'}
              </Text>
              <Text style={styles.reportStatLabel}>Consumo est. total</Text>
            </View>
          </View>

          {(summary && (summary.unpriced_consumption_total > 0 || summary.unpriced_wines_count > 0)) && (
            <View style={styles.reportsUnpricedRow}>
              <Text style={styles.reportsUnpricedText}>
                Consumo sin precio configurado: {summary.unpriced_consumption_total} botellas
              </Text>
              {summary.unpriced_wines_count > 0 && (
                <Text style={styles.reportsUnpricedText}>Vinos sin precio: {summary.unpriced_wines_count}</Text>
              )}
            </View>
          )}

          {/* Periodo para ventas estimadas (misma lógica que pestaña Ventas estimadas) */}
          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.inputLabel, { marginBottom: 8 }]}>Periodo para ventas estimadas</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([7, 30, 90] as const).map((days) => (
                <TouchableOpacity
                  key={days}
                  style={[
                    styles.filterButton,
                    estimatedReportPeriod === days && styles.filterButtonActive,
                    { paddingVertical: 10, paddingHorizontal: 16 },
                  ]}
                  onPress={() => setEstimatedReportPeriod(days)}
                >
                  <Text
                    style={[
                      styles.filterButtonText,
                      estimatedReportPeriod === days && styles.filterButtonTextActive,
                    ]}
                  >
                    {days} días
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Botones de generación de PDF */}
          <View style={styles.reportsButtonsContainer}>
            <TouchableOpacity
              style={styles.reportButton}
              onPress={() => generatePDF('inventory')}
              disabled={generatingPDF || inventory.length === 0}
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
              disabled={generatingPDF || generatingEstimatedPDF}
            >
              {generatingEstimatedPDF ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.reportButtonIcon}>📊</Text>
                  <Text style={styles.reportButtonText}>Reporte de Ventas estimadas</Text>
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
  // RENDER TAB 3: COMPARACIÓN (SOLO OWNER) – misma lógica que Ventas estimadas (cortes)
  // ========================================
  const renderComparisonTab = () => {
    if (!comparisonFromCounts) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>🏢</Text>
          <Text style={styles.emptyTitle}>No hay datos de comparación</Text>
        </View>
      );
    }

    const { branches, summary } = comparisonFromCounts;
    const totalRevenue = summary.total_revenue_estimated ?? 0;
    const totalConsumption = summary.total_consumption_estimated ?? 0;
    const sortedBranches = [...branches].sort((a, b) => (b.total_revenue_estimated ?? 0) - (a.total_revenue_estimated ?? 0));

    return (
      <View style={styles.tabContent}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Periodo */}
          <View style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 8 }}>
            <Text style={[styles.inputLabel, { marginBottom: 8 }]}>Periodo</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([7, 30, 90] as const).map((days) => (
                <TouchableOpacity
                  key={days}
                  style={[
                    styles.filterButton,
                    comparisonDays === days && styles.filterButtonActive,
                    { paddingVertical: 10, paddingHorizontal: 16 },
                  ]}
                  onPress={() => setComparisonDays(days)}
                >
                  <Text
                    style={[
                      styles.filterButtonText,
                      comparisonDays === days && styles.filterButtonTextActive,
                    ]}
                  >
                    {days} días
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Resumen Global */}
          <View style={styles.comparisonHeader}>
            <Text style={styles.comparisonTitle}>📊 Resumen (desde cortes)</Text>
            <View style={styles.comparisonStats}>
              <View style={styles.comparisonStatCard}>
                <Text style={[styles.comparisonStatValue, { fontSize: 16 }]} numberOfLines={1}>
                  {totalRevenue > 0 ? formatCurrencyMXN(totalRevenue) : '—'}
                </Text>
                <Text style={styles.comparisonStatLabel}>Ingresos estimados</Text>
              </View>
              <View style={styles.comparisonStatCard}>
                <Text style={styles.comparisonStatValue}>{totalConsumption}</Text>
                <Text style={styles.comparisonStatLabel}>Consumo estimado</Text>
              </View>
            </View>
            <View style={styles.comparisonInfo}>
              <Text style={styles.comparisonInfoText}>
                🏆 Mejor: {summary.best_branch}
              </Text>
              <Text style={styles.comparisonInfoText}>
                📉 A mejorar: {summary.worst_branch}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.pdfButton, { marginTop: 12 }]}
              onPress={() => generatePDF('comparison')}
              disabled={generatingPDF || summary.valid_branches_count === 0}
            >
              {generatingPDF ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.pdfButtonText}>📄 PDF Multi-Sucursal</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Comparación por Sucursal */}
          <Text style={styles.sectionTitle}>🏢 Por sucursal</Text>
          {sortedBranches.map((branch, index) => {
            const contributionPct = totalRevenue > 0 && (branch.total_revenue_estimated ?? 0) >= 0
              ? ((branch.total_revenue_estimated ?? 0) / totalRevenue) * 100
              : 0;
            const hasData = branch.valid_wines_count > 0;

            return (
              <View key={branch.branch_id} style={styles.branchComparisonCard}>
                <View style={styles.branchComparisonHeader}>
                  <View style={styles.branchRank}>
                    <Text style={styles.branchRankText}>#{index + 1}</Text>
                  </View>
                  <Text style={styles.branchComparisonName}>{branch.branch_name}</Text>
                </View>

                {!hasData ? (
                  <Text style={[styles.comparisonInfoText, { marginVertical: 8 }]}>Datos insuficientes</Text>
                ) : (
                  <>
                    <View style={styles.branchComparisonMetrics}>
                      <View style={styles.branchComparisonMetricRow}>
                        <Text style={styles.branchComparisonLabel}>Ingresos est.:</Text>
                        <Text style={[styles.branchComparisonValue, styles.branchComparisonValueHighlight]} numberOfLines={1}>
                          {(branch.total_revenue_estimated ?? 0) > 0 ? formatCurrencyMXN(branch.total_revenue_estimated!) : '—'}
                        </Text>
                      </View>
                      <View style={styles.branchComparisonMetricRow}>
                        <Text style={styles.branchComparisonLabel}>Consumo est.:</Text>
                        <Text style={styles.branchComparisonValue}>{branch.total_consumption_estimated}</Text>
                      </View>
                    </View>

                    {(branch.top_wine || branch.bottom_wine) && (
                      <View style={{ marginTop: 8, marginBottom: 4 }}>
                        {branch.top_wine && (
                          <Text style={styles.wineExtraMetric}>
                            Más movido: {branch.top_wine.wine_name} ({branch.top_wine.sold_estimated} bot.)
                          </Text>
                        )}
                        {branch.bottom_wine && branch.bottom_wine.wine_name !== branch.top_wine?.wine_name && (
                          <Text style={styles.wineExtraMetric}>
                            Menos movido: {branch.bottom_wine.wine_name} ({branch.bottom_wine.sold_estimated} bot.)
                          </Text>
                        )}
                      </View>
                    )}

                    <View style={styles.contributionBar}>
                      <Text style={styles.contributionLabel}>Contribución:</Text>
                      <View style={styles.contributionBarContainer}>
                        <View
                          style={[
                            styles.contributionBarFill,
                            { width: `${Math.min(100, contributionPct)}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.contributionPercent}>
                        {totalRevenue > 0 ? `${contributionPct.toFixed(1)}%` : '—'}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={CELLARIUM.primary} />
        <Text style={styles.loadingText}>Cargando datos...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <CellariumHeader
        title="Inventario y Análisis"
        subtitle={currentBranch?.name || undefined}
        leftSlot={<IosHeaderBackSlot navigation={navigation} fallbackRoute="AdminDashboard" />}
        rightSlot={
          !helpHidden ? (
            <TouchableOpacity
              onPress={() => setHelpModalVisible(true)}
              style={styles.helpButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="help-circle-outline" size={20} color="rgba(255,255,255,0.88)" />
            </TouchableOpacity>
          ) : null
        }
      />

      <InventoryAnalyticsTabs
        viewMode={viewMode}
        onChangeMode={setViewMode}
        canCompareBranches={canCompareBranches}
      />

      {viewMode === 'stock' && renderStockTab()}
      {viewMode === 'sales' && renderSalesTab()}
      {viewMode === 'comparison' && renderComparisonTab()}
      {viewMode === 'reports' && renderReportsTab()}

      <InventoryEventModal
        visible={eventModalVisible}
        onRequestClose={closeEventModal}
        eventItem={eventItem}
        eventDirection={eventDirection}
        eventReason={eventReason}
        eventQty={eventQty}
        eventNotes={eventNotes}
        eventSubmitting={eventSubmitting}
        contentPaddingBottom={12 + insets.bottom}
        onChangeDirection={setEventDirection}
        onChangeReason={setEventReason}
        onChangeQty={setEventQty}
        onChangeNotes={setEventNotes}
        onConfirm={handleRegisterEvent}
      />

      <InventoryCountModal
        visible={countModalVisible}
        onRequestClose={closeCountModal}
        countItem={countItem}
        countPrevStock={countPrevStock}
        countQuantity={countQuantity}
        countNotes={countNotes}
        countSubmitting={countSubmitting}
        contentPaddingBottom={12 + insets.bottom}
        onChangeQuantity={setCountQuantity}
        onChangeNotes={setCountNotes}
        onConfirm={handleRegisterCount}
      />

      <EditInventoryWineModal
        visible={editModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
        editingWine={editingWine}
        wineEditData={wineEditData}
        setWineEditData={setWineEditData}
        savingWine={savingWine}
        uploadingImage={uploadingImage}
        contentPaddingBottom={12 + insets.bottom}
        onSave={handleSaveWine}
      />

      <HelpInventoryModal
        visible={helpModalVisible}
        onRequestClose={closeHelpModal}
        dontShowHelpAgain={dontShowHelpAgain}
        onDontShowChange={setDontShowHelpAgain}
      />
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
    backgroundColor: CELLARIUM.bg,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: CELLARIUM.muted,
  },
  helpButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
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
    backgroundColor: CELLARIUM.bg,
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
    color: CELLARIUM.primary,
    marginBottom: 2,
  },
  statValueWarning: {
    color: CELLARIUM.danger,
  },
  statLabel: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
  },
  pdfButton: {
    backgroundColor: CELLARIUM.primary,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  pdfButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  searchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    height: 40,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 20,
    backgroundColor: '#F3F3F3',
  },
  searchChipIcon: {
    marginRight: 8,
  },
  searchChipText: {
    fontSize: 15,
    color: '#666',
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: 26,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#F3F3F3',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  searchCloseButton: {
    marginLeft: 8,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
  },
  inventoryCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  inventoryCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  inventoryThumb: {
    width: 104,
    height: 104,
    borderRadius: 12,
    backgroundColor: '#F2F2F2',
  },
  inventoryThumbPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 28,
  },
  placeholderTextSmall: {
    fontSize: 20,
  },
  inventoryTextBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  inventoryWinery: {
    fontSize: 15,
    fontWeight: '600',
    color: '#924048',
    marginBottom: 2,
  },
  inventoryWineName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  inventoryRegion: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  inventoryPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#924048',
  },
  inventoryPriceCopa: {
    fontSize: 14,
    fontWeight: '500',
    color: '#924048',
    marginTop: 2,
  },
  inventoryActionColumn: {
    alignItems: 'center',
    gap: 10,
  },
  inventoryActionBtn: {
    width: 48,
    height: 48,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inventoryActionBtnPrimary: {
    backgroundColor: '#924048',
  },
  inventoryActionBtnSecondary: {
    backgroundColor: '#EAEAEA',
  },
  stockBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 8,
  },
  stockBlockLabel: {
    fontSize: 13,
    color: '#777',
    marginRight: 4,
  },
  stockBlockNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2E7D32',
  },
  inventoryCardFooter: {
    marginTop: 12,
  },
  inventoryDivider: {
    height: 1,
    backgroundColor: '#EEE',
  },
  inventoryValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  inventoryValueLabel: {
    fontSize: 13,
    color: '#666',
  },
  inventoryValueAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#924048',
  },
  inventoryBigActions: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 10,
  },
  inventoryBigBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inventoryBigBtnPrimary: {
    backgroundColor: '#924048',
  },
  inventoryBigBtnSecondary: {
    backgroundColor: '#F1F1F1',
  },
  inventoryBigBtnTextPrimary: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  inventoryBigBtnTextSecondary: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  filterButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    backgroundColor: '#F3F3F3',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  filterButtonActive: {
    backgroundColor: 'rgba(146,64,72,0.12)',
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  filterButtonTextActive: {
    color: '#924048',
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
    color: CELLARIUM.danger,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  actionButton: {
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginHorizontal: 2,
    minWidth: 44,
  },
  countButton: {
    flex: 1,
    backgroundColor: '#8E2C3A',
  },
  countSecondaryButton: {
    flex: 1,
    backgroundColor: '#5a6268',
  },
  ajusteButton: {
    backgroundColor: '#ffc107',
  },
  editButton: {
    backgroundColor: CELLARIUM.primary,
  },
  deleteButton: {
    backgroundColor: CELLARIUM.danger,
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
    color: CELLARIUM.primary,
  },
  wineImage: {
    width: 80,
    height: 120,
    borderRadius: 8,
    marginRight: 12,
    resizeMode: 'contain',
    backgroundColor: CELLARIUM.bg,
  },
  placeholderImage: {
    backgroundColor: CELLARIUM.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wineInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  wineWinery: {
    fontSize: 14,
    fontWeight: '600',
    color: CELLARIUM.primary,
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
    color: CELLARIUM.primary,
  },
  chartSection: {
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
    marginHorizontal: 16,
  },
  sortButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 14,
  },
  sortButton: {
    flex: 1,
    backgroundColor: '#F3F3F3',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  sortButtonActive: {
    backgroundColor: 'rgba(146,64,72,0.12)',
  },
  sortButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  sortButtonTextActive: {
    color: '#924048',
  },
  winesList: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  wineMetricCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  wineRank: {
    width: 32,
    height: 32,
    backgroundColor: CELLARIUM.primary,
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
    backgroundColor: CELLARIUM.bg,
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
    color: CELLARIUM.primary,
  },
  metricValueLow: {
    color: CELLARIUM.danger,
  },
  wineExtraMetric: {
    fontSize: 10,
    color: '#666',
  },
  wineCalculationHint: {
    fontSize: 9,
    color: '#999',
    marginTop: 2,
    fontStyle: 'italic',
  },
  wineUnpricedHint: {
    fontSize: 9,
    color: '#b8860b',
    marginTop: 2,
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
    backgroundColor: CELLARIUM.bg,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  comparisonStatValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: CELLARIUM.primary,
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
    backgroundColor: CELLARIUM.primary,
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
    color: CELLARIUM.primary,
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
    backgroundColor: CELLARIUM.primary,
  },
  contributionPercent: {
    fontSize: 11,
    color: CELLARIUM.primary,
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
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  topRank: {
    width: 28,
    fontSize: 14,
    fontWeight: 'bold',
    color: CELLARIUM.primary,
  },
  topName: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    marginRight: 8,
  },
  topValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
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
  helpModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  helpModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  helpModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  helpModalScroll: {
    maxHeight: 360,
  },
  helpBlock: {
    marginBottom: 16,
  },
  helpBlockTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: CELLARIUM.primary,
    marginBottom: 6,
  },
  helpBlockText: {
    fontSize: 13,
    color: '#555',
    lineHeight: 20,
  },
  helpModalNote: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  helpModalCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  helpModalCheckLabel: {
    fontSize: 13,
    color: '#555',
  },
  helpModalCloseButton: {
    backgroundColor: CELLARIUM.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  helpModalCloseText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalCopy: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalWineInfo: {
    backgroundColor: CELLARIUM.bg,
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
    backgroundColor: CELLARIUM.bg,
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
    fontSize: 15,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#28a745',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  reasonButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    marginHorizontal: -4,
  },
  reasonButton: {
    width: '48%',
    backgroundColor: CELLARIUM.bg,
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
    backgroundColor: CELLARIUM.primary,
    borderColor: CELLARIUM.primary,
  },
  reasonButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
  },
  reasonButtonTextActive: {
    color: '#fff',
  },
  // Estilos compactos y Cellarium para modales Registrar evento, Conteo físico y Editar vino
  modalScrollContent: {
    paddingBottom: 4,
  },
  modalContentCompact: {
    padding: 14,
  },
  modalTitleCompact: {
    fontSize: 20,
    marginBottom: 6,
  },
  modalCopyCompact: {
    marginBottom: 10,
    fontSize: 13,
  },
  modalWineInfoCompact: {
    padding: 8,
    marginBottom: 10,
    borderRadius: 10,
  },
  inputCompact: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  textAreaCompact: {
    minHeight: 56,
  },
  previewSectionCompact: {
    padding: 8,
    marginBottom: 10,
    backgroundColor: 'rgba(146,64,72,0.08)',
  },
  previewLabelCellarium: {
    fontSize: 12,
    color: '#924048',
    marginBottom: 2,
  },
  previewTextCellarium: {
    fontSize: 15,
    fontWeight: '600',
    color: '#924048',
  },
  modalButtonsCompact: {
    marginTop: 6,
  },
  modalButtonCompact: {
    paddingVertical: 10,
    minHeight: 44,
  },
  reasonButtonsCompact: {
    marginBottom: 10,
  },
  reasonButtonCompact: {
    minHeight: 40,
    paddingVertical: 8,
  },
  reasonButtonActiveCellarium: {
    backgroundColor: '#924048',
    borderColor: '#924048',
  },
  confirmButtonCellarium: {
    backgroundColor: '#924048',
  },
  editImagePreview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 16,
    backgroundColor: CELLARIUM.bg,
  },
  editImagePreviewCompact: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: CELLARIUM.bg,
  },
  imageButton: {
    backgroundColor: CELLARIUM.primary,
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
    color: CELLARIUM.primary,
    marginBottom: 4,
  },
  reportStatValueNoWrap: {
    maxWidth: '100%',
  },
  reportStatValueCurrency: {
    fontSize: 16,
    maxWidth: '100%',
  },
  reportStatLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  reportsUnpricedRow: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 10,
    backgroundColor: '#fffbe6',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#b8860b',
  },
  reportsUnpricedText: {
    fontSize: 12,
    color: '#666',
  },
  reportsButtonsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  reportButton: {
    flexDirection: 'row',
    backgroundColor: CELLARIUM.primary,
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

