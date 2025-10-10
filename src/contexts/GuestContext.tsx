import React, { createContext, useContext, useState } from 'react';
import { GuestSession, GuestContextType, Branch, QrToken } from '../types';

const GuestContext = createContext<GuestContextType | undefined>(undefined);

export const useGuest = () => {
  const context = useContext(GuestContext);
  if (context === undefined) {
    throw new Error('useGuest must be used within a GuestProvider');
  }
  return context;
};

interface GuestProviderProps {
  children: React.ReactNode;
}

export const GuestProvider: React.FC<GuestProviderProps> = ({ children }) => {
  const [session, setSession] = useState<GuestSession | null>(null);
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
  const [qrToken, setQrToken] = useState<QrToken | null>(null);

  const startSession = async (token: string) => {
    try {
      console.log('Iniciando sesión con token:', token);
      
      // Simular validación de token
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Datos de prueba
      const mockBranch: Branch = {
        id: '1',
        name: 'Restaurante Principal',
        address: 'Av. Principal 123',
        phone: '+1-555-0123',
        email: 'info@restaurante.com',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      const mockToken: QrToken = {
        id: '1',
        branch_id: '1',
        token: token,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        is_active: true,
        created_at: new Date().toISOString(),
      };
      
      const mockSession: GuestSession = {
        id: '1',
        qr_token_id: '1',
        branch_id: '1',
        session_start: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      
      setSession(mockSession);
      setCurrentBranch(mockBranch);
      setQrToken(mockToken);
      
    } catch (error) {
      console.error('Error starting guest session:', error);
      throw error;
    }
  };

  const endSession = async () => {
    try {
      console.log('Finalizando sesión');
      setSession(null);
      setCurrentBranch(null);
      setQrToken(null);
    } catch (error) {
      console.error('Error in endSession:', error);
    }
  };

  const value: GuestContextType = {
    session,
    currentBranch,
    qrToken,
    startSession,
    endSession,
  };

  return (
    <GuestContext.Provider value={value}>
      {children}
    </GuestContext.Provider>
  );
};
