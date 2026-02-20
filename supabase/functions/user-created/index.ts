// Edge Function: user-created
// Maneja la creación de usuarios en public.users después del registro en auth.users
// Se invoca automáticamente via Auth Hook o manualmente desde el cliente

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UserCreatedPayload {
  qrToken?: string;
  invitationType?: 'admin_invite' | 'owner_register';
  branchId?: string;
  name?: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Crear cliente con token del usuario
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Crear cliente admin para operaciones privilegiadas
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Obtener el usuario autenticado
    console.log('📝 Edge Function - Verificando autenticación...');
    console.log('📝 Edge Function - Auth header presente:', !!authHeader);
    
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    console.log('📝 Edge Function - Resultado de getUser:');
    console.log('📝 Edge Function - User:', user ? `${user.id} (${user.email})` : 'null');
    console.log('📝 Edge Function - Error:', userError ? JSON.stringify(userError, null, 2) : 'null');

    if (userError || !user) {
      console.error('❌ Edge Function - Usuario no autenticado');
      console.error('❌ Edge Function - Error:', userError);
      // Si no hay usuario autenticado pero hay payload con user_id, intentar crear usuario de todas formas
      // Esto puede pasar si la Edge Function se invoca antes de que la sesión esté completamente establecida
      const payload: UserCreatedPayload = await req.json();
      console.log('📝 Edge Function - Payload recibido sin usuario autenticado:', payload);
      
      // Si hay un user_id en el payload, podemos intentar crear el usuario de todas formas
      // pero necesitamos el user_id del payload o del metadata
      throw new Error('Usuario no autenticado - la Edge Function requiere autenticación');
    }

    console.log('📝 Edge Function - Procesando usuario:', user.id, user.email);
    console.log('📝 Edge Function - Email confirmado:', user.email_confirmed_at ? 'SI' : 'NO');

    // Extraer datos del payload
    const payload: UserCreatedPayload = await req.json();
    console.log('📦 Payload recibido:', payload);

    let ownerId: string | null = null;
    let branchId: string | null = null;
    let role: 'owner' | 'staff' = 'owner';
    let status: 'active' | 'pending' = 'active';

    // Si hay QR token, es staff invitado
    if (payload.qrToken) {
      console.log('🔍 Buscando QR token:', payload.qrToken);
      
      const { data: qrData, error: qrError } = await supabaseAdmin
        .from('qr_tokens')
        .select('owner_id, branch_id')
        .eq('token', payload.qrToken)
        .single();

      if (qrError) {
        console.error('❌ Error al buscar QR token:', qrError);
      } else if (qrData) {
        console.log('✅ QR token encontrado:', qrData);
        ownerId = qrData.owner_id;
        branchId = qrData.branch_id;
        role = 'staff';
        status = 'pending';
      }
    }

    // Si no hay QR token pero hay invitationType = 'admin_invite'
    if (!payload.qrToken && payload.invitationType === 'admin_invite') {
      role = 'staff';
      status = 'pending';
      branchId = payload.branchId || null;
    }

    // Si es owner y hay branchId en el payload
    if (role === 'owner' && payload.branchId) {
      branchId = payload.branchId;
    }

    // Extraer nombre del usuario
    const userName = payload.name || user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario';
    
    // Extraer username si está en el payload o metadata
    const username = payload.username || user.user_metadata?.username || null;

    console.log('📊 Datos calculados:', {
      role,
      status,
      branchId,
      ownerId,
      userName,
      username,
    });

    // Verificar si el usuario ya existe en public.users
    const { data: existingUser, error: checkError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (checkError) {
      console.error('❌ Error al verificar usuario existente:', checkError);
    }

    if (existingUser) {
      console.log('✅ Usuario ya existe en public.users, no se crea duplicado');
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Usuario ya existe',
          user: existingUser,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Insertar usuario en public.users
    console.log('📝 Insertando usuario en public.users...');
    const insertData: any = {
      id: user.id,
      email: user.email,
      name: userName,
      role,
      status,
      branch_id: branchId,
      owner_id: ownerId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    // Agregar username si está disponible
    if (username) {
      insertData.username = username;
      console.log('📝 Username a guardar:', username);
    }
    
    const { data: newUser, error: insertError } = await supabaseAdmin
      .from('users')
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      console.error('❌ Error al insertar usuario:', insertError);
      throw insertError;
    }

    console.log('✅ Usuario creado exitosamente:', newUser);

    // Si es staff invitado, confirmar email automáticamente
    if (role === 'staff' && status === 'pending') {
      console.log('📧 Confirmando email automáticamente para staff invitado...');
      
      const { error: confirmError } = await supabaseAdmin.auth.admin.updateUserById(
        user.id,
        {
          email_confirm: true,
        }
      );

      if (confirmError) {
        console.error('❌ Error al confirmar email:', confirmError);
      } else {
        console.log('✅ Email confirmado automáticamente');
      }
    }

    // Si es owner, crear sucursal principal si no hay branchId
    if (role === 'owner' && !branchId) {
      console.log('🏢 Creando sucursal principal para owner...');
      
      const { data: branch, error: branchError } = await supabaseAdmin
        .from('branches')
        .insert({
          name: `${userName} - Sucursal Principal`,
          address: 'Dirección por definir',
          owner_id: user.id,
          is_main: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (branchError) {
        console.error('❌ Error al crear sucursal:', branchError);
      } else {
        console.log('✅ Sucursal creada:', branch);
        
        // Actualizar usuario con branch_id
        const { error: updateError } = await supabaseAdmin
          .from('users')
          .update({ branch_id: branch.id })
          .eq('id', user.id);

        if (updateError) {
          console.error('❌ Error al actualizar usuario con branch_id:', updateError);
        } else {
          console.log('✅ Usuario actualizado con branch_id');
          branchId = branch.id;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Usuario creado exitosamente',
        user: {
          ...newUser,
          branch_id: branchId,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('❌ Error en user-created:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});











