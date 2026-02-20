import { useState, useEffect } from 'react';
import { Dimensions, Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

export interface DeviceInfo {
  isTablet: boolean;
  isPhone: boolean;
  orientation: 'portrait' | 'landscape';
  screenWidth: number;
  screenHeight: number;
  deviceType: 'tablet' | 'phone';
  recommendedOrientation: 'portrait' | 'landscape';
}

export const useDeviceInfo = (): DeviceInfo => {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(() => {
    const { width, height } = Dimensions.get('window');
    // Detección más estricta: ambos lados deben ser >= 600px para considerar tablet
    // Esto evita que smartphones grandes sean detectados como tablets
    const minDimension = Math.min(width, height);
    const maxDimension = Math.max(width, height);
    const screenArea = width * height;
    // Tablet si: mínimo >= 600px Y máximo >= 800px Y área >= 600,000px²
    const isTablet = minDimension >= 600 && maxDimension >= 800 && screenArea >= 600000;
    const isPhone = !isTablet;
    const orientation = width > height ? 'landscape' : 'portrait';
    
    return {
      isTablet,
      isPhone,
      orientation,
      screenWidth: width,
      screenHeight: height,
      deviceType: isTablet ? 'tablet' : 'phone',
      recommendedOrientation: isTablet ? 'landscape' : 'portrait',
    };
  });

  useEffect(() => {
    const updateDeviceInfo = () => {
      const { width, height } = Dimensions.get('window');
      // Detección más estricta: ambos lados deben ser >= 600px para considerar tablet
      const minDimension = Math.min(width, height);
      const maxDimension = Math.max(width, height);
      const screenArea = width * height;
      // Tablet si: mínimo >= 600px Y máximo >= 800px Y área >= 600,000px²
      const isTablet = minDimension >= 600 && maxDimension >= 800 && screenArea >= 600000;
      const isPhone = !isTablet;
      const orientation = width > height ? 'landscape' : 'portrait';
      
      setDeviceInfo({
        isTablet,
        isPhone,
        orientation,
        screenWidth: width,
        screenHeight: height,
        deviceType: isTablet ? 'tablet' : 'phone',
        recommendedOrientation: isTablet ? 'landscape' : 'portrait',
      });
    };

    // Escuchar cambios en las dimensiones de la pantalla
    const subscription = Dimensions.addEventListener('change', updateDeviceInfo);
    
    return () => subscription?.remove();
  }, []);

  return deviceInfo;
};

// Función para configurar la orientación recomendada
export const configureOrientation = async (deviceType: 'tablet' | 'phone') => {
  try {
    if (deviceType === 'tablet') {
      // Para tablets, permitir ambas orientaciones pero preferir landscape
      await ScreenOrientation.unlockAsync();
    } else {
      // Para smartphones, preferir portrait
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    }
  } catch (error) {
    console.log('Error configuring orientation:', error);
  }
};

// Función para obtener el layout recomendado
export const getRecommendedLayout = (deviceInfo: DeviceInfo) => {
  if (deviceInfo.deviceType === 'tablet') {
    return {
      orientation: 'landscape',
      columns: 2,
      cardWidth: '48%',
      headerHeight: 80,
      padding: 20,
    };
  } else {
    return {
      orientation: 'portrait',
      columns: 1,
      cardWidth: '100%',
      headerHeight: 60,
      padding: 16,
    };
  }
};
