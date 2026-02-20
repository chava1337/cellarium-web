import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
  TextInput,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Share from 'react-native-share';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { useBranch } from '../contexts/BranchContext';
import { useAuth } from '../contexts/AuthContext';
import { generateUniversalQrUrl } from '../services/QrTokenService';
import { createGuestQrToken, generateQrToken, getUserQrTokens, GeneratedQrToken, type GuestQrDuration } from '../services/QrGenerationService';
import { canGenerateGuestQr, canGenerateAdminInviteQr } from '../utils/permissions';

interface QrData {
  id: string;
  token: string;
  type: 'guest' | 'admin';
  branch_id: string;
  branch_name: string;
  created_at: string;
  expires_at: string;
}

const GUEST_DURATION_LABELS: Record<GuestQrDuration, string> = {
  '1w': '1 semana',
  '2w': '2 semanas',
  '1m': '1 mes',
};

const QrGenerationScreen: React.FC = () => {
  const { currentBranch } = useBranch();
  const { user, profileReady } = useAuth();
  const [qrType, setQrType] = useState<'guest' | 'admin'>('guest');
  const [guestDuration, setGuestDuration] = useState<GuestQrDuration>('1w');
  const [generatedQrs, setGeneratedQrs] = useState<GeneratedQrToken[]>([]);
  const [selectedQr, setSelectedQr] = useState<GeneratedQrToken | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [qrUrlToShare, setQrUrlToShare] = useState('');
  const [sharingImage, setSharingImage] = useState(false);
  const qrSvgRef = useRef<any>(null);

  const canGenerateGuest = canGenerateGuestQr(user ?? null, currentBranch?.id ?? null);
  const isWrongBranchForStaff = (user?.role === 'gerente' || user?.role === 'supervisor') &&
    currentBranch?.id != null && user?.branch_id != null && currentBranch.id !== user.branch_id;

  const loadUserTokens = useCallback(async () => {
    if (!user?.id) return;
    setLoadingTokens(true);
    try {
      const tokens = await getUserQrTokens(user.id);
      setGeneratedQrs(tokens);
    } catch (error) {
      console.error('Error loading user tokens:', error);
      Alert.alert('Error', 'No se pudieron cargar los códigos QR existentes');
    } finally {
      setLoadingTokens(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) loadUserTokens();
  }, [user?.id, loadUserTokens]);

  if (!profileReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa' }}>
        <ActivityIndicator size="large" color="#8B0000" />
      </View>
    );
  }

  const handleGenerateGuestQr = async () => {
    if (!currentBranch || !user?.id) {
      Alert.alert('Error', 'No hay sucursal seleccionada o usuario no autenticado');
      return;
    }
    if (!canGenerateGuest || isWrongBranchForStaff) {
      Alert.alert('Error', 'No tienes permiso para generar QR en esta sucursal.');
      return;
    }

    setLoading(true);
    try {
      const newQr = await createGuestQrToken(currentBranch.id, guestDuration, 100);

      setGeneratedQrs(prev => [newQr, ...prev]);
      setSelectedQr(newQr);
      Alert.alert(
        'QR Generado',
        `QR para comensales de ${currentBranch.name} generado correctamente.\nDuración: ${GUEST_DURATION_LABELS[guestDuration]}`
      );
    } catch (error) {
      console.error('Error generating guest QR:', error);
      Alert.alert('Error', 'No se pudo generar el código QR para comensales');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAdminQr = async () => {
    if (!currentBranch || !user?.id) {
      Alert.alert('Error', 'No hay sucursal seleccionada o usuario no autenticado');
      return;
    }

    setLoading(true);
    try {
      const newQr = await generateQrToken({
        type: 'admin_invite',
        branchId: currentBranch.id,
        createdBy: user.id,
        ownerId: user.owner_id || user.id, // Owner del usuario (o el mismo si es owner)
        expiresInHours: 24 * 7, // 7 días
        maxUses: 1, // Uso único para admin
      });

      setGeneratedQrs(prev => [newQr, ...prev]);
      setSelectedQr(newQr);
      Alert.alert(
        'QR Generado',
        `QR de invitación para ${currentBranch.name} generado.\n\n⚠️ IMPORTANTE:\nLos admins que usen este QR solo tendrán acceso a esta sucursal.\n\nUso único. Duración: 7 días`
      );
    } catch (error) {
      console.error('Error generating admin QR:', error);
      
      // Mensaje específico según el rol del usuario
      if (user.role === 'sommelier' || user.role === 'supervisor') {
        Alert.alert(
          'Permisos Insuficientes',
          'No tienes los permisos suficientes para generar códigos QR de invitación de administradores.\n\nSolo los propietarios y gerentes pueden crear este tipo de códigos.'
        );
      } else {
        Alert.alert('Error', 'No se pudo generar el código QR de invitación');
      }
    } finally {
      setLoading(false);
    }
  };

  const getQrUrl = useCallback(() => {
    if (!selectedQr) return '';
    return generateUniversalQrUrl({
      type: selectedQr.type === 'admin_invite' ? 'admin' : selectedQr.type,
      token: selectedQr.token,
      branchId: selectedQr.branchId,
      branchName: selectedQr.branchName,
    });
  }, [selectedQr]);

  const getShareMessage = useCallback(() => {
    if (!selectedQr) return '';
    const guestExpiryLabel = selectedQr.type === 'guest' && selectedQr.expiresAt
      ? `Válido hasta ${new Date(selectedQr.expiresAt).toLocaleDateString('es-MX', { dateStyle: 'long' })}`
      : 'Válido temporalmente';
    return selectedQr.type === 'guest'
      ? `Escanea este código QR para acceder al catálogo de vinos de ${selectedQr.branchName}. ${guestExpiryLabel}.`
      : `Código QR de invitación para ${selectedQr.branchName}. Válido por 7 días. Uso único.`;
  }, [selectedQr]);

  const handleShareAsImage = async () => {
    if (!selectedQr) return;

    const qrUrl = getQrUrl();
    if (Platform.OS === 'web') {
      setQrUrlToShare(qrUrl);
      setShareModalVisible(true);
      return;
    }

    setSharingImage(true);
    try {
      const svg = qrSvgRef.current;
      if (!svg || typeof svg.toDataURL !== 'function') {
        throw new Error('QR no listo');
      }

      const dataURL: string = await new Promise((resolve, reject) => {
        svg.toDataURL((data: string) => {
          if (data) resolve(data);
          else reject(new Error('No se pudo generar la imagen del QR'));
        });
      });

      const base64 = dataURL.startsWith('data:image')
        ? dataURL.replace(/^data:image\/\w+;base64,/, '')
        : dataURL;

      const filename = `cellarium-qr-${Date.now()}.png`;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const isSharingAvailable = await Sharing.isAvailableAsync();
      if (!isSharingAvailable) {
        throw new Error('Compartir no disponible');
      }

      await Sharing.shareAsync(fileUri, {
        mimeType: 'image/png',
        dialogTitle: 'Compartir QR Cellarium',
      });

      try {
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      } catch (_) {}
    } catch (error: any) {
      if (error?.message === 'User did not share') {
        return;
      }
      setQrUrlToShare(qrUrl);
      setShareModalVisible(true);
      Alert.alert(
        'Compartir como enlace',
        'No se pudo compartir la imagen. Se abrió la opción de copiar el enlace.',
        [{ text: 'OK' }]
      );
    } finally {
      setSharingImage(false);
    }
  };

  const handleCopyLink = async () => {
    if (!selectedQr) return;
    const url = getQrUrl();
    await Clipboard.setStringAsync(url);
    Alert.alert('Enlace copiado', 'El enlace del QR se copió al portapapeles.');
  };

  const handleCopyMessage = async () => {
    if (!selectedQr) return;
    const msg = getShareMessage();
    await Clipboard.setStringAsync(msg);
    Alert.alert('Mensaje copiado', 'El texto se copió al portapapeles.');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Generación de Códigos QR</Text>
          <Text style={styles.subtitle}>{currentBranch?.name}</Text>
        </View>
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
              <Text style={styles.infoText}>
                Acceso temporal al catálogo de vinos de la sucursal
              </Text>
              {/* Selector de duración: 1w / 2w / 1m */}
              <View style={styles.durationSelector}>
                {(['1w', '2w', '1m'] as const).map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[
                      styles.durationOption,
                      guestDuration === d && styles.durationOptionActive,
                    ]}
                    onPress={() => setGuestDuration(d)}
                  >
                    <Text style={[
                      styles.durationOptionText,
                      guestDuration === d && styles.durationOptionTextActive,
                    ]}>
                      {GUEST_DURATION_LABELS[d]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {isWrongBranchForStaff ? (
                <View style={styles.restrictedAccessCard}>
                  <Text style={styles.restrictedAccessTitle}>Sucursal no asignada</Text>
                  <Text style={styles.restrictedAccessText}>
                    Solo puedes generar QR para tu sucursal asignada.
                  </Text>
                </View>
              ) : !canGenerateGuest ? (
                <View style={styles.restrictedAccessCard}>
                  <Text style={styles.restrictedAccessTitle}>🚫 Sin permiso</Text>
                  <Text style={styles.restrictedAccessText}>
                    Tu plan o rol no permite generar QR para comensales en esta sucursal.
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.generateButton, loading && styles.generateButtonDisabled]}
                  onPress={handleGenerateGuestQr}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.generateButtonText}>Generar QR para Comensales</Text>
                  )}
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              <Text style={styles.infoText}>
                Invitación para nuevo staff{'\n'}
                Uso único{'\n'}
                Requiere aprobación de owner/gerente
              </Text>
              {/* Solo mostrar botón si el usuario tiene permisos */}
              {canGenerateAdminInviteQr((user?.role ?? 'personal') as 'owner' | 'gerente' | 'sommelier' | 'supervisor' | 'personal') ? (
                <TouchableOpacity
                  style={[styles.generateButton, loading && styles.generateButtonDisabled]}
                  onPress={handleGenerateAdminQr}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.generateButtonText}>Generar QR de Invitación</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={styles.restrictedAccessCard}>
                  <Text style={styles.restrictedAccessTitle}>🚫 Acceso Restringido</Text>
                  <Text style={styles.restrictedAccessText}>
                    No tienes los permisos suficientes para generar códigos QR de invitación de administradores.
                  </Text>
                  <Text style={styles.restrictedAccessText}>
                    Solo los propietarios y gerentes pueden crear este tipo de códigos.
                  </Text>
                </View>
              )}
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
                getRef={(c: any) => { qrSvgRef.current = c; }}
                value={generateUniversalQrUrl({
                  type: selectedQr.type === 'admin_invite' ? 'admin' : selectedQr.type,
                  token: selectedQr.token,
                  branchId: selectedQr.branchId,
                  branchName: selectedQr.branchName,
                })}
                size={200}
                color="#8B0000"
                backgroundColor="white"
              />
            </View>

            <View style={styles.qrInfoContainer}>
              <Text style={styles.qrInfoLabel}>Sucursal:</Text>
              <Text style={styles.qrInfoValue}>
                {selectedQr.branchName || 'No especificada'}
              </Text>
            </View>

            <View style={styles.qrInfoContainer}>
              <Text style={styles.qrInfoLabel}>Expira:</Text>
              <Text style={styles.qrInfoValue}>
                {selectedQr.expiresAt 
                  ? new Date(selectedQr.expiresAt).toLocaleString('es-MX', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  : 'No especificada'}
              </Text>
            </View>
            
            {selectedQr.type === 'admin_invite' && (
              <View style={styles.warningContainer}>
                <Text style={styles.warningText}>
                  ⚠️ Este admin solo tendrá acceso a {selectedQr.branchName}
                </Text>
              </View>
            )}

            <View style={styles.qrActions}>
              <TouchableOpacity
                style={[styles.shareButton, styles.shareButtonPrimary]}
                onPress={handleShareAsImage}
                disabled={sharingImage}
              >
                {sharingImage ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.shareButtonText}>📤 Compartir QR (imagen)</Text>
                )}
              </TouchableOpacity>
              <View style={styles.qrActionsRow}>
                <TouchableOpacity
                  style={[styles.shareButton, styles.shareButtonSecondary]}
                  onPress={handleCopyLink}
                >
                  <Text style={styles.shareButtonTextSecondary}>🔗 Copiar link</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.shareButton, styles.shareButtonSecondary]}
                  onPress={handleCopyMessage}
                >
                  <Text style={styles.shareButtonTextSecondary}>📋 Copiar mensaje</Text>
                </TouchableOpacity>
              </View>
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
                    {qr.type === 'guest' 
                      ? '🍽️ Comensales' 
                      : (qr.createdByRole 
                          ? `👥 ${qr.createdByRole.charAt(0).toUpperCase() + qr.createdByRole.slice(1)}`
                          : '👥 Admin')}
                  </Text>
                  <Text style={styles.qrListDate}>
                    {new Date(qr.createdAt).toLocaleString('es-MX')}
                  </Text>
                  {qr.createdByName && (
                    <Text style={styles.qrListCreator}>
                      {qr.createdByName}
                    </Text>
                  )}
                  {!qr.createdByName && qr.createdByEmail && (
                    <Text style={styles.qrListCreator}>
                      {qr.createdByEmail}
                    </Text>
                  )}
                </View>
                <Text style={styles.qrListArrow}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Modal para compartir enlace */}
      <Modal
        visible={shareModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShareModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Compartir código QR</Text>
            <Text style={styles.modalSubtitle}>
              Copia el enlace y compártelo en cualquier aplicación
            </Text>
            
            <TextInput
              style={styles.modalInput}
              value={qrUrlToShare}
              selectTextOnFocus={true}
              editable={false}
              multiline={true}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => setShareModalVisible(false)}
              >
                <Text style={styles.modalButtonTextSecondary}>Cerrar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={async () => {
                  if (qrUrlToShare) await Clipboard.setStringAsync(qrUrlToShare);
                  setShareModalVisible(false);
                  Alert.alert('Enlace copiado', 'El enlace se copió al portapapeles.');
                }}
              >
                <Text style={styles.modalButtonTextPrimary}>Copiar enlace</Text>
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
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  durationSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  durationOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  durationOptionActive: {
    backgroundColor: '#8B0000',
  },
  durationOptionText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  durationOptionTextActive: {
    color: 'white',
  },
  generateButton: {
    backgroundColor: '#8B0000',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  generateButtonDisabled: {
    backgroundColor: '#ccc',
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
    width: '100%',
    marginTop: 8,
    gap: 10,
  },
  qrActionsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
  },
  shareButton: {
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  shareButtonPrimary: {
    backgroundColor: '#28a745',
    width: '100%',
  },
  shareButtonSecondary: {
    backgroundColor: '#f0f0f0',
    flex: 1,
  },
  shareButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  shareButtonTextSecondary: {
    color: '#333',
    fontSize: 13,
    fontWeight: '600',
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
  qrListCreator: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  qrListArrow: {
    fontSize: 18,
    color: '#ccc',
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
    marginBottom: 20,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    fontSize: 12,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 20,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: '#8B0000',
  },
  modalButtonSecondary: {
    backgroundColor: '#f0f0f0',
  },
  modalButtonTextPrimary: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonTextSecondary: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  restrictedAccessCard: {
    backgroundColor: '#fff3cd',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ffeaa7',
    marginTop: 12,
  },
  restrictedAccessTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#856404',
    marginBottom: 8,
    textAlign: 'center',
  },
  restrictedAccessText: {
    fontSize: 13,
    color: '#856404',
    lineHeight: 18,
    marginBottom: 4,
    textAlign: 'center',
  },
});

export default QrGenerationScreen;
