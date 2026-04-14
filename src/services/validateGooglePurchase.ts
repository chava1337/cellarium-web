/**
 * Valida compra Google Play con Edge Function validate-google-subscription (Supabase).
 */
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';

export type GoogleSyncResponse = {
  ok?: boolean;
  synced?: 'active' | 'lapsed';
  plan_id?: string;
  plan_name?: string;
  expires_at?: string;
  play_state?: string;
  google_order_id?: string;
  reason?: string;
  /** Presente en respuestas de error del backend */
  error?: string;
  code?: string;
};

/** Debe coincidir con GOOGLE_PLAY_PACKAGE_NAME en Supabase y con app.config.js (android.package). */
export function getCellariumAndroidPackageName(): string {
  return Constants.expoConfig?.android?.package ?? 'com.cellarium.winecatalog';
}

export type ValidateGooglePurchaseInput = {
  purchaseToken: string;
  productId: string;
  packageName: string;
};

export async function validateGooglePurchaseBackend(
  input: ValidateGooglePurchaseInput
): Promise<{ data: GoogleSyncResponse | null; error: { message: string; code?: string; status?: number } | null }> {
  const { purchaseToken, productId, packageName } = input;
  if (!purchaseToken?.trim() || !productId?.trim() || !packageName?.trim()) {
    return {
      data: null,
      error: { message: 'Faltan purchaseToken, productId o packageName', code: 'MISSING_FIELDS' },
    };
  }

  try {
    await supabase.auth.refreshSession();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      return { data: null, error: { message: 'No hay sesión activa', code: 'NO_SESSION' } };
    }

    const { data, error } = await supabase.functions.invoke<GoogleSyncResponse>('validate-google-subscription', {
      body: {
        purchaseToken: purchaseToken.trim(),
        productId: productId.trim(),
        packageName: packageName.trim(),
      },
      headers: { authorization: `Bearer ${token}` },
    });

    if (error) {
      let status: number | undefined;
      let code: string | undefined;
      let message = error.message ?? 'Error al validar con Google Play';
      if (error.context?.response) {
        const res = error.context.response as Response;
        status = res.status;
        try {
          const text = await res.clone().text();
          const parsed = JSON.parse(text) as { error?: string; code?: string; message?: string };
          if (parsed?.message) message = String(parsed.message);
          if (parsed?.code) code = String(parsed.code);
          else if (parsed?.error) message = String(parsed.error);
        } catch {
          /* ignore */
        }
      }
      return { data: null, error: { message, code, status } };
    }

    return { data: data ?? null, error: null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error inesperado';
    return { data: null, error: { message: msg, code: 'UNEXPECTED' } };
  }
}
