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
  
  // Cargar usuarios desde Supabase
  useEffect(() => {
    const loadUsers = async () => {
      if (!user) return;
      
      try {
        // Obtener el owner_id correcto (si es owner, usa su propio ID; si es personal, usa owner_id)
        const ownerId = user.owner_id || user.id;
        
        console.log('🔍 Cargando usuarios para owner:', ownerId);
        
        // Cargar usuarios pendientes del owner actual
        const { data: pendingData, error: pendingError } = await supabase
          .from('users')
          .select('*')
          .eq('owner_id', ownerId)    // ✅ Filtrar por owner_id
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (pendingError) {
          console.error('Error cargando usuarios pendientes:', pendingError);
        } else {
          console.log('✅ Usuarios pendientes encontrados:', pendingData?.length || 0);
          console.log('Detalles:', pendingData);
          setPendingUsers(pendingData || []);
        }

        // Cargar usuarios activos del owner actual (incluir al owner mismo)
        const { data: activeData, error: activeError } = await supabase
          .from('users')
          .select('*')
          .or(`owner_id.eq.${ownerId},id.eq.${ownerId}`)  // ✅ Staff del owner O el owner mismo
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        if (activeError) {
          console.error('Error cargando usuarios activos:', activeError);
        } else {
          console.log('✅ Usuarios activos encontrados:', activeData?.length || 0);
          console.log('Detalles:', activeData);
          setActiveUsers(activeData || []);
        }
      } catch (error) {
        console.error('Error cargando usuarios:', error);
      }
    };

    loadUsers();
  }, [user]);
  
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

  // Filtrar usuarios según el rol
  const getFilteredUsers = (users: User[]) => {
    if (isOwner) {
      // Owner ve todos los usuarios
      return users;
    } else {
      // Gerente solo ve usuarios de su sucursal
      return users.filter(u => u.branch_id === currentBranch?.id);
    }
  };

  const filteredPendingUsers = getFilteredUsers(pendingUsers);
  const filteredActiveUsers = getFilteredUsers(activeUsers);

  const handleApproveUser = async (userToApprove: User) => {
    // Obtener roles asignables según el rol del usuario actual
    const assignableRoles = getAssignableRoles(currentUserRole);
    
    if (assignableRoles.length === 0) {
      Alert.alert(t('msg.error'), t('users.no_assign_permission'));
      return;
    }

    // Crear botones para cada rol asignable
    const roleButtons = assignableRoles.map(role => ({
      text: getRoleName(role),
      onPress: async () => {
        try {
          // Actualizar usuario en Supabase con el rol seleccionado
          const { error } = await supabase
            .from('users')
            .update({
              status: 'active',
              role: role,
              approved_by: user?.id,
              approved_at: new Date().toISOString(),
            })
            .eq('id', userToApprove.id);

          if (error) {
            console.error('Error aprobando usuario:', error);
            
            // Mapear error de Supabase a UI amigable
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
            return;
          }

          // Actualizar estado local
          const approvedUser: User = {
            ...userToApprove,
            status: 'active',
            role: role,
            approved_by: user?.id,
            approved_at: new Date().toISOString(),
          };
          
          setPendingUsers(pendingUsers.filter(u => u.id !== userToApprove.id));
          setActiveUsers([...activeUsers, approvedUser]);
          
          Alert.alert(t('msg.success'), `${userToApprove.name || userToApprove.username || userToApprove.email} ${t('users.approved_success')} ${getRoleName(role)}`);
        } catch (error: any) {
          console.error('Error aprobando usuario:', error);
          
          // Mapear error de Supabase a UI amigable
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
        }
      }
    }));

    Alert.alert(
      t('users.approve_user'),
      `${t('users.select_role')} ${userToApprove.name || userToApprove.username || userToApprove.email}:`,
      [
        { text: t('btn.cancel'), style: 'cancel' },
        ...roleButtons
      ]
    );
  };

  const handleRejectUser = (user: User) => {
    Alert.alert(
      t('users.reject_user'),
      `${t('users.reject_confirm')} ${user.name || user.username || user.email}?`,
      [
        { text: t('btn.cancel'), style: 'cancel' },
        {
          text: t('users.reject'),
          style: 'destructive',
          onPress: () => {
            setPendingUsers(pendingUsers.filter(u => u.id !== user.id));
            Alert.alert(t('users.rejected'), `${t('users.rejected_success')} ${user.name || user.username || user.email} ${t('users.rejected').toLowerCase()}`);
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
              // Eliminar usuario de la base de datos
              const { error } = await supabase
                .from('users')
                .delete()
                .eq('id', userToDelete.id);

              if (error) {
                console.error('Error eliminando usuario:', error);
                
                // Mapear error de Supabase a UI amigable
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
                return;
              }

              // Actualizar estado local
              setActiveUsers(activeUsers.filter(u => u.id !== userToDelete.id));
              Alert.alert(t('msg.success'), `${userToDelete.name || userToDelete.username || userToDelete.email} ${t('users.delete_error')}`);
            } catch (error: any) {
              console.error('Error eliminando usuario:', error);
              
              // Mapear error de Supabase a UI amigable
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
    if (!selectedUser) return;

    // Verificar que se puede asignar el nuevo rol
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
          onPress: () => {
            const updatedUsers = activeUsers.map(u =>
              u.id === selectedUser.id ? { ...u, role: newRole, updated_at: new Date().toISOString() } : u
            );
            setActiveUsers(updatedUsers);
            setIsChangeRoleModalVisible(false);
            setSelectedUser(null);
            Alert.alert(t('msg.success'), `${t('users.role_updated')} ${selectedUser.name || selectedUser.username || selectedUser.email} ${t('users.role_updated_to')} ${getRoleName(newRole)}`);
          }
        }
      ]
    );
  };

  const renderPendingUser = (user: User) => (
    <View key={user.id} style={styles.userCard}>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{user.name || user.username || user.email}</Text>
        <Text style={styles.userEmail}>{user.email}</Text>
        <Text style={styles.userRole}>{t('users.requesting')} {getRoleName(user.role)}</Text>
        {!isOwner && (
          <Text style={styles.branchInfo}>{t('users.branch')} {currentBranch?.name}</Text>
        )}
      </View>
      <View style={styles.userActions}>
        <TouchableOpacity
          style={styles.approveButton}
          onPress={() => handleApproveUser(user)}
        >
          <Text style={styles.approveButtonText}>✓ {t('users.approve')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.rejectButton}
          onPress={() => handleRejectUser(user)}
        >
          <Text style={styles.rejectButtonText}>✗ {t('users.reject')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

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
                    selectedUser?.role === role && styles.roleOptionCurrent
                  ]}
                  onPress={() => handleChangeRole(role)}
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
              style={styles.modalCloseButton}
              onPress={() => {
                setIsChangeRoleModalVisible(false);
                setSelectedUser(null);
              }}
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
