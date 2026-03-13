import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { RootStackParamList } from '../types';

// Importar pantallas principales
import WineCatalogScreen from './WineCatalogScreen';
import AdminLoginScreen from './AdminLoginScreen';
import AdminDashboardScreen from './AdminDashboardScreen';
import UserManagementScreen from './UserManagementScreen';
import TastingNotesScreen from './TastingNotesScreen';
import QrGenerationScreen from './QrGenerationScreen';
import BranchManagementScreen from './BranchManagementScreen';
import QrProcessorScreen from './QrProcessorScreen';
import WineManagementScreen from './WineManagementScreen';
import QrScannerScreen from './QrScannerScreen';
import InventoryAnalyticsScreen from './InventoryAnalyticsScreen';
import FichaExtendidaScreen from './FichaExtendidaScreen';
import GlobalWineCatalogScreen from './GlobalWineCatalogScreen';
import AddWineToCatalogScreen from './AddWineToCatalogScreen';
import TastingExamsListScreen from './TastingExamsListScreen';
import CreateTastingExamScreen from './CreateTastingExamScreen';
import TakeTastingExamScreen from './TakeTastingExamScreen';
import TastingExamResultsScreen from './TastingExamResultsScreen';
import SettingsScreen from './SettingsScreen';
import CocktailManagementScreen from './CocktailManagementScreen';
import SubscriptionsScreen from './SubscriptionsScreen';
import OwnerEmailVerificationScreen from './OwnerEmailVerificationScreen';

const Stack = createStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="WineCatalog"
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
        name="WineCatalog" 
        component={WineCatalogScreen}
        options={{ title: 'Catálogo de Vinos' }}
      />
      <Stack.Screen 
        name="QrProcessor" 
        component={QrProcessorScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="AdminLogin" 
        component={AdminLoginScreen}
        options={{ title: 'Acceso Administrativo', headerShown: true }}
      />
      <Stack.Screen 
        name="AdminDashboard" 
        component={AdminDashboardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="UserManagement" 
        component={UserManagementScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="TastingNotes" 
        component={TastingNotesScreen}
        options={{ title: 'Catas y Degustaciones' }}
      />
      <Stack.Screen 
        name="QrGeneration" 
        component={QrGenerationScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="BranchManagement" 
        component={BranchManagementScreen}
        options={{ title: 'Gestión de Sucursales' }}
      />
      <Stack.Screen 
        name="WineManagement" 
        component={WineManagementScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="GlobalWineCatalog" 
        component={GlobalWineCatalogScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="AddWineToCatalog" 
        component={AddWineToCatalogScreen}
        options={{ title: 'Agregar al Catálogo' }}
      />
      <Stack.Screen 
        name="QrScanner" 
        component={QrScannerScreen}
        options={{ title: 'Escanear QR' }}
      />
      <Stack.Screen 
        name="InventoryManagement" 
        component={InventoryAnalyticsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="FichaExtendidaScreen" 
        component={FichaExtendidaScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="TastingExamsList" 
        component={TastingExamsListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="CreateTastingExam" 
        component={CreateTastingExamScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="TakeTastingExam" 
        component={TakeTastingExamScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="TastingExamResults" 
        component={TastingExamResultsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="Settings" 
        component={SettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="CocktailManagement" 
        component={CocktailManagementScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="Subscriptions" 
        component={SubscriptionsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="OwnerEmailVerification" 
        component={OwnerEmailVerificationScreen}
        options={{ title: 'Verificar correo' }}
      />
    </Stack.Navigator>
  );
}




















