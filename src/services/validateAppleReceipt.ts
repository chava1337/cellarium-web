/**
 * Sincroniza recibo con Edge Function validate-apple-receipt (Supabase).
 */
import { patchAppleIapDebugOverlay } from '../debug/appleIapDebugOverlayStore';
import { getSupabaseUrlHostForDebug, supabase } from '../lib/supabase';

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

const EDGE_FUNCTION_NAME = 'validate-apple-receipt';

function safeJsonParse(text: string): Record<string, unknown> | null {
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

function summarizeEdgeMessage(msg: string, max = 160): string {
  const s = msg.replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function patchEdgeOverlay(p: Parameters<typeof patchAppleIapDebugOverlay>[0]): void {
  patchAppleIapDebugOverlay(p);
}

function patchEdgeInvokeFailure(
  code: string,
  message: string,
  extra?: Partial<Parameters<typeof patchAppleIapDebugOverlay>[0]>
): void {
  patchEdgeOverlay({
    edge_invoke_finished: new Date().toISOString(),
    edge_invoke_success: 'false',
    edge_invoke_error: 'true',
    edge_error_code: code,
    edge_error_message: summarizeEdgeMessage(message),
    lastIapEvent: `edge_skip:${code}`,
    ...extra,
  });
}

export async function validateAppleReceiptBackend(
  receiptData: string,
  intent?:
    | 'purchase'
    | 'restore'
    | 'sync'
    | 'purchase_recovery'
    | 'restore_available_purchases'
    | 'purchase_recovery_available_purchases'
): Promise<{ data: AppleSyncResponse | null; error: AppleReceiptInvokeError | null }> {
  const receiptLen = typeof receiptData === 'string' ? receiptData.length : 0;
  const host = getSupabaseUrlHostForDebug();

  patchEdgeOverlay({
    edge_function_name: EDGE_FUNCTION_NAME,
    supabase_url_host: host,
    receipt_len_before_invoke: String(receiptLen),
    edge_invoke_start: undefined,
    edge_invoke_finished: undefined,
    edge_invoke_success: undefined,
    edge_invoke_error: undefined,
    edge_http_status: undefined,
    edge_error_code: undefined,
    edge_error_message: undefined,
    edge_response_synced: undefined,
    edge_response_plan_id: undefined,
    lastIapEvent: 'edge_validate_prepare',
  });

  console.log(
    '[Cellarium][AppleReceipt]',
    JSON.stringify({
      stage: 'invoke_prepare',
      intent: intent ?? null,
      receiptLen,
      supabaseHost: host,
      function: EDGE_FUNCTION_NAME,
    })
  );

  if (receiptLen === 0) {
    console.log('[Cellarium][AppleReceipt]', JSON.stringify({ stage: 'invoke_end', outcome: 'receipt_missing' }));
    patchEdgeInvokeFailure('RECEIPT_MISSING', 'Recibo vacío; no se invoca Edge.');
    return {
      data: null,
      error: { message: 'No hay recibo para validar', code: 'RECEIPT_MISSING' },
    };
  }

  try {
    await supabase.auth.refreshSession();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const hasSession = Boolean(sessionData?.session);
    const hasToken = Boolean(token);

    patchEdgeOverlay({
      has_session: hasSession ? 'true' : 'false',
      has_access_token: hasToken ? 'true' : 'false',
      lastIapEvent: 'edge_session_checked',
    });

    if (!hasToken) {
      console.log('[Cellarium][AppleReceipt]', JSON.stringify({ stage: 'invoke_end', outcome: 'no_session' }));
      patchEdgeInvokeFailure('NO_SESSION', 'Sin access_token; no se invoca Edge.', {
        has_session: hasSession ? 'true' : 'false',
        has_access_token: 'false',
      });
      return { data: null, error: { message: 'No hay sesión activa', code: 'NO_SESSION' } };
    }

    const invokeStartedAt = new Date().toISOString();
    patchEdgeOverlay({
      edge_invoke_start: invokeStartedAt,
      lastIapEvent: 'edge_invoke_start',
    });

    console.log(
      '[Cellarium][AppleReceipt]',
      JSON.stringify({
        stage: 'invoke_start',
        intent: intent ?? null,
        receiptLen,
        supabaseHost: host,
        function: EDGE_FUNCTION_NAME,
      })
    );

    const { data, error } = await supabase.functions.invoke<AppleSyncResponse>(EDGE_FUNCTION_NAME, {
      body: { receiptData, intent },
      headers: { authorization: `Bearer ${token}` },
    });

    patchEdgeOverlay({ edge_invoke_finished: new Date().toISOString() });

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

      const edgeCode = code ?? 'EDGE_INVOKE_ERROR';

      patchEdgeOverlay({
        edge_invoke_success: 'false',
        edge_invoke_error: 'true',
        edge_http_status: httpStatus != null ? String(httpStatus) : '—',
        edge_error_code: edgeCode,
        edge_error_message: summarizeEdgeMessage(message),
        edge_response_synced: '—',
        edge_response_plan_id: '—',
        validate_result: 'error',
        validate_error_code: edgeCode,
        lastIapEvent: 'edge_invoke_error',
      });

      console.log(
        '[Cellarium][AppleReceipt]',
        JSON.stringify({
          stage: 'invoke_end',
          outcome: 'edge_error',
          httpStatus: httpStatus ?? null,
          code: edgeCode,
          appleStatus: appleStatus ?? null,
        })
      );

      return { data: null, error: { message, code: edgeCode, status: httpStatus, appleStatus } };
    }

    patchEdgeOverlay({
      edge_invoke_success: 'true',
      edge_invoke_error: 'false',
      edge_http_status: '200',
      edge_error_code: '—',
      edge_error_message: '—',
      edge_response_synced: data?.synced != null ? String(data.synced) : '—',
      edge_response_plan_id: data?.plan_id != null ? String(data.plan_id) : '—',
      validate_result: data?.synced != null ? 'ok' : 'unclear',
      validate_error_code: null,
      synced: data?.synced != null ? String(data.synced) : null,
      lastIapEvent: 'edge_invoke_ok',
    });

    console.log(
      '[Cellarium][AppleReceipt]',
      JSON.stringify({
        stage: 'invoke_end',
        outcome: 'ok',
        synced: data?.synced ?? null,
        ok: data?.ok ?? null,
        planId: data?.plan_id ?? null,
      })
    );

    return { data: data ?? null, error: null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error inesperado';
    const isAbort = e instanceof Error && (e.name === 'AbortError' || msg.toLowerCase().includes('abort'));

    patchEdgeInvokeFailure(isAbort ? 'FETCH_TIMEOUT' : 'UNEXPECTED', msg, {
      edge_http_status: '—',
    });

    console.log(
      '[Cellarium][AppleReceipt]',
      JSON.stringify({ stage: 'invoke_end', outcome: 'exception', message: msg.slice(0, 200) })
    );
    return {
      data: null,
      error: { message: msg, code: isAbort ? 'FETCH_TIMEOUT' : 'UNEXPECTED' },
    };
  }
}
