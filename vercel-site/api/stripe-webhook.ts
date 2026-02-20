/**
 * Stripe webhook proxy: forwards ALL Stripe events to Supabase Edge Function.
 * - Body: reenvía el body RAW (req.text()) sin re-serializar para que la firma Stripe sea válida.
 * - Headers: reenvía stripe-signature y añade Authorization + x-internal-webhook-secret.
 *
 * URL esperada (Vercel env SUPABASE_INTERNAL_WEBHOOK_URL):
 *   https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook
 * (sin trailing slash)
 *
 * Env (Vercel): SUPABASE_INTERNAL_WEBHOOK_URL, INTERNAL_EDGE_AUTH_TOKEN (o SUPABASE_SERVICE_ROLE_KEY), INTERNAL_WEBHOOK_SHARED_SECRET (opcional)
 */

export const config = { runtime: 'edge' as const };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const rawBody = await req.text();
  const sig = req.headers.get('stripe-signature') ?? req.headers.get('Stripe-Signature') ?? '';

  let eventType = 'unknown';
  try {
    eventType = (JSON.parse(rawBody) as { type?: string })?.type ?? 'unknown';
  } catch {
    // only used for logging; never use parsed body for forwarding
  }
  console.log('[PROXY] received', { eventType, hasSig: Boolean(sig), bodyLen: rawBody.length });

  const rawUrl = process.env.SUPABASE_INTERNAL_WEBHOOK_URL;
  const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!url) {
    console.error('[PROXY] SUPABASE_INTERNAL_WEBHOOK_URL not set');
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const bearerToken =
    process.env.INTERNAL_EDGE_AUTH_TOKEN ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!bearerToken) {
    console.warn('[PROXY] No Bearer token (INTERNAL_EDGE_AUTH_TOKEN / SUPABASE_SERVICE_ROLE_KEY); Edge may return 401');
  }

  const targetUrl = url.replace(/\/+$/, '');
  const res = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'content-type': req.headers.get('content-type') ?? 'application/json',
      'stripe-signature': sig,
      'authorization': `Bearer ${bearerToken}`,
      'x-internal-webhook-secret': process.env.INTERNAL_WEBHOOK_SHARED_SECRET ?? '',
    },
    body: rawBody,
  });

  const responseText = await res.text();
  const safePreview =
    res.ok ? '(ok)' : responseText.slice(0, 200).replace(/\s+/g, ' ');
  console.log('[PROXY] forward', {
    eventType,
    status: res.status,
    ok: res.ok,
    responsePreview: safePreview,
  });

  return new Response(responseText, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
