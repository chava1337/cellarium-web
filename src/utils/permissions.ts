// Sistema de permisos jerárquicos para Cellarium

export type UserRole = 'owner' | 'gerente' | 'sommelier' | 'supervisor';

// Jerarquía de roles (de mayor a menor autoridad)
const roleHierarchy: Record<UserRole, number> = {
  owner: 4,
  gerente: 3,
  sommelier: 2,
  supervisor: 1,
};

// Verificar si un rol tiene permisos suficientes
export const hasPermission = (userRole: UserRole, requiredRole: UserRole): boolean => {
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
};

// Verificar si un rol puede aprobar a otro rol
export const canApproveRole = (approverRole: UserRole, targetRole: UserRole): boolean => {
  // Owner puede aprobar a todos
  if (approverRole === 'owner') return true;
  
  // Gerente puede aprobar a sommelier y supervisor
  if (approverRole === 'gerente') {
    return targetRole === 'sommelier' || targetRole === 'supervisor';
  }
  
  // Sommelier y supervisor no pueden aprobar a nadie
  return false;
};

// Obtener los roles que un usuario puede asignar
export const getAssignableRoles = (userRole: UserRole): UserRole[] => {
  switch (userRole) {
    case 'owner':
      return ['gerente', 'sommelier', 'supervisor'];
    case 'gerente':
      return ['sommelier', 'supervisor'];
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
  return userRole === 'owner' || userRole === 'gerente' || userRole === 'sommelier';
};

// Verificar si un rol puede generar QR
export const canGenerateQr = (userRole: UserRole): boolean => {
  return true; // Todos los roles pueden generar QR
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
  };
  return roleNames[role];
};

// Obtener descripción del rol
export const getRoleDescription = (role: UserRole): string => {
  const descriptions: Record<UserRole, string> = {
    owner: 'Acceso completo al sistema. Puede otorgar cualquier tipo de permiso.',
    gerente: 'Acceso a gestión y puede aprobar Sommelier y Supervisor.',
    sommelier: 'Acceso a catas y degustaciones. Sin permisos de aprobación.',
    supervisor: 'Acceso básico de supervisión. Sin catas ni aprobaciones.',
  };
  return descriptions[role];
};
