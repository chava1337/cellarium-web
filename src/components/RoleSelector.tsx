import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  Dimensions,
} from 'react-native';

const { width } = Dimensions.get('window');

export interface RoleOption {
  id: string;
  role: string;
  displayName: string;
  description: string;
  icon: string;
  branchId: string;
  branchName: string;
  email: string;
  username: string;
  ownerId?: string; // ID del owner al que pertenece este usuario
}

interface RoleSelectorProps {
  onRoleSelected: (role: RoleOption) => void;
  disabled?: boolean;
}

const mockRoles: RoleOption[] = [
  // RESTAURANTE PRINCIPAL
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    role: 'owner',
    displayName: 'Marco Rodríguez',
    description: 'Owner - Restaurante Principal',
    icon: '👑',
    branchId: '550e8400-e29b-41d4-a716-446655440001',
    branchName: 'Restaurante Principal',
    email: 'admin@cellarium.com',
    username: 'marco_rodriguez',
    ownerId: undefined, // Owner no tiene owner_id
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440040',
    role: 'gerente',
    displayName: 'Gerente Principal',
    description: 'Gestión operativa completa',
    icon: '👔',
    branchId: '550e8400-e29b-41d4-a716-446655440001',
    branchName: 'Restaurante Principal',
    email: 'gerente.principal@cellarium.com',
    username: 'gerente_principal',
    ownerId: '550e8400-e29b-41d4-a716-446655440002', // Pertenece al Owner Principal
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440041',
    role: 'sommelier',
    displayName: 'Sommelier Principal',
    description: 'Gestión de vinos y catálogo',
    icon: '🍷',
    branchId: '550e8400-e29b-41d4-a716-446655440001',
    branchName: 'Restaurante Principal',
    email: 'sommelier.principal@cellarium.com',
    username: 'sommelier_principal',
    ownerId: '550e8400-e29b-41d4-a716-446655440002', // Pertenece al Owner Principal
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440042',
    role: 'supervisor',
    displayName: 'Supervisor Principal',
    description: 'Supervisión de operaciones',
    icon: '👨‍💼',
    branchId: '550e8400-e29b-41d4-a716-446655440001',
    branchName: 'Restaurante Principal',
    email: 'supervisor.principal@cellarium.com',
    username: 'supervisor_principal',
    ownerId: '550e8400-e29b-41d4-a716-446655440002', // Pertenece al Owner Principal
  },
  
  // SUCURSAL NORTE
  {
    id: '550e8400-e29b-41d4-a716-446655440043',
    role: 'owner',
    displayName: 'Ana Martínez',
    description: 'Owner - Sucursal Norte',
    icon: '👑',
    branchId: '550e8400-e29b-41d4-a716-446655440005',
    branchName: 'Sucursal Norte',
    email: 'owner.norte@cellarium.com',
    username: 'ana_martinez',
    ownerId: undefined, // Owner no tiene owner_id
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440044',
    role: 'gerente',
    displayName: 'Gerente Norte',
    description: 'Gestión operativa - Sucursal Norte',
    icon: '👔',
    branchId: '550e8400-e29b-41d4-a716-446655440005',
    branchName: 'Sucursal Norte',
    email: 'gerente.norte@cellarium.com',
    username: 'gerente_norte',
    ownerId: '550e8400-e29b-41d4-a716-446655440043', // Pertenece al Owner Norte
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440045',
    role: 'sommelier',
    displayName: 'Sommelier Norte',
    description: 'Gestión de vinos - Sucursal Norte',
    icon: '🍷',
    branchId: '550e8400-e29b-41d4-a716-446655440005',
    branchName: 'Sucursal Norte',
    email: 'sommelier.norte@cellarium.com',
    username: 'sommelier_norte',
    ownerId: '550e8400-e29b-41d4-a716-446655440043', // Pertenece al Owner Norte
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440046',
    role: 'supervisor',
    displayName: 'Supervisor Norte',
    description: 'Supervisión - Sucursal Norte',
    icon: '👨‍💼',
    branchId: '550e8400-e29b-41d4-a716-446655440005',
    branchName: 'Sucursal Norte',
    email: 'supervisor.norte@cellarium.com',
    username: 'supervisor_norte',
    ownerId: '550e8400-e29b-41d4-a716-446655440043', // Pertenece al Owner Norte
  },
  
  // SUCURSAL SUR
  {
    id: '550e8400-e29b-41d4-a716-446655440047',
    role: 'owner',
    displayName: 'Carlos López',
    description: 'Owner - Sucursal Sur',
    icon: '👑',
    branchId: '550e8400-e29b-41d4-a716-446655440006',
    branchName: 'Sucursal Sur',
    email: 'owner.sur@cellarium.com',
    username: 'carlos_lopez',
    ownerId: undefined, // Owner no tiene owner_id
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440048',
    role: 'gerente',
    displayName: 'Gerente Sur',
    description: 'Gestión operativa - Sucursal Sur',
    icon: '👔',
    branchId: '550e8400-e29b-41d4-a716-446655440006',
    branchName: 'Sucursal Sur',
    email: 'gerente.sur@cellarium.com',
    username: 'gerente_sur',
    ownerId: '550e8400-e29b-41d4-a716-446655440047', // Pertenece al Owner Sur
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440049',
    role: 'sommelier',
    displayName: 'Sommelier Sur',
    description: 'Gestión de vinos - Sucursal Sur',
    icon: '🍷',
    branchId: '550e8400-e29b-41d4-a716-446655440006',
    branchName: 'Sucursal Sur',
    email: 'sommelier.sur@cellarium.com',
    username: 'sommelier_sur',
    ownerId: '550e8400-e29b-41d4-a716-446655440047', // Pertenece al Owner Sur
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440050',
    role: 'supervisor',
    displayName: 'Supervisor Sur',
    description: 'Supervisión - Sucursal Sur',
    icon: '👨‍💼',
    branchId: '550e8400-e29b-41d4-a716-446655440006',
    branchName: 'Sucursal Sur',
    email: 'supervisor.sur@cellarium.com',
    username: 'supervisor_sur',
    ownerId: '550e8400-e29b-41d4-a716-446655440047', // Pertenece al Owner Sur
  },
  
  // PERSONAL (MESEROS/BARTENDERS)
  {
    id: '550e8400-e29b-41d4-a716-446655440051',
    role: 'personal',
    displayName: 'María González',
    description: 'Mesera - Restaurante Principal',
    icon: '🍽️',
    branchId: '550e8400-e29b-41d4-a716-446655440001',
    branchName: 'Restaurante Principal',
    email: 'maria.gonzalez@cellarium.com',
    username: 'maria_gonzalez',
    ownerId: '550e8400-e29b-41d4-a716-446655440002', // Pertenece al Marco Rodríguez
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440052',
    role: 'personal',
    displayName: 'José Martínez',
    description: 'Bartender - Sucursal Norte',
    icon: '🍽️',
    branchId: '550e8400-e29b-41d4-a716-446655440005',
    branchName: 'Sucursal Norte',
    email: 'jose.martinez@cellarium.com',
    username: 'jose_martinez',
    ownerId: '550e8400-e29b-41d4-a716-446655440043', // Pertenece a Ana Martínez
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440053',
    role: 'personal',
    displayName: 'Laura Sánchez',
    description: 'Mesera - Sucursal Sur',
    icon: '🍽️',
    branchId: '550e8400-e29b-41d4-a716-446655440006',
    branchName: 'Sucursal Sur',
    email: 'laura.sanchez@cellarium.com',
    username: 'laura_sanchez',
    ownerId: '550e8400-e29b-41d4-a716-446655440047', // Pertenece a Carlos López
  },
];

