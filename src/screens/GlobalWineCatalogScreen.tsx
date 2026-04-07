import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
 View,
 Text,
 StyleSheet,
 FlatList,
 TouchableOpacity,
 Image,
 TextInput,
 Modal,
 ScrollView,
 ActivityIndicator,
 Alert,
 Dimensions,
 Animated,
 Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types';
import {
  listWinesKeyset,
  fetchWineDetail,
  GlobalWine,
  getBilingualValue,
  getBilingualArray,
  wineColorSearchHaystack,
  mapColorToType,
  getTasteProfileKeyOrderForWineType,
} from '../services/GlobalWineCatalogService';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useDebounce } from '../hooks/useDebounce';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { logger } from '../utils/logger';
import { CELLARIUM, CELLARIUM_GRADIENT } from '../theme/cellariumTheme';
import { CellariumHeader } from '../components/cellarium';

type GlobalWineCatalogScreenNavigationProp = StackNavigationProp<RootStackParamList, 'GlobalWineCatalog'>;
interface Props {
 navigation: GlobalWineCatalogScreenNavigationProp;
}

const GlobalWineCatalogScreen: React.FC<Props> = ({ navigation }) => {
 const { user, profileReady } = useAuth();
 const { currentBranch } = useBranch();
 const { t, language } = useLanguage();
 const insets = useSafeAreaInsets();
 const [wines, setWines] = useState<GlobalWine[]>([]);
 const [loadingInitial, setLoadingInitial] = useState(true);
 const [loadingMore, setLoadingMore] = useState(false);
 const [refreshing, setRefreshing] = useState(false);
 const [cursorId, setCursorId] = useState<string | null>(null);
 const [hasMore, setHasMore] = useState(true);
 const [selectedWine, setSelectedWine] = useState<GlobalWine | null>(null);
 const [showDetailModal, setShowDetailModal] = useState(false);
 const [detailLoading, setDetailLoading] = useState(false);
 const [detailContentHeight, setDetailContentHeight] = useState(0);
 const [detailViewportHeight, setDetailViewportHeight] = useState(0);
 // ✅ FASE 3: Estados de paginación eliminados (reemplazados por keyset)
 const [searchQuery, setSearchQuery] = useState('');
// OPTIMIZACION: Debounce del searchQuery para evitar consultas innecesarias
// El valor debounced se actualiza 400ms despues de que el usuario deje de escribir
 const debouncedSearchQuery = useDebounce(searchQuery, 400);
 const [filterColor, setFilterColor] = useState<string | undefined>(undefined);
 const [showSearchModal, setShowSearchModal] = useState(false);
 const [addedWineIds, setAddedWineIds] = useState<Set<string>>(new Set());
 // Ref para evitar múltiples llamadas a onEndReached
 const onEndReachedCalledDuringMomentum = useRef(false);
 const DEBUG_GLOBAL_CATALOG_WINE_ID = 'd0b9e697-1ae3-4311-8287-1d6efc715360';
 const fadeAnim = useRef(new Animated.Value(1)).current;
 // Request guards para evitar race conditions
 const firstPageReqIdRef = useRef(0);
 const loadMoreReqIdRef = useRef(0);
 const detailReqIdRef = useRef(0);
 // Ref para verificar si el componente esta montado
 const isMountedRef = useRef(true);
 // Manejar desmontaje del componente
 useEffect(() => {
 isMountedRef.current = true;
 return () => {
 isMountedRef.current = false;
 };
 }, []);
 const ensureBranchNameConfigured = useCallback((): boolean => {
 const branchName = currentBranch?.name?.trim() || '';
 if (branchName) {
 return true;
 }
 const isOwner = user?.role === 'owner';
 const title = t('global_catalog.restaurant_name_required');
 const message = isOwner
   ? t('global_catalog.restaurant_name_owner_msg')
   : t('global_catalog.restaurant_name_staff_msg');
 const buttons = isOwner
   ? [
       { text: t('global_catalog.later'), style: 'cancel' as const },
       { text: t('global_catalog.go_to_management'), onPress: () => navigation.navigate('BranchManagement') },
     ]
   : [
       { text: t('global_catalog.understood'), style: 'default' as const },
     ];
 Alert.alert(title, message, buttons);
 return false;
 }, [currentBranch, navigation, user?.role, t]);
// OPTIMIZACION: Usar debouncedSearchQuery en lugar de searchQuery
// Esto evita consultas a la BD mientras el usuario esta escribiendo
// La busqueda se ejecuta 400ms despues de que el usuario deje de escribir
 useEffect(() => {
 logger.log('[GlobalWineCatalogScreen] Iniciando carga', {
 filterColor,
 searchQuery: debouncedSearchQuery,
 originalSearchQuery: searchQuery,
 });
 loadFirstPage();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [filterColor, debouncedSearchQuery]); //  Usar debouncedSearchQuery
 // Cargar vinos agregados - Memoizado para evitar recreacin
 // Solo considerar vinos quée realmente tienen stock en la sucursal actual
 const loadAddedWines = useCallback(async () => {
 if (!user || !currentBranch) return;
 try {
 const tenantId = user.owner_id || user.id;
 // Consultar solo vinos quée tienen stock en la SUCURSAL ACTUAL
 // Esto evita mostrar como "agregados" vinos quée estaááán en otras sucursales
 // Filtrar por stock > 0 para evitar registros hurfanos o vinos eliminados
 const { data, error } = await supabase
 .from('wine_branch_stock')
 .select(`
 id,
 branch_id,
 stock_quantity,
 wines!inner (
 id,
 name,
 owner_id
 ),
 branches (
 id,
 name
 )

 `)
 .eq('wines.owner_id', tenantId)
 .eq('branch_id', currentBranch.id) // Filtrar por sucursal actual
 .gt('stock_quantity', 0); // Solo vinos con stock mayor a 0
 if (error) {
 logger.error('[loadAddedWines] Error:', error);
 return;
 }
            // Extraer nombres úúnicos de los vinos quée tienen stock
 const wineNames = new Set<string>();
 const wineDetails: Array<{
 id: string;
 name: string;
 normalized: string;
 branchId: string;
 branchName: string;
 stockQty: number;
 }> = [];
 data.forEach((stock: any) => {
 const wineName = stock.wines.name;
 const wineId = stock.wines.id;
 const branchId = stock.branch_id;
 const branchName = stock.branches.name || 'Sin nombre';
 const stockQty = stock.stock_quantity || 0;
 if (wineName) {
 const normalized = (wineName || '').trim().toLowerCase();
 wineNames.add(normalized);
 wineDetails.push({
 id: wineId,
 name: wineName,
 normalized,
 branchId,
 branchName,
 stockQty,
 });
 }
 });
 // Normalizar nombres: trim y convertir a minsculas para comparacin consistente
 const addedNames = new Set(Array.from(wineNames).filter(Boolean));
 setAddedWineIds(addedNames);
 logger.debug('[loadAddedWines] Vinos con stock:', addedNames.size);
 if (__DEV__ && addedNames.size > 0) {
 logger.debug('[loadAddedWines] Todos los nombres normalizados:', Array.from(addedNames).sort());
 logger.debug('[loadAddedWines] Total de registros de stock:', data.length || 0);
 logger.debug('[loadAddedWines] Detalles completos de vinos con sucursales:', wineDetails.map(w => ({
 wineId: w.id,
 wineName: w.name,
 normalized: w.normalized,
 branchId: w.branchId,
 branchName: w.branchName,
 stockQty: w.stockQty,
 })));
 // Agrupar por nombre para ver en cuntas sucursales estaááá cada vino
 const winesByNormalizedName = new Map<string, Array<{ branchName: string; stockQty: number }>>();
 wineDetails.forEach(w => {
 if (!winesByNormalizedName.has(w.normalized)) {
 winesByNormalizedName.set(w.normalized, []);
 }
 winesByNormalizedName.get(w.normalized)!.push({
 branchName: w.branchName,
 stockQty: w.stockQty,
 });
 });
 logger.debug('[loadAddedWines] Vinos agrupados por nombre:',
 Array.from(winesByNormalizedName.entries()).map(([name, branches]) => ({
 name,
 branches: branches.length,
 branchDetails: branches,
 }))
 );
 }
 } catch (error) {
 logger.error('[loadAddedWines] Excepcin:', error);
 }
 }, [user, currentBranch]);
 // Cargar vinos agregados al montar / cuando haya user+currentBranch
 useEffect(() => {
 if (user && currentBranch) loadAddedWines();
 }, [user, currentBranch, loadAddedWines]);
 // Recargar vinos agregados al volver a la pantalla y invalidar requéestaás al salir
 useEffect(() => {
 const unsubscribeFocus = navigation.addListener('focus', () => {
 if (user && currentBranch) loadAddedWines();
 });
 const unsubscribeBlur = navigation.addListener('blur', () => {
 // Invalidar requéestaás en curso al salir de la pantalla
 firstPageReqIdRef.current++;
 loadMoreReqIdRef.current++;
 detailReqIdRef.current++;
 });
 return () => {
 unsubscribeFocus();
 unsubscribeBlur();
 };
 }, [navigation, user, currentBranch, loadAddedWines]);

 useEffect(() => {
   if (!__DEV__ || !showSearchModal) return;
   console.log('[GlobalCatalogAudit] search_modal_open', {
     filterColor: filterColor ?? 'all',
     debouncedSearchQuery,
     searchQuery,
   });
 }, [showSearchModal, filterColor, debouncedSearchQuery, searchQuery]);

 useEffect(() => {
   if (!__DEV__) return;
   const hit = wines.find((w) => w.id === DEBUG_GLOBAL_CATALOG_WINE_ID);
   console.log('[GlobalCatalogAudit] flatlist_data_snapshot', {
     len: wines.length,
     filterColor: filterColor ?? 'all',
     hasTargetWine: !!hit,
   });
 }, [wines, filterColor]);

 const loadFirstPage = useCallback(async () => {
 logger.log('[loadFirstPage] Cargando primera página');
 // Requéestaááá guard: invalidar requéestaás anteriores y crear nuevo token
 const reqId = ++firstPageReqIdRef.current;
 loadMoreReqIdRef.current++; // Invalidar loadMore en curso para evitar mezclar resultados
 setLoadingInitial(true);
 setCursorId(null);
 setHasMore(true);
 try {
 const colors = filterColor ? [filterColor] : [];
 const result = await listWinesKeyset({
 q: debouncedSearchQuery || '',
 colors,
 cursorId: null,
 limit: 20,
 });
 // Validar que esta request sigue siendo el mas reciente y el componente esta montado
 if (reqId !== firstPageReqIdRef.current || !isMountedRef.current) {
 logger.debug('[loadFirstPage] Request obsoleto o componente desmontado, ignorando resultado');
 return;
 }
 if (result.error) {
 logger.error('[loadFirstPage] Error:', result.error.message);
 // Validar antes de mostrar alert
 if (reqId !== firstPageReqIdRef.current || !isMountedRef.current) return;
 Alert.alert(
 t('global_catalog.error_load'),
 result.error.message || t('global_catalog.error_unknown'),
 [{ text: 'OK' }]
 );
 return;
 }
 const wines = result.data || [];
 logger.success('[loadFirstPage] Vinos cargados:', wines.length);
 // Validar que esta request sigue siendo el mas reciente y el componente esta montado
 if (reqId !== firstPageReqIdRef.current || !isMountedRef.current) {
 logger.debug('[loadFirstPage] Request obsoleto o componente desmontado, ignorando resultado');
 return;
 }
 if (__DEV__) {
   const target = wines.find((w) => w.id === DEBUG_GLOBAL_CATALOG_WINE_ID);
   console.log('[GlobalCatalogAudit] loadFirstPage:response_applied', {
     count: wines.length,
     filterColor: filterColor ?? 'all',
     q: debouncedSearchQuery || '',
     hasTargetWine: !!target,
     targetColorRaw: target?.color ?? null,
     targetColorHaystack: target ? wineColorSearchHaystack(target.color) : null,
   });
 }
 setWines(wines);
 setCursorId(result.nextCursor ?? null);
 setHasMore(result.nextCursor !== null);
 } catch (error) {
 logger.error('[loadFirstPage] Excepcion:', error instanceof Error ? error.message : error);
 // Validar antes de mostrar alert
 if (reqId !== firstPageReqIdRef.current || !isMountedRef.current) return;
 Alert.alert(
 t('msg.error'),
 `${t('global_catalog.error_load')}.\n\n${error instanceof Error ? error.message : String(error)}`
 );
 } finally {
 // Validar antes de apagar loading (evitar quée requéestaááá viejo apague loading de requéestaááá nuevo)
 if (reqId === firstPageReqIdRef.current && isMountedRef.current) {
 setLoadingInitial(false);
 }
 }
 }, [debouncedSearchQuery, filterColor, t]);
 // ✅ FASE 3: Cargar más vinos (scroll infinito)
 const loadMore = useCallback(async () => {
 if (loadingMore || loadingInitial || refreshing) {
 logger.debug('[loadMore] Ya estaáááá cargando, ignorando');
 return;
 }
 if (!hasMore) {
 logger.debug('[loadMore] No hay más vinos');
 return;
 }
 if (!cursorId) {
 logger.debug('[loadMore] No hay cursorId');
 return;
 }
 logger.log('[loadMore] Cargando más vinos, cursorId:', cursorId);
 // Requéestaááá guard: crear nuevo token
 const reqId = ++loadMoreReqIdRef.current;
 setLoadingMore(true);
 try {
 const colors = filterColor ? [filterColor] : [];
 const result = await listWinesKeyset({
 q: debouncedSearchQuery || '',
 colors,
 cursorId,
 limit: 20,
 });
 // Validar que esta request sigue siendo el mas reciente y el componente esta montado
 if (reqId !== loadMoreReqIdRef.current || !isMountedRef.current) {
 logger.debug('[loadMore] Requéestaááá obsoleto o componente desmontado, ignorando resultado');
 return;
 }
 if (result.error) {
 logger.error('[loadMore] Error:', result.error.message);
 // No mostrar alert en loadMore, solo log
 return;
 }
 const newWines = result.data || [];
 logger.success('[loadMore] Vinos cargados:', newWines.length);
 // Validar que esta request sigue siendo el mas reciente y el componente esta montado
 if (reqId !== loadMoreReqIdRef.current || !isMountedRef.current) {
 logger.debug('[loadMore] Requéestaááá obsoleto o componente desmontado, ignorando resultado');
 return;
 }
 // Merge sin duplicados por id
 setWines(prev => {
 const map = new Map(prev.map(w => [w.id, w]));
 for (const w of newWines) {
 map.set(w.id, w);
 }
 return Array.from(map.values());
 });
 setCursorId(result.nextCursor ?? null);
 setHasMore(result.nextCursor !== null);
 } catch (error) {
 logger.error('[loadMore] Excepcion:', error instanceof Error ? error.message : error);
 // No mostrar alert en loadMore
 } finally {
 // Validar antes de apagar loading (evitar quée requéestaááá viejo apague loading de requéestaááá nuevo)
 if (reqId === loadMoreReqIdRef.current && isMountedRef.current) {
 setLoadingMore(false);
 }
 }
 }, [loadingMore, loadingInitial, refreshing, hasMore, cursorId, debouncedSearchQuery, filterColor]);
 // ✅ FASE 3: Refresh (pull-to-refresh)
 const refresh = useCallback(async () => {
 logger.log('[refresh] Refrescando lista');
 setRefreshing(true);
 try {
 await loadFirstPage();
 } finally {
 setRefreshing(false);
 }
 }, [loadFirstPage]);
 useEffect(() => {
 if (showDetailModal) {
 Animated.timing(fadeAnim, {
 toValue: 1,
 duration: 150,
 useNativeDriver: true,
 }).start();
 }
 }, [showDetailModal]);
 const handleViewDetail = useCallback(async (wine: GlobalWine) => {
 logger.log('[handleViewDetail] Abriendo:', wine.id);
 // Requéestaááá guard: crear nuevo token
 const reqId = ++detailReqIdRef.current;
 if (!isMountedRef.current) return;
 setSelectedWine(null);
 setDetailLoading(true);
 setShowDetailModal(true);
 try {
 const result = await fetchWineDetail(wine.id);
 // Validar que esta request sigue siendo el mas reciente y el componente esta montado
 if (reqId !== detailReqIdRef.current || !isMountedRef.current) {
 logger.debug('[handleViewDetail] Requéestaááá obsoleto o componente desmontado, ignorando resultado');
 return;
 }
 if (result.data) {
 setSelectedWine(result.data);
 } else {
 logger.error('[handleViewDetail] Sin datos:', result.error);
 Alert.alert(t('msg.error'), t('global_catalog.error_details'));
 setShowDetailModal(false);
 }
 } catch (error) {
 logger.error('[handleViewDetail] Excepcin:', error);
 // Validar antes de mostrar alert o actualizar estaáááado
 if (reqId !== detailReqIdRef.current || !isMountedRef.current) return;
 Alert.alert(t('msg.error'), t('global_catalog.error_load_details'));
 setShowDetailModal(false);
 } finally {
 // Validar antes de apagar loading
 if (reqId === detailReqIdRef.current && isMountedRef.current) {
 setDetailLoading(false);
 }
 }
 }, [t]);
 const handleAddWine = useCallback((wine: GlobalWine) => {
 // Usar la misma logica que al guardar: label || winery, SIEMPRE en espanol
 // porque asi se guarda en la base de datos
 const wineLabel = (getBilingualValue(wine.label, 'es') || '').trim();
 const wineWinery = (getBilingualValue(wine.winery, 'es') || '').trim();
 const wineNameToCheck = (wineLabel || wineWinery).toLowerCase();
 if (__DEV__) {
 logger.debug('[handleAddWine] Verificando:', {
 wineId: wine.id,
 label: wineLabel,
 winery: wineWinery,
 nameToCheck: wineNameToCheck,
 isInSet: wineNameToCheck ? addedWineIds.has(wineNameToCheck) : false,
 setSize: addedWineIds.size,
 });
 }
 if (wineNameToCheck && addedWineIds.has(wineNameToCheck)) {
 logger.debug('[handleAddWine] Vino ya agregado, bloquéeando');
 return;
 }
 if (!ensureBranchNameConfigured()) {
 return;
 }
 navigation.navigate('AddWineToCatalog', { wine });
 }, [addedWineIds, ensureBranchNameConfigured, navigation]);
 const isWineAdded = useCallback((wine: GlobalWine): boolean => {
 // Usar la misma lgica quée al guardar: label || winery, SIEMPRE en espaol
 // porque asi se guarda en la base de datos
 // Normalizar a minusculas para comparacion consistente
 const wineLabel = (getBilingualValue(wine.label, 'es') || '').trim();
 const wineWinery = (getBilingualValue(wine.winery, 'es') || '').trim();
 const wineNameToCheck = (wineLabel || wineWinery).toLowerCase();
 if (!wineNameToCheck) {
 if (__DEV__) {
 logger.debug('[isWineAdded] Sin nombre para verificar:', {
 wineId: wine.id,
 label: wineLabel,
 winery: wineWinery,
 rawLabel: wine.label,
 rawWinery: wine.winery,
 });
 }
 return false;
 }
 const isAdded = addedWineIds.has(wineNameToCheck);
 if (__DEV__) {
 if (isAdded) {
 // Verificar si hay coincidencias parciales o similares
 const similarNames = Array.from(addedWineIds).filter(name =>
 name.includes(wineNameToCheck) || wineNameToCheck.includes(name)
 );
 logger.debug('[isWineAdded]  Vino detectado como agregado:', {
 wineId: wine.id,
 label: wineLabel,
 winery: wineWinery,
 nameToCheck: wineNameToCheck,
 matchFound: true,
 similarNames: similarNames.length > 1 ? similarNames : undefined,
 });
 } else {
 // Verificar si hay nombres similares quée podran ser el mismo vino
 const similarNames = Array.from(addedWineIds).filter(name => {
 // Coincidencias parciales
 const nameWords = name.split(/\s+/);
 const checkWords = wineNameToCheck.split(/\s+/);
 const commonWords = nameWords.filter(w => checkWords.includes(w));
 return commonWords.length >= Math.min(2, Math.min(nameWords.length, checkWords.length));
 });
 logger.debug('[isWineAdded]  Vino NO agregado:', {
 wineId: wine.id,
 label: wineLabel,
 winery: wineWinery,
 nameToCheck: wineNameToCheck,
 setSize: addedWineIds.size,
 similarNames: similarNames.length > 0 ? similarNames : undefined,
 allNames: Array.from(addedWineIds).sort(),
 });
 }
 }
 return isAdded;
 }, [addedWineIds]);

 if (!profileReady) {
 return (
 <View style={styles.loadingContainer}>
 <ActivityIndicator size="large" color={CELLARIUM.primary} />
 </View>
 );
 }

 // Componente para manejar errores de imagen en tarjetas - Memoizado
 const WineCardImage = React.memo(({ imageUrl, wineId }: { imageUrl?: string; wineId: string }) => {
 const [imageError, setImageError] = useState(false);
 const [errorDetails, setErrorDetails] = useState<string | null>(null);
 const [fallbackUrl, setFallbackUrl] = useState<string | undefined>(undefined);
 const [isSearchingFallback, setIsSearchingFallback] = useState(false);
 // Buscar imagen por ID cuando falla la carga original
 const searchFallbackImage = async () => {
 if (isSearchingFallback || fallbackUrl) return;
 setIsSearchingFallback(true);
 logger.debug('[WineCardImage] Buscando fallback:', wineId);
 try {
 const { findImageByWineId } = await import('../services/GlobalWineCatalogService');
 const foundUrl = await findImageByWineId(wineId);
 if (foundUrl) {
 logger.success('[WineCardImage] Fallback encontrado');
 setFallbackUrl(foundUrl);
 setImageError(false);
 }
 } catch (error) {
 logger.error('[WineCardImage] Error en fallback:', error);
 } finally {
 setIsSearchingFallback(false);
 }
 };
 const handleImageError = (error: any) => {
 logger.warn('[WineCardImage] Error imagen:', wineId);
 setImageError(true);
 setErrorDetails(error.nativeEvent.error.message || 'Error desconocido');
 if (imageUrl && !fallbackUrl && !isSearchingFallback) {
 searchFallbackImage();
 }
 };
 // Determinar quééé URL usar (fallback tiene prioridad si existe)
 const currentImageUrl = fallbackUrl || imageUrl;
 // Mostrar placeholder si no hay URL o si hubo error y no hay fallback
 if (!currentImageUrl || (imageError && !fallbackUrl)) {
 return (
 <View style={styles.noImageContainer}>
 <Ionicons name="wine" size={50} color={CELLARIUM.primary} />
 <Text style={styles.noImageText}>{t('global_catalog.no_image')}</Text>
 {isSearchingFallback && (
 <ActivityIndicator size="small" color={CELLARIUM.primary} style={{ marginTop: 10 }} />
 )}
 {errorDetails && __DEV__ && (
 <Text style={{ fontSize: 8, color: '#999', marginTop: 4 }}>
 {errorDetails.substring(0, 30)}...
 </Text>
 )}
 {!currentImageUrl && __DEV__ && (
 <Text style={{ fontSize: 8, color: '#999', marginTop: 4 }}>
 No hay URL de imagen
 </Text>
 )}
 </View>
 );
 }
 // Intentar cargar la imagen (original o fallback)
 return (
 <Image
 source={{ uri: currentImageUrl }}
 style={styles.cardImage}
 resizeMode="contain"
 onError={handleImageError}
 />
 );
 });
 // Componente para manejar errores de imagen en modal - Memoizado
 const WineDetailImage = React.memo(({ imageUrl, wineId }: { imageUrl?: string; wineId: string }) => {
 const [imageError, setImageError] = useState(false);
 const [errorDetails, setErrorDetails] = useState<string | null>(null);
 const [fallbackUrl, setFallbackUrl] = useState<string | undefined>(undefined);
 const [isSearchingFallback, setIsSearchingFallback] = useState(false);
 const searchFallbackImage = async () => {
 if (isSearchingFallback || fallbackUrl) return;
 setIsSearchingFallback(true);
 logger.debug('[WineDetailImage] Buscando fallback:', wineId);
 try {
 const { findImageByWineId } = await import('../services/GlobalWineCatalogService');
 const foundUrl = await findImageByWineId(wineId);
 if (foundUrl) {
 logger.success('[WineDetailImage] Fallback encontrado');
 setFallbackUrl(foundUrl);
 setImageError(false);
 }
 } catch (error) {
 logger.error('[WineDetailImage] Error en fallback:', error);
 } finally {
 setIsSearchingFallback(false);
 }
 };
 const handleImageError = (error: any) => {
 logger.warn('[WineDetailImage] Error imagen:', wineId);
 setImageError(true);
 setErrorDetails(error.nativeEvent.error.message || 'Error desconocido');
 if (imageUrl && !fallbackUrl && !isSearchingFallback) {
 searchFallbackImage();
 }
 };
 const currentImageUrl = fallbackUrl || imageUrl;
 if (currentImageUrl && !imageError) {
 return (
 <Image
 source={{ uri: currentImageUrl }}
 style={styles.detailImage}
 resizeMode="contain"
 onError={handleImageError}
 />
 );
 }
 return (
 <View style={styles.noImageContainer}>
 <Ionicons name="wine" size={80} color={CELLARIUM.primary} />
 <Text style={styles.noImageText}>Sin imagen</Text>
 {isSearchingFallback && (
 <ActivityIndicator size="small" color={CELLARIUM.primary} style={{ marginTop: 10 }} />
 )}
 {errorDetails && __DEV__ && (
 <Text style={{ fontSize: 10, color: '#999', marginTop: 8, textAlign: 'center', paddingHorizontal: 10 }}>
 {errorDetails}
 </Text>
 )}
 {currentImageUrl && __DEV__ && (
 <Text style={{ fontSize: 8, color: '#999', marginTop: 4, textAlign: 'center', paddingHorizontal: 10 }}>
 URL: {currentImageUrl.substring(0, 60)}...
 </Text>
 )}
 </View>
 );
 });
 const renderWineCard = ({ item }: { item: GlobalWine }) => (
 <View style={styles.cardRow}>
 {/* Columna izquéerda: Thumbnail */}
 <View style={styles.cardThumb}>
 <WineCardImage imageUrl={item.image_canonical_url} wineId={item.id} />
 </View>
 {/* Columna central: Datos del vino */}
 <View style={styles.cardBody}>
 {getBilingualValue(item.winery, language) && (
 <Text style={styles.cardWinery} numberOfLines={1}>
 {getBilingualValue(item.winery, language)}
 </Text>
 )}
 {getBilingualValue(item.label, language) && (
 <Text style={styles.cardTitle} numberOfLines={2}>
 {getBilingualValue(item.label, language)}
 </Text>
 )}
 <View style={styles.cardInfoRow}>
 {(() => {
 const country = getBilingualValue(item.country, language);
 const region = getBilingualValue(item.region, language);
 if (country && region) {
 return (
 <Text style={styles.cardInfoText} numberOfLines={1}>
 {country} · {region}
 </Text>
 );
 } else if (country) {
 return (
 <Text style={styles.cardInfoText} numberOfLines={1}>
 {country}
 </Text>
 );
 } else if (region) {
 return (
 <Text style={styles.cardInfoText} numberOfLines={1}>
 {region}
 </Text>
 );
 }
 return null;
 })()}
 </View>
 {(() => {
 const colorValue = typeof item.color === 'string'
   ? item.color
   : Array.isArray(item.color)
   ? item.color[0]
   : getBilingualValue(item.color as any, language);
 if (!colorValue) return null;
 return (
 <View style={styles.cardColorTag}>
 <Text style={styles.cardColorText}>{colorValue}</Text>
 </View>
 );
 })()}
 </View>
 {/* Columna derecha: Acciones */}
 <View style={styles.cardRightActions}>
 <TouchableOpacity
 style={styles.iconBtn}
 onPress={() => handleViewDetail(item)}
 >
 <Ionicons name="eye" size={20} color="#fff" />
 </TouchableOpacity>
 {isWineAdded(item) ? (
 <TouchableOpacity
 style={[styles.iconBtn, styles.iconBtnDisabled]}
 disabled={true}
 >
 <Ionicons name="checkmark-circle" size={20} color="#fff" />
 </TouchableOpacity>
 ) : (
 <TouchableOpacity
 style={[styles.iconBtn, styles.iconBtnPrimary]}
 onPress={() => handleAddWine(item)}
 >
 <Ionicons name="add-circle" size={20} color="#fff" />
 </TouchableOpacity>
 )}
 </View>
 </View>
 );
 // Helper para sanitizar textos y eliminar caracteres corruptos
 const sanitizeText = (input?: unknown): string => {
 const s = typeof input === 'string' ? input : (input == null ? '' : String(input));
 return s
   .replace(/\uFFFD/g, '')
   .replace(/\uFFFD/g, '')
   .replace(/[\u0000-\u001F\u007F]/g, '')
   .trim();
 };

 const renderDetailModal = () => {
 if (!showDetailModal) return null;
 
 // Constantes para el footer fijo
 const FOOTER_HEIGHT = 48; // altura del botón
 const FOOTER_VERTICAL_PADDING = 14; // padding vertical del footer
 const footerSafeBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 10 : 0);
 const footerTotalHeight = FOOTER_HEIGHT + (FOOTER_VERTICAL_PADDING * 2) + footerSafeBottom;
 
 // Calcular padding dinámico basado en si el contenido necesita scroll
 const needsBottomPadding = detailContentHeight > (detailViewportHeight - footerTotalHeight - 8);
 const dynamicBottomPadding = needsBottomPadding ? (footerTotalHeight + 16) : 16;
 
 const wineryText = selectedWine ? sanitizeText(getBilingualValue(selectedWine.winery, language)) : null;
 const labelText = selectedWine ? sanitizeText(getBilingualValue(selectedWine.label, language)) : null;
 const countryPillText = selectedWine ? sanitizeText(getBilingualValue(selectedWine.country, language)) : '';
 const headerTitle = wineryText && labelText ? `${wineryText} ${labelText}` : (labelText || wineryText || '');
 
 return (
 <Modal
 visible={showDetailModal}
 animationType="slide"
 transparent={false}
 onRequestClose={() => setShowDetailModal(false)}
 >
 <Animated.View style={[styles.modalContainer, { opacity: fadeAnim }]}>
 {detailLoading || !selectedWine ? (
 <View style={styles.loadingModalContainer}>
 <ActivityIndicator size="large" color={CELLARIUM.primary} />
 <Text style={styles.loadingModalText}>{t('global_catalog.loading_details')}</Text>
 </View>
 ) : (
 <>
 {/* HEADER FIJO */}
 <LinearGradient
 colors={[CELLARIUM.primaryDarker, CELLARIUM.primary, CELLARIUM.primaryDark]}
 start={{ x: 0, y: 0 }}
 end={{ x: 1, y: 0 }}
 style={styles.modalHeaderGradient}
 >
 <View style={styles.modalHeaderRow}>
 <View style={{ width: 40 }} />
 <View style={{ flex: 1, alignItems: 'center' }}>
 <Text style={styles.modalHeaderTitle} numberOfLines={1}>
 {headerTitle}
 </Text>
 </View>
 <TouchableOpacity
 style={styles.modalCloseBtn}
 onPress={() => setShowDetailModal(false)}
 hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
 >
 <Ionicons name="close" size={24} color={CELLARIUM.textOnDark} />
 </TouchableOpacity>
 </View>
 </LinearGradient>
 
 {/* BODY SCROLLEABLE */}
 <ScrollView 
 style={styles.modalScroll}
 contentContainerStyle={[
   styles.modalScrollContent,
   { paddingBottom: detailViewportHeight === 0 ? (footerTotalHeight + 16) : dynamicBottomPadding }
 ]}
 onContentSizeChange={(w, h) => setDetailContentHeight(h)}
 onLayout={(e) => setDetailViewportHeight(e.nativeEvent.layout.height)}
 >
 {/* Imagen compacta */}
 <View style={styles.detailImageWrap}>
 <WineDetailImage imageUrl={selectedWine.image_canonical_url} wineId={selectedWine.id} />
 </View>
 
 {/* Card principal con info */}
 <View style={styles.detailMainCard}>
 {wineryText && (
 <Text style={styles.detailWinerySmall}>{wineryText}</Text>
 )}
 {labelText && (
 <Text style={styles.detailLabelTitle} numberOfLines={2}>{labelText}</Text>
 )}
 
 {/* Pills row: País, Región, Color, ABV */}
 <View style={styles.pillsRow}>
 {countryPillText ? (
 <View style={styles.pill}>
 <Text style={styles.pillText}>{countryPillText}</Text>
 </View>
 ) : null}
 {getBilingualValue(selectedWine.region, language) && (
 <View style={styles.pill}>
 <Text style={styles.pillText}>{sanitizeText(getBilingualValue(selectedWine.region, language))}</Text>
 </View>
 )}
 {(() => {
 const colorValue = typeof selectedWine.color === 'string'
   ? selectedWine.color
   : Array.isArray(selectedWine.color)
   ? selectedWine.color[0]
   : getBilingualValue(selectedWine.color as any, language);
 if (!colorValue) return null;
 return (
 <View style={styles.pill}>
 <Text style={styles.pillText}>{sanitizeText(colorValue)}</Text>
 </View>
 );
 })()}
 {selectedWine.abv && (
 <View style={styles.pill}>
 <Text style={styles.pillText}>{sanitizeText(selectedWine.abv)}% ABV</Text>
 </View>
 )}
 </View>
 </View>
 
 {/* Sección: Varietales */}
 {selectedWine.grapes && (
 <View style={styles.sectionCardPro}>
 <Text style={styles.sectionTitlePro}>{t('global_catalog.varietals')}</Text>
 <View style={styles.chipsContainer}>
 {(Array.isArray(selectedWine.grapes) ? selectedWine.grapes : [selectedWine.grapes]).map((grape, idx) => (
 <View key={idx} style={styles.chipPro}>
 <Text style={styles.chipTextPro}>{sanitizeText(grape)}</Text>
 </View>
 ))}
 </View>
 </View>
 )}
 
 {/* Sección: Sabores */}
 {(() => {
 const flavorsArray = getBilingualArray(selectedWine.flavors);
 if (flavorsArray.length === 0) return null;
 return (
 <View style={styles.sectionCardPro}>
 <Text style={styles.sectionTitlePro}>{t('global_catalog.flavors')}</Text>
 <View style={styles.chipsContainer}>
 {flavorsArray.map((flavor, idx) => (
 <View key={idx} style={styles.chipPro}>
 <Text style={styles.chipTextPro}>{sanitizeText(flavor)}</Text>
 </View>
 ))}
 </View>
 </View>
 );
 })()}
 {/* Perfil de cata (solo dimensiones aptas al tipo de vino, como en el catálogo del usuario) */}
 {selectedWine.taste_profile && (() => {
 const tasteProfile = typeof selectedWine.taste_profile === 'string'
   ? JSON.parse(selectedWine.taste_profile)
   : selectedWine.taste_profile;
 const wineType = mapColorToType(selectedWine.color);
 const keyOrder = getTasteProfileKeyOrderForWineType(wineType);
 const labelByKey: Record<string, string> = {
   body: t('global_catalog.body'),
   acidity: t('global_catalog.acidity'),
   fizziness: t('global_catalog.fizziness'),
   tannin: t('global_catalog.tannin'),
   sweetness: t('global_catalog.sweetness'),
 };
 const bars = keyOrder
   .filter((key) => tasteProfile[key] != null)
   .map((key) => ({ key, label: labelByKey[key] }));
 return bars.length > 0 ? (
 <View style={styles.sectionCardPro}>
 <Text style={styles.sectionTitlePro}>{t('global_catalog.tasting_profile')}</Text>
 {bars.map(bar => {
 const value = tasteProfile[bar.key];
 const percentage = typeof value === 'number' && value <= 5
   ? value * 20
   : (typeof value === 'number' ? value : parseFloat(String(value)) || 0);
 return (
 <View key={bar.key} style={styles.profileBarContainerCompact}>
 <Text style={styles.profileLabelCompact}>{bar.label}</Text>
 <View style={styles.profileBarBackgroundCompact}>
 <View style={[styles.profileBarFillPro, { width: `${Math.min(100, Math.max(0, percentage))}%` }]} />
 </View>
 <Text style={styles.profileValueCompact}>{Math.round(percentage)}%</Text>
 </View>
 );
 })}
 </View>
 ) : null;
 })()}
 {/* Sección: Maridajes */}
 {(() => {
 const pairingArray = selectedWine.serving?.pairing
   ? getBilingualArray(selectedWine.serving.pairing)
   : [];
 if (pairingArray.length === 0) return null;
 return (
 <View style={styles.sectionCardPro}>
 <Text style={styles.sectionTitlePro}>{t('global_catalog.pairings')}</Text>
 {pairingArray.map((pairing, idx) => (
 <Text key={idx} style={styles.bulletRowText}>
 {'\u2022 '}{sanitizeText(pairing)}
 </Text>
 ))}
 </View>
 );
 })()}
 </ScrollView>
 
 {/* FOOTER FIJO */}
 {/* Botones de accion */}
 <View style={[styles.modalFooter, { paddingBottom: footerSafeBottom + FOOTER_VERTICAL_PADDING }]}>
 <TouchableOpacity
 style={styles.footerBtnSecondary}
 onPress={() => setShowDetailModal(false)}
 >
 <Text style={styles.footerBtnSecondaryText}>{t('global_catalog.close')}</Text>
 </TouchableOpacity>
 {selectedWine && isWineAdded(selectedWine) ? (
 <TouchableOpacity
 style={styles.footerBtnDisabled}
 disabled={true}
 >
 <Ionicons name="checkmark-circle" size={20} color="#fff" />
 <Text style={styles.footerBtnPrimaryText}>Vino ya agregado</Text>
 </TouchableOpacity>
 ) : (
 <TouchableOpacity
 style={styles.footerBtnPrimary}
 onPress={() => {
 if (selectedWine && !isWineAdded(selectedWine)) {
 if (!ensureBranchNameConfigured()) {
 return;
 }
 setShowDetailModal(false);
 setTimeout(() => {
 navigation.navigate('AddWineToCatalog', { wine: selectedWine });
 }, 200);
 }
 }}
 >
 <Ionicons name="add-circle" size={20} color="#fff" />
 <Text style={styles.footerBtnPrimaryText}>{t('global_catalog.add_to_catalog')}</Text>
 </TouchableOpacity>
 )}
 </View>
 </>
 )}
 </Animated.View>
 </Modal>
 );
 };
 const filterOptions = [
 { key: undefined, label: t('global_catalog.all_wines'), icon: '🍇' },
 { key: 'red', label: t('global_catalog.red'), icon: '🍷' },
 { key: 'white', label: t('global_catalog.white'), icon: '🥂' },
 { key: 'rose', label: t('global_catalog.rose'), icon: '🌸' },
 { key: 'sparkling', label: t('global_catalog.sparkling'), icon: '🍾' },
 { key: 'dessert', label: t('global_catalog.dessert'), icon: '🍨' },
 { key: 'fortified', label: t('global_catalog.fortified'), icon: '🛡️' },
 ];
 return (
 <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
 <CellariumHeader
 title={t('global_catalog.title')}
 rightSlot={
 <TouchableOpacity
 style={styles.searchButtonHeader}
 onPress={() => setShowSearchModal(true)}
 hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
 >
 <Ionicons name="search" size={20} color={CELLARIUM.textOnDark} />
 </TouchableOpacity>
 }
 />
 {/* Barra horizontal de filtros */}
 <View style={styles.filterBarOuter}>
 <LinearGradient
 colors={[...CELLARIUM_GRADIENT]}
 start={{ x: 0, y: 0 }}
 end={{ x: 1, y: 0 }}
 style={styles.filterBarGradient}
 >
 <ScrollView
 horizontal
 showsHorizontalScrollIndicator={false}
 contentContainerStyle={styles.filterBarContent}
 >
 {filterOptions.map((option) => (
 <TouchableOpacity
 key={option.key || 'all'}
 style={[
 styles.filterChip,
 filterColor === option.key && styles.filterChipActive,
 ]}
 onPress={() => setFilterColor(option.key)}
 >
 <Text
 style={[
 styles.filterChipLabel,
 filterColor === option.key && styles.filterChipLabelActive,
 ]}
 >
 {option.label}
 </Text>
 </TouchableOpacity>
 ))}
 </ScrollView>
 </LinearGradient>
 </View>
 {/* Modal de búsquéeda */}
 <Modal
 visible={showSearchModal}
transparent
animationType="fade"
onRequestClose={() => setShowSearchModal(false)}
 >
 <View style={styles.searchModalBackdrop}>
 <View style={styles.searchModalContent}>
 <View style={styles.searchModalHeader}>
 <Text style={styles.searchModalTitle}>{t('global_catalog.search')}</Text>
 <TouchableOpacity
 onPress={() => setShowSearchModal(false)}
 style={styles.searchModalClose}
 >
 <Ionicons name="close" size={24} color="#333" />
 </TouchableOpacity>
 </View>
 <View style={styles.searchModalInputContainer}>
 <TextInput
 style={styles.searchModalInput}
 placeholder={t('global_catalog.search_placeholder')}
 value={searchQuery}
 onChangeText={setSearchQuery}
 autoFocus
 placeholderTextColor="#999"
 />
 {searchQuery.length > 0 && (
 <TouchableOpacity
 onPress={() => {
 setSearchQuery('');
 setShowSearchModal(false);
 }}
 style={styles.searchModalClear}
 >
 <Ionicons name="close-circle" size={20} color="#999" />
 </TouchableOpacity>
 )}
 </View>
 <TouchableOpacity
 style={styles.searchModalSearchBtn}
 onPress={() => {
 if (__DEV__) {
 console.log('[GlobalCatalogAudit] search_submit', {
 searchQueryTrimmed: searchQuery.trim(),
 filterColor: filterColor ?? 'all',
 });
 }
 loadFirstPage();
 setShowSearchModal(false);
 }}
 >
 <Text style={styles.searchModalSearchBtnText}>
 {t('global_catalog.search')}
 </Text>
 </TouchableOpacity>
 </View>
 </View>
 </Modal>
 {/* Lista de vinos */}
 {loadingInitial && wines.length === 0 ? (
 <View style={styles.loadingContainer}>
 <ActivityIndicator size="large" color={CELLARIUM.primary} />
 <Text style={styles.loadingText}>{t('global_catalog.loading')}</Text>
 </View>
 ) : wines.length === 0 ? (
 <View style={styles.emptyContainer}>
 <Ionicons name="wine-outline" size={80} color="#ccc" />
 <Text style={styles.emptyText}>{t('global_catalog.no_wines')}</Text>
 </View>
 ) : (
 <FlatList
 data={wines}
 renderItem={renderWineCard}
 keyExtractor={(item) => item.id}
 contentContainerStyle={styles.list}
 ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
 scrollEnabled={!loadingInitial}
 refreshing={refreshing}
 onRefresh={refresh}
 onEndReached={() => {
 if (!onEndReachedCalledDuringMomentum.current) {
 loadMore();
 onEndReachedCalledDuringMomentum.current = true;
 }
 }}
 onEndReachedThreshold={0.4}
 onMomentumScrollBegin={() => {
 onEndReachedCalledDuringMomentum.current = false;
 }}
 ListFooterComponent={() => {
 if (loadingMore) {
 return (
 <View style={styles.footerLoading}>
 <ActivityIndicator size="small" color={CELLARIUM.primary} />
 <Text style={styles.footerLoadingText}>{t('global_catalog.loading')}</Text>
 </View>
 );
 }
 if (!hasMore && wines.length > 0) {
 return (
 <View style={styles.footerEnd}>
 <Text style={styles.footerEndText}>No hay más resultados</Text>
 </View>
 );
 }
 return null;
 }}
 />
 )}
 {renderDetailModal()}
 </SafeAreaView>
 );
};
const styles = StyleSheet.create({
 container: {
 flex: 1,
 backgroundColor: CELLARIUM.bg,
 },
 searchButtonHeader: {
 width: 40,
 height: 40,
 borderRadius: 20,
 backgroundColor: 'rgba(255,255,255,0.15)',
 justifyContent: 'center',
 alignItems: 'center',
 borderWidth: 1,
 borderColor: 'rgba(255,255,255,0.2)',
 },
 // Barra de filtros horizontal
 filterBarOuter: {
 marginTop: 6,
 marginBottom: 12,
 paddingHorizontal: 12,
 },
 filterBarGradient: {
 borderRadius: 18,
 paddingVertical: 6,
 borderWidth: 1,
 borderColor: 'rgba(0,0,0,0.04)',
 shadowColor: '#000',
 shadowOffset: { width: 0, height: 4 },
 shadowOpacity: 0.18,
 shadowRadius: 10,
 elevation: 6,
 },
 filterBarContent: {
 paddingVertical: 2,
 paddingHorizontal: 14,
 alignItems: 'center',
 },
 filterChip: {
 alignItems: 'center',
 justifyContent: 'center',
 backgroundColor: 'transparent',
 borderWidth: 1,
 borderColor: 'transparent',
 paddingVertical: 4,
 paddingHorizontal: 12,
 borderRadius: 16,
 minHeight: 28,
 },
 filterChipActive: {
 backgroundColor: 'rgba(255,255,255,0.14)',
 borderColor: 'rgba(255,255,255,0.16)',
 shadowColor: '#000',
 shadowOffset: { width: 0, height: 2 },
 shadowOpacity: 0.15,
 shadowRadius: 6,
 elevation: 4,
 },
 filterChipLabel: {
 color: 'rgba(255,255,255,0.75)',
 fontWeight: '600',
 fontSize: 10,
 textAlign: 'center',
 },
 filterChipLabelActive: {
 color: 'rgba(255,255,255,0.95)',
 fontWeight: '700',
 },
 // Modal de búsquéeda
 searchModalBackdrop: {
 flex: 1,
 backgroundColor: 'rgba(0,0,0,0.5)',
 justifyContent: 'center',
 alignItems: 'center',
 padding: 20,
 },
 searchModalContent: {
 backgroundColor: '#fff',
 borderRadius: 18,
 padding: 20,
 width: '100%',
 maxWidth: 400,
 },
 searchModalHeader: {
 flexDirection: 'row',
 justifyContent: 'space-between',
 alignItems: 'center',
 marginBottom: 16,
 },
 searchModalTitle: {
 fontSize: 20,
 fontWeight: 'bold',
 color: '#333',
 },
 searchModalClose: {
 padding: 4,
 },
 searchModalInputContainer: {
 flexDirection: 'row',
 alignItems: 'center',
 marginBottom: 16,
 },
 searchModalInput: {
 flex: 1,
 height: 48,
 borderWidth: 1,
 borderColor: '#ddd',
 borderRadius: 12,
 paddingHorizontal: 16,
 fontSize: 16,
 backgroundColor: '#f9f9f9',
 },
 searchModalClear: {
 marginLeft: 8,
 padding: 4,
 },
 searchModalSearchBtn: {
 backgroundColor: '#924048',
 paddingVertical: 12,
 paddingHorizontal: 24,
 borderRadius: 12,
 alignItems: 'center',
 },
 searchModalSearchBtnText: {
 color: '#fff',
 fontSize: 16,
 fontWeight: '600',
 },
 list: {
 padding: 8,
 },
 // Layout horizontal compacto
 cardRow: {
 backgroundColor: '#fff',
 borderRadius: 12,
 padding: 12,
 marginBottom: 8,
 flexDirection: 'row',
 alignItems: 'center',
 elevation: 2,
 shadowColor: '#000',
 shadowOffset: { width: 0, height: 1 },
 shadowOpacity: 0.08,
 shadowRadius: 3,
 },
 cardThumb: {
 width: 86,
 height: 110,
 borderRadius: 10,
 backgroundColor: '#f7f7f7',
 overflow: 'hidden',
 marginRight: 12,
 },
 cardImage: {
 width: '100%',
 height: '100%',
 },
 noImageContainer: {
 width: '100%',
 height: '100%',
 justifyContent: 'center',
 alignItems: 'center',
 backgroundColor: '#f0f0f0',
 },
 noImageText: {
 marginTop: 10,
 fontSize: 14,
 color: '#999',
 },
 cardBody: {
 flex: 1,
 paddingRight: 10,
 },
 cardWinery: {
 fontSize: 14,
 fontWeight: '600',
 color: '#924048',
 marginBottom: 3,
 },
 cardTitle: {
 fontSize: 16,
 fontWeight: 'bold',
 color: '#333',
 marginBottom: 6,
 lineHeight: 20,
 },
 cardInfoRow: {
 flexDirection: 'row',
 alignItems: 'center',
 marginBottom: 6,
 },
 cardInfoText: {
 fontSize: 12,
 color: '#666',
 },
 cardColorTag: {
 alignSelf: 'flex-start',
 backgroundColor: '#f0f0f0',
 paddingVertical: 3,
 paddingHorizontal: 8,
 borderRadius: 8,
 marginTop: 2,
 },
 cardColorText: {
 fontSize: 11,
 color: '#666',
 fontWeight: '500',
 },
 cardRightActions: {
 width: 44,
 alignItems: 'flex-end',
 justifyContent: 'space-between',
 gap: 10,
 },
 iconBtn: {
 width: 38,
 height: 38,
 borderRadius: 12,
 backgroundColor: '#666',
 alignItems: 'center',
 justifyContent: 'center',
 },
 iconBtnPrimary: {
 backgroundColor: '#924048',
 },
 iconBtnDisabled: {
 backgroundColor: '#999',
 opacity: 0.75,
 },
 modalContainer: {
 flex: 1,
 backgroundColor: '#fff',
 justifyContent: 'flex-start',
 },
 modalContent: {
 flex: 1,
 backgroundColor: '#fff',
 borderTopLeftRadius: 20,
 borderTopRightRadius: 20,
 maxHeight: '90%',
 },
 modalScroll: {
 flex: 1,
 },
 detailImage: {
 width: '100%',
 height: '100%',
 },
 detailHeader: {
 padding: 20,
 paddingBottom: 10,
 alignItems: 'center',
 },
 chipsContainer: {
 flexDirection: 'row',
 flexWrap: 'wrap',
 gap: 8,
 },
 loadingContainer: {
 flex: 1,
 justifyContent: 'center',
 alignItems: 'center',
 },
 loadingModalContainer: {
 flex: 1,
 justifyContent: 'center',
 alignItems: 'center',
 padding: 30,
 },
 loadingModalText: {
 marginTop: 10,
 color: '#666',
 },
 loadingText: {
 marginTop: 15,
 fontSize: 16,
 color: '#666',
 },
 emptyContainer: {
 flex: 1,
 justifyContent: 'center',
 alignItems: 'center',
 },
 emptyText: {
 marginTop: 15,
 fontSize: 18,
 color: '#999',
 },
 // ✅ FASE 3: Estilos de paginación eliminados (paginationContainer, paginationNumbers, pageButton, etc.)
 // ✅ FASE 3: Estilos para scroll infinito
 footerLoading: {
 paddingVertical: 20,
 alignItems: 'center',
 justifyContent: 'center',
 },
 footerLoadingText: {
 marginTop: 8,
 fontSize: 14,
 color: '#666',
 },
 footerEnd: {
 paddingVertical: 20,
 alignItems: 'center',
 justifyContent: 'center',
 },
 sectionCard: {
 backgroundColor: '#f9f9f9',
 borderRadius: 12,
 padding: 12,
 marginVertical: 8,
 },
 profileBarContainerCompact: {
 flexDirection: 'row',
 alignItems: 'center',
 marginBottom: 6,
 gap: 8,
 },
 profileLabelCompact: {
 width: 80,
 fontSize: 12,
 color: '#666',
 fontWeight: '500',
 },
 profileBarBackgroundCompact: {
 flex: 1,
 height: 6,
 backgroundColor: '#e0e0e0',
 borderRadius: 3,
 overflow: 'hidden',
 },
 profileValueCompact: {
 width: 45,
 textAlign: 'right',
 fontSize: 12,
 fontWeight: '600',
 color: '#333',
 },
 footerEndText: {
 fontSize: 14,
 color: '#999',
 fontStyle: 'italic',
 },
 // Nuevos estailos para modal mejorado
 modalHeaderGradient: {
 height: 60,
 justifyContent: 'center',
 paddingTop: Platform.OS === 'ios' ? 8 : 0,
 },
 modalHeaderRow: {
 flexDirection: 'row',
 alignItems: 'center',
 paddingHorizontal: 16,
 height: '100%',
 },
 modalHeaderTitle: {
 fontSize: 18,
 fontWeight: 'bold',
 color: 'rgba(255,255,255,0.92)',
 },
 modalCloseBtn: {
 width: 40,
 height: 40,
 borderRadius: 20,
 alignItems: 'center',
 justifyContent: 'center',
 },
 modalScrollContent: {
 paddingBottom: 16,
 },
 detailImageWrap: {
 height: 220,
 maxHeight: 220,
 backgroundColor: '#F6F6F7',
 borderRadius: 16,
 marginHorizontal: 14,
 marginTop: 12,
 overflow: 'hidden',
 },
 detailMainCard: {
 backgroundColor: '#fff',
 borderRadius: 16,
 padding: 16,
 marginHorizontal: 14,
 marginTop: 12,
 marginBottom: 12,
 shadowColor: '#000',
 shadowOffset: { width: 0, height: 2 },
 shadowOpacity: 0.1,
 shadowRadius: 8,
 elevation: 3,
 },
 detailWinerySmall: {
 fontSize: 14,
 fontWeight: '600',
 color: '#924048',
 marginBottom: 4,
 },
 detailLabelTitle: {
 fontSize: 22,
 fontWeight: 'bold',
 color: '#333',
 marginBottom: 12,
 lineHeight: 28,
 },
 pillsRow: {
 flexDirection: 'row',
 flexWrap: 'wrap',
 gap: 8,
 marginTop: 4,
 },
 pill: {
 backgroundColor: '#F2F2F3',
 paddingVertical: 6,
 paddingHorizontal: 10,
 borderRadius: 999,
 },
 pillText: {
 fontSize: 12,
 color: '#333',
 fontWeight: '500',
 },
 sectionCardPro: {
 backgroundColor: '#fff',
 borderRadius: 16,
 padding: 14,
 marginHorizontal: 14,
 marginBottom: 12,
 shadowColor: '#000',
 shadowOffset: { width: 0, height: 1 },
 shadowOpacity: 0.08,
 shadowRadius: 4,
 elevation: 2,
 },
 sectionTitlePro: {
 fontSize: 16,
 fontWeight: 'bold',
 color: '#924048',
 marginBottom: 12,
 },
 chipPro: {
 backgroundColor: '#924048',
 paddingVertical: 6,
 paddingHorizontal: 10,
 borderRadius: 999,
 },
 chipTextPro: {
 color: '#fff',
 fontSize: 12,
 fontWeight: '600',
 },
 bulletRowText: {
 fontSize: 14,
 color: '#333',
 lineHeight: 20,
 marginBottom: 6,
 },
 profileBarFillPro: {
 height: '100%',
 backgroundColor: '#924048',
 },
 modalFooter: {
 backgroundColor: '#fff',
 borderTopWidth: 1,
 borderTopColor: 'rgba(0,0,0,0.08)',
 paddingVertical: 14,
 paddingHorizontal: 14,
 flexDirection: 'row',
 gap: 10,
 },
 footerBtnSecondary: {
 flex: 1,
 height: 48,
 borderRadius: 14,
 backgroundColor: '#E7E7EA',
 alignItems: 'center',
 justifyContent: 'center',
 },
 footerBtnSecondaryText: {
 fontSize: 16,
 fontWeight: '600',
 color: '#333',
 },
 footerBtnPrimary: {
 flex: 2,
 height: 48,
 borderRadius: 14,
 backgroundColor: '#924048',
 flexDirection: 'row',
 alignItems: 'center',
 justifyContent: 'center',
 gap: 8,
 },
 footerBtnPrimaryText: {
 fontSize: 16,
 fontWeight: '600',
 color: '#fff',
 },
 footerBtnDisabled: {
 flex: 2,
 height: 48,
 borderRadius: 14,
 backgroundColor: '#C8C8CC',
 flexDirection: 'row',
 alignItems: 'center',
 justifyContent: 'center',
 gap: 8,
 },
});
export default GlobalWineCatalogScreen;