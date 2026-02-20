// Edge Function: Rate Limiter
// Previene ataques de fuerza bruta limitando intentos de login/registro

import { createClient } from 'jsr:@supabase/supabase-js@2';

// Configuración de rate limits por acción
const RATE_LIMIT_CONFIG: Record<string, { maxAttempts: number; windowMs: number }> = {
  login: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutos
  },
  register: {
    maxAttempts: 3,
    windowMs: 60 * 60 * 1000, // 1 hora
  },
  password_reset: {
    maxAttempts: 3,
    windowMs: 60 * 60 * 1000, // 1 hora
  },
  default: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutos por defecto
  },
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, identifier } = await req.json();

    if (!action || !identifier) {
      return new Response(
        JSON.stringify({ error: 'action y identifier son requeridos' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Obtener configuración para esta acción
    const config = RATE_LIMIT_CONFIG[action] || RATE_LIMIT_CONFIG.default;
    const key = `${action}:${identifier}`;
    const now = Date.now();

    // Crear cliente Supabase con service role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Buscar entrada existente
    const { data: existing, error: fetchError } = await supabase
      .from('rate_limits')
      .select('*')
      .eq('key', key)
      .maybeSingle();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching rate limit:', fetchError);
      // En caso de error, permitir la acción (fail open)
      return new Response(
        JSON.stringify({ allowed: true, remaining: config.maxAttempts }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (existing) {
      // Si la ventana expiró, resetear
      if (existing.reset_at < now) {
        const { error: updateError } = await supabase
          .from('rate_limits')
          .update({
            attempts: 1,
            reset_at: now + config.windowMs,
            last_attempt: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('key', key);

        if (updateError) {
          console.error('Error updating rate limit:', updateError);
        }

        return new Response(
          JSON.stringify({
            allowed: true,
            remaining: config.maxAttempts - 1,
            resetAt: now + config.windowMs,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Si excedió el límite
      if (existing.attempts >= config.maxAttempts) {
        const minutesUntilReset = Math.ceil((existing.reset_at - now) / 1000 / 60);

        return new Response(
          JSON.stringify({
            allowed: false,
            remaining: 0,
            resetAt: existing.reset_at,
            message: `Demasiados intentos. Intenta de nuevo en ${minutesUntilReset} minutos.`,
          }),
          {
            status: 429, // Too Many Requests
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Verificar que no haya un error de actualización
      if (existing.reset_at < now) {
        // Si la ventana expiró pero aún no se actualizó, resetear
        const { error: updateError } = await supabase
          .from('rate_limits')
          .update({
            attempts: 1,
            reset_at: now + config.windowMs,
            last_attempt: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('key', key);

        if (updateError) {
          console.error('Error updating rate limit:', updateError);
        }

        return new Response(
          JSON.stringify({
            allowed: true,
            remaining: config.maxAttempts - 1,
            resetAt: now + config.windowMs,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Incrementar intentos
      const newAttempts = existing.attempts + 1;
      const { error: updateError } = await supabase
        .from('rate_limits')
        .update({
          attempts: newAttempts,
          last_attempt: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('key', key);

      if (updateError) {
        console.error('Error updating rate limit:', updateError);
      }

      // Calcular intentos restantes después del incremento
      const remaining = Math.max(0, config.maxAttempts - newAttempts);

      return new Response(
        JSON.stringify({
          allowed: true,
          remaining: remaining,
          resetAt: existing.reset_at,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else {
      // Crear nueva entrada (primer intento)
      const { error: insertError } = await supabase.from('rate_limits').insert({
        key,
        action,
        identifier,
        attempts: 1,
        reset_at: now + config.windowMs,
        last_attempt: new Date().toISOString(),
      });

      if (insertError) {
        console.error('Error inserting rate limit:', insertError);
        // Fail open en caso de error
        return new Response(
          JSON.stringify({ allowed: true, remaining: config.maxAttempts }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Primer intento: 1 intento usado, quedan maxAttempts - 1
      return new Response(
        JSON.stringify({
          allowed: true,
          remaining: config.maxAttempts - 1,
          resetAt: now + config.windowMs,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    } catch (error) {
      console.error('Error in rate-limiter function:', error);
      // Fail open: en caso de error, permitir la acción
      return new Response(
        JSON.stringify({ allowed: true, remaining: 5 }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
});

