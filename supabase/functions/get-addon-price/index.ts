// Edge Function: get-addon-price
// Devuelve el precio del add-on branch_addon_monthly desde Stripe (para UI).
// Público: no requiere autenticación (dato de pricing).

import { stripeRequest } from '../_shared/stripe_rest.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function formatMxn(unitAmountCentavos: number): string {
  const amount = unitAmountCentavos / 100;
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(405, { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      return json(500, { error: 'Error de configuración', code: 'INTERNAL' });
    }

    const priceResult = await stripeRequest(
      'GET',
      'prices',
      stripeSecretKey,
      undefined,
      { 'lookup_keys[0]': 'branch_addon_monthly', active: 'true', limit: '1' }
    );

    const prices = (priceResult.data as { data?: { unit_amount: number; currency: string }[] })?.data;
    const price = prices?.[0];

    if (priceResult.error || !price) {
      const fallbackUnitAmount = 52000; // $520 MXN (add-on sucursal)
      return json(200, {
        unit_amount: fallbackUnitAmount,
        currency: 'mxn',
        formatted: formatMxn(fallbackUnitAmount),
        fromStripe: false,
      });
    }

    const unit_amount = price.unit_amount ?? 52000;
    const currency = (price.currency ?? 'mxn').toLowerCase();

    return json(200, {
      unit_amount,
      currency,
      formatted: currency === 'mxn' ? formatMxn(unit_amount) : `${unit_amount / 100} ${currency.toUpperCase()}`,
      fromStripe: true,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[get-addon-price]', message);
    return json(500, { error: 'Error interno', code: 'INTERNAL' });
  }
});
