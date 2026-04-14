// Edge Function: create-checkout-session
// Crea una Stripe Checkout Session para suscripciones usando REST API
// Solo owners pueden ejecutar esta función
//
// NOTA PARA FRONTEND:
// El frontend debe enviar el header Authorization con el token de Supabase:
//   const { data: { session } } = await supabase.auth.getSession();
//   const response = await supabase.functions.invoke('create-checkout-session', {
//     body: { planLookupKey: 'bistro_monthly', addonBranchesQty: 0 },
//     headers: { Authorization: `Bearer ${session?.access_token}` }
//   });
// Upgrade (misma suscripción Stripe): billing_provider === 'stripe', subscription_active → POST /subscriptions/{id}

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { hasActiveAppleSubscription, hasActiveGoogleSubscription } from '../_shared/billing_coexistence.ts';

console.log('🚀 create-checkout-session: Function iniciada');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Body planLookupKey debe coincidir con lookup_key del price en Stripe (canónico nuevo).
const PLAN_LOOKUP_KEY_MAP = {
  bistro_monthly: 'bistro_monthly',
  trattoria_monthly: 'trattoria_monthly',
  grand_maison_monthly: 'grand_maison_monthly',
} as const;

// Planos permitidos (whitelist) - derivado del mapeo
const ALLOWED_PLAN_LOOKUP_KEYS = Object.keys(PLAN_LOOKUP_KEY_MAP) as Array<keyof typeof PLAN_LOOKUP_KEY_MAP>;

interface CreateCheckoutSessionRequest {
  planLookupKey: string;
  /** Cantidad de sucursales add-on a mantener en upgrade (0–50). Opcional: si falta, se usa `users.subscription_branch_addons_count`. */
  addonBranchesQty?: number;
  /** Telemetría / defensa: `android` rechaza checkout (Google Play). */
  clientPlatform?: string;
}

const BRANCH_ADDON_STRIPE_LOOKUP = 'branch_addon_monthly';

/** Orden canónico para impedir downgrade vía checkout. */
function canonicalPlanRank(plan: string | null | undefined): number {
  const p = (plan ?? 'cafe').toLowerCase().replace(/_/g, '-');
  if (p === 'cafe') return 0;
  if (p === 'bistro') return 1;
  if (p === 'trattoria') return 2;
  if (p === 'grand-maison' || p === 'grandmaison') return 3;
  return 0;
}

function lookupKeyToCanonicalPlan(lookupKey: string): string {
  if (lookupKey === 'bistro_monthly') return 'bistro';
  if (lookupKey === 'trattoria_monthly') return 'trattoria';
  if (lookupKey === 'grand_maison_monthly') return 'grand-maison';
  return 'cafe';
}

// Helper: convertir objeto anidado a formato form-urlencoded (recursivo)
function flattenObject(obj: any, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    
    const newKey = prefix ? `${prefix}[${key}]` : key;
    
    if (Array.isArray(value)) {
      // Arrays: line_items[0][price] = value
      value.forEach((item, index) => {
        if (typeof item === 'object' && item !== null) {
          const nested = flattenObject(item, `${newKey}[${index}]`);
          Object.assign(result, nested);
        } else {
          result[`${newKey}[${index}]`] = String(item);
        }
      });
    } else if (typeof value === 'object' && value !== null) {
      // Objetos anidados: subscription_data[metadata][owner_id] = value
      const nested = flattenObject(value, newKey);
      Object.assign(result, nested);
    } else {
      result[newKey] = String(value);
    }
  }
  
  return result;
}

// Helper: convertir objeto a application/x-www-form-urlencoded
function encodeFormData(data: Record<string, string>): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return pairs.join('&');
}

