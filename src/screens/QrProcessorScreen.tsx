import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { validateQrToken, QrTokenData } from '../services/QrTokenService';
import Constants from 'expo-constants';

type QrProcessorScreenNavigationProp = StackNavigationProp<RootStackParamList, 'QrProcessor'>;
type QrProcessorScreenRouteProp = RouteProp<RootStackParamList, 'QrProcessor'>;

interface Props {
  navigation: QrProcessorScreenNavigationProp;
  route: QrProcessorScreenRouteProp;
}

const QrProcessorScreen: React.FC<Props> = ({ navigation, route }) => {
  const [status, setStatus] = useState<'validating' | 'success' | 'error'>('validating');
  const [message, setMessage] = useState('Validando código QR...');

  useEffect(() => {
    processQrCode();
  }, []);

  const processQrCode = async () => {
    try {
      // Obtener datos del QR desde los parámetros de navegación
      const qrData = route.params?.qrData;
      const token = route.params?.token;

      if (!qrData && !token) {
        setStatus('error');
        setMessage('Código QR inválido. Por favor, escanea de nuevo.');
        setTimeout(() => navigation.navigate('Login'), 3000);
        return;
      }

      // Validar el token
      let tokenToValidate: string;
      if (typeof qrData === 'string') {
        tokenToValidate = qrData;
      } else if (token) {
        tokenToValidate = token;
      } else {
        tokenToValidate = JSON.stringify(qrData);
      }

      const validation = await validateQrToken(tokenToValidate);

      if (!validation.valid) {
        setStatus('error');
        setMessage(validation.error || 'Código QR inválido');
        setTimeout(() => navigation.navigate('Login'), 3000);
        return;
      }

      // Token válido - procesar según el tipo
      const data = validation.data!;
      
      if (data.type === 'guest') {
        // QR de comensal - ir al catálogo en modo invitado
        setStatus('success');
        setMessage(`¡Bienvenido a ${validation.branch?.name || 'Cellarium'}!`);
        
        setTimeout(() => {
          navigation.replace('WineCatalog', {
            isGuest: true,
            branchId: data.branchId,
          });
        }, 1500);
        
      } else if (data.type === 'admin') {
        // QR de invitación admin - ir al registro
        setStatus('success');
        setMessage('Invitación de administrador validada');
        
        setTimeout(() => {
          navigation.replace('AdminRegistration', {
            qrToken: data.token,
            branchName: data.branchName,
            branchId: data.branchId,
          });
        }, 1500);
      }

    } catch (error) {
      console.error('Error processing QR code:', error);
      setStatus('error');
      setMessage('Error al procesar el código QR');
      setTimeout(() => navigation.navigate('Login'), 3000);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {status === 'validating' && (
          <>
            <ActivityIndicator size="large" color="#8B0000" />
            <Text style={styles.message}>{message}</Text>
            <Text style={styles.submessage}>Por favor espera...</Text>
          </>
        )}

        {status === 'success' && (
          <>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successMessage}>{message}</Text>
            <Text style={styles.submessage}>Redirigiendo...</Text>
          </>
        )}

        {status === 'error' && (
          <>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorMessage}>{message}</Text>
            <Text style={styles.submessage}>Volviendo al inicio...</Text>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    padding: 40,
  },
  message: {
    fontSize: 18,
    color: '#333',
    textAlign: 'center',
    marginTop: 24,
    fontWeight: '600',
  },
  submessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  successIcon: {
    fontSize: 64,
    color: '#28a745',
  },
  successMessage: {
    fontSize: 20,
    color: '#28a745',
    textAlign: 'center',
    marginTop: 16,
    fontWeight: 'bold',
  },
  errorIcon: {
    fontSize: 64,
  },
  errorMessage: {
    fontSize: 18,
    color: '#dc3545',
    textAlign: 'center',
    marginTop: 16,
    fontWeight: '600',
  },
});

export default QrProcessorScreen;

