import React, { useRef, useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';

interface CellariumLoaderProps {
  size?: number;
  label?: string;
  loop?: boolean;
  speed?: number;
  style?: any;
}

export default function CellariumLoader({
  size = 180,
  label = "Decantando…",
  loop = true,
  speed = 1,
  style,
}: CellariumLoaderProps) {
  const ref = useRef<LottieView>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Arranca la animación cuando el view está listo
    if (ref.current) {
      ref.current.play();
    }
  }, []);

  if (error) {
    // Fallback nativo ligero
    return (
      <View style={[styles.container, style]}>
        <ActivityIndicator size="large" color="#8B0000" />
        {label ? <Text style={styles.label}>{label}</Text> : null}
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <LottieView
        ref={ref}
        source={require('../../assets/anim/cellarium_loader.json')}
        autoPlay
        loop={loop}
        speed={speed}
        style={{ width: size, height: size }}
        onError={() => setError(true)}
      />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  label: {
    fontSize: 16,
    color: '#666',
    opacity: 0.85,
    textAlign: 'center',
    fontWeight: '500',
  },
});












