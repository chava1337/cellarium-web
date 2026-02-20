import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { event, session } = await req.json();

    if (event === 'SIGNUP' && session?.user) {
      const user = session.user;
      
      // Crear usuario en nuestra tabla con rol owner
      const { data: userData, error: userError } = await supabaseClient
        .from('users')
        .insert({
          id: user.id,
          email: user.email,
          name: user.user_metadata?.name || user.email.split('@')[0],
          role: 'owner',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (userError) {
        console.error('Error creando usuario:', userError);
        return new Response(
          JSON.stringify({ error: 'Error creando usuario' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Crear sucursal por defecto para el owner
      const { data: branchData, error: branchError } = await supabaseClient
        .from('branches')
        .insert({
          id: `${user.id}-main`,
          name: `${userData.name} - Sucursal Principal`,
          address: 'Dirección por definir',
          owner_id: user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (branchError) {
        console.error('Error creando sucursal:', branchError);
        // No fallar si no se puede crear la sucursal
      }

      // Actualizar usuario con branch_id
      if (branchData) {
        await supabaseClient
          .from('users')
          .update({ branch_id: branchData.id })
          .eq('id', user.id);
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          user: userData,
          branch: branchData 
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(
      JSON.stringify({ message: 'Evento no manejado' }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error en webhook:', error);
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});









































