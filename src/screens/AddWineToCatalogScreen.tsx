import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { useLanguage } from '../contexts/LanguageContext';
import { addWineToUserCatalog, getBilingualValue } from '../services/GlobalWineCatalogService';
import { mapSupabaseErrorToUi } from '../utils/supabaseErrorMapper';
import {
  CELLARIUM,
  CELLARIUM_LAYOUT,
  CELLARIUM_TEXT,
} from '../theme/cellariumTheme';
import {
  CellariumHeader,
  CellariumCard,
  CellariumModal,
  CellariumPrimaryButton,
  CellariumSecondaryButton,
  CellariumTextField,
} from '../components/cellarium';

type Props = StackScreenProps<RootStackParamList, 'AddWineToCatalog'>;

type DialogState = {
  title: string;
  message: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

const AddWineToCatalogScreen: React.FC<Props> = ({ route, navigation }) => {
  const { wine } = route.params;
  const { user, profileReady } = useAuth();
  const { currentBranch } = useBranch();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const [priceBottle, setPriceBottle] = useState('');
  const [priceGlass, setPriceGlass] = useState('');
  const [stock, setStock] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hasWarnedForBranchName, setHasWarnedForBranchName] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const wineDisplayName =
    getBilingualValue(wine.label) || getBilingualValue(wine.winery) || 'Vino';

  const showDialog = useCallback((config: DialogState) => {
    setDialog(config);
  }, []);

  const dismissDialog = useCallback(() => {
    setDialog(null);
  }, []);

  useEffect(() => {
    if (hasWarnedForBranchName) return;

    const branchName = currentBranch?.name?.trim();
    if (branchName) return;

    setHasWarnedForBranchName(true);

    const isOwner = user?.role === 'owner';
    const title = 'Nombre del restaurante requerido';
    const message = isOwner
      ? 'Antes de agregar vinos debes definir el nombre de tu restaurante o centro de consumo. Puedes editarlo desde Gestión de Sucursales.'
      : 'El owner debe definir el nombre del restaurante o centro de consumo antes de agregar vinos. Contacta al responsable para que lo configure.';

    if (isOwner) {
      showDialog({
        title,
        message,
        primaryLabel: 'Configurar ahora',
        onPrimary: () => {
          dismissDialog();
          navigation.replace('BranchManagement');
        },
        secondaryLabel: 'Volver',
        onSecondary: () => {
          dismissDialog();
          navigation.goBack();
        },
      });
    } else {
      showDialog({
        title,
        message,
        primaryLabel: 'Entendido',
        onPrimary: () => {
          dismissDialog();
          navigation.goBack();
        },
      });
    }
  }, [currentBranch, dismissDialog, hasWarnedForBranchName, navigation, showDialog, user?.role]);

  const onSubmit = async () => {
    if (!user || !profileReady || !currentBranch) {
      showDialog({
        title: 'Error',
        message: 'Usuario o sucursal no identificados',
        primaryLabel: t('btn.close'),
        onPrimary: dismissDialog,
      });
      return;
    }

    const branchName = currentBranch.name?.trim();
    if (!branchName) {
      const isOwner = user.role === 'owner';
      if (isOwner) {
        showDialog({
          title: 'Nombre del restaurante requerido',
          message:
            'Define el nombre de tu restaurante o centro de consumo antes de agregar vinos.',
          primaryLabel: 'Ir a Gestión',
          onPrimary: () => {
            dismissDialog();
            navigation.replace('BranchManagement');
          },
          secondaryLabel: 'Cancelar',
          onSecondary: dismissDialog,
        });
      } else {
        showDialog({
          title: 'Nombre del restaurante requerido',
          message:
            'Contacta al owner para que defina el nombre del restaurante o centro de consumo.',
          primaryLabel: 'Entendido',
          onPrimary: dismissDialog,
        });
      }
      return;
    }

    const tenantId = user.owner_id || user.id;
    const bottle = priceBottle ? Number(priceBottle) : undefined;
    const glass = priceGlass ? Number(priceGlass) : undefined;
    const qty = stock ? Number(stock) : undefined;

    if (bottle != null && isNaN(bottle)) {
      showDialog({
        title: 'Dato inválido',
        message: 'Precio por botella no es un número',
        primaryLabel: t('btn.close'),
        onPrimary: dismissDialog,
      });
      return;
    }
    if (glass != null && isNaN(glass)) {
      showDialog({
        title: 'Dato inválido',
        message: 'Precio por copa no es un número',
        primaryLabel: t('btn.close'),
        onPrimary: dismissDialog,
      });
      return;
    }
    if (qty != null && isNaN(qty)) {
      showDialog({
        title: 'Dato inválido',
        message: 'Stock debe ser un número',
        primaryLabel: t('btn.close'),
        onPrimary: dismissDialog,
      });
      return;
    }

    try {
      setSubmitting(true);
      await addWineToUserCatalog({
        tenantId,
        branchId: currentBranch.id,
        userId: user.id,
        canonicalWineId: wine.id,
        price: bottle,
        priceGlass: glass,
        initialQty: qty,
        canonicalWine: wine,
      });

      showDialog({
        title: 'Vino agregado',
        message: 'Se agregó correctamente al catálogo.',
        primaryLabel: 'OK',
        onPrimary: () => {
          dismissDialog();
          navigation.goBack();
        },
      });
    } catch (e: unknown) {
      if (__DEV__) console.error('add wine error', e);

      const errorUi = mapSupabaseErrorToUi(e, t);

      if (errorUi.ctaAction === 'subscriptions' && errorUi.ctaLabel) {
        showDialog({
          title: errorUi.title,
          message: errorUi.message,
          primaryLabel: t('btn.close'),
          onPrimary: dismissDialog,
          secondaryLabel: errorUi.ctaLabel,
          onSecondary: () => {
            dismissDialog();
            navigation.navigate('Subscriptions');
          },
        });
      } else {
        showDialog({
          title: errorUi.title,
          message: errorUi.message,
          primaryLabel: t('btn.close'),
          onPrimary: dismissDialog,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const dialogFooter =
    dialog == null ? null : (
      <View style={styles.modalFooter}>
        {dialog.secondaryLabel && dialog.onSecondary ? (
          <CellariumSecondaryButton
            title={dialog.secondaryLabel}
            onPress={dialog.onSecondary}
            variant="outline"
          />
        ) : null}
        <CellariumPrimaryButton title={dialog.primaryLabel} onPress={dialog.onPrimary} />
      </View>
    );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <CellariumHeader
        title="Agregar al Catálogo"
        subtitle={wineDisplayName}
        leftSlot={
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={t('btn.back') || 'Volver'}
          >
            <Ionicons name="chevron-back" size={26} color={CELLARIUM.textOnDark} />
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 24) + CELLARIUM_LAYOUT.sectionGap },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <CellariumCard style={styles.card}>
            <CellariumTextField
              label="Precio por botella"
              placeholder="Ej. 450"
              keyboardType="numeric"
              value={priceBottle}
              onChangeText={setPriceBottle}
              containerStyle={styles.field}
            />
            <CellariumTextField
              label="Precio por copa (opcional)"
              placeholder="Ej. 120"
              keyboardType="numeric"
              value={priceGlass}
              onChangeText={setPriceGlass}
              containerStyle={styles.field}
            />
            <CellariumTextField
              label="Stock inicial (opcional)"
              placeholder="Ej. 6"
              keyboardType="numeric"
              value={stock}
              onChangeText={setStock}
              containerStyle={styles.field}
            />

            <View style={styles.actions}>
              <View style={styles.actionHalf}>
                <CellariumSecondaryButton
                  title="Cancelar"
                  onPress={() => navigation.goBack()}
                  disabled={submitting}
                  variant="neutral"
                />
              </View>
              <View style={styles.actionHalf}>
                <CellariumPrimaryButton
                  title={submitting ? 'Guardando…' : 'Guardar'}
                  onPress={onSubmit}
                  disabled={submitting}
                  loading={submitting}
                />
              </View>
            </View>
          </CellariumCard>
        </ScrollView>
      </KeyboardAvoidingView>

      <CellariumModal
        visible={dialog != null}
        onRequestClose={dismissDialog}
        title={dialog?.title}
        scrollable={false}
        contentPaddingBottom={insets.bottom}
        footer={dialogFooter}
      >
        {dialog ? (
          <Text style={[CELLARIUM_TEXT.body, styles.modalMessage]}>{dialog.message}</Text>
        ) : null}
      </CellariumModal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: CELLARIUM.bg,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: CELLARIUM_LAYOUT.screenPadding,
    paddingTop: CELLARIUM_LAYOUT.sectionGap,
  },
  card: {
    marginBottom: CELLARIUM_LAYOUT.sectionGap,
  },
  field: {
    marginBottom: CELLARIUM_LAYOUT.sectionGap,
  },
  actions: {
    flexDirection: 'row',
    marginTop: CELLARIUM_LAYOUT.sectionGap,
    gap: 12,
  },
  actionHalf: {
    flex: 1,
    minWidth: 0,
  },
  modalFooter: {
    gap: 10,
  },
  modalMessage: {
    textAlign: 'center',
    marginBottom: 4,
  },
});

export default AddWineToCatalogScreen;
