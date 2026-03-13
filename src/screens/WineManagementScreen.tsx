import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import * as ImagePicker from 'expo-image-picker';
import { WineService } from '../services/WineService';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { useLanguage } from '../contexts/LanguageContext';
import { ProWineCamera } from '../modules/camera';
import * as FileSystem from 'expo-file-system/legacy';
import { useAdminGuard } from '../hooks/useAdminGuard';
import { PendingApprovalMessage } from '../components/PendingApprovalMessage';
import { supabase } from '../lib/supabase';

type WineManagementScreenNavigationProp = StackNavigationProp<RootStackParamList, 'WineManagement'>;
type WineManagementScreenRouteProp = RouteProp<RootStackParamList, 'WineManagement'>;

interface Props {
  navigation: WineManagementScreenNavigationProp;
  route: WineManagementScreenRouteProp;
}

interface WineFormData {
  name: string;
  winery: string;
  vintage?: number;
  grape_variety: string;
  type: 'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified';
  region?: string;
  country: string;
  alcohol_content?: number;
  tasting_notes: string;
  food_pairings: string;
  serving_temperature: string;
  body_level: number;
  sweetness_level: number;
  acidity_level: number;
  intensity_level: number;
  price_bottle?: number;
  price_glass?: number;
  initial_stock: number;
  image_url?: string;
  // Nuevas propiedades para múltiples fotos
  front_label_image?: string;
  back_label_image?: string;
  additional_images?: string[];
}

const WineManagementScreen: React.FC<Props> = ({ navigation, route }) => {
  const { status: guardStatus } = useAdminGuard({
    navigation,
    route,
    allowedRoles: ['owner', 'gerente', 'sommelier', 'supervisor'],
  });
  const { user } = useAuth();
  const { currentBranch } = useBranch();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [frontLabelImage, setFrontLabelImage] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [wineData, setWineData] = useState<Partial<WineFormData>>({});
  const [showProCamera, setShowProCamera] = useState(false);

  if (guardStatus === 'loading' || guardStatus === 'profile_loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa' }}>
        <ActivityIndicator size="large" color="#8E2C3A" />
        <Text style={{ marginTop: 12, color: '#666' }}>{guardStatus === 'profile_loading' ? (t('msg.loading') || 'Cargando perfil…') : ''}</Text>
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

  // Seleccionar foto del anverso desde galería
  const handleSelectFrontFromGallery = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert(t('wine_mgmt.permission_required'), t('wine_mgmt.gallery_access'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true,
        aspect: [3, 4],
      });

      if (!result.canceled && result.assets[0]) {
        setFrontLabelImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error seleccionando imagen del anverso:', error);
      Alert.alert(t('msg.error'), t('wine_mgmt.error_select_front'));
    }
  };

  // Convertir imagen local a URI válida
  const convertLocalImageToUri = async (uri: string): Promise<string> => {
    try {
      // Si ya tiene file://, devolverla tal como está
      if (uri.startsWith('file://')) {
        return uri;
      }
      
      // Si es una ruta local de Android, agregar file://
      if (uri.startsWith('/data/') || uri.startsWith('/storage/')) {
        const fileUri = `file://${uri}`;
        console.log('🔧 Convirtiendo ruta local:', uri, '->', fileUri);
        return fileUri;
      }
      
      // Para otras rutas, devolver tal como están
      return uri;
    } catch (error) {
      console.log('❌ Error convirtiendo URI:', error);
      return uri;
    }
  };

  // Abrir cámara profesional para foto frontal
  const handleOpenProCameraFront = () => {
    setShowProCamera(true);
  };

  // Manejar captura exitosa de la cámara profesional (solo foto frontal)
  const handleProCameraCapture = async (uri: string) => {
    const correctedUri = await convertLocalImageToUri(uri);
    setFrontLabelImage(correctedUri);
    setShowProCamera(false);
  };

  // Manejar error de la cámara profesional
  const handleProCameraError = (error: string) => {
    Alert.alert(t('wine_mgmt.error_camera'), error);
    setShowProCamera(false);
  };

  // Guardar vino
  const handleSaveWine = async () => {
    // Solo validar campos obligatorios: name, grape_variety, type, initial_stock
    const requiredFields = [
      { field: 'name', label: t('wine_mgmt.name') },
      { field: 'grape_variety', label: t('wine_mgmt.grape_variety') },
      { field: 'type', label: t('wine_mgmt.wine_type') },
    ];

    const missingFields = requiredFields.filter(({ field }) => {
      const value = wineData[field as keyof typeof wineData];
      return !value || value === 'No especificado';
    });

    if (missingFields.length > 0) {
      const fieldNames = missingFields.map(({ label }) => label).join(', ');
      Alert.alert(
        t('wine_mgmt.missing_fields'),
        `${t('wine_mgmt.missing_fields_msg')}\n\n${fieldNames}`,
        [{ text: t('wine_mgmt.understood'), style: 'default' }]
      );
      return;
    }

    if (!wineData.initial_stock || wineData.initial_stock <= 0) {
      Alert.alert(t('msg.error'), t('wine_mgmt.error_stock'));
      return;
    }

    if (!currentBranch) {
      Alert.alert(t('msg.error'), t('wine_mgmt.error_branch'));
      return;
    }

    if (!user) {
      Alert.alert(t('msg.error'), t('wine_mgmt.error_auth'));
      return;
    }

    try {
      setProcessing(true);
      console.log('🍷 Guardando vino:', wineData.name);

      // Resolver imagen: solo foto frontal
      const imageSource = frontLabelImage || wineData.front_label_image || wineData.image_url;
      let finalImageUrl: string | null = null;

      if (imageSource) {
        const isLocalUri = imageSource.startsWith('file://') || imageSource.startsWith('/') || !imageSource.startsWith('http');
        if (isLocalUri) {
          // Subir imagen a Supabase Storage (wine-bottles). Path con auth.uid() para que RLS permita INSERT.
          const fileExt = (imageSource.split('.').pop() || 'jpg').replace(/\?.*$/, '').toLowerCase();
          const fileName = `${user.id}-${Date.now()}.${fileExt}`;
          const filePath = `${user.id}/wines/${fileName}`;

          let bytes: ArrayBuffer;
          if (imageSource.startsWith('file://') || imageSource.startsWith('/')) {
            const fileUri = imageSource.startsWith('file://') ? imageSource : `file://${imageSource}`;
            const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
            const binaryString = atob(base64);
            const arr = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) arr[i] = binaryString.charCodeAt(i);
            bytes = arr.buffer;
          } else {
            const response = await fetch(imageSource);
            const blob = await response.blob();
            bytes = await blob.arrayBuffer();
          }

          const { error: uploadError } = await supabase.storage
            .from('wine-bottles')
            .upload(filePath, bytes, { contentType: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`, upsert: true });

          if (uploadError) {
            console.error('Error subiendo imagen:', uploadError);
            Alert.alert(t('msg.error'), t('wine_mgmt.error_save') + ' ' + (uploadError.message || ''));
            setProcessing(false);
            return;
          }

          const { data: urlData } = supabase.storage.from('wine-bottles').getPublicUrl(filePath);
          finalImageUrl = urlData?.publicUrl || null;
        } else {
          finalImageUrl = imageSource;
        }
      }

      // Preparar datos del vino para Supabase (campos opcionales con valores por defecto)
      const wineToSave = {
        name: wineData.name!,
        winery: wineData.winery ?? '',
        vintage: wineData.vintage || null,
        grape_variety: wineData.grape_variety!,
        type: wineData.type || 'red',
        region: wineData.region ?? '',
        country: wineData.country ?? '',
        alcohol_content: wineData.alcohol_content || null,
        description: '',
        tasting_notes: null,
        food_pairings: wineData.food_pairings
          ? wineData.food_pairings.split(',').map(p => p.trim()).filter(p => p.length > 0)
          : [],
        serving_temperature: wineData.serving_temperature || null,
        body_level: wineData.body_level ?? 3,
        sweetness_level: wineData.sweetness_level ?? 2,
        acidity_level: wineData.acidity_level ?? 3,
        intensity_level: wineData.intensity_level ?? 4,
        front_label_image: finalImageUrl,
        back_label_image: null,
        image_url: finalImageUrl,
        price: wineData.price_bottle ?? 0, // wines.price (display); venta por botella en wine_branch_stock
        created_by: user.id,
        updated_by: user.id,
      };

      // Logging del objeto completo
      console.log('🔍 Objeto wineToSave completo:', wineToSave);

      // Guardar vino con stock inicial usando el servicio
      const savedWine = await WineService.createWineWithStock(
        wineToSave,
        currentBranch.id,
        user.owner_id || user.id,
        wineData.initial_stock,
        wineData.price_glass ?? null,
        wineData.price_bottle ?? null
      );

      console.log('✅ Vino guardado exitosamente:', savedWine.id);
      
      Alert.alert(
        t('wine_mgmt.success_title'),
        `${wineData.name} ${t('wine_mgmt.success_msg')} ${wineData.initial_stock} ${t('wine_mgmt.success_bottles')}`,
        [
          {
            text: t('btn.back'),
            onPress: () => navigation.navigate('AdminDashboard'),
          },
        ]
      );
    } catch (error: any) {
      console.error('Error guardando vino:', error);
      
      // Mapear error de Supabase a UI amigable
      const { mapSupabaseErrorToUi } = await import('../utils/supabaseErrorMapper');
      const errorUi = mapSupabaseErrorToUi(error, t);
      
      // Mostrar Alert con CTA si aplica
      const alertButtons: any[] = [{ text: t('btn.close') }];
      if (errorUi.ctaAction === 'subscriptions' && errorUi.ctaLabel) {
        alertButtons.push({
          text: errorUi.ctaLabel,
          onPress: () => navigation.navigate('Subscriptions'),
        });
      }
      
      Alert.alert(errorUi.title, errorUi.message, alertButtons);
    } finally {
      setProcessing(false);
    }
  };

  // Renderizar contenido: sección foto frontal + formulario cuando hay foto
  const renderCaptureScreen = () => (
    <ScrollView 
      style={styles.captureContainer} 
      contentContainerStyle={styles.captureContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Card principal con descripción */}
      <View style={styles.heroCard}>
        <Text style={styles.heroDescription}>
          {t('wine_mgmt.hero_description')}
        </Text>
      </View>

      {/* Sección: Anverso de la etiqueta */}
      <View style={styles.photoSectionCard}>
        <Text style={styles.photoSectionTitle}>{t('wine_mgmt.front_label')}</Text>
        <Text style={styles.photoSectionHint}>{t('wine_mgmt.photo_hint')}</Text>
        
        {frontLabelImage ? (
          <View style={styles.imagePreviewContainer}>
            <Image 
              source={{ uri: frontLabelImage }} 
              style={styles.previewImage}
              onLoad={() => {}}
              onError={() => {}}
            />
            <TouchableOpacity 
              style={styles.removeImageButton}
              onPress={() => setFrontLabelImage(null)}
            >
              <Text style={styles.removeImageText}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.photoButtonsRow}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleOpenProCameraFront}
            >
              <Text style={styles.primaryButtonText}>{t('wine_mgmt.pro_camera')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleSelectFrontFromGallery}
            >
              <Text style={styles.secondaryButtonText}>{t('wine_mgmt.gallery')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Formulario visible cuando ya hay foto frontal */}
      {frontLabelImage && (
        <>
      <Text style={styles.sectionTitle}>{t('wine_mgmt.section_wine_info')}</Text>

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('wine_mgmt.name')} *</Text>
        <TextInput
          style={styles.input}
          value={wineData.name || ''}
          onChangeText={(text) => setWineData({ ...wineData, name: text })}
          placeholder={t('wine_mgmt.placeholder_name')}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('wine_mgmt.winery')} *</Text>
        <TextInput
          style={styles.input}
          value={wineData.winery || ''}
          onChangeText={(text) => setWineData({ ...wineData, winery: text })}
          placeholder={t('wine_mgmt.placeholder_name')}
        />
      </View>

      <View style={styles.formRow}>
        <View style={[styles.formGroup, { flex: 1, marginRight: 10 }]}>
          <Text style={styles.label}>{t('wine_mgmt.vintage')}</Text>
          <TextInput
            style={styles.input}
            value={wineData.vintage?.toString() || ''}
            onChangeText={(text) => setWineData({ ...wineData, vintage: parseInt(text) || undefined })}
            placeholder="2015"
            keyboardType="numeric"
          />
        </View>

        <View style={[styles.formGroup, { flex: 1 }]}>
          <Text style={styles.label}>{t('wine_mgmt.alcohol_pct')}</Text>
          <TextInput
            style={styles.input}
            value={wineData.alcohol_content?.toString() || ''}
            onChangeText={(text) => setWineData({ ...wineData, alcohol_content: parseFloat(text) || undefined })}
            placeholder="13.5"
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('wine_mgmt.grape_variety')} *</Text>
        <TextInput
          style={styles.input}
          value={wineData.grape_variety || ''}
          onChangeText={(text) => setWineData({ ...wineData, grape_variety: text })}
          placeholder={t('wine_mgmt.placeholder_grape')}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('wine_mgmt.wine_type')} *</Text>
        <View style={styles.typeChipsRow}>
          {(['red', 'white', 'rose', 'sparkling', 'dessert', 'fortified'] as const).map((wineType) => (
            <TouchableOpacity
              key={wineType}
              style={[
                styles.typeChip,
                wineData.type === wineType && styles.typeChipSelected,
              ]}
              onPress={() => setWineData({ ...wineData, type: wineType })}
            >
              <Text
                style={[
                  styles.typeChipText,
                  wineData.type === wineType && styles.typeChipTextSelected,
                ]}
              >
                {t(`global_catalog.${wineType}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formRow}>
        <View style={[styles.formGroup, { flex: 1, marginRight: 10 }]}>
          <Text style={styles.label}>{t('wine_mgmt.region')}</Text>
          <TextInput
            style={styles.input}
            value={wineData.region || ''}
            onChangeText={(text) => setWineData({ ...wineData, region: text })}
            placeholder={t('wine_mgmt.placeholder_region')}
          />
        </View>

        <View style={[styles.formGroup, { flex: 1 }]}>
          <Text style={styles.label}>{t('wine_mgmt.country')} *</Text>
          <TextInput
            style={styles.input}
            value={wineData.country || ''}
            onChangeText={(text) => setWineData({ ...wineData, country: text })}
            placeholder={t('wine_mgmt.placeholder_country')}
          />
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('wine_mgmt.pairings')}</Text>
        <TextInput
          style={styles.input}
          value={wineData.food_pairings || ''}
          onChangeText={(text) => setWineData({ ...wineData, food_pairings: text })}
          placeholder={t('wine_mgmt.placeholder_pairings')}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('wine_mgmt.serving_temp')}</Text>
        <TextInput
          style={styles.input}
          value={wineData.serving_temperature || ''}
          onChangeText={(text) => setWineData({ ...wineData, serving_temperature: text })}
          placeholder={t('wine_mgmt.placeholder_temp')}
        />
      </View>

      <Text style={styles.sectionTitle}>{t('wine_mgmt.section_sensory')}</Text>
      <Text style={styles.helpText}>{t('wine_mgmt.sensory_help')}</Text>
      {[
        { key: 'body_level' as const, label: t('sensory.body') },
        { key: 'sweetness_level' as const, label: t('sensory.sweetness') },
        { key: 'acidity_level' as const, label: t('sensory.acidity') },
        { key: 'intensity_level' as const, label: t('sensory.tannin') },
      ].map(({ key, label }) => {
        const value = wineData[key];
        return (
          <View key={key} style={styles.formGroup}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.sensoryRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[
                    styles.sensoryBtn,
                    value === n && styles.sensoryBtnSelected,
                  ]}
                  onPress={() => setWineData({ ...wineData, [key]: n })}
                >
                  <Text style={[styles.sensoryBtnText, value === n && styles.sensoryBtnTextSelected]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      })}

      <Text style={styles.sectionTitle}>{t('wine_mgmt.section_prices')}</Text>

      <View style={styles.formRow}>
        <View style={[styles.formGroup, { flex: 1, marginRight: 10 }]}>
          <Text style={styles.label}>{t('wine_mgmt.price_glass')}</Text>
          <TextInput
            style={styles.input}
            value={wineData.price_glass?.toString() || ''}
            onChangeText={(text) => setWineData({ ...wineData, price_glass: parseFloat(text) || undefined })}
            placeholder="150"
            keyboardType="decimal-pad"
          />
        </View>

        <View style={[styles.formGroup, { flex: 1 }]}>
          <Text style={styles.label}>{t('wine_mgmt.price_bottle_optional')}</Text>
          <TextInput
            style={styles.input}
            value={wineData.price_bottle?.toString() || ''}
            onChangeText={(text) => setWineData({ ...wineData, price_bottle: parseFloat(text) || undefined })}
            placeholder="850"
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('wine_mgmt.initial_stock')} *</Text>
        <TextInput
          style={styles.input}
          value={wineData.initial_stock?.toString() || ''}
          onChangeText={(text) => setWineData({ ...wineData, initial_stock: parseInt(text) || 0 })}
          placeholder="12"
          keyboardType="numeric"
        />
        <Text style={styles.helpText}>
          {t('wine_mgmt.stock_help')}
        </Text>
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.saveButton, processing && styles.saveButtonDisabled]}
          onPress={handleSaveWine}
          disabled={processing}
        >
          {processing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>{t('wine_mgmt.save_wine')}</Text>
          )}
        </TouchableOpacity>
      </View>
        </>
      )}
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <LinearGradient
        colors={['#6D1F2B', '#8E2C3A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.headerGradient, { paddingTop: Math.max(insets.top, 16) }]}
      >
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle} numberOfLines={1}>{t('wine_mgmt.title')}</Text>
        </View>
      </LinearGradient>

      {renderCaptureScreen()}

      {/* Modal de carga al guardar */}
      {processing && (
        <Modal
          visible={processing}
          transparent={true}
          animationType="fade"
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <ActivityIndicator size="large" color="#8E2C3A" />
              <Text style={styles.modalText}>{t('wine_mgmt.processing')}</Text>
            </View>
          </View>
        </Modal>
      )}

      {/* Modal de Cámara Profesional */}
      {showProCamera && (
        <Modal
          visible={showProCamera}
          animationType="slide"
          presentationStyle="fullScreen"
        >
          <View style={styles.proCameraContainer}>
            <ProWineCamera
              onWarped={handleProCameraCapture}
              onOriginal={handleProCameraCapture}
              onError={handleProCameraError}
              config={{
                minArea: 50000,
                minAspect: 1.15,
                stabilityFrames: 15,
                autoShoot: true,
                showGuide: true,
                guideShape: "rect"
              }}
              style={styles.proCamera}
            />
            
            {/* Controles de la cámara profesional */}
            <View style={styles.proCameraControls}>
              <TouchableOpacity 
                style={styles.proCameraCloseButton}
                onPress={() => setShowProCamera(false)}
              >
                <Text style={styles.proCameraCloseText}>✕ {t('wine_mgmt.close')}</Text>
              </TouchableOpacity>
              
              <View style={styles.proCameraInfo}>
                <Text style={styles.proCameraInfoText}>
                  {t('wine_mgmt.front_label_camera')}
                </Text>
                <Text style={styles.proCameraInfoSubtext}>
                  {t('wine_mgmt.camera_auto_capture')}
                </Text>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  headerGradient: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingBottom: 20,
    paddingHorizontal: 20,
    ...(Platform.OS === 'android' && { overflow: 'hidden' as const }),
  },
  headerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  captureContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  captureContent: {
    padding: 20,
    paddingBottom: 40,
  },
  // Hero card — estilo catálogo (WineCatalogScreen: fondo gris, cards con borderRadius/sombras)
  heroCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.04)',
  },
  heroDescription: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  captureOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 40,
  },
  captureButton: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    width: '45%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  captureIcon: {
    fontSize: 48,
    marginBottom: 10,
  },
  captureButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  captureButtonSubtext: {
    fontSize: 12,
    color: '#666',
  },
  processingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  processingText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 10,
  },
  processingSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  processingImage: {
    width: 200,
    height: 300,
    borderRadius: 12,
    resizeMode: 'cover',
  },
  reviewContainer: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#444',
    marginBottom: 12,
    marginTop: 20,
    letterSpacing: 0.3,
  },
  labelPreview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    resizeMode: 'cover',
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 16,
  },
  formRow: {
    flexDirection: 'row',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  typeChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  typeChipSelected: {
    borderColor: '#8E2C3A',
    backgroundColor: 'rgba(142, 44, 58, 0.08)',
  },
  typeChipText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  typeChipTextSelected: {
    color: '#8E2C3A',
    fontWeight: '600',
  },
  sensoryRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  sensoryBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sensoryBtnSelected: {
    borderColor: '#8E2C3A',
    backgroundColor: 'rgba(142, 44, 58, 0.12)',
  },
  sensoryBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  sensoryBtnTextSelected: {
    color: '#8E2C3A',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  helpText: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
    fontStyle: 'italic',
  },
  actionButtons: {
    marginTop: 20,
    marginBottom: 40,
  },
  imageButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#8B0000',
    marginBottom: 10,
  },
  imageButtonText: {
    fontSize: 16,
    color: '#8B0000',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#8E2C3A',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
  },
  imagesContainer: {
    flex: 1,
    padding: 20,
  },
  suggestedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 10,
    marginTop: 10,
  },
  suggestedImages: {
    marginBottom: 20,
  },
  suggestedImage: {
    marginRight: 15,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 12,
    overflow: 'hidden',
  },
  selectedImage: {
    borderColor: '#8B0000',
  },
  bottleImage: {
    width: 150,
    height: 250,
    resizeMode: 'cover',
  },
  imageSource: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    padding: 5,
    backgroundColor: '#f0f0f0',
  },
  uploadButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#8B0000',
    marginBottom: 10,
  },
  uploadButtonText: {
    fontSize: 16,
    color: '#8B0000',
    fontWeight: '600',
  },
  continueButton: {
    backgroundColor: '#8B0000',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  continueButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },
  // Photo section card — mismo estilo que catálogo (borderRadius/sombras)
  photoSectionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.04)',
  },
  photoSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  photoSectionHint: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
    lineHeight: 18,
  },
  // Button styles
  photoButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#8E2C3A',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '48%',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#8E2C3A',
    minWidth: '48%',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8E2C3A',
  },
  proCameraContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  proCamera: {
    flex: 1,
  },
  proCameraControls: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  proCameraCloseButton: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  proCameraCloseText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  proCameraInfo: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 15,
    borderRadius: 12,
    marginTop: 20,
  },
  proCameraInfoText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  proCameraInfoSubtext: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 5,
    opacity: 0.8,
  },
  // Image preview styles
  imagePreviewContainer: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  previewImage: {
    width: '100%',
    height: 220,
    resizeMode: 'cover',
  },
  removeImageButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 18,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeImageText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  // Additional images styles
  additionalImagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    gap: 12,
  },
  additionalImagePreview: {
    position: 'relative',
    width: '47%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  additionalPreviewImage: {
    width: '100%',
    height: 150,
    resizeMode: 'cover',
  },
  removeAdditionalImageButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 15,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  processButton: {
    backgroundColor: '#8B0000',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  processButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  manualButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#8B0000',
    marginBottom: 20,
  },
  manualButtonText: {
    fontSize: 16,
    color: '#8B0000',
    fontWeight: '600',
  },
});

export default WineManagementScreen;



