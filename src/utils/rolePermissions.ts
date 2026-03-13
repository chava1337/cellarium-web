/**
 * Jerarquía y permisos por rol (fuente única para la app).
 * owner > gerente > sommelier > supervisor > personal
 */

export type Role = 'owner' | 'gerente' | 'sommelier' | 'supervisor' | 'personal';

export const roleRank: Record<Role, number> = {
  owner: 5,
  gerente: 4,
  sommelier: 3,
  supervisor: 2,
  personal: 1,
};

/** Puede entrar al panel administrativo (AdminDashboard y flujos staff). */
export function canAccessAdminPanel(role: Role | null | undefined): boolean {
  if (!role) return false;
  return roleRank[role] >= roleRank.personal;
}

/** Solo owner y gerente pueden gestionar usuarios (aprobar/rechazar, listar). */
export function canManageUsers(role: Role | null | undefined): boolean {
  if (!role) return false;
  return role === 'owner' || role === 'gerente';
}

/** Solo owner y gerente pueden generar QRs (guest o admin_invite). Sommelier/supervisor/personal NO. */
export function canGenerateAnyQr(role: Role | null | undefined): boolean {
  if (!role) return false;
  return role === 'owner' || role === 'gerente';
}

/** Puede crear exámenes de catas/degustación: owner, gerente, sommelier. Supervisor y personal NO. */
export function canCreateTastingExam(role: Role | null | undefined): boolean {
  if (!role) return false;
  return role === 'owner' || role === 'gerente' || role === 'sommelier';
}

/** Puede realizar (tomar) exámenes: todo el staff (gerente, sommelier, supervisor, personal) y owner. */
export function canTakeTastingExam(role: Role | null | undefined): boolean {
  if (!role) return false;
  return roleRank[role] >= roleRank.personal;
}

/** Roles que pueden ver/gestar exámenes (listar, habilitar/deshabilitar, eliminar): mismo que crear. */
export function canManageTastingExams(role: Role | null | undefined): boolean {
  return canCreateTastingExam(role);
}

/** Roles que pueden acceder a pantallas admin completas (inventario, vinos, branches, cocktails, suscripciones). Personal solo puede Catas. */
export const ADMIN_FULL_ACCESS_ROLES: Role[] = ['owner', 'gerente', 'sommelier', 'supervisor'];

export function canAccessFullAdminScreens(role: Role | null | undefined): boolean {
  if (!role) return false;
  return ADMIN_FULL_ACCESS_ROLES.includes(role);
}
