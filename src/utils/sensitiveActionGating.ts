/**
 * Gating para acciones sensibles (Stripe/pagos, generación de QR).
 * Owners con registro manual (password) deben tener owner_email_verified=true.
 * Owners con Google OAuth y staff no están restringidos.
 */

import type { User } from '../types';

export function isSensitiveAllowed(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.role !== 'owner') return true;
  if (user.signup_method === 'google') return true;
  if (user.signup_method === 'password') return user.owner_email_verified === true;
  return false;
}
