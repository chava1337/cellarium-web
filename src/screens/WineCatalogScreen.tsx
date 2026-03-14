import React, { useState, useEffect, useRef, useMemo, useLayoutEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ImageBackground,
  Alert,
  Modal,
  FlatList,
  Animated,
  Pressable,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Wine, Branch } from '../types';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useDeviceInfo, getRecommendedLayout } from '../hooks/useDeviceInfo';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { WineService } from '../services/WineService';
import { supabase } from '../services/supabase';
import { useBranch } from '../contexts/BranchContext';
import { useGuest } from '../contexts/GuestContext';
import WineGlassSaleConfig from '../components/WineGlassSaleConfig';
import { getWineCarouselDimensions, getWineCarouselDimensionsForTablet } from '../constants/theme';
import CellariumLoader from '../components/CellariumLoader';
import LanguageSelector from '../components/LanguageSelector';
import { getCocktailMenu, CocktailDrink } from '../services/CocktailService';
import { getBilingualValue as getBilingualFromCatalog } from '../services/GlobalWineCatalogService';
import { 
  isValidPrice, 
  toValidPrice, 
  chunkArray, 
  normalizeWineFromCanonical,
  extractTasteLevelsFromCanonical,
  toLevel1to5,
  type WineUpdates
} from '../utils/wineCatalogUtils';
import { WINE_TYPE_UI_MAP, WINE_TYPES, type WineType } from '../constants/wineTypeUi';
import { persistWineUpdatesIfNeeded } from '../services/wineCanonicalNormalization';
import { PendingApprovalMessage } from '../components/PendingApprovalMessage';
import {
  getPublicMenuByToken,
  type PublicMenuResponse,
  type PublicMenuBranch,
  type PublicMenuWine,
} from '../services/PublicMenuService';

// Debug flags
const DEBUG = __DEV__;
const DEBUG_VERBOSE = false; // solo para logs globales de diagnóstico si lo activo manualmente
const DEBUG_TASTE_KEYS = false; // solo para detectar nuevas claves en taste_profile (loguear 1 vez por sesión)

// Helpers de logging globales (solo para diagnóstico cuando DEBUG_VERBOSE === true)
const debugLog = (...args: any[]) => {
  if (!DEBUG || !DEBUG_VERBOSE) return;
  console.log(...args);
};

const debugWarn = (...args: any[]) => {
  if (!DEBUG || !DEBUG_VERBOSE) return;
  console.warn(...args);
};

const MAX_INGREDIENTS_VISIBLE = 8;

/**
 * Parsea texto de ingredientes separados por comas en lista.
 * Usado en la ficha de coctel (card "Ingredientes:") para listado con bullets.
 */
