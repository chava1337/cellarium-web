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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useAdminGuard } from '../hooks/useAdminGuard';
import { PendingApprovalMessage } from '../components/PendingApprovalMessage';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../config/supabase';

type SettingsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Settings'>;
type SettingsScreenRouteProp = RouteProp<RootStackParamList, 'Settings'>;

interface Props {
  navigation: SettingsScreenNavigationProp;
  route: SettingsScreenRouteProp;
}

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

const SettingsScreen: React.FC<Props> = ({ navigation, route }) => {
  const { status: guardStatus } = useAdminGuard({ navigation, route });
  const { user, signOut, profileReady } = useAuth();
  const { t } = useLanguage();
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  if (guardStatus === 'loading' || guardStatus === 'profile_loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa' }}>
        <ActivityIndicator size="large" color="#8B0000" />
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

  const isOwner = profileReady && user?.role === 'owner';

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

          let status: number | undefined;
          let bodyText = '';
          const details = await extractFunctionsHttpErrorDetails(error);
          if (details) {
            status = details.status;
            bodyText = details.bodyText;
          } else {
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
        console.log('[delete-user-account] caught exception:', e);
        Alert.alert(t('msg.error'), 'Error inesperado');
        setIsDeleting(false);
      }
    } catch (error: any) {
      console.error('Error en eliminación:', error);
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
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>← {t('settings.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('settings.title')}</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.account')}</Text>
          
          <View style={styles.userInfo}>
            <Text style={styles.userInfoLabel}>{t('settings.user')}:</Text>
            <Text style={styles.userInfoValue}>{user?.username || user?.email || 'N/A'}</Text>
          </View>
          
          <View style={styles.userInfo}>
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
          <Text style={styles.sectionTitle}>{t('settings.actions')}</Text>

          <TouchableOpacity
            style={[styles.actionButton, styles.signOutButton]}
            onPress={handleSignOut}
          >
            <Text style={styles.actionButtonText}>🚪 {t('settings.logout')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={handleDeleteAccount}
          >
            <Text style={[styles.actionButtonText, styles.deleteButtonText]}>
              🗑️ {t('settings.delete_account')}
            </Text>
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
              placeholderTextColor="#999"
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
                  <ActivityIndicator color="#fff" />
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
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: 'white',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: '#8B0000',
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8B0000',
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  userInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  userInfoLabel: {
    fontSize: 14,
    color: '#666',
  },
  userInfoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  actionButton: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  signOutButton: {
    backgroundColor: '#6c757d',
  },
  deleteButton: {
    backgroundColor: '#dc3545',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  deleteButtonText: {
    color: 'white',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#dc3545',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalScroll: {
    maxHeight: 300,
    marginBottom: 16,
  },
  modalWarning: {
    fontSize: 14,
    color: '#333',
    lineHeight: 22,
    marginBottom: 16,
  },
  confirmInput: {
    borderWidth: 2,
    borderColor: '#dc3545',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#6c757d',
  },
  cancelButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  confirmDeleteButton: {
    backgroundColor: '#dc3545',
  },
  confirmDeleteButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  disabledButton: {
    opacity: 0.5,
  },
});

export default SettingsScreen;









