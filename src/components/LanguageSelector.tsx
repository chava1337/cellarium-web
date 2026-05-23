import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useLanguage, type Language } from '../contexts/LanguageContext';
import { useDeviceInfo } from '../hooks/useDeviceInfo';

const LANGUAGE_CYCLE: Record<Language, Language> = {
  es: 'en',
  en: 'pt-BR',
  'pt-BR': 'es',
};

const LANGUAGE_FLAG: Record<Language, string> = {
  es: '🇲🇽',
  en: '🇺🇸',
  'pt-BR': '🇧🇷',
};

const LanguageSelector: React.FC = () => {
  const { language, setLanguage } = useLanguage();
  const deviceInfo = useDeviceInfo();
  const size = deviceInfo.deviceType === 'tablet' ? 36 : 32;

  const toggleLanguage = () => {
    setLanguage(LANGUAGE_CYCLE[language]);
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          width: size,
          height: size,
        },
      ]}
      onPress={toggleLanguage}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Idioma: ${language}`}
    >
      <Text style={styles.flag}>{LANGUAGE_FLAG[language]}</Text>
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
