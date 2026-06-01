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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { RootStackParamList } from '../types';
import { StackNavigationProp } from '@react-navigation/stack';
import RoleSelector, { RoleOption } from '../components/RoleSelector';

type LoginScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Login'>;

interface Props {
  navigation: LoginScreenNavigationProp;
}

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert(t('common.error'), t('auth.fill_all_fields'));
      return;
    }

    try {
      setLoading(true);
      await signIn(email, password);
      
      navigation.navigate('WineCatalog');
    } catch (error: any) {
      Alert.alert(t('auth.login_error_title'), error.message || t('auth.invalid_credentials_body'));
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSelected = async (role: RoleOption) => {
    // Autenticar con el rol seleccionado
    try {
      setLoading(true);
      
      // Usar la función signIn del AuthContext para autenticar usuario con rol específico
      await signIn(role.email, 'password123', role);
      
      // Navegar al catálogo de vinos después del login exitoso
      navigation.navigate('WineCatalog');
    } catch (error: any) {
      Alert.alert(
        t('common.error'),
        t('auth.role_auth_error').replace('{role}', role.displayName)
      );
    } finally {
      setLoading(false);
    }
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
          <Text style={styles.subtitle}>{t('auth.footer_catalog')}</Text>
        </View>

                 <View style={styles.formContainer}>
                   <Text style={styles.formTitle}>{t('auth.login_owner_title')}</Text>
                   <Text style={styles.formSubtitle}>
                     {t('auth.login_owner_subtitle')}
                   </Text>
          
          <View style={styles.inputContainer}>
            <Text style={styles.label}>{t('auth.email_or_username')}</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder={t('auth.email_or_username_placeholder')}
              keyboardType="email-address"
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
              placeholder={t('auth.password_placeholder_short')}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.loginButtonText}>
              {loading ? t('auth.logging_in_button') : t('auth.login_button')}
            </Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('auth.dev_section')}</Text>
            <View style={styles.dividerLine} />
          </View>

          <RoleSelector
            onRoleSelected={handleRoleSelected}
            disabled={loading}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {t('auth.login_owner_subtitle')}
          </Text>
          
                 <View style={styles.registrationSection}>
                   <Text style={styles.footerSubtext}>
                     {t('auth.footer_no_account')}
                   </Text>
                   <TouchableOpacity
                     style={styles.registerButton}
                     onPress={() => navigation.navigate('OwnerRegistration')}
                   >
                     <Text style={styles.registerButtonText}>{t('auth.register_owner_link')}</Text>
                   </TouchableOpacity>
                 </View>

                 <Text style={styles.footerSubtext}>
                   {t('auth.admin_reg.invited_info')}
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
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#8B0000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    fontWeight: '500',
  },
  formContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  formSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
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
  loginButton: {
    backgroundColor: '#8B0000',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  loginButtonDisabled: {
    backgroundColor: '#ccc',
  },
  loginButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
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
  devButton: {
    backgroundColor: '#28a745',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  devButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  devButtonSubtext: {
    color: 'white',
    fontSize: 12,
    marginTop: 4,
    opacity: 0.9,
  },
  footer: {
    alignItems: 'center',
    marginTop: 40,
  },
  footerText: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 8,
  },
  registrationSection: {
    alignItems: 'center',
    marginVertical: 16,
  },
  registerButton: {
    backgroundColor: '#8B0000',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 8,
    marginTop: 8,
  },
  registerButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  footerSubtext: {
    color: '#999',
    fontSize: 11,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default LoginScreen;

