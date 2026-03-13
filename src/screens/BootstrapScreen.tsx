import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { useAuth } from '../contexts/AuthContext';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types';
import Rive from 'rive-react-native';

/** Extrae el segmento encoded de una URL cellarium qr (dobles o triples slash) */
function getQrEncodedFromUrl(url: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/cellarium:\/\/\/?qr\/([^?#]+)/i) || url.match(/cellarium:\/\/qr\/([^?#]+)/i);
  return match ? match[1] : null;
}

type BootstrapScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Bootstrap'>;

interface Props {
  navigation: BootstrapScreenNavigationProp;
}

/**
 * Pantalla de bootstrap que verifica la sesión persistida
 * y redirige al usuario según su estado de autenticación.
 * 
 * Flujo:
 * 1. Muestra splash animado Rive mientras verifica sesión (loading === true)
 * 2. Cuando loading === false:
 *    - Si hay usuario → navigation.reset() hacia "AppAuth" (flujo autenticado)
 *    - Si no hay usuario → navigation.reset() hacia "Welcome"
 * 3. Evita back navigation al bootstrap usando reset()
 */
const splashRiv = require('../../assets/anim/splash_cellarium.riv');

const BootstrapScreen: React.FC<Props> = ({ navigation }) => {
  const { user, loading } = useAuth();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [riveError, setRiveError] = React.useState(false);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!loading) {
      const delay = 300;

      timeoutRef.current = setTimeout(() => {
        Linking.getInitialURL().then((url) => {
          const qrEncoded = getQrEncodedFromUrl(url);
          if (qrEncoded) {
            if (__DEV__) console.log('[Bootstrap] initial URL is QR link, redirecting to QrProcessor');
            navigation.reset({
              index: 0,
              routes: [{ name: 'QrProcessor', params: { qrData: qrEncoded } }],
            });
            return;
          }
          if (user) {
            navigation.reset({
              index: 0,
              routes: [{ name: 'AppAuth' }],
            });
          } else {
            navigation.reset({
              index: 0,
              routes: [{ name: 'Welcome' }],
            });
          }
        });
      }, delay);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [user, loading, navigation]);

  // Mostrar splash animado Rive mientras se verifica la sesión
  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor="#FFFFFF" />
      {riveError ? (
        // Fallback si Rive falla
        <ActivityIndicator size="large" color="#8B0000" />
      ) : (
        <Rive source={splashRiv} autoplay style={styles.rive} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF', // Fondo blanco
  },
  rive: {
    width: '100%',
    height: '100%',
  },
});

export default BootstrapScreen;
