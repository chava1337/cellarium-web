import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useDeviceInfo } from '../hooks/useDeviceInfo';

const DeviceInfo: React.FC = () => {
  const deviceInfo = useDeviceInfo();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📱 Información del Dispositivo</Text>
      <Text style={styles.info}>Tipo: {deviceInfo.deviceType}</Text>
      <Text style={styles.info}>Orientación: {deviceInfo.orientation}</Text>
      <Text style={styles.info}>Resolución: {deviceInfo.screenWidth}x{deviceInfo.screenHeight}</Text>
      <Text style={styles.info}>Recomendado: {deviceInfo.recommendedOrientation}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderRadius: 8,
    margin: 16,
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  info: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
});

export default DeviceInfo;



