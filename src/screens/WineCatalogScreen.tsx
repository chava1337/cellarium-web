import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Dimensions,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { Wine } from '../types';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useDeviceInfo, getRecommendedLayout } from '../hooks/useDeviceInfo';
import { useAuth } from '../contexts/AuthContext';

const { width } = Dimensions.get('window');

// Datos de prueba de vinos con características sensoriales completas
const mockWines: Wine[] = [
  {
    id: '1',
    name: 'Château Margaux 2018',
    grape_variety: 'Cabernet Sauvignon',
    region: 'Bordeaux',
    country: 'Francia',
    vintage: 2018,
    alcohol_content: 13.5,
    description: 'Un vino elegante y complejo con aromas de frutas negras, especias y notas de cedro. En boca es potente pero equilibrado, con taninos suaves y un final largo.',
    price: 450.00,
    price_per_glass: 45.00,
    image_url: 'https://via.placeholder.com/300x400/8B0000/FFFFFF?text=Château+Margaux',
    // Características sensoriales
    body_level: 5, // Robusto
    sweetness_level: 1, // Seco
    acidity_level: 3, // Media
    intensity_level: 5, // Intenso
    // Información adicional
    winery: 'Château Margaux',
    food_pairings: ['Carnes rojas', 'Quesos curados', 'Cordero'],
    tasting_notes: 'Frutas negras, especias, cedro, taninos suaves',
    serving_temperature: '16-18°C',
    // Disponibilidad
    available_by_glass: true,
    available_by_bottle: true,
    stock_quantity: 12,
    // Promociones
    is_featured: true,
    is_promotion: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '2',
    name: 'Dom Pérignon 2015',
    grape_variety: 'Chardonnay',
    region: 'Champagne',
    country: 'Francia',
    vintage: 2015,
    alcohol_content: 12.5,
    description: 'Champagne premium con burbujas finas y persistentes. Aromas de manzana verde, cítricos y pan tostado.',
    price: 280.00,
    price_per_glass: 28.00,
    image_url: 'https://via.placeholder.com/300x400/FFD700/000000?text=Dom+Pérignon',
    // Características sensoriales
    body_level: 3, // Medio
    sweetness_level: 1, // Seco
    acidity_level: 4, // Alta
    intensity_level: 4, // Intenso
    // Información adicional
    winery: 'Moët & Chandon',
    food_pairings: ['Ostras', 'Caviar', 'Sushi', 'Aperitivos'],
    tasting_notes: 'Manzana verde, cítricos, pan tostado, burbujas finas',
    serving_temperature: '6-8°C',
    // Disponibilidad
    available_by_glass: true,
    available_by_bottle: true,
    stock_quantity: 8,
    // Promociones
    is_featured: false,
    is_promotion: true,
    promotion_text: 'Copa del mes',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '3',
    name: 'Opus One 2019',
    grape_variety: 'Cabernet Sauvignon',
    region: 'Napa Valley',
    country: 'Estados Unidos',
    vintage: 2019,
    alcohol_content: 14.2,
    description: 'Vino tinto robusto con taninos suaves y final largo. Aromas de frutas negras, vainilla y especias.',
    price: 320.00,
    price_per_glass: 32.00,
    image_url: 'https://via.placeholder.com/300x400/8B0000/FFFFFF?text=Opus+One',
    // Características sensoriales
    body_level: 5, // Robusto
    sweetness_level: 1, // Seco
    acidity_level: 3, // Media
    intensity_level: 4, // Intenso
    // Información adicional
    winery: 'Opus One Winery',
    food_pairings: ['Carnes rojas', 'Cordero', 'Quesos fuertes'],
    tasting_notes: 'Frutas negras, vainilla, especias, taninos suaves',
    serving_temperature: '16-18°C',
    // Disponibilidad
    available_by_glass: true,
    available_by_bottle: true,
    stock_quantity: 15,
    // Promociones
    is_featured: false,
    is_promotion: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '4',
    name: 'Barolo Brunate 2017',
    grape_variety: 'Nebbiolo',
    region: 'Piemonte',
    country: 'Italia',
    vintage: 2017,
    alcohol_content: 14.0,
    description: 'Vino italiano clásico con aromas de rosas, trufas y frutas rojas. En boca es elegante y complejo.',
    price: 180.00,
    price_per_glass: 18.00,
    image_url: 'https://via.placeholder.com/300x400/8B0000/FFFFFF?text=Barolo',
    // Características sensoriales
    body_level: 4, // Medio-alto
    sweetness_level: 1, // Seco
    acidity_level: 4, // Alta
    intensity_level: 4, // Intenso
    // Información adicional
    winery: 'Vietti',
    food_pairings: ['Pasta con trufas', 'Carnes blancas', 'Quesos italianos'],
    tasting_notes: 'Rosas, trufas, frutas rojas, elegancia',
    serving_temperature: '16-18°C',
    // Disponibilidad
    available_by_glass: true,
    available_by_bottle: true,
    stock_quantity: 20,
    // Promociones
    is_featured: true,
    is_promotion: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '5',
    name: 'Riesling Spätlese 2020',
    grape_variety: 'Riesling',
    region: 'Mosel',
    country: 'Alemania',
    vintage: 2020,
    alcohol_content: 8.5,
    description: 'Vino blanco dulce con notas de frutas tropicales, miel y flores blancas. Perfecto para postres.',
    price: 65.00,
    price_per_glass: 6.50,
    image_url: 'https://via.placeholder.com/300x400/FFD700/000000?text=Riesling',
    // Características sensoriales
    body_level: 2, // Ligero
    sweetness_level: 4, // Dulce
    acidity_level: 4, // Alta
    intensity_level: 3, // Medio
    // Información adicional
    winery: 'Dr. Loosen',
    food_pairings: ['Postres', 'Foie gras', 'Quesos azules'],
    tasting_notes: 'Frutas tropicales, miel, flores blancas, dulce equilibrado',
    serving_temperature: '8-10°C',
    // Disponibilidad
    available_by_glass: true,
    available_by_bottle: true,
    stock_quantity: 25,
    // Promociones
    is_featured: false,
    is_promotion: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

type WineCatalogScreenNavigationProp = StackNavigationProp<RootStackParamList, 'WineCatalog'>;
type WineCatalogScreenRouteProp = RouteProp<RootStackParamList, 'WineCatalog'>;

interface Props {
  navigation: WineCatalogScreenNavigationProp;
  route: WineCatalogScreenRouteProp;
}

const WineCatalogScreen: React.FC<Props> = ({ navigation, route }) => {
  // Verificar si es un invitado (acceso por QR de comensal)
  const isGuest = route.params?.isGuest || false;
  const { user } = useAuth(); // Obtener usuario autenticado
  const deviceInfo = useDeviceInfo();
  const layout = getRecommendedLayout(deviceInfo);
  
  const [wines, setWines] = useState<Wine[]>(mockWines);
  const [filteredWines, setFilteredWines] = useState<Wine[]>(mockWines);
  const [searchText, setSearchText] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const dropdownButtonRef = useRef<any>(null);

  const handleFilterSelect = (filterKey: string) => {
    setSelectedFilter(filterKey === 'all' ? null : filterKey);
    setIsDropdownVisible(false);
  };

  const getSelectedFilterLabel = () => {
    if (!selectedFilter) return 'Todos';
    const filter = filters.find(f => f.key === selectedFilter);
    return filter ? filter.label : 'Todos';
  };

  const handleDropdownPress = () => {
    if (dropdownButtonRef.current) {
      dropdownButtonRef.current.measure((x: number, y: number, width: number, height: number, pageX: number, pageY: number) => {
        setDropdownPosition({
          top: pageY + height, // Sin separación - completamente pegado
          left: pageX,
          width: width,
        });
        setIsDropdownVisible(true);
      });
    }
  };

  const filters = [
    { key: 'all', label: 'Todos' },
    { key: 'Cabernet Sauvignon', label: 'Cabernet' },
    { key: 'Chardonnay', label: 'Chardonnay' },
    { key: 'Nebbiolo', label: 'Nebbiolo' },
    { key: 'Riesling', label: 'Riesling' },
    { key: 'featured', label: 'Destacados' },
    { key: 'promotion', label: 'Promociones' },
    { key: 'by_glass', label: 'Por Copa' },
    { key: 'by_bottle', label: 'Por Botella' },
  ];

  useEffect(() => {
    let filtered = wines;

    // Aplicar filtros
    if (selectedFilter && selectedFilter !== 'all') {
      switch (selectedFilter) {
        case 'featured':
          filtered = filtered.filter(wine => wine.is_featured);
          break;
        case 'promotion':
          filtered = filtered.filter(wine => wine.is_promotion);
          break;
        case 'by_glass':
          filtered = filtered.filter(wine => wine.available_by_glass);
          break;
        case 'by_bottle':
          filtered = filtered.filter(wine => wine.available_by_bottle);
          break;
        default:
          // Filtro por variedad de uva
          filtered = filtered.filter(wine => wine.grape_variety === selectedFilter);
      }
    }

    // Aplicar búsqueda por texto
    if (searchText) {
      filtered = filtered.filter(wine =>
        wine.name.toLowerCase().includes(searchText.toLowerCase()) ||
        wine.region.toLowerCase().includes(searchText.toLowerCase()) ||
        wine.country.toLowerCase().includes(searchText.toLowerCase()) ||
        wine.grape_variety.toLowerCase().includes(searchText.toLowerCase()) ||
        (wine.winery && wine.winery.toLowerCase().includes(searchText.toLowerCase()))
      );
    }

    setFilteredWines(filtered);
  }, [wines, selectedFilter, searchText]);

  const renderSensoryIndicator = (level: number, maxLevel: number = 5) => {
    return (
      <View style={styles.sensoryContainer}>
        {Array.from({ length: maxLevel }, (_, i) => (
          <View
            key={i}
            style={[
              styles.sensoryDot,
              i < level ? styles.sensoryDotActive : styles.sensoryDotInactive
            ]}
          />
        ))}
      </View>
    );
  };

  const renderWineCard = (wine: Wine) => (
    <View key={wine.id} style={styles.wineCard}>
      {/* Contenedor principal dividido */}
      <View style={styles.wineCardContent}>
        {/* Lado izquierdo - Imagen */}
        <View style={styles.wineImageSection}>
          <View style={styles.imageContainer}>
            <Image source={{ uri: wine.image_url }} style={styles.wineImage} />
            {wine.is_featured && (
              <View style={styles.featuredBadge}>
                <Text style={styles.featuredText}>⭐</Text>
              </View>
            )}
            {wine.is_promotion && (
              <View style={styles.promotionBadge}>
                <Text style={styles.promotionText}>{wine.promotion_text}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Lado derecho - Solo características sensoriales */}
        <View style={styles.wineInfoSection}>
          {/* Características sensoriales centradas */}
          <View style={styles.sensorySectionCentered}>
            <View style={styles.sensoryItemVertical}>
              <Text style={styles.sensoryLabelVertical}>Cuerpo</Text>
              {renderSensoryIndicator(wine.body_level || 0, 5)}
            </View>
            <View style={styles.sensoryItemVertical}>
              <Text style={styles.sensoryLabelVertical}>Dulzura</Text>
              {renderSensoryIndicator(wine.sweetness_level || 0, 5)}
            </View>
            <View style={styles.sensoryItemVertical}>
              <Text style={styles.sensoryLabelVertical}>Acidez</Text>
              {renderSensoryIndicator(wine.acidity_level || 0, 5)}
            </View>
            <View style={styles.sensoryItemVertical}>
              <Text style={styles.sensoryLabelVertical}>Intensidad</Text>
              {renderSensoryIndicator(wine.intensity_level || 0, 5)}
            </View>
          </View>
        </View>
      </View>

      {/* Información principal del vino */}
      <View style={styles.wineAdditionalInfo}>
        <Text style={styles.wineName}>{wine.name}</Text>
        <Text style={styles.wineWinery}>{wine.winery}</Text>
        <Text style={styles.wineDetails}>
          {wine.grape_variety} • {wine.region}, {wine.country}
        </Text>
        
        <Text style={styles.wineDescription} numberOfLines={2}>
          {wine.description}
        </Text>
        
        {wine.food_pairings && wine.food_pairings.length > 0 && (
          <Text style={styles.pairingsTextCompact}>
            🍽️ {wine.food_pairings.slice(0, 2).join(' • ')}
          </Text>
        )}

        {/* Precios y stock */}
        <View style={styles.wineFooterMain}>
          <View style={styles.priceContainer}>
            {wine.available_by_glass && wine.price_per_glass && (
              <Text style={styles.priceGlass}>
                Copa: ${wine.price_per_glass.toFixed(2)}
              </Text>
            )}
            {wine.available_by_bottle && (
              <Text style={styles.priceBottle}>
                Botella: ${wine.price.toFixed(2)}
              </Text>
            )}
          </View>
          <View style={styles.stockContainer}>
            <Text style={styles.stockText}>
              Stock: {wine.stock_quantity || 0}
            </Text>
            <Text style={styles.wineAlcohol}>{wine.alcohol_content}% vol.</Text>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { padding: layout.padding }]}>
        <View style={styles.headerContent}>
          <View style={styles.headerText}>
            <Text style={[
              styles.title,
              { fontSize: deviceInfo.deviceType === 'tablet' ? 28 : 24 }
            ]}>
              🍷 Catálogo de Vinos
            </Text>
            <Text style={[
              styles.subtitle,
              { fontSize: deviceInfo.deviceType === 'tablet' ? 16 : 14 }
            ]}>
              Explora nuestra selección premium
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={[
                styles.searchButton,
                { 
                  width: deviceInfo.deviceType === 'tablet' ? 40 : 36,
                  height: deviceInfo.deviceType === 'tablet' ? 40 : 36,
                }
              ]}
              onPress={() => {
                // Mostrar modal de búsqueda o navegar a pantalla de búsqueda
                Alert.alert('Búsqueda', 'Función de búsqueda próximamente');
              }}
            >
              <Text style={styles.searchButtonText}>🔍</Text>
            </TouchableOpacity>
            {/* Botón de admin solo visible si NO es invitado */}
            {!isGuest && (
              <TouchableOpacity 
                style={[
                  styles.adminButton,
                  { 
                    width: deviceInfo.deviceType === 'tablet' ? 40 : 36,
                    height: deviceInfo.deviceType === 'tablet' ? 40 : 36,
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
              >
                <Text style={styles.adminButtonText}>⚙️</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>


      {/* Selector desplegable de filtros */}
      <View style={styles.filtersContainer}>
        <TouchableOpacity
          ref={dropdownButtonRef}
          style={[
            styles.dropdownButton,
            {
              paddingHorizontal: deviceInfo.deviceType === 'tablet' ? 20 : 16,
              paddingVertical: deviceInfo.deviceType === 'tablet' ? 12 : 10,
            }
          ]}
          onPress={handleDropdownPress}
        >
          <Text style={[
            styles.dropdownButtonText,
            {
              fontSize: deviceInfo.deviceType === 'tablet' ? 16 : 14,
            }
          ]}>
            🍇 {getSelectedFilterLabel()}
          </Text>
          <Text style={styles.dropdownArrow}>▼</Text>
        </TouchableOpacity>
      </View>

      {/* Modal desplegable */}
      <Modal
        visible={isDropdownVisible}
        transparent={true}
        animationType="none"
        onRequestClose={() => setIsDropdownVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsDropdownVisible(false)}
        >
          <View style={[
            styles.dropdownContainer,
            {
              position: 'absolute',
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
            }
          ]}>
            <FlatList
              data={filters}
              keyExtractor={(item) => item.key}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.dropdownItem,
                    selectedFilter === item.key && styles.dropdownItemActive
                  ]}
                  onPress={() => handleFilterSelect(item.key)}
                >
                  <Text style={[
                    styles.dropdownItemText,
                    selectedFilter === item.key && styles.dropdownItemTextActive
                  ]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </TouchableOpacity>
      </Modal>


      {/* Lista de vinos */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.winesContainer}
        contentContainerStyle={styles.winesScrollContent}
      >
        {filteredWines.length > 0 ? (
          filteredWines.map((wine) => (
            <View key={wine.id} style={[
              styles.wineCardContainer,
              { 
                width: deviceInfo.deviceType === 'tablet' ? 350 : 300,
              }
            ]}>
              {renderWineCard(wine)}
            </View>
          ))
        ) : (
          <View style={styles.noResults}>
            <Text style={styles.noResultsText}>No se encontraron vinos</Text>
            <Text style={styles.noResultsSubtext}>Intenta con otros filtros o términos de búsqueda</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#8B0000',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchButton: {
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButtonText: {
    fontSize: 16,
  },
  adminButton: {
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminButtonText: {
    fontSize: 18,
  },
  filtersContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  // Estilos del selector desplegable
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  dropdownButtonText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  dropdownArrow: {
    fontSize: 12,
    color: '#666',
    marginLeft: 8,
  },
  // Estilos del modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  dropdownContainer: {
    backgroundColor: 'white',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    maxHeight: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
  },
  dropdownItem: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  dropdownItemActive: {
    backgroundColor: '#8B0000',
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  dropdownItemTextActive: {
    color: 'white',
  },
  winesContainer: {
    flex: 1,
  },
  winesScrollContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  wineCardContainer: {
    marginRight: 16,
  },
  wineCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
    height: '100%',
  },
  wineCardContent: {
    flexDirection: 'row',
    height: 200,
  },
  wineImageSection: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  wineInfoSection: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sensorySectionCentered: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 16,
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
    flex: 1,
  },
  wineImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
  },
  featuredBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#FFD700',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  featuredText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#8B0000',
  },
  promotionBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#28a745',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  promotionText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: 'white',
  },
  wineInfo: {
    padding: 16,
  },
  wineName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  wineWinery: {
    fontSize: 14,
    color: '#8B0000',
    fontWeight: '600',
    marginBottom: 4,
  },
  wineDetails: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  // Características sensoriales compactas
  sensorySectionCompact: {
    marginBottom: 8,
  },
  sensoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sensoryItemCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sensoryLabelCompact: {
    fontSize: 9,
    color: '#666',
    width: 50,
    fontWeight: '500',
  },
  sensoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  sensoryLabel: {
    fontSize: 12,
    color: '#666',
    width: 80,
    fontWeight: '500',
  },
  sensoryContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sensoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 3,
  },
  sensoryDotActive: {
    backgroundColor: '#8B0000',
  },
  sensoryDotInactive: {
    backgroundColor: '#ddd',
  },
  // Maridajes
  pairingsSection: {
    marginBottom: 8,
  },
  pairingsLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    marginBottom: 4,
  },
  pairingsText: {
    fontSize: 12,
    color: '#555',
    fontStyle: 'italic',
  },
  // Temperatura de servicio
  servingTemp: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  wineDescription: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
    marginBottom: 8,
  },
  // Footer compacto
  wineFooterCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  // Información principal
  wineAdditionalInfo: {
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  wineFooterMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 12,
  },
  pairingsTextCompact: {
    fontSize: 10,
    color: '#555',
    fontStyle: 'italic',
    marginTop: 4,
  },
  priceContainer: {
    flex: 1,
  },
  priceGlass: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#28a745',
    marginBottom: 2,
  },
  priceBottle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#8B0000',
  },
  stockContainer: {
    alignItems: 'flex-end',
  },
  stockText: {
    fontSize: 11,
    color: '#666',
    marginBottom: 2,
  },
  wineAlcohol: {
    fontSize: 11,
    color: '#999',
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
});

export default WineCatalogScreen;

