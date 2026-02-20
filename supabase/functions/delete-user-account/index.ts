// Edge Function: Delete User Account
// Elimina cuenta de usuario y todos los datos relacionados

import { createClient } from 'jsr:@supabase/supabase-js@2';

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
    // Verificar autenticación
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Crear cliente Supabase con el token del usuario
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verificar que el usuario está autenticado
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Usuario no autenticado' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Crear cliente con service role para operaciones administrativas
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // 1. Llamar a la función RPC para eliminar datos de public.users
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('delete_user_account', {
      p_user_id: user.id,
    });

    if (rpcError) {
      const err = rpcError as any;
      const rpcErrorInfo = {
        message: rpcError.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
      };
      console.error('Error en delete_user_account RPC:', rpcErrorInfo);
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Error eliminando datos del usuario (RPC)',
          rpcError: rpcErrorInfo,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!rpcData?.success) {
      return new Response(
        JSON.stringify({
          success: false,
          message: rpcData?.message || 'Error eliminando cuenta',
          rpcData,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 2. Eliminar de auth.users usando admin API
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (deleteAuthError) {
      console.error('Error eliminando de auth.users:', deleteAuthError);
      // Aunque falle la eliminación de auth.users, los datos de public.users ya se eliminaron
      // Retornar éxito parcial
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Datos eliminados, pero hubo un error al eliminar la cuenta de autenticación. Contacta al administrador.',
          warning: deleteAuthError.message,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: rpcData.message || 'Cuenta eliminada exitosamente',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in delete-user-account function:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Error desconocido'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});


