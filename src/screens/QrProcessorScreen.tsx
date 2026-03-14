import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { getPublicMenuByToken } from '../services/PublicMenuService';
import { supabase } from '../config/supabase';
import { parseQrLink } from '../utils/parseQrLink';
import { consumePendingQrPayload } from '../utils/pendingQrPayload';

/** Temporal: overlay de diagnóstico QR en pantalla (sin ADB). Poner a false para producción. */
const QR_DEBUG_OVERLAY = true;

export type QrDebugState = {
  source: string;
  rawUrl: string;
  tokenFound: string;
  tokenLength: string;
  requestStarted: string;
  endpointUsed: string;
  httpStatus: string;
  responseSummary: string;
  navigationTriggered: string;
  finalError: string;
  currentStep: string;
};

const initialDebug: QrDebugState = {
  source: '-',
  rawUrl: '-',
  tokenFound: '-',
  tokenLength: '-',
  requestStarted: '-',
  endpointUsed: '-',
  httpStatus: '-',
  responseSummary: '-',
  navigationTriggered: '-',
  finalError: '-',
  currentStep: 'mounted',
};

function trunc(str: string | null | undefined, max: number): string {
  if (str == null) return '-';
  const s = String(str);
  return s.length <= max ? s : s.slice(0, max) + '…';
}

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
  const [qrDebug, setQrDebug] = useState<QrDebugState>(initialDebug);

  const setDebug = React.useCallback((partial: Partial<QrDebugState>) => {
    if (!QR_DEBUG_OVERLAY) return;
    setQrDebug((prev) => ({ ...prev, ...partial }));
  }, []);

  useEffect(() => {
    deepLinkUrlRef.current = deepLinkUrl;
    if (deepLinkUrl) setDebug({ currentStep: 'deepLinkUrl', source: 'deepLinkUrl', rawUrl: trunc(deepLinkUrl, 50) });
    if (__DEV__ && deepLinkUrl) console.log('[QrProcessor] deepLinkUrl estado:', deepLinkUrl.slice(0, 90) + (deepLinkUrl.length > 90 ? '...' : ''));
  }, [deepLinkUrl, setDebug]);

  useEffect(() => {
    const hasParams = route.params?.qrData != null || !!route.params?.token;
    setDebug({
      currentStep: 'mounted',
      source: hasParams ? 'route.params' : '-',
      rawUrl: '-',
      tokenFound: hasParams ? 'yes' : 'no',
      tokenLength: typeof route.params?.token === 'string' ? String(route.params.token.length) : hasParams ? '?' : '-',
    });
    if (__DEV__) {
      console.log('[QrProcessor] mount route.params al entrar:', JSON.stringify({
        hasQrData: route.params?.qrData != null,
        qrDataType: typeof route.params?.qrData,
        hasToken: !!route.params?.token,
        tokenLen: typeof route.params?.token === 'string' ? route.params.token.length : 0,
      }));
    }
  }, [setDebug]);

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (__DEV__) console.log('[QrProcessor] getInitialURL() raw:', url == null ? 'null' : url.length > 100 ? url.slice(0, 100) + '...' : url);
      const parsed = url ? parseQrLink(url) : null;
      if (__DEV__) console.log('[QrProcessor] parseQrLink(initialURL) result:', parsed == null ? 'null' : { hasQrData: parsed.qrData != null, hasToken: !!parsed.token });
      if (url && parsed) {
        setDeepLinkUrl(url);
        if (__DEV__) console.log('[QrProcessor] deepLinkUrl estado actualizado con initial URL');
      }
    });

    const handleDeepLink = ({ url }: { url: string }) => {
      if (__DEV__) console.log('[QrProcessor] listener Linking event url:', url?.slice(0, 100));
      const parsed = url ? parseQrLink(url) : null;
      if (__DEV__) console.log('[QrProcessor] parseQrLink(event url) result:', parsed == null ? 'null' : { hasQrData: parsed.qrData != null, hasToken: !!parsed.token });
      if (url && parsed) {
        setDeepLinkUrl(url);
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);
    return () => subscription.remove();
  }, []);

  const processQrCode = React.useCallback(async () => {
    if (processedRef.current) return;

    setDebug({ currentStep: 'parsed' });

    try {
      let qrData: any = route.params?.qrData;
      let token: string | undefined = route.params?.token;

      if (__DEV__) {
        console.log('[QrProcessor] processQrCode run — route.params al entrar:', {
          qrDataPresent: qrData != null,
          qrDataType: typeof qrData,
          tokenPresent: !!token,
          tokenType: typeof token,
          tokenLen: typeof token === 'string' ? token.length : 0,
        });
      }

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

      if (qrData || token) {
        setDebug({ tokenFound: 'yes', source: 'route.params', tokenLength: token ? String(token.length) : (qrData && typeof qrData === 'object' && (qrData as any).token ? String((qrData as any).token.length) : '?') });
        if (__DEV__) console.log('[QrProcessor] fuente final: route.params', { hasQrData: !!qrData, hasToken: !!token });
      }
      if (__DEV__ && !qrData && !token) {
        console.log('[QrProcessor] tras A) sin payload en route.params');
      }

      // A2) Pending payload (listener guardó payload antes de reset; params pueden no llegar en dev client)
      if (!qrData && !token) {
        const pendingPayload = consumePendingQrPayload();
        if (__DEV__) console.log('[QrProcessor] route.params vacíos, consumePendingQrPayload:', pendingPayload == null ? 'null' : { hasQrData: pendingPayload.qrData != null, hasToken: !!pendingPayload.token });
        if (pendingPayload) {
          qrData = pendingPayload.qrData;
          token = pendingPayload.token;
          if (pendingPayload.rawUrl) {
            deepLinkUrlRef.current = pendingPayload.rawUrl;
            setDeepLinkUrl(pendingPayload.rawUrl);
          }
          if (typeof qrData === 'string' && qrData.trim()) {
            const result = decodeMaybeJson(qrData);
            if (result?.type === 'object') qrData = result.data;
            else if (result?.type === 'token') token = result.data;
            else token = qrData;
          }
          if (qrData && typeof qrData === 'object' && 'token' in qrData) {
            token = (qrData as any).token;
          }
          setDebug({ source: 'pendingPayload', tokenFound: qrData || token ? 'yes' : 'no', tokenLength: token ? String(token.length) : '?' });
          if (__DEV__) console.log('[QrProcessor] fuente final: pendingPayload', { hasQrData: !!qrData, hasToken: !!token, tokenMask: token ? maskToken(token) : undefined });
        }
      }

      // B) Fallback: URL (state ref or getInitialURL) — parseQrLink prioriza ?data=
      if (!qrData && !token) {
        let urlToParse = deepLinkUrlRef.current;
        setDebug({ source: urlToParse ? 'deepLinkUrl' : 'initialURL', rawUrl: trunc(urlToParse, 50) });
        if (__DEV__) console.log('[QrProcessor] deepLinkUrlRef.current:', urlToParse == null ? 'null' : urlToParse.slice(0, 80) + '...');
        if (!urlToParse) {
          urlToParse = await Linking.getInitialURL();
          setDebug({ source: 'initialURL', rawUrl: trunc(urlToParse, 50) });
          if (__DEV__) console.log('[QrProcessor] getInitialURL() en fallback:', urlToParse == null ? 'null' : urlToParse.slice(0, 80) + '...');
        }
        const payload = parseQrLink(urlToParse);
        setDebug({ currentStep: 'parseQrLink', tokenFound: payload ? (payload.token ? 'yes' : payload.qrData ? 'yes' : 'no') : 'no' });
        if (__DEV__) console.log('[QrProcessor] parseQrLink(urlToParse) resultado:', payload == null ? 'null' : { hasQrData: payload.qrData != null, hasToken: !!payload.token });
        if (payload) {
          if (payload.qrData) qrData = payload.qrData;
          if (payload.token) token = payload.token;
          if (__DEV__) console.log('[QrProcessor] fuente final: URL fallback (deepLinkUrl/initialURL)', { hasQrData: !!qrData, hasToken: !!token });
        }
      }

      // B2) Retry: si seguimos sin payload, esperar un poco y reintentar getInitialURL (race con intent en Android)
      if (!qrData && !token) {
        await new Promise((r) => setTimeout(r, 400));
        const urlRetry = await Linking.getInitialURL();
        setDebug({ source: 'retryInitialURL', rawUrl: trunc(urlRetry, 50) });
        if (__DEV__) console.log('[QrProcessor] retry getInitialURL():', urlRetry == null ? 'null' : urlRetry.slice(0, 80) + '...');
        const payloadRetry = parseQrLink(urlRetry);
        if (payloadRetry) {
          if (payloadRetry.qrData) qrData = payloadRetry.qrData;
          if (payloadRetry.token) token = payloadRetry.token;
          setDebug({ tokenFound: 'yes', source: 'retryInitialURL', tokenLength: token ? String(token.length) : '?' });
          if (__DEV__) console.log('[QrProcessor] fuente final: retryInitialURL', { hasQrData: !!qrData, hasToken: !!token });
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
        setDebug({ currentStep: 'error', finalError: 'sin payload' });
        if (__DEV__) console.log('[QrProcessor] fuente final: none — sin payload (params, pending, URL, retry, storage)');
        setStatus('error');
        setMessage('Código QR inválido. Por favor, escanea de nuevo.');
        setTimeout(() => navigation.navigate('Welcome'), 3000);
        return;
      }

      processedRef.current = true;
      setDebug({ tokenFound: 'yes', tokenLength: token ? String(token.length) : (qrData && typeof qrData === 'object' && (qrData as any).token ? String((qrData as any).token.length) : '?') });
      if (__DEV__) console.log('[QrProcessor] request iniciado', { hasQrData: !!qrData, tokenMask: token ? maskToken(token) : undefined });

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

      if (__DEV__) {
        console.log('[QrProcessor] token final elegido para request:', { tokenMask: maskToken(tokenToValidate), tokenLen: tokenToValidate.length });
      }

      const isStaffPayload = qrData && typeof qrData === 'object' && ((qrData as any).type === 'admin' || (qrData as any).type === 'admin_invite');

      if (isStaffPayload) {
        setDebug({ currentStep: 'requesting', requestStarted: 'started', endpointUsed: 'resolve-qr' });
        if (__DEV__) {
          console.log('[QrProcessor] staff resolve-qr start', { tokenSuffix: maskToken(tokenToValidate), typeDetected: 'admin_invite' });
        }
        const staffPayload = { token: tokenToValidate };
        if (__DEV__) console.log('[QrProcessor] staff request payload (body):', { tokenLen: tokenToValidate.length, tokenMask: maskToken(tokenToValidate) });
        const { data: resolveData, error: resolveError } = await supabase.functions.invoke<{
          success?: boolean;
          code?: string;
          owner_id?: string;
          branch_id?: string;
          branch_name?: string | null;
        }>('resolve-qr', { body: staffPayload });
        if (__DEV__) {
          console.log('[QrProcessor] staff resolve-qr respuesta real:', {
            success: resolveData?.success,
            code: resolveData?.code ?? null,
            resolveErrorMessage: resolveError?.message ?? null,
            owner_id: resolveData?.owner_id ?? null,
            branch_id: resolveData?.branch_id ?? null,
            tokenSuffix: maskToken(tokenToValidate),
          });
        }

        const statusCode = typeof (resolveError as any)?.context?.response?.status === 'number' ? (resolveError as any).context.response.status : null;
        setDebug({ currentStep: 'response', requestStarted: 'done', httpStatus: statusCode != null ? String(statusCode) : resolveError ? 'err' : '200', responseSummary: resolveData?.success ? 'ok' : resolveData?.code ?? (resolveError?.message ?? 'unknown') });
        if (resolveData?.success === true && resolveData?.owner_id && resolveData?.branch_id) {
          if (__DEV__) console.log('[QrProcessor] request resuelto (staff) → AdminRegistration');
          setDebug({ currentStep: 'navigating', navigationTriggered: 'triggered' });
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
        const errCode = code ?? (statusCode === 404 ? 'TOKEN_NOT_FOUND' : statusCode === 410 ? 'TOKEN_EXPIRED' : statusCode === 409 ? 'TOKEN_USED' : null);
        setDebug({ currentStep: 'error', finalError: errCode ?? resolveError?.message ?? 'staff fail' });
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

      // Guest payload (type === 'guest'): validar con public-menu antes de navegar (mismo criterio que legacy)
      const isGuestPayload = qrData && typeof qrData === 'object' && (qrData as any).type === 'guest';
      if (isGuestPayload && tokenToValidate) {
        const trimmed = tokenToValidate.trim();
        if (trimmed.length < 4) {
          setDebug({ currentStep: 'error', finalError: 'token corto' });
          if (__DEV__) console.log('[QrProcessor] error real: token guest demasiado corto');
          Alert.alert('Código inválido', 'El código es demasiado corto. Escanea el QR de nuevo.');
          setStatus('error');
          setMessage('Código inválido');
          setTimeout(() => navigation.navigate('Welcome'), 3000);
          return;
        }
        setDebug({ currentStep: 'requesting', requestStarted: 'started', endpointUsed: 'public-menu' });
        let guestMenuOk = false;
        let guestMenuStatus = '-';
        try {
          if (__DEV__) console.log('[QrProcessor] guest path: validando token con public-menu tokenLen:', trimmed.length);
          await getPublicMenuByToken(trimmed);
          guestMenuOk = true;
          guestMenuStatus = '200';
          if (__DEV__) console.log('[QrProcessor] guest path public-menu ok → WineCatalog');
        } catch (err) {
          guestMenuStatus = (err as Error)?.message ?? 'err';
          if (__DEV__) console.log('[QrProcessor] guest path public-menu error:', (err as Error)?.message ?? err);
        }
        setDebug({ currentStep: 'response', requestStarted: 'done', httpStatus: guestMenuStatus, responseSummary: guestMenuOk ? 'ok' : 'error', navigationTriggered: guestMenuOk ? 'triggered' : undefined });
        if (!guestMenuOk) {
          setStatus('error');
          setMessage('Código expirado o inválido');
          setTimeout(() => navigation.navigate('Welcome'), 3000);
          return;
        }
        setStatus('success');
        setMessage('Cargando menú...');
        const guestParams = { isGuest: true as const, guestToken: trimmed };
        if (__DEV__) console.log('[QrProcessor] NAV antes replace(WineCatalog)', { guestTokenLen: trimmed.length });
        setTimeout(() => {
          navigation.replace('WineCatalog', guestParams);
          if (__DEV__) console.log('[QrProcessor] NAV después replace(WineCatalog) llamada');
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

      if (__DEV__) console.log('[QrProcessor] legacy fallback token a enviar:', { tokenMask: maskToken(trimmed), tokenLen: trimmed.length });

      setDebug({ currentStep: 'requesting', requestStarted: 'started', endpointUsed: 'public-menu' });
      let publicMenuOk = false;
      let publicMenuStatus = '-';
      try {
        if (__DEV__) console.log('[QrProcessor] legacy request public-menu (mismo endpoint que web) tokenLen:', trimmed.length);
        await getPublicMenuByToken(trimmed);
        publicMenuOk = true;
        publicMenuStatus = '200';
        if (__DEV__) console.log('[QrProcessor] legacy public-menu respuesta: ok');
      } catch (err) {
        publicMenuStatus = (err as any)?.status ?? (err as Error)?.message ?? 'err';
        if (__DEV__) console.log('[QrProcessor] legacy public-menu respuesta error:', (err as Error)?.message ?? err);
      }
      setDebug({ currentStep: 'response', requestStarted: publicMenuOk ? 'done' : 'done', httpStatus: publicMenuStatus, responseSummary: publicMenuOk ? 'ok' : 'error' });

      if (publicMenuOk) {
        if (__DEV__) console.log('[QrProcessor] request resuelto (legacy public-menu) → WineCatalog');
        setDebug({ navigationTriggered: 'triggered', currentStep: 'navigating' });
        setStatus('success');
        setMessage('Cargando menú...');
        const legacyGuestParams = { isGuest: true as const, guestToken: trimmed };
        if (__DEV__) console.log('[QrProcessor] NAV antes replace(WineCatalog) legacy', { guestTokenLen: trimmed.length });
        setTimeout(() => {
          navigation.replace('WineCatalog', legacyGuestParams);
          if (__DEV__) console.log('[QrProcessor] NAV después replace(WineCatalog) llamada legacy');
        }, 800);
        return;
      }

      setDebug({ requestStarted: 'started', endpointUsed: 'resolve-qr' });
      const legacyPayload = { token: trimmed };
      if (__DEV__) console.log('[QrProcessor] legacy resolve-qr payload:', { tokenLen: trimmed.length, tokenMask: maskToken(trimmed) });
      const { data: resolveData, error: resolveError } = await supabase.functions.invoke<{
        success?: boolean;
        code?: string;
        owner_id?: string;
        branch_id?: string;
        branch_name?: string | null;
      }>('resolve-qr', { body: legacyPayload });

      if (__DEV__) {
        console.log('[QrProcessor] legacy resolve-qr respuesta real:', {
          success: resolveData?.success,
          code: resolveData?.code ?? null,
          resolveErrorMessage: resolveError?.message ?? null,
          owner_id: resolveData?.owner_id ?? null,
          branch_id: resolveData?.branch_id ?? null,
          tokenSuffix: maskToken(trimmed),
          typeDetected: 'legacy',
        });
      }

      const legacyStatus = typeof (resolveError as any)?.context?.response?.status === 'number' ? (resolveError as any).context.response.status : null;
      setDebug({ httpStatus: legacyStatus != null ? String(legacyStatus) : '?', responseSummary: resolveData?.success ? 'ok' : resolveData?.code ?? (resolveError?.message ?? 'unknown') });
      if (resolveData?.success === true && resolveData?.owner_id && resolveData?.branch_id) {
        if (__DEV__) console.log('[QrProcessor] request resuelto (legacy resolve-qr staff) → AdminRegistration');
        setDebug({ currentStep: 'navigating', navigationTriggered: 'triggered' });
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

      if (__DEV__) console.log('[QrProcessor] error real: legacy resolve-qr sin éxito', { code: resolveData?.code, err: (resolveError as Error)?.message });
      const code = resolveData?.code ?? (resolveError as any)?.context?.response?.status;
      const statusCode = legacyStatus;
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
      setDebug({ currentStep: 'error', finalError: resolveData?.code ?? (resolveError as Error)?.message ?? 'invalid' });
      setStatus('error');
      setMessage('Código no válido');
      setTimeout(() => navigation.navigate('Welcome'), 3000);
    } catch (error) {
      setDebug({ currentStep: 'error', finalError: trunc((error as Error)?.message, 30) });
      if (__DEV__) console.warn('[QrProcessor] error real: processQrCode exception', error);
      setStatus('error');
      setMessage('Error al procesar el código QR');
      setTimeout(() => navigation.navigate('Welcome'), 3000);
    }
  }, [navigation, route.params?.qrData, route.params?.token, setDebug]);

  // Timeout defensivo: si sigue en validating tras 15s, mostrar error y permitir reintentar
  const VALIDATING_TIMEOUT_MS = 15000;
  useEffect(() => {
    if (status !== 'validating') return;
    const t = setTimeout(() => {
      setDebug({ currentStep: 'error', finalError: 'timeout 15s' });
      setStatus('error');
      setMessage('Tardó demasiado. Reintenta o escanea de nuevo.');
      if (__DEV__) console.log('[QrProcessor] timeout defensivo: 15s en validating');
    }, VALIDATING_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [status, setDebug]);

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
        {QR_DEBUG_OVERLAY && (
          <View style={styles.debugOverlay}>
            <Text style={styles.debugTitle}>QR debug</Text>
            <Text style={styles.debugLine}>step: {qrDebug.currentStep}</Text>
            <Text style={styles.debugLine}>source: {trunc(qrDebug.source, 18)}</Text>
            <Text style={styles.debugLine}>url: {trunc(qrDebug.rawUrl, 35)}</Text>
            <Text style={styles.debugLine}>token: {qrDebug.tokenFound} len={qrDebug.tokenLength}</Text>
            <Text style={styles.debugLine}>request: {qrDebug.requestStarted} | {qrDebug.endpointUsed}</Text>
            <Text style={styles.debugLine}>http: {qrDebug.httpStatus} | resp: {trunc(qrDebug.responseSummary, 15)}</Text>
            <Text style={styles.debugLine}>nav: {qrDebug.navigationTriggered}</Text>
            <Text style={styles.debugLine}>error: {trunc(qrDebug.finalError, 25)}</Text>
          </View>
        )}
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
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                processedRef.current = false;
                setStatus('validating');
                setMessage('Validando código QR...');
                setTimeout(() => processQrCode(), 200);
              }}
            >
              <Text style={styles.retryButtonText}>Reintentar</Text>
            </TouchableOpacity>
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
  debugOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    padding: 8,
    paddingBottom: 24,
  },
  debugTitle: {
    fontSize: 10,
    color: '#aaa',
    fontWeight: '700',
    marginBottom: 4,
  },
  debugLine: {
    fontSize: 9,
    color: '#ccc',
  },
  retryButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#8B0000',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default QrProcessorScreen;
