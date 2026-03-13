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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useAdminGuard } from '../hooks/useAdminGuard';
import { PendingApprovalMessage } from '../components/PendingApprovalMessage';
import CocktailHeader from '../components/CocktailHeader';
import CocktailCard from '../components/CocktailCard';
import CropImageModal from '../components/CropImageModal';
import { useBranch } from '../contexts/BranchContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
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
import { getEffectivePlan } from '../utils/effectivePlan';
import { useDeviceInfo } from '../hooks/useDeviceInfo';
import { compressCocktailImage } from '../utils/imageCompression';

type CocktailManagementScreenNavigationProp = StackNavigationProp<RootStackParamList, 'CocktailManagement'>;
type CocktailManagementScreenRouteProp = RouteProp<RootStackParamList, 'CocktailManagement'>;

interface Props {
  navigation: CocktailManagementScreenNavigationProp;
  route: CocktailManagementScreenRouteProp;
}

const CocktailManagementScreen: React.FC<Props> = ({ navigation, route }) => {
  const { status: guardStatus } = useAdminGuard({
    navigation,
    route,
    allowedRoles: ['owner', 'gerente', 'sommelier', 'supervisor'],
  });
  const { user } = useAuth();
  const { currentBranch } = useBranch();
  const { t, language } = useLanguage();
  const deviceInfo = useDeviceInfo();

  const [drinks, setDrinks] = useState<CocktailDrink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingDrink, setEditingDrink] = useState<CocktailDrink | null>(null);
  const [previewDrink, setPreviewDrink] = useState<CocktailDrink | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropModalUri, setCropModalUri] = useState<string | null>(null);
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
    imageUrl: undefined as string | undefined,
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
      <View style={styles.guardLoading}>
        <ActivityIndicator size="large" color="#8E2C3A" />
      </View>
    );
  }
  if (guardStatus === 'pending') {
    return (
      <View style={styles.guardContainer}>
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

  const cameraMediaTypes =
    (ImagePicker as any)?.MediaType?.Images
      ? [(ImagePicker as any).MediaType.Images]
      : (ImagePicker as any).MediaTypeOptions?.Images;

  type ImageSource = 'camera' | 'gallery';

  const normalizeImage = async (uri: string): Promise<string> => {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [],
      { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  };

  const pickImage = async (source: ImageSource) => {
    try {
      if (source === 'camera') {
        const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
        if (!permissionResult.granted) {
          Alert.alert(t('cocktail.permission_required'), t('cocktail.camera_access'));
          return;
        }
      } else {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permissionResult.granted) {
          Alert.alert(t('cocktail.permission_required'), t('cocktail.gallery_access'));
          return;
        }
      }

      const pickerOptions = {
        mediaTypes: cameraMediaTypes,
        quality: 0.85,
        allowsEditing: false,
        exif: false,
      };

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(pickerOptions)
          : await ImagePicker.launchImageLibraryAsync(pickerOptions);

      if (result.canceled) return;

      const uri = result.assets?.[0]?.uri;
      if (!uri) {
        if (__DEV__) {
          logger.error('[CocktailManagement] No URI in picker result', result);
          Alert.alert(t('msg.error'), 'No image URI in result. Check logs.');
        }
        return;
      }

      const normalizedUri = await normalizeImage(uri);
      if (__DEV__) console.log('[IMG_PIPE] openCrop', { normalizedUri });
      setCropModalUri(normalizedUri);
      setShowCropModal(true);
    } catch (error: any) {
      logger.error('[CocktailManagement] Error en picker:', error);
      if (__DEV__) {
        Alert.alert(t('msg.error'), error?.message ?? String(error));
      } else {
        Alert.alert(
          t('msg.error'),
          source === 'camera' ? t('cocktail.error_capture') : t('cocktail.error_select')
        );
      }
    }
  };

  const handleCropConfirm = (croppedUri: string) => {
    if (__DEV__) console.log('[IMG_PIPE] croppedUri', { croppedUri });
    setShowCropModal(false);
    setCropModalUri(null);
    setCompressingImage(true);
    const deviceType = deviceInfo.deviceType === 'tablet' ? 'tablet' : 'smartphone';
    compressCocktailImage(croppedUri, deviceType)
      .then(compressed => {
        if (__DEV__) console.log('[IMG_PIPE] compressedUri', { compressedUri: compressed.uri });
        setFormData(prev => ({ ...prev, imageUri: compressed.uri }));
        logger.success('[CocktailManagement] Imagen comprimida y lista para subir');
      })
      .catch((err: any) => {
        logger.error('[CocktailManagement] Error comprimiendo imagen:', err);
        Alert.alert(
          t('msg.error'),
          err?.message || t('cocktail.error_compress') || 'No se pudo comprimir la imagen.'
        );
      })
      .finally(() => setCompressingImage(false));
  };

  const handleTakePhoto = () => {
    pickImage('camera');
  };

  const handleSelectFromGallery = () => {
    pickImage('gallery');
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

    if (!user) {
      Alert.alert(t('msg.error'), t('admin.error_no_branch'));
      return;
    }
    if (!currentBranch) {
      if (__DEV__) {
        console.log('[CocktailManagement] handleSave: currentBranch is null', {
          userId: user.id,
          ownerId: user.owner_id,
          userBranchId: (user as any).branch_id,
        });
      }
      Alert.alert(
        t('msg.error'),
        'No hay sucursal seleccionada. Cierra sesión y vuelve a entrar, o crea una sucursal desde el menú.'
      );
      return;
    }

    if (__DEV__) {
      console.log('[CocktailManagement] handleSave context', {
        userId: user.id,
        ownerId: user.owner_id,
        currentBranchId: currentBranch?.id,
      });
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
      let imagePath: string | undefined = editingDrink?.image_path;

      // Subir solo la imagen final: formData.imageUri (cropped + compressed). Si es null, no subir.
      if (__DEV__) console.log('[IMG_PIPE] uploadUsingUri', { uploadUri: formData.imageUri });
      if (formData.imageUri) {
        const drinkId = editingDrink?.id || `temp-${Date.now()}`;
        const result = await uploadCocktailImage(formData.imageUri, drinkId, currentBranch.id);
        imageUrl = result.publicUrl;
        imagePath = result.path;
      }

      const ownerId = user.owner_id || user.id;

      const drinkData: CreateCocktailDrinkData = {
        branch_id: currentBranch.id,
        owner_id: ownerId,
        name,
        description: Object.keys(description).length > 0 ? description : undefined,
        ingredients,
        image_url: imageUrl,
        ...(imagePath != null ? { image_path: imagePath } : {}),
        price: parseFloat(formData.price),
      };

      if (editingDrink) {
        await updateCocktailDrink(editingDrink.id, drinkData);
      } else {
        const effectivePlan = getEffectivePlan(user);
        await createCocktailDrink(drinkData, user.id, effectivePlan);
      }

      Alert.alert(t('msg.success'), t('cocktail.save_success'));
      setShowFormModal(false);
      loadDrinks();
    } catch (error: any) {
      if (__DEV__) {
        console.log('[CocktailManagement] Error guardando (raw):', error);
        try {
          console.log('[CocktailManagement] Error guardando (JSON):', JSON.stringify(error));
        } catch (_) {
          console.log('[CocktailManagement] Error guardando (JSON.stringify failed)');
        }
        console.log('[CocktailManagement] Error guardando (fields):', {
          message: error?.message,
          code: error?.code,
          details: error?.details,
          hint: error?.hint,
          supabaseError: (error as any)?.error,
          cause: (error as any)?.cause,
        });
        logger.error('[CocktailManagement] Error guardando:', error);
      }
      const msg = error?.message ?? '';
      const code = error?.code ?? error?.error?.code;
      const isLimitError =
        msg.includes('COCKTAIL_LIMIT_REACHED') ||
        msg.includes('COCKTAIL plan limit') ||
        code === 'P0001';
      if (isLimitError) {
        Alert.alert(t('msg.limit_reached'), t('cocktail.limit_free_10'));
        return;
      }
      const alertBody = msg || (error?.details ?? error?.hint ?? t('cocktail.save_error'));
      Alert.alert(t('msg.error'), alertBody);
    } finally {
      setUploadingImage(false);
    }
  };

  const renderDrinkCard = ({ item, index }: { item: CocktailDrink; index: number }) => {
    const drinkName = getBilingualValue(item.name, language);
    const drinkDescription = getBilingualValue(item.description, language);

    return (
      <Animated.View entering={FadeIn.duration(280).delay(index * 40)}>
        <CocktailCard
          drink={item}
          drinkName={drinkName ?? ''}
          drinkDescription={drinkDescription ?? ''}
          onView={(d) => setPreviewDrink(d)}
          onEdit={handleEditDrink}
          onDelete={handleDeleteDrink}
        />
      </Animated.View>
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
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.formImagePlaceholder}>
                    <Ionicons name="camera" size={40} color="#B0B0B0" />
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
                        <Ionicons name="camera" size={18} color="#FFFFFF" />
                        <Text style={styles.imageButtonText} numberOfLines={1}>{t('cocktail.take_photo')}</Text>
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
                        <Ionicons name="images" size={18} color="#FFFFFF" />
                        <Text style={styles.imageButtonTextTwoLine}>
                          <Text style={styles.imageButtonTextLine}>{t('cocktail.gallery_line1')}</Text>
                          {'\n'}
                          <Text style={styles.imageButtonTextLine}>{t('cocktail.gallery_line2')}</Text>
                        </Text>
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
                placeholderTextColor="#B0B0B0"
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>{t('cocktail.name_en')}</Text>
              <TextInput
                style={styles.formInput}
                value={formData.name_en}
                onChangeText={(text) => setFormData(prev => ({ ...prev, name_en: text }))}
                placeholder={t('cocktail.name')}
                placeholderTextColor="#B0B0B0"
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
                placeholderTextColor="#B0B0B0"
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
                placeholderTextColor="#B0B0B0"
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
                placeholderTextColor="#B0B0B0"
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

  const renderPreviewModal = () => {
    if (!previewDrink) return null;
    const previewName = getBilingualValue(previewDrink.name, language);
    const previewDesc = getBilingualValue(previewDrink.description, language);
    return (
      <Modal
        visible={true}
        animationType="fade"
        transparent
        onRequestClose={() => setPreviewDrink(null)}
      >
        <View style={styles.previewBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setPreviewDrink(null)} />
          <View style={styles.previewCard}>
            <View style={styles.previewImageWrap}>
              {previewDrink.image_url ? (
                <Image source={{ uri: previewDrink.image_url }} style={styles.previewImage} resizeMode="contain" />
              ) : (
                <View style={styles.previewImagePlaceholder}>
                  <Ionicons name="wine" size={64} color="#B0B0B0" />
                </View>
              )}
            </View>
            <Text style={styles.previewName}>{previewName || '—'}</Text>
            {previewDesc ? <Text style={styles.previewDescription}>{previewDesc}</Text> : null}
            <Text style={styles.previewPrice}>${previewDrink.price.toFixed(2)}</Text>
            <TouchableOpacity style={styles.previewCloseBtn} onPress={() => setPreviewDrink(null)}>
              <Text style={styles.previewCloseText}>{t('btn.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  if (!currentBranch) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{t('admin.error_no_branch')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <CocktailHeader
        title={t('cocktail.title')}
        subtitle={`${drinks.length} ${t('cocktail.beverages_available')}`}
        onAddPress={handleAddDrink}
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8E2C3A" />
          <Text style={styles.loadingText}>{t('cocktail.loading')}</Text>
        </View>
      ) : drinks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="wine-outline" size={56} color="#B0B0B0" />
          <Text style={styles.emptyText}>{t('cocktail.empty_primary')}</Text>
          <Text style={styles.emptySubtext}>{t('cocktail.empty_secondary')}</Text>
          <TouchableOpacity style={styles.emptyButton} onPress={handleAddDrink} activeOpacity={0.85}>
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
      {renderPreviewModal()}
      <CropImageModal
        visible={showCropModal}
        imageUri={cropModalUri}
        onCancel={() => {
          setShowCropModal(false);
          setCropModalUri(null);
        }}
        onConfirm={handleCropConfirm}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F4F6',
  },
  guardLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F4F4F6',
  },
  guardContainer: {
    flex: 1,
    backgroundColor: '#F4F4F6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6A6A6A',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C2C2C',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: '#8E2C3A',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 24,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  previewCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  previewImageWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
    overflow: 'hidden',
    marginBottom: 16,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewImagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C2C2C',
    marginBottom: 6,
  },
  previewDescription: {
    fontSize: 14,
    color: '#6A6A6A',
    marginBottom: 8,
  },
  previewPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#8E2C3A',
    marginBottom: 16,
  },
  previewCloseBtn: {
    backgroundColor: '#8E2C3A',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  previewCloseText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F4F4F6',
  },
  modalSafeArea: {
    flex: 1,
  },
  modalHeader: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 21,
    fontWeight: '700',
    color: '#2C2C2C',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
  },
  modalContentContainer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 100,
  },
  formSection: {
    marginBottom: 14,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2C2C2C',
    marginBottom: 6,
  },
  formInput: {
    height: 48,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E8',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#2C2C2C',
  },
  formTextArea: {
    minHeight: 72,
    paddingTop: 12,
    paddingBottom: 12,
    textAlignVertical: 'top',
  },
  imageContainer: {
    alignSelf: 'center',
    width: '65%',
    maxWidth: 280,
    marginBottom: 14,
  },
  formImage: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    backgroundColor: '#F1F1F3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  formImagePlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    backgroundColor: '#F1F1F3',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  imageButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  imageButton: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 14,
    backgroundColor: '#8E2C3A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    gap: 8,
  },
  imageButtonDisabled: {
    opacity: 0.6,
  },
  imageButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  imageButtonTextTwoLine: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  imageButtonTextLine: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  compressingText: {
    marginTop: 6,
    fontSize: 12,
    color: '#6A6A6A',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    marginBottom: 40,
    paddingHorizontal: 0,
  },
  btnCancel: {
    flex: 1,
    height: 48,
    backgroundColor: '#E8E8ED',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancelText: {
    color: '#444',
    fontSize: 16,
    fontWeight: '600',
  },
  btnSave: {
    flex: 1,
    height: 48,
    backgroundColor: '#8E2C3A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  btnSaveText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 6,
  },
});

export default CocktailManagementScreen;
