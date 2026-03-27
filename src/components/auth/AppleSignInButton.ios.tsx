import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { isAppleAuthAvailable, signInWithAppleAndSupabase } from '../../services/appleAuth';

type Props = {
  disabled?: boolean;
  /** Evita pulsar Google/correo mientras Apple está en curso. */
  onBusyChange?: (busy: boolean) => void;
};

export default function AppleSignInButton({ disabled, onBusyChange }: Props) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await isAppleAuthAvailable();
      if (!cancelled) setAvailable(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onPress = useCallback(() => {
    if (disabled || busy) return;
    void (async () => {
      setBusy(true);
      onBusyChange?.(true);
      try {
        const result = await signInWithAppleAndSupabase();
        if (result.ok) {
          return;
        }
        if ('cancelled' in result && result.cancelled) {
          return;
        }
        if ('error' in result && result.error) {
          Alert.alert('Error', result.error.message);
        }
      } finally {
        setBusy(false);
        onBusyChange?.(false);
      }
    })();
  }, [disabled, busy, onBusyChange]);

  if (!available) {
    return null;
  }

  return (
    <View
      style={[styles.wrap, (disabled || busy) && styles.dimmed]}
      pointerEvents={disabled || busy ? 'none' : 'auto'}
    >
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={12}
        style={styles.button}
        onPress={onPress}
      />
      {busy ? (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="small" color="#fff" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    height: 50,
    marginBottom: 12,
    position: 'relative',
  },
  dimmed: {
    opacity: 0.65,
  },
  button: {
    width: '100%',
    height: 50,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
});
