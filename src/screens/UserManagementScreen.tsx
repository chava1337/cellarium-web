import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, User, UserRole } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useBranch } from '../contexts/BranchContext';
import { canApproveRole, getRoleName, getAssignableRoles, canManageUsers } from '../utils/permissions';
import { supabase } from '../lib/supabase';
import { mapSupabaseErrorToUi } from '../utils/supabaseErrorMapper';

/**
 * Gestión de Usuarios usa exclusivamente RPCs SECURITY DEFINER:
 * - list_manageable_users() para carga
 * - approve_staff_request_managed(uuid, text) para aprobar
 * - reject_staff_request_managed(uuid) para rechazar
 * - change_staff_role_managed(uuid, text) para cambiar rol
 * Eliminar staff: Edge Function hard-delete-staff (hard delete en public + auth.users).
 * No hay select/update/delete directo a public.users para estos flujos.
 */

type UserManagementScreenNavigationProp = StackNavigationProp<RootStackParamList, 'UserManagement'>;

interface Props {
  navigation: UserManagementScreenNavigationProp;
}

const UserManagementScreen: React.FC<Props> = ({ navigation }) => {
  const { user, profileReady } = useAuth();
  const { t } = useLanguage();
  const { currentBranch } = useBranch();
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [activeUsers, setActiveUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isChangeRoleModalVisible, setIsChangeRoleModalVisible] = useState(false);
  const [approvingUserId, setApprovingUserId] = useState<string | null>(null);
  const [rejectingUserId, setRejectingUserId] = useState<string | null>(null);
  // Modal de aprobación (evita límite de 3 botones de Alert en Android)
  const [approvalRoleModalVisible, setApprovalRoleModalVisible] = useState(false);
  const [userPendingApproval, setUserPendingApproval] = useState<User | null>(null);
  const [approvalAssignableRoles, setApprovalAssignableRoles] = useState<UserRole[]>([]);
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [changingRoleUserId, setChangingRoleUserId] = useState<string | null>(null);

  const loadUsers = React.useCallback(async () => {
    if (!user) return;
    try {
      const { data: rows, error } = await supabase.rpc('list_manageable_users');
      if (error) {
        console.error('Error list_manageable_users:', error);
        setPendingUsers([]);
        setActiveUsers([]);
        return;
      }
      const list = (rows || []) as User[];
      setPendingUsers(list.filter((u) => u.status === 'pending'));
      setActiveUsers(list.filter((u) => u.status === 'active'));
    } catch (error) {
      console.error('Error cargando usuarios:', error);
    }
  }, [user]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);
  
  if (!user || !profileReady) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>{t('msg.loading') || 'Cargando perfil…'}</Text>
      </View>
    );
  }
  if (!user.role || !canManageUsers(user.role)) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{t('users.no_permissions')}</Text>
      </View>
    );
  }

  const currentUserRole = user.role;
  const isOwner = currentUserRole === 'owner';

  // list_manageable_users() ya devuelve solo el ámbito correcto (owner: org; gerente: sucursal)
  const filteredPendingUsers = pendingUsers;
  const filteredActiveUsers = activeUsers;

  /** Aprobación vía RPC SECURITY DEFINER (incluye flujo con staff_join_requests y legacy). */
  const approveUserWithRole = async (userToApprove: User, selectedRole: UserRole): Promise<void> => {
    if (!user) return;
    setApprovingUserId(userToApprove.id);
    setApprovalSubmitting(true);
    try {
      if (__DEV__) {
        console.log('[UserManagement][approveUserWithRole] before RPC', {
          targetUserId: userToApprove.id,
          requestedRole: selectedRole,
        });
      }
      const { data: rpcData, error: rpcError } = await supabase.rpc('approve_staff_request_managed', {
        p_target_user_id: userToApprove.id,
        p_new_role: selectedRole,
      });
      if (__DEV__) {
        console.log('[UserManagement][approveUserWithRole] after RPC', {
          result: rpcData,
          rpcErrorCode: rpcError?.code,
          rpcErrorMessage: rpcError?.message,
          rpcErrorDetails: rpcError?.details,
          rpcErrorHint: rpcError?.hint,
        });
      }
      if (rpcError) {
        console.error('Error approve_staff_request_managed:', rpcError);
        const errorUi = mapSupabaseErrorToUi(rpcError, t);
        const alertButtons: any[] = [{ text: t('btn.close') }];
        if (errorUi.ctaAction === 'subscriptions' && errorUi.ctaLabel) {
          alertButtons.push({
            text: errorUi.ctaLabel,
            onPress: () => navigation.navigate('Subscriptions'),
          });
        }
        Alert.alert(errorUi.title, errorUi.message, alertButtons);
        return;
      }
      const result = rpcData as { ok?: boolean; message?: string } | null;
      if (!result?.ok) {
        Alert.alert(t('msg.error'), result?.message ?? t('users.approve_error'));
        return;
      }
      await loadUsers();
      setApprovalRoleModalVisible(false);
      setUserPendingApproval(null);
      Alert.alert(t('msg.success'), `${userToApprove.name || userToApprove.username || userToApprove.email} ${t('users.approved_success')} ${getRoleName(selectedRole)}`);
    } catch (error: any) {
      if (__DEV__) {
        try {
          console.log('[UserManagement][approveUserWithRole] catch error (serializable)', {
            message: error?.message,
            code: error?.code,
            details: error?.details,
            hint: error?.hint,
            stringified: JSON.stringify(error, Object.getOwnPropertyNames(error)),
          });
        } catch (_) {
          console.log('[UserManagement][approveUserWithRole] catch error (fallback)', String(error));
        }
      }
      console.error('Error aprobando usuario:', error);
      const errorUi = mapSupabaseErrorToUi(error, t);
      const alertButtons: any[] = [{ text: t('btn.close') }];
      if (errorUi.ctaAction === 'subscriptions' && errorUi.ctaLabel) {
        alertButtons.push({
          text: errorUi.ctaLabel,
          onPress: () => navigation.navigate('Subscriptions'),
        });
      }
      Alert.alert(errorUi.title, errorUi.message, alertButtons);
    } finally {
      setApprovingUserId(null);
      setApprovalSubmitting(false);
    }
  };

  const handleApproveUser = (userToApprove: User) => {
    const assignableRoles = getAssignableRoles(currentUserRole);
    if (assignableRoles.length === 0) {
      Alert.alert(t('msg.error'), t('users.no_assign_permission'));
      return;
    }
    setUserPendingApproval(userToApprove);
    setApprovalAssignableRoles(assignableRoles);
    setApprovalRoleModalVisible(true);
  };

  const handleRejectUser = (userToReject: User) => {
    Alert.alert(
      t('users.reject_user'),
      `${t('users.reject_confirm')} ${userToReject.name || userToReject.username || userToReject.email}?`,
      [
        { text: t('btn.cancel'), style: 'cancel' },
        {
          text: t('users.reject'),
          style: 'destructive',
          onPress: async () => {
            setRejectingUserId(userToReject.id);
            try {
              const { data: rpcData, error: rpcError } = await supabase.rpc('reject_staff_request_managed', {
                p_target_user_id: userToReject.id,
              });
              if (rpcError) {
                console.error('Error reject_staff_request_managed:', rpcError);
                const errorUi = mapSupabaseErrorToUi(rpcError, t);
                Alert.alert(errorUi.title, errorUi.message);
                return;
              }
              const result = rpcData as { ok?: boolean; message?: string } | null;
              if (!result?.ok) {
                Alert.alert(t('msg.error'), result?.message ?? t('users.approve_error'));
                return;
              }
              await loadUsers();
              Alert.alert(t('users.rejected'), `${t('users.rejected_success')} ${userToReject.name || userToReject.username || userToReject.email} ${t('users.rejected').toLowerCase()}`);
            } catch (error: any) {
              console.error('Error rechazando usuario:', error);
              const errorUi = mapSupabaseErrorToUi(error, t);
              Alert.alert(errorUi.title, errorUi.message);
            } finally {
              setRejectingUserId(null);
            }
          }
        }
      ]
    );
  };

  const handleDeleteUser = async (userToDelete: User) => {
    // Verificar permisos
    if (!user) return;

    // Owner puede eliminar cualquier usuario de su sucursal
    if (isOwner) {
      // Verificar que el usuario pertenece al mismo owner
      const ownerId = user.owner_id || user.id;
      if (userToDelete.owner_id !== ownerId && userToDelete.id !== ownerId) {
        Alert.alert(t('msg.error'), t('users.cannot_delete_other_org'));
        return;
      }
    } 
    // Gerente solo puede eliminar usuarios con rol inferior
    else if (currentUserRole === 'gerente') {
      const roleHierarchy: Record<UserRole, number> = {
        owner: 5,
        gerente: 4,
        sommelier: 3,
        supervisor: 2,
        personal: 1,
      };
      
      if (roleHierarchy[userToDelete.role] >= roleHierarchy[currentUserRole]) {
        Alert.alert(t('msg.error'), t('users.cannot_delete_same_level'));
        return;
      }
      
      // Verificar que el usuario pertenece a la misma sucursal
      if (userToDelete.branch_id !== currentBranch?.id) {
        Alert.alert(t('msg.error'), t('users.cannot_delete_other_branch'));
        return;
      }
    } else {
      Alert.alert(t('msg.error'), t('users.no_delete_permission'));
      return;
    }

    // No permitir eliminar al owner
    if (userToDelete.role === 'owner') {
      Alert.alert(t('msg.error'), t('users.cannot_delete_owner'));
      return;
    }

    Alert.alert(
      t('users.delete_user'),
      `${t('users.delete_confirm')} ${userToDelete.name || userToDelete.username || userToDelete.email}? ${t('users.delete_warning')}`,
      [
        { text: t('btn.cancel'), style: 'cancel' },
        {
          text: t('btn.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { session }, error: sessionError } = await supabase.auth.getSession();
              if (sessionError || !session?.access_token) {
                Alert.alert(t('msg.error'), t('msg.error'));
                return;
              }
              const { data, error } = await supabase.functions.invoke<{ ok?: boolean; message?: string }>(
                'hard-delete-staff',
                {
                  body: { target_user_id: userToDelete.id },
                  headers: { authorization: `Bearer ${session.access_token}` },
                }
              );

              if (error) {
                console.error('Error hard-delete-staff:', error);
                const errorUi = mapSupabaseErrorToUi(error, t);
                const alertButtons: any[] = [{ text: t('btn.close') }];
                if (errorUi.ctaAction === 'subscriptions' && errorUi.ctaLabel) {
                  alertButtons.push({
                    text: errorUi.ctaLabel,
                    onPress: () => navigation.navigate('Subscriptions'),
                  });
                }
                Alert.alert(errorUi.title, errorUi.message, alertButtons);
                return;
              }

              if (data?.ok !== true) {
                Alert.alert(t('msg.error'), data?.message ?? t('users.delete_error'));
                return;
              }

              await loadUsers();
              Alert.alert(t('msg.success'), `${userToDelete.name || userToDelete.username || userToDelete.email} ${t('users.deleted_success')}`);
            } catch (error: any) {
              console.error('Error eliminando usuario:', error);
              const errorUi = mapSupabaseErrorToUi(error, t);
              const alertButtons: any[] = [{ text: t('btn.close') }];
              if (errorUi.ctaAction === 'subscriptions' && errorUi.ctaLabel) {
                alertButtons.push({
                  text: errorUi.ctaLabel,
                  onPress: () => navigation.navigate('Subscriptions'),
                });
              }
              Alert.alert(errorUi.title, errorUi.message, alertButtons);
            }
          }
        }
      ]
    );
  };

  const handleOpenChangeRole = (user: User) => {
    // No se puede cambiar el rol de un Owner
    if (user.role === 'owner') {
      Alert.alert('No Permitido', 'No se puede cambiar el rol de un Owner');
      return;
    }

    // Verificar permisos para cambiar el rol actual del usuario
    if (!canApproveRole(currentUserRole, user.role)) {
      Alert.alert('Permiso Denegado', `No tienes permisos para modificar el rol de ${getRoleName(user.role)}`);
      return;
    }

    setSelectedUser(user);
    setIsChangeRoleModalVisible(true);
  };

  const handleChangeRole = (newRole: UserRole) => {
    if (!selectedUser || !user) return;

    if (!canApproveRole(currentUserRole, newRole)) {
      Alert.alert(t('msg.error'), `${t('users.no_assign_role_permission')} ${getRoleName(newRole)}`);
      return;
    }

    Alert.alert(
      t('users.change_role'),
      `${t('users.change_role_confirm')} ${selectedUser.name || selectedUser.username || selectedUser.email} ${t('users.change_role_from_to')} ${getRoleName(selectedUser.role)} ${t('users.change_role_to')} ${getRoleName(newRole)}?`,
      [
        { text: t('btn.cancel'), style: 'cancel' },
        {
          text: t('btn.save'),
          onPress: async () => {
            setChangingRoleUserId(selectedUser.id);
            try {
              const { data: rpcData, error } = await supabase.rpc('change_staff_role_managed', {
                p_target_user_id: selectedUser.id,
                p_new_role: newRole,
              });
              if (error) {
                console.error('Error change_staff_role_managed:', error);
                const errorUi = mapSupabaseErrorToUi(error, t);
                const alertButtons: any[] = [{ text: t('btn.close') }];
                if (errorUi.ctaAction === 'subscriptions' && errorUi.ctaLabel) {
                  alertButtons.push({
                    text: errorUi.ctaLabel,
                    onPress: () => navigation.navigate('Subscriptions'),
                  });
                }
                Alert.alert(errorUi.title, errorUi.message, alertButtons);
                return;
              }
              const result = rpcData as { ok?: boolean; message?: string } | null;
              if (!result?.ok) {
                Alert.alert(t('msg.error'), result?.message ?? t('users.approve_error'));
                return;
              }
              await loadUsers();
              setIsChangeRoleModalVisible(false);
              setSelectedUser(null);
              const successMsg = result?.message ?? `${t('users.role_updated')} ${selectedUser.name || selectedUser.username || selectedUser.email} ${t('users.role_updated_to')} ${getRoleName(newRole)}`;
              Alert.alert(t('msg.success'), successMsg);
            } catch (err: any) {
              console.error('Error cambiando rol:', err);
              const errorUi = mapSupabaseErrorToUi(err, t);
              Alert.alert(errorUi.title, errorUi.message);
            } finally {
              setChangingRoleUserId(null);
            }
          }
        }
      ]
    );
  };

  const renderPendingUser = (pendingUser: User) => {
    const isApproving = approvingUserId === pendingUser.id;
    const isRejecting = rejectingUserId === pendingUser.id;
    const isBusy = isApproving || isRejecting;
    return (
      <View key={pendingUser.id} style={styles.userCard}>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{pendingUser.name || pendingUser.username || pendingUser.email}</Text>
          <Text style={styles.userEmail}>{pendingUser.email}</Text>
          <Text style={styles.userRole}>{t('users.requesting')} {getRoleName(pendingUser.role)}</Text>
          {!isOwner && (
            <Text style={styles.branchInfo}>{t('users.branch')} {currentBranch?.name}</Text>
          )}
        </View>
        <View style={styles.userActions}>
          <TouchableOpacity
            style={[styles.approveButton, isBusy && styles.buttonDisabled]}
            onPress={() => !isBusy && handleApproveUser(pendingUser)}
            disabled={isBusy}
          >
            <Text style={styles.approveButtonText}>
              {isApproving ? '…' : `✓ ${t('users.approve')}`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.rejectButton, isBusy && styles.buttonDisabled]}
            onPress={() => !isBusy && handleRejectUser(pendingUser)}
            disabled={isBusy}
          >
            <Text style={styles.rejectButtonText}>
              {isRejecting ? '…' : `✗ ${t('users.reject')}`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderActiveUser = (user: User) => {
    const canModify = user.role !== 'owner' && canApproveRole(currentUserRole, user.role);
    
    return (
      <View key={user.id} style={styles.userCard}>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{user.name || user.username || user.email}</Text>
          <Text style={styles.userEmail}>{user.email}</Text>
          <Text style={[styles.userRole, { color: getRoleColor(user.role) }]}>
            {getRoleName(user.role)} • {t('users.active')}
          </Text>
          {!isOwner && (
            <Text style={styles.branchInfo}>{t('users.branch')} {currentBranch?.name}</Text>
          )}
        </View>
        {canModify && (
          <View style={styles.userActions}>
            <TouchableOpacity
              style={styles.changeRoleButton}
              onPress={() => handleOpenChangeRole(user)}
            >
              <Text style={styles.changeRoleButtonText}>🔄 {t('users.change_role')}</Text>
            </TouchableOpacity>
            {/* Botón eliminar: solo visible para owner y gerente */}
            {(isOwner || (currentUserRole === 'gerente' && user.role !== 'owner' && user.role !== 'gerente')) && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeleteUser(user)}
              >
                <Text style={styles.deleteButtonText}>🗑️ {t('btn.delete')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  const getRoleColor = (role: UserRole): string => {
    switch (role) {
      case 'owner': return '#8B0000';
      case 'gerente': return '#1e3a8a';
      case 'sommelier': return '#7c2d12';
      case 'supervisor': return '#166534';
      default: return '#6b7280';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.title}>{t('users.title')}</Text>
          <Text style={styles.subtitle}>
            {isOwner ? t('users.all_branches') : currentBranch?.name || t('branches.title')}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Solicitudes pendientes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            📋 {t('users.pending_approval')} ({filteredPendingUsers.length})
          </Text>
          {filteredPendingUsers.length > 0 ? (
            filteredPendingUsers.map(renderPendingUser)
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>{t('msg.no_data')}</Text>
            </View>
          )}
        </View>

        {/* Usuarios activos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            👥 {t('users.active')} ({filteredActiveUsers.length})
          </Text>
          {filteredActiveUsers.map(renderActiveUser)}
        </View>
      </ScrollView>

      {/* Modal para aprobar usuario (selección de rol) — evita límite de 3 botones en Android */}
      <Modal
        visible={approvalRoleModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          if (!approvalSubmitting) {
            setApprovalRoleModalVisible(false);
            setUserPendingApproval(null);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('users.approve_user')}</Text>
            <Text style={styles.modalSubtitle}>
              {t('users.select_role')} {userPendingApproval?.name || userPendingApproval?.username || userPendingApproval?.email}
            </Text>

            <View style={styles.rolesContainer}>
              {approvalAssignableRoles.map((role) => (
                <TouchableOpacity
                  key={role}
                  style={[
                    styles.roleOption,
                    { borderColor: getRoleColor(role) },
                    approvalSubmitting && styles.buttonDisabled
                  ]}
                  onPress={() => userPendingApproval && approveUserWithRole(userPendingApproval, role)}
                  disabled={approvalSubmitting}
                >
                  <Text style={[styles.roleOptionText, { color: getRoleColor(role) }]}>
                    {getRoleName(role)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.modalCloseButton, approvalSubmitting && styles.buttonDisabled]}
              onPress={() => {
                if (!approvalSubmitting) {
                  setApprovalRoleModalVisible(false);
                  setUserPendingApproval(null);
                }
              }}
              disabled={approvalSubmitting}
            >
              <Text style={styles.modalCloseButtonText}>{t('btn.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal para cambiar rol */}
      <Modal
        visible={isChangeRoleModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsChangeRoleModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('users.change_role')}</Text>
            <Text style={styles.modalSubtitle}>
              {t('settings.user')}: {selectedUser?.name || selectedUser?.username || selectedUser?.email}
            </Text>
            <Text style={styles.modalCurrentRole}>
              {t('users.current_role')} {selectedUser && getRoleName(selectedUser.role)}
            </Text>

            <View style={styles.rolesContainer}>
              {getAssignableRoles(currentUserRole).map((role) => (
                <TouchableOpacity
                  key={role}
                  style={[
                    styles.roleOption,
                    { borderColor: getRoleColor(role) },
                    selectedUser?.role === role && styles.roleOptionCurrent,
                    changingRoleUserId === selectedUser?.id && styles.buttonDisabled
                  ]}
                  onPress={() => handleChangeRole(role)}
                  disabled={changingRoleUserId === selectedUser?.id}
                >
                  <Text style={[styles.roleOptionText, { color: getRoleColor(role) }]}>
                    {getRoleName(role)}
                  </Text>
                  {selectedUser?.role === role && (
                    <Text style={styles.currentBadge}>{t('users.current')}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.modalCloseButton, changingRoleUserId === selectedUser?.id && styles.buttonDisabled]}
              onPress={() => {
                if (changingRoleUserId !== selectedUser?.id) {
                  setIsChangeRoleModalVisible(false);
                  setSelectedUser(null);
                }
              }}
              disabled={changingRoleUserId === selectedUser?.id}
            >
              <Text style={styles.modalCloseButtonText}>{t('btn.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: '#8B0000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userInfo: {
    marginBottom: 12,
  },
  userName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  userRole: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8B0000',
  },
  branchInfo: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  userActions: {
    flexDirection: 'row',
    gap: 8,
  },
  approveButton: {
    flex: 1,
    backgroundColor: '#28a745',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  approveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  rejectButton: {
    flex: 1,
    backgroundColor: '#dc3545',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  rejectButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  changeRoleButton: {
    flex: 1,
    backgroundColor: '#17a2b8',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  changeRoleButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#dc3545',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
  infoCard: {
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976d2',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#dc3545',
    textAlign: 'center',
    marginTop: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 40,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    textAlign: 'center',
  },
  modalCurrentRole: {
    fontSize: 14,
    color: '#8B0000',
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  rolesContainer: {
    marginBottom: 20,
  },
  roleOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderWidth: 2,
    borderRadius: 8,
    marginBottom: 12,
  },
  roleOptionCurrent: {
    backgroundColor: '#f0f0f0',
  },
  roleOptionText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  currentBadge: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  modalCloseButton: {
    backgroundColor: '#6b7280',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default UserManagementScreen;
