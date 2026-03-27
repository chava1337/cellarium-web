/**
 * Sincroniza recibo con Edge Function validate-apple-receipt (Supabase).
 */
import { supabase } from '../lib/supabase';

export type AppleSyncResponse = {
  ok?: boolean;
  synced?: 'active' | 'lapsed';
  reason?: string;
  plan_id?: string;
  plan_name?: string;
  expires_at?: string;
};

export async function validateAppleReceiptBackend(
  receiptData: string,
  intent?: 'purchase' | 'restore' | 'sync'
): Promise<{ data: AppleSyncResponse | null; error: { message: string; code?: string; status?: number } | null }> {
  try {
    await supabase.auth.refreshSession();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      return { data: null, error: { message: 'No hay sesión activa', code: 'NO_SESSION' } };
    }

    const { data, error } = await supabase.functions.invoke<AppleSyncResponse>('validate-apple-receipt', {
      body: { receiptData, intent },
      headers: { authorization: `Bearer ${token}` },
    });

    if (error) {
      let status: number | undefined;
      let code: string | undefined;
      let message = error.message ?? 'Error al validar recibo';
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
