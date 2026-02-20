import React, { useEffect } from 'react';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { GuestProvider } from './src/contexts/GuestContext';
import { BranchProvider } from './src/contexts/BranchContext';
import { LanguageProvider } from './src/contexts/LanguageContext';
import { RootStackParamList } from './src/types';
import { useDeviceInfo, configureOrientation } from './src/hooks/useDeviceInfo';

// Importar pantallas
import BootstrapScreen from './src/screens/BootstrapScreen';
import AppAuthWrapper from './src/screens/AppAuthWrapper';
import AppNavigator from './src/screens/AppNavigator';
import WelcomeScreen from './src/screens/WelcomeScreen';
import AdminRegistrationScreen from './src/screens/AdminRegistrationScreen';
import QrProcessorScreen from './src/screens/QrProcessorScreen';
import SubscriptionsScreen from './src/screens/SubscriptionsScreen';
// Pantallas de desarrollo - comentadas (no necesarias con usuarios reales)
// import OwnerRegistrationScreen from './src/screens/OwnerRegistrationScreen';
// import LoginScreen from './src/screens/LoginScreen';
// import RegistrationScreen from './src/screens/RegistrationScreen';
// import AdminLoginScreen from './src/screens/AdminLoginScreen';

const Stack = createStackNavigator<RootStackParamList>();

// Configuración de Deep Linking
const prefix = Linking.createURL('/');

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    prefix,
    'cellarium://',
    'https://cellarium.app',
    'https://www.cellarium.app',
  ],
  config: {
    screens: {
      Login: 'login',
      QrProcessor: {
        path: 'qr',
      },
      WineCatalog: 'catalog',
      AdminLogin: 'admin/login',
      AdminRegistration: 'admin/register',
      AdminDashboard: 'admin/dashboard',
      UserManagement: 'admin/users',
      TastingNotes: 'admin/tasting',
      QrGeneration: 'admin/qr',
      BranchManagement: 'admin/branches',
    },
  },
};

// Componente wrapper para manejar la configuración de dispositivo
const AppContent: React.FC = () => {
  const deviceInfo = useDeviceInfo();

  useEffect(() => {
    // Configurar orientación según el tipo de dispositivo
    configureOrientation(deviceInfo.deviceType);
  }, [deviceInfo.deviceType]);

  return (
    <NavigationContainer linking={linking}>
      <StatusBar style="auto" />
      <Stack.Navigator
        initialRouteName="Bootstrap"
        screenOptions={{
          headerStyle: {
            backgroundColor: '#8B0000', // Color vino tinto
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          cardStyle: {
            backgroundColor: '#FFFFFF',
          },
        }}
      >
        <Stack.Screen 
          name="Bootstrap" 
          component={BootstrapScreen}
          options={{ 
            headerShown: false,
            cardStyle: { backgroundColor: '#FFFFFF' },
          }}
        />
        <Stack.Screen 
          name="Welcome" 
          component={WelcomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="AdminRegistration" 
          component={AdminRegistrationScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="QrProcessor" 
          component={QrProcessorScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="Subscriptions" 
          component={SubscriptionsScreen}
          options={{ title: 'Suscripciones' }}
        />
        {/* Pantallas de desarrollo - comentadas (no necesarias con usuarios reales) */}
        {/* <Stack.Screen 
          name="OwnerRegistration" 
          component={OwnerRegistrationScreen}
          options={{ title: 'Registro de Owner' }}
        />
        <Stack.Screen 
          name="Login" 
          component={LoginScreen}
          options={{ title: 'Cellarium - Iniciar Sesión' }}
        />
        <Stack.Screen 
          name="AdminLogin" 
          component={AdminLoginScreen}
          options={{ title: 'Acceso Administrativo' }}
        /> */}
        <Stack.Screen 
          name="AppAuth" 
          component={AppAuthWrapper}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="AppNavigator" 
          component={AppNavigator}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default function App() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <AuthProvider>
          <BranchProvider>
            <GuestProvider>
              <AppContent />
            </GuestProvider>
          </BranchProvider>
        </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}