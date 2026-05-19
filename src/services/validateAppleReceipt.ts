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

/** Error devuelto por invoke o por parseo del cuerpo JSON (sin datos sensibles). */
export type AppleReceiptInvokeError = {
  message: string;
  code?: string;
  /** HTTP status de la respuesta Edge cuando aplica */
  status?: number;
  /** Código numérico de verifyReceipt de Apple cuando code === APPLE_VERIFY_FAILED */
  appleStatus?: number;
};

/** Error al recuperar compra duplicada (pantalla muestra alertAppleReceiptFailure con detail). */
export class AppleReceiptRecoveryError extends Error {
  readonly name = 'AppleReceiptRecoveryError';

  constructor(public readonly detail: AppleReceiptInvokeError) {
    super(detail.message);
  }
}

function safeJsonParse(text: string): Record<string, unknown> | null {
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

export async function validateAppleReceiptBackend(
  receiptData: string,
  intent?: 'purchase' | 'restore' | 'sync' | 'purchase_recovery'
): Promise<{ data: AppleSyncResponse | null; error: AppleReceiptInvokeError | null }> {
  const receiptLen = typeof receiptData === 'string' ? receiptData.length : 0;
  console.log(
    '[Cellarium][AppleReceipt]',
    JSON.stringify({ stage: 'invoke_start', intent: intent ?? null, receiptLen })
  );

  try {
    await supabase.auth.refreshSession();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      console.log('[Cellarium][AppleReceipt]', JSON.stringify({ stage: 'invoke_end', outcome: 'no_session' }));
      return { data: null, error: { message: 'No hay sesión activa', code: 'NO_SESSION' } };
    }

    const { data, error } = await supabase.functions.invoke<AppleSyncResponse>('validate-apple-receipt', {
      body: { receiptData, intent },
      headers: { authorization: `Bearer ${token}` },
    });

    if (error) {
      let httpStatus: number | undefined;
      let code: string | undefined;
      let message = error.message ?? 'Error al validar recibo';
      let appleStatus: number | undefined;

      if (error.context?.response) {
        const res = error.context.response as Response;
        httpStatus = res.status;
        try {
          const text = await res.clone().text();
          const parsed = safeJsonParse(text);
          if (parsed) {
            if (typeof parsed.message === 'string') message = parsed.message;
            if (typeof parsed.code === 'string') code = parsed.code;
            else if (typeof parsed.error === 'string' && !parsed.message) message = parsed.error;

            const appleCode = parsed.code;
            const statusNum = parsed.status;
            if (
              appleCode === 'APPLE_VERIFY_FAILED' &&
              typeof statusNum === 'number' &&
              Number.isFinite(statusNum)
            ) {
              appleStatus = statusNum;
            }
          }
        } catch {
          /* ignore */
        }
      }

      console.log(
        '[Cellarium][AppleReceipt]',
        JSON.stringify({
          stage: 'invoke_end',
          outcome: 'edge_error',
          httpStatus: httpStatus ?? null,
          code: code ?? null,
          appleStatus: appleStatus ?? null,
        })
      );

      return { data: null, error: { message, code, status: httpStatus, appleStatus } };
    }

    console.log(
      '[Cellarium][AppleReceipt]',
      JSON.stringify({
        stage: 'invoke_end',
        outcome: 'ok',
        synced: data?.synced ?? null,
        ok: data?.ok ?? null,
      })
    );

    return { data: data ?? null, error: null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error inesperado';
    console.log(
      '[Cellarium][AppleReceipt]',
      JSON.stringify({ stage: 'invoke_end', outcome: 'exception', message: msg.slice(0, 200) })
    );
    return { data: null, error: { message: msg, code: 'UNEXPECTED' } };
  }
}
