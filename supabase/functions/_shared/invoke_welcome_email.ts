/**
 * Invoca send-welcome-email (server-to-server, service role).
 * Errores solo se registran; no propagan al caller.
 */

const LOG = '[welcome-email]';

export type WelcomeEmailInvokeResult = {
  ok: boolean;
  status: number;
  sent?: boolean;
  reason?: string;
  code?: string;
};

export async function invokeWelcomeEmail(userId: string): Promise<WelcomeEmailInvokeResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.warn(`${LOG} skip missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`);
    return { ok: false, status: 0, code: 'CONFIG_MISSING' };
  }

  const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/send-welcome-email`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    });

    let payload: Record<string, unknown> = {};
    try {
      payload = (await res.json()) as Record<string, unknown>;
    } catch {
      /* body no JSON */
    }

    if (!res.ok) {
      console.warn(`${LOG} invoke failed`, {
        userId,
        status: res.status,
        code: typeof payload.code === 'string' ? payload.code : null,
      });
      return {
        ok: false,
        status: res.status,
        code: typeof payload.code === 'string' ? payload.code : 'INVOKE_FAILED',
      };
    }

    const sent = payload.sent === true;
    const reason = typeof payload.reason === 'string' ? payload.reason : undefined;
    if (sent) {
      console.log(`${LOG} sent`, { userId });
    } else {
      console.log(`${LOG} skip`, { userId, reason: reason ?? 'not_sent' });
    }

    return { ok: true, status: res.status, sent, reason };
  } catch (e: unknown) {
    console.warn(`${LOG} invoke error`, {
      userId,
      message: (e as Error)?.message ?? String(e),
    });
    return { ok: false, status: 0, code: 'NETWORK_ERROR' };
  }
}
