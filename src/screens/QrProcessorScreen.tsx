import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { getPublicMenuByToken } from '../services/PublicMenuService';
import { supabase } from '../config/supabase';

type QrProcessorScreenNavigationProp = StackNavigationProp<RootStackParamList, 'QrProcessor'>;
type QrProcessorScreenRouteProp = RouteProp<RootStackParamList, 'QrProcessor'>;

interface Props {
  navigation: QrProcessorScreenNavigationProp;
  route: QrProcessorScreenRouteProp;
}

/** Decode encoded string; if it looks like JSON, parse and return object; else return token string */
function decodeMaybeJson(encoded: string): { type: 'object'; data: any } | { type: 'token'; data: string } | null {
  if (!encoded || typeof encoded !== 'string') return null;
  try {
    let decoded = encoded.trim();
    try {
      decoded = decodeURIComponent(decoded);
    } catch (_) {}
    const trimmed = decoded.trim();
    if (trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed);
      return { type: 'object', data: parsed };
    }
    if (trimmed.startsWith('%7B')) {
      try {
        const again = decodeURIComponent(trimmed);
        if (again.startsWith('{')) return { type: 'object', data: JSON.parse(again) };
      } catch (_) {}
    }
    return { type: 'token', data: decoded };
  } catch {
    return null;
  }
}

