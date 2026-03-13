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
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useAdminGuard } from '../hooks/useAdminGuard';

type AdminLoginScreenNavigationProp = StackNavigationProp<RootStackParamList, 'AdminLogin'>;
type AdminLoginScreenRouteProp = RouteProp<RootStackParamList, 'AdminLogin'>;

interface Props {
  navigation: AdminLoginScreenNavigationProp;
  route: AdminLoginScreenRouteProp;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AdminLoginScreen: React.FC<Props> = ({ navigation, route }) => {
  useAdminGuard({ navigation, route, requireAuth: false });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleAdminLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Error', 'Por favor ingresa correo electrónico y contraseña');
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      Alert.alert('Error', 'Ingresa un correo electrónico válido.');
      return;
    }

    try {
      setLoading(true);
      await signIn(normalizedEmail, password);
      navigation.navigate('AdminDashboard');
    } catch (error: any) {
      Alert.alert('Credenciales inválidas', 'Correo o contraseña incorrectos.');
    } finally {
      setLoading(false);
    }
  };


  const handleDevelopmentMode = () => {
    // Botón de desarrollo - navegar directamente al panel admin
    navigation.navigate('AdminDashboard');
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Acceso Administrativo</Text>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.formTitle}>Autenticación de Administrador</Text>
          
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Correo electrónico</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="correo@ejemplo.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
          </View>
          
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Contraseña de administrador"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleAdminLogin}
            disabled={loading}
          >
            <Text style={styles.loginButtonText}>
              {loading ? 'Verificando...' : 'Acceder'}
            </Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Desarrollo</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.devButton}
            onPress={handleDevelopmentMode}
          >
            <Text style={styles.devButtonText}>🚀 Modo Desarrollo</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
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
    fontSize: 28,
    fontWeight: 'bold',
    color: '#8B0000',
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
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
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
  loginButton: {
    backgroundColor: '#8B0000',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 24,
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
    marginBottom: 24,
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
    marginBottom: 24,
  },
  devButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default AdminLoginScreen;


