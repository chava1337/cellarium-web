import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { supabase } from '../lib/supabase';

type AdminRegistrationScreenNavigationProp = StackNavigationProp<RootStackParamList, 'AdminRegistration'>;
type AdminRegistrationScreenRouteProp = RouteProp<RootStackParamList, 'AdminRegistration'>;

interface Props {
  navigation: AdminRegistrationScreenNavigationProp;
  route: AdminRegistrationScreenRouteProp;
}

const AdminRegistrationScreen: React.FC<Props> = ({ navigation, route }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Obtener datos del QR (ownerId viene de resolve-qr en QrProcessor para flujo staff)
  const qrToken = route.params?.qrToken;
  const branchName = route.params?.branchName;
  const branchId = route.params?.branchId;
  const ownerIdFromParams = route.params?.ownerId;

  const handleUsernameRegister = async () => {
    // Prevenir doble submit
    if (loading) {
      console.log('⚠️ Registro ya en progreso, ignorando...');
      return;
    }

    if (!username || !password || !confirmPassword) {
      Alert.alert('Error', 'Por favor completa todos los campos');
      return;
    }

    // Validar username: mínimo 6 caracteres, solo letras, números y guiones bajos
    const usernameRegex = /^[a-zA-Z0-9_]{6,}$/;
    if (!usernameRegex.test(username)) {
      Alert.alert('Error', 'El nombre de usuario debe tener al menos 6 caracteres y solo puede contener letras, números y guiones bajos (_)');
      return;
    }

    // Normalizar contraseñas para comparación
    const normalizedPassword = password.trim();
    const normalizedConfirmPassword = confirmPassword.trim();

    if (normalizedPassword !== normalizedConfirmPassword) {
      Alert.alert('Error', 'Las contraseñas no coinciden');
      return;
    }

    if (normalizedPassword.length < 6) {
      Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres');
      return;
    }

    try {
      setLoading(true);
      
      console.log('📝 ==================== INICIO REGISTRO CON QR ====================');
      console.log('📝 Username:', username);
      console.log('📝 Branch ID:', branchId);
      console.log('📝 Branch Name:', branchName);

      const ownerId = ownerIdFromParams;
      if (!ownerId) {
        Alert.alert('Error', 'Datos de invitación incompletos. Escanea el código QR de invitación de nuevo.');
        setLoading(false);
        return;
      }
      if (__DEV__) {
        const tokenSuffix = typeof qrToken === 'string' && qrToken.length >= 4 ? qrToken.slice(-4) : '***';
        console.log('[AdminRegistration] context', {
          qrTokenSuffix: tokenSuffix,
          branchId: branchId ?? null,
          ownerId,
          username,
        });
      }
      console.log('📝 Owner ID:', ownerId);
      
      // Generar email ficticio único: username_ownerid@placeholder.com
      // Usar placeholder.com que es un dominio estándar para testing y Supabase lo acepta
      // Usar solo los primeros 8 caracteres del owner_id para evitar emails muy largos
      const ownerIdShort = ownerId.substring(0, 8).replace(/-/g, '');
      const fakeEmail = `${username}_${ownerIdShort}@placeholder.com`;
      console.log('📝 Email ficticio generado:', fakeEmail);
      
      // 1. Verificar rate limit ANTES de intentar registro
      console.log('📝 Verificando rate limit para registro...');
      const { data: rateLimitData, error: rateLimitError } = await supabase.functions.invoke('rate-limiter', {
        body: {
          action: 'register',
          identifier: fakeEmail // Usar email ficticio como identificador
        }
      });
      
      console.log('📝 Rate limit response:');
      console.log('📝 - Allowed:', rateLimitData?.allowed);
      console.log('📝 - Remaining:', rateLimitData?.remaining);
      console.log('📝 - Reset at:', rateLimitData?.resetAt);
      
      if (rateLimitError) {
        console.error('❌ Error en rate limiter:', rateLimitError);
        // En caso de error, permitir intento (fail open)
        console.log('⚠️ Rate limiter error, permitiendo intento...');
      } else if (!rateLimitData?.allowed) {
        const resetMinutes = rateLimitData?.resetAt 
          ? Math.ceil((rateLimitData.resetAt - Date.now()) / 1000 / 60)
          : 60;
        
        console.error('❌ Rate limit excedido para registro');
        Alert.alert(
          'Límite alcanzado',
          `Has intentado registrarte demasiadas veces. Por seguridad, debes esperar ${resetMinutes} minutos antes de intentar nuevamente.`
        );
        setLoading(false);
        return;
      }
      
      console.log('✅ Rate limit OK, intentos restantes:', rateLimitData?.remaining || 'N/A');
      
      // Registrar en Supabase con el email ficticio
      // Staff invitados NO requieren confirmación por email (serán aprobados por el owner)
      console.log('📝 Llamando a supabase.auth.signUp...');
      console.log('📝 Password original length:', password.length);
      console.log('📝 Password normalizada length:', normalizedPassword.length);
      console.log('📝 Password tiene espacios:', password !== normalizedPassword);
      
      const { data, error } = await supabase.auth.signUp({
        email: fakeEmail,
        password: normalizedPassword, // Usar password normalizado
        options: {
          data: {
            qrToken,
            branchId,
            branchName,
            invitationType: 'admin_invite',
            username: username, // Guardar el username real en metadata
          },
        },
      });

      if (__DEV__) {
        console.log('[AdminRegistration] signUp result', {
          hasData: !!data,
          userId: data?.user?.id ?? null,
          sessionExists: !!data?.session,
          error: error ? { message: error.message, code: (error as any)?.code, status: (error as any)?.status } : null,
        });
      }
      console.log('📝 Respuesta de signUp:');
      console.log('📝 - Error:', error ? JSON.stringify(error, null, 2) : 'null');
      console.log('📝 - User ID:', data?.user?.id || 'null');
      console.log('📝 - User Email:', data?.user?.email || 'null');
      console.log('📝 - Session:', data?.session ? 'EXISTE' : 'null');
      console.log('📝 - Email Confirmed:', data?.user?.email_confirmed_at ? 'SI' : 'NO');
      console.log('📝 - User Metadata:', JSON.stringify(data?.user?.user_metadata, null, 2));

      if (error) {
        console.error('❌ Error en signUp:', error);
        throw error;
      }

      // ✅ ESPERAR a que la sesión esté activa antes de invocar Edge Function
      if (data.session) {
        // Usuario autenticado inmediatamente, invocar Edge Function
        console.log('📝 ✅ Sesión activa - Usuario autenticado inmediatamente');
        console.log('📝 User ID:', data.user!.id);
        console.log('📝 Session token (primeros 20):', data.session.access_token?.substring(0, 20) + '...');
        console.log('📝 Invocando Edge Function user-created...');
        
        try {
          // Esperar un momento para asegurar que la sesión esté completamente establecida
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const { data: functionData, error: functionError } = await supabase.functions.invoke('user-created', {
            body: {
              qrToken,
              invitationType: 'admin_invite',
              branchId,
              name: username, // Usar el username real
              username: username, // Pasar el username explícitamente
            },
          });

          if (__DEV__) {
            console.log('[AdminRegistration] user-created invoke', {
              success: functionData?.success,
              functionData: functionData ? { success: functionData.success, message: (functionData as any)?.message, error: (functionData as any)?.error } : null,
              functionError: functionError ? { message: functionError.message, status: (functionError as any)?.status, context: (functionError as any)?.context } : null,
            });
          }
          console.log('📝 Respuesta de Edge Function:');
          console.log('📝 - Error:', functionError ? JSON.stringify(functionError, null, 2) : 'null');
          console.log('📝 - Data:', functionData ? JSON.stringify(functionData, null, 2) : 'null');
          console.log('📝 - Success:', functionData?.success ? 'SI' : 'NO');

          if (functionError) {
            console.error('❌ Error en Edge Function:', functionError);
            console.error('❌ Error message:', functionError.message);
            console.error('❌ Error code:', functionError.status || functionError.code);
            
            // Intentar crear usuario via RPC como fallback
            console.log('📝 Intentando crear usuario via RPC como fallback...');
            try {
              // Intentar primero con username (si la migración ya se ejecutó)
              let rpcData, rpcError;
              try {
                const result = await supabase.rpc('create_staff_user', {
                  p_user_id: data.user!.id,
                  p_email: fakeEmail,
                  p_name: username,
                  p_username: username,
                  p_qr_token: qrToken,
                });
                rpcData = result.data;
                rpcError = result.error;
                if (__DEV__) {
                  console.log('[AdminRegistration] create_staff_user RPC (with username)', {
                    rpcData,
                    rpcError: rpcError ? { code: rpcError.code, message: rpcError.message, details: rpcError.details } : null,
                  });
                }
              } catch (e: any) {
                // Si falla, intentar sin username (función antigua)
                console.log('📝 Función RPC no acepta p_username, intentando sin él...');
                const result = await supabase.rpc('create_staff_user', {
                  p_user_id: data.user!.id,
                  p_email: fakeEmail,
                  p_name: username,
                  p_qr_token: qrToken,
                });
                rpcData = result.data;
                rpcError = result.error;
                if (__DEV__) {
                  console.log('[AdminRegistration] create_staff_user RPC (without username)', {
                    rpcData,
                    rpcError: rpcError ? { code: rpcError.code, message: rpcError.message, details: rpcError.details } : null,
                  });
                }
                // Si se creó sin username, actualizar username manualmente
                if (rpcData?.success && !rpcError) {
                  console.log('📝 Usuario creado sin username, actualizando username...');
                  const { error: updateError } = await supabase
                    .from('users')
                    .update({ username: username })
                    .eq('id', data.user!.id);
                  
                  if (updateError) {
                    console.error('❌ Error actualizando username:', updateError);
                  } else {
                    console.log('✅ Username actualizado correctamente');
                  }
                }
              }
              
              if (rpcError) {
                console.error('❌ Error en RPC fallback:', rpcError);
              } else if (rpcData?.success) {
                console.log('✅ Usuario creado via RPC fallback:', rpcData);
              }
            } catch (rpcErr: any) {
              if (__DEV__) {
                console.log('[AdminRegistration] create_staff_user RPC catch', {
                  message: rpcErr?.message,
                  code: rpcErr?.code,
                  stringified: typeof rpcErr === 'object' ? JSON.stringify(rpcErr, Object.getOwnPropertyNames(rpcErr)) : String(rpcErr),
                });
              }
              console.error('❌ Error en RPC fallback:', rpcErr);
            }
            
            Alert.alert(
              'Advertencia',
              'Tu cuenta fue creada pero hubo un problema al completar el perfil. Contacta al administrador.'
            );
          } else {
            console.log('✅ Usuario staff creado via Edge Function:', functionData);
            
            // Esperar un momento antes de verificar
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Verificar que el usuario se creó en la BD
            console.log('📝 Verificando creación del usuario en BD...');
            const { data: verifyUser, error: verifyError } = await supabase
              .from('users')
              .select('*')
              .eq('id', data.user!.id)
              .single();
            
            if (verifyError) {
              console.error('❌ Error verificando usuario:', verifyError);
              console.error('❌ Error code:', verifyError.code);
              console.error('❌ Error message:', verifyError.message);
              console.error('❌ Error details:', verifyError.details);
            } else if (verifyUser) {
              console.log('✅ Usuario verificado en BD:');
              console.log('✅ - ID:', verifyUser.id);
              console.log('✅ - Email:', verifyUser.email);
              console.log('✅ - Role:', verifyUser.role);
              console.log('✅ - Status:', verifyUser.status);
              console.log('✅ - Owner ID:', verifyUser.owner_id);
              console.log('✅ - Branch ID:', verifyUser.branch_id);
            } else {
              console.error('❌ Usuario NO encontrado en BD después de Edge Function');
              console.error('❌ Esto significa que el usuario NO podrá hacer login hasta que se cree en public.users');
            }
            
            // Verificar también el email confirmado en auth.users
            console.log('📝 Verificando confirmación de email en auth...');
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (authUser) {
              console.log('📝 Email confirmado:', authUser.email_confirmed_at ? 'SI' : 'NO');
              console.log('📝 Email confirmed at:', authUser.email_confirmed_at || 'null');
            }
          }
        } catch (fnError: any) {
          console.error('❌ Error invocando Edge Function:', fnError);
          console.error('❌ Error type:', typeof fnError);
          console.error('❌ Error message:', fnError?.message || JSON.stringify(fnError));
        }
      } else {
        // No hay sesión - crear usuario usando función RPC (bypasea RLS)
        console.log('⚠️ Sin sesión activa - creando usuario via RPC function...');
        console.log('⚠️ User ID para RPC:', data.user?.id);
        
        try {
          // Llamar función SQL que bypasea RLS
          console.log('📝 Llamando RPC create_staff_user...');
          
          // Intentar primero con username (si la migración ya se ejecutó)
          let rpcData, rpcError;
          try {
            console.log('📝 Intentando RPC con username...');
            const result = await supabase.rpc('create_staff_user', {
              p_user_id: data.user!.id,
              p_email: fakeEmail,
              p_name: username,
              p_username: username,
              p_qr_token: qrToken,
            });
            rpcData = result.data;
            rpcError = result.error;
          } catch (e: any) {
            // Si falla, intentar sin username (función antigua)
            console.log('📝 Función RPC no acepta p_username, intentando sin él...');
            const result = await supabase.rpc('create_staff_user', {
              p_user_id: data.user!.id,
              p_email: fakeEmail,
              p_name: username,
              p_qr_token: qrToken,
            });
            rpcData = result.data;
            rpcError = result.error;
          }

          console.log('📝 Respuesta de RPC:');
          console.log('📝 - Error:', rpcError ? JSON.stringify(rpcError, null, 2) : 'null');
          console.log('📝 - Data:', rpcData ? JSON.stringify(rpcData, null, 2) : 'null');

          if (rpcError) {
            console.error('❌ Error en RPC create_staff_user:', rpcError);
            throw rpcError;
          }

          if (rpcData && rpcData.success) {
            console.log('✅ Usuario staff creado exitosamente via RPC:', rpcData);
            
            // Si se creó sin username, actualizarlo manualmente
            if (!rpcData.username) {
              console.log('📝 Actualizando username manualmente...');
              const { error: updateError } = await supabase
                .from('users')
                .update({ username: username })
                .eq('id', data.user!.id);
              
              if (updateError) {
                console.error('❌ Error actualizando username:', updateError);
              } else {
                console.log('✅ Username actualizado correctamente');
              }
            }
            
            // Verificar que el usuario se creó en la BD
            // NOTA: No podemos verificar directamente porque RLS requiere autenticación
            // Pero la RPC retornó success, así que el usuario se creó correctamente
            console.log('📝 Verificación: La RPC retornó success, el usuario se creó correctamente');
            console.log('📝 NOTA: No podemos verificar directamente porque RLS requiere autenticación');
            console.log('📝 El usuario podrá ser verificado después de que el owner lo apruebe y haga login');
            
            // Intentar verificar de todas formas (puede fallar por RLS, pero no es crítico)
            try {
              const { data: verifyUser, error: verifyError } = await supabase
                .from('users')
                .select('*')
                .eq('id', data.user!.id)
                .maybeSingle();
              
              if (verifyError) {
                if (verifyError.code === 'PGRST116') {
                  console.log('⚠️ No se puede verificar por RLS (esperado - usuario no autenticado)');
                  console.log('✅ Pero la RPC confirmó que el usuario se creó exitosamente');
                } else {
                  console.error('❌ Error verificando usuario:', verifyError);
                }
              } else if (verifyUser) {
                console.log('✅ Usuario verificado en BD:');
                console.log('✅ - ID:', verifyUser.id);
                console.log('✅ - Email:', verifyUser.email);
                console.log('✅ - Username:', verifyUser.username || 'NO asignado');
                console.log('✅ - Role:', verifyUser.role);
                console.log('✅ - Status:', verifyUser.status);
              }
            } catch (verifyErr: any) {
              console.log('⚠️ Error en verificación (no crítico):', verifyErr.message);
              console.log('✅ El usuario se creó correctamente según la RPC');
            }
          } else {
            console.error('❌ RPC retornó error:', rpcData);
            throw new Error(rpcData?.message || 'Error creando usuario');
          }
          
        } catch (directError) {
          console.error('❌ Error creando usuario via RPC:', directError);
          Alert.alert(
            'Advertencia',
            'Tu cuenta fue creada en el sistema de autenticación. El administrador completará tu perfil manualmente.'
          );
        }
      }
      
      console.log('📝 ==================== FIN REGISTRO CON QR ====================');

      Alert.alert(
        '✅ Registro Exitoso', 
        `Tu cuenta ha sido creada.\n\nSucursal: ${branchName || 'Sin especificar'}\n\n⚠️ Tu cuenta está pendiente de aprobación.\n\nEl owner de la sucursal debe aprobar tu solicitud y asignarte un rol antes de que puedas acceder al catálogo.`,
        [
          {
            text: 'Entendido',
            onPress: () => {
              navigation.navigate('Welcome');
            }
          }
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error al registrar administrador');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    const redirectTo = 'cellarium://auth-callback';
    if (__DEV__) console.log('[OAUTH] redirectTo:', redirectTo);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (__DEV__) console.log('[OAUTH] data.url exists:', !!data?.url);
      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      if (!data?.url) {
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectTo
      );

      if (__DEV__) {
        console.log('[OAUTH] result.type:', result.type);
        console.log('[OAUTH] result.url exists:', !!result.url);
        if (result.url) console.log('[OAUTH] callback raw URL:', result.url);
      }

      if (result.type === 'cancel' || !result.url) {
        setGoogleLoading(false);
        return;
      }
      if (result.type !== 'success') {
        setGoogleLoading(false);
        return;
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(result.url);
      } catch {
        if (__DEV__) console.log('[OAuth] invalid callback url');
        Alert.alert('Error', 'No se pudo procesar la respuesta de inicio de sesión.');
        setGoogleLoading(false);
        return;
      }

      const errorParam = parsedUrl.searchParams.get('error');
      if (errorParam) {
        Alert.alert('Error', 'No se pudo completar el inicio de sesión con Google. Intenta de nuevo.');
        setGoogleLoading(false);
        return;
      }

      const code = parsedUrl.searchParams.get('code');
      if (__DEV__) console.log('[OAUTH] has code:', !!code);
      if (code) {
        const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (__DEV__) console.log('[OAuth] exchangeCodeForSession', { hasSession: !!exchangeData?.session, error: exchangeError?.message ?? null });
        if (exchangeError) {
          Alert.alert('Error', 'No se pudo completar el inicio de sesión con Google. Intenta de nuevo.');
          setGoogleLoading(false);
          return;
        }
        if (exchangeData?.session) {
          setGoogleLoading(false);
          return;
        }
      }

      const fragment = parsedUrl.hash ? parsedUrl.hash.slice(1) : '';
      const hashParams = new URLSearchParams(fragment);
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      if (__DEV__) console.log('[OAUTH] has access_token:', !!accessToken);
      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) {
          if (__DEV__) console.log('[OAuth] setSession error:', sessionError.message);
          Alert.alert('Error', 'No se pudo completar el inicio de sesión con Google. Intenta de nuevo.');
          setGoogleLoading(false);
          return;
        }
        if (__DEV__) console.log('[OAuth] setSession success');
        setGoogleLoading(false);
        return;
      }

      if (__DEV__) console.log('[OAuth] callback missing tokens and code', result.url);
      Alert.alert('Error', 'No se pudo completar el inicio de sesión con Google. Intenta de nuevo.');
      setGoogleLoading(false);
      return;
    } catch (error: any) {
      if (__DEV__) console.log('[OAUTH ERROR]', error?.message);
      Alert.alert('Error', error.message || 'Error iniciando sesión con Google');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Registro de Administrador</Text>
          {branchName && (
            <View style={styles.branchBadge}>
              <Text style={styles.branchBadgeText}>🏢 {branchName}</Text>
            </View>
          )}
        </View>

        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            📋 Has sido invitado como administrador mediante código QR.
          </Text>
          <Text style={styles.infoSubtext}>
            Completa el registro y espera la aprobación del administrador.
          </Text>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.formTitle}>Registrarse como Staff</Text>
          
          {/* Botón Google OAuth */}
          <TouchableOpacity
            style={[styles.googleButton, googleLoading && styles.buttonDisabled]}
            onPress={handleGoogleAuth}
            disabled={googleLoading}
          >
            <Text style={styles.googleButtonText}>
              {googleLoading ? 'Conectando...' : '🌐 Continuar con Google'}
            </Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>O</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Formulario Username/Password */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Nombre de usuario *</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="Mínimo 6 caracteres (letras, números, _)"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />
            <Text style={styles.inputHint}>Solo letras, números y guiones bajos (_)</Text>
          </View>
          
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Contraseña *</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Mínimo 6 caracteres"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Confirmar Contraseña *</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Repite tu contraseña"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity
            style={[styles.registerButton, loading && styles.registerButtonDisabled]}
            onPress={handleUsernameRegister}
            disabled={loading}
          >
            <Text style={styles.registerButtonText}>
              {loading ? 'Registrando...' : '✓ Registrar con Usuario'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.navigate('Welcome')}
          >
            <Text style={styles.cancelButtonText}>Cancelar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.warningContainer}>
          <Text style={styles.warningText}>
            ⚠️ Tu cuenta quedará en estado "pendiente" hasta que un administrador con permisos la apruebe y asigne un rol.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#8B0000',
    marginBottom: 12,
  },
  branchBadge: {
    backgroundColor: '#28a745',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  branchBadgeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  infoContainer: {
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#2196f3',
  },
  infoText: {
    fontSize: 15,
    color: '#1565c0',
    fontWeight: '600',
    marginBottom: 8,
  },
  infoSubtext: {
    fontSize: 14,
    color: '#1976d2',
  },
  formContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 24,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  registerButton: {
    backgroundColor: '#28a745',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  registerButtonDisabled: {
    backgroundColor: '#ccc',
  },
  registerButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    alignItems: 'center',
    padding: 12,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 15,
  },
  googleButton: {
    backgroundColor: '#4285F4',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  googleButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ddd',
  },
  dividerText: {
    marginHorizontal: 15,
    color: '#666',
    fontSize: 14,
  },
  warningContainer: {
    backgroundColor: '#fff3cd',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
  },
  warningText: {
    fontSize: 13,
    color: '#856404',
    lineHeight: 20,
  },
});

export default AdminRegistrationScreen;