function parseIngredients(ingredientsText: string | null | undefined): string[] {
  if (ingredientsText == null || ingredientsText === '') return [];
  return ingredientsText
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Map public-menu JSON to Branch + Wine[] for catalog UI (guest flow). */
function mapPublicMenuToWineCatalogItems(menu: PublicMenuResponse): { branch: Branch; wines: Wine[] } {
  const branch: Branch = {
    id: menu.branch.id,
    name: menu.branch.name,
    address: menu.branch.address ?? '',
    phone: '',
    email: '',
    created_at: '',
    updated_at: '',
  };
  const now = new Date().toISOString();
  const wines: Wine[] = (menu.wines || []).map((w: PublicMenuWine) => {
    const priceBottle = typeof w.price_by_bottle === 'number' && Number.isFinite(w.price_by_bottle) ? w.price_by_bottle : null;
    const priceGlass = typeof w.price_by_glass === 'number' && Number.isFinite(w.price_by_glass) ? w.price_by_glass : null;
    return {
      id: w.id,
      name: w.name ?? '',
      grape_variety: w.grape_variety ?? '',
      region: w.region ?? '',
      country: w.country ?? '',
      vintage: w.vintage ?? '',
      description: w.description ?? '',
      price: priceBottle ?? priceGlass ?? 0,
      price_per_glass: priceGlass ?? undefined,
      image_url: w.image_url ?? undefined,
      winery: w.winery ?? undefined,
      stock_quantity: typeof w.stock_quantity === 'number' && Number.isFinite(w.stock_quantity) ? w.stock_quantity : undefined,
      type: (w.type as Wine['type']) ?? undefined,
      created_at: now,
      updated_at: now,
    };
  });
  return { branch, wines };
}

type WineCatalogScreenNavigationProp = StackNavigationProp<RootStackParamList, 'WineCatalog'>;
type WineCatalogScreenRouteProp = RouteProp<RootStackParamList, 'WineCatalog'>;

interface Props {
  navigation: WineCatalogScreenNavigationProp;
  route: WineCatalogScreenRouteProp;
}

const WineCatalogScreen: React.FC<Props> = ({ navigation, route }) => {
  // Verificar si es un invitado (acceso por QR de comensal)
  const isGuest = route.params?.isGuest || false;
  const guestToken = route.params?.guestToken;

  // Trazabilidad guest: params y token al montar y cuando cambian
  useEffect(() => {
    if (!__DEV__) return;
    const params = route.params ?? {};
    const keys = Object.keys(params);
    console.log('[WineCatalog] route.params', {
      keys,
      isGuest: params?.isGuest,
      hasGuestToken: !!(params as any)?.guestToken,
      guestTokenLen: typeof (params as any)?.guestToken === 'string' ? (params as any).guestToken.length : 0,
      guestTokenSuffix: typeof (params as any)?.guestToken === 'string' && (params as any).guestToken.length > 4
        ? (params as any).guestToken.slice(-4)
        : 'n/a',
    });
  }, [route.params]);

  useEffect(() => {
    if (__DEV__) console.log('[WineCatalog] mount', { isGuest, hasGuestToken: !!guestToken, guestTokenLen: guestToken?.length ?? 0 });
  }, []);

  // TODO: Implementar guard admin si esta pantalla tiene funciones administrativas
  // useAdminGuard({ navigation, route, requireAuth: false }); // Solo bloquear guests, no requerir auth
  const { user } = useAuth(); // Obtener usuario autenticado
  const { currentBranch, setCurrentBranch, availableBranches, setAvailableBranches, isInitialized } = useBranch(); // Obtener sucursal actual y estado de inicialización
  const { session: guestSession, currentBranch: guestBranch } = useGuest(); // Obtener sesión e información de sucursal si existe
  const { language, getBilingualValue, t } = useLanguage(); // Obtener idioma y funciones bilingües
  const deviceInfo = useDeviceInfo();
  const layout = getRecommendedLayout(deviceInfo);
  
  const stableDeviceTypeRef = useRef<'tablet' | 'phone'>(deviceInfo.deviceType === 'tablet' ? 'tablet' : 'phone');
  const [stableIsTablet, setStableIsTablet] = useState(deviceInfo.deviceType === 'tablet');
  
  // Actualizar solo cuando deviceType cambie de forma consistente (con pequeño debounce)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const newType = deviceInfo.deviceType === 'tablet' ? 'tablet' : 'phone';
      if (stableDeviceTypeRef.current !== newType) {
        stableDeviceTypeRef.current = newType;
        setStableIsTablet(newType === 'tablet');
      }
    }, 250);
    return () => clearTimeout(timeoutId);
  }, [deviceInfo.deviceType]);
  
  // IMPORTANTE: stableIsTablet es la ÚNICA fuente de verdad para decisiones tablet/phone
  // Obtener dimensiones del carrusel
  // Por defecto SIEMPRE usa valores de smartphone (valores originales)
  const carouselDimensions = stableIsTablet
    ? getWineCarouselDimensionsForTablet()
    : getWineCarouselDimensions();
  
  // Debug: verificar detección de dispositivo (solo si DEBUG_VERBOSE)
  useEffect(() => {
    debugLog('📱 [WineCatalog] Device Detection:', {
      screenWidth: deviceInfo.screenWidth,
      screenHeight: deviceInfo.screenHeight,
      deviceType: deviceInfo.deviceType,
      isTabletDetected: stableIsTablet,
      usingTabletDimensions: stableIsTablet,
      itemWidth: carouselDimensions.ITEM_WIDTH,
      itemSpacing: carouselDimensions.ITEM_SPACING,
    });
  }, [deviceInfo.screenWidth, deviceInfo.screenHeight, deviceInfo.deviceType, stableIsTablet, carouselDimensions.ITEM_WIDTH, carouselDimensions.ITEM_SPACING]);
  const insets = useSafeAreaInsets();

  // Estados para modal de maridajes
  const [pairingsModalVisible, setPairingsModalVisible] = useState(false);
  const [pairingsWine, setPairingsWine] = useState<Wine | null>(null);

  // Handlers para modal de maridajes
  const openPairingsModal = useCallback((wine: Wine) => {
    setPairingsWine(wine);
    setPairingsModalVisible(true);
  }, []);

  const closePairingsModal = useCallback(() => {
    setPairingsModalVisible(false);
    setPairingsWine(null);
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Branch from public-menu when guest loads by token (no qr_tokens / wine_branch_stock from client)
  const [guestBranchFromMenu, setGuestBranchFromMenu] = useState<Branch | null>(null);
  const [guestMenuError, setGuestMenuError] = useState<string | null>(null);

  const activeBranch = useMemo(() => {
    if (isGuest && guestBranchFromMenu) return guestBranchFromMenu;
    if (isGuest && guestBranch) return guestBranch;
    return currentBranch;
  }, [currentBranch, guestBranch, guestBranchFromMenu, isGuest]);

  const branchDisplayName = activeBranch?.name?.trim() ?? '';
  const isBranchNameConfigured = branchDisplayName.length > 0;
  const canEditBranchName = !isGuest && user?.role === 'owner';
  const bottomPadding = useMemo(() => Math.max(insets.bottom, 16), [insets.bottom]);
  
  // Padding efectivo para evitar traslape con barra de navegación (Android)
  const effectiveBottomPadding = useMemo(() => {
    const base = Math.max(insets.bottom, 16);
    const guestExtra = isGuest
      ? (stableIsTablet ? 140 : (Platform.OS === 'android' ? 220 : 180))
      : (stableIsTablet ? 30 : 40);
    return Math.max(base + guestExtra, 24);
  }, [insets.bottom, isGuest, stableIsTablet]);
  
  const [wines, setWines] = useState<Wine[]>([]);
  const [filteredWines, setFilteredWines] = useState<Wine[]>([]);
  const [cocktails, setCocktails] = useState<CocktailDrink[]>([]);
  const [filteredCocktails, setFilteredCocktails] = useState<CocktailDrink[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified' | null>(null);
  const [availabilityFilter, setAvailabilityFilter] = useState<'by_glass' | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | null>(null);
  const [filterCanScrollLeft, setFilterCanScrollLeft] = useState(false);
  const [filterCanScrollRight, setFilterCanScrollRight] = useState(false);
  const [filterContainerWidth, setFilterContainerWidth] = useState(0);
  const [filterContentWidth, setFilterContentWidth] = useState(0);
  const [showCocktails, setShowCocktails] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const filterScrollXRef = useRef(0);
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [selectedWineForConfig, setSelectedWineForConfig] = useState<Wine | null>(null);
  const [isEditingBranchName, setIsEditingBranchName] = useState(false);
  const [branchNameInput, setBranchNameInput] = useState('');
  const [isSavingBranchName, setIsSavingBranchName] = useState(false);

  // Referencias para datos bilingües
  const rawWinesDataRef = useRef<any[]>([]);
  const canonicalDataRef = useRef<Map<string, any>>(new Map());
  const stockByWineIdRef = useRef<Map<string, any>>(new Map());
  
  // Referencia para evitar cargas duplicadas
  const lastLoadRef = useRef<number>(0);
  
  // Cache de owner_id por sucursal: { branchId, ownerId } | null
  // Nunca reutilizar ownerId si branchId no coincide con activeBranch.id
  const branchOwnerIdCacheRef = useRef<{ branchId: string; ownerId: string } | null>(null);
  
  useEffect(() => {
    if (!isEditingBranchName) {
      setBranchNameInput(branchDisplayName);
    }
  }, [branchDisplayName, isEditingBranchName]);
  
  // Referencia para el FlatList del carrusel
  const flatListRef = useRef<FlatList>(null);

  const handleFilterSelect = (filterKey: FilterKey) => {
    if (filterKey === 'all') {
      setShowCocktails(false);
      setSelectedTypeFilter(null);
      setAvailabilityFilter(null);
      setSortOrder(null);
    } else if (filterKey === 'cocktails') {
      setShowCocktails(true);
      setSelectedTypeFilter(null);
      setAvailabilityFilter(null);
      setSortOrder(null);
    } else if (filterKey === 'red' || filterKey === 'white' || filterKey === 'rose' || filterKey === 'sparkling' || filterKey === 'dessert' || filterKey === 'fortified') {
      setShowCocktails(false);
      setSelectedTypeFilter(filterKey);
      setAvailabilityFilter(null);
      setSortOrder(null);
    } else if (filterKey === 'by_glass') {
      setShowCocktails(false);
      setSelectedTypeFilter(null);
      setAvailabilityFilter('by_glass');
      setSortOrder(null);
    } else if (filterKey === 'sort_asc') {
      setShowCocktails(false);
      setSelectedTypeFilter(null);
      setAvailabilityFilter(null);
      setSortOrder('asc');
    }
  };

  const activeFilterKey = showCocktails 
    ? 'cocktails' 
    : (selectedTypeFilter 
        ?? availabilityFilter 
        ?? (sortOrder === 'asc' ? 'sort_asc' : null) 
        ?? 'all');

  const getSelectedFilterLabel = () => {
    if (showCocktails) return t('catalog.cocktails');
    if (!selectedTypeFilter && !availabilityFilter && !sortOrder) return t('catalog.all');
    const filter = filterBarItems.find((f: FilterItem) => f.key === activeFilterKey);
    return filter ? filter.label : t('catalog.all');
  };


  // Función para abrir configuración de venta por copa

  // Función para guardar configuración de venta por copa
  const handleSaveGlassSaleConfig = async (wineId: string, enabled: boolean, price?: number) => {
    try {
      // Validar que existe activeBranch
      if (!activeBranch?.id) {
        Alert.alert(t('catalog.error'), t('catalog.no_active_branch'));
        return;
      }

      // Validar precio si está habilitado usando helper unificado
      if (enabled && !isValidPrice(price)) {
        throw new Error(t('catalog.invalid_price'));
      }

      // Preparar el payload para upsert
      const payload = {
        branch_id: activeBranch.id,
        wine_id: wineId,
        price_by_glass: enabled ? price! : null,
        updated_at: new Date().toISOString(),
      };

      // Hacer UPSERT en wine_branch_stock (crea si no existe, actualiza si existe)
      const { data, error } = await supabase
        .from('wine_branch_stock')
        .upsert(payload, { onConflict: 'branch_id,wine_id' })
        .select('wine_id, branch_id, price_by_glass')
        .single();

      if (error) {
        debugWarn('Error al actualizar wine_branch_stock:', error);
        throw new Error(error.message ?? 'No se pudo actualizar la configuración');
      }

      const gp = toValidPrice(data.price_by_glass);
      setWines(prevWines => 
        prevWines.map(wine => 
          wine.id === wineId 
            ? { 
                ...wine, 
                available_by_glass: enabled ? (gp != null) : false,
                price_per_glass: enabled ? gp : undefined,
              }
            : wine
        )
      );

      const stock = stockByWineIdRef.current.get(wineId);
      if (stock) {
        // Clonar solo lo mínimo necesario para evitar mutaciones
        stockByWineIdRef.current.set(wineId, {
          ...stock,
          price_by_glass: data.price_by_glass,
        });
      }
      
      // Actualizar rawWinesDataRef si existe
      const rawIndex = rawWinesDataRef.current.findIndex((s: any) => s.wines?.id === wineId);
      if (rawIndex >= 0) {
        rawWinesDataRef.current[rawIndex] = {
          ...rawWinesDataRef.current[rawIndex],
          price_by_glass: data.price_by_glass,
        };
      }

      if (!data || (enabled && !isValidPrice(data.price_by_glass))) {
        safeLoadWines('glass-config');
      }

      // Mostrar mensaje de éxito
      Alert.alert(
        t('catalog.success'),
        enabled ? t('catalog.glass_sale_enabled') : t('catalog.glass_sale_disabled')
      );
    } catch (error) {
      debugWarn('Error al actualizar configuración:', error);
      const errorMessage = error instanceof Error ? error.message : (error as any)?.message;
      Alert.alert(t('catalog.error'), errorMessage ?? t('catalog.error_update_config'));
    }
  };

  // Tipo para clave de filtro (solo opciones visibles en la barra)
  type FilterKey =
    | 'all'
    | 'cocktails'
    | 'by_glass'
    | 'sort_asc'
    | WineType;

  type FilterItem = {
    key: FilterKey;
    label: string;
  };

  // Arreglo de filtros para la barra horizontal (solo key + label; WINE_TYPE_UI_MAP solo para labelKey)
  const filterBarItems = useMemo<FilterItem[]>(() => {
    const wineTypeItems: FilterItem[] = WINE_TYPES.map((wineType) => {
      const ui = WINE_TYPE_UI_MAP[wineType];
      return { key: wineType, label: t(ui.labelKey) };
    });

    return [
      { key: 'all', label: t('catalog.all') },
      { key: 'cocktails', label: t('catalog.cocktails') },
      ...wineTypeItems,
      { key: 'by_glass', label: t('catalog.by_glass') },
      { key: 'sort_asc', label: t('catalog.sort_asc') },
    ];
  }, [t]);

  // ============================================
  // WRAPPER PARA LOGGING DE NORMALIZACIÓN
  // ============================================
  // Wrapper para extractTasteLevelsFromCanonical con logging del componente
  // (las funciones de normalización están en utils/wineCatalogUtils.ts)
  const extractTasteLevelsWithLogging = (
    canonicalTasteProfile: any,
    wineType?: 'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified'
  ) => {
    return extractTasteLevelsFromCanonical(
      canonicalTasteProfile,
      wineType,
      {
        debug: DEBUG,
        debugTasteKeys: DEBUG_TASTE_KEYS,
        log: debugLog,
      }
    );
  };

  // Función para cargar vinos
  const loadWines = async () => {
      if (isGuest === true && !guestToken?.trim()) {
        if (__DEV__) console.log('[GUEST_GUARD] blocked guest load without token');
        return;
      }
      const loadErrors: string[] = [];
      
      try {
        setLoading(true);
        
        rawWinesDataRef.current = [];
        canonicalDataRef.current = new Map();
        stockByWineIdRef.current = new Map(); // Evitar que useEffect(language) reutilice stock de otra sucursal
        
        // Usar activeBranch para soportar modo guest y admin/staff
        const branchToUse = activeBranch;
        if (!branchToUse) {
          loadErrors.push('No hay sucursal disponible');
          debugLog('⚠️ No hay sucursal disponible');
          setWines([]);
          return;
        }

        // Obtener owner_id correcto
        // Leer del cache precargado por useEffect(loadBranchOwnerId)
        // Si no existe en cache, obtenerlo aquí como fallback y cachearlo
        let ownerId: string | undefined;
        const cached = branchOwnerIdCacheRef.current;
        if (cached && cached.branchId === branchToUse.id) {
          ownerId = cached.ownerId;
        } else {
          // Fallback: si el useEffect no lo precargó, obtenerlo aquí
          if (isGuest) {
            // En modo guest: obtener owner_id de la branch desde la BD
            const { data: branchData } = await supabase
              .from('branches')
              .select('owner_id')
              .eq('id', branchToUse.id)
              .single();
            
            ownerId = branchData?.owner_id;
            // Actualizar el cache con branchId y ownerId
            if (ownerId) {
              branchOwnerIdCacheRef.current = { branchId: branchToUse.id, ownerId };
            } else {
              branchOwnerIdCacheRef.current = null;
            }
          } else {
            // En modo admin/staff: usar owner_id del usuario
            ownerId = user?.owner_id || user?.id;
            // Actualizar el cache con branchId y ownerId
            if (ownerId) {
              branchOwnerIdCacheRef.current = { branchId: branchToUse.id, ownerId };
            } else {
              branchOwnerIdCacheRef.current = null;
            }
          }
        }
        
        if (!ownerId) {
          loadErrors.push('No se puede determinar owner_id');
          debugLog('⚠️ No se puede determinar owner_id');
          setWines([]);
          return;
        }
        
        // Obtener vinos con stock de la sucursal actual
        const wineStocks: any[] = await WineService.getWinesByBranch(branchToUse.id, ownerId);
        
        // Convertir datos de wine_branch_stock a Wine[] para mantener compatibilidad
        // Filtrar primero los registros que tienen datos de vino válidos
        const validWineStocks = wineStocks.filter(stock => stock.wines && stock.wines.id);
        
        // Guardar datos raw para re-procesamiento en cambio de idioma
        rawWinesDataRef.current = validWineStocks;
        stockByWineIdRef.current = new Map(validWineStocks.map(s => [s.wines.id, s]));
        
        // ============================================
        // OPTIMIZACIÓN: Batch query a wines_canonical
        // ============================================
        const labelsToFind = Array.from(new Set(validWineStocks.map(stock => stock.wines.name).filter(Boolean)));
        const wineriesToFind = Array.from(new Set(validWineStocks.map(stock => stock.wines.winery).filter(w => w && w.trim() !== '')));
        const wineryFallbackToFind = Array.from(new Set(validWineStocks.map(stock => stock.wines.name).filter(Boolean)));
        
        const wineriesSet = new Set(wineriesToFind);
        const wineryFallbackDedup = wineryFallbackToFind.filter(x => !wineriesSet.has(x));
        
        // Realizar queries batch con chunking para evitar límites de URL/query
        // Usar Set para deduplicar en O(1) en lugar de O(n²) con .some()
        const canonicalRowsSet = new Set<string>();
        const allCanonicalRows: any[] = [];
        const CHUNK_SIZE = 100;
        
        // Helper para crear key única de canonical row
        const getCanonicalKey = (row: any) => `${row.label || ''}__${row.winery || ''}`;
        
        // Query por labels
        const labelChunks = chunkArray(labelsToFind, CHUNK_SIZE);
        for (const chunk of labelChunks) {
          const { data: labelData, error: labelError } = await supabase
            .from('wines_canonical')
            .select('abv, taste_profile, label, winery, grapes, region, country, serving')
            .in('label', chunk);
          
          if (labelError) {
            loadErrors.push(`Error en query batch por labels: ${labelError.message || String(labelError)}`);
            debugLog('⚠️ Error en query batch por labels:', labelError.message || labelError);
          } else if (labelData) {
            for (const row of labelData) {
              const key = getCanonicalKey(row);
              if (!canonicalRowsSet.has(key)) {
                canonicalRowsSet.add(key);
                allCanonicalRows.push(row);
              }
            }
          }
        }
        
        // Query por wineries (solo si hay wineries únicas)
        if (wineriesToFind.length > 0) {
          const wineryChunks = chunkArray(wineriesToFind, CHUNK_SIZE);
          for (const chunk of wineryChunks) {
            const { data: wineryData, error: wineryError } = await supabase
              .from('wines_canonical')
              .select('abv, taste_profile, label, winery, grapes, region, country, serving')
              .in('winery', chunk);
            
            if (wineryError) {
              loadErrors.push(`Error en query batch por wineries: ${wineryError.message || String(wineryError)}`);
              debugLog('⚠️ Error en query batch por wineries:', wineryError.message || wineryError);
            } else if (wineryData) {
              // Evitar duplicados usando Set (O(1))
              for (const row of wineryData) {
                const key = getCanonicalKey(row);
                if (!canonicalRowsSet.has(key)) {
                  canonicalRowsSet.add(key);
                  allCanonicalRows.push(row);
                }
              }
            }
          }
        }
        
        const fallbackChunks = chunkArray(wineryFallbackDedup, CHUNK_SIZE);
        for (const chunk of fallbackChunks) {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('wines_canonical')
            .select('abv, taste_profile, label, winery, grapes, region, country, serving')
            .in('winery', chunk);
          
          if (fallbackError) {
            loadErrors.push(`Error en query batch por winery fallback: ${fallbackError.message || String(fallbackError)}`);
            debugLog('⚠️ Error en query batch por winery fallback:', fallbackError.message || fallbackError);
          } else if (fallbackData) {
            // Evitar duplicados usando Set (O(1))
            for (const row of fallbackData) {
              const key = getCanonicalKey(row);
              if (!canonicalRowsSet.has(key)) {
                canonicalRowsSet.add(key);
                allCanonicalRows.push(row);
              }
            }
          }
        }
        
        // Crear índices en memoria para lookup rápido
        const indexByLabel = new Map<string, any>();
        const indexByWinery = new Map<string, any>();
        
        for (const row of allCanonicalRows) {
          // Index por label (prioridad: primer match)
          if (row.label && !indexByLabel.has(row.label)) {
            indexByLabel.set(row.label, row);
          }
          
          // Index por winery (prioridad: primer match)
          if (row.winery && !indexByWinery.has(row.winery)) {
            indexByWinery.set(row.winery, row);
          }
        }
        
        // Obtener datos canónicos bilingües para TODOS los vinos usando índices
        const canonicalBilingualData = new Map<string, any>();
        for (const stock of validWineStocks) {
          const wineName = stock.wines.name;
          const wineWinery = stock.wines.winery || '';
          
          // Estrategia de lookup: label -> winery -> winery fallback (wineName)
          const canonicalData = 
            indexByLabel.get(wineName) ||
            (wineWinery ? indexByWinery.get(wineWinery) : null) ||
            indexByWinery.get(wineName) ||
            null;
          
          if (canonicalData) {
            canonicalBilingualData.set(stock.wines.id, canonicalData);
            canonicalDataRef.current.set(stock.wines.id, canonicalData);
          }
        }
        
        // Obtener datos sensoriales y grape_variety desde wines_canonical para vinos que los necesitan
        // REUSAR datos canónicos ya obtenidos (no hacer nuevas queries)
        // Detectar vinos que necesitan datos canónicos: cualquier nivel sensorial, alcohol o grape_variety faltante
        const winesNeedingData = validWineStocks.filter(stock =>
          stock.wines.body_level == null ||
          stock.wines.sweetness_level == null ||
          stock.wines.acidity_level == null ||
          stock.wines.intensity_level == null ||
          stock.wines.fizziness_level == null ||
          stock.wines.alcohol_content == null ||
          stock.wines.grape_variety == null ||
          (typeof stock.wines.grape_variety === 'string' && !stock.wines.grape_variety.trim())
        );
        
        if (winesNeedingData.length > 0) {
          // No loguear normalización en producción
          
          // Acumular tareas de actualización con metadata para logging
          interface UpdateTask {
            promiseFn: () => Promise<void>;
            wineId: string;
            wineName: string;
          }
          
          const updateTasks: UpdateTask[] = [];
          
          for (const stock of winesNeedingData) {
            const wineName = stock.wines.name;
            
            // Reusar canonicalData ya obtenido (de canonicalBilingualData o canonicalDataRef)
            const canonicalData = canonicalBilingualData.get(stock.wines.id) || canonicalDataRef.current.get(stock.wines.id);
            
            if (canonicalData && stock.wines.id) {
              // Usar función de utilidad para normalizar datos con logging
              const { updatesToSave } = normalizeWineFromCanonical(stock, canonicalData, extractTasteLevelsWithLogging);
              
              // Solo agregar tarea si hay updates para guardar
              if (Object.keys(updatesToSave).length > 0) {
                updateTasks.push({
                  promiseFn: () => persistWineUpdatesIfNeeded(stock.wines.id, wineName, updatesToSave),
                  wineId: stock.wines.id,
                  wineName: wineName,
                });
              }
            }
          }
          
          // Ejecutar updates en paralelo por tandas para evitar saturar la red
          if (updateTasks.length > 0) {
            const UPDATE_CHUNK_SIZE = 20; // 20 updates en paralelo por tanda
            const taskChunks = chunkArray(updateTasks, UPDATE_CHUNK_SIZE);
            
            for (let chunkIndex = 0; chunkIndex < taskChunks.length; chunkIndex++) {
              const chunk = taskChunks[chunkIndex];
              const results = await Promise.allSettled(chunk.map(task => task.promiseFn()));
              
              // Logging solo de errores críticos (sin objetos gigantes)
              results.forEach((result, taskIndex) => {
                if (result.status === 'rejected') {
                  const task = chunk[taskIndex];
                  const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
                  loadErrors.push(`Persist failed ${task.wineId}: ${errorMsg}`);
                  debugLog('⚠️ Persist failed', { wineId: task.wineId, wineName: task.wineName, errorMsg });
                }
              });
            }
          }
        }
        
        const winesData: Wine[] = validWineStocks.map((stock) => {
          const canonicalData = canonicalBilingualData.get(stock.wines.id);
          
          // Extraer valores bilingües
          const bilingualName = canonicalData && canonicalData.label
            ? getBilingualValue(canonicalData.label, stock.wines.name)
            : stock.wines.name;
          const bilingualWinery = canonicalData && canonicalData.winery
            ? getBilingualValue(canonicalData.winery, stock.wines.winery || '')
            : stock.wines.winery || '';
          const bilingualRegion = canonicalData && canonicalData.region
            ? getBilingualValue(canonicalData.region, stock.wines.region || '')
            : stock.wines.region || '';
          const bilingualCountry = canonicalData && canonicalData.country
            ? getBilingualValue(canonicalData.country, stock.wines.country || '')
            : stock.wines.country || '';
          const canonicalGrapes = canonicalData && canonicalData.grapes
            ? (() => {
                if (Array.isArray(canonicalData.grapes)) {
                  const joined = canonicalData.grapes.filter((g: string) => g && g.trim()).join(', ');
                  return joined || null;
                } else if (typeof canonicalData.grapes === 'string') {
                  const trimmed = canonicalData.grapes.trim();
                  return trimmed || null;
                }
                return null;
              })()
            : null;
          const bilingualFoodPairings = canonicalData && canonicalData.serving && canonicalData.serving.pairing
            ? (() => {
                const pairing = canonicalData.serving.pairing;
                const fp = language === 'es' ? (pairing.es || pairing.en) : (pairing.en || pairing.es);
                return Array.isArray(fp) ? fp : (typeof fp === 'string' ? fp.split(',').map(f => f.trim()).filter(f => f) : []);
              })()
            : (() => {
                const fp = stock.wines.food_pairings;
                if (!fp) return [];
                if (typeof fp === 'string') {
                  return fp.split(',').map(f => f.trim()).filter(f => f.length > 0);
                }
                if (Array.isArray(fp)) {
                  return fp.filter(f => f && f.trim().length > 0);
                }
                return [];
              })();
          
          return {
            id: stock.wines.id,
            name: bilingualName,
            grape_variety: (() => {
              const val = canonicalGrapes || stock.wines.grape_variety;
              // Asegurar que si es string vacío, devuelva null
              if (!val || (typeof val === 'string' && !val.trim())) {
                return null;
              }
              return typeof val === 'string' ? val.trim() : val;
            })(),
            region: bilingualRegion,
            country: bilingualCountry,
            vintage: stock.wines.vintage,
            alcohol_content: (() => {
              const raw =
                stock.wines.alcohol_content ??
                stock.wines.abv ??
                stock.wines.alcohol_percentage ??
                null;
              if (raw == null) return null;
              // Acepta "13.5", "13,5", "13.5 %", "13 % vol", etc.
              const num = parseFloat(String(raw).replace(',', '.').match(/[\d.]+/)?.[0] ?? '');
              return Number.isFinite(num) ? num : null;
            })(),
            description: stock.wines.description || '',
            // Calcular precios y disponibilidad con checks explícitos usando helpers unificados
            ...(() => {
              const bottlePrice = toValidPrice(stock.price_by_bottle);
              const glassPrice = toValidPrice(stock.price_by_glass);
              
              const hasBottle = bottlePrice != null;
              const hasGlass = glassPrice != null;
              
              return {
                price: hasBottle ? bottlePrice! : 0, // Mantener 0 para UI existente (no romper)
                price_per_glass: glassPrice,
                available_by_bottle: hasBottle,
                available_by_glass: hasGlass,
              };
            })(),
            image_url: stock.wines.front_label_image || stock.wines.image_url,
            // Características sensoriales desde BD
            // Convertir a número si viene como string y asegurar que esté en rango 1-5
            body_level: (() => {
              const val = stock.wines.body_level;
              if (val == null || val === undefined) return undefined;
              // Aceptar tanto number como string que represente un número
              const num = typeof val === 'number' ? val : (typeof val === 'string' && val.trim() !== '' ? parseFloat(val) : parseInt(String(val), 10));
              if (isNaN(num) || !Number.isFinite(num)) return undefined;
              // Clamp 1..5 y redondear a entero para consistencia
              return Math.round(Math.max(1, Math.min(5, num)));
            })(),
            sweetness_level: (() => {
              const val = stock.wines.sweetness_level;
              if (val !== null && val !== undefined) {
                const num = typeof val === 'number' ? val : (typeof val === 'string' && val.trim() !== '' ? parseFloat(val) : parseInt(String(val), 10));
                if (!isNaN(num) && Number.isFinite(num)) return Math.round(Math.max(1, Math.min(5, num)));
              }
              const fromTaste = canonicalData?.taste_profile?.sweetness;
              if (fromTaste !== undefined && fromTaste !== null) {
                const derived = toLevel1to5(fromTaste);
                if (derived !== undefined) return Math.round(Math.max(1, Math.min(5, derived)));
              }
              return undefined;
            })(),
            acidity_level: (() => {
              const val = stock.wines.acidity_level;
              if (val == null || val === undefined) return undefined;
              const num = typeof val === 'number' ? val : (typeof val === 'string' && val.trim() !== '' ? parseFloat(val) : parseInt(String(val), 10));
              if (isNaN(num) || !Number.isFinite(num)) return undefined;
              // Clamp 1..5 y redondear a entero para consistencia
              return Math.round(Math.max(1, Math.min(5, num)));
            })(),
            intensity_level: (() => {
              const val = stock.wines.intensity_level;
              if (val == null || val === undefined) return undefined;
              const num = typeof val === 'number' ? val : (typeof val === 'string' && val.trim() !== '' ? parseFloat(val) : parseInt(String(val), 10));
              if (isNaN(num) || !Number.isFinite(num)) return undefined;
              // Clamp 1..5 y redondear a entero para consistencia
              return Math.round(Math.max(1, Math.min(5, num)));
            })(),
            fizziness_level: (() => {
              const val = stock.wines.fizziness_level;
              if (val == null || val === undefined) return undefined;
              const num = typeof val === 'number' ? val : (typeof val === 'string' && val.trim() !== '' ? parseFloat(val) : parseInt(String(val), 10));
              if (isNaN(num) || !Number.isFinite(num)) return undefined;
              // Clamp 1..5 y redondear a entero para consistencia
              return Math.round(Math.max(1, Math.min(5, num)));
            })(), // Para espumosos
            // Información adicional desde BD
            winery: bilingualWinery,
            food_pairings: bilingualFoodPairings,
            tasting_notes: stock.wines.tasting_notes || '', // Incluir tasting_notes para detectar si viene del catálogo global
            serving_temperature: stock.wines.serving_temperature || '16-18°C',
            type: stock.wines.type as 'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified' | undefined,
            stock_quantity: (() => {
              // Normalizar stock_quantity a number | undefined (no string, no null)
              const sq = stock.stock_quantity;
              if (sq == null || sq === undefined) return undefined;
              if (typeof sq === 'string') {
                const num = Number(sq);
                return Number.isFinite(num) ? num : undefined;
              }
              return typeof sq === 'number' ? sq : undefined;
            })(),
            created_at: stock.wines.created_at,
            updated_at: stock.wines.updated_at,
          };
        });

        // No loguear carga masiva en producción
        setWines(winesData);
      } catch (error) {
        // Si hay loadErrors, agregar el error real también
        if (loadErrors.length > 0) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          loadErrors.push(`Catch error: ${errorMsg}`);
          debugWarn('❌ Error cargando vinos:', loadErrors[0]);
        } else {
          debugWarn('❌ Error cargando vinos:', error);
        }
        setWines([]);
      } finally {
        setLoading(false);
      }
  };

  /** Load menu via Edge public-menu (guest only; no qr_tokens / wine_branch_stock from client). */
  const loadGuestMenuByToken = useCallback(async () => {
    const token = guestToken?.trim();
    if (__DEV__) console.log('[WineCatalog] loadGuestMenuByToken called', { tokenLen: token?.length ?? 0, tokenSuffix: token && token.length > 4 ? token.slice(-4) : 'n/a' });
    if (!token) {
      setGuestMenuError(t('catalog.guest_token_missing'));
      setLoading(false);
      return;
    }
    setGuestMenuError(null);
    setLoading(true);
    rawWinesDataRef.current = [];
    canonicalDataRef.current = new Map();
    stockByWineIdRef.current = new Map();
    try {
      const menu = await getPublicMenuByToken(token);
      const { branch, wines } = mapPublicMenuToWineCatalogItems(menu);
      setGuestBranchFromMenu(branch);
      setWines(wines);
      setFilteredWines(wines);
      rawWinesDataRef.current = wines.map((w) => ({
        wines: w,
        stock_quantity: w.stock_quantity,
        price_by_glass: w.price_per_glass,
        price_by_bottle: w.price,
      }));
      const stockMap = new Map<string, { wines: Wine; stock_quantity?: number; price_by_glass?: number; price_by_bottle?: number }>();
      wines.forEach((w) => stockMap.set(w.id, { wines: w, stock_quantity: w.stock_quantity, price_by_glass: w.price_per_glass, price_by_bottle: w.price }));
      stockByWineIdRef.current = stockMap;
      if (__DEV__) console.log('[WineCatalog] loadGuestMenuByToken success', { branchId: branch?.id, winesCount: wines.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (__DEV__) console.warn('[GUEST_MENU] fetch failed', msg, err);
      // En __DEV__ mostrar error real para diagnosticar; en prod mensaje genérico
      const displayError = __DEV__ ? `${t('catalog.guest_code_expired')} [${msg}]` : t('catalog.guest_code_expired');
      setGuestMenuError(displayError);
      setWines([]);
      setFilteredWines([]);
      setGuestBranchFromMenu(null);
    } finally {
      setLoading(false);
    }
  }, [guestToken]);

  // Helper para evitar cargas duplicadas de vinos
  // Usa useRef para mantener referencia estable a loadWines y evitar loops
  const loadWinesRef = useRef<typeof loadWines | null>(null);
  loadWinesRef.current = loadWines;

  const safeLoadWines = useCallback((reason: string) => {
    if (isGuest === true && !guestToken?.trim()) {
      if (__DEV__) console.log('[GUEST_GUARD] blocked guest load without token');
      return;
    }
    const now = Date.now();
    if (now - lastLoadRef.current < 500) {
      debugLog(`⏭️ Carga duplicada evitada (${reason}), última carga hace ${now - lastLoadRef.current}ms`);
      return;
    }
    lastLoadRef.current = now;
    debugLog(`🔄 Cargando vinos (${reason})`);
    if (loadWinesRef.current) {
      loadWinesRef.current();
    }
  }, [isGuest, guestToken]); // Sin dependencias: usa loadWinesRef.current() que se actualiza automáticamente

  // Función para cargar cocteles
  const loadCocktails = async () => {
    try {
      const branchToUse = activeBranch;
      if (!branchToUse) {
        setCocktails([]);
        return;
      }

      const data = await getCocktailMenu(branchToUse.id);
      setCocktails(data);
    } catch (error) {
      debugWarn('❌ Error cargando cocteles:', error);
      setCocktails([]);
    }
  };

  // Cargar cocteles cuando se seleccione la opción o cambie la sucursal
  useEffect(() => {
    if (showCocktails && activeBranch) {
      loadCocktails();
    }
  }, [showCocktails, activeBranch?.id]);

  // Filtrar cocteles por búsqueda
  useEffect(() => {
    if (!showCocktails) {
      setFilteredCocktails([]);
      return;
    }

    let filtered = [...cocktails]; // Crear copia para no mutar el array original

    // Aplicar búsqueda por texto
    if (searchText) {
      filtered = filtered.filter(cocktail => {
        const name = getBilingualFromCatalog(cocktail.name, language) || getBilingualFromCatalog(cocktail.name, language === 'es' ? 'en' : 'es') || '';
        const description = cocktail.description 
          ? (getBilingualFromCatalog(cocktail.description, language) || getBilingualFromCatalog(cocktail.description, language === 'es' ? 'en' : 'es') || '')
          : '';
        const ingredients = Array.isArray(cocktail.ingredients)
          ? cocktail.ingredients.join(', ')
          : (typeof cocktail.ingredients === 'object' && cocktail.ingredients !== null
              ? (() => {
                  const esIngredients = Array.isArray(cocktail.ingredients.es) ? cocktail.ingredients.es.join(', ') : (cocktail.ingredients.es || '');
                  const enIngredients = Array.isArray(cocktail.ingredients.en) ? cocktail.ingredients.en.join(', ') : (cocktail.ingredients.en || '');
                  return language === 'es' ? (esIngredients || enIngredients) : (enIngredients || esIngredients);
                })()
              : '');

        return (
          name.toLowerCase().includes(searchText.toLowerCase()) ||
          description.toLowerCase().includes(searchText.toLowerCase()) ||
          ingredients.toLowerCase().includes(searchText.toLowerCase())
        );
      });
    }

    // Ordenar alfabéticamente - asegurar que siempre haya un nombre para ordenar
    filtered = filtered.sort((a, b) => {
      const nameA = (getBilingualFromCatalog(a.name, language) || getBilingualFromCatalog(a.name, language === 'es' ? 'en' : 'es') || '').toLowerCase();
      const nameB = (getBilingualFromCatalog(b.name, language) || getBilingualFromCatalog(b.name, language === 'es' ? 'en' : 'es') || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    setFilteredCocktails(filtered);
  }, [cocktails, searchText, showCocktails, language]);

  // Guest con token: cargar menú vía Edge public-menu (no qr_tokens ni wine_branch_stock)
  useEffect(() => {
    if (!isGuest) return;
    if (guestToken?.trim()) {
      loadGuestMenuByToken();
      return;
    }
    setGuestMenuError(t('catalog.guest_token_missing'));
    setGuestBranchFromMenu(null);
  }, [isGuest, guestToken, loadGuestMenuByToken]);

  // Cargar vinos reales de la base de datos (staff/legacy guest con branchId; no cuando guest sin token)
  useEffect(() => {
    if (!isGuest && user?.status === 'pending') return;
    if (isGuest && guestToken?.trim()) return; // guest con token usa loadGuestMenuByToken
    const canLoad = isGuest
      ? false // guest sin token nunca debe disparar safeLoadWines -> wine_branch_stock
      : !!user && user.status === 'active' && !!activeBranch && isInitialized;

    if (canLoad) {
      const timeoutId = setTimeout(() => {
        safeLoadWines('effect');
      }, 100);

      return () => clearTimeout(timeoutId);
    } else {
      if (!isGuest) {
        debugLog('⏳ Esperando inicialización:', {
          hasUser: !!user,
          hasBranch: !!activeBranch,
          isInitialized
        });
      }
    }
  }, [activeBranch?.id, user, isInitialized, isGuest, guestToken, safeLoadWines]);

  // Recargar vinos cuando se regrese del WineManagementScreen (no para guest sin token)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!isGuest && user?.status === 'pending') return;
      if (isGuest && guestToken?.trim()) return;
      const canLoad = isGuest
        ? false // guest sin token nunca debe disparar safeLoadWines -> wine_branch_stock
        : !!user && user.status === 'active' && !!activeBranch && isInitialized;

      if (canLoad) {
        safeLoadWines('focus');
      }
    });

    return unsubscribe;
  }, [navigation, activeBranch?.id, user, isInitialized, isGuest, guestToken, safeLoadWines]);

  // Cargar y cachear owner_id de la sucursal cuando cambie activeBranch
  useEffect(() => {
    const loadBranchOwnerId = async () => {
      if (!activeBranch?.id) {
        branchOwnerIdCacheRef.current = null;
        return;
      }

      // Limpiar cache si cambió la sucursal
      const cached = branchOwnerIdCacheRef.current;
      if (cached && cached.branchId !== activeBranch.id) {
        branchOwnerIdCacheRef.current = null;
        // Re-leer del ref después de limpiar para evitar usar cached "viejo"
        // No continuar con el cached anterior si cambió la sucursal
      }

      // Si ya tenemos cache válido para esta sucursal, no recargar
      // Re-leer del ref para asegurar que no usamos cached stale
      const currentCache = branchOwnerIdCacheRef.current;
      if (currentCache && currentCache.branchId === activeBranch.id) {
        return;
      }

      if (isGuest) {
        // En modo guest: obtener owner_id de la branch desde la BD
        try {
          const { data: branchData, error } = await supabase
            .from('branches')
            .select('owner_id')
            .eq('id', activeBranch.id)
            .single();
          
          if (error) {
            debugWarn('⚠️ Error al obtener owner_id de branch:', error);
            branchOwnerIdCacheRef.current = null;
          } else {
            const ownerId = branchData?.owner_id;
            if (ownerId) {
              branchOwnerIdCacheRef.current = { branchId: activeBranch.id, ownerId };
            } else {
              branchOwnerIdCacheRef.current = null;
            }
          }
        } catch (error) {
          debugWarn('⚠️ Error al obtener owner_id de branch:', error instanceof Error ? error.message : String(error));
          branchOwnerIdCacheRef.current = null;
        }
      } else {
        // En modo admin/staff: usar owner_id del usuario
        const ownerId = user?.owner_id || user?.id || null;
        if (ownerId) {
          branchOwnerIdCacheRef.current = { branchId: activeBranch.id, ownerId };
        } else {
          branchOwnerIdCacheRef.current = null;
        }
      }
    };

    loadBranchOwnerId();
  }, [activeBranch?.id, isGuest, user?.owner_id, user?.id]);

  // Recalcular valores bilingües cuando cambia el idioma
  useEffect(() => {
    // Guard estable: solo procesar si hay datos en cache
    if (rawWinesDataRef.current.length === 0) return;
    
    setWines(prevWines => {
      // Evitar loops: si no hay vinos, retornar sin cambios
      if (prevWines.length === 0) return prevWines;
      
      return prevWines.map(wine => {
        const stock = stockByWineIdRef.current.get(wine.id);
        if (!stock) return wine;
        
        const canonicalData = canonicalDataRef.current.get(stock.wines.id);
        if (!canonicalData) return wine;
        
        const bilingualName = canonicalData.label
          ? getBilingualValue(canonicalData.label, stock.wines.name)
          : stock.wines.name;
        const bilingualWinery = canonicalData.winery
          ? getBilingualValue(canonicalData.winery, stock.wines.winery || '')
          : stock.wines.winery || '';
        const bilingualRegion = canonicalData.region
          ? getBilingualValue(canonicalData.region, stock.wines.region || '')
          : stock.wines.region || '';
        const bilingualCountry = canonicalData.country
          ? getBilingualValue(canonicalData.country, stock.wines.country || '')
          : stock.wines.country || '';
        
        const bilingualFoodPairings = canonicalData.serving && canonicalData.serving.pairing
          ? (() => {
              const pairing = canonicalData.serving.pairing;
              const fp = language === 'es' ? (pairing.es || pairing.en) : (pairing.en || pairing.es);
              return Array.isArray(fp) ? fp : (typeof fp === 'string' ? fp.split(',').map(f => f.trim()).filter(f => f) : []);
            })()
          : wine.food_pairings || [];
        
        return {
          ...wine,
          name: bilingualName,
          winery: bilingualWinery,
          region: bilingualRegion,
          country: bilingualCountry,
          food_pairings: bilingualFoodPairings,
        };
      });
    });
  }, [language, getBilingualValue]);

  useEffect(() => {
    // Crear una copia inmutable del arreglo para evitar mutar el estado original
    // Array.prototype.sort() muta el arreglo en su lugar, por lo que necesitamos
    // una copia antes de aplicar cualquier operación de ordenamiento
    let filtered = [...wines];

    // Aplicar filtro por tipo
    if (selectedTypeFilter) {
      filtered = filtered.filter(wine => wine.type === selectedTypeFilter);
    }

    // Aplicar filtro por disponibilidad
    if (availabilityFilter === 'by_glass') {
      filtered = filtered.filter(wine => wine.available_by_glass);
    }

    // Aplicar búsqueda por texto
    if (searchText) {
      filtered = filtered.filter(wine =>
        wine.name.toLowerCase().includes(searchText.toLowerCase()) ||
        wine.region.toLowerCase().includes(searchText.toLowerCase()) ||
        wine.country.toLowerCase().includes(searchText.toLowerCase()) ||
        (wine.grape_variety && wine.grape_variety.toLowerCase().includes(searchText.toLowerCase())) ||
        (wine.winery && wine.winery.toLowerCase().includes(searchText.toLowerCase()))
      );
    }

    // Determinar orden de clasificación
    let currentSortOrder: 'asc' | 'desc' | null = sortOrder;
    
    if (!currentSortOrder) {
      // Default asc SOLO cuando NO hay type filter
      if (!selectedTypeFilter) {
        currentSortOrder = 'asc';
      }
    }

    // Aplicar ordenamiento por bodega si se determinó un orden
    if (currentSortOrder) {
      filtered = filtered.sort((a, b) => {
        // Usar winery si existe, sino usar name (label) como alternativa
        const wineryA = a.winery && a.winery.trim() !== '' ? a.winery.toLowerCase() : a.name.toLowerCase();
        const wineryB = b.winery && b.winery.trim() !== '' ? b.winery.toLowerCase() : b.name.toLowerCase();
        const comparison = wineryA.localeCompare(wineryB);
        return currentSortOrder === 'asc' ? comparison : -comparison;
      });
    }

    setFilteredWines(filtered);
  }, [wines, selectedTypeFilter, availabilityFilter, sortOrder, searchText]);

  const handleConfigGlassSaleMemo = useCallback((wine: Wine) => {
    setSelectedWineForConfig(wine);
    setConfigModalVisible(true);
  }, []);

  // Función para obtener la imagen de fondo según el tipo de vino
  const getWineCardBackground = useCallback((wineType: string) => {
    switch (wineType) {
      case 'sparkling':
        return require('../../assets/images/wine-card-fizzy.png');
      case 'red':
        return require('../../assets/images/wine-card-red.png');
      case 'white':
        return require('../../assets/images/wine-card-white.png');
      case 'dessert':
        return require('../../assets/images/wine-card-dessert.png');
      case 'fortified':
        return require('../../assets/images/wine-card-fortified.png');
      // case 'rose':
      //   return require('../../assets/images/wine-card-rose.png');
      default:
        return null; // Sin imagen de fondo para tipos no definidos
    }
  }, []);

  // Helper: Obtener maridajes finales (con defaults si es necesario)
  const getFinalPairings = useCallback((wine: Wine): string[] => {
    let pairings: string[] = [];
    if (Array.isArray(wine.food_pairings)) {
      pairings = wine.food_pairings.filter((p: string) => p && p.trim().length > 0);
    } else if (wine.food_pairings) {
      const fpStr = String(wine.food_pairings);
      pairings = fpStr.split(',').map((p: string) => p.trim()).filter((p: string) => p.length > 0);
    }
    
    // Si no hay suficientes, usar datos por defecto según el tipo de vino (bilingües)
    let finalPairings = pairings;
    if (pairings.length < 3) {
      const defaultPairings: Record<string, { es: string[]; en: string[] }> = {
        'red': {
          es: ['Carnes rojas', 'Quesos curados', 'Pastas con salsa'],
          en: ['Red meats', 'Aged cheeses', 'Pasta with sauce'],
        },
        'white': {
          es: ['Pescados', 'Mariscos', 'Aves'],
          en: ['Fish', 'Seafood', 'Poultry'],
        },
        'sparkling': {
          es: ['Aperitivos', 'Mariscos', 'Postres'],
          en: ['Appetizers', 'Seafood', 'Desserts'],
        },
        'rose': {
          es: ['Ensaladas', 'Pescados', 'Quesos suaves'],
          en: ['Salads', 'Fish', 'Soft cheeses'],
        },
        'dessert': {
          es: ['Postres dulces', 'Quesos azules', 'Frutos secos'],
          en: ['Sweet desserts', 'Blue cheeses', 'Dried fruits'],
        },
        'fortified': {
          es: ['Quesos curados', 'Chocolate', 'Frutos secos'],
          en: ['Aged cheeses', 'Chocolate', 'Dried fruits'],
        },
      };
      const wineType = wine.type || 'red';
      const defaults = defaultPairings[wineType] || defaultPairings['red'];
      const defaultsForLanguage = language === 'es' ? defaults.es : defaults.en;
      finalPairings = [...pairings, ...defaultsForLanguage.slice(0, 3 - pairings.length)];
    }
    
    return finalPairings;
  }, [language]);


  const WINE_TYPE_KEYS: readonly string[] = WINE_TYPES;

  // Componente de chip de filtro para la barra horizontal (tile premium, solo texto)
  const FilterChip = ({
    item,
    active,
    onPress,
    isTablet
  }: {
    item: FilterItem;
    active: boolean;
    onPress: () => void;
    isTablet: boolean;
  }) => {
    const isWineTypeChip = WINE_TYPE_KEYS.includes(item.key);
    const baseMinWidth = isTablet ? 120 : 110;
    const chipMinWidth = isWineTypeChip ? baseMinWidth + (isTablet ? 4 : 4) : baseMinWidth;
    const borderRadius = isTablet ? 18 : 16;
    const paddingVertical = isTablet ? 14 : 10;

    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.filterChip,
          styles.filterChipTextOnly,
          active && styles.filterChipActive,
          {
            minWidth: chipMinWidth,
            borderRadius,
            paddingVertical,
            transform: pressed ? [{ scale: 0.98 }] : [],
            opacity: pressed ? 0.95 : 1,
          }
        ]}
      >
        <Text
          style={[
            styles.filterChipLabelPremium,
            active && styles.filterChipLabelPremiumActive,
            { fontSize: isTablet ? 20 : 18, lineHeight: isTablet ? 24 : 22 }
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {item.label}
        </Text>
      </Pressable>
    );
  };

  // Componente de barra sensorial animada con gradiente y marcador
  const SensoryBar = ({ 
    value, 
    label,
    type,
    isMissing = false,
    isTablet = false
  }: { 
    value: number | undefined; // 0-5 o undefined si falta
    label: string; // Etiqueta centrada
    type?: 'body' | 'acidity' | 'tannin' | 'sweetness' | 'fizziness'; // Tipo para determinar paleta
    isMissing?: boolean; // Si true, no mostrar marcador (modo vacío)
    isTablet?: boolean; // Para ajustar tamaños
  }) => {
    const [barW, setBarW] = useState(0);
    const anim = useRef(new Animated.Value(0)).current;

    // Paletas (suave -> fuerte) - Más saturadas para mejor visibilidad
    // Usar ÚNICAMENTE type para determinar paleta (más robusto que comparar labels traducidos)
    const palette: readonly [string, string, ...string[]] =
      type === 'acidity'
        ? ['#d4f1d4', '#a8e0a8', '#7ec97e', '#4fa64f', '#2d7a2d', '#1b5e20'] as const // Verde oscuro
        : type === 'tannin'
        ? ['#fde2d2', '#f7b28e', '#ef7a52', '#d9472f', '#b51f1a', '#8B0000'] as const
        : type === 'sweetness'
        ? ['#fff0f6', '#ffc9e2', '#ff98c4', '#f25a98', '#c7326e', '#8B0000'] as const
        : type === 'fizziness'
        ? ['#e6f2ff', '#cde3ff', '#9fcaff', '#71b0ff', '#3788ff', '#0a56c2'] as const
        : ['#f3e5e5', '#e5b9b9', '#d18383', '#b25252', '#8f2c2c', '#8B0000'] as const; // Default: body (o si type es undefined)

    // Si falta el valor, usar 0 para posición pero no animar
    const clamped = value !== undefined ? Math.max(0, Math.min(5, value)) : 0;
    const targetX = barW * (clamped / 5);

    useEffect(() => {
      if (!isMissing) {
        Animated.timing(anim, { 
          toValue: targetX, 
          duration: 700, 
          useNativeDriver: false 
        }).start();
      } else {
        // Si está missing, mantener en 0 sin animar
        anim.setValue(0);
      }
    }, [targetX, anim, isMissing]);

    // Estilos dinámicos según dispositivo
    const barHeight = isTablet ? 14 : 10.5;
    const labelFontSize = isTablet ? 12 : 10;
    const marginBottom = isTablet ? 10 : 6;
    const horizontalPadding = isTablet ? 2 : 1; // Menos padding en phone para barras más anchas
    
    return (
      <View style={[
        styles.sensoryBarContainer,
        {
          marginBottom,
          paddingHorizontal: horizontalPadding,
        }
      ]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: isTablet ? 6 : 4 }}>
          <Text style={[
            styles.sensoryBarLabel,
            { fontSize: labelFontSize }
          ]}>{label}</Text>
          {isMissing && (
            <Text style={[
              styles.sensoryBarLabel,
              { 
                fontSize: labelFontSize - 2,
                color: '#999',
                marginLeft: 4,
                fontStyle: 'italic',
              }
            ]}>N/D</Text>
          )}
        </View>
        {/* Píldora con overflow hidden para bordes suaves */}
        <View
          style={[
            styles.sensoryPill,
            { height: barHeight }
          ]}
          onLayout={e => setBarW(e.nativeEvent.layout.width)}
        >
          {isMissing ? (
            // Barra gris suave para valores faltantes
            <View 
              style={[
                StyleSheet.absoluteFillObject,
                { backgroundColor: '#e0e0e0', borderRadius: barHeight / 2 }
              ]} 
            />
          ) : (
            <LinearGradient
              colors={palette}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFillObject}
            />
          )}
          {/* Indicador que "viaja" - solo si no está missing */}
          {!isMissing && (
            <Animated.View 
              style={[
                styles.sensoryMarker, 
                { 
                  left: Animated.subtract(anim, 6),
                  top: (barHeight - 12) / 2, // Centrado verticalmente
                  height: 12,
                }
              ]} 
            />
          )}
        </View>
      </View>
    );
  };

  // Renderizar perfil sensorial según tipo de vino
  const renderSensoryProfile = useCallback((wine: Wine, isTablet: boolean = false) => {
    const wineType = wine.type || 'red';
    
    // Usar valores reales (undefined si faltan) - NO usar ?? 0 para evitar marcadores falsos
    const bodyLevel = wine.body_level;
    const sweetnessLevel = wine.sweetness_level;
    const acidityLevel = wine.acidity_level;
    const tanninLevel = wine.intensity_level; // Para tintos
    const fizzinessLevel = wine.fizziness_level; // Para espumosos
    
    if (wineType === 'sparkling') {
      // ESPUMOSO: 3 barras - Cuerpo, Acidez, Burbujeo
      return (
        <View style={styles.sensorySectionCentered}>
          <SensoryBar 
            value={bodyLevel} 
            label={t('sensory.body')}
            type="body"
            isMissing={bodyLevel === undefined}
            isTablet={isTablet}
          />
          <SensoryBar 
            value={acidityLevel} 
            label={t('sensory.acidity')}
            type="acidity"
            isMissing={acidityLevel === undefined}
            isTablet={isTablet}
          />
          <SensoryBar 
            value={fizzinessLevel} 
            label={t('sensory.fizziness')}
            type="fizziness"
            isMissing={fizzinessLevel === undefined}
            isTablet={isTablet}
          />
        </View>
      );
    } else if (wineType === 'white' || wineType === 'dessert' || wineType === 'fortified') {
      // BLANCO/FORTIFICADO/POSTRE: 3 barras - Cuerpo, Dulzor, Acidez
      return (
        <View style={styles.sensorySectionCentered}>
          <SensoryBar 
            value={bodyLevel} 
            label={t('sensory.body')}
            type="body"
            isMissing={bodyLevel === undefined}
            isTablet={isTablet}
          />
          <SensoryBar 
            value={sweetnessLevel} 
            label={t('sensory.sweetness')}
            type="sweetness"
            isMissing={sweetnessLevel === undefined || sweetnessLevel === null}
            isTablet={isTablet}
          />
          <SensoryBar
            value={acidityLevel}
            label={t('sensory.acidity')}
            type="acidity"
            isMissing={acidityLevel === undefined}
            isTablet={isTablet}
          />
        </View>
      );
    } else {
      // TINTO (y rose): 4 barras - Cuerpo, Tanicidad, Dulzor, Acidez
      return (
        <View style={styles.sensorySectionCentered}>
          <SensoryBar 
            value={bodyLevel} 
            label={t('sensory.body')}
            type="body"
            isMissing={bodyLevel === undefined}
            isTablet={isTablet}
          />
          <SensoryBar 
            value={tanninLevel} 
            label={t('sensory.tannin')}
            type="tannin"
            isMissing={tanninLevel === undefined}
            isTablet={isTablet}
          />
          <SensoryBar
            value={sweetnessLevel}
            label={t('sensory.sweetness')}
            type="sweetness"
            isMissing={sweetnessLevel === undefined || sweetnessLevel === null}
            isTablet={isTablet}
          />
          <SensoryBar
            value={acidityLevel}
            label={t('sensory.acidity')}
            type="acidity"
            isMissing={acidityLevel === undefined}
            isTablet={isTablet}
          />
        </View>
      );
    }
  }, [t]);

  const renderCocktailCard = useCallback((cocktail: CocktailDrink) => {
    // Obtener valores bilingües con fallback
    const cocktailName = getBilingualFromCatalog(cocktail.name, language) || getBilingualFromCatalog(cocktail.name, language === 'es' ? 'en' : 'es') || '';
    const cocktailDescription = cocktail.description 
      ? (getBilingualFromCatalog(cocktail.description, language) || getBilingualFromCatalog(cocktail.description, language === 'es' ? 'en' : 'es') || '')
      : '';
    // Normalizar ingredientes a string y luego parsear por comas para listado
    const ingredientsRaw = Array.isArray(cocktail.ingredients)
      ? cocktail.ingredients.join(', ')
      : typeof cocktail.ingredients === 'string'
        ? cocktail.ingredients
        : typeof cocktail.ingredients === 'object' && cocktail.ingredients !== null
          ? (() => {
              const obj = cocktail.ingredients as { es?: string[]; en?: string[] };
              const esArr = Array.isArray(obj.es) ? obj.es : [];
              const enArr = Array.isArray(obj.en) ? obj.en : [];
              const arr = language === 'es' ? (esArr.length > 0 ? esArr : enArr) : (enArr.length > 0 ? enArr : esArr);
              return arr.join(', ');
            })()
          : '';
    const cocktailIngredientsParsed = parseIngredients(ingredientsRaw);
    const originalHadComma = ingredientsRaw.indexOf(',') >= 0;
    const visibleIngredients = cocktailIngredientsParsed.slice(0, MAX_INGREDIENTS_VISIBLE);
    const overflowCount = cocktailIngredientsParsed.length - MAX_INGREDIENTS_VISIBLE;

    return (
      <View key={cocktail.id} style={{ width: carouselDimensions.ITEM_WIDTH }}>
        <View style={styles.wineCard}>
          {/* Contenedor principal - Imagen centrada ocupando todo el espacio */}
          <View style={styles.wineCardBody}>
            <View style={[styles.wineCardContent, stableIsTablet && { height: 280 }]}>
              {/* Imagen del coctel ocupando todo el espacio (sin ficha sensorial) */}
              <View style={{
                flex: 1,
                width: '100%',
                backgroundColor: '#f8f9fa',
                justifyContent: 'center',
                alignItems: 'center',
                padding: stableIsTablet ? 16 : 12,
              }}>
                {cocktail.image_url ? (
                  <Image 
                    source={{ uri: cocktail.image_url }} 
                    style={{
                      width: '100%',
                      height: '100%',
                      resizeMode: 'contain', // Mantener proporción y centrar
                      maxWidth: '100%',
                      maxHeight: '100%',
                    }} 
                  />
                ) : (
                  <View style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: '#f0f0f0',
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderRadius: 8,
                  }}>
                    <Ionicons name="wine" size={60} color="#ccc" />
                  </View>
                )}
              </View>
            </View>

            {/* Información principal del coctel - Background temático coctelería (romero + limón + shaker) */}
            {(() => {
              const cocktailCardBackground = stableIsTablet
                ? require('../../assets/images/bg_cocktail_tablet.jpg')
                : require('../../assets/images/bg_cocktail_phone.jpg');

              return (
                <ImageBackground
                  source={cocktailCardBackground}
                  resizeMode="cover"
                  imageStyle={{ opacity: 1 }}
                  style={styles.wineAdditionalInfo}
                >
                  {/* Overlay oscuro para legibilidad del texto */}
                  <View style={StyleSheet.absoluteFillObject}>
                    <LinearGradient
                      colors={['rgba(0,0,0,0.20)', 'rgba(0,0,0,0.40)', 'rgba(0,0,0,0.60)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                  </View>
                    <ScrollView 
                      style={styles.wineAdditionalInfoScroll}
                      contentContainerStyle={[styles.wineAdditionalInfoContent, { alignItems: 'center' }]}
                      showsVerticalScrollIndicator={false}
                      nestedScrollEnabled={true}
                      bounces={false}
                    >
                      {/* Nombre del coctel — centrado, colores claros para contraste sobre fondo oscuro */}
                      <View style={[styles.wineNameRow, { alignSelf: 'stretch', alignItems: 'center' }]}>
                        <Text style={[styles.wineName, { color: '#FFFFFF', fontSize: 21, fontWeight: '700', textAlign: 'center' }]} numberOfLines={2} ellipsizeMode="tail">
                          {cocktailName}
                        </Text>
                      </View>

                      {/* Descripción */}
                      {cocktailDescription && (
                        <Text style={[styles.wineCountry, { marginTop: 8, marginBottom: 12, lineHeight: 20, color: 'rgba(255,255,255,0.85)', textAlign: 'center' }]}>
                          {cocktailDescription}
                        </Text>
                      )}

                      {/* Ingredientes: listado por comas (bullets si 2+ o original tenía coma) */}
                      {visibleIngredients.length > 0 && (
                        <View style={{ marginTop: 12, alignSelf: 'stretch', alignItems: 'center' }}>
                          <Text style={[styles.wineGrapes, { fontWeight: '600', marginBottom: 6, fontSize: 14, color: 'rgba(255,255,255,0.9)', textAlign: 'center' }]}>
                            {t('cocktail.ingredients')}:
                          </Text>
                          {visibleIngredients.length === 1 && !originalHadComma ? (
                            <Text style={[styles.wineGrapes, { lineHeight: 20, color: 'rgba(255,255,255,0.85)', textAlign: 'center' }]}>
                              {visibleIngredients[0]}
                            </Text>
                          ) : (
                            <>
                              {visibleIngredients.map((item, idx) => (
                                <Text key={idx} style={[styles.wineGrapes, { lineHeight: 22, color: 'rgba(255,255,255,0.85)', textAlign: 'center' }]}>
                                  • {item}
                                </Text>
                              ))}
                              {overflowCount > 0 && (
                                <Text style={[styles.wineGrapes, { lineHeight: 22, color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginTop: 2 }]}>
                                  +{overflowCount} más
                                </Text>
                              )}
                            </>
                          )}
                        </View>
                      )}
                    </ScrollView>
                </ImageBackground>
              );
            })()}
          </View>

          {/* Footer: Precio - Similar a vinos (texto claro para contraste sobre card oscura) */}
          <View
            style={[
              styles.pricesContainer,
              { paddingHorizontal: stableIsTablet ? 20 : 16 },
            ]}
          >
            <View style={styles.priceContainer}>
              <View style={styles.priceRowTop}>
                <Text style={[
                  styles.priceBottle,
                  {
                    fontSize: stableIsTablet ? 18 : 16,
                    color: '#FFFFFF',
                  }
                ]}>
                  ${cocktail.price.toFixed(2)}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  }, [stableIsTablet, carouselDimensions.ITEM_WIDTH, t, language]);

  // Subcomponente: Bloque de imagen del vino
  const WineImageBlock = ({ wine, isTablet }: { wine: Wine; isTablet: boolean }) => {
    const imageHeight = isTablet ? 200 : 180;
    const imagePadding = isTablet ? 12 : 8;
    
    return (
      <View style={styles.wineImageSection}>
        <View style={[
          styles.imageContainer,
          {
            height: imageHeight,
            padding: imagePadding,
            backgroundColor: '#fff',
            borderRadius: 12,
          }
        ]}>
          {wine.image_url && wine.image_url.trim() !== '' ? (
            <Image 
              source={{ uri: wine.image_url }} 
              style={styles.wineImage}
              resizeMode="contain"
            />
          ) : (
            <View style={{
              width: '100%',
              height: '100%',
              backgroundColor: '#f0f0f0',
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: 8,
            }}>
              <Ionicons name="wine" size={isTablet ? 60 : 50} color="#ccc" />
            </View>
          )}
        </View>
      </View>
    );
  };

  // Subcomponente: Bloque sensorial (wrapper del renderSensoryProfile)
  const WineSensoryBlock = ({ wine, isTablet }: { wine: Wine; isTablet: boolean }) => {
    const sectionPadding = isTablet ? 12 : 8;
    const sectionHeight = isTablet ? 200 : 180;
    
    return (
      <View style={[
        styles.wineInfoSection,
        {
          height: sectionHeight,
          padding: sectionPadding,
          paddingLeft: sectionPadding,
        }
      ]}>
        {renderSensoryProfile(wine, isTablet)}
      </View>
    );
  };

  // Subcomponente: Bloque de información (winery, nombre, país, uvas, vintage)
  const WineInfoBlock = ({ wine, t, onOpenPairings, isTablet }: { wine: Wine; t: (key: string) => string; onOpenPairings: (wine: Wine) => void; isTablet: boolean }) => {
    const winery = wine.winery?.trim() || '';
    const wineName = wine.name?.trim() || '';
    const areEqual = winery.toLowerCase() === wineName.toLowerCase() && winery.length > 0;
    const isFromGlobalCatalog = wine.tasting_notes === 'Del catálogo global' 
      || (wine.description && wine.description.includes('catálogo global'));
    
    const vintageDisplay = !isFromGlobalCatalog && wine.vintage
      ? (() => {
          const vintageStr = String(wine.vintage);
          const vintages = vintageStr.split(',').map(v => v.trim()).filter(v => v);
          return vintages.join(', ');
        })()
      : null;

    // Detectar si las uvas son largas para ajustar layout
    const grapesText = (wine.grape_variety ?? '').trim();
    const grapeCount = grapesText ? grapesText.split(',').map(s => s.trim()).filter(Boolean).length : 0;
    const isGrapesLong = grapesText.length > 26 || grapeCount >= 3;

    return (
      <View style={styles.wineInfoBlockContainer}>
        {/* Glass card overlay para legibilidad */}
        <View style={styles.wineInfoBlockOverlay} />
        
        {/* Contenido del bloque */}
        <View style={[
          styles.wineInfoBlockContent,
          isGrapesLong && styles.wineInfoBlockContentLong,
          isGrapesLong && styles.wineInfoBlockContentManyGrapes,
          isGrapesLong && isTablet && styles.wineInfoBlockContentManyGrapesTablet
        ]}>
          {/* Nombre de la bodega - Arriba (solo si es diferente al nombre del vino) */}
          {!areEqual && winery && (
            <Text style={styles.wineWinery} numberOfLines={1} ellipsizeMode="tail">{winery}</Text>
          )}
          
        {/* Nombre del vino */}
          <View style={styles.wineNameRow}>
            <Text style={styles.wineName} numberOfLines={2} ellipsizeMode="tail">{wine.name}</Text>
          </View>
          
          {/* País - Uvas (en la misma línea o seguidos) */}
          <View style={styles.wineOriginRow}>
            <View style={styles.wineOriginLeft}>
              {/* Wrapper para country + separator para que no bloqueen el wrap */}
              {(wine.country || (wine.country && wine.grape_variety)) && (
                <View style={styles.countryInlineWrap}>
                  {wine.country && (
                    <Text style={styles.wineCountry} numberOfLines={1} ellipsizeMode="tail">{wine.country}</Text>
                  )}
                  {wine.country && wine.grape_variety && (
                    <Text style={styles.wineOriginSeparator}> • </Text>
                  )}
                </View>
              )}
              {wine.grape_variety && (
                <Text 
                  style={[
                    styles.wineGrapesInline,
                    isGrapesLong && styles.wineGrapesInlineLong,
                    isGrapesLong && styles.wineGrapesInlineMany
                  ]} 
                  numberOfLines={isGrapesLong ? 3 : 1} 
                  ellipsizeMode="tail"
                >
                  {wine.grape_variety}
                </Text>
              )}
            </View>
            {/* ABV Badge - fijo a la derecha, NO participa en wrap */}
            {(() => {
              const val = wine.alcohol_content;
              if (val == null) return null;
              const num = typeof val === 'number'
                ? val
                : parseFloat(String(val).replace(',', '.').match(/[\d.]+/)?.[0] ?? '');
              const display = Number.isFinite(num) ? num.toFixed(1) : String(val);
              return (
                <View style={styles.abvBadge}>
                  <Text style={styles.abvBadgeText}>{display}% vol.</Text>
                </View>
              );
            })()}
          </View>
          
          {/* Añada - SOLO mostrar si NO viene del catálogo global */}
          {vintageDisplay && (
            <Text style={styles.wineVintage} numberOfLines={1} ellipsizeMode="tail">{t('wine.vintage_label')} {vintageDisplay}</Text>
          )}
        </View>
        
        {/* Botón de maridaje - absolute, no afecta el flujo vertical */}
        <TouchableOpacity
          style={styles.pairingsChipButton}
          onPress={() => onOpenPairings(wine)}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="restaurant-outline" size={14} color="#3A3534" />
            <Text style={styles.pairingsChipText}>{t('wine.food_pairings')}</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  // Subcomponente: Bloque de precios (solo informativo; botón config venta por copa para staff)
  const WinePricesBlock = ({
    wine,
    hasBottle,
    hasGlass,
    isGuest,
    user,
    handleConfigGlassSaleMemo,
    t,
    isTablet,
  }: {
    wine: Wine;
    hasBottle: boolean;
    hasGlass: boolean;
    isGuest: boolean;
    user: any;
    handleConfigGlassSaleMemo: (wine: Wine) => void;
    t: (key: string) => string;
    isTablet: boolean;
  }) => {
    // Helper para formateo robusto de precios
    const toMoney = (v: any): string | null => {
      if (v == null) return null;
      const n = typeof v === 'number'
        ? v
        : parseFloat(String(v).replace(',', '.').match(/[\d.]+/)?.[0] ?? '');
      if (!Number.isFinite(n)) return null;
      return `$${n.toFixed(2)}`;
    };

    // Precios formateados con toMoney
    const bottleMoney = toMoney(wine.price);
    const glassMoney = toMoney(wine.price_per_glass);
    
    // Asegurar que hasGlass sea efectivo solo si hay precio válido
    const effectiveHasGlass = hasGlass && !!glassMoney;
    const effectiveHasBottle = hasBottle && !!bottleMoney;
    
    const bottlePrice = effectiveHasBottle ? bottleMoney! : '—';
    const glassPrice = effectiveHasGlass ? glassMoney! : '—';
    
    // Layout: siempre 2 columnas (phone y tablet)
    const useColumns = true;
    
    return (
      <>
        {/* Footer: Precios - Al final de la tarjeta - SIEMPRE VISIBLE */}
        <LinearGradient
          colors={[CELLARIUM.primaryDarker, CELLARIUM.primary, CELLARIUM.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.pricesContainer,
            {
              paddingHorizontal: isTablet ? 20 : 16,
              paddingTop: isTablet ? 10 : 8,
              paddingBottom: isTablet ? 10 : 8,
            },
            isTablet && { minHeight: 0 },
          ]}
        >
          <View style={[
            styles.priceContainer,
            !isTablet && styles.priceContainerPhone
          ]}>
            {/* Contenedor de precios con stack vertical - CENTRADO */}
            <View style={styles.pricesStack}>
              <View style={styles.priceLine}>
                <Text style={[
                  styles.priceValue,
                  isTablet ? styles.priceValueTablet : styles.priceValuePhone,
                  !effectiveHasBottle && styles.priceValueUnavailable
                ]}>
                  {bottlePrice}
                </Text>
                <Text style={styles.priceLabel}>{t('wine.bottle')}</Text>
              </View>

              <View
                style={[
                  styles.priceLine,
                  { marginTop: 2, opacity: effectiveHasGlass ? 1 : 0 }
                ]}
                pointerEvents={effectiveHasGlass ? 'auto' : 'none'}
              >
                <Text style={[
                  styles.priceValue,
                  isTablet ? styles.priceValueTablet : styles.priceValuePhone,
                  !effectiveHasGlass && styles.priceValueUnavailable
                ]}>
                  {glassPrice}
                </Text>
                <Text style={styles.priceLabel}>{t('wine.glass')}</Text>
              </View>
            </View>
            
            {/* Botón de configuración - POSICIÓN ABSOLUTA (fuera del flujo) */}
            {!isGuest && user && user.role !== 'personal' && (
              <TouchableOpacity
                style={[
                  styles.configButton,
                  styles.configButtonAbsolute,
                  !isTablet && styles.configButtonPhone
                ]}
                onPress={() => handleConfigGlassSaleMemo(wine)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="settings-outline" size={22} color="rgba(255,255,255,0.92)" />
              </TouchableOpacity>
            )}
          </View>
        </LinearGradient>
    </>
  );
  };

  const renderWineCard = useCallback((wine: Wine) => {
    // Variables únicas de disponibilidad (fuente de verdad por card)
    const hasBottle = wine.available_by_bottle && isValidPrice(wine.price);
    const hasGlass = wine.available_by_glass && isValidPrice(wine.price_per_glass);

    return (
    <View key={wine.id} style={{ width: carouselDimensions.ITEM_WIDTH }}>
      <View style={[
        styles.wineCard,
        stableIsTablet && { minHeight: 540 } // Altura mínima mayor para tablet
      ]}>
        {/* Wrapper interno para recorte de esquinas redondeadas */}
        <View style={styles.wineCardInnerClip}>
          {/* Contenedor principal dividido */}
          <View style={styles.wineCardBody}>
        {/* Grid superior: Imagen izquierda + Sensorial derecha */}
        <View style={styles.topGridRow}>
          {/* Lado izquierdo - Imagen */}
          <WineImageBlock wine={wine} isTablet={stableIsTablet} />

          {/* Lado derecho - Características sensoriales (ficha) */}
          <WineSensoryBlock wine={wine} isTablet={stableIsTablet} />
        </View>

        {/* Información principal del vino - Se expande para ocupar espacio disponible */}
        {(() => {
          const backgroundImage = getWineCardBackground(wine.type || 'red');

          if (backgroundImage) {
            return (
              <ImageBackground 
                source={backgroundImage}
                resizeMode="cover"
                imageStyle={{ opacity: 1 }}
                style={styles.wineAdditionalInfo}
              >
                {/* Overlay con gradiente para mejorar legibilidad del texto */}
                <View style={StyleSheet.absoluteFillObject}>
                  <LinearGradient
                    colors={[
                      'rgba(255, 255, 255, 0.45)', // Blanco semitransparente arriba
                      'rgba(255, 255, 255, 0.65)', // Un poco más transparente en el centro
                      'rgba(255, 255, 255, 0.1)', // Blanco semitransparente abajo
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                </View>
                <View style={styles.wineAdditionalInfoContent}>
                  <WineInfoBlock wine={wine} t={t} onOpenPairings={openPairingsModal} isTablet={stableIsTablet} />
                </View>
            </ImageBackground>
          );
        } else {
          return (
            <View style={[
              styles.wineAdditionalInfo,
              stableIsTablet && { minHeight: 240 } // Altura mínima para tablet (reducida, sin maridaje embebido)
            ]}>
              <View style={styles.wineAdditionalInfoContent}>
                <WineInfoBlock wine={wine} t={t} onOpenPairings={openPairingsModal} isTablet={stableIsTablet} />
              </View>
            </View>
          );
        }
      })()}
          </View>

          <WinePricesBlock
            wine={wine}
            hasBottle={!!hasBottle}
            hasGlass={!!hasGlass}
            isGuest={isGuest}
            user={user}
            handleConfigGlassSaleMemo={handleConfigGlassSaleMemo}
            t={t}
            isTablet={stableIsTablet}
          />
        </View>
        {/* Fin del wrapper interno de recorte */}
      </View>
    </View>
    );
  }, [stableIsTablet, carouselDimensions.ITEM_WIDTH, navigation, t, isGuest, user, handleConfigGlassSaleMemo, getWineCardBackground, renderSensoryProfile, insets, openPairingsModal]);

  // Crear renderCatalogItem memoizado
  const renderCatalogItem = useCallback(({ item }: { item: Wine | CocktailDrink }) => {
    return showCocktails ? renderCocktailCard(item as CocktailDrink) : renderWineCard(item as Wine);
  }, [showCocktails, renderCocktailCard, renderWineCard]);

  const flatListContentContainerStyle = useMemo(() => ({
    paddingHorizontal: carouselDimensions.CONTENT_PAD,
    paddingBottom: effectiveBottomPadding,
  }), [carouselDimensions.CONTENT_PAD, effectiveBottomPadding]);

  // Memoizar ItemSeparatorComponent para evitar recreación en cada render
  const itemSeparatorComponent = useCallback(() => (
    <View style={{ width: carouselDimensions.ITEM_SPACING }} />
  ), [carouselDimensions.ITEM_SPACING]);

  const flatListExtraData = useMemo(() => ({
    showCocktails,
    selectedTypeFilter,
    availabilityFilter,
    sortOrder,
    language,
  }), [showCocktails, selectedTypeFilter, availabilityFilter, sortOrder, language]);

  // Bloquear catálogo/stock para usuarios pending (solo modo no-guest)
  if (user && user.status === 'pending' && !isGuest) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
        <PendingApprovalMessage />
      </View>
    );
  }

  // Guest: token faltante o código expirado/inválido
  if (isGuest && guestMenuError) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: '#f8f9fa' }]}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ fontSize: 16, color: '#333', textAlign: 'center', marginBottom: 24 }}>
            {guestMenuError}
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              style={{ paddingVertical: 12, paddingHorizontal: 20, backgroundColor: '#8B4513', borderRadius: 8 }}
              onPress={() => navigation.goBack()}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>{t('catalog.guest_back')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ paddingVertical: 12, paddingHorizontal: 20, backgroundColor: '#6B4423', borderRadius: 8 }}
              onPress={() => navigation.navigate('QrProcessor', {})}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>{t('catalog.guest_scan_again')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      {/* Header - Top Dock Premium */}
      <View style={[
        styles.headerWrapper,
        { paddingTop: Math.max(6, insets.top * 0.25) }
      ]}>
        <View style={styles.headerDock}>
          <View style={styles.headerRow}>
            {/* Columna izquierda: LanguageSelector */}
            <View style={styles.headerLeft}>
              <LanguageSelector />
            </View>

            {/* Columna centro: Nombre + Editar */}
            <View style={styles.headerCenter}>
              <Text
                numberOfLines={2}
                style={[
                  styles.branchName,
                  { fontSize: stableIsTablet ? 22 : 18 },
                  !isBranchNameConfigured && styles.branchNamePending,
                ]}
              >
                {isBranchNameConfigured ? branchDisplayName : t('catalog.define_restaurant')}
              </Text>
              {canEditBranchName && (
                isEditingBranchName ? (
                  <View style={styles.branchEditContainer}>
                    <TextInput
                      value={branchNameInput}
                      onChangeText={setBranchNameInput}
                      placeholder={t('catalog.restaurant_name_placeholder')}
                      style={[
                        styles.branchEditInput,
                        { maxWidth: stableIsTablet ? 400 : '100%' }
                      ]}
                      editable={!isSavingBranchName}
                      maxLength={80}
                    />
                    <View style={styles.branchEditActions}>
                      <TouchableOpacity
                        style={[styles.branchEditButton, styles.branchEditCancel]}
                        onPress={() => {
                          setIsEditingBranchName(false);
                          setBranchNameInput(branchDisplayName);
                        }}
                        disabled={isSavingBranchName}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text style={styles.branchEditButtonText}>{t('catalog.cancel')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.branchEditButton, styles.branchEditSave]}
                        onPress={async () => {
                          if (!activeBranch) {
                            Alert.alert(t('catalog.branch_required'), t('catalog.branch_required_message'));
                            return;
                          }

                          const trimmed = branchNameInput.trim();
                          if (!trimmed) {
                            Alert.alert(t('catalog.name_required'), t('catalog.name_required_message'));
                            return;
                          }

                          try {
                            setIsSavingBranchName(true);
                            const { data, error } = await supabase
                              .from('branches')
                              .update({
                                name: trimmed,
                                updated_at: new Date().toISOString(),
                              })
                              .eq('id', activeBranch.id)
                              .select()
                              .single();

                            if (error) throw error;

                            if (data) {
                              setCurrentBranch(data);
                              // Actualizar availableBranches con el branch actualizado
                              const updatedBranches = availableBranches.map((branch: Branch) => 
                                branch.id === data.id ? data : branch
                              );
                              setAvailableBranches(updatedBranches);
                              Alert.alert(t('catalog.branch_name_updated'), t('catalog.branch_name_updated_message'));
                            }

                            setIsEditingBranchName(false);
                          } catch (error: any) {
                            debugWarn('Error actualizando nombre de sucursal:', error);
                            Alert.alert(t('catalog.error'), error?.message || t('catalog.error_update_branch_name'));
                          } finally {
                            setIsSavingBranchName(false);
                          }
                        }}
                        disabled={isSavingBranchName}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text style={styles.branchEditButtonText}>
                          {isSavingBranchName ? t('catalog.saving') : t('catalog.save')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => {
                      if (!activeBranch) {
                        Alert.alert('Sin sucursal seleccionada', 'Selecciona una sucursal antes de editar el nombre.');
                        return;
                      }
                      setIsEditingBranchName(true);
                    }}
                    style={styles.editNameChip}
                  >
                    <Text style={styles.editNameChipText}>
                      {isBranchNameConfigured ? t('catalog.edit_name') : t('catalog.configure_name')}
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </View>

            {/* Columna derecha: Botones (búsqueda + admin) */}
            <View style={styles.headerRight}>
              <TouchableOpacity 
                style={[
                  styles.headerChipButton,
                  { 
                    width: stableIsTablet ? 40 : 36,
                    height: stableIsTablet ? 40 : 36,
                  }
                ]}
                onPress={() => {
                  setSearchVisible(prev => {
                    const newValue = !prev;
                    if (newValue && searchInputRef.current) {
                      // Enfocar input cuando se abre
                      setTimeout(() => searchInputRef.current?.focus(), 100);
                    }
                    return newValue;
                  });
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="search" size={22} color="#3A3534" />
              </TouchableOpacity>
              {/* Botón de admin solo visible si NO es invitado */}
              {!isGuest && (
                <TouchableOpacity 
                  style={[
                    styles.headerChipButton,
                    { 
                      width: stableIsTablet ? 40 : 36,
                      height: stableIsTablet ? 40 : 36,
                    }
                  ]}
                  onPress={() => {
                    // Si el usuario ya está autenticado, ir directo al panel
                    // Si no, pedir login
                    if (user && user.status === 'active') {
                      navigation.navigate('AdminDashboard');
                    } else {
                      navigation.navigate('AdminLogin');
                    }
                  }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="settings-outline" size={22} color="#3A3534" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>

      {searchVisible && (
        <View style={[
          styles.searchBarContainer,
          { paddingHorizontal: stableIsTablet ? 20 : 16 }
        ]}>
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder={t('catalog.search_placeholder')}
            placeholderTextColor="#999"
            value={searchText}
            onChangeText={setSearchText}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            onPress={() => {
              setSearchText('');
              setSearchVisible(false);
            }}
            style={styles.searchClearButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close-circle" size={24} color="#3A3534" />
          </TouchableOpacity>
        </View>
      )}

      {/* Barra horizontal de filtros (chips) - Dock premium */}
      <View style={styles.filterBarOuter}>
        <LinearGradient
          colors={[CELLARIUM.primaryDarker, CELLARIUM.primary, CELLARIUM.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.filterBarGradient}
        >
          <FlatList
            horizontal
            data={filterBarItems}
            keyExtractor={(item) => item.key}
            showsHorizontalScrollIndicator={false}
            onLayout={(event) => {
              const width = event.nativeEvent.layout.width;
              setFilterContainerWidth(width);
              const threshold = 12;
              const maxOffset = Math.max(0, filterContentWidth - width);
              const offsetX = filterScrollXRef.current;
              setFilterCanScrollLeft(offsetX > threshold);
              setFilterCanScrollRight(offsetX < maxOffset - threshold);
            }}
            onContentSizeChange={(contentWidth) => {
              setFilterContentWidth(contentWidth);
              const threshold = 12;
              const maxOffset = Math.max(0, contentWidth - filterContainerWidth);
              const offsetX = filterScrollXRef.current;
              setFilterCanScrollLeft(offsetX > threshold);
              setFilterCanScrollRight(offsetX < maxOffset - threshold);
            }}
            onScroll={({ nativeEvent }) => {
              const offsetX = nativeEvent.contentOffset.x;
              filterScrollXRef.current = offsetX;
              const threshold = 12;
              const containerW = filterContainerWidth || nativeEvent.layoutMeasurement.width;
              const contentW = filterContentWidth || nativeEvent.contentSize?.width || 0;
              const maxOffset = Math.max(0, contentW - containerW);
              setFilterCanScrollLeft(offsetX > threshold);
              setFilterCanScrollRight(offsetX < maxOffset - threshold);
            }}
            scrollEventThrottle={16}
            contentContainerStyle={[
              styles.filterBarContent,
              { paddingHorizontal: stableIsTablet ? 18 : 14 }
            ]}
            ItemSeparatorComponent={() => <View style={{ width: stableIsTablet ? 12 : 10 }} />}
            renderItem={({ item }) => (
              <FilterChip
                item={item}
                active={activeFilterKey === item.key}
                onPress={() => handleFilterSelect(item.key)}
                isTablet={stableIsTablet}
              />
            )}
          />
          {filterCanScrollLeft && (
            <View style={[styles.filterBarScrollHint, styles.filterBarScrollHintLeft]} pointerEvents="none">
              <Ionicons name="chevron-back" size={16} color="rgba(255,255,255,0.92)" />
            </View>
          )}
          {filterCanScrollRight && (
            <View style={[styles.filterBarScrollHint, styles.filterBarScrollHintRight]} pointerEvents="none">
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.92)" />
            </View>
          )}
        </LinearGradient>
      </View>


      {/* Lista de vinos o cocteles con FlatList para snap perfecto */}
      <FlatList
        ref={flatListRef}
        data={showCocktails ? filteredCocktails : filteredWines}
        keyExtractor={(item) => String(item.id)}
        key={stableIsTablet ? 'tablet' : 'phone'}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={carouselDimensions.ITEM_FULL}
        snapToAlignment="start"
        decelerationRate={Platform.OS === 'ios' ? 'fast' : 'normal'}
        disableIntervalMomentum={true}
        contentContainerStyle={flatListContentContainerStyle}
        ItemSeparatorComponent={itemSeparatorComponent}
        getItemLayout={(_, index) => ({
          length: carouselDimensions.ITEM_FULL,
          offset: carouselDimensions.ITEM_FULL * index,
          index,
        })}
        style={styles.winesContainer}
        renderItem={renderCatalogItem}
        extraData={flatListExtraData}
        initialNumToRender={3}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingContainer}>
              <CellariumLoader 
                size={120}
                label={t('catalog.loading')}
                loop={true}
                speed={1}
              />
            </View>
          ) : (
            <View style={styles.noResults}>
              <Text style={styles.noResultsText}>
                {showCocktails ? 'No se encontraron cocteles' : 'No se encontraron vinos'}
              </Text>
              <Text style={styles.noResultsSubtext}>
                {activeBranch ? 
                  (showCocktails
                    ? `No hay cocteles disponibles en ${branchDisplayName || 'esta sucursal'}`
                    : `No hay vinos disponibles en ${branchDisplayName || 'esta sucursal'}`) : 
                  'Selecciona una sucursal para ver el catálogo'
                }
              </Text>
            </View>
          )
        }
      />

      {/* Modal de maridajes */}
      <Modal
        visible={pairingsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closePairingsModal}
      >
        <Pressable 
          style={styles.pairingsModalBackdrop}
          onPress={closePairingsModal}
        >
          <Pressable 
            style={styles.pairingsModalCard}
            onPress={(e) => e.stopPropagation()}
          >
            {pairingsWine && (() => {
              const finalPairings = getFinalPairings(pairingsWine);
              
              return (
                <>
                  <Text style={styles.pairingsModalTitle}>{t('wine.recommended_pairings')}</Text>
                  
                  {finalPairings.length > 0 ? (
                    <ScrollView 
                      style={{ maxHeight: 180 }}
                      showsVerticalScrollIndicator={false}
                      nestedScrollEnabled={true}
                    >
                      <View style={styles.pairingsModalList}>
                        {finalPairings.map((pairing: string, idx: number) => (
                          <View key={idx} style={styles.pairingItem}>
                            <Text style={styles.pairingBullet}>•</Text>
                            <Text style={styles.pairingsTextCompact}>{pairing}</Text>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  ) : (
                    <Text style={styles.pairingsModalSubtitle}>
                      {t('catalog.pairings_no_suggested')}
                    </Text>
                  )}
                  
                  <TouchableOpacity
                    style={styles.pairingsModalCloseButton}
                    onPress={closePairingsModal}
                  >
                    <Text style={styles.pairingsModalCloseButtonText}>
                      {t('catalog.close')}
                    </Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal de configuración de venta por copa */}
      {selectedWineForConfig && (
        <WineGlassSaleConfig
          wine={selectedWineForConfig}
          visible={configModalVisible}
          onClose={() => {
            setConfigModalVisible(false);
            setSelectedWineForConfig(null);
          }}
          onSave={handleSaveGlassSaleConfig}
        />
      )}
    </SafeAreaView>
  );
};

// Paleta de colores Cellarium para la barra de filtros
const CELLARIUM = {
  primary: "#924048",
  primaryDark: "#6f2f37",
  primaryDarker: "#4e2228",
  textOnDark: "rgba(255,255,255,0.92)",
  textOnDarkMuted: "rgba(255,255,255,0.75)",
  chipActiveBg: "rgba(255,255,255,0.14)",
  chipBorder: "rgba(255,255,255,0.16)",
} as const;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  // Header - Top Dock Premium
  headerWrapper: {
    paddingBottom: 3,
    paddingHorizontal: 10,
  },
  headerDock: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    // iOS shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    // Android elevation
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.04)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLeft: {
    minWidth: 52,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  headerRight: {
    minWidth: 52,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
  },
  headerChipButton: {
    borderRadius: 12,
    backgroundColor: 'rgba(58, 53, 52, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(58, 53, 52, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    // iOS shadow leve
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    // Android elevation
    elevation: 2,
  },
  headerChipText: {
    fontSize: 18,
    color: CELLARIUM.primary,
  },
  editNameChip: {
    marginTop: 4,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(146, 64, 72, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(146, 64, 72, 0.16)',
  },
  editNameChipText: {
    fontSize: 11,
    color: CELLARIUM.primary,
    fontWeight: '600',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: CELLARIUM.primary,
    marginBottom: 0,
  },
  branchName: {
    marginTop: 2,
    fontWeight: '700',
    color: CELLARIUM.primary,
    textAlign: 'center',
  },
  branchNamePending: {
    color: '#B22222',
    fontStyle: 'italic',
  },
  branchEditContainer: {
    marginTop: 6,
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  branchEditInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    fontSize: 16,
    color: '#333',
  },
  branchEditActions: {
    flexDirection: 'row',
    gap: 12,
  },
  branchEditButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  branchEditCancel: {
    backgroundColor: '#bbb',
  },
  branchEditSave: {
    backgroundColor: CELLARIUM.primary,
  },
  branchEditButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  // Estilos de la barra horizontal de filtros (dock premium)
  filterBarOuter: {
    marginTop: 6,
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  filterBarGradient: {
    position: 'relative',
    borderRadius: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    // iOS shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    // Android elevation
    elevation: 6,
  },
  filterBarScrollHint: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBarScrollHintLeft: {
    left: 10,
  },
  filterBarScrollHintRight: {
    right: 10,
  },
  filterBarContent: {
    paddingVertical: 2,
    alignItems: 'center',
  },
  filterChip: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterChipTextOnly: {
    paddingHorizontal: 14,
  },
  filterChipLabelPremium: {
    fontFamily: 'Cormorant_600SemiBold_Italic',
    color: CELLARIUM.textOnDarkMuted,
    textAlign: 'center',
  },
  filterChipLabelPremiumActive: {
    color: CELLARIUM.textOnDark,
  },
  filterChipActive: {
    backgroundColor: CELLARIUM.chipActiveBg,
    borderColor: CELLARIUM.chipBorder,
    // iOS shadow leve
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    // Android elevation
    elevation: 4,
  },
  filterChipIconText: {
    marginBottom: 6,
  },
  filterChipLabel: {
    color: CELLARIUM.textOnDarkMuted,
    fontWeight: '600',
    textAlign: 'center',
  },
  filterChipLabelActive: {
    color: CELLARIUM.textOnDark,
    fontWeight: '700',
  },
  winesContainer: {
    flex: 1,
  },
  wineCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'visible', // Cambiado a 'visible' para evitar recorte del footer en Android
    position: 'relative',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: 520, // Altura mínima para evitar corte del footer (phone)
  },
  wineCardInnerClip: {
    overflow: 'hidden', // Recorte interno para mantener esquinas redondeadas
    borderRadius: 12, // Mismo radio que el card
    flex: 1,
    flexDirection: 'column',
  },
  wineCardBody: {
    flex: 1,
    minHeight: 0,
  },
  bookIconButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  // Grid superior: imagen izquierda + sensorial derecha
  topGridRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  wineCardContent: {
    flexDirection: 'row',
    height: 200,
  },
  wineImageSection: {
    flex: 1,
    paddingRight: 8, // Separación entre imagen y sensorial
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  wineInfoSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden', // Evitar overflow horizontal
    paddingLeft: 4, // Alineación con el borde superior de la imagen
  },
  sensorySectionCentered: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 16,
    width: '100%', // Asegura que use todo el ancho disponible
  },
  sensoryItemVertical: {
    alignItems: 'center',
    marginBottom: 8,
    paddingVertical: 2,
  },
  sensoryLabelVertical: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    marginBottom: 4,
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden', // Evitar que la imagen se desborde
  },
  wineImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent', // El fondo blanco está en el contenedor
  },
  wineInfo: {
    padding: 16,
  },
  wineNameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  wineName: {
    fontSize: 20, // Aumentado de 18 a 20 para mejor jerarquía
    fontWeight: 'bold',
    color: '#1a1a1a', // Más oscuro para mejor contraste
    flex: 1, // Permite que el texto ocupe el espacio disponible
    lineHeight: 26, // Mejor espaciado de línea
  },
  wineTypeOrigin: {
    fontSize: 14,
    color: '#8B0000',
    fontWeight: '600',
    marginBottom: 6,
  },
  wineGrapes: {
    fontSize: 15,
    color: '#666',
    fontWeight: '700',
    marginBottom: 8,
    lineHeight: 20,
  },
  wineGrapesInline: {
    fontSize: 14, // Ligeramente reducido
    color: 'rgba(102, 102, 102, 0.75)', // Opacidad reducida para texto secundario
    fontWeight: '500', // Menos bold para jerarquía
    flexShrink: 1, // Permite que el texto se encoja y haga wrap
    flexGrow: 0, // No crece más de lo necesario
    minWidth: 0, // CLAVE para que ellipsize y wrap funcionen correctamente
    flexBasis: 'auto', // Tamaño base automático
    // Sin marginBottom para uso inline en wineOriginGrapesRow
  },
  wineGrapesInlineLong: {
    fontSize: 12, // Reducido cuando es largo
    lineHeight: 16, // Line height ajustado
  },
  wineGrapesInlineMany: {
    // Estilo adicional para cuando hay 3+ uvas o texto muy largo
    // Permite que el texto se ajuste mejor en 2 líneas
    flexShrink: 1,
  },
  wineWinery: {
    fontSize: 15, // Aumentado ligeramente
    color: '#8B0000',
    fontWeight: '600', // Semibold
    marginBottom: 4,
    lineHeight: 20,
  },
  wineOriginGrapesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 4,
    justifyContent: 'space-between', // Para alinear ABV a la derecha (mantener por compatibilidad)
  },
  // Nueva estructura: separa uvas del ABV badge
  wineOriginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 10, // Espacio entre zona izquierda y badge
  },
  wineOriginLeft: {
    flex: 1,
    minWidth: 0, // CLAVE para ellipsize y wrap correcto
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  countryInlineWrap: {
    flexDirection: 'row',
    flexShrink: 0, // No se encoge, mantiene su tamaño
    alignItems: 'center',
  },
  wineVintage: {
    fontSize: 15, // Reducido para jerarquía secundaria
    fontWeight: '600', // Semibold en lugar de bold
    color: 'rgba(51, 51, 51, 0.8)', // Opacidad reducida
    marginTop: 4,
    marginBottom: 8,
  },
  wineCountry: {
    fontSize: 14, // Ligeramente reducido
    color: 'rgba(102, 102, 102, 0.75)', // Opacidad reducida para texto secundario
    fontWeight: '500', // Menos bold para jerarquía
  },
  wineOriginSeparator: {
    fontSize: 14,
    color: 'rgba(153, 153, 153, 0.6)', // Opacidad reducida
    fontWeight: '500',
  },
  wineDetails: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  // Características sensoriales compactas
  // Estilos para barras sensoriales con gradiente
  sensoryBarContainer: {
    alignItems: 'center',
    marginBottom: 10,
    alignSelf: 'stretch', // Permite que tenga referencia
    paddingHorizontal: 2, // Reducido al mínimo para barras más largas
    width: '100%',
  },
  sensoryBarLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
    marginBottom: 6,
    textAlign: 'center',
  },
  // Píldora que recorta el gradiente (bordes suaves sin línea)
  sensoryPill: {
    width: '98%', // Aumentado para usar casi todo el ancho disponible
    // height se define dinámicamente según isTablet (10.5 para phone, 14 para tablet)
    borderRadius: 999,
    overflow: 'hidden', // Clave para que no se vean bordes
    backgroundColor: '#E9E9EF', // Pista gris muy leve para que siempre se vea
    position: 'relative',
  },
  // El marcador
  sensoryMarker: {
    position: 'absolute',
    // top y height se calculan dinámicamente según altura de la barra
    width: 12,
    borderRadius: 6,
    backgroundColor: '#8B0000',
    borderWidth: 1.5,
    borderColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  // Footer compacto
  // Información principal
  wineAdditionalInfo: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 0,
    backgroundColor: 'transparent',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  wineAdditionalInfoContent: {
    flex: 1,
    padding: 16,
    paddingBottom: 4,
  },
  // Estilo legacy para cocteles (mantener ScrollView en cocteles)
  wineAdditionalInfoScroll: {
    flex: 1, // Ocupa todo el espacio disponible del contenedor padre
  },
  // Contenedor del bloque de información con glass card
  wineInfoBlockContainer: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 4,
  },
  // Overlay translúcido para legibilidad
  wineInfoBlockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.85)', // Glass card blanco translúcido
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  // Contenido del bloque sobre el overlay
  wineInfoBlockContent: {
    position: 'relative',
    zIndex: 1,
    padding: 8, // Reducido para ahorrar espacio
    paddingHorizontal: 12,
    paddingBottom: 44, // Padding inferior suficiente para que el chip absolute no tape el contenido
  },
  wineInfoBlockContentLong: {
    paddingVertical: 12, // Aumentado cuando las uvas son largas (de 10 a 12)
  },
  wineInfoBlockContentManyGrapes: {
    paddingBottom: 50, // Padding inferior suficiente para el chip absolute y 3 líneas de uvas
    paddingVertical: 14, // Más espacio vertical cuando hay 3+ uvas
    minHeight: 140, // Altura mínima para que quepan 3 líneas de uvas + chip + vintage (phone)
  },
  wineInfoBlockContentManyGrapesTablet: {
    minHeight: 150, // Altura mínima para tablet (más espacio)
  },
  pairingItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 1,
    lineHeight: 16,
  },
  pairingBullet: {
    fontSize: 10,
    color: '#8B0000',
    marginRight: 4,
    marginTop: 1,
  },
  pairingsTextCompact: {
    fontSize: 10,
    color: '#555',
    fontStyle: 'italic',
    fontWeight: '700',
    lineHeight: 14,
    flex: 1,
  },
  priceContainer: {
    paddingVertical: 0,
    width: '100%',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceContainerPhone: {
    // Sin estilos adicionales - usa el base compacto
  },
  // Layout responsive de precios
  pricesLayout: {
    width: '100%', // Ocupa todo el ancho disponible para centrado perfecto
    alignItems: 'center', // Centrado horizontal de los items dentro del layout
  },
  pricesLayoutRows: {
    flexDirection: 'column',
    rowGap: 2, // Espacio mínimo entre filas en phone
    justifyContent: 'center', // Centrado vertical para mejor distribución
    alignItems: 'center', // Centrado horizontal de los items
    width: '100%', // Asegura ancho completo para centrado
  },
  pricesLayoutColumns: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  pricesStack: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  // Item individual de precio
  priceItem: {
    flexGrow: 0,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  priceItemPhone: {
    paddingVertical: 2,
  },
  priceItemTablet: {
    paddingVertical: 4,
  },
  priceLabel: {
    fontSize: 10, // Compacto pero legible
    color: 'rgba(255, 255, 255, 0.75)', // Blanco semi-transparente para legibilidad sobre gradiente
    fontWeight: '500',
    marginLeft: 4, // Espacio mínimo entre precio y label
    textTransform: 'uppercase',
    letterSpacing: 0.3, // Letter spacing reducido
    includeFontPadding: false, // Android: reduce padding de fuente
    textAlignVertical: 'center', // Android: centrado vertical
  },
  priceValue: {
    fontWeight: 'bold',
    color: 'rgba(255, 255, 255, 0.95)', // Blanco sólido para máxima legibilidad sobre gradiente
    includeFontPadding: false, // Android: reduce padding de fuente
    textAlignVertical: 'center', // Android: centrado vertical
  },
  priceValuePhone: {
    fontSize: 17, // Compacto pero legible
    lineHeight: 20, // Line height ajustado
  },
  priceValueTablet: {
    fontSize: 22,
    lineHeight: 25, // Math.round(22 * 1.15) = 25
  },
  priceValueUnavailable: {
    color: 'rgba(255, 255, 255, 0.55)', // Blanco tenue para precios no disponibles sobre gradiente
    fontWeight: '400',
  },
  // Separador entre precios
  priceSeparator: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    marginHorizontal: 8,
  },
  configButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)', // Fondo sutil para contraste del icono sobre gradiente
    borderRadius: 13, // Completamente redondeado (chip circular)
    padding: 3, // Padding mínimo para botón pequeño
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)', // Borde sutil sobre gradiente
    minWidth: 26, // Botón ultra-compacto
    minHeight: 26, // Botón ultra-compacto
    justifyContent: 'center',
    alignItems: 'center',
  },
  configButtonAbsolute: {
    position: 'absolute',
    right: 8,
    top: '50%',
    transform: [{ translateY: -13 }],
  },
  configButtonPhone: {
    // Estilos específicos para phone si es necesario
    // alignSelf ya está en 'center' en el estilo base
  },
  configButtonText: {
    fontSize: 13, // Tamaño discreto para botón pequeño
    color: 'rgba(255, 255, 255, 0.95)', // Ícono blanco para legibilidad sobre gradiente
  },
  // Estilos legacy (mantener por compatibilidad)
  priceRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  priceBottle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'left',
    flex: 1,
  },
  pricesContainer: {
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    width: '100%',
    marginTop: 'auto',
    flexShrink: 0,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  searchInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#000',
  },
  searchClearButton: {
    marginLeft: 8,
    padding: 4,
  },
  searchClearButtonText: {
    fontSize: 16,
  },
  noResults: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    width: '100%',
  },
  noResultsText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 8,
  },
  noResultsSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    minWidth: 300,
  },
  loadingText: {
    fontSize: 18,
    color: '#8B0000',
    textAlign: 'center',
    fontWeight: '500',
  },
  // Botón de maridaje (chip)
  pairingsChipButton: {
    position: 'absolute',
    bottom: 8,
    right: 8, // Pegado abajo-derecha
    backgroundColor: 'rgba(139, 0, 0, 0.1)',
    borderRadius: 16,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(139, 0, 0, 0.2)',
    zIndex: 2, // Por encima del contenido pero debajo del overlay si es necesario
  },
  pairingsChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8B0000',
  },
  // Modal de maridajes
  pairingsModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pairingsModalCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    width: '100%',
    maxWidth: 340,
    maxHeight: 320,
  },
  pairingsModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'center',
  },
  pairingsModalSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
    textAlign: 'center',
  },
  pairingsModalList: {
    marginTop: 16,
    marginBottom: 20,
  },
  pairingsModalCloseButton: {
    backgroundColor: '#8B0000',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: 'center',
    marginTop: 8,
  },
  pairingsModalCloseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  // ABV Badge
  abvBadge: {
    backgroundColor: 'rgba(139, 0, 0, 0.1)',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginLeft: 0, // Ya no necesita auto porque está en zona derecha separada
    alignSelf: 'flex-start', // Para que no se "centre" raro cuando uvas ocupan 2 líneas
    flexShrink: 0, // No se encoge, mantiene su tamaño para no empujar el texto
  },
  abvBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8B0000',
  },
});

export default WineCatalogScreen;
