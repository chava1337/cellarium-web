/**
 * Sign in with Apple: solo iOS (ver appleAuth.ios.ts).
 * Android/Web: no disponible.
 */

export async function isAppleAuthAvailable(): Promise<boolean> {
  return false;
}

export type AppleSignInResult =
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; error: Error };

export async function signInWithAppleAndSupabase(): Promise<AppleSignInResult> {
  return { ok: false, error: new Error('Sign in with Apple solo está disponible en iOS') };
}