const RoleSelector: React.FC<RoleSelectorProps> = ({ onRoleSelected, disabled = false }) => {
  const [modalVisible, setModalVisible] = useState(false);

  const handleRoleSelect = (role: RoleOption) => {
    setModalVisible(false);
    onRoleSelected(role);
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'owner':
        return '#8B0000'; // Rojo oscuro
      case 'gerente':
        return '#1e3a8a'; // Azul oscuro
      case 'sommelier':
        return '#7c2d12'; // Marrón
      case 'supervisor':
        return '#166534'; // Verde oscuro
      case 'personal':
        return '#7c3aed'; // Púrpura
      default:
        return '#6b7280'; // Gris
    }
  };

  const getBranchColor = (branchName: string) => {
    switch (branchName) {
      case 'Restaurante Principal':
        return '#dc2626'; // Rojo
      case 'Sucursal Norte':
        return '#2563eb'; // Azul
      case 'Sucursal Sur':
        return '#16a34a'; // Verde
      default:
        return '#6b7280'; // Gris
    }
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.button, disabled && styles.buttonDisabled]}
        onPress={() => setModalVisible(true)}
        disabled={disabled}
      >
        <Text style={styles.buttonText}>🚀 Modo Desarrollo</Text>
        <Text style={styles.buttonSubtext}>Seleccionar rol para probar</Text>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🔧 Modo Desarrollo</Text>
              <Text style={styles.modalSubtitle}>Selecciona un rol para probar jerarquías</Text>
            </View>

            <ScrollView style={styles.rolesList} showsVerticalScrollIndicator={false}>
              {mockRoles.map((role) => (
                <TouchableOpacity
                  key={role.id}
                  style={styles.roleCard}
                  onPress={() => handleRoleSelect(role)}
                >
                  <View style={styles.roleHeader}>
                    <Text style={styles.roleIcon}>{role.icon}</Text>
                    <View style={styles.roleInfo}>
                      <Text style={[styles.roleName, { color: getRoleColor(role.role) }]}>
                        {role.displayName}
                      </Text>
                      <Text style={styles.roleDescription}>{role.description}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.roleDetails}>
                    <View style={[styles.branchTag, { backgroundColor: getBranchColor(role.branchName) }]}>
                      <Text style={styles.branchText}>{role.branchName}</Text>
                    </View>
                    <Text style={styles.roleEmail}>{role.email}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#8B0000',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  buttonDisabled: {
    backgroundColor: '#9ca3af',
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  buttonSubtext: {
    color: '#ffffff',
    fontSize: 12,
    opacity: 0.8,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 4,
  },
  rolesList: {
    maxHeight: 400,
  },
  roleCard: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  roleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  roleIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  roleInfo: {
    flex: 1,
  },
  roleName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  roleDescription: {
    fontSize: 12,
    color: '#6b7280',
  },
  roleDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  branchTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  branchText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  roleEmail: {
    fontSize: 10,
    color: '#9ca3af',
    flex: 1,
    textAlign: 'right',
  },
  closeButton: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  closeButtonText: {
    color: '#6b7280',
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
});

export default RoleSelector;