// Helper: hacer llamada REST a Stripe
/** `query` solo para GET (p. ej. List Prices con lookup_keys); POST sigue usando `body`. */
async function stripeRequest(
  method: string,
  endpoint: string,
  secretKey: string,
  body?: Record<string, any>,
  query?: Record<string, string>
): Promise<{ data?: any; error?: any }> {
  let url = `https://api.stripe.com/v1/${endpoint}`;
  if (query && Object.keys(query).length > 0) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      qs.append(k, String(v));
    }
    const qStr = qs.toString();
    if (qStr) url = `${url}?${qStr}`;
  }

  if (method === 'GET' && query && Object.keys(query).length > 0) {
    const safeLog = { endpoint, queryKeys: Object.keys(query) };
    console.log('[stripeRequest] GET with query', safeLog);
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body && method !== 'GET') {
    // Convertir objetos anidados a formato form-urlencoded
    const flattened = flattenObject(body);
    options.body = encodeFormData(flattened);
  }

  try {
    const response = await fetch(url, options);
    const text = await response.text();
    let jsonData: any;
    
    try {
      jsonData = JSON.parse(text);
    } catch {
      jsonData = { raw: text };
    }

    if (!response.ok) {
      return {
        error: {
          message: jsonData.error?.message || `Stripe API error: ${response.status}`,
          type: jsonData.error?.type || 'StripeAPIError',
          statusCode: response.status,
          raw: jsonData,
        },
      };
    }

    return { data: jsonData };
  } catch (error: any) {
    return {
      error: {
        message: error.message || 'Network error',
        type: 'NetworkError',
        originalError: error,
      },
    };
  }
}

