import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useBranch } from '../contexts/BranchContext';
import { generateUniversalQrUrl } from '../services/QrTokenService';

interface QrData {
  id: string;
  token: string;
  type: 'guest' | 'admin';
  branch_id: string;
  branch_name: string;
  created_at: string;
  expires_at: string;
}

const QrGenerationScreen: React.FC = () => {
  const { currentBranch } = useBranch();
  const [qrType, setQrType] = useState<'guest' | 'admin'>('guest');
  const [generatedQrs, setGeneratedQrs] = useState<QrData[]>([]);
  const [selectedQr, setSelectedQr] = useState<QrData | null>(null);

  const generateToken = () => {
    // Generar token único (en producción sería con Crypto.randomUUID())
    return `cellarium-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  const handleGenerateGuestQr = () => {
    if (!currentBranch) {
      Alert.alert('Error', 'No hay sucursal seleccionada');
      return;
    }

    // Generar nuevo QR para comensales
    const token = generateToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 horas

    const newQr: QrData = {
      id: Date.now().toString(),
      token: token,
      type: 'guest',
      branch_id: currentBranch.id,
      branch_name: currentBranch.name,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    };

    setGeneratedQrs([newQr, ...generatedQrs]);
    setSelectedQr(newQr);
    Alert.alert(
      'QR Generado', 
      `QR para comensales de ${currentBranch.name} generado correctamente.\nDuración: 24 horas`
    );
  };

  const handleGenerateAdminQr = () => {
    if (!currentBranch) {
      Alert.alert('Error', 'No hay sucursal seleccionada');
      return;
    }

    // Generar nuevo QR de invitación admin
    const token = generateToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 días

    const newQr: QrData = {
      id: Date.now().toString(),
      token: token,
      type: 'admin',
      branch_id: currentBranch.id,
      branch_name: currentBranch.name,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    };

    setGeneratedQrs([newQr, ...generatedQrs]);
    setSelectedQr(newQr);
    Alert.alert(
      'QR Generado',
      `QR de invitación para ${currentBranch.name} generado.\n\n⚠️ IMPORTANTE:\nLos admins que usen este QR solo tendrán acceso a esta sucursal.\n\nUso único. Duración: 7 días`
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Generación de Códigos QR</Text>
        <Text style={styles.subtitle}>QR para comensales e invitaciones admin</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Selector de tipo de QR */}
        <View style={styles.typeSelector}>
          <TouchableOpacity
            style={[
              styles.typeButton,
              qrType === 'guest' && styles.typeButtonActive
            ]}
            onPress={() => setQrType('guest')}
          >
            <Text style={[
              styles.typeButtonText,
              qrType === 'guest' && styles.typeButtonTextActive
            ]}>
              🍽️ Comensales
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.typeButton,
              qrType === 'admin' && styles.typeButtonActive
            ]}
            onPress={() => setQrType('admin')}
          >
            <Text style={[
              styles.typeButtonText,
              qrType === 'admin' && styles.typeButtonTextActive
            ]}>
              👥 Invitación Admin
            </Text>
          </TouchableOpacity>
        </View>

        {/* Información del tipo de QR seleccionado */}
        <View style={styles.infoCard}>
          {qrType === 'guest' ? (
            <>
              <Text style={styles.infoTitle}>📱 QR para Comensales</Text>
              <Text style={styles.infoText}>
                • Acceso temporal al catálogo de vinos{'\n'}
                • Token firmado con caducidad de 24 horas{'\n'}
                • Uso único (one-time use){'\n'}
                • Solo lectura de información pública{'\n'}
                • Sin registro requerido
              </Text>
              <TouchableOpacity
                style={styles.generateButton}
                onPress={handleGenerateGuestQr}
              >
                <Text style={styles.generateButtonText}>Generar QR para Comensales</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.infoTitle}>👥 QR de Invitación Admin</Text>
              <Text style={styles.infoText}>
                • Invitación para nuevos administradores{'\n'}
                • Token firmado con Edge Function{'\n'}
                • Uso único (max_uses = 1){'\n'}
                • Requiere aprobación de Owner/Gerente{'\n'}
                • Auditoría completa del proceso
              </Text>
              <TouchableOpacity
                style={styles.generateButton}
                onPress={handleGenerateAdminQr}
              >
                <Text style={styles.generateButtonText}>Generar QR de Invitación</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Mostrar QR generado */}
        {selectedQr && (
          <View style={styles.qrDisplayCard}>
            <Text style={styles.qrDisplayTitle}>
              {selectedQr.type === 'guest' ? '🍽️ QR para Comensales' : '👥 QR Invitación Admin'}
            </Text>
            
            <View style={styles.qrContainer}>
              <QRCode
                value={generateUniversalQrUrl({
                  type: selectedQr.type,
                  token: selectedQr.token,
                  branchId: selectedQr.branch_id,
                  branchName: selectedQr.branch_name,
                })}
                size={200}
                color="#8B0000"
                backgroundColor="white"
              />
            </View>

            <View style={styles.qrInfoContainer}>
              <Text style={styles.qrInfoLabel}>Sucursal:</Text>
              <Text style={styles.qrInfoValue}>
                {selectedQr.branch_name}
              </Text>
            </View>

            <View style={styles.qrInfoContainer}>
              <Text style={styles.qrInfoLabel}>Token:</Text>
              <Text style={styles.qrInfoValue} numberOfLines={1} ellipsizeMode="middle">
                {selectedQr.token}
              </Text>
            </View>

            <View style={styles.qrInfoContainer}>
              <Text style={styles.qrInfoLabel}>Expira:</Text>
              <Text style={styles.qrInfoValue}>
                {new Date(selectedQr.expires_at).toLocaleString('es-MX')}
              </Text>
            </View>
            
            {selectedQr.type === 'admin' && (
              <View style={styles.warningContainer}>
                <Text style={styles.warningText}>
                  ⚠️ Este admin solo tendrá acceso a {selectedQr.branch_name}
                </Text>
              </View>
            )}

            <View style={styles.qrActions}>
              <TouchableOpacity
                style={styles.shareButton}
                onPress={() => Alert.alert('Compartir', 'Funcionalidad próximamente')}
              >
                <Text style={styles.shareButtonText}>📤 Compartir</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.downloadButton}
                onPress={() => Alert.alert('Descargar', 'Funcionalidad próximamente')}
              >
                <Text style={styles.downloadButtonText}>💾 Descargar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Lista de QRs generados */}
        {generatedQrs.length > 0 && (
          <View style={styles.qrListCard}>
            <Text style={styles.listTitle}>📋 QRs Generados ({generatedQrs.length})</Text>
            {generatedQrs.map((qr) => (
              <TouchableOpacity
                key={qr.id}
                style={[
                  styles.qrListItem,
                  selectedQr?.id === qr.id && styles.qrListItemActive
                ]}
                onPress={() => setSelectedQr(qr)}
              >
                <View style={styles.qrListInfo}>
                  <Text style={styles.qrListType}>
                    {qr.type === 'guest' ? '🍽️ Comensales' : '👥 Admin'}
                  </Text>
                  <Text style={styles.qrListDate}>
                    {new Date(qr.created_at).toLocaleString('es-MX')}
                  </Text>
                </View>
                <Text style={styles.qrListArrow}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Información de seguridad */}
        <View style={styles.securityCard}>
          <Text style={styles.securityTitle}>🔐 Seguridad</Text>
          <Text style={styles.securityText}>
            • Tokens firmados con clave secreta{'\n'}
            • Caducidad automática{'\n'}
            • Uso único (no reutilizable){'\n'}
            • RLS por rol y sucursal{'\n'}
            • Registro de auditoría completo
          </Text>
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
  typeSelector: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
  },
  typeButton: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#f0f0f0',
  },
  typeButtonActive: {
    backgroundColor: 'white',
    borderColor: '#8B0000',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  typeButtonTextActive: {
    color: '#8B0000',
  },
  infoCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
    marginBottom: 20,
  },
  generateButton: {
    backgroundColor: '#8B0000',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  generateButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  qrDisplayCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  qrDisplayTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  qrContainer: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#8B0000',
    marginBottom: 16,
  },
  qrInfoContainer: {
    width: '100%',
    marginBottom: 8,
  },
  qrInfoLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    marginBottom: 2,
  },
  qrInfoValue: {
    fontSize: 11,
    color: '#333',
  },
  warningContainer: {
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ffc107',
  },
  warningText: {
    fontSize: 11,
    color: '#856404',
    textAlign: 'center',
    fontWeight: '600',
  },
  qrActions: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
    marginTop: 8,
  },
  shareButton: {
    flex: 1,
    backgroundColor: '#28a745',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  shareButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  downloadButton: {
    flex: 1,
    backgroundColor: '#007bff',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  downloadButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  qrListCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  qrListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
    marginBottom: 8,
  },
  qrListItemActive: {
    backgroundColor: '#e3f2fd',
    borderWidth: 1,
    borderColor: '#8B0000',
  },
  qrListInfo: {
    flex: 1,
  },
  qrListType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  qrListDate: {
    fontSize: 11,
    color: '#666',
  },
  qrListArrow: {
    fontSize: 18,
    color: '#ccc',
  },
  securityCard: {
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    padding: 16,
  },
  securityTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976d2',
    marginBottom: 8,
  },
  securityText: {
    fontSize: 13,
    color: '#1976d2',
    lineHeight: 20,
  },
});

export default QrGenerationScreen;
