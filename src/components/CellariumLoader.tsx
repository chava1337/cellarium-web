import React, { useRef, useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';

interface CellariumLoaderProps {
  size?: number;
  label?: string;
  loop?: boolean;
  speed?: number;
  style?: any;
  /** Si true, el loader se muestra en un contenedor tipo overlay (fondo semitransparente, centrado). */
  overlay?: boolean;
  /** Si true, el contenedor ocupa toda la pantalla (útil con overlay). Por defecto false. */
  fullscreen?: boolean;
}

export default function CellariumLoader({
  size = 180,
  label = "Decantando…",
  loop = true,
  speed = 1,
  style,
  overlay = false,
  fullscreen = false,
}: CellariumLoaderProps) {
  const ref = useRef<LottieView>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    ref.current?.play();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.play();
    }, 50);
    return () => clearTimeout(t);
  }, []);

  if (error) {
    const containerStyle = [
      styles.container,
      overlay && styles.containerOverlay,
      fullscreen && styles.containerFullscreen,
      style,
    ];
    return (
      <View style={containerStyle}>
        <ActivityIndicator size="large" color="#8B0000" />
        {label ? <Text style={[styles.label, overlay && styles.labelOverlay]}>{label}</Text> : null}
      </View>
    );
  }

  const containerStyle = [
    styles.container,
    overlay && styles.containerOverlay,
    fullscreen && styles.containerFullscreen,
    style,
  ];

  return (
    <View style={containerStyle}>
      <LottieView
        ref={ref}
        source={require('../../assets/anim/cellarium_loader.json')}
        autoPlay
        loop={loop}
        speed={speed}
        style={{ width: size, height: size }}
        onError={() => setError(true)}
      />
      {label ? <Text style={[styles.label, overlay && styles.labelOverlay]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  containerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  containerFullscreen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  label: {
    fontSize: 16,
    color: '#666',
    opacity: 0.85,
    textAlign: 'center',
    fontWeight: '500',
  },
  labelOverlay: {
    color: '#fff',
    opacity: 1,
  },
});












