// Edge Function: create-portal-session
// Auth: solo Bearer token en header. Sin Stripe SDK ni std/node. Stripe REST API.

const PORTAL_VERSION = 'portal@2026-02-07_v9';

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function jsonResponse(body: object, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: corsHeaders,
    status,
  });
}

Deno.serve(async (req: Request) => {
  console.log('[PORTAL] version', PORTAL_VERSION);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
    if (!authHeader || !/^\s*Bearer\s+/i.test(authHeader)) {
      return jsonResponse(
        { code: 'AUTH_MISSING', message: 'Missing Bearer token' },
        401
      );
    }
    const match = authHeader.match(/^\s*Bearer\s+(.+)$/i);
    const token = (match?.[1] ?? '').trim();
    if (!token) {
      return jsonResponse(
        { code: 'AUTH_MISSING', message: 'Missing Bearer token' },
        401
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      console.error('[PORTAL] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return jsonResponse(
        { code: 'CONFIG_ERROR', message: 'Server configuration error' },
        500
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: userErr,
    } = await supabaseAdmin.auth.getUser(token);

    if (userErr || !user) {
      console.error('[PORTAL] auth failed', userErr?.message ?? 'no user');
      return jsonResponse(
        { code: 'AUTH_INVALID', message: 'Invalid token' },
        401
      );
    }

    const userId = user.id;
    const { data: row, error: rowErr } = await supabaseAdmin
      .from('users')
      .select('stripe_customer_id, role, owner_id')
      .eq('id', userId)
      .maybeSingle();

    if (rowErr || !row) {
      console.error('[PORTAL] user row not found', rowErr?.message);
      return jsonResponse(
        { code: 'USER_NOT_FOUND', message: 'User row not found' },
        404
      );
    }

    const ownerId = row.owner_id ?? userId;
    if (row.role !== 'owner' || userId !== ownerId) {
      return jsonResponse(
        { code: 'FORBIDDEN', message: 'Only owner can access customer portal' },
        403
      );
    }

    if (!row.stripe_customer_id) {
      return jsonResponse(
        {
          code: 'NO_CUSTOMER',
          message: 'No Stripe customer associated. Subscribe to a plan first.',
        },
        409
      );
    }

    const returnUrl = Deno.env.get('STRIPE_PORTAL_RETURN_URL');
    if (!returnUrl) {
      console.error('[PORTAL] STRIPE_PORTAL_RETURN_URL not set');
      return jsonResponse(
        { code: 'CONFIG_MISSING', message: 'STRIPE_PORTAL_RETURN_URL is required' },
        500
      );
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      console.error('[PORTAL] STRIPE_SECRET_KEY not set');
      return jsonResponse(
        { code: 'CONFIG_MISSING', message: 'STRIPE_SECRET_KEY is required' },
        500
      );
    }

    const body = new URLSearchParams({
      customer: row.stripe_customer_id,
      return_url: returnUrl,
    }).toString();

    const stripeRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const stripeData = (await stripeRes.json().catch(() => ({}))) as Record<string, unknown>;
    const url = stripeData?.url as string | undefined;

    if (!stripeRes.ok || !url) {
      const errObj = stripeData?.error as { message?: string } | undefined;
      const errMsg = errObj?.message ?? stripeRes.statusText ?? 'Stripe API error';
      console.error('[PORTAL] Stripe API failed', { status: stripeRes.status, msg: errMsg });
      return jsonResponse(
        { code: 'PORTAL_SESSION_FAILED', message: errMsg },
        stripeRes.status >= 400 ? stripeRes.status : 502
      );
    }

    console.log('[PORTAL] success', { hasUrl: !!url });
    return jsonResponse({ url }, 200);
  } catch (e: unknown) {
    const err = e as { message?: string; statusCode?: number };
    const msg = err?.message ?? String(e);
    const status = err?.statusCode ?? 500;
    console.error('[PORTAL] failed', { status, msg });
    return jsonResponse(
      { code: 'PORTAL_SESSION_FAILED', message: msg },
      status
    );
  }
});
