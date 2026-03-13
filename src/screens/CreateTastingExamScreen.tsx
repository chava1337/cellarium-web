import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, Wine } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { TastingExamService } from '../services/TastingExamService';
import { canCreateTastingExam } from '../utils/rolePermissions';

type CreateTastingExamScreenNavigationProp = StackNavigationProp<RootStackParamList, 'CreateTastingExam'>;

interface Props {
  navigation: CreateTastingExamScreenNavigationProp;
}

const CreateTastingExamScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const { currentBranch } = useBranch();
  const [name, setName] = useState('');

  if (user && !canCreateTastingExam(user.role as 'owner' | 'gerente' | 'sommelier' | 'supervisor' | 'personal')) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa', padding: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', color: '#333', textAlign: 'center' }}>Sin permiso</Text>
        <Text style={{ marginTop: 8, fontSize: 14, color: '#666', textAlign: 'center' }}>
          Solo propietarios, gerentes y sommeliers pueden crear exámenes de cata.
        </Text>
        <TouchableOpacity style={{ marginTop: 16, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#8B0000', borderRadius: 8 }} onPress={() => navigation.goBack()}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }
  const [description, setDescription] = useState('');
  const [availableWines, setAvailableWines] = useState<Wine[]>([]);
  const [selectedWineIds, setSelectedWineIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadAvailableWines();
  }, [currentBranch, user]);

  const loadAvailableWines = async () => {
    if (!currentBranch || !user) return;

    try {
      setLoading(true);
      const ownerId = user.owner_id || user.id;
      const wines = await TastingExamService.getAvailableWines(currentBranch.id, ownerId);
      setAvailableWines(wines);
    } catch (error: any) {
      console.error('Error loading wines:', error);
      Alert.alert('Error', error.message || 'No se pudieron cargar los vinos');
    } finally {
      setLoading(false);
    }
  };

  const toggleWineSelection = (wineId: string) => {
    const newSelection = new Set(selectedWineIds);
    if (newSelection.has(wineId)) {
      newSelection.delete(wineId);
    } else {
      newSelection.add(wineId);
    }
    setSelectedWineIds(newSelection);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'El nombre del examen es requerido');
      return;
    }

    if (selectedWineIds.size === 0) {
      Alert.alert('Error', 'Debes seleccionar al menos un vino para el examen');
      return;
    }

    if (!currentBranch || !user) {
      Alert.alert('Error', 'No hay sucursal o usuario seleccionado');
      return;
    }

    try {
      setSubmitting(true);
      const ownerId = user.owner_id || user.id;
      
      await TastingExamService.createExam({
        branchId: currentBranch.id,
        ownerId,
        userId: user.id,
        name: name.trim(),
        description: description.trim() || undefined,
        wineIds: Array.from(selectedWineIds),
      });

      Alert.alert('Éxito', 'Examen creado correctamente', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error: any) {
      console.error('Error creating exam:', error);
      Alert.alert('Error', error.message || 'No se pudo crear el examen');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Crear Examen de Cata</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B0000" />
          <Text style={styles.loadingText}>Cargando vinos...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Crear Examen de Cata</Text>
        <Text style={styles.headerSubtitle}>
          Selecciona los vinos que formarán parte de este examen
        </Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Formulario */}
        <View style={styles.formSection}>
          <Text style={styles.label}>Nombre del Examen *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Examen de Cata - Vinos Tintos"
            value={name}
            onChangeText={setName}
            maxLength={100}
          />

          <Text style={styles.label}>Descripción (opcional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Descripción del examen..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            maxLength={500}
          />
        </View>

        {/* Selección de vinos */}
        <View style={styles.winesSection}>
          <Text style={styles.sectionTitle}>
            Vinos del Catálogo ({selectedWineIds.size} seleccionado{selectedWineIds.size !== 1 ? 's' : ''})
          </Text>
          <Text style={styles.sectionSubtitle}>
            Selecciona los vinos que formarán parte de este examen
          </Text>

          {availableWines.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No hay vinos disponibles en el catálogo</Text>
              <Text style={styles.emptySubtext}>
                Agrega vinos al catálogo desde "Catálogo Cellarium" o "Escanear botella"
              </Text>
            </View>
          ) : (
            availableWines.map((wine) => {
              const isSelected = selectedWineIds.has(wine.id);
              return (
                <TouchableOpacity
                  key={wine.id}
                  style={[styles.wineCard, isSelected && styles.wineCardSelected]}
                  onPress={() => toggleWineSelection(wine.id)}
                >
                  {wine.image_url && (
                    <Image
                      source={{ uri: wine.image_url }}
                      style={styles.wineImage}
                      resizeMode="contain"
                    />
                  )}
                  <View style={styles.wineInfo}>
                    <Text style={styles.wineName}>{wine.name}</Text>
                    {wine.winery && (
                      <Text style={styles.wineWinery}>{wine.winery}</Text>
                    )}
                    {wine.vintage && (
                      <Text style={styles.wineVintage}>Añada: {wine.vintage}</Text>
                    )}
                    {wine.type && (
                      <Text style={styles.wineType}>
                        Tipo: {wine.type.charAt(0).toUpperCase() + wine.type.slice(1)}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Botones */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={() => navigation.goBack()}
            disabled={submitting}
          >
            <Text style={styles.buttonText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.submitButton, submitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting || selectedWineIds.size === 0 || !name.trim()}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Crear Examen</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    padding: 20,
    backgroundColor: '#8B0000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  formSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
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
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  winesSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  wineCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  wineCardSelected: {
    borderColor: '#8B0000',
    backgroundColor: '#fff5f5',
  },
  wineImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  wineInfo: {
    flex: 1,
  },
  wineName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  wineWinery: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  wineVintage: {
    fontSize: 12,
    color: '#999',
    marginBottom: 2,
  },
  wineType: {
    fontSize: 12,
    color: '#999',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  checkboxSelected: {
    backgroundColor: '#8B0000',
    borderColor: '#8B0000',
  },
  checkmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    marginBottom: 20,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#6c757d',
  },
  submitButton: {
    backgroundColor: '#8B0000',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default CreateTastingExamScreen;



