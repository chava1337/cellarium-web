import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useAdminGuard } from '../hooks/useAdminGuard';
import { PendingApprovalMessage } from '../components/PendingApprovalMessage';
import { useBranch } from '../contexts/BranchContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  getCocktailMenu,
  createCocktailDrink,
  updateCocktailDrink,
  deleteCocktailDrink,
  uploadCocktailImage,
  CocktailDrink,
  CreateCocktailDrinkData,
} from '../services/CocktailService';
import { getBilingualValue } from '../services/GlobalWineCatalogService';
import { logger } from '../utils/logger';
import { useDeviceInfo } from '../hooks/useDeviceInfo';
import { compressCocktailImage } from '../utils/imageCompression';

type CocktailManagementScreenNavigationProp = StackNavigationProp<RootStackParamList, 'CocktailManagement'>;
type CocktailManagementScreenRouteProp = RouteProp<RootStackParamList, 'CocktailManagement'>;

interface Props {
  navigation: CocktailManagementScreenNavigationProp;
  route: CocktailManagementScreenRouteProp;
}

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 40;
const CARD_HEIGHT = 200;

const CocktailManagementScreen: React.FC<Props> = ({ navigation, route }) => {
  const { status: guardStatus } = useAdminGuard({ navigation, route });
  const { user } = useAuth();
  const { currentBranch } = useBranch();
  const { t, language } = useLanguage();
  const deviceInfo = useDeviceInfo();

  const [drinks, setDrinks] = useState<CocktailDrink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingDrink, setEditingDrink] = useState<CocktailDrink | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [compressingImage, setCompressingImage] = useState(false);

  // Form data
  const [formData, setFormData] = useState({
    name_es: '',
    name_en: '',
    description_es: '',
    description_en: '',
    ingredients_es: '',
    ingredients_en: '',
    price: '',
    imageUri: null as string | null,
    imageUrl: null as string | undefined,
  });

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    if (currentBranch) {
      loadDrinks();
    }
  }, [currentBranch]);

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

  const loadDrinks = async () => {
    if (!currentBranch) {
      Alert.alert(t('msg.error'), t('admin.error_no_branch'));
      return;
    }

    try {
      setLoading(true);
      const data = await getCocktailMenu(currentBranch.id);
      setDrinks(data);
    } catch (error) {
      logger.error('[CocktailManagement] Error cargando:', error);
      Alert.alert(t('msg.error'), t('cocktail.loading'));
    } finally {
      setLoading(false);
    }
  };

  const handleAddDrink = () => {
    setEditingDrink(null);
    setFormData({
      name_es: '',
      name_en: '',
      description_es: '',
      description_en: '',
      ingredients_es: '',
      ingredients_en: '',
      price: '',
      imageUri: null,
      imageUrl: undefined,
    });
    setShowFormModal(true);
  };

  const handleEditDrink = (drink: CocktailDrink) => {
    setEditingDrink(drink);
    
    // Extraer valores bilingües
    const name = typeof drink.name === 'string' ? { es: drink.name, en: '' } : drink.name;
    const description = typeof drink.description === 'string' 
      ? { es: drink.description, en: '' } 
      : (drink.description || { es: '', en: '' });
    const ingredients = Array.isArray(drink.ingredients)
      ? { es: drink.ingredients.join(', '), en: '' }
      : (typeof drink.ingredients === 'object' && drink.ingredients !== null
          ? {
              es: Array.isArray(drink.ingredients.es) ? drink.ingredients.es.join(', ') : (drink.ingredients.es || ''),
              en: Array.isArray(drink.ingredients.en) ? drink.ingredients.en.join(', ') : (drink.ingredients.en || ''),
            }
          : { es: '', en: '' });

    setFormData({
      name_es: name.es || '',
      name_en: name.en || '',
      description_es: description.es || '',
      description_en: description.en || '',
      ingredients_es: ingredients.es || '',
      ingredients_en: ingredients.en || '',
      price: drink.price.toString(),
      imageUri: null,
      imageUrl: drink.image_url,
    });
    setShowFormModal(true);
  };

  const handleDeleteDrink = (drink: CocktailDrink) => {
    Alert.alert(
      t('cocktail.delete_drink'),
      t('cocktail.delete_confirm'),
      [
        { text: t('btn.cancel'), style: 'cancel' },
        {
          text: t('btn.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCocktailDrink(drink.id);
              Alert.alert(t('msg.success'), t('cocktail.delete_success'));
              loadDrinks();
            } catch (error) {
              logger.error('[CocktailManagement] Error eliminando:', error);
              Alert.alert(t('msg.error'), t('cocktail.delete_error'));
            }
          },
        },
      ]
    );
  };

  const handleTakePhoto = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert(t('cocktail.permission_required'), t('cocktail.camera_access'));
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaType.Images,
        quality: 1.0, // Usar calidad máxima inicial, luego comprimiremos
        allowsEditing: true,
        aspect: [1, 1],
      });

      if (!result.canceled && result.assets[0]) {
        const originalUri = result.assets[0].uri;
        
        // Comprimir imagen antes de guardar
        setCompressingImage(true);
        try {
          const deviceType = deviceInfo.deviceType === 'tablet' ? 'tablet' : 'smartphone';
          const compressed = await compressCocktailImage(originalUri, deviceType);
          
          setFormData(prev => ({ ...prev, imageUri: compressed.uri }));
          logger.success('[CocktailManagement] Imagen comprimida y lista para subir');
        } catch (compressionError: any) {
          logger.error('[CocktailManagement] Error comprimiendo imagen:', compressionError);
          const errorMessage = compressionError?.message || t('cocktail.error_compress') || 'No se pudo comprimir la imagen. Por favor, intenta con otra imagen.';
          Alert.alert(
            t('msg.error'),
            errorMessage
          );
        } finally {
          setCompressingImage(false);
        }
      }
    } catch (error) {
      logger.error('[CocktailManagement] Error capturando:', error);
      Alert.alert(t('msg.error'), t('cocktail.error_capture'));
      setCompressingImage(false);
    }
  };

  const handleSelectFromGallery = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert(t('cocktail.permission_required'), t('cocktail.gallery_access'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaType.Images,
        quality: 1.0, // Usar calidad máxima inicial, luego comprimiremos
        allowsEditing: true,
        aspect: [1, 1],
      });

      if (!result.canceled && result.assets[0]) {
        const originalUri = result.assets[0].uri;
        
        // Comprimir imagen antes de guardar
        setCompressingImage(true);
        try {
          const deviceType = deviceInfo.deviceType === 'tablet' ? 'tablet' : 'smartphone';
          const compressed = await compressCocktailImage(originalUri, deviceType);
          
          setFormData(prev => ({ ...prev, imageUri: compressed.uri }));
          logger.success('[CocktailManagement] Imagen comprimida y lista para subir');
        } catch (compressionError: any) {
          logger.error('[CocktailManagement] Error comprimiendo imagen:', compressionError);
          const errorMessage = compressionError?.message || t('cocktail.error_compress') || 'No se pudo comprimir la imagen. Por favor, intenta con otra imagen.';
          Alert.alert(
            t('msg.error'),
            errorMessage
          );
        } finally {
          setCompressingImage(false);
        }
      }
    } catch (error) {
      logger.error('[CocktailManagement] Error seleccionando:', error);
      Alert.alert(t('msg.error'), t('cocktail.error_select'));
      setCompressingImage(false);
    }
  };

  const handleSave = async () => {
    // Validaciones
    if (!formData.name_es && !formData.name_en) {
      Alert.alert(t('msg.error'), t('cocktail.name_required'));
      return;
    }

    if (!formData.ingredients_es && !formData.ingredients_en) {
      Alert.alert(t('msg.error'), t('cocktail.ingredients_required'));
      return;
    }

    if (!formData.price || isNaN(parseFloat(formData.price))) {
      Alert.alert(t('msg.error'), t('cocktail.price_invalid'));
      return;
    }

    if (!currentBranch || !user) {
      Alert.alert(t('msg.error'), t('admin.error_no_branch'));
      return;
    }

    try {
      setUploadingImage(true);

      // Preparar datos bilingües
      const name: { en?: string; es?: string } = {};
      if (formData.name_es) name.es = formData.name_es;
      if (formData.name_en) name.en = formData.name_en;

      const description: { en?: string; es?: string } = {};
      if (formData.description_es) description.es = formData.description_es;
      if (formData.description_en) description.en = formData.description_en;

      const ingredients: { en?: string[]; es?: string[] } = {};
      if (formData.ingredients_es) {
        ingredients.es = formData.ingredients_es.split(',').map(i => i.trim()).filter(i => i);
      }
      if (formData.ingredients_en) {
        ingredients.en = formData.ingredients_en.split(',').map(i => i.trim()).filter(i => i);
      }

      let imageUrl = formData.imageUrl;

      // Subir imagen si hay una nueva
      if (formData.imageUri) {
        const drinkId = editingDrink?.id || `temp-${Date.now()}`;
        imageUrl = await uploadCocktailImage(formData.imageUri, drinkId, currentBranch.id);
      }

      // Obtener owner_id correcto: si el usuario es owner usa su ID, si no usa owner_id
      const ownerId = user.owner_id || user.id;

      const drinkData: CreateCocktailDrinkData = {
        branch_id: currentBranch.id,
        owner_id: ownerId,
        name,
        description: Object.keys(description).length > 0 ? description : undefined,
        ingredients,
        image_url: imageUrl,
        price: parseFloat(formData.price),
      };

      if (editingDrink) {
        await updateCocktailDrink(editingDrink.id, drinkData);
      } else {
        await createCocktailDrink(drinkData, user.id);
      }

      Alert.alert(t('msg.success'), t('cocktail.save_success'));
      setShowFormModal(false);
      loadDrinks();
    } catch (error) {
      logger.error('[CocktailManagement] Error guardando:', error);
      Alert.alert(t('msg.error'), t('cocktail.save_error'));
    } finally {
      setUploadingImage(false);
    }
  };

  const renderDrinkCard = ({ item }: { item: CocktailDrink }) => {
    const drinkName = getBilingualValue(item.name, language);
    const drinkDescription = getBilingualValue(item.description, language);
    const drinkIngredients = Array.isArray(item.ingredients)
      ? item.ingredients
      : (typeof item.ingredients === 'object' && item.ingredients !== null
          ? (language === 'es' 
              ? (Array.isArray(item.ingredients.es) ? item.ingredients.es : [])
              : (Array.isArray(item.ingredients.en) ? item.ingredients.en : []))
          : []);

    return (
      <View style={styles.card}>
        <View style={styles.cardImageContainer}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.cardImage} />
          ) : (
            <View style={styles.cardImagePlaceholder}>
              <Ionicons name="wine" size={40} color="#ccc" />
            </View>
          )}
        </View>
        
        <View style={styles.cardContent}>
          {drinkName && (
            <Text style={styles.cardTitle} numberOfLines={2}>
              {drinkName}
            </Text>
          )}
          
          {drinkDescription && (
            <Text style={styles.cardDescription} numberOfLines={2}>
              {drinkDescription}
            </Text>
          )}
          
          {drinkIngredients.length > 0 && (
            <Text style={styles.cardIngredients} numberOfLines={2}>
              {drinkIngredients.join(', ')}
            </Text>
          )}
          
          <Text style={styles.cardPrice}>
            ${item.price.toFixed(2)}
          </Text>
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.btnEdit}
            onPress={() => handleEditDrink(item)}
          >
            <Ionicons name="pencil" size={18} color="#fff" />
            <Text style={styles.btnEditText}>{t('btn.edit')}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.btnDelete}
            onPress={() => handleDeleteDrink(item)}
          >
            <Ionicons name="trash" size={18} color="#fff" />
            <Text style={styles.btnDeleteText}>{t('btn.delete')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderFormModal = () => {
    if (!showFormModal) return null;

    return (
      <Modal
        visible={showFormModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowFormModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <SafeAreaView style={styles.modalSafeArea}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingDrink ? t('cocktail.edit_drink') : t('cocktail.add_drink')}
              </Text>
              <TouchableOpacity
                onPress={() => setShowFormModal(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalContent}
              contentContainerStyle={styles.modalContentContainer}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
            {/* Foto */}
            <View style={styles.formSection}>
              <Text style={styles.formLabel}>{t('cocktail.photo')}</Text>
              <View style={styles.imageContainer}>
                {(formData.imageUri || formData.imageUrl) ? (
                  <Image
                    source={{ uri: formData.imageUri || formData.imageUrl }}
                    style={styles.formImage}
                  />
                ) : (
                  <View style={styles.formImagePlaceholder}>
                    <Ionicons name="camera" size={40} color="#ccc" />
                  </View>
                )}
                <View style={styles.imageButtons}>
                  <TouchableOpacity
                    style={[styles.imageButton, (compressingImage || uploadingImage) && styles.imageButtonDisabled]}
                    onPress={handleTakePhoto}
                    disabled={compressingImage || uploadingImage}
                  >
                    {compressingImage ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="camera" size={20} color="#fff" />
                        <Text style={styles.imageButtonText}>{t('cocktail.take_photo')}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.imageButton, (compressingImage || uploadingImage) && styles.imageButtonDisabled]}
                    onPress={handleSelectFromGallery}
                    disabled={compressingImage || uploadingImage}
                  >
                    {compressingImage ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="images" size={20} color="#fff" />
                        <Text style={styles.imageButtonText}>{t('cocktail.select_from_gallery')}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
                {compressingImage && (
                  <Text style={styles.compressingText}>{t('cocktail.compressing_image')}</Text>
                )}
              </View>
            </View>

            {/* Nombre */}
            <View style={styles.formSection}>
              <Text style={styles.formLabel}>{t('cocktail.name_es')} *</Text>
              <TextInput
                style={styles.formInput}
                value={formData.name_es}
                onChangeText={(text) => setFormData(prev => ({ ...prev, name_es: text }))}
                placeholder={t('cocktail.name')}
                placeholderTextColor="#999"
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>{t('cocktail.name_en')}</Text>
              <TextInput
                style={styles.formInput}
                value={formData.name_en}
                onChangeText={(text) => setFormData(prev => ({ ...prev, name_en: text }))}
                placeholder={t('cocktail.name')}
                placeholderTextColor="#999"
              />
            </View>

            {/* Descripción */}
            <View style={styles.formSection}>
              <Text style={styles.formLabel}>{t('cocktail.description_es')}</Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                value={formData.description_es}
                onChangeText={(text) => setFormData(prev => ({ ...prev, description_es: text }))}
                placeholder={t('cocktail.description')}
                placeholderTextColor="#999"
                multiline
                numberOfLines={3}
                maxLength={200}
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>{t('cocktail.description_en')}</Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                value={formData.description_en}
                onChangeText={(text) => setFormData(prev => ({ ...prev, description_en: text }))}
                placeholder={t('cocktail.description')}
                placeholderTextColor="#999"
                multiline
                numberOfLines={3}
                maxLength={200}
              />
            </View>

            {/* Ingredientes */}
            <View style={styles.formSection}>
              <Text style={styles.formLabel}>{t('cocktail.ingredients_es')} *</Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                value={formData.ingredients_es}
                onChangeText={(text) => setFormData(prev => ({ ...prev, ingredients_es: text }))}
                placeholder={t('cocktail.ingredient_placeholder')}
                placeholderTextColor="#999"
                multiline
                numberOfLines={2}
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>{t('cocktail.ingredients_en')}</Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                value={formData.ingredients_en}
                onChangeText={(text) => setFormData(prev => ({ ...prev, ingredients_en: text }))}
                placeholder={t('cocktail.ingredient_placeholder')}
                placeholderTextColor="#999"
                multiline
                numberOfLines={2}
              />
            </View>

            {/* Precio */}
            <View style={styles.formSection}>
              <Text style={styles.formLabel}>{t('cocktail.price')} *</Text>
              <TextInput
                style={styles.formInput}
                value={formData.price}
                onChangeText={(text) => setFormData(prev => ({ ...prev, price: text }))}
                placeholder={t('cocktail.price_placeholder')}
                placeholderTextColor="#999"
                keyboardType="decimal-pad"
              />
            </View>

            {/* Botones */}
            <View style={styles.formActions}>
              <TouchableOpacity
                style={styles.btnCancel}
                onPress={() => setShowFormModal(false)}
              >
                <Text style={styles.btnCancelText}>{t('btn.cancel')}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.btnSave}
                onPress={handleSave}
                disabled={uploadingImage}
              >
                {uploadingImage ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={20} color="#fff" />
                    <Text style={styles.btnSaveText}>{t('cocktail.save')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  if (!currentBranch) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{t('admin.error_no_branch')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.title}>{t('cocktail.title')}</Text>
          <Text style={styles.subtitle}>
            {drinks.length} {t('cocktail.subtitle')}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddDrink}
        >
          <Ionicons name="add-circle" size={32} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Lista de bebidas */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B0000" />
          <Text style={styles.loadingText}>{t('cocktail.loading')}</Text>
        </View>
      ) : drinks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="wine-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>{t('cocktail.no_drinks')}</Text>
          <Text style={styles.emptySubtext}>{t('cocktail.add_first')}</Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={handleAddDrink}
          >
            <Text style={styles.emptyButtonText}>{t('cocktail.add_drink')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={drinks}
          renderItem={renderDrinkCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {renderFormModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    padding: 20,
    backgroundColor: '#8B0000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
  },
  addButton: {
    marginLeft: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: '#8B0000',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 24,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  listContent: {
    padding: 20,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  cardImageContainer: {
    width: '100%',
    height: 150,
    backgroundColor: '#f0f0f0',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  cardImagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  cardContent: {
    padding: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  cardIngredients: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  cardPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#8B0000',
    marginTop: 8,
  },
  cardActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    padding: 12,
  },
  btnEdit: {
    flex: 1,
    backgroundColor: '#17a2b8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    marginRight: 8,
  },
  btnEditText: {
    color: '#fff',
    marginLeft: 6,
    fontWeight: 'bold',
  },
  btnDelete: {
    flex: 1,
    backgroundColor: '#dc3545',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnDeleteText: {
    color: '#fff',
    marginLeft: 6,
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  modalSafeArea: {
    flex: 1,
  },
  modalHeader: {
    backgroundColor: 'white',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
  },
  modalContentContainer: {
    padding: 20,
    paddingBottom: 100, // Espacio extra al final para que los campos no queden ocultos
  },
  formSection: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
  },
  formTextArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  imageContainer: {
    marginBottom: 12,
  },
  formImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 12,
    resizeMode: 'cover',
  },
  formImagePlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  imageButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  imageButton: {
    flex: 1,
    backgroundColor: '#8B0000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  imageButtonDisabled: {
    opacity: 0.6,
  },
  imageButtonText: {
    color: '#fff',
    marginLeft: 6,
    fontWeight: '600',
  },
  compressingText: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    marginBottom: 40,
  },
  btnCancel: {
    flex: 1,
    backgroundColor: '#6c757d',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnCancelText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  btnSave: {
    flex: 1,
    backgroundColor: '#28a745',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
  },
  btnSaveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 6,
  },
});

export default CocktailManagementScreen;
