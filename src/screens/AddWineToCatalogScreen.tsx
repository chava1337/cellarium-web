import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { useLanguage } from '../contexts/LanguageContext';
import { addWineToUserCatalog, getBilingualValue } from '../services/GlobalWineCatalogService';
import { mapSupabaseErrorToUi } from '../utils/supabaseErrorMapper';

type Props = StackScreenProps<RootStackParamList, 'AddWineToCatalog'>;

const AddWineToCatalogScreen: React.FC<Props> = ({ route, navigation }) => {
  const { wine } = route.params;
  const { user, profileReady } = useAuth();
  const { currentBranch } = useBranch();
  const { t } = useLanguage();

  const [priceBottle, setPriceBottle] = useState('');
  const [priceGlass, setPriceGlass] = useState('');
  const [stock, setStock] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hasWarnedForBranchName, setHasWarnedForBranchName] = useState(false);

  useEffect(() => {
    if (hasWarnedForBranchName) return;

    const branchName = currentBranch?.name?.trim();
    if (branchName) return;

    setHasWarnedForBranchName(true);

    const isOwner = user?.role === 'owner';
    const title = 'Nombre del restaurante requerido';
    const message = isOwner
      ? 'Antes de agregar vinos debes definir el nombre de tu restaurante o centro de consumo. Puedes editarlo desde Gestión de Sucursales.'
      : 'El owner debe definir el nombre del restaurante o centro de consumo antes de agregar vinos. Contacta al responsable para que lo configure.';

    const buttons = isOwner
      ? [
          { text: 'Volver', style: 'cancel' as const, onPress: () => navigation.goBack() },
          { text: 'Configurar ahora', onPress: () => navigation.replace('BranchManagement') },
        ]
      : [
          { text: 'Entendido', onPress: () => navigation.goBack() },
        ];

    Alert.alert(title, message, buttons);
  }, [currentBranch, hasWarnedForBranchName, navigation, user?.role]);

  const onSubmit = async () => {
    if (!user || !profileReady || !currentBranch) {
      Alert.alert('Error', 'Usuario o sucursal no identificados');
      return;
    }

    const branchName = currentBranch.name?.trim();
    if (!branchName) {
      const isOwner = user.role === 'owner';
      Alert.alert(
        'Nombre del restaurante requerido',
        isOwner
          ? 'Define el nombre de tu restaurante o centro de consumo antes de agregar vinos.'
          : 'Contacta al owner para que defina el nombre del restaurante o centro de consumo.',
        isOwner
          ? [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Ir a Gestión', onPress: () => navigation.replace('BranchManagement') },
            ]
          : [{ text: 'Entendido', style: 'default' }]
      );
      return;
    }

    const tenantId = user.owner_id || user.id;
    const bottle = priceBottle ? Number(priceBottle) : undefined;
    const glass = priceGlass ? Number(priceGlass) : undefined;
    const qty = stock ? Number(stock) : undefined;

    if (bottle != null && isNaN(bottle)) {
      Alert.alert('Dato inválido', 'Precio por botella no es un número');
      return;
    }
    if (glass != null && isNaN(glass)) {
      Alert.alert('Dato inválido', 'Precio por copa no es un número');
      return;
    }
    if (qty != null && isNaN(qty)) {
      Alert.alert('Dato inválido', 'Stock debe ser un número');
      return;
    }

    try {
      setSubmitting(true);
      await addWineToUserCatalog({
        tenantId,
        branchId: currentBranch.id,
        userId: user.id,
        canonicalWineId: wine.id,
        price: bottle,
        priceGlass: glass,
        initialQty: qty,
        canonicalWine: wine,
      });

      Alert.alert('✅ Vino agregado', 'Se agregó correctamente al catálogo', [
        { 
          text: 'OK', 
          onPress: () => {
            // Notificar a la pantalla anterior que se actualice la lista
            navigation.goBack();
          }
        },
      ]);
    } catch (e: any) {
      console.error('add wine error', e);
      
      // Mapear error de Supabase a UI amigable
      const errorUi = mapSupabaseErrorToUi(e, t);
      
      // Mostrar Alert con CTA si aplica
      const alertButtons: any[] = [{ text: t('btn.close') }];
      if (errorUi.ctaAction === 'subscriptions' && errorUi.ctaLabel) {
        alertButtons.push({
          text: errorUi.ctaLabel,
          onPress: () => navigation.navigate('Subscriptions'),
        });
      }
      
      Alert.alert(errorUi.title, errorUi.message, alertButtons);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Agregar al Catálogo</Text>
        <Text style={styles.subtitle}>
          {getBilingualValue(wine.label) || getBilingualValue(wine.winery) || 'Vino'}
        </Text>

        <View style={styles.field}> 
          <Text style={styles.label}>Precio por botella</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. 450"
            keyboardType="numeric"
            value={priceBottle}
            onChangeText={setPriceBottle}
          />
        </View>

        <View style={styles.field}> 
          <Text style={styles.label}>Precio por copa (opcional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. 120"
            keyboardType="numeric"
            value={priceGlass}
            onChangeText={setPriceGlass}
          />
        </View>

        <View style={styles.field}> 
          <Text style={styles.label}>Stock inicial (opcional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. 6"
            keyboardType="numeric"
            value={stock}
            onChangeText={setStock}
          />
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.btnSecondary]} disabled={submitting} onPress={() => navigation.goBack()}>
            <Text style={styles.btnText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} disabled={submitting} onPress={onSubmit}>
            <Text style={styles.btnText}>{submitting ? 'Guardando…' : 'Guardar'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#fff',
    flexGrow: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#8B0000',
  },
  subtitle: {
    fontSize: 16,
    color: '#555',
    marginBottom: 20,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: '#333',
    marginBottom: 6,
  },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnPrimary: {
    backgroundColor: '#8B0000',
  },
  btnSecondary: {
    backgroundColor: '#666',
  },
  btnText: {
    color: '#fff',
    fontWeight: '600',
  },
});

export default AddWineToCatalogScreen;








