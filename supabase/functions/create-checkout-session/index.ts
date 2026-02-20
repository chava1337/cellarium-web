// Edge Function: create-checkout-session
// Crea una Stripe Checkout Session para suscripciones usando REST API
// Solo owners pueden ejecutar esta función
//
// NOTA PARA FRONTEND:
// El frontend debe enviar el header Authorization con el token de Supabase:
//   const { data: { session } } = await supabase.auth.getSession();
//   const response = await supabase.functions.invoke('create-checkout-session', {
//     body: { planLookupKey: 'pro_monthly' },
//     headers: { Authorization: `Bearer ${session?.access_token}` }
//   });

import { createClient } from 'jsr:@supabase/supabase-js@2';

console.log('🚀 create-checkout-session: Function iniciada');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Mapeo interno -> Stripe lookup_key
const PLAN_LOOKUP_KEY_MAP = {
  pro_monthly: 'pro_monthly',
  business_monthly: 'business_monthly_mxn',
} as const;

// Planos permitidos (whitelist) - derivado del mapeo
const ALLOWED_PLAN_LOOKUP_KEYS = Object.keys(PLAN_LOOKUP_KEY_MAP) as Array<keyof typeof PLAN_LOOKUP_KEY_MAP>;

interface CreateCheckoutSessionRequest {
  planLookupKey: string;
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
async function stripeRequest(
  method: string,
  endpoint: string,
  secretKey: string,
  body?: Record<string, any>
): Promise<{ data?: any; error?: any }> {
  const url = `https://api.stripe.com/v1/${endpoint}`;
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
      .select('id, role, owner_id, stripe_customer_id, email, subscription_active, subscription_id, subscription_plan')
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
    });

    if (userData.subscription_active === true) {
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

    console.log(`✅ Usuario es owner: ${ownerId}`);

    // Parsear request body
    const body: CreateCheckoutSessionRequest = await req.json();
    const { planLookupKey } = body;

    console.log(`📋 Plan solicitado: ${planLookupKey}`);

    // Validar planLookupKey contra whitelist
    if (!planLookupKey || !ALLOWED_PLAN_LOOKUP_KEYS.includes(planLookupKey as any)) {
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

    // Resolver priceId desde lookup_key de Stripe
    console.log(`🔍 Buscando price con lookup_key: ${stripeLookupKey} (interno: ${planLookupKey})`);
    const priceResult = await stripeRequest(
      'GET',
      `prices?lookup_keys[]=${encodeURIComponent(stripeLookupKey)}&active=true&limit=1`,
      stripeSecretKey
    );

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
      console.error(`❌ Price no encontrado en Stripe - planLookupKey: "${planLookupKey}", stripeLookupKey: "${stripeLookupKey}"`);
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

    const priceId = prices[0].id;
    console.log(`✅ Price encontrado: ${priceId} para lookup_key: ${stripeLookupKey} (interno: ${planLookupKey})`);

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
    const sessionMetadata = {
      owner_id: ownerId,
      user_id: authUser.id,
      plan_name: planLookupKey,
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
