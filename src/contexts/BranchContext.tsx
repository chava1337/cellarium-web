import React, { createContext, useContext, useState, useEffect } from 'react';
import { Branch } from '../types';

interface BranchContextType {
  currentBranch: Branch | null;
  setCurrentBranch: (branch: Branch) => void;
  availableBranches: Branch[];
  setAvailableBranches: (branches: Branch[]) => void;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

export const useBranch = () => {
  const context = useContext(BranchContext);
  if (context === undefined) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return context;
};

interface BranchProviderProps {
  children: React.ReactNode;
}

// Sucursales de prueba
const mockBranches: Branch[] = [
  {
    id: '1',
    name: 'Restaurante Principal',
    address: 'Av. Principal 123, Ciudad',
    phone: '+1-555-0123',
    email: 'info@restaurante.com',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '2',
    name: 'Sucursal Centro',
    address: 'Calle Centro 456, Ciudad',
    phone: '+1-555-0124',
    email: 'centro@restaurante.com',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '3',
    name: 'Sucursal Norte',
    address: 'Av. Norte 789, Ciudad',
    phone: '+1-555-0125',
    email: 'norte@restaurante.com',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const BranchProvider: React.FC<BranchProviderProps> = ({ children }) => {
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(mockBranches[0]);
  const [availableBranches, setAvailableBranches] = useState<Branch[]>(mockBranches);

  const value: BranchContextType = {
    currentBranch,
    setCurrentBranch,
    availableBranches,
    setAvailableBranches,
  };

  return (
    <BranchContext.Provider value={value}>
      {children}
    </BranchContext.Provider>
  );
};
