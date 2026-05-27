import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import InlineLanguageSelector from '../components/InlineLanguageSelector';
import { CELLARIUM, CELLARIUM_LAYOUT } from '../theme/cellariumTheme';

type WelcomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Welcome'>;

interface Props {
  navigation: WelcomeScreenNavigationProp;
}

const WelcomeScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useLanguage();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.contentContainer}>
        <View style={styles.logoSection}>
          <Image
            source={require('../../assets/images/cellarium-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
      </View>

      <View style={styles.buttonsContainer}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('AppAuth' as any, { mode: 'register' as const })}
        >
          <Text style={styles.primaryButtonText}>{t('welcome.create_owner')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('AppAuth' as any, { mode: 'login' as const })}
        >
          <Text style={styles.secondaryButtonText}>{t('welcome.login')}</Text>
        </TouchableOpacity>

        <View style={styles.languageRow}>
          <InlineLanguageSelector size="compact" showLabels={false} />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CELLARIUM.card,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: CELLARIUM_LAYOUT.screenPadding + 8,
  },
  logoSection: {
    alignItems: 'center',
    width: '100%',
  },
  logo: {
    width: 240,
    height: 240,
  },
  buttonsContainer: {
    paddingHorizontal: CELLARIUM_LAYOUT.screenPadding + 8,
    paddingBottom: 40,
    width: '100%',
  },
  primaryButton: {
    backgroundColor: CELLARIUM.primary,
    borderRadius: CELLARIUM_LAYOUT.buttonRadius + 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 12,
    width: '100%',
  },
  primaryButtonText: {
    color: CELLARIUM.card,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: CELLARIUM.card,
    borderRadius: CELLARIUM_LAYOUT.buttonRadius + 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CELLARIUM.primary,
    width: '100%',
  },
  secondaryButtonText: {
    color: CELLARIUM.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  languageRow: {
    marginTop: 16,
    alignItems: 'center',
  },
});

export default WelcomeScreen;
