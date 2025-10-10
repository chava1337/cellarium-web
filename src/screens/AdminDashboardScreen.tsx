import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, Branch } from '../types';
import { useBranch } from '../contexts/BranchContext';
import { useAuth } from '../contexts/AuthContext';

type AdminDashboardScreenNavigationProp = StackNavigationProp<RootStackParamList, 'AdminDashboard'>;

interface Props {
  navigation: AdminDashboardScreenNavigationProp;
}

const AdminDashboardScreen: React.FC<Props> = ({ navigation }) => {
  const { currentBranch, setCurrentBranch, availableBranches } = useBranch();
  const { user } = useAuth();
  const [isBranchSelectorVisible, setIsBranchSelectorVisible] = useState(false);
  
  // Para desarrollo: si no hay usuario, simular un Owner
  const currentUserRole = user?.role || 'owner';
  const isOwner = currentUserRole === 'owner';

  const handleBranchSelect = (branch: Branch) => {
    setCurrentBranch(branch);
    setIsBranchSelectorVisible(false);
    Alert.alert('Sucursal Cambiada', `Ahora estás gestionando: ${branch.name}`);
  };

  const handleWineManagement = () => {
    Alert.alert('Próximamente', 'Gestión de vinos con IA estará disponible pronto');
  };

  const handleInventoryManagement = () => {
    Alert.alert('Próximamente', 'Control de inventario estará disponible pronto');
  };

  const handleAnalytics = () => {
    Alert.alert('Próximamente', 'Análisis y reportes estarán disponibles pronto');
  };

  const handlePromotions = () => {
    Alert.alert('Próximamente', 'Gestión de promociones estará disponible pronto');
  };

  const handleUserManagement = () => {
    navigation.navigate('UserManagement');
  };

  const handleTastingNotes = () => {
    navigation.navigate('TastingNotes');
  };

  const handleQrGeneration = () => {
    navigation.navigate('QrGeneration');
  };

  const handleBranchManagement = () => {
    navigation.navigate('BranchManagement');
  };

  const menuItems: Array<{
    id: string;
    title: string;
    subtitle: string;
    icon: string;
    color: string;
    onPress: () => void;
    requiresOwner?: boolean;
  }> = [
    {
      id: 'wines',
      title: 'Gestión de Vinos',
      subtitle: 'Alta con IA, edición, eliminación',
      icon: '🍷',
      color: '#8B0000',
      onPress: handleWineManagement,
    },
    {
      id: 'inventory',
      title: 'Control de Inventario',
      subtitle: 'Stock, alertas, movimientos',
      icon: '📦',
      color: '#28a745',
      onPress: handleInventoryManagement,
    },
    {
      id: 'analytics',
      title: 'Análisis y Reportes',
      subtitle: 'Ventas, métricas, gráficas',
      icon: '📊',
      color: '#17a2b8',
      onPress: handleAnalytics,
    },
    {
      id: 'promotions',
      title: 'Promociones',
      subtitle: 'Destacados, ofertas especiales',
      icon: '🎯',
      color: '#ffc107',
      onPress: handlePromotions,
    },
    {
      id: 'qr',
      title: 'Generación de QR',
      subtitle: 'QR para comensales e invitaciones',
      icon: '📱',
      color: '#007bff',
      onPress: handleQrGeneration,
    },
    {
      id: 'tasting',
      title: 'Catas y Degustaciones',
      subtitle: 'Notas de cata, calificaciones',
      icon: '🍇',
      color: '#e83e8c',
      onPress: handleTastingNotes,
    },
    {
      id: 'users',
      title: 'Gestión de Usuarios',
      subtitle: 'Roles, permisos, acceso',
      icon: '👥',
      color: '#6f42c1',
      onPress: handleUserManagement,
      requiresOwner: true, // Solo Owner
    },
    {
      id: 'branches',
      title: 'Gestión de Sucursales',
      subtitle: 'Crear, editar, eliminar sucursales',
      icon: '🏢',
      color: '#20c997',
      onPress: handleBranchManagement,
      requiresOwner: true, // Solo Owner
    },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Panel de Administración</Text>
        </View>
        
        {/* Indicador de sucursal */}
        <TouchableOpacity
          style={styles.branchSelector}
          onPress={() => {
            if (isOwner) {
              setIsBranchSelectorVisible(true);
            } else {
              Alert.alert('Información', `Estás gestionando: ${currentBranch?.name || 'Sin sucursal'}`);
            }
          }}
        >
          <View style={styles.branchInfo}>
            <Text style={styles.branchLabel}>Sucursal Actual:</Text>
            <Text style={styles.branchName}>{currentBranch?.name || 'Sin sucursal'}</Text>
          </View>
          {isOwner && (
            <Text style={styles.branchArrow}>▼</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Modal selector de sucursal (solo para Owner) */}
      {isOwner && (
        <Modal
          visible={isBranchSelectorVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setIsBranchSelectorVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setIsBranchSelectorVisible(false)}
          >
            <View style={styles.branchSelectorModal}>
              <Text style={styles.modalTitle}>Seleccionar Sucursal</Text>
              <FlatList
                data={availableBranches}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.branchItem,
                      currentBranch?.id === item.id && styles.branchItemActive
                    ]}
                    onPress={() => handleBranchSelect(item)}
                  >
                    <View>
                      <Text style={[
                        styles.branchItemName,
                        currentBranch?.id === item.id && styles.branchItemNameActive
                      ]}>
                        {item.name}
                      </Text>
                      <Text style={styles.branchItemAddress}>{item.address}</Text>
                    </View>
                    {currentBranch?.id === item.id && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </TouchableOpacity>
                )}
                showsVerticalScrollIndicator={false}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Estadísticas rápidas */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>5</Text>
          <Text style={styles.statLabel}>Vinos en Catálogo</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>12</Text>
          <Text style={styles.statLabel}>Stock Total</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>2</Text>
          <Text style={styles.statLabel}>Destacados</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>1</Text>
          <Text style={styles.statLabel}>Promociones</Text>
        </View>
      </View>

      {/* Menú principal */}
      <ScrollView style={styles.menuContainer} showsVerticalScrollIndicator={false}>
        <Text style={styles.menuTitle}>Funciones Administrativas</Text>
        
        {menuItems
          .filter(item => !item.requiresOwner || isOwner)
          .map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.menuItem, { borderLeftColor: item.color }]}
            onPress={item.onPress}
          >
            <View style={styles.menuItemContent}>
              <Text style={styles.menuIcon}>{item.icon}</Text>
              <View style={styles.menuText}>
                <Text style={styles.menuItemTitle}>{item.title}</Text>
                <Text style={styles.menuItemSubtitle}>{item.subtitle}</Text>
              </View>
              <Text style={styles.menuArrow}>›</Text>
            </View>
          </TouchableOpacity>
        ))}
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
  headerContent: {
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8B0000',
  },
  // Estilos del selector de sucursal
  branchSelector: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  branchInfo: {
    flex: 1,
  },
  branchLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 2,
  },
  branchName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#8B0000',
  },
  branchArrow: {
    fontSize: 12,
    color: '#666',
    marginLeft: 8,
  },
  // Estilos del modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  branchSelectorModal: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    maxHeight: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  branchItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
    marginBottom: 8,
  },
  branchItemActive: {
    backgroundColor: '#e3f2fd',
    borderWidth: 1,
    borderColor: '#8B0000',
  },
  branchItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  branchItemNameActive: {
    color: '#8B0000',
  },
  branchItemAddress: {
    fontSize: 12,
    color: '#666',
  },
  checkmark: {
    fontSize: 20,
    color: '#28a745',
    fontWeight: 'bold',
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'white',
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#8B0000',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
  },
  menuContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  menuItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  menuItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  menuIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  menuText: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  menuItemSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  menuArrow: {
    fontSize: 20,
    color: '#ccc',
  },
});

export default AdminDashboardScreen;