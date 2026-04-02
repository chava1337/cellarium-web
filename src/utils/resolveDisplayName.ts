/**
 * Nombre visible para UI: nunca usa email ni local-part como display name.
 * Prioridad: name en DB (si no es placeholder relay) → full_name → name en metadata → "Usuario".
 */

const APPLE_RELAY_SUFFIX = '@privaterelay.appleid.com';

function isAppleRelayEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') return false;
  return email.toLowerCase().endsWith(APPLE_RELAY_SUFFIX);
}

function emailLocalPart(email: string): string {
  const i = email.indexOf('@');
  return i <= 0 ? '' : email.slice(0, i);
}

/** True si name parece el local-part opaco de Hide My Email (trigger split_part). */
export function isRelayPlaceholderName(
  name: string | null | undefined,
  email: string | null | undefined,
): boolean {
  if (!name || !email) return false;
  const n = name.trim();
  if (!n) return false;
  if (!isAppleRelayEmail(email)) return false;
  return emailLocalPart(email) === n;
}

export function resolveDisplayName(params: {
  dbName?: string | null;
  metaFullName?: string | null;
  metaName?: string | null;
  email?: string | null;
}): string {
  const { dbName, metaFullName, metaName, email } = params;
  const db = typeof dbName === 'string' ? dbName.trim() : '';
  if (db && !isRelayPlaceholderName(db, email)) {
    return db;
  }
  const fn = typeof metaFullName === 'string' ? metaFullName.trim() : '';
  if (fn) return fn;
  const mn = typeof metaName === 'string' ? metaName.trim() : '';
  if (mn) return mn;
  return 'Usuario';
}
