import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, AuthContextType, Branch } from '../types';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      // Simulación de login por ahora
      console.log('Intentando iniciar sesión con:', email);
      
      // Simular delay de autenticación
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Usuario de prueba (Owner por defecto para desarrollo)
      const mockUser: User = {
        id: '1',
        email: email,
        username: email.split('@')[0],
        role: 'owner',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      setUser(mockUser);
      
      // Sucursal de prueba
      const mockBranch: Branch = {
        id: '1',
        name: 'Restaurante Principal',
        address: 'Av. Principal 123',
        phone: '+1-555-0123',
        email: 'info@restaurante.com',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      setCurrentBranch(mockBranch);
      
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setLoading(true);
      setUser(null);
      setCurrentBranch(null);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    signIn,
    signOut,
    currentBranch,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
