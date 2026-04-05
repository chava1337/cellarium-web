// Sistema de permisos jerárquicos para Cellarium

import type { User } from '../types';
import { getEffectivePlan, type EffectivePlanId } from './effectivePlan';

export type UserRole = 'owner' | 'gerente' | 'sommelier' | 'supervisor' | 'personal';

// Jerarquía de roles (de mayor a menor autoridad)
const roleHierarchy: Record<UserRole, number> = {
  owner: 5,
  gerente: 4,
  sommelier: 3,
  supervisor: 2,
  personal: 1,
};

// Verificar si un rol tiene permisos suficientes
export const hasPermission = (userRole: UserRole, requiredRole: UserRole): boolean => {
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
};

// Verificar si un rol puede aprobar a otro rol
export const canApproveRole = (approverRole: UserRole, targetRole: UserRole): boolean => {
  // Owner puede aprobar a todos
  if (approverRole === 'owner') return true;
  
  // Gerente puede aprobar a sommelier, supervisor y personal
  if (approverRole === 'gerente') {
    return targetRole === 'sommelier' || targetRole === 'supervisor' || targetRole === 'personal';
  }
  
  // Sommelier y supervisor no pueden aprobar a nadie
  return false;
};

// Obtener los roles que un usuario puede asignar
export const getAssignableRoles = (userRole: UserRole): UserRole[] => {
  switch (userRole) {
    case 'owner':
      return ['gerente', 'sommelier', 'supervisor', 'personal'];
    case 'gerente':
      return ['sommelier', 'supervisor', 'personal'];
    default:
      return [];
  }
};

// Verificar si un rol puede acceder a gestión de usuarios
export const canManageUsers = (userRole: UserRole): boolean => {
  return userRole === 'owner' || userRole === 'gerente';
};

// Verificar si un rol puede acceder a catas y degustaciones
export const canAccessTasting = (userRole: UserRole): boolean => {
  return userRole === 'owner' || userRole === 'gerente' || userRole === 'sommelier' || userRole === 'personal';
};

// Verificar si un rol puede generar algún tipo de QR (guest o admin_invite)
export const canGenerateQr = (userRole: UserRole): boolean => {
  return canGenerateGuestQrByRole(userRole) || canGenerateAdminInviteQr(userRole);
};

// Solo owner/gerente pueden generar QR de invitación admin
export const canGenerateAdminInviteQr = (userRole: UserRole): boolean => {
  return userRole === 'owner' || userRole === 'gerente';
};

// Por rol: Free => solo owner; Pro/Business => owner, gerente, supervisor (plan no conocido aquí)
const canGenerateGuestQrByRole = (userRole: UserRole): boolean => {
  return userRole === 'owner' || userRole === 'gerente' || userRole === 'supervisor';
};

/**
 * Si el usuario puede generar QR guest según plan + rol.
 * - Requiere status === 'active' (pending/inactive no pueden).
 * - owner: usa effectivePlan del propio user.
 * - gerente/supervisor: si cumple (a) status active, (b) owner_id, (c) branch_id, (d) currentBranchId,
 *   (e) user.branch_id === currentBranchId → puede generar (sin depender del plan del owner).
 */
export const canGenerateGuestQr = (
  user: User | null,
  currentBranchId?: string | null,
  _ownerEffectivePlan?: EffectivePlanId | null
): boolean => {
  if (!user?.role || user.status !== 'active') return false;
  const role = user.role as UserRole;

  if (role === 'owner') {
    const plan = getEffectivePlan(user);
    if (plan === 'cafe') return true;
    if (plan === 'bistro' || plan === 'trattoria' || plan === 'grand-maison') return true;
    return false;
  }

  if (role === 'gerente' || role === 'supervisor') {
    if (user.owner_id == null || user.branch_id == null) return false;
    if (currentBranchId == null) return false;
    if (user.branch_id !== currentBranchId) return false;
    return true;
  }

  return false;
};

// Verificar si un rol puede aprobar usuarios
export const canApproveUsers = (userRole: UserRole): boolean => {
  return userRole === 'owner' || userRole === 'gerente';
};

// Verificar si un rol puede gestionar vinos
export const canManageWines = (userRole: UserRole): boolean => {
  return true; // Todos los roles pueden gestionar vinos (con diferentes permisos)
};

// Verificar si un rol puede gestionar inventario
export const canManageInventory = (userRole: UserRole): boolean => {
  return true; // Todos los roles pueden ver inventario (con diferentes permisos)
};

// Verificar si un rol puede ver análisis
export const canViewAnalytics = (userRole: UserRole): boolean => {
  return true; // Todos los roles pueden ver análisis (con diferentes niveles)
};

// Verificar si un rol puede gestionar promociones
export const canManagePromotions = (userRole: UserRole): boolean => {
  return userRole === 'owner' || userRole === 'gerente';
};

// Obtener nombre del rol en español
export const getRoleName = (role: UserRole): string => {
  const roleNames: Record<UserRole, string> = {
    owner: 'Dueño',
    gerente: 'Gerente',
    sommelier: 'Sommelier',
    supervisor: 'Supervisor',
    personal: 'Personal',
  };
  return roleNames[role];
};

// Obtener descripción del rol
export const getRoleDescription = (role: UserRole): string => {
  const descriptions: Record<UserRole, string> = {
    owner: 'Acceso completo al sistema. Puede otorgar cualquier tipo de permiso.',
    gerente: 'Acceso a gestión y puede aprobar Sommelier, Supervisor y Personal.',
    sommelier: 'Acceso a catas y degustaciones. Sin permisos de aprobación.',
    supervisor: 'Acceso básico de supervisión. Sin catas ni aprobaciones.',
    personal: 'Acceso solo a catálogo de vinos y catas. Permisos mínimos.',
  };
  return descriptions[role];
};
