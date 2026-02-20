import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types';
type OwnerRegistrationScreenNavigationProp = StackNavigationProp<RootStackParamList, 'OwnerRegistration'>;

interface Props {
  navigation: OwnerRegistrationScreenNavigationProp;
}

const OwnerRegistrationScreen: React.FC<Props> = ({ navigation }) => {
  const [loading, setLoading] = useState(false);

  // TODO: Implementar Google OAuth real cuando esté configurado

  const handleGoogleAuthSuccess = async (authentication: any) => {
    try {
      console.log('🔐 Autenticación Google exitosa');
      
      // TODO: Implementar registro real en Supabase
      // 1. Crear usuario en Supabase Auth
      // 2. Crear registro de Owner
      // 3. Configurar primera sucursal
      // 4. Redirigir al dashboard
      
      // Simulación por ahora
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      Alert.alert(
        '¡Registro Exitoso!',
        'Tu cuenta de Owner ha sido creada. Configura tu primera sucursal para comenzar.',
        [
          {
            text: 'Continuar',
            onPress: () => {
              // TODO: Navegar a configuración de sucursal
              navigation.navigate('AdminDashboard');
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error en registro de Owner:', error);
      Alert.alert('Error', 'No se pudo completar el registro. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    setLoading(true);
    try {
      // TODO: Implementar Google OAuth real
      Alert.alert(
        'Google OAuth',
        'Google OAuth estará disponible pronto. Por ahora usa el botón de desarrollo.',
        [
          { text: 'OK', onPress: () => setLoading(false) }
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'No se pudo iniciar la autenticación con Google.');
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Registro de Owner</Text>
        </View>

        {/* Owner Info Card */}
        <View style={styles.ownerCard}>
          <Text style={styles.ownerTitle}>👑 ¿Qué es un Owner?</Text>
          <Text style={styles.ownerDescription}>
            Un Owner es el dueño de uno o más restaurantes que utiliza Cellarium para gestionar sus catálogos de vinos.
          </Text>
          
          <Text style={styles.benefitsTitle}>Beneficios como Owner:</Text>
          <Text style={styles.benefitItem}>• Control total de tu restaurante</Text>
          <Text style={styles.benefitItem}>• Gestión de múltiples sucursales</Text>
          <Text style={styles.benefitItem}>• Invitación de staff con permisos específicos</Text>
          <Text style={styles.benefitItem}>• Generación de QR para comensales</Text>
          <Text style={styles.benefitItem}>• Análisis y reportes de ventas</Text>
          <Text style={styles.benefitItem}>• Control de inventario con IA</Text>
          <Text style={styles.benefitItem}>• Privacidad total de tus datos</Text>
        </View>

        {/* Registration Form */}
        <View style={styles.formContainer}>
          <Text style={styles.formTitle}>Crear Cuenta de Owner</Text>
          <Text style={styles.formSubtitle}>
            Regístrate usando tu cuenta de Google para comenzar
          </Text>

          <TouchableOpacity
            style={[styles.googleButton, loading && styles.googleButtonDisabled]}
            onPress={handleGoogleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.googleButtonText}>G</Text>
                <Text style={styles.googleButtonMainText}>
                  Registrar con Google
                </Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.privacyText}>
            Al registrarte, aceptas nuestros términos de servicio y política de privacidad.
            Tus datos están completamente aislados y seguros.
          </Text>
        </View>

        {/* Development Section */}
        <View style={styles.devSection}>
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Desarrollo</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.devButton}
            onPress={() => {
              Alert.alert(
                'Modo Desarrollo',
                'Simulando registro de Owner exitoso...',
                [
                  {
                    text: 'Continuar',
                    onPress: () => navigation.navigate('AdminDashboard'),
                  },
                ]
              );
            }}
          >
            <Text style={styles.devButtonText}>🚀 Simular Registro Owner</Text>
            <Text style={styles.devButtonSubtext}>
              Saltar autenticación para desarrollo
            </Text>
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoTitle}>ℹ️ Información Importante</Text>
          <Text style={styles.infoText}>
            • Tu cuenta se activará automáticamente{'\n'}
            • Tendrás acceso completo a todas las funciones{'\n'}
            • Podrás crear sucursales e invitar staff{'\n'}
            • Tus datos estarán completamente aislados{'\n'}
            • Podrás generar QR para comensales
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
    marginTop: 10,
  },
  backButton: {
    padding: 10,
    marginRight: 10,
  },
  backButtonText: {
    fontSize: 24,
    color: '#8B0000',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
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
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f57c00',
    marginBottom: 10,
  },
  ownerDescription: {
    fontSize: 14,
    color: '#f57c00',
    marginBottom: 15,
    lineHeight: 20,
  },
  benefitsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#f57c00',
    marginBottom: 10,
  },
  benefitItem: {
    fontSize: 14,
    color: '#f57c00',
    marginBottom: 5,
    lineHeight: 18,
  },
  formContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  formSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  googleButton: {
    backgroundColor: '#4285F4',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 15,
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleButtonText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    marginRight: 10,
  },
  googleButtonMainText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  privacyText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 16,
  },
  devSection: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ccc',
  },
  dividerText: {
    marginHorizontal: 15,
    color: '#666',
    fontSize: 14,
    fontWeight: 'bold',
  },
  devButton: {
    backgroundColor: '#28a745',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
  },
  devButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 3,
  },
  devButtonSubtext: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.9,
  },
  infoContainer: {
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#2196f3',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976d2',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#1976d2',
    lineHeight: 20,
  },
});

export default OwnerRegistrationScreen;
