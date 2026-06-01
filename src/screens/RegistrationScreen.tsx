import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

type RegistrationScreenNavigationProp = StackNavigationProp<RootStackParamList, 'AdminRegistration'>;
type RegistrationScreenRouteProp = RouteProp<RootStackParamList, 'AdminRegistration'>;

interface Props {
  navigation: RegistrationScreenNavigationProp;
  route: RegistrationScreenRouteProp;
}

const RegistrationScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Obtener datos del QR (si viene de invitación)
  const qrToken = route.params?.qrToken;
  const branchName = route.params?.branchName;
  const branchId = route.params?.branchId;

  // Determinar si es registro libre (Owner) o invitado (Admin)
  const isOwnerRegistration = !qrToken;
  const isInvitedAdmin = !!qrToken;

  const handleEmailRegister = async () => {
    if (!email || !username || !password || !confirmPassword) {
      Alert.alert(t('common.error'), t('auth.fill_all_fields'));
      return;
    }

    if (!isValidEmail(email)) {
      Alert.alert(t('common.error'), t('auth.invalid_email_short'));
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert(t('common.error'), t('auth.password_mismatch'));
      return;
    }

    if (password.length < 6) {
      Alert.alert(t('common.error'), t('auth.password_min_length'));
      return;
    }

    setLoading(true);
    try {
      if (isOwnerRegistration) {
        // Registro libre para Owner - se aprueba automáticamente
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        Alert.alert(
          t('auth.registration_success_owner_title'),
          t('auth.registration_success_owner_body'),
          [
            {
              text: t('auth.continue'),
              onPress: () => navigation.navigate('Login'),
            },
          ]
        );
      } else {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        Alert.alert(
          t('auth.registration_success_admin_title'),
          t('auth.registration_success_admin_body'),
          [
            {
              text: t('auth.ok'),
              onPress: () => navigation.navigate('Login'),
            },
          ]
        );
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('auth.registration_failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    setGoogleLoading(true);
    try {
      // Simular autenticación con Google
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      Alert.alert(
        t('auth.google_registration_title'),
        t('auth.google_registration_body'),
        [
          {
            text: t('auth.ok'),
            onPress: () => navigation.navigate('Login'),
          },
        ]
      );
    } catch (error) {
      Alert.alert(t('common.error'), t('auth.google_registration_failed'));
    } finally {
      setGoogleLoading(false);
    }
  };

  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('auth.registration_title')}</Text>
          <Text style={styles.subtitle}>
            {isOwnerRegistration ? t('auth.registration_owner') : t('auth.registration_admin')}
          </Text>
        </View>

        {/* Información de invitación QR */}
        {isInvitedAdmin && branchName && (
          <View style={styles.invitationCard}>
            <Text style={styles.invitationTitle}>{t('auth.invitation_received')}</Text>
            <Text style={styles.invitationText}>
              {t('auth.invitation_admin_body')}
            </Text>
            <View style={styles.branchBadge}>
              <Text style={styles.branchName}>{branchName}</Text>
            </View>
          </View>
        )}

        {/* Información para Owner */}
        {isOwnerRegistration && (
          <View style={styles.ownerCard}>
            <Text style={styles.ownerTitle}>{t('auth.owner_card_title')}</Text>
            <Text style={styles.ownerText}>
              {t('auth.owner_card_body')}
            </Text>
            <Text style={styles.ownerFeatures}>
              {t('auth.owner_card_features')}
            </Text>
          </View>
        )}

        <View style={styles.formContainer}>
          <Text style={styles.formTitle}>
            {isOwnerRegistration ? t('auth.create_owner_account') : t('auth.complete_registration')}
          </Text>
          <Text style={styles.formSubtitle}>
            {isOwnerRegistration ? 
              t('auth.register_owner_subtitle') : 
              t('auth.register_admin_subtitle')
            }
          </Text>

          {/* Opciones de registro */}
          <View style={styles.registrationOptions}>
            
            {/* Registro con Google */}
            <TouchableOpacity
              style={[styles.googleButton, googleLoading && styles.buttonDisabled]}
              onPress={handleGoogleRegister}
              disabled={googleLoading || loading}
            >
              {googleLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.googleIcon}>🔍</Text>
                  <Text style={styles.googleButtonText}>{t('auth.continue_google')}</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t('auth.divider_or')}</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Formulario de registro con email */}
            <View style={styles.emailForm}>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>{t('auth.email')}</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder={t('auth.email_placeholder')}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>{t('auth.username')}</Text>
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder={t('auth.username_placeholder')}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>{t('auth.password')}</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder={t('auth.password_placeholder')}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>{t('auth.confirm_password')}</Text>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder={t('auth.repeat_password_placeholder')}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>

              <TouchableOpacity
                style={[styles.registerButton, loading && styles.buttonDisabled]}
                onPress={handleEmailRegister}
                disabled={loading || googleLoading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.registerButtonText}>{t('auth.create_account')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {t('auth.footer_has_account')}
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginLink}>{t('auth.login_link')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>{t('auth.info_important')}</Text>
          <Text style={styles.infoText}>
            {isOwnerRegistration ? 
              t('auth.registration_info') :
              t('auth.admin_reg.warning_footer')
            }
          </Text>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
    marginTop: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#8B0000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
  },
  ownerCard: {
    backgroundColor: '#fff8e1',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
  },
  ownerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#f57c00',
    marginBottom: 8,
  },
  ownerText: {
    fontSize: 14,
    color: '#f57c00',
    marginBottom: 12,
  },
  ownerFeatures: {
    fontSize: 12,
    color: '#f57c00',
    lineHeight: 18,
  },
  invitationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976d2',
    marginBottom: 8,
  },
  invitationText: {
    fontSize: 14,
    color: '#1976d2',
    marginBottom: 12,
  },
  branchBadge: {
    backgroundColor: '#1976d2',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  branchName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  formContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  formSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  registrationOptions: {
    width: '100%',
  },
  googleButton: {
    backgroundColor: '#4285f4',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  googleIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  googleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ddd',
  },
  dividerText: {
    marginHorizontal: 16,
    color: '#666',
    fontSize: 14,
  },
  emailForm: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  registerButton: {
    backgroundColor: '#8B0000',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  registerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  footerText: {
    fontSize: 14,
    color: '#666',
    marginRight: 8,
  },
  loginLink: {
    fontSize: 14,
    color: '#8B0000',
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#fff3cd',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#856404',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    color: '#856404',
    lineHeight: 18,
  },
});

export default RegistrationScreen;
