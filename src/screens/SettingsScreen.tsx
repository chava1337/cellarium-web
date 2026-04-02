import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useAdminGuard } from '../hooks/useAdminGuard';
import { PendingApprovalMessage } from '../components/PendingApprovalMessage';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { CELLARIUM, CELLARIUM_LAYOUT } from '../theme/cellariumTheme';
import { CellariumHeader } from '../components/cellarium';
import { LEGAL_URLS } from '../config/legalUrls';
import { resolveDisplayName } from '../utils/resolveDisplayName';

type SettingsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Settings'>;
type SettingsScreenRouteProp = RouteProp<RootStackParamList, 'Settings'>;

interface Props {
  navigation: SettingsScreenNavigationProp;
  route: SettingsScreenRouteProp;
}

const UI = {
  ...CELLARIUM_LAYOUT,
  cardPadding: 16,
  cardGap: 14,
  buttonRadius: 14,
  inputHeight: 52,
  inputRadius: 14,
} as const;

/** Extrae status y body de FunctionsHttpError de supabase-js (error.context es la Response). */
async function extractFunctionsHttpErrorDetails(
  error: unknown
): Promise<{ status: number; bodyText: string } | null> {
  const err = error as { name?: string; context?: unknown };
  if (err?.name !== 'FunctionsHttpError' || err?.context == null) return null;
  const ctx = err.context as { status?: number; ok?: boolean };
  if (ctx.status === undefined && ctx.ok === undefined) return null;
  const res = err.context as Response;
  if (typeof res.clone !== 'function') return null;
  try {
    const status = res.status;
    const raw = await res.clone().text();
    const bodyText = raw.length > 1000 ? raw.slice(0, 1000) + '... [truncated]' : raw;
    if (__DEV__) {
      console.log('[delete-user-account] (FunctionsHttpError) response.status:', status);
      console.log('[delete-user-account] (FunctionsHttpError) response.body (trunc 1000):', bodyText);
    }
    return { status, bodyText };
  } catch (e) {
    if (__DEV__) console.log('[delete-user-account] extractFunctionsHttpErrorDetails failed:', e);
    return null;
  }
}

async function openExternalLegalUrl(
  url: string,
  errorTitle: string,
  errorMessage: string
): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) {
    Alert.alert(errorTitle, errorMessage);
    return;
  }
  try {
    const supported = await Linking.canOpenURL(trimmed);
    if (!supported) {
      Alert.alert(errorTitle, errorMessage);
      return;
    }
    await Linking.openURL(trimmed);
  } catch {
    Alert.alert(errorTitle, errorMessage);
  }
}

const SettingsScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { status: guardStatus } = useAdminGuard({ navigation, route });
  const { user, session, signOut, profileReady } = useAuth();
  const { t } = useLanguage();
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  if (guardStatus === 'loading' || guardStatus === 'profile_loading') {
    return (
      <View style={styles.guardContainer}>
        <ActivityIndicator size="large" color={CELLARIUM.primary} />
        <Text style={styles.guardLoadingText}>
          {guardStatus === 'profile_loading' ? (t('msg.loading') || 'Cargando perfil…') : ''}
        </Text>
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

  const isOwner = profileReady && user?.role === 'owner';

  const su = session?.user as { user_metadata?: Record<string, unknown>; email?: string } | undefined;
  const displayNameResolved = resolveDisplayName({
    dbName: user?.username,
    metaFullName: typeof su?.user_metadata?.full_name === 'string' ? su.user_metadata.full_name : null,
    metaName: typeof su?.user_metadata?.name === 'string' ? su.user_metadata.name : null,
    email: user?.email ?? su?.email ?? null,
  });

  const handleSignOut = () => {
    Alert.alert(
      t('settings.logout'),
      t('settings.logout_confirm'),
      [
        {
          text: t('btn.cancel'),
          style: 'cancel',
        },
        {
          text: t('settings.logout'),
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
              navigation.reset({
                index: 0,
                routes: [{ name: 'Welcome' }],
              });
            } catch (error: any) {
              Alert.alert(t('msg.error'), `${t('msg.error')}: ${error.message}`);
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    setIsDeleteModalVisible(true);
  };

  const handleConfirmDelete = async () => {
    if (confirmText !== 'CONFIRMAR') {
      Alert.alert(t('msg.error'), 'Debes escribir "CONFIRMAR" en mayúsculas para confirmar');
      return;
    }

    setIsDeleting(true);

    try {
      if (!user) {
        Alert.alert(t('msg.error'), t('msg.error'));
        setIsDeleting(false);
        return;
      }

      // Llamar a Edge Function para eliminar cuenta (con Bearer explícito para evitar regresiones de auth)
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session?.access_token) {
          Alert.alert(t('msg.error'), t('msg.error'));
          setIsDeleting(false);
          return;
        }
        const { data, error } = await supabase.functions.invoke(
          'delete-user-account',
          {
            body: {},
            headers: { authorization: `Bearer ${session.access_token}` },
          }
        );

        if (error) {
          const err = error as Record<string, unknown>;
          if (__DEV__) {
            console.log('[delete-user-account] error.message:', err?.message);
            console.log('[delete-user-account] error.name:', err?.name);
            console.log('[delete-user-account] error.code:', err?.code);
            try {
              const str = JSON.stringify(error, null, 2);
              const safe = str.length > 2000 ? str.slice(0, 2000) + '... [truncated]' : str;
              console.log('[delete-user-account] JSON.stringify(error):', safe);
            } catch (e) {
              console.log('[delete-user-account] JSON.stringify(error) failed:', e);
            }
            console.log('[delete-user-account] Object.keys(error):', Object.keys(err ?? {}));
          }

          let status: number | undefined;
          let bodyText = '';
          const details = await extractFunctionsHttpErrorDetails(error);
          if (details) {
            status = details.status;
            bodyText = details.bodyText;
          } else if (__DEV__) {
            console.log('[delete-user-account] no response in error.context (network/cors/platform block)');
          }

          const first200 = bodyText ? bodyText.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
          const devMessage = __DEV__
            ? `status: ${status ?? 'n/a'}\nbody: ${first200 || '(none)'}\nmessage: ${err?.message ?? 'n/a'}`
            : `${err?.message ?? 'Error desconocido'}`;

          if (status === 409) {
            Alert.alert(
              'No se puede eliminar la cuenta',
              "Primero cancela tu suscripción desde 'Administrar suscripción'. Después podrás eliminar tu cuenta.",
              [
                {
                  text: 'OK',
                  onPress: () => {
                    setIsDeleting(false);
                    setIsDeleteModalVisible(false);
                  },
                },
                {
                  text: 'Ir a Suscripciones',
                  onPress: () => {
                    setIsDeleting(false);
                    setIsDeleteModalVisible(false);
                    navigation.navigate('Subscriptions');
                  },
                },
              ]
            );
            return;
          }

          if (__DEV__) {
            Alert.alert(t('msg.error'), `Error eliminando cuenta:\n${devMessage}`);
          } else {
            Alert.alert(t('msg.error'), `Error eliminando cuenta: ${err?.message ?? 'Error desconocido'}`);
          }

          setIsDeleting(false);
          return;
        }

        if (__DEV__) console.log('[delete-user-account] success data:', data);

        if (data?.success) {
          Alert.alert(
            t('settings.delete_account'),
            data.message || t('settings.delete_success'),
            [
              {
                text: 'OK',
                onPress: async () => {
                  await signOut();
                  navigation.reset({
                    index: 0,
                    routes: [{ name: 'Welcome' }],
                  });
                },
              },
            ]
          );
        } else {
          Alert.alert(
            t('msg.error'),
            data?.message || 'Error desconocido'
          );
          setIsDeleting(false);
        }
      } catch (e) {
        if (__DEV__) console.log('[delete-user-account] caught exception:', e);
        Alert.alert(t('msg.error'), 'Error inesperado');
        setIsDeleting(false);
      }
    } catch (error: any) {
      if (__DEV__) console.error('Error en eliminación:', error);
      Alert.alert(t('msg.error'), t('msg.error'));
      setIsDeleting(false);
    }
  };

  const getDeleteWarningMessage = () => {
    if (isOwner) {
      return t('settings.delete_confirm_owner');
    } else {
      return t('settings.delete_confirm_staff');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <CellariumHeader title={t('settings.title')} />

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.account')}</Text>

          <View style={styles.userInfoRow}>
            <Text style={styles.userInfoLabel}>{t('settings.user')}:</Text>
            <Text style={styles.userInfoValue}>{displayNameResolved}</Text>
          </View>

          <View style={[styles.userInfoRow, styles.userInfoRowLast]}>
            <Text style={styles.userInfoLabel}>{t('settings.role')}:</Text>
            <Text style={styles.userInfoValue}>
              {!profileReady ? (t('msg.loading') || 'Cargando perfil…') :
               user?.role === 'owner' ? 'Owner' :
               user?.role === 'gerente' ? 'Gerente' :
               user?.role === 'sommelier' ? 'Sommelier' :
               user?.role === 'supervisor' ? 'Supervisor' :
               user?.role === 'personal' ? 'Personal' : user?.role || 'N/A'}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.legal_section')}</Text>

          <TouchableOpacity
            style={styles.legalRow}
            onPress={() =>
              openExternalLegalUrl(
                LEGAL_URLS.privacyPolicy,
                t('msg.error'),
                t('settings.link_open_error')
              )
            }
            activeOpacity={0.7}
            accessibilityRole="link"
            accessibilityLabel={t('settings.privacy_policy')}
          >
            <Text style={styles.legalRowLabel}>{t('settings.privacy_policy')}</Text>
            <Text style={styles.legalRowChevron} accessible={false}>
              ›
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.legalRow}
            onPress={() =>
              openExternalLegalUrl(
                LEGAL_URLS.termsOfService,
                t('msg.error'),
                t('settings.link_open_error')
              )
            }
            activeOpacity={0.7}
            accessibilityRole="link"
            accessibilityLabel={t('settings.terms_of_service')}
          >
            <Text style={styles.legalRowLabel}>{t('settings.terms_of_service')}</Text>
            <Text style={styles.legalRowChevron} accessible={false}>
              ›
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.legalRow, styles.legalRowLast]}
            onPress={() =>
              openExternalLegalUrl(LEGAL_URLS.support, t('msg.error'), t('settings.link_open_error'))
            }
            activeOpacity={0.7}
            accessibilityRole="link"
            accessibilityLabel={t('settings.support')}
          >
            <Text style={styles.legalRowLabel}>{t('settings.support')}</Text>
            <Text style={styles.legalRowChevron} accessible={false}>
              ›
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.actions')}</Text>

          <TouchableOpacity
            style={[styles.actionButton, styles.signOutButton]}
            onPress={handleSignOut}
            activeOpacity={0.85}
          >
            <Text style={styles.signOutButtonText}>{t('settings.logout')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={handleDeleteAccount}
            activeOpacity={0.85}
          >
            <Text style={styles.deleteButtonText}>{t('settings.delete_account')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Modal de Confirmación de Eliminación */}
      <Modal
        visible={isDeleteModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          if (!isDeleting) {
            setIsDeleteModalVisible(false);
            setConfirmText('');
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {isOwner ? t('settings.delete_owner_title') : t('settings.delete_staff_title')}
            </Text>
            
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={true}>
              <Text style={styles.modalWarning}>{getDeleteWarningMessage()}</Text>
            </ScrollView>

            <TextInput
              style={styles.confirmInput}
              placeholder={t('settings.confirm_placeholder')}
              value={confirmText}
              onChangeText={setConfirmText}
              autoCapitalize="characters"
              editable={!isDeleting}
              placeholderTextColor={CELLARIUM.muted}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  if (!isDeleting) {
                    setIsDeleteModalVisible(false);
                    setConfirmText('');
                  }
                }}
                disabled={isDeleting}
              >
                <Text style={styles.cancelButtonText}>{t('btn.cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.confirmDeleteButton,
                  (confirmText !== 'CONFIRMAR' || isDeleting) && styles.disabledButton,
                ]}
                onPress={handleConfirmDelete}
                disabled={confirmText !== 'CONFIRMAR' || isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmDeleteButtonText}>{t('btn.delete')}</Text>
                )}
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
  content: {
    flex: 1,
    padding: UI.screenPadding,
    paddingTop: 16,
  },
  section: {
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
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2C2C2C',
    marginBottom: 14,
  },
  userInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: CELLARIUM.border,
  },
  userInfoRowLast: {
    borderBottomWidth: 0,
  },
  userInfoLabel: {
    fontSize: 13,
    color: CELLARIUM.muted,
  },
  userInfoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2C2C2C',
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: CELLARIUM.border,
  },
  legalRowLast: {
    borderBottomWidth: 0,
  },
  legalRowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: CELLARIUM.primary,
  },
  legalRowChevron: {
    fontSize: 20,
    color: CELLARIUM.muted,
    marginLeft: 8,
  },
  actionButton: {
    height: UI.buttonHeight,
    borderRadius: UI.buttonRadius,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutButton: {
    backgroundColor: CELLARIUM.neutralButton,
  },
  signOutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  deleteButton: {
    backgroundColor: CELLARIUM.danger,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
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
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2C2C2C',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalScroll: {
    maxHeight: 280,
    marginBottom: 18,
  },
  modalWarning: {
    fontSize: 14,
    color: CELLARIUM.muted,
    lineHeight: 22,
  },
  confirmInput: {
    height: UI.inputHeight,
    borderWidth: 2,
    borderColor: CELLARIUM.danger,
    borderRadius: UI.inputRadius,
    paddingHorizontal: 14,
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: '600',
    color: '#2C2C2C',
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
  cancelButton: {
    backgroundColor: CELLARIUM.border,
  },
  cancelButtonText: {
    color: '#2C2C2C',
    fontWeight: '600',
    fontSize: 16,
  },
  confirmDeleteButton: {
    backgroundColor: CELLARIUM.danger,
  },
  confirmDeleteButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  disabledButton: {
    opacity: 0.5,
  },
});

export default SettingsScreen;









