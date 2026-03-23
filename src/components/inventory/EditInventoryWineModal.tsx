import React from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { CellariumModal } from '../cellarium';
import { InventoryItem } from '../../services/InventoryService';
import { inventoryModalSharedStyles as s } from './inventoryModalSharedStyles';

export interface WineEditFormState {
  name: string;
  winery: string;
  grape_variety: string;
  region: string;
  country: string;
  vintage: string;
  description: string;
  tasting_notes: string;
  price_bottle: string;
  price_glass: string;
  image_url: string;
}

export interface EditInventoryWineModalProps {
  visible: boolean;
  onRequestClose: () => void;
  editingWine: InventoryItem | null;
  wineEditData: WineEditFormState;
  setWineEditData: React.Dispatch<React.SetStateAction<WineEditFormState>>;
  savingWine: boolean;
  uploadingImage: boolean;
  contentPaddingBottom: number;
  onSave: () => void;
}

const EditInventoryWineModal: React.FC<EditInventoryWineModalProps> = ({
  visible,
  onRequestClose,
  editingWine,
  wineEditData,
  setWineEditData,
  savingWine,
  uploadingImage,
  contentPaddingBottom,
  onSave,
}) => (
  <CellariumModal
    visible={visible}
    onRequestClose={onRequestClose}
    title="Editar vino"
    animationType="slide"
    presentation="sheet"
    contentPaddingBottom={contentPaddingBottom}
  >
    {(wineEditData.image_url || (editingWine && editingWine.wines.image_url)) ? (
      <Image
        source={{ uri: wineEditData.image_url || (editingWine?.wines.image_url || '') }}
        style={{
          width: '100%',
          height: 140,
          borderRadius: 10,
          marginBottom: 12,
          backgroundColor: '#f0f0f0',
        }}
        resizeMode="contain"
      />
    ) : null}

    <Text style={s.inputLabel}>Nombre del vino *</Text>
    <TextInput
      style={s.input}
      value={wineEditData.name}
      onChangeText={(text) => setWineEditData((p) => ({ ...p, name: text }))}
    />

    <Text style={s.inputLabel}>Bodega</Text>
    <TextInput
      style={s.input}
      value={wineEditData.winery}
      onChangeText={(text) => setWineEditData((p) => ({ ...p, winery: text }))}
    />

    <Text style={s.inputLabel}>Tipo de uva *</Text>
    <TextInput
      style={s.input}
      value={wineEditData.grape_variety}
      onChangeText={(text) => setWineEditData((p) => ({ ...p, grape_variety: text }))}
    />

    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
      <View style={{ flex: 1 }}>
        <Text style={s.inputLabel}>Región</Text>
        <TextInput
          style={s.input}
          value={wineEditData.region}
          onChangeText={(text) => setWineEditData((p) => ({ ...p, region: text }))}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.inputLabel}>País</Text>
        <TextInput
          style={s.input}
          value={wineEditData.country}
          onChangeText={(text) => setWineEditData((p) => ({ ...p, country: text }))}
        />
      </View>
    </View>

    <Text style={s.inputLabel}>Añada (puedes agregar múltiples separadas por coma: 2020, 2021)</Text>
    <TextInput
      style={s.input}
      value={wineEditData.vintage}
      onChangeText={(text) => setWineEditData((p) => ({ ...p, vintage: text }))}
      keyboardType="default"
      placeholder="Ej: 2020 o 2020, 2021"
      placeholderTextColor="#999"
    />

    <Text style={s.inputLabel}>Precio por botella</Text>
    <TextInput
      style={s.input}
      value={wineEditData.price_bottle}
      onChangeText={(text) => setWineEditData((p) => ({ ...p, price_bottle: text }))}
      keyboardType="decimal-pad"
    />

    <Text style={s.inputLabel}>Precio por copa</Text>
    <TextInput
      style={s.input}
      value={wineEditData.price_glass}
      onChangeText={(text) => setWineEditData((p) => ({ ...p, price_glass: text }))}
      keyboardType="decimal-pad"
    />

    <View style={s.modalButtons}>
      <TouchableOpacity
        style={[s.modalButton, s.cancelBtn]}
        onPress={onRequestClose}
        disabled={savingWine || uploadingImage}
      >
        <Text style={s.cancelBtnText}>Cancelar</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.modalButton, s.confirmBtn]}
        onPress={onSave}
        disabled={savingWine || uploadingImage}
      >
        {savingWine ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={s.confirmBtnText}>Guardar</Text>
        )}
      </TouchableOpacity>
    </View>
  </CellariumModal>
);

export default EditInventoryWineModal;
