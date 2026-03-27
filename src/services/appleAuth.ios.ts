/**
 * Sign in with Apple (nativo) + Supabase signInWithIdToken.
 * Nonce: SHA256(hex) para Apple; raw nonce para Supabase (requisito de validación JWT).
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';

export async function isAppleAuthAvailable(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export type AppleSignInResult =
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; error: Error };

function isUserCancelled(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  return code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED';
}

async function invokeEnsureOwnerOauthMetadata(accessToken: string): Promise<void> {
  try {
    await supabase.functions.invoke('ensure-owner-oauth-metadata', {
      headers: { authorization: `Bearer ${accessToken}` },
    });
  } catch {
    /* best effort */
  }
}

export async function signInWithAppleAndSupabase(): Promise<AppleSignInResult> {
  try {
    const rawBytes = await Crypto.getRandomBytesAsync(16);
    const rawNonce = Array.from(rawBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
      { encoding: Crypto.CryptoEncoding.HEX }
    );

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    const identityToken = credential.identityToken;
    if (!identityToken) {
      return { ok: false, error: new Error('Apple no devolvió identity token') };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: identityToken,
      nonce: rawNonce,
    });

    if (error) {
      return { ok: false, error: new Error(error.message) };
    }

    if (!data?.session?.access_token) {
      return { ok: false, error: new Error('No se pudo establecer sesión') };
    }

    const fn = credential.fullName;
    if (fn && (fn.givenName || fn.familyName)) {
      const displayName = [fn.givenName, fn.familyName].filter(Boolean).join(' ').trim();
      if (displayName.length > 0) {
        try {
          await supabase.auth.updateUser({
            data: { full_name: displayName, name: displayName },
          });
        } catch {
          /* no bloquear login */
        }
      }
    }

    await invokeEnsureOwnerOauthMetadata(data.session.access_token);

    return { ok: true };
  } catch (e: unknown) {
    if (isUserCancelled(e)) {
      return { ok: false, cancelled: true };
    }
    const msg = e instanceof Error ? e.message : 'Error en Sign in with Apple';
    return { ok: false, error: new Error(msg) };
  }
}