Deno.serve(async (req: Request) => {
  console.log(`📥 create-checkout-session: ${req.method} ${new URL(req.url).pathname}`);

  // Handle CORS
  if (req.method === 'OPTIONS') {
    console.log('✅ CORS preflight OK');
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    console.error('❌ Método no permitido:', req.method);
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405,
      }
    );
  }

  try {
    // Leer y validar Authorization header explícitamente (case-insensitive)
    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization') ?? '';
    const trimmed = authHeader.trim();
    const hasAuthHeader = trimmed.length > 0;
    console.log(`Auth header present? ${hasAuthHeader}`);

    // Validar formato "Bearer <jwt>" (case-insensitive)
    const bearerPrefix = 'Bearer ';
    if (!trimmed.toLowerCase().startsWith('bearer ')) {
      console.error('❌ Authorization header no válido: debe empezar con "Bearer "');
      return new Response(
        JSON.stringify({ 
          error: 'No authorization header',
          message: 'El frontend debe enviar el header Authorization con formato: Bearer <token>',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    // Extraer JWT del header (case-insensitive, con trim)
    const jwt = trimmed.slice(bearerPrefix.length).trim();
    if (!jwt || jwt.length === 0) {
      console.error('❌ JWT vacío después de "Bearer "');
      return new Response(
        JSON.stringify({ 
          error: 'Invalid authorization token',
          message: 'El token JWT está vacío',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    // Log seguro para verificar formato JWT (sin exponer el token)
    console.log("JWT looks like:", jwt.split(".").length === 3 ? "JWT_OK" : "JWT_BAD");

    // Crear cliente Supabase con token del usuario
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      console.error('❌ Variables de entorno de Supabase no configuradas');
      return new Response(
        JSON.stringify({ error: 'Configuración de Supabase incompleta' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    // Crear cliente Supabase con JWT explícito (NO cookies/sesión implícita)
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${jwt}` },
      },
    });

    // Crear cliente admin para operaciones privilegiadas
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Obtener usuario autenticado usando getUser(jwt) (NO getSession)
    console.log('🔍 Verificando usuario autenticado...');
    const {
      data: { user: authUser },
      error: userError,
    } = await supabaseClient.auth.getUser(jwt);

    if (userError || !authUser) {
      console.error('❌ Usuario no autenticado:', userError?.message || 'Auth session missing!');
      return new Response(
        JSON.stringify({ 
          error: 'Usuario no autenticado',
          message: userError?.message || 'Auth session missing!',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    console.log(`User id: ${authUser.id}`);

    // Obtener datos del usuario desde public.users
    const { data: userData, error: userDataError } = await supabaseAdmin
      .from('users')
      .select(
        'id, role, owner_id, stripe_customer_id, email, subscription_active, subscription_id, subscription_plan, signup_method, owner_email_verified, billing_provider, subscription_branch_addons_count'
      )
      .eq('id', authUser.id)
      .single();

    if (userDataError || !userData) {
      console.error('❌ Usuario no encontrado en BD:', userDataError?.message);
      return new Response(
        JSON.stringify({ error: 'Usuario no encontrado en base de datos' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        }
      );
    }

    console.log('create-checkout-session guard', {
      userId: authUser.id,
      subscription_active: userData.subscription_active,
      stripe_customer_id: userData.stripe_customer_id ?? null,
      billing_provider: userData.billing_provider ?? null,
    });

    // Verificar que es owner
    const ownerId = userData.owner_id || userData.id;
    if (userData.role !== 'owner' || userData.id !== ownerId) {
      console.error(`❌ Usuario no es owner: role=${userData.role}, id=${userData.id}, ownerId=${ownerId}`);
      return new Response(
        JSON.stringify({ error: 'Solo el owner puede crear sesiones de checkout' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        }
      );
    }

    if (userData.signup_method === 'password' && userData.owner_email_verified !== true) {
      return new Response(
        JSON.stringify({
          code: 'EMAIL_VERIFICATION_REQUIRED',
          message: 'Debes verificar tu correo antes de suscribirte. Abre la app y ve a Verificar correo.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    // Parsear body antes de reglas de facturación (necesitamos planLookupKey para upgrades Stripe)
    let body: CreateCheckoutSessionRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Body JSON inválido', code: 'INVALID_INPUT' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }
    const { planLookupKey } = body;
    const clientPlatform = typeof body.clientPlatform === 'string' ? body.clientPlatform.toLowerCase().trim() : '';

    if (clientPlatform === 'android') {
      return new Response(
        JSON.stringify({
          code: 'ANDROID_USE_PLAY_BILLING',
          message: 'En Android las suscripciones se gestionan con Google Play Billing, no con Stripe.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    console.log(`📋 Plan solicitado: ${planLookupKey}`);

    if (!planLookupKey || !ALLOWED_PLAN_LOOKUP_KEYS.includes(planLookupKey as keyof typeof PLAN_LOOKUP_KEY_MAP)) {
      console.error(`❌ Plan inválido: ${planLookupKey}`);
      return new Response(
        JSON.stringify({
          error: 'planLookupKey inválido',
          code: 'INVALID_PLAN',
          allowed: ALLOWED_PLAN_LOOKUP_KEYS,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    const subscriptionActive = userData.subscription_active === true;
    const billingProvider = String(userData.billing_provider ?? '').toLowerCase();

    if (billingProvider === 'apple' || (await hasActiveAppleSubscription(supabaseAdmin, ownerId))) {
      return new Response(
        JSON.stringify({
          code: 'APPLE_SUBSCRIPTION_ACTIVE',
          message:
            'Tu suscripción está activa vía Apple. Gestiona el plan desde la app en iOS (Ajustes > Suscripción).',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
      );
    }

    if (billingProvider === 'google' || (await hasActiveGoogleSubscription(supabaseAdmin, ownerId))) {
      return new Response(
        JSON.stringify({
          code: 'GOOGLE_SUBSCRIPTION_ACTIVE',
          message:
            'Tu suscripción está activa vía Google Play. Gestiona el plan en Google Play Store o en la app Android.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
      );
    }

    const isStripeUpgrade = subscriptionActive && billingProvider === 'stripe';

    if (subscriptionActive && !isStripeUpgrade) {
      return new Response(
        JSON.stringify({
          code: 'ALREADY_SUBSCRIBED',
          message: 'User already has an active subscription. Use customer portal to change plan.',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 409,
        }
      );
    }

    console.log(`✅ Usuario es owner: ${ownerId}`);

    // Obtener STRIPE_SECRET_KEY
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      console.error('❌ STRIPE_SECRET_KEY no configurada');
      return new Response(
        JSON.stringify({ error: 'STRIPE_SECRET_KEY no configurada' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    // Mapear lookup_key interno a Stripe lookup_key
    const planKey = planLookupKey as keyof typeof PLAN_LOOKUP_KEY_MAP;
    const stripeLookupKey = PLAN_LOOKUP_KEY_MAP[planKey];
    if (!stripeLookupKey) {
      console.error(`❌ Plan lookup_key no mapeado: ${planLookupKey}`);
      return new Response(
        JSON.stringify({ 
          error: 'planLookupKey inválido',
          code: 'INVALID_PLAN',
          allowed: ALLOWED_PLAN_LOOKUP_KEYS,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Resolver priceId desde lookup_key de Stripe (GET con query; nunca lista sin filtro)
    console.log(
      `[create-checkout-session] Resolviendo price: planLookupKey=${planLookupKey} stripeLookupKey=${stripeLookupKey}`
    );
    const priceResult = await stripeRequest('GET', 'prices', stripeSecretKey, undefined, {
      'lookup_keys[0]': stripeLookupKey,
      active: 'true',
      limit: '1',
    });

    if (priceResult.error) {
      console.error('❌ Error buscando price:', priceResult.error);
      return new Response(
        JSON.stringify({
          error: 'Error al buscar price en Stripe',
          message: priceResult.error.message,
          code: 'STRIPE_ERROR',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 502,
        }
      );
    }

    const prices = priceResult.data?.data || [];
    if (prices.length === 0) {
      console.error(
        `[create-checkout-session] Stripe devolvió 0 prices para lookup_key solicitado planLookupKey="${planLookupKey}" stripeLookupKey="${stripeLookupKey}"`
      );
      return new Response(
        JSON.stringify({ 
          error: `Price con lookup_key "${stripeLookupKey}" no encontrado en Stripe`,
          message: `No se encontró un price activo con lookup_key "${stripeLookupKey}" en Stripe. Por favor verifica que el lookup_key esté configurado correctamente en el dashboard de Stripe.`,
          code: 'PRICE_NOT_FOUND',
          planLookupKey: planLookupKey,
          stripeLookupKey: stripeLookupKey,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        }
      );
    }

    const chosen = prices[0] as { id?: string; lookup_key?: string | null };
    const returnedLookup = chosen?.lookup_key != null ? String(chosen.lookup_key) : '';
    if (returnedLookup.toLowerCase() !== stripeLookupKey.toLowerCase()) {
      console.error('[create-checkout-session] PRICE_LOOKUP_MISMATCH', {
        planLookupKey,
        stripeLookupKey,
        returned_lookup_key: chosen?.lookup_key ?? null,
        priceId: chosen?.id ?? null,
      });
      return new Response(
        JSON.stringify({
          error: 'El precio devuelto por Stripe no coincide con el lookup_key solicitado',
          message:
            'La lista de prices no coincidía con el filtro esperado. No se creará checkout con un price ambiguo.',
          code: 'PRICE_LOOKUP_MISMATCH',
          planLookupKey,
          stripeLookupKey,
          returned_lookup_key: chosen?.lookup_key ?? null,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 502,
        }
      );
    }

    const priceId = chosen.id as string;
    console.log(
      `[create-checkout-session] Price OK: price.id=${priceId} lookup_key=${returnedLookup} (planLookupKey=${planLookupKey})`
    );

    // —— Upgrade Stripe: misma suscripción (sin segundo checkout sub), nuevo plan + add-ons ——
    if (isStripeUpgrade) {
      const newRank = canonicalPlanRank(lookupKeyToCanonicalPlan(planLookupKey));
      const curRank = canonicalPlanRank(userData.subscription_plan);
      if (newRank <= curRank) {
        return new Response(
          JSON.stringify({
            code: 'INVALID_PLAN',
            message: 'No se permite cambiar a un plan igual o inferior.',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      let addonQty: number;
      if (typeof body.addonBranchesQty === 'number' && !Number.isNaN(body.addonBranchesQty)) {
        addonQty = Math.min(50, Math.max(0, Math.floor(body.addonBranchesQty)));
      } else {
        addonQty = Math.min(50, Math.max(0, Math.floor(Number(userData.subscription_branch_addons_count) || 0)));
      }

      console.log('[UPGRADE FLOW]', {
        userId: authUser.id,
        currentPlan: userData.subscription_plan,
        newPlan: planLookupKey,
        addonBranchesQty: addonQty,
      });

      const stripeCustomerIdUp = userData.stripe_customer_id;
      if (!stripeCustomerIdUp) {
        return new Response(
          JSON.stringify({
            code: 'MISSING_STRIPE_LINK',
            message: 'Falta vincular la suscripción con Stripe.',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
        );
      }

      const { data: subRow } = await supabaseAdmin
        .from('subscriptions')
        .select('stripe_subscription_id')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const stripeSubscriptionId = subRow?.stripe_subscription_id ?? null;
      if (!stripeSubscriptionId) {
        return new Response(
          JSON.stringify({
            code: 'MISSING_STRIPE_LINK',
            message: 'No se encontró suscripción Stripe para este usuario.',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
        );
      }

      const addonPriceRes = await stripeRequest('GET', 'prices', stripeSecretKey, undefined, {
        'lookup_keys[0]': BRANCH_ADDON_STRIPE_LOOKUP,
        active: 'true',
        limit: '1',
      });
      const addonPrices = addonPriceRes.data?.data || [];
      const addonPriceId = addonPrices[0]?.id as string | undefined;
      if (addonPriceRes.error || !addonPriceId) {
        return new Response(
          JSON.stringify({
            code: 'STRIPE_ERROR',
            message: 'No se pudo resolver el price de sucursales adicionales.',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
        );
      }

      const subGet = await stripeRequest(
        'GET',
        `subscriptions/${stripeSubscriptionId}`,
        stripeSecretKey,
        undefined,
        { 'expand[0]': 'items.data.price' }
      );
      if (subGet.error || !subGet.data) {
        return new Response(
          JSON.stringify({
            code: 'STRIPE_ERROR',
            message: subGet.error?.message ?? 'Error leyendo suscripción Stripe',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
        );
      }

      const stripeSubscription = subGet.data as {
        metadata?: Record<string, string>;
        items?: { data?: { id: string; quantity: number; price: { id: string } }[] };
      };
      const allItems = stripeSubscription.items?.data ?? [];
      const itemsPayload: Array<Record<string, unknown>> = [];

      for (const item of allItems) {
        const pid = item.price?.id;
        if (pid === addonPriceId) {
          if (addonQty === 0) {
            itemsPayload.push({ id: item.id, deleted: true });
          } else {
            itemsPayload.push({ id: item.id, quantity: addonQty });
          }
        } else {
          itemsPayload.push({ id: item.id, price: priceId });
        }
      }

      if (addonQty > 0 && !allItems.some((i) => i.price?.id === addonPriceId)) {
        itemsPayload.push({ price: addonPriceId, quantity: addonQty });
      }

      const prevMeta = { ...(stripeSubscription.metadata ?? {}) };
      const mergedMeta: Record<string, string> = {
        ...Object.fromEntries(Object.entries(prevMeta).map(([k, v]) => [k, String(v)])),
        owner_id: String(ownerId),
        user_id: String(authUser.id),
        plan_name: planLookupKey,
        planLookupKey,
        addonBranchesQty: String(addonQty),
      };

      // Prorrateo explícito: la factura refleja crédito del plan anterior + cargo por el resto del ciclo
      // (evita recibos que parecen el costo completo del nuevo plan sin desglose).
      const updateBody: Record<string, unknown> = {
        items: itemsPayload,
        proration_behavior: 'create_prorations',
        metadata: mergedMeta,
      };

      const updateResult = await stripeRequest(
        'POST',
        `subscriptions/${stripeSubscriptionId}`,
        stripeSecretKey,
        updateBody
      );

      if (updateResult.error) {
        return new Response(
          JSON.stringify({
            code: 'STRIPE_ERROR',
            message: updateResult.error.message ?? 'Error al actualizar suscripción',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
        );
      }

      // UX: no usar hosted_invoice_url como URL principal — parece “compra nueva” / recibo confuso.
      // La app no abre navegador en upgrade; factura solo como dato opcional (invoiceUrl).
      const successUrlUp = Deno.env.get('STRIPE_SUCCESS_URL') || 'https://example.com/success';
      let invoiceUrl: string | null = null;
      let amountDue: number | null = null;
      const latestInv = updateResult.data?.latest_invoice;
      const invId =
        typeof latestInv === 'string'
          ? latestInv
          : latestInv && typeof latestInv === 'object' && latestInv !== null && 'id' in latestInv
            ? String((latestInv as { id: string }).id)
            : null;
      if (invId) {
        const invRes = await stripeRequest('GET', `invoices/${invId}`, stripeSecretKey);
        const inv = invRes.data as { hosted_invoice_url?: string; amount_due?: number } | undefined;
        if (inv?.hosted_invoice_url) {
          invoiceUrl = inv.hosted_invoice_url;
        }
        if (typeof inv?.amount_due === 'number') {
          amountDue = inv.amount_due;
        }
      }

      return new Response(
        JSON.stringify({
          url: successUrlUp,
          sessionId: stripeSubscriptionId,
          upgraded: true,
          invoiceUrl,
          amountDue,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar o crear Stripe Customer
    let stripeCustomerId = userData.stripe_customer_id;

    if (!stripeCustomerId) {
      console.log('📝 Creando nuevo Stripe Customer...');
      const customerResult = await stripeRequest(
        'POST',
        'customers',
        stripeSecretKey,
        {
          email: authUser.email || userData.email,
          metadata: {
            owner_id: ownerId,
            user_id: userData.id,
          },
        }
      );

      if (customerResult.error) {
        console.error('❌ Error creando customer:', customerResult.error);
        return new Response(
          JSON.stringify({
            error: 'Error al crear customer en Stripe',
            message: customerResult.error.message,
            code: 'STRIPE_ERROR',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 502,
          }
        );
      }

      stripeCustomerId = customerResult.data?.id;
      if (!stripeCustomerId) {
        console.error('❌ Customer creado pero sin ID');
        return new Response(
          JSON.stringify({ error: 'Error al crear customer: ID no recibido' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 502,
          }
        );
      }

      console.log(`✅ Stripe Customer creado: ${stripeCustomerId}`);

      // Guardar stripe_customer_id en public.users
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', userData.id);

      if (updateError) {
        console.error('❌ Error guardando stripe_customer_id:', updateError);
        // No fallar, pero loguear
      } else {
        console.log('✅ stripe_customer_id guardado en BD');
      }
    } else {
      console.log(`✅ Usando Stripe Customer existente: ${stripeCustomerId}`);
    }

    // Obtener URLs de éxito y cancelación
    const successUrl = Deno.env.get('STRIPE_SUCCESS_URL') || 'https://example.com/success';
    const cancelUrl = Deno.env.get('STRIPE_CANCEL_URL') || 'https://example.com/cancel';

    if (!Deno.env.get('STRIPE_SUCCESS_URL') || !Deno.env.get('STRIPE_CANCEL_URL')) {
      console.warn('⚠️ STRIPE_SUCCESS_URL o STRIPE_CANCEL_URL no configuradas, usando fallback');
    }

    // Crear Checkout Session
    // ——— Metadata añadida aquí ———
    // session.metadata y subscription_data.metadata incluyen owner_id, user_id, plan_name
    // para que stripe-webhook pueda leerlos al hacer UPSERT en public.subscriptions.
    console.log('📝 Creando Checkout Session...');
    const newCheckoutAddonQty =
      typeof body.addonBranchesQty === 'number' && !Number.isNaN(body.addonBranchesQty)
        ? Math.min(50, Math.max(0, Math.floor(body.addonBranchesQty)))
        : 0;
    const sessionMetadata = {
      owner_id: String(ownerId),
      user_id: String(authUser.id),
      plan_name: planLookupKey,
      planLookupKey,
      addonBranchesQty: String(newCheckoutAddonQty),
    };
    const sessionResult = await stripeRequest(
      'POST',
      'checkout/sessions',
      stripeSecretKey,
      {
        mode: 'subscription',
        customer: stripeCustomerId,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        allow_promotion_codes: true,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: sessionMetadata,
        subscription_data: {
          metadata: sessionMetadata,
        },
      }
    );

    if (sessionResult.error) {
      console.error('❌ Error creando checkout session:', sessionResult.error);
      return new Response(
        JSON.stringify({
          error: 'Error al crear checkout session',
          message: sessionResult.error.message,
          code: 'STRIPE_ERROR',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 502,
        }
      );
    }

    const session = sessionResult.data;
    console.log(`✅ Checkout Session creada: ${session.id}, URL: ${session.url}`);

    // Respuesta exitosa
    return new Response(
      JSON.stringify({
        url: session.url,
        sessionId: session.id,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('❌ Error en create-checkout-session:', error);
    console.error('❌ Stack:', error.stack);
    console.error('❌ Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

    return new Response(
      JSON.stringify({
        error: 'Error interno',
        message: error.message || 'Error desconocido',
        code: 'INTERNAL_ERROR',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
