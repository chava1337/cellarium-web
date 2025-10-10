import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, Branch } from '../types';
import { useBranch } from '../contexts/BranchContext';

type BranchManagementScreenNavigationProp = StackNavigationProp<RootStackParamList, 'BranchManagement'>;

interface Props {
  navigation: BranchManagementScreenNavigationProp;
}

const BranchManagementScreen: React.FC<Props> = ({ navigation }) => {
  const { availableBranches, setAvailableBranches } = useBranch();
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
  });

  const handleEditBranch = (branch: Branch) => {
    setEditingBranch(branch);
    setFormData({
      name: branch.name,
      address: branch.address,
      phone: branch.phone,
      email: branch.email,
    });
    setIsEditModalVisible(true);
  };

  const handleSaveBranch = () => {
    if (!formData.name || !formData.address) {
      Alert.alert('Error', 'Nombre y dirección son obligatorios');
      return;
    }

    if (editingBranch) {
      // Actualizar sucursal existente
      const updatedBranches = availableBranches.map(branch =>
        branch.id === editingBranch.id
          ? {
              ...branch,
              ...formData,
              updated_at: new Date().toISOString(),
            }
          : branch
      );
      setAvailableBranches(updatedBranches);
      Alert.alert('Éxito', `Sucursal ${formData.name} actualizada correctamente`);
    } else {
      // Crear nueva sucursal
      const newBranch: Branch = {
        id: Date.now().toString(),
        ...formData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setAvailableBranches([...availableBranches, newBranch]);
      Alert.alert('Éxito', `Sucursal ${formData.name} creada correctamente`);
    }

    setIsEditModalVisible(false);
    setEditingBranch(null);
    setFormData({ name: '', address: '', phone: '', email: '' });
  };

  const handleCreateBranch = () => {
    setEditingBranch(null);
    setFormData({ name: '', address: '', phone: '', email: '' });
    setIsEditModalVisible(true);
  };

  const handleGeneratePdfBackup = (branch: Branch) => {
    Alert.alert(
      'Generando PDF',
      `Se está generando el catálogo de vinos de ${branch.name}...\n\nEsto puede tardar unos momentos.`,
      [
        {
          text: 'OK',
          onPress: () => {
            // Simular generación de PDF
            setTimeout(() => {
              Alert.alert(
                'PDF Generado',
                `Catálogo de ${branch.name} exportado exitosamente.\n\nArchivo: Catalogo_${branch.name.replace(/\s+/g, '_')}.pdf`,
                [
                  {
                    text: 'Continuar con eliminación',
                    style: 'destructive',
                    onPress: () => confirmDeleteBranch(branch)
                  },
                  {
                    text: 'Cancelar eliminación',
                    style: 'cancel'
                  }
                ]
              );
            }, 1500);
          }
        }
      ]
    );
  };

  const confirmDeleteBranch = (branch: Branch) => {
    Alert.alert(
      '⚠️ CONFIRMACIÓN FINAL',
      `ÚLTIMA ADVERTENCIA:\n\nAl eliminar "${branch.name}" se eliminarán:\n\n• Todo el catálogo de vinos\n• Inventario y stock\n• Personal registrado\n• Historial de ventas\n• Configuraciones\n• Tokens QR activos\n\n¿CONFIRMAS LA ELIMINACIÓN DEFINITIVA?`,
      [
        { text: 'NO, Cancelar', style: 'cancel' },
        {
          text: 'SÍ, Eliminar Todo',
          style: 'destructive',
          onPress: () => {
            setAvailableBranches(availableBranches.filter(b => b.id !== branch.id));
            Alert.alert(
              'Sucursal Eliminada', 
              `${branch.name} y todos sus datos han sido eliminados permanentemente.`
            );
          }
        }
      ]
    );
  };

  const handleDeleteBranch = (branch: Branch) => {
    Alert.alert(
      '⚠️ Eliminar Sucursal',
      `Estás a punto de eliminar: ${branch.name}\n\n🚨 ADVERTENCIA:\nSe eliminará:\n\n• Catálogo de vinos completo\n• Inventario y stock\n• Personal registrado\n• Historial y reportes\n• Configuraciones\n\n¿Deseas generar un PDF del catálogo antes de eliminar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Generar PDF y continuar',
          onPress: () => handleGeneratePdfBackup(branch)
        },
        {
          text: 'Eliminar sin PDF',
          style: 'destructive',
          onPress: () => confirmDeleteBranch(branch)
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Gestión de Sucursales</Text>
        <Text style={styles.subtitle}>Administrar ubicaciones del restaurante</Text>
      </View>

      <View style={styles.createButtonContainer}>
        <TouchableOpacity
          style={styles.createButton}
          onPress={handleCreateBranch}
        >
          <Text style={styles.createButtonText}>➕ Crear Nueva Sucursal</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>
          Sucursales Registradas ({availableBranches.length})
        </Text>

        {availableBranches.map((branch) => (
          <View key={branch.id} style={styles.branchCard}>
            <View style={styles.branchInfo}>
              <Text style={styles.branchName}>{branch.name}</Text>
              <Text style={styles.branchAddress}>📍 {branch.address}</Text>
              <Text style={styles.branchContact}>📞 {branch.phone}</Text>
              <Text style={styles.branchContact}>✉️ {branch.email}</Text>
            </View>
            <View style={styles.branchActions}>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => handleEditBranch(branch)}
              >
                <Text style={styles.editButtonText}>✏️ Editar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeleteBranch(branch)}
              >
                <Text style={styles.deleteButtonText}>🗑️ Eliminar</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Modal de edición/creación */}
      <Modal
        visible={isEditModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>
              {editingBranch ? 'Editar Sucursal' : 'Nueva Sucursal'}
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Nombre *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                  placeholder="Nombre de la sucursal"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Dirección *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.address}
                  onChangeText={(text) => setFormData({ ...formData, address: text })}
                  placeholder="Dirección completa"
                  multiline
                  numberOfLines={2}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Teléfono</Text>
                <TextInput
                  style={styles.input}
                  value={formData.phone}
                  onChangeText={(text) => setFormData({ ...formData, phone: text })}
                  placeholder="+1-555-0123"
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={formData.email}
                  onChangeText={(text) => setFormData({ ...formData, email: text })}
                  placeholder="sucursal@restaurante.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setIsEditModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveBranch}
              >
                <Text style={styles.saveButtonText}>
                  {editingBranch ? 'Guardar' : 'Crear'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  createButtonContainer: {
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  createButton: {
    backgroundColor: '#28a745',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  createButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  branchCard: {
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
  branchInfo: {
    marginBottom: 12,
  },
  branchName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  branchAddress: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  branchContact: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  branchActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    flex: 1,
    backgroundColor: '#007bff',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  editButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#dc3545',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Estilos del modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#8B0000',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default BranchManagementScreen;
