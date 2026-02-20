import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useLanguage } from '../contexts/LanguageContext';
import { useDeviceInfo } from '../hooks/useDeviceInfo';

const LanguageSelector: React.FC = () => {
  const { language, setLanguage } = useLanguage();
  const deviceInfo = useDeviceInfo();
  const size = deviceInfo.deviceType === 'tablet' ? 36 : 32;

  const toggleLanguage = () => {
    const newLanguage = language === 'es' ? 'en' : 'es';
    setLanguage(newLanguage);
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          width: size,
          height: size,
        }
      ]}
      onPress={toggleLanguage}
      activeOpacity={0.7}
    >
      <Text style={styles.flag}>
        {language === 'es' ? '🇲🇽' : '🇺🇸'}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flag: {
    fontSize: 18,
  },
});

export default LanguageSelector;
