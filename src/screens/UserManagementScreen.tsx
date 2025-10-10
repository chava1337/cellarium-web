import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, User, UserRole } from '../types';
import { canApproveRole, getRoleName, getAssignableRoles } from '../utils/permissions';

type UserManagementScreenNavigationProp = StackNavigationProp<RootStackParamList, 'UserManagement'>;

interface Props {
  navigation: UserManagementScreenNavigationProp;
}

// Usuarios de prueba (simulando solicitudes pendientes)
const mockPendingUsers: User[] = [
  {
    id: '2',
    email: 'juan@restaurante.com',
    username: 'juan',
    role: 'gerente',
    status: 'pending',
    invited_by: '1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '3',
    email: 'maria@restaurante.com',
    username: 'maria',
    role: 'sommelier',
    status: 'pending',
    invited_by: '1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const mockActiveUsers: User[] = [
  {
    id: '1',
    email: 'admin@restaurante.com',
    username: 'admin',
    role: 'owner',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const UserManagementScreen: React.FC<Props> = ({ navigation }) => {
  const [pendingUsers, setPendingUsers] = useState<User[]>(mockPendingUsers);
  const [activeUsers, setActiveUsers] = useState<User[]>(mockActiveUsers);
  
  // Simular rol del usuario actual (Owner para desarrollo)
  const currentUserRole: UserRole = 'owner';

  const handleApproveUser = (user: User) => {
    if (!canApproveRole(currentUserRole, user.role)) {
      Alert.alert('Permiso Denegado', `No tienes permisos para aprobar el rol de ${getRoleName(user.role)}`);
      return;
    }

    Alert.alert(
      'Aprobar Usuario',
      `¿Deseas aprobar a ${user.username} como ${getRoleName(user.role)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aprobar',
          onPress: () => {
            // Simular aprobación
            const approvedUser: User = {
              ...user,
              status: 'active',
              approved_by: '1',
              approved_at: new Date().toISOString(),
            };
            
            setPendingUsers(pendingUsers.filter(u => u.id !== user.id));
            setActiveUsers([...activeUsers, approvedUser]);
            
            Alert.alert('Éxito', `Usuario ${user.username} aprobado correctamente`);
          }
        }
      ]
    );
  };

  const handleRejectUser = (user: User) => {
    Alert.alert(
      'Rechazar Usuario',
      `¿Deseas rechazar la solicitud de ${user.username}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Rechazar',
          style: 'destructive',
          onPress: () => {
            setPendingUsers(pendingUsers.filter(u => u.id !== user.id));
            Alert.alert('Rechazado', `Solicitud de ${user.username} rechazada`);
          }
        }
      ]
    );
  };

  const handleDeactivateUser = (user: User) => {
    Alert.alert(
      'Desactivar Usuario',
      `¿Deseas desactivar a ${user.username}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desactivar',
          style: 'destructive',
          onPress: () => {
            const updatedUsers = activeUsers.map(u =>
              u.id === user.id ? { ...u, status: 'inactive' as const } : u
            );
            setActiveUsers(updatedUsers);
            Alert.alert('Desactivado', `Usuario ${user.username} desactivado`);
          }
        }
      ]
    );
  };

  const renderPendingUser = (user: User) => (
    <View key={user.id} style={styles.userCard}>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{user.username}</Text>
        <Text style={styles.userEmail}>{user.email}</Text>
        <Text style={styles.userRole}>Solicita: {getRoleName(user.role)}</Text>
      </View>
      <View style={styles.userActions}>
        <TouchableOpacity
          style={styles.approveButton}
          onPress={() => handleApproveUser(user)}
        >
          <Text style={styles.approveButtonText}>✓ Aprobar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.rejectButton}
          onPress={() => handleRejectUser(user)}
        >
          <Text style={styles.rejectButtonText}>✗ Rechazar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderActiveUser = (user: User) => (
    <View key={user.id} style={styles.userCard}>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{user.username}</Text>
        <Text style={styles.userEmail}>{user.email}</Text>
        <Text style={[styles.userRole, { color: '#28a745' }]}>
          {getRoleName(user.role)} • Activo
        </Text>
      </View>
      {user.role !== 'owner' && (
        <TouchableOpacity
          style={styles.deactivateButton}
          onPress={() => handleDeactivateUser(user)}
        >
          <Text style={styles.deactivateButtonText}>Desactivar</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Gestión de Usuarios</Text>
        <Text style={styles.subtitle}>Aprobar solicitudes y gestionar accesos</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Solicitudes pendientes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Solicitudes Pendientes ({pendingUsers.length})
          </Text>
          {pendingUsers.length > 0 ? (
            pendingUsers.map(renderPendingUser)
          ) : (
            <Text style={styles.emptyText}>No hay solicitudes pendientes</Text>
          )}
        </View>

        {/* Usuarios activos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Usuarios Activos ({activeUsers.length})
          </Text>
          {activeUsers.map(renderActiveUser)}
        </View>
      </ScrollView>
    </View>
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
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8B0000',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
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
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  userCard: {
    backgroundColor: 'white',
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
    fontSize: 12,
    color: '#8B0000',
    fontWeight: '600',
  },
  userActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  approveButton: {
    flex: 1,
    backgroundColor: '#28a745',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginRight: 8,
  },
  approveButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  rejectButton: {
    flex: 1,
    backgroundColor: '#dc3545',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  rejectButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  deactivateButton: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  deactivateButtonText: {
    color: '#dc3545',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default UserManagementScreen;
