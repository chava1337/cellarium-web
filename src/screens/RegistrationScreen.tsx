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

type RegistrationScreenNavigationProp = StackNavigationProp<RootStackParamList, 'AdminRegistration'>;
type RegistrationScreenRouteProp = RouteProp<RootStackParamList, 'AdminRegistration'>;

interface Props {
  navigation: RegistrationScreenNavigationProp;
  route: RegistrationScreenRouteProp;
}

const RegistrationScreen: React.FC<Props> = ({ navigation, route }) => {
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
      Alert.alert('Error', 'Por favor completa todos los campos');
      return;
    }

    if (!isValidEmail(email)) {
      Alert.alert('Error', 'Por favor ingresa un email válido');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Las contraseñas no coinciden');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);
    try {
      if (isOwnerRegistration) {
        // Registro libre para Owner - se aprueba automáticamente
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        Alert.alert(
          '¡Registro Exitoso!',
          'Tu cuenta de Owner ha sido creada y activada automáticamente. Ya puedes acceder al sistema.',
          [
            {
              text: 'Continuar',
              onPress: () => navigation.navigate('Login'),
            },
          ]
        );
      } else {
        // Registro de Admin invitado - requiere aprobación
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        Alert.alert(
          'Registro Exitoso',
          'Tu cuenta ha sido creada. Un administrador revisará tu solicitud y te notificará cuando sea aprobada.',
          [
            {
              text: 'OK',
              onPress: () => navigation.navigate('Login'),
            },
          ]
        );
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo completar el registro. Inténtalo de nuevo.');
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
        'Registro con Google',
        'Registro exitoso con Google. Un administrador revisará tu solicitud.',
        [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Login'),
          },
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'No se pudo completar el registro con Google.');
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
          <Text style={styles.title}>🍷 Cellarium</Text>
          <Text style={styles.subtitle}>
            {isOwnerRegistration ? 'Registro de Owner' : 'Registro de Administrador'}
          </Text>
        </View>

        {/* Información de invitación QR */}
        {isInvitedAdmin && branchName && (
          <View style={styles.invitationCard}>
            <Text style={styles.invitationTitle}>📧 Invitación Recibida</Text>
            <Text style={styles.invitationText}>
              Has sido invitado a unirte como administrador de:
            </Text>
            <View style={styles.branchBadge}>
              <Text style={styles.branchName}>{branchName}</Text>
            </View>
          </View>
        )}

        {/* Información para Owner */}
        {isOwnerRegistration && (
          <View style={styles.ownerCard}>
            <Text style={styles.ownerTitle}>👑 Registro de Owner</Text>
            <Text style={styles.ownerText}>
              Como Owner, tendrás control total del sistema y podrás:
            </Text>
            <Text style={styles.ownerFeatures}>
              • Crear y gestionar sucursales{'\n'}
              • Invitar y aprobar administradores{'\n'}
              • Acceder a todas las funcionalidades{'\n'}
              • Tu cuenta se activará automáticamente
            </Text>
          </View>
        )}

        <View style={styles.formContainer}>
          <Text style={styles.formTitle}>
            {isOwnerRegistration ? 'Crear Cuenta de Owner' : 'Completar Registro'}
          </Text>
          <Text style={styles.formSubtitle}>
            {isOwnerRegistration ? 
              'Regístrate como Owner para comenzar a usar el sistema' : 
              'Completa tu registro para acceder al sistema'
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
                  <Text style={styles.googleButtonText}>Continuar con Google</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>O</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Formulario de registro con email */}
            <View style={styles.emailForm}>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="tu@email.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Nombre de Usuario</Text>
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="tu_usuario"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Contraseña</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Mínimo 6 caracteres"
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Confirmar Contraseña</Text>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Repite tu contraseña"
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
                  <Text style={styles.registerButtonText}>Crear Cuenta</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            ¿Ya tienes una cuenta?
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginLink}>Iniciar Sesión</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>ℹ️ Información Importante</Text>
          <Text style={styles.infoText}>
            {isOwnerRegistration ? 
              '• Como Owner, tu cuenta se activará automáticamente\n• Tendrás control total del sistema\n• Podrás crear sucursales e invitar administradores\n• Acceso completo a todas las funcionalidades' :
              '• Tu cuenta requiere aprobación de un administrador\n• Los administradores pueden asignar roles y permisos\n• El acceso está limitado por sucursal según tu invitación\n• Se te notificará por email cuando tu cuenta sea aprobada'
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