/** Extract qr payload from deep link or universal URL (path or query data=) */
function extractQrPayloadFromUrl(url: string | null): { qrData?: any; token?: string } | null {
  if (!url || typeof url !== 'string') return null;
  try {
    // cellarium://qr/<encoded> or cellarium:///qr/<encoded>
    const pathMatch = url.match(/cellarium:\/\/\/?qr\/([^?#]+)/i) || url.match(/cellarium:\/\/qr\/([^?#]+)/i);
    if (pathMatch && pathMatch[1]) {
      const result = decodeMaybeJson(pathMatch[1]);
      if (result?.type === 'object') return { qrData: result.data };
      if (result?.type === 'token') return { token: result.data };
      return { token: pathMatch[1] };
    }
    // ?data=<encoded> (universal link or app opened with query)
    const parsed = new URL(url);
    const dataParam = parsed.searchParams.get('data');
    if (dataParam) {
      const result = decodeMaybeJson(dataParam);
      if (result?.type === 'object') return { qrData: result.data };
      if (result?.type === 'token') return { token: result.data };
      return { token: dataParam };
    }
    return null;
  } catch {
    return null;
  }
}

function maskToken(token: string): string {
  if (!token || token.length <= 8) return '***';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

const QrProcessorScreen: React.FC<Props> = ({ navigation, route }) => {
  const [status, setStatus] = useState<'validating' | 'success' | 'error'>('validating');
  const [message, setMessage] = useState('Validando código QR...');
  const [deepLinkUrl, setDeepLinkUrl] = useState<string | null>(null);
  const deepLinkUrlRef = useRef<string | null>(null);
  const processedRef = useRef(false);

  useEffect(() => {
    deepLinkUrlRef.current = deepLinkUrl;
  }, [deepLinkUrl]);

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (__DEV__) console.log('[QrProcessor] Initial URL:', url ? `${url.slice(0, 60)}...` : url);
      if (url && (url.includes('cellarium://qr') || url.includes('cellarium:///qr'))) {
        setDeepLinkUrl(url);
      }
    });

    const handleDeepLink = ({ url }: { url: string }) => {
      if (__DEV__) console.log('[QrProcessor] Deep link event:', url ? `${url.slice(0, 60)}...` : url);
      if (url && (url.includes('cellarium://qr') || url.includes('cellarium:///qr'))) {
        setDeepLinkUrl(url);
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);
    return () => subscription.remove();
  }, []);

  const processQrCode = React.useCallback(async () => {
    if (processedRef.current) return;

    try {
      let qrData: any = route.params?.qrData;
      let token: string | undefined = route.params?.token;

      // A) Normalize from route.params
      if (typeof qrData === 'string' && qrData.trim()) {
        const result = decodeMaybeJson(qrData);
        if (result?.type === 'object') qrData = result.data;
        else if (result?.type === 'token') token = result.data;
        else token = qrData;
      }
      if (qrData && typeof qrData === 'object' && 'token' in qrData) {
        token = (qrData as any).token;
      }

      if (__DEV__) {
        console.log('[QrProcessor] route.params', { hasQrData: !!qrData, hasToken: !!token, tokenMask: token ? maskToken(token) : undefined });
      }

      // B) Fallback: URL (state ref or getInitialURL)
      if (!qrData && !token) {
        const urlToParse = deepLinkUrlRef.current || (await Linking.getInitialURL());
        const payload = extractQrPayloadFromUrl(urlToParse);
        if (payload) {
          if (payload.qrData) qrData = payload.qrData;
          if (payload.token) token = payload.token;
          if (__DEV__) console.log('[QrProcessor] parsed from URL', { hasQrData: !!qrData, hasToken: !!token, tokenMask: token ? maskToken(token) : undefined });
        }
      }

      // C) Fallback: AsyncStorage
      if (!qrData && !token) {
        try {
          const stored = await AsyncStorage.getItem('qrData');
          if (stored) {
            qrData = JSON.parse(stored);
            await AsyncStorage.removeItem('qrData');
            if (__DEV__) console.log('[QrProcessor] from AsyncStorage', { hasQrData: !!qrData });
          }
        } catch (_) {}
      }

      if (!qrData && !token) {
        if (__DEV__) console.log('[QrProcessor] No payload from params, URL or storage');
        setStatus('error');
        setMessage('Código QR inválido. Por favor, escanea de nuevo.');
        setTimeout(() => navigation.navigate('Welcome'), 3000);
        return;
      }

      processedRef.current = true;

      let tokenToValidate: string;
      if (token) {
        tokenToValidate = token;
      } else if (qrData && typeof qrData === 'object' && 'token' in qrData) {
        tokenToValidate = (qrData as any).token;
      } else if (typeof qrData === 'string') {
        tokenToValidate = qrData;
      } else {
        tokenToValidate = JSON.stringify(qrData);
      }

      const isStaffPayload = qrData && typeof qrData === 'object' && ((qrData as any).type === 'admin' || (qrData as any).type === 'admin_invite');

      if (isStaffPayload) {
        if (__DEV__) {
          console.log('[QrProcessor] staff resolve-qr start', { tokenSuffix: maskToken(tokenToValidate), typeDetected: 'admin_invite' });
        }
        const { data: resolveData, error: resolveError } = await supabase.functions.invoke<{
          success?: boolean;
          code?: string;
          owner_id?: string;
          branch_id?: string;
          branch_name?: string | null;
        }>('resolve-qr', { body: { token: tokenToValidate } });
        if (__DEV__) {
          console.log('[QrProcessor] staff resolve-qr response', {
            success: resolveData?.success,
            code: resolveData?.code ?? null,
            resolveErrorMessage: resolveError?.message ?? null,
            owner_id: resolveData?.owner_id ?? null,
            branch_id: resolveData?.branch_id ?? null,
            tokenSuffix: maskToken(tokenToValidate),
          });
        }

        if (resolveData?.success === true && resolveData?.owner_id && resolveData?.branch_id) {
          setStatus('success');
          setMessage('Invitación de administrador validada');
          setTimeout(() => {
            navigation.replace('AdminRegistration', {
              qrToken: tokenToValidate,
              ownerId: resolveData.owner_id,
              branchId: resolveData.branch_id,
              branchName: resolveData.branch_name ?? undefined,
            });
          }, 1500);
          return;
        }

        const code = resolveData?.code ?? (resolveError as any)?.context?.response?.status;
        const statusCode = typeof (resolveError as any)?.context?.response?.status === 'number' ? (resolveError as any).context.response.status : null;
        const errCode = code ?? (statusCode === 404 ? 'TOKEN_NOT_FOUND' : statusCode === 410 ? 'TOKEN_EXPIRED' : statusCode === 409 ? 'TOKEN_USED' : null);
        if (errCode === 'TOKEN_USED' || resolveData?.code === 'TOKEN_USED') {
          Alert.alert('Código ya utilizado', 'Este código de invitación ya fue utilizado. Solicita uno nuevo al administrador.');
        } else if (errCode === 'TOKEN_EXPIRED' || resolveData?.code === 'TOKEN_EXPIRED') {
          Alert.alert('Código expirado', 'Este código de invitación ha expirado. Solicita uno nuevo al administrador.');
        } else if (errCode === 'TOKEN_NOT_FOUND' || resolveData?.code === 'TOKEN_NOT_FOUND') {
          Alert.alert('Código inválido', 'No se encontró este código de invitación. Verifica el código o solicita uno nuevo.');
        } else if (resolveData?.code === 'TOKEN_LIMIT_REACHED') {
          Alert.alert('Límite alcanzado', 'Este código alcanzó su límite de usos. Solicita uno nuevo.');
        } else {
          setMessage(resolveData?.code || resolveError?.message || 'Error al validar invitación');
        }
        setStatus('error');
        setTimeout(() => navigation.navigate('Welcome'), 3000);
        return;
      }

      // Guest payload (type === 'guest'): load menu via Edge public-menu in WineCatalog
      const isGuestPayload = qrData && typeof qrData === 'object' && (qrData as any).type === 'guest';
      if (isGuestPayload && tokenToValidate) {
        const trimmed = tokenToValidate.trim();
        if (trimmed.length < 4) {
          Alert.alert('Código inválido', 'El código es demasiado corto. Escanea el QR de nuevo.');
          setStatus('error');
          setMessage('Código inválido');
          setTimeout(() => navigation.navigate('Welcome'), 3000);
          return;
        }
        setStatus('success');
        setMessage('Cargando menú...');
        setTimeout(() => {
          navigation.replace('WineCatalog', {
            isGuest: true,
            guestToken: trimmed,
          });
        }, 800);
        return;
      }

      // Legacy: QR sin type explícito — no usar validateQrToken (RLS bloquea anon). Probar public-menu luego resolve-qr.
      const trimmed = tokenToValidate.trim();
      if (trimmed.length < 4) {
        setStatus('error');
        setMessage('Código inválido');
        setTimeout(() => navigation.navigate('Welcome'), 3000);
        return;
      }

      if (__DEV__) console.log('[QrProcessor] legacy fallback tokenSuffix:', maskToken(trimmed));

      let publicMenuOk = false;
      try {
        await getPublicMenuByToken(trimmed);
        publicMenuOk = true;
      } catch (_) {
        if (__DEV__) console.log('[QrProcessor] legacy public-menu failed tokenSuffix:', maskToken(trimmed));
      }

      if (publicMenuOk) {
        setStatus('success');
        setMessage('Cargando menú...');
        setTimeout(() => {
          navigation.replace('WineCatalog', { isGuest: true, guestToken: trimmed });
        }, 800);
        return;
      }

      const { data: resolveData, error: resolveError } = await supabase.functions.invoke<{
        success?: boolean;
        code?: string;
        owner_id?: string;
        branch_id?: string;
        branch_name?: string | null;
      }>('resolve-qr', { body: { token: trimmed } });

      if (__DEV__) {
        console.log('[QrProcessor] legacy resolve-qr response', {
          success: resolveData?.success,
          code: resolveData?.code ?? null,
          resolveErrorMessage: resolveError?.message ?? null,
          owner_id: resolveData?.owner_id ?? null,
          branch_id: resolveData?.branch_id ?? null,
          tokenSuffix: maskToken(trimmed),
          typeDetected: 'legacy',
        });
      }

      if (resolveData?.success === true && resolveData?.owner_id && resolveData?.branch_id) {
        setStatus('success');
        setMessage('Invitación de administrador validada');
        setTimeout(() => {
          navigation.replace('AdminRegistration', {
            qrToken: trimmed,
            ownerId: resolveData.owner_id,
            branchId: resolveData.branch_id,
            branchName: resolveData.branch_name ?? undefined,
          });
        }, 1500);
        return;
      }

      const code = resolveData?.code ?? (resolveError as any)?.context?.response?.status;
      const statusCode = typeof (resolveError as any)?.context?.response?.status === 'number' ? (resolveError as any).context.response.status : null;
      const errCode = code ?? (statusCode === 404 ? 'TOKEN_NOT_FOUND' : statusCode === 410 ? 'TOKEN_EXPIRED' : statusCode === 409 ? 'TOKEN_USED' : null);

      if (errCode === 'TOKEN_USED' || resolveData?.code === 'TOKEN_USED') {
        Alert.alert('Código ya utilizado', 'Este código de invitación ya fue utilizado. Solicita uno nuevo al administrador.');
      } else if (errCode === 'TOKEN_EXPIRED' || resolveData?.code === 'TOKEN_EXPIRED') {
        Alert.alert('Código expirado', 'Este código de invitación ha expirado. Solicita uno nuevo al administrador.');
      } else if (errCode === 'TOKEN_NOT_FOUND' || resolveData?.code === 'TOKEN_NOT_FOUND') {
        Alert.alert('Código inválido', 'No se encontró este código de invitación. Verifica el código o solicita uno nuevo.');
      } else if (resolveData?.code === 'TOKEN_LIMIT_REACHED') {
        Alert.alert('Límite alcanzado', 'Este código alcanzó su límite de usos. Solicita uno nuevo.');
      } else if (resolveData?.code === 'TOKEN_TYPE_NOT_ALLOWED') {
        Alert.alert('Tipo no permitido', 'Este código no puede usarse para esta acción. Solicita uno nuevo.');
      } else {
        Alert.alert('Código no válido', 'Este QR expiró o ya no es válido. Solicita uno nuevo.');
      }
      setStatus('error');
      setMessage('Código no válido');
      setTimeout(() => navigation.navigate('Welcome'), 3000);
    } catch (error) {
      if (__DEV__) console.warn('[QrProcessor] processQrCode error', error);
      setStatus('error');
      setMessage('Error al procesar el código QR');
      setTimeout(() => navigation.navigate('Welcome'), 3000);
    }
  }, [navigation, route.params?.qrData, route.params?.token]);

  // Run on mount (delay to allow initial URL to be set)
  useEffect(() => {
    const t = setTimeout(() => processQrCode(), 500);
    return () => clearTimeout(t);
  }, []);

  // Re-run when deepLinkUrl arrives and we haven't processed yet
  useEffect(() => {
    if (!deepLinkUrl || processedRef.current) return;
    const t = setTimeout(() => processQrCode(), 300);
    return () => clearTimeout(t);
  }, [deepLinkUrl, processQrCode]);

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
