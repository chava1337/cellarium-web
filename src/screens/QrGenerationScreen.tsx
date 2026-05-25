import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CellariumHeader, IosHeaderBackSlot } from '../components/cellarium';
import ViewShot from 'react-native-view-shot';
import QRCode from 'react-native-qrcode-svg';
import Share from 'react-native-share';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { useBranch } from '../contexts/BranchContext';
import { useAuth } from '../contexts/AuthContext';
import { generateUniversalQrUrl } from '../services/QrTokenService';
import { createGuestQrToken, generateQrToken, getUserQrTokens, GeneratedQrToken, type GuestQrDuration } from '../services/QrGenerationService';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types';
import { canGenerateGuestQr, canGenerateAdminInviteQr } from '../utils/permissions';
import { isSensitiveAllowed } from '../utils/sensitiveActionGating';
import { CELLARIUM } from '../theme/cellariumTheme';
import { captureCriticalError, sentryFlowBreadcrumb } from '../utils/sentryContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getAppLocaleTag } from '../utils/appLocale';

interface QrData {
  id: string;
  token: string;
  type: 'guest' | 'admin';
  branch_id: string;
  branch_name: string;
  created_at: string;
  expires_at: string;
}

const UI = {
  screenPadding: 16,
  cardRadius: 18,
  cardPadding: 16,
  cardGap: 16,
  segmentedHeight: 54,
  segmentedRadius: 27,
  chipHeight: 44,
  chipRadius: 14,
  buttonHeight: 50,
  buttonRadius: 14,
  secondaryButtonHeight: 46,
  secondaryButtonRadius: 14,
} as const;

const QrGenerationScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList, 'QrGeneration'>>();
  const { currentBranch } = useBranch();
  const { user, profileReady } = useAuth();
  const { t, language } = useLanguage();
  const dateLocale = getAppLocaleTag(language);
  const guestDurationLabels: Record<GuestQrDuration, string> = {
    '1w': t('qr_gen.duration_1w'),
    '2w': t('qr_gen.duration_2w'),
    '1m': t('qr_gen.duration_1m'),
  };
  const qrListTypeLabel = (qr: GeneratedQrToken) => {
    if (qr.type === 'guest') return t('qr_gen.type_guest');
    if (qr.createdByRole === 'owner') return t('qr_gen.type_owner');
    return t('qr_gen.type_admin');
  };
  const [qrType, setQrType] = useState<'guest' | 'admin'>('guest');
  const [guestDuration, setGuestDuration] = useState<GuestQrDuration>('1w');
  const [generatedQrs, setGeneratedQrs] = useState<GeneratedQrToken[]>([]);
  const [selectedQr, setSelectedQr] = useState<GeneratedQrToken | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [qrUrlToShare, setQrUrlToShare] = useState('');
  const [sharingImage, setSharingImage] = useState(false);
  const qrSvgRef = useRef<any>(null);
  const viewShotRef = useRef<any>(null);

  const canGenerateGuest = canGenerateGuestQr(user ?? null, currentBranch?.id ?? null);
  const canGenerateAdmin =
    user?.status === 'active' &&
    canGenerateAdminInviteQr((user?.role ?? 'personal') as 'owner' | 'gerente' | 'sommelier' | 'supervisor' | 'personal');
  const isWrongBranchForStaff = (user?.role === 'gerente' || user?.role === 'supervisor') &&
    currentBranch?.id != null && user?.branch_id != null && currentBranch.id !== user.branch_id;

  useEffect(() => {
    if (!__DEV__ || !user || !profileReady) return;
    console.log('[QR_GUEST_PERM]', {
      role: user.role,
      status: user.status,
      owner_id: user.owner_id ?? null,
      branch_id: user.branch_id ?? null,
      selectedBranchId: currentBranch?.id ?? null,
      canGenerateGuest,
      isWrongBranchForStaff,
    });
  }, [user?.role, user?.status, user?.owner_id, user?.branch_id, currentBranch?.id, canGenerateGuest, isWrongBranchForStaff, profileReady]);

  const loadUserTokens = useCallback(async () => {
    if (!user?.id) return;
    setLoadingTokens(true);
    try {
      const tokens = await getUserQrTokens(user.id);
      setGeneratedQrs(tokens);
    } catch (error) {
      console.error('Error loading user tokens:', error);
      Alert.alert(t('msg.error'), t('qr_gen.error_load'));
    } finally {
      setLoadingTokens(false);
    }
  }, [user?.id, t]);

  useEffect(() => {
    if (user?.id) loadUserTokens();
  }, [user?.id, loadUserTokens]);

  // Supervisor solo tiene guest: mantener pestaña en guest para no mostrar contenido admin
  useEffect(() => {
    if (!canGenerateAdmin && qrType === 'admin') setQrType('guest');
  }, [canGenerateAdmin, qrType]);

  if (!profileReady) {
    return (
      <View style={[styles.guardContainer, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={CELLARIUM.primary} />
      </View>
    );
  }

  const canEnterQrScreen = user && (
    canGenerateGuestQr(user, currentBranch?.id ?? null) ||
    canGenerateAdminInviteQr((user.role ?? 'personal') as 'owner' | 'gerente' | 'sommelier' | 'supervisor' | 'personal')
  );
  if (!user || !canEnterQrScreen) {
    return (
      <View style={[styles.guardContainer, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <Text style={styles.guardTitle}>{t('qr_gen.guard_title')}</Text>
        <Text style={styles.guardSubtitle}>{t('qr_gen.guard_subtitle')}</Text>
      </View>
    );
  }

  const handleGenerateGuestQr = async () => {
    if (!currentBranch || !user?.id) {
      Alert.alert(t('msg.error'), t('qr_gen.error_no_branch'));
      return;
    }
    if (!isSensitiveAllowed(user)) {
      Alert.alert(t('qr_gen.verify_required_title'), t('qr_gen.verify_required_body'), [
        { text: t('btn.cancel'), style: 'cancel' },
        {
          text: t('qr_gen.go_subscriptions'),
          onPress: () => navigation.navigate('Subscriptions', { openVerifyEmail: true }),
        },
      ]);
      return;
    }
    if (!canGenerateGuest || isWrongBranchForStaff) {
      Alert.alert(t('msg.error'), t('qr_gen.error_no_permission_branch'));
      return;
    }

    setLoading(true);
    try {
      const newQr = await createGuestQrToken(currentBranch.id, guestDuration, 100);

      setGeneratedQrs(prev => [newQr, ...prev]);
      setSelectedQr(newQr);
      Alert.alert(
        t('qr_gen.generated_title'),
        t('qr_gen.generated_guest_body')
          .replace('{branch}', currentBranch.name)
          .replace('{duration}', guestDurationLabels[guestDuration])
      );
    } catch (error: any) {
      if (__DEV__) {
        console.warn('[QR Guest] create failed', {
          userId: user?.id,
          ownerId: user?.owner_id,
          role: user?.role,
          status: user?.status,
          branch_id: currentBranch?.id,
          errorMessage: error?.message ?? String(error),
        });
      }
      console.error('Error generating guest QR:', error);
      Alert.alert(t('msg.error'), t('qr_gen.error_guest'));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAdminQr = async () => {
    if (!currentBranch || !user?.id) {
      Alert.alert(t('msg.error'), t('qr_gen.error_no_branch'));
      return;
    }
    if (!isSensitiveAllowed(user)) {
      Alert.alert(t('qr_gen.verify_required_title'), t('qr_gen.verify_required_body'), [
        { text: t('btn.cancel'), style: 'cancel' },
        {
          text: t('qr_gen.go_subscriptions'),
          onPress: () => navigation.navigate('Subscriptions', { openVerifyEmail: true }),
        },
      ]);
      return;
    }
    if (!canGenerateAdmin || isWrongBranchForStaff) {
      Alert.alert(t('msg.error'), t('qr_gen.error_no_permission_branch'));
      return;
    }

    const ownerId = user.owner_id ?? user.id;
    setLoading(true);
    try {
      const newQr = await generateQrToken({
        type: 'admin_invite',
        branchId: currentBranch.id,
        createdBy: user.id,
        ownerId,
        expiresInHours: 24 * 7, // 7 días
        maxUses: 1, // Uso único para admin
      });

      setGeneratedQrs(prev => [newQr, ...prev]);
      setSelectedQr(newQr);
      Alert.alert(
        t('qr_gen.generated_title'),
        t('qr_gen.generated_admin_body').replace('{branch}', currentBranch.name)
      );
    } catch (error: any) {
      if (__DEV__) {
        console.warn('[QR Admin] create failed', {
          userId: user.id,
          ownerId: user.owner_id,
          role: user.role,
          status: user.status,
          branch_id: currentBranch.id,
          owner_id_sent: ownerId,
          errorMessage: error?.message ?? String(error),
        });
      }
      console.error('Error generating admin QR:', error);
      if (user.role === 'sommelier' || user.role === 'supervisor' || user.role === 'personal') {
        Alert.alert(
          t('qr_gen.insufficient_title'),
          `${t('qr_gen.restricted_admin_body')}\n\n${t('qr_gen.restricted_admin_body2')}`
        );
      } else {
        Alert.alert(t('msg.error'), t('qr_gen.error_admin'));
      }
    } finally {
      setLoading(false);
    }
  };

  const getQrUrl = useCallback(() => {
    if (!selectedQr) return '';
    return generateUniversalQrUrl({
      type: selectedQr.type === 'admin_invite' ? 'admin' : selectedQr.type,
      token: selectedQr.token,
      branchId: selectedQr.branchId,
      branchName: selectedQr.branchName,
    });
  }, [selectedQr]);

  const getShareMessage = useCallback(() => {
    if (!selectedQr) return '';
    const guestExpiryLabel =
      selectedQr.type === 'guest' && selectedQr.expiresAt
        ? `${t('qr_gen.valid_until')} ${new Date(selectedQr.expiresAt).toLocaleDateString(dateLocale, { dateStyle: 'long' })}`
        : t('qr_gen.valid_temporarily');
    return selectedQr.type === 'guest'
      ? t('qr_gen.share_message_guest')
          .replace('{branch}', selectedQr.branchName ?? '')
          .replace('{expiry}', guestExpiryLabel)
      : t('qr_gen.share_message_admin').replace('{branch}', selectedQr.branchName ?? '');
  }, [selectedQr, t, dateLocale]);

  const handleShareAsImage = async () => {
    if (!selectedQr) return;

    const qrUrl = getQrUrl();
    if (Platform.OS === 'web') {
      setQrUrlToShare(qrUrl);
      setShareModalVisible(true);
      return;
    }

    setSharingImage(true);
    sentryFlowBreadcrumb('qr_share_image_start', {
      qr_type: selectedQr.type,
      branch_id: user?.branch_id ?? currentBranch?.id ?? 'none',
    });
    try {
      let fileUri: string | null = null;

      if (viewShotRef.current?.capture) {
        try {
          const path = await viewShotRef.current.capture();
          fileUri = path?.startsWith('file://') ? path : path ? `file://${path}` : null;
        } catch (_) {
          fileUri = null;
        }
      }

      if (!fileUri) {
        const svg = qrSvgRef.current;
        if (!svg || typeof svg.toDataURL !== 'function') {
          throw new Error('QR no listo');
        }
        const dataURL: string = await new Promise((resolve, reject) => {
          svg.toDataURL((data: string) => {
            if (data) resolve(data);
            else reject(new Error('No se pudo generar la imagen del QR'));
          });
        });
        const base64 = dataURL.startsWith('data:image')
          ? dataURL.replace(/^data:image\/\w+;base64,/, '')
          : dataURL;
        const filename = `cellarium-qr-${Date.now()}.png`;
        fileUri = `${FileSystem.cacheDirectory}${filename}`;

        // TEMP: validar carga del módulo legacy en runtime (eliminar tras QA)
        console.log('[QR FS CHECK]', {
          hasCacheDirectory: !!FileSystem.cacheDirectory,
          hasWriteAsStringAsync: typeof FileSystem.writeAsStringAsync === 'function',
          hasEncodingType: !!FileSystem.EncodingType,
          hasBase64: !!FileSystem.EncodingType?.Base64,
        });

        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      const isSharingAvailable = await Sharing.isAvailableAsync();
      if (!isSharingAvailable) {
        throw new Error('Compartir no disponible');
      }

      await Sharing.shareAsync(fileUri, {
        mimeType: 'image/png',
        dialogTitle: t('qr_gen.share_dialog_title'),
      });

      try {
        if (
          fileUri &&
          FileSystem.cacheDirectory &&
          fileUri.startsWith(FileSystem.cacheDirectory)
        ) {
          await FileSystem.deleteAsync(fileUri, { idempotent: true });
        }
      } catch (_) {}
    } catch (error: any) {
      if (error?.message === 'User did not share') {
        return;
      }
      captureCriticalError(error, {
        feature: 'qr_share_image',
        screen: 'QrGeneration',
        app_area: 'qr',
        branch_id: user?.branch_id ?? currentBranch?.id ?? 'none',
        qr_type: selectedQr.type,
      });
      setQrUrlToShare(qrUrl);
      setShareModalVisible(true);
      Alert.alert(
        t('qr_gen.share_fallback_title'),
        t('qr_gen.share_fallback_body'),
        [{ text: t('subscription.alert_ok') }]
      );
    } finally {
      setSharingImage(false);
    }
  };

  const handleCopyLink = async () => {
    if (!selectedQr) return;
    const url = getQrUrl();
    await Clipboard.setStringAsync(url);
    Alert.alert(t('qr_gen.link_copied_title'), t('qr_gen.link_copied_body'));
  };

  const handleCopyMessage = async () => {
    if (!selectedQr) return;
    const msg = getShareMessage();
    await Clipboard.setStringAsync(msg);
    Alert.alert(t('qr_gen.message_copied_title'), t('qr_gen.message_copied_body'));
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <CellariumHeader
        title={t('qr_gen.title')}
        subtitle={currentBranch?.name?.trim() ? currentBranch.name : undefined}
        leftSlot={<IosHeaderBackSlot navigation={navigation} fallbackRoute="AdminDashboard" />}
      />

      <ScrollView style={styles.content}>
        {/* Selector de tipo de QR: solo se muestran las opciones permitidas por rol */}
        <View style={styles.typeSelectorOuter}>
          <View style={styles.typeSelectorInner}>
            {canGenerateGuest && (
              <TouchableOpacity
                style={[styles.typeButton, qrType === 'guest' && styles.typeButtonActive]}
                onPress={() => setQrType('guest')}
                activeOpacity={0.85}
              >
                <Text style={[styles.typeButtonText, qrType === 'guest' && styles.typeButtonTextActive]}>
                  {t('qr_gen.tab_guest')}
                </Text>
              </TouchableOpacity>
            )}
            {canGenerateAdmin && (
              <TouchableOpacity
                style={[styles.typeButton, qrType === 'admin' && styles.typeButtonActive]}
                onPress={() => setQrType('admin')}
                activeOpacity={0.85}
              >
                <Text style={[styles.typeButtonText, qrType === 'admin' && styles.typeButtonTextActive]}>
                  {t('qr_gen.tab_admin')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Información del tipo de QR seleccionado */}
        <View style={styles.infoCard}>
          {qrType === 'guest' ? (
            <>
              <Text style={styles.infoText}>
                {t('qr_gen.guest_info')}
              </Text>
              {/* Selector de duración: 1w / 2w / 1m */}
              <View style={styles.durationSelector}>
                {(['1w', '2w', '1m'] as const).map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[
                      styles.durationOption,
                      guestDuration === d && styles.durationOptionActive,
                    ]}
                    onPress={() => setGuestDuration(d)}
                  >
                    <Text style={[
                      styles.durationOptionText,
                      guestDuration === d && styles.durationOptionTextActive,
                    ]}>
                      {guestDurationLabels[d]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {isWrongBranchForStaff ? (
                <View style={styles.restrictedAccessCard}>
                  <Text style={styles.restrictedAccessTitle}>{t('qr_gen.branch_not_assigned_title')}</Text>
                  <Text style={styles.restrictedAccessText}>{t('qr_gen.branch_not_assigned_body')}</Text>
                </View>
              ) : !canGenerateGuest ? (
                <View style={styles.restrictedAccessCard}>
                  <Text style={styles.restrictedAccessTitle}>{t('qr_gen.no_permission_title')}</Text>
                  <Text style={styles.restrictedAccessText}>{t('qr_gen.no_permission_guest_body')}</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.generateButton, loading && styles.generateButtonDisabled]}
                  onPress={handleGenerateGuestQr}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.generateButtonText}>{t('qr_gen.generate_guest')}</Text>
                  )}
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              <Text style={styles.infoText}>
                {t('qr_gen.admin_info')}
              </Text>
              {isWrongBranchForStaff ? (
                <View style={styles.restrictedAccessCard}>
                  <Text style={styles.restrictedAccessTitle}>{t('qr_gen.branch_not_assigned_title')}</Text>
                  <Text style={styles.restrictedAccessText}>{t('qr_gen.branch_not_assigned_body')}</Text>
                </View>
              ) : canGenerateAdmin ? (
                <TouchableOpacity
                  style={[styles.generateButton, loading && styles.generateButtonDisabled]}
                  onPress={handleGenerateAdminQr}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.generateButtonText}>{t('qr_gen.generate_admin')}</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={styles.restrictedAccessCard}>
                  <Text style={styles.restrictedAccessTitle}>{t('qr_gen.restricted_title')}</Text>
                  <Text style={styles.restrictedAccessText}>{t('qr_gen.restricted_admin_body')}</Text>
                  <Text style={styles.restrictedAccessText}>{t('qr_gen.restricted_admin_body2')}</Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* Mostrar QR generado */}
        {selectedQr && (
          <View style={styles.qrDisplayCard}>
            <ViewShot
              ref={viewShotRef}
              options={{ format: 'png', quality: 1, result: 'tmpfile' }}
              style={styles.shareCardContainer}
            >
              <View style={styles.shareCardInner}>
                <Text style={styles.shareCardTitle}>
                  {selectedQr.type === 'guest'
                    ? t('qr_gen.share_title_guest')
                    : t('qr_gen.share_title_admin')}
                </Text>
                <Text style={styles.shareCardSubtitle}>
                  {selectedQr.branchName || t('qr_gen.branch_fallback')}
                </Text>
                <Text style={styles.shareCardExpiry}>
                  {t('qr_gen.valid_until')}{' '}
                  {selectedQr.expiresAt
                    ? new Date(selectedQr.expiresAt).toLocaleString(dateLocale, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—'}
                </Text>
                <View style={styles.qrContainerShare}>
                  <QRCode
                    getRef={(c: any) => { qrSvgRef.current = c; }}
                    value={generateUniversalQrUrl({
                      type: selectedQr.type === 'admin_invite' ? 'admin' : selectedQr.type,
                      token: selectedQr.token,
                      branchId: selectedQr.branchId,
                      branchName: selectedQr.branchName,
                    })}
                    size={240}
                    color={CELLARIUM.primary}
                    backgroundColor="white"
                  />
                </View>
              </View>
            </ViewShot>

            <Text style={styles.qrDisplayTitle}>
              {selectedQr.type === 'guest' ? t('qr_gen.display_guest') : t('qr_gen.display_admin')}
            </Text>

            <View style={styles.qrInfoContainer}>
              <Text style={styles.qrInfoLabel}>{t('qr_gen.label_branch')}</Text>
              <Text style={styles.qrInfoValue}>
                {selectedQr.branchName || t('qr_gen.not_specified')}
              </Text>
            </View>

            <View style={styles.qrInfoContainer}>
              <Text style={styles.qrInfoLabel}>{t('qr_gen.label_expires')}</Text>
              <Text style={styles.qrInfoValue}>
                {selectedQr.expiresAt 
                  ? new Date(selectedQr.expiresAt).toLocaleString(dateLocale, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  : t('qr_gen.expires_not_specified')}
              </Text>
            </View>
            
            {selectedQr.type === 'admin_invite' && (
              <View style={styles.warningContainer}>
                <Text style={styles.warningText}>
                  {t('qr_gen.admin_branch_warning').replace('{branch}', selectedQr.branchName ?? '')}
                </Text>
              </View>
            )}

            <View style={styles.qrActions}>
              <TouchableOpacity
                style={[styles.shareButton, styles.shareButtonPrimary]}
                onPress={handleShareAsImage}
                disabled={sharingImage}
                activeOpacity={0.85}
              >
                {sharingImage ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.shareButtonText}>{t('qr_gen.share_qr_image')}</Text>
                )}
              </TouchableOpacity>
              <View style={styles.qrActionsRow}>
                <TouchableOpacity
                  style={[styles.shareButton, styles.shareButtonSecondary]}
                  onPress={handleCopyLink}
                  activeOpacity={0.85}
                >
                  <Text style={styles.shareButtonTextSecondary}>{t('qr_gen.copy_link')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.shareButton, styles.shareButtonSecondary]}
                  onPress={handleCopyMessage}
                  activeOpacity={0.85}
                >
                  <Text style={styles.shareButtonTextSecondary}>{t('qr_gen.copy_message')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Lista de QRs generados */}
        {generatedQrs.length > 0 && (
          <View style={styles.qrListCard}>
            <Text style={styles.listTitle}>{t('qr_gen.list_title')} ({generatedQrs.length})</Text>
            {generatedQrs.map((qr) => (
              <TouchableOpacity
                key={qr.id}
                style={[
                  styles.qrListItem,
                  selectedQr?.id === qr.id && styles.qrListItemActive
                ]}
                onPress={() => setSelectedQr(qr)}
                activeOpacity={0.85}
              >
                <View style={styles.qrListInfo}>
                  <Text style={styles.qrListType}>{qrListTypeLabel(qr)}</Text>
                  <Text style={styles.qrListDate}>
                    {new Date(qr.createdAt).toLocaleString(dateLocale)}
                  </Text>
                  {qr.createdByName && (
                    <Text style={styles.qrListCreator}>
                      {qr.createdByName}
                    </Text>
                  )}
                  {!qr.createdByName && qr.createdByEmail && (
                    <Text style={styles.qrListCreator}>
                      {qr.createdByEmail}
                    </Text>
                  )}
                </View>
                <Text style={styles.qrListArrow}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Modal para compartir enlace */}
      <Modal
        visible={shareModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShareModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('qr_gen.share_modal_title')}</Text>
            <Text style={styles.modalSubtitle}>{t('qr_gen.share_modal_subtitle')}</Text>
            
            <TextInput
              style={styles.modalInput}
              value={qrUrlToShare}
              selectTextOnFocus={true}
              editable={false}
              multiline={true}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => setShareModalVisible(false)}
              >
                <Text style={styles.modalButtonTextSecondary}>{t('qr_gen.close')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={async () => {
                  if (qrUrlToShare) await Clipboard.setStringAsync(qrUrlToShare);
                  setShareModalVisible(false);
                  Alert.alert(t('qr_gen.link_copied_title'), t('qr_gen.link_copied_body'));
                }}
              >
                <Text style={styles.modalButtonTextPrimary}>{t('qr_gen.copy_link_btn')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    backgroundColor: CELLARIUM.bg,
  },
  guardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C2C2C',
    textAlign: 'center',
  },
  guardSubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: CELLARIUM.muted,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  content: {
    flex: 1,
    padding: UI.screenPadding,
  },
  typeSelectorOuter: {
    marginBottom: UI.cardGap,
    height: UI.segmentedHeight,
    borderRadius: UI.segmentedRadius,
    backgroundColor: CELLARIUM.card,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  typeSelectorInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: '100%',
    paddingHorizontal: 6,
  },
  typeButton: {
    flex: 1,
    paddingHorizontal: 8,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: 'rgba(146,64,72,0.12)',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: CELLARIUM.muted,
    textAlign: 'center',
  },
  typeButtonTextActive: {
    color: CELLARIUM.primary,
  },
  infoCard: {
    backgroundColor: CELLARIUM.card,
    borderRadius: UI.cardRadius,
    padding: UI.cardPadding,
    marginBottom: UI.cardGap,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  infoText: {
    fontSize: 14,
    color: CELLARIUM.muted,
    lineHeight: 20,
    marginBottom: 16,
  },
  durationSelector: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  durationOption: {
    flex: 1,
    height: UI.chipHeight,
    borderRadius: UI.chipRadius,
    backgroundColor: CELLARIUM.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationOptionActive: {
    backgroundColor: CELLARIUM.primary,
  },
  durationOptionText: {
    fontSize: 14,
    color: '#2C2C2C',
    fontWeight: '600',
  },
  durationOptionTextActive: {
    color: '#fff',
  },
  generateButton: {
    backgroundColor: CELLARIUM.primary,
    borderRadius: UI.buttonRadius,
    height: UI.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateButtonDisabled: {
    backgroundColor: CELLARIUM.muted,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  qrDisplayCard: {
    backgroundColor: CELLARIUM.card,
    borderRadius: UI.cardRadius,
    padding: UI.cardPadding,
    marginBottom: UI.cardGap,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  shareCardContainer: {
    alignSelf: 'stretch',
    marginBottom: 20,
  },
  shareCardInner: {
    backgroundColor: CELLARIUM.card,
    padding: 24,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: CELLARIUM.primary,
    alignItems: 'center',
  },
  shareCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2C2C2C',
    marginBottom: 6,
    textAlign: 'center',
  },
  shareCardSubtitle: {
    fontSize: 14,
    color: CELLARIUM.muted,
    marginBottom: 4,
    textAlign: 'center',
  },
  shareCardExpiry: {
    fontSize: 12,
    color: CELLARIUM.muted,
    marginBottom: 16,
    textAlign: 'center',
  },
  qrContainerShare: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: CELLARIUM.border,
  },
  qrDisplayTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2C2C2C',
    marginBottom: 16,
    textAlign: 'center',
  },
  qrInfoContainer: {
    width: '100%',
    marginBottom: 10,
  },
  qrInfoLabel: {
    fontSize: 12,
    color: CELLARIUM.muted,
    fontWeight: '600',
    marginBottom: 2,
  },
  qrInfoValue: {
    fontSize: 13,
    color: '#2C2C2C',
  },
  warningContainer: {
    backgroundColor: 'rgba(255,193,7,0.15)',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,193,7,0.4)',
  },
  warningText: {
    fontSize: 12,
    color: '#856404',
    textAlign: 'center',
    fontWeight: '600',
  },
  qrActions: {
    width: '100%',
    marginTop: 16,
    gap: 12,
  },
  qrActionsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  shareButton: {
    borderRadius: UI.secondaryButtonRadius,
    height: UI.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareButtonPrimary: {
    backgroundColor: CELLARIUM.primary,
    width: '100%',
  },
  shareButtonSecondary: {
    height: UI.secondaryButtonHeight,
    backgroundColor: CELLARIUM.border,
    flex: 1,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  shareButtonTextSecondary: {
    color: '#2C2C2C',
    fontSize: 14,
    fontWeight: '600',
  },
  qrListCard: {
    backgroundColor: CELLARIUM.card,
    borderRadius: UI.cardRadius,
    padding: UI.cardPadding,
    marginBottom: UI.cardGap,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  listTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2C2C2C',
    marginBottom: 14,
  },
  qrListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    backgroundColor: CELLARIUM.bg,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  qrListItemActive: {
    backgroundColor: 'rgba(146,64,72,0.08)',
    borderColor: CELLARIUM.primary,
  },
  qrListInfo: {
    flex: 1,
  },
  qrListType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2C2C2C',
    marginBottom: 2,
  },
  qrListDate: {
    fontSize: 12,
    color: CELLARIUM.muted,
  },
  qrListCreator: {
    fontSize: 11,
    color: CELLARIUM.muted,
    marginTop: 2,
  },
  qrListArrow: {
    fontSize: 20,
    color: CELLARIUM.muted,
    fontWeight: '300',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: CELLARIUM.card,
    borderRadius: UI.cardRadius,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2C2C2C',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: CELLARIUM.muted,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: CELLARIUM.bg,
    borderRadius: 14,
    padding: 14,
    fontSize: 13,
    color: '#2C2C2C',
    borderWidth: 1,
    borderColor: CELLARIUM.border,
    marginBottom: 20,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    height: UI.buttonHeight,
    borderRadius: UI.buttonRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: CELLARIUM.primary,
  },
  modalButtonSecondary: {
    backgroundColor: CELLARIUM.border,
  },
  modalButtonTextPrimary: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  modalButtonTextSecondary: {
    color: '#2C2C2C',
    fontSize: 16,
    fontWeight: '600',
  },
  restrictedAccessCard: {
    backgroundColor: 'rgba(255,193,7,0.12)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,193,7,0.35)',
    marginTop: 12,
  },
  restrictedAccessTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#856404',
    marginBottom: 8,
    textAlign: 'center',
  },
  restrictedAccessText: {
    fontSize: 13,
    color: '#856404',
    lineHeight: 18,
    marginBottom: 4,
    textAlign: 'center',
  },
});

export default QrGenerationScreen;
