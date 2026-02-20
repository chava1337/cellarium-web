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
  ActivityIndicator,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, Branch } from '../types';
import { useBranch } from '../contexts/BranchContext';
import { useAuth } from '../contexts/AuthContext';
import { useAdminGuard } from '../hooks/useAdminGuard';
import { PendingApprovalMessage } from '../components/PendingApprovalMessage';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { mapSupabaseErrorToUi } from '../utils/supabaseErrorMapper';
import { getBranchLimit, canCreateBranch } from '../utils/branchLimit';

type BranchManagementScreenNavigationProp = StackNavigationProp<RootStackParamList, 'BranchManagement'>;
type BranchManagementScreenRouteProp = RouteProp<RootStackParamList, 'BranchManagement'>;

interface Props {
  navigation: BranchManagementScreenNavigationProp;
  route: BranchManagementScreenRouteProp;
}

const BranchManagementScreen: React.FC<Props> = ({ navigation, route }) => {
  const { status: guardStatus } = useAdminGuard({ navigation, route });
  const { availableBranches, setAvailableBranches, refreshBranches, setCurrentBranch } = useBranch();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
  });

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

  const handleSaveBranch = async () => {
    if (!formData.name.trim()) {
      Alert.alert(t('msg.error'), t('branches.name_required'));
      return;
    }

    if (!user) {
      Alert.alert(t('msg.error'), t('branches.auth_required'));
      return;
    }

    try {
      if (editingBranch) {
        // Actualizar sucursal existente en Supabase (solo nombre)
        const { data, error } = await supabase
          .from('branches')
          .update({
            name: formData.name.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingBranch.id)
          .select()
          .single();

        if (error) throw error;

        // Actualizar estado local
        const updatedBranches = availableBranches.map(branch =>
          branch.id === editingBranch.id ? data : branch
        );
        setAvailableBranches(updatedBranches);
        Alert.alert('Éxito', `Sucursal ${formData.name} actualizada correctamente`);
      } else {
        const currentCount = availableBranches.length;
        const { limit } = getBranchLimit(user);
        if (!canCreateBranch(user, currentCount)) {
          const message = t('subscription.limit_branches_message')
            .replace('{current}', String(currentCount))
            .replace('{limit}', String(limit));
          Alert.alert(
            t('subscription.limit_title'),
            message,
            [
              { text: t('btn.close'), style: 'cancel' },
              { text: t('subscription.view_plans'), onPress: () => navigation.navigate('Subscriptions') },
            ]
          );
          return;
        }

        const ownerId = user.owner_id || user.id;
        const { data, error } = await supabase
          .from('branches')
          .insert({
            name: formData.name.trim(),
            owner_id: ownerId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) throw error;

        await refreshBranches();
        if (data) setCurrentBranch(data);
        Alert.alert(t('msg.success'), `${t('branches.title')} ${formData.name} ${t('branches.create_success')}`);
      }

      setIsEditModalVisible(false);
      setEditingBranch(null);
      setFormData({ name: '', address: '', phone: '', email: '' });
    } catch (error: any) {
      console.error('Error guardando sucursal:', error);
      
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
  };

  const handleCreateBranch = () => {
    setEditingBranch(null);
    setFormData({ name: '', address: '', phone: '', email: '' });
    setIsEditModalVisible(true);
  };

  const handleGeneratePdfBackup = (branch: Branch) => {
    Alert.alert(
      t('branches.generate_pdf'),
      `${t('branches.pdf_generating')} ${branch.name}...\n\n${t('branches.pdf_generating_note')}`,
      [
        {
          text: 'OK',
          onPress: () => {
            // Simular generación de PDF
            setTimeout(() => {
              Alert.alert(
                t('branches.pdf_generated'),
                `${t('branches.pdf_exported')} ${branch.name} ${t('branches.pdf_exported_success')}\n\nArchivo: Catalogo_${branch.name.replace(/\s+/g, '_')}.pdf`,
                [
                  {
                    text: t('branches.continue_deletion'),
                    style: 'destructive',
                    onPress: () => confirmDeleteBranch(branch)
                  },
                  {
                    text: t('branches.cancel_deletion'),
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

  const confirmDeleteBranch = async (branch: Branch) => {
    Alert.alert(
      t('branches.delete_confirm'),
      `${t('branches.delete_confirm_details')} "${branch.name}" ${t('branches.delete_confirm_list')}\n\n${t('branches.delete_confirm_question')}`,
      [
        { text: `NO, ${t('btn.cancel')}`, style: 'cancel' },
        {
          text: `SÍ, ${t('btn.delete')} Todo`,
          style: 'destructive',
          onPress: async () => {
            try {
              // Eliminar de Supabase
              const { error } = await supabase
                .from('branches')
                .delete()
                .eq('id', branch.id);

              if (error) throw error;

              // Actualizar estado local
              setAvailableBranches(availableBranches.filter(b => b.id !== branch.id));
              Alert.alert(
                t('branches.delete_success'), 
                `${branch.name} ${t('branches.delete_success_details')}`
              );
            } catch (error: any) {
              console.error('Error eliminando sucursal:', error);
              Alert.alert(t('msg.error'), error.message || t('branches.delete_error'));
            }
          }
        }
      ]
    );
  };

  const handleDeleteBranch = (branch: Branch) => {
    Alert.alert(
      `⚠️ ${t('branches.delete')}`,
      `${t('branches.delete_warning')} ${branch.name}\n\n${t('branches.delete_warning_details')}\n\n¿Deseas generar un PDF del catálogo antes de eliminar?`,
      [
        { text: t('btn.cancel'), style: 'cancel' },
        {
          text: t('branches.generate_pdf_continue'),
          onPress: () => handleGeneratePdfBackup(branch)
        },
        {
          text: t('branches.delete_without_pdf'),
          style: 'destructive',
          onPress: () => confirmDeleteBranch(branch)
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('branches.title')}</Text>
        <Text style={styles.subtitle}>{t('branches.subtitle')}</Text>
      </View>

      <View style={styles.createButtonContainer}>
        <TouchableOpacity
          style={styles.createButton}
          onPress={handleCreateBranch}
        >
          <Text style={styles.createButtonText}>➕ {t('branches.create_branch')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>
          {t('branches.registered')} ({availableBranches.length})
        </Text>

        {availableBranches.map((branch) => (
          <View key={branch.id} style={styles.branchCard}>
            <View style={styles.branchInfo}>
              <Text style={styles.branchName}>
                {branch.name}
                {branch.is_main && <Text style={styles.mainBadge}> {' ⭐ Principal'}</Text>}
              </Text>
            </View>
            <View style={styles.branchActions}>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => handleEditBranch(branch)}
              >
                <Text style={styles.editButtonText}>✏️ Editar</Text>
              </TouchableOpacity>
              {!branch.is_main && (
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeleteBranch(branch)}
                >
                  <Text style={styles.deleteButtonText}>🗑️ Eliminar</Text>
                </TouchableOpacity>
              )}
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
              {editingBranch ? t('branches.edit_branch') : t('branches.add_branch')}
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>{t('branches.name')} *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                  placeholder={`Ej: ${t('branches.main')}`}
                  autoFocus={true}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setIsEditModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>{t('btn.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveBranch}
              >
                <Text style={styles.saveButtonText}>
                  {editingBranch ? t('btn.save') : t('btn.add')}
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
  mainBadge: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFA500',
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
