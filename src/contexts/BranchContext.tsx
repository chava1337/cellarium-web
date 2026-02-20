import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Branch, User } from '../types';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

interface BranchContextType {
  currentBranch: Branch | null;
  setCurrentBranch: (branch: Branch) => void;
  availableBranches: Branch[];
  setAvailableBranches: (branches: Branch[]) => void;
  refreshBranches: () => Promise<void>;
  isInitialized: boolean;
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

export const BranchProvider: React.FC<BranchProviderProps> = ({ children }) => {
  const { user, profileReady } = useAuth();
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
  const [availableBranches, setAvailableBranches] = useState<Branch[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  const loadBranchesFromDB = useCallback(async (ownerUser: User) => {
    try {
      const ownerId = ownerUser.owner_id || ownerUser.id;
      const { data: branches, error } = await supabase
        .from('branches')
        .select('*')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error cargando sucursales:', error);
        throw error;
      }

      let filteredBranches: Branch[] = [];
      if (ownerUser.role === 'owner') {
        filteredBranches = branches || [];
      } else {
        filteredBranches = (branches || []).filter(
          branch => branch.id === ownerUser.branch_id
        );
      }
      setAvailableBranches(filteredBranches);
      if (filteredBranches.length > 0) {
        if (ownerUser.role === 'owner') {
          setCurrentBranch(filteredBranches[0]);
        } else {
          const assignedBranch = filteredBranches.find(b => b.id === ownerUser.branch_id);
          setCurrentBranch(assignedBranch || filteredBranches[0]);
        }
      }
      setIsInitialized(true);
    } catch (error) {
      setAvailableBranches([]);
      setCurrentBranch(null);
      setIsInitialized(true);
    }
  }, []);

  const refreshBranches = useCallback(async () => {
    if (user) await loadBranchesFromDB(user);
  }, [user, loadBranchesFromDB]);

  useEffect(() => {
    if (user && profileReady) {
      loadBranchesFromDB(user as User);
    } else if (!user) {
      setAvailableBranches([]);
      setCurrentBranch(null);
      setIsInitialized(true);
    }
  }, [user, profileReady, loadBranchesFromDB]);

  const value: BranchContextType = {
    currentBranch,
    setCurrentBranch,
    availableBranches,
    setAvailableBranches,
    refreshBranches,
    isInitialized,
  };

  return (
    <BranchContext.Provider value={value}>
      {children}
    </BranchContext.Provider>
  );
};