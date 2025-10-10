import React, { useEffect } from 'react';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { AuthProvider } from './src/contexts/AuthContext';
import { GuestProvider } from './src/contexts/GuestContext';
import { BranchProvider } from './src/contexts/BranchContext';
import { RootStackParamList } from './src/types';
import { useDeviceInfo, configureOrientation } from './src/hooks/useDeviceInfo';

// Importar pantallas
import LoginScreen from './src/screens/LoginScreen';
import WineCatalogScreen from './src/screens/WineCatalogScreen';
import AdminLoginScreen from './src/screens/AdminLoginScreen';
import AdminDashboardScreen from './src/screens/AdminDashboardScreen';
import UserManagementScreen from './src/screens/UserManagementScreen';
import TastingNotesScreen from './src/screens/TastingNotesScreen';
import QrGenerationScreen from './src/screens/QrGenerationScreen';
import BranchManagementScreen from './src/screens/BranchManagementScreen';
import AdminRegistrationScreen from './src/screens/AdminRegistrationScreen';
import QrProcessorScreen from './src/screens/QrProcessorScreen';

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
        parse: {
          qrData: (qrData: string) => {
            try {
              return JSON.parse(decodeURIComponent(qrData));
            } catch {
              return qrData;
            }
          },
        },
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
        initialRouteName="Login"
        screenOptions={{
          headerStyle: {
            backgroundColor: '#8B0000', // Color vino tinto
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
            <Stack.Screen 
              name="Login" 
              component={LoginScreen}
              options={{ title: 'Cellarium - Iniciar Sesión' }}
            />
            <Stack.Screen 
              name="QrProcessor" 
              component={QrProcessorScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen 
              name="WineCatalog" 
              component={WineCatalogScreen}
              options={{ title: 'Catálogo de Vinos' }}
            />
            <Stack.Screen 
              name="AdminLogin" 
              component={AdminLoginScreen}
              options={{ title: 'Acceso Administrativo' }}
            />
            <Stack.Screen 
              name="AdminRegistration" 
              component={AdminRegistrationScreen}
              options={{ title: 'Registro de Admin' }}
            />
            <Stack.Screen 
              name="AdminDashboard" 
              component={AdminDashboardScreen}
              options={{ title: 'Panel de Administración' }}
            />
            <Stack.Screen 
              name="UserManagement" 
              component={UserManagementScreen}
              options={{ title: 'Gestión de Usuarios' }}
            />
            <Stack.Screen 
              name="TastingNotes" 
              component={TastingNotesScreen}
              options={{ title: 'Catas y Degustaciones' }}
            />
            <Stack.Screen 
              name="QrGeneration" 
              component={QrGenerationScreen}
              options={{ title: 'Generación de QR' }}
            />
            <Stack.Screen 
              name="BranchManagement" 
              component={BranchManagementScreen}
              options={{ title: 'Gestión de Sucursales' }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      );
    };

    export default function App() {
      return (
        <BranchProvider>
          <AuthProvider>
            <GuestProvider>
              <AppContent />
            </GuestProvider>
          </AuthProvider>
        </BranchProvider>
      );
    }