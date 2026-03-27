import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CellariumHeader,
  CellariumModal,
  CellariumPrimaryButton,
  CellariumSecondaryButton,
} from '../components/cellarium';
import CellariumLoader from '../components/CellariumLoader';
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
import { CELLARIUM, CELLARIUM_LAYOUT, CELLARIUM_TEXT } from '../theme/cellariumTheme';

type WineManagementScreenNavigationProp = StackNavigationProp<RootStackParamList, 'WineManagement'>;
type WineManagementScreenRouteProp = RouteProp<RootStackParamList, 'WineManagement'>;

interface Props {
  navigation: WineManagementScreenNavigationProp;
  route: WineManagementScreenRouteProp;
}

type FeedbackDialogState = {
  title: string;
  message: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

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
  const [feedbackDialog, setFeedbackDialog] = useState<FeedbackDialogState | null>(null);

  const dismissFeedbackDialog = useCallback(() => {
    setFeedbackDialog(null);
  }, []);

  const showFeedbackDialog = useCallback((config: FeedbackDialogState) => {
    setFeedbackDialog(config);
  }, []);

  if (guardStatus === 'loading' || guardStatus === 'profile_loading') {
    return (
      <View style={styles.guardContainer}>
        <ActivityIndicator size="large" color={CELLARIUM.primary} />
        <Text style={styles.guardLoadingText}>{guardStatus === 'profile_loading' ? (t('msg.loading') || 'Cargando perfil…') : ''}</Text>
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

  // Seleccionar foto del anverso desde galería
  const handleSelectFrontFromGallery = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        showFeedbackDialog({
          title: t('wine_mgmt.permission_required'),
          message: t('wine_mgmt.gallery_access'),
          primaryLabel: t('wine_mgmt.understood'),
          onPrimary: dismissFeedbackDialog,
        });
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
      showFeedbackDialog({
        title: t('msg.error'),
        message: t('wine_mgmt.error_select_front'),
        primaryLabel: t('btn.close'),
        onPrimary: dismissFeedbackDialog,
      });
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
    setShowProCamera(false);
    showFeedbackDialog({
      title: t('wine_mgmt.error_camera'),
      message: error,
      primaryLabel: t('btn.close'),
      onPrimary: dismissFeedbackDialog,
    });
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
      showFeedbackDialog({
        title: t('wine_mgmt.missing_fields'),
        message: `${t('wine_mgmt.missing_fields_msg')}\n\n${fieldNames}`,
        primaryLabel: t('wine_mgmt.understood'),
        onPrimary: dismissFeedbackDialog,
      });
      return;
    }

    if (!wineData.initial_stock || wineData.initial_stock <= 0) {
      showFeedbackDialog({
        title: t('msg.error'),
        message: t('wine_mgmt.error_stock'),
        primaryLabel: t('btn.close'),
        onPrimary: dismissFeedbackDialog,
      });
      return;
    }

    if (!currentBranch) {
      showFeedbackDialog({
        title: t('msg.error'),
        message: t('wine_mgmt.error_branch'),
        primaryLabel: t('btn.close'),
        onPrimary: dismissFeedbackDialog,
      });
      return;
    }

    if (!user) {
      showFeedbackDialog({
        title: t('msg.error'),
        message: t('wine_mgmt.error_auth'),
        primaryLabel: t('btn.close'),
        onPrimary: dismissFeedbackDialog,
      });
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
            setProcessing(false);
            showFeedbackDialog({
              title: t('msg.error'),
              message: `${t('wine_mgmt.error_save')} ${uploadError.message || ''}`.trim(),
              primaryLabel: t('btn.close'),
              onPrimary: dismissFeedbackDialog,
            });
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

      showFeedbackDialog({
        title: t('wine_mgmt.success_title'),
        message: `${wineData.name} ${t('wine_mgmt.success_msg')} ${wineData.initial_stock} ${t('wine_mgmt.success_bottles')}`,
        primaryLabel: t('btn.back'),
        onPrimary: () => {
          dismissFeedbackDialog();
          navigation.navigate('AdminDashboard');
        },
      });
    } catch (error: any) {
      console.error('Error guardando vino:', error);
      
      // Mapear error de Supabase a UI amigable
      const { mapSupabaseErrorToUi } = await import('../utils/supabaseErrorMapper');
      const errorUi = mapSupabaseErrorToUi(error, t);
      
      if (errorUi.ctaAction === 'subscriptions' && errorUi.ctaLabel) {
        showFeedbackDialog({
          title: errorUi.title,
          message: errorUi.message,
          primaryLabel: t('btn.close'),
          onPrimary: dismissFeedbackDialog,
          secondaryLabel: errorUi.ctaLabel,
          onSecondary: () => {
            dismissFeedbackDialog();
            navigation.navigate('Subscriptions');
          },
        });
      } else {
        showFeedbackDialog({
          title: errorUi.title,
          message: errorUi.message,
          primaryLabel: t('btn.close'),
          onPrimary: dismissFeedbackDialog,
        });
      }
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
        <View style={styles.formGroupFlex}>
          <Text style={styles.label}>{t('wine_mgmt.vintage')}</Text>
          <TextInput
            style={styles.input}
            value={wineData.vintage?.toString() || ''}
            onChangeText={(text) => setWineData({ ...wineData, vintage: parseInt(text) || undefined })}
            placeholder="2015"
            keyboardType="numeric"
          />
        </View>

        <View style={styles.formGroupFlex}>
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
        <View style={styles.formGroupFlex}>
          <Text style={styles.label}>{t('wine_mgmt.region')}</Text>
          <TextInput
            style={styles.input}
            value={wineData.region || ''}
            onChangeText={(text) => setWineData({ ...wineData, region: text })}
            placeholder={t('wine_mgmt.placeholder_region')}
          />
        </View>

        <View style={styles.formGroupFlex}>
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
        <View style={styles.formGroupFlex}>
          <Text style={styles.label}>{t('wine_mgmt.price_glass')}</Text>
          <TextInput
            style={styles.input}
            value={wineData.price_glass?.toString() || ''}
            onChangeText={(text) => setWineData({ ...wineData, price_glass: parseFloat(text) || undefined })}
            placeholder="150"
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.formGroupFlex}>
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
          <Text style={styles.saveButtonText}>
            {processing ? t('wine_mgmt.processing') : t('wine_mgmt.save_wine')}
          </Text>
        </TouchableOpacity>
      </View>
        </>
      )}
    </ScrollView>
  );

  const feedbackDialogFooter =
    feedbackDialog == null ? null : (
      <View style={styles.feedbackModalFooter}>
        {feedbackDialog.secondaryLabel && feedbackDialog.onSecondary ? (
          <CellariumSecondaryButton
            title={feedbackDialog.secondaryLabel}
            onPress={feedbackDialog.onSecondary}
            variant="outline"
          />
        ) : null}
        <CellariumPrimaryButton title={feedbackDialog.primaryLabel} onPress={feedbackDialog.onPrimary} />
      </View>
    );

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <CellariumHeader title={t('wine_mgmt.title')} compact />

      {renderCaptureScreen()}

      <CellariumModal
        visible={feedbackDialog != null}
        onRequestClose={dismissFeedbackDialog}
        title={feedbackDialog?.title}
        scrollable={false}
        contentPaddingBottom={insets.bottom}
        footer={feedbackDialogFooter}
      >
        {feedbackDialog ? (
          <Text style={[CELLARIUM_TEXT.body, styles.feedbackModalMessage]}>{feedbackDialog.message}</Text>
        ) : null}
      </CellariumModal>

      {/* Overlay de guardado: Lottie + bloqueo táctil */}
      {processing ? (
        <Modal visible={true} transparent animationType="fade" statusBarTranslucent>
          <View style={styles.savingOverlayRoot} pointerEvents="auto">
            <CellariumLoader
              overlay
              fullscreen
              size={140}
              label={t('wine_mgmt.processing_label')}
            />
          </View>
        </Modal>
      ) : null}

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
            
            <View style={[styles.proCameraControls, { top: Math.max(insets.top, 14) }]}>
              <TouchableOpacity
                style={styles.proCameraCloseButton}
                onPress={() => setShowProCamera(false)}
              >
                <Text style={styles.proCameraCloseText}>{t('wine_mgmt.close')}</Text>
              </TouchableOpacity>
              <View style={styles.proCameraInfo}>
                <Text style={styles.proCameraInfoText}>{t('wine_mgmt.front_label_camera')}</Text>
                <Text style={styles.proCameraInfoSubtext}>{t('wine_mgmt.camera_auto_capture')}</Text>
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
    backgroundColor: CELLARIUM.bg,
  },
  guardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: CELLARIUM.bg,
    padding: 24,
  },
  guardLoadingText: {
    marginTop: 12,
    fontSize: 14,
    color: CELLARIUM.muted,
    textAlign: 'center',
  },
  captureContainer: {
    flex: 1,
    backgroundColor: CELLARIUM.bg,
  },
  captureContent: {
    paddingHorizontal: CELLARIUM_LAYOUT.screenPadding,
    paddingTop: 12,
    paddingBottom: 28,
  },
  heroCard: {
    backgroundColor: CELLARIUM.card,
    borderRadius: CELLARIUM_LAYOUT.cardRadius,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  heroDescription: {
    ...CELLARIUM_TEXT.body,
    fontSize: 14,
    lineHeight: 20,
    color: CELLARIUM.muted,
  },
  photoSectionCard: {
    backgroundColor: CELLARIUM.card,
    borderRadius: CELLARIUM_LAYOUT.cardRadius,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  photoSectionTitle: {
    ...CELLARIUM_TEXT.sectionTitle,
    fontSize: 16,
    marginBottom: 4,
  },
  photoSectionHint: {
    ...CELLARIUM_TEXT.caption,
    marginBottom: 10,
  },
  photoButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  primaryButton: {
    flex: 1,
    minHeight: CELLARIUM_LAYOUT.buttonHeight - 2,
    borderRadius: CELLARIUM_LAYOUT.buttonRadius,
    backgroundColor: CELLARIUM.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryButton: {
    flex: 1,
    minHeight: CELLARIUM_LAYOUT.buttonHeight - 2,
    borderRadius: CELLARIUM_LAYOUT.buttonRadius,
    backgroundColor: CELLARIUM.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: CELLARIUM.primary,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: CELLARIUM.primary,
  },
  imagePreviewContainer: {
    position: 'relative',
    borderRadius: 18,
    overflow: 'hidden',
    marginTop: 4,
    backgroundColor: '#F1F1F3',
  },
  previewImage: {
    width: '100%',
    height: 220,
    resizeMode: 'cover',
  },
  removeImageButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeImageText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    ...CELLARIUM_TEXT.sectionTitle,
    fontSize: 16,
    marginTop: 4,
    marginBottom: 8,
  },
  formGroup: {
    marginBottom: 10,
  },
  formGroupFlex: {
    flex: 1,
    marginBottom: 10,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  label: {
    ...CELLARIUM_TEXT.label,
    marginBottom: 4,
  },
  input: {
    minHeight: 44,
    backgroundColor: CELLARIUM.card,
    borderWidth: 1,
    borderColor: CELLARIUM.border,
    borderRadius: CELLARIUM_LAYOUT.inputRadius,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: CELLARIUM.text,
  },
  typeChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: CELLARIUM.border,
    backgroundColor: CELLARIUM.card,
  },
  typeChipSelected: {
    borderColor: CELLARIUM.primary,
    backgroundColor: 'rgba(146,64,72,0.10)',
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: CELLARIUM.text,
  },
  typeChipTextSelected: {
    color: CELLARIUM.primary,
    fontWeight: '700',
  },
  sensoryRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
  },
  sensoryBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: CELLARIUM_LAYOUT.inputRadius,
    borderWidth: 1.5,
    borderColor: CELLARIUM.border,
    backgroundColor: CELLARIUM.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sensoryBtnSelected: {
    borderColor: CELLARIUM.primary,
    backgroundColor: 'rgba(146,64,72,0.12)',
  },
  sensoryBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: CELLARIUM.text,
  },
  sensoryBtnTextSelected: {
    color: CELLARIUM.primary,
  },
  helpText: {
    ...CELLARIUM_TEXT.caption,
    marginTop: 4,
    fontStyle: 'italic',
  },
  actionButtons: {
    marginTop: 14,
    marginBottom: 24,
  },
  saveButton: {
    minHeight: CELLARIUM_LAYOUT.buttonHeight,
    borderRadius: CELLARIUM_LAYOUT.buttonRadius,
    backgroundColor: CELLARIUM.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 4,
  },
  saveButtonDisabled: {
    opacity: 0.6,
    backgroundColor: CELLARIUM.muted,
  },
  saveButtonText: {
    ...CELLARIUM_TEXT.buttonText,
    fontSize: 16,
  },
  savingOverlayRoot: {
    flex: 1,
  },
  feedbackModalFooter: {
    gap: 10,
  },
  feedbackModalMessage: {
    textAlign: 'center',
    marginBottom: 4,
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
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  proCameraCloseButton: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    alignSelf: 'flex-start',
  },
  proCameraCloseText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  proCameraInfo: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 12,
    borderRadius: 14,
    marginTop: 14,
  },
  proCameraInfoText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  proCameraInfoSubtext: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
});

export default WineManagementScreen;



