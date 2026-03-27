import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Branch, User } from '../types';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

interface BranchContextType {
  currentBranch: Branch | null;
  setCurrentBranch: (branch: Branch) => void;
  /** Todas las sucursales del owner (incluye bloqueadas); para conteos y administración. */
  allBranches: Branch[];
  setAllBranches: (branches: Branch[]) => void;
  /** Sucursales operables (no bloqueadas); selector y operación diaria. */
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
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
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

      const rows = (branches || []) as Branch[];
      let fullList: Branch[] = [];
      let operableList: Branch[] = [];

      if (ownerUser.role === 'owner') {
        fullList = rows;
        operableList = rows.filter(b => b.is_locked !== true);
      } else {
        fullList = rows.filter(branch => branch.id === ownerUser.branch_id);
        operableList = fullList;
      }

      setAllBranches(fullList);
      setAvailableBranches(operableList);

      if (operableList.length > 0) {
        setCurrentBranch(prev => {
          const stillOk = prev && operableList.some(b => b.id === prev.id);
          if (stillOk && prev) return prev;
          const main = operableList.find(b => b.is_main === true);
          return main ?? operableList[0];
        });
      } else {
        setCurrentBranch(null);
      }
      setIsInitialized(true);
    } catch (error) {
      setAllBranches([]);
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
      setAllBranches([]);
      setAvailableBranches([]);
      setCurrentBranch(null);
      setIsInitialized(true);
    }
  }, [user, profileReady, loadBranchesFromDB]);

  const value: BranchContextType = {
    currentBranch,
    setCurrentBranch,
    allBranches,
    setAllBranches,
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