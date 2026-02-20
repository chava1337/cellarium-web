import React, { useState, useEffect } from 'react';
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
  ActivityIndicator,
  Image,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';
import { withTimeout, TimeoutError } from '../utils/withTimeout';
import { useAuth } from '../contexts/AuthContext';

interface AuthScreenProps {
  onAuthSuccess: () => void;
  initialMode?: 'login' | 'register';
}

export default function AuthScreen({ onAuthSuccess, initialMode = 'login' }: AuthScreenProps) {
  const { user } = useAuth();
  const [isLogin, setIsLogin] = useState(initialMode === 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  // Al detectar user en contexto (tras loadUserData), apagar loading local y opcionalmente limpiar campos
  useEffect(() => {
    if (user) {
      setLoading(false);
      setEmail('');
      setPassword('');
      setName('');
    }
  }, [user]);


  const handleEmailPasswordAuth = async () => {
    // 1) Validar campos requeridos
    if (!email || !password) {
      Alert.alert('Error', 'Por favor completa todos los campos');
      return;
    }

    setLoading(true);
    try {
      if (!isLogin) {
        // ============================================
        // FLUJO DE REGISTRO
        // ============================================
        // Normalizar valores antes de enviar
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedPassword = password.trim();
        const fullName = name.trim();

        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password: normalizedPassword,
          options: {
            data: {
              full_name: fullName || null,
            },
          },
        });

        if (error) {
          Alert.alert('Error', error.message);
        } else {
          Alert.alert('Éxito', 'Usuario registrado. Revisa tu email para confirmar la cuenta.');
        }
      } else {
        // ============================================
        // FLUJO DE LOGIN
        // ============================================
        
        // 2) Normalizar input y determinar si es email o username
        const cleanInput = email.trim();
        const cleanPassword = password.trim();
        const isEmail = cleanInput.includes('@');
        let authEmail = cleanInput;
        
        // 3) Si es username, obtener email real vía RPC
        if (!isEmail) {
          try {
            const { data: userData, error: userError } = await supabase
              .rpc('get_user_email_by_username', { p_username: cleanInput });
            
            if (userError) {
              Alert.alert('Error', `Usuario no encontrado: ${userError.message}`);
              return;
            }
            
            if (!userData || userData.length === 0) {
              Alert.alert('Error', 'Usuario no encontrado. Verifica que el username sea correcto.');
              return;
            }
            
            authEmail = userData[0].email;
          } catch (lookupError: any) {
            Alert.alert('Error', 'Error al buscar usuario');
            return;
          }
        } else {
          // Es email - normalizar a minúsculas
          authEmail = cleanInput.toLowerCase();
        }
        
        // 4) Verificar rate limit antes del login (Edge Function: rate-limiter)
        const identifier = authEmail.trim().toLowerCase();
        let remainingAttempts = 4; // Default si hay error en rate limiter

        if (__DEV__) console.log('[LOGIN] before rate-limiter');
        try {
          const { data: rateLimitData, error: rateLimitError } = await withTimeout(
            supabase.functions.invoke('rate-limiter', {
              body: {
                action: 'login',
                identifier: identifier
              }
            }),
            10000,
            'rate-limiter'
          );
          if (__DEV__) console.log('[LOGIN] after rate-limiter');
          
          if (rateLimitError) {
            // Si el error es 429 (Too Many Requests), significa que se excedió el límite
            if (rateLimitError.status === 429 || rateLimitError.message?.includes('429')) {
              const resetMinutes = 15; // Default
              Alert.alert(
                'Demasiados intentos',
                `Has excedido el límite de intentos de login. Por seguridad, debes esperar ${resetMinutes} minutos antes de intentar nuevamente.`
              );
              setLoading(false);
              return;
            }
            // Otro error: permitir intento (fail open)
          } else if (rateLimitData) {
            if (!rateLimitData.allowed) {
              const resetMinutes = rateLimitData.resetAt 
                ? Math.ceil((rateLimitData.resetAt - Date.now()) / 1000 / 60)
                : 15;
              
              Alert.alert(
                'Demasiados intentos',
                `Has excedido el límite de intentos de login. Por seguridad, debes esperar ${resetMinutes} minutos antes de intentar nuevamente.`
              );
              setLoading(false);
              return;
            }
            remainingAttempts = rateLimitData.remaining ?? 4;
          }
        } catch (rateLimitErr: any) {
          // Si hay error (incl. timeout), permitir intento (fail open)
          if (__DEV__) console.log('[LOGIN] rate-limiter error/timeout, continuing', rateLimitErr?.message ?? rateLimitErr);
        }
        
        // 5) Intentar login con Supabase
        if (__DEV__) console.log('[LOGIN] before signInWithPassword');
        const { data, error } = await withTimeout(
          supabase.auth.signInWithPassword({
            email: authEmail.trim().toLowerCase(),
            password: cleanPassword,
          }),
          20000,
          'signInWithPassword'
        );
        if (__DEV__) console.log('[LOGIN] after signInWithPassword');
        
        // 6) Manejo de errores e intentos restantes
        if (error) {
          // Si es error de credenciales, sugerir registro
          if (error.message?.includes('Invalid login credentials') ||
              error.code === 'invalid_credentials' ||
              error.status === 400) {
            const remainingText = remainingAttempts > 0
              ? `\n\nIntentos restantes: ${remainingAttempts}`
              : '\n\nHas alcanzado el límite de intentos. Debes esperar 15 minutos.';
            Alert.alert(
              'Credenciales inválidas',
              `Usuario o contraseña incorrectos. Si no tienes cuenta, regístrate.${remainingText}`,
              [{ text: 'OK', onPress: () => setIsLogin(false) }]
            );
          } else {
            Alert.alert('Error', error.message || 'Error al iniciar sesión');
          }
        }
      }
    } catch (error: any) {
      if (error instanceof TimeoutError) {
        Alert.alert(
          'Conexión lenta',
          'La operación tardó demasiado. Revisa tu conexión e intenta de nuevo.'
        );
      } else {
        Alert.alert('Error', error?.message || 'Error desconocido');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    if (loading) return;
    setLoading(true);
    console.log('[OAuth] CLICK');
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'cellarium://auth-callback',
        },
      });
      if (__DEV__) console.log('[OAuth] signInWithOAuth done', { hasUrl: !!data?.url, error: error?.message ?? null });

      if (error) {
        Alert.alert('Error', `Error: ${error.message}`);
        return;
      }

      if (!data?.url) {
        Alert.alert('Error', 'No se pudo obtener la URL de autenticación');
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        'cellarium://auth-callback'
      );
      const resultUrl = (result as { url?: string }).url;
      const hasHash = resultUrl?.includes('#') ?? false;
      if (__DEV__) console.log('[OAuth] openAuthSessionAsync done', { type: result.type, hasUrl: !!resultUrl, hasHash, hasQuery: resultUrl?.includes('?') ?? false });

      if (result.type !== 'success' || !resultUrl) {
        return;
      }

      const fragment = hasHash ? resultUrl.split('#')[1] : '';
      const params = new URLSearchParams(fragment);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (!accessToken || !refreshToken) {
        if (__DEV__) console.log('[OAuth] callback (missing tokens)', { hasHash, hasQuery: resultUrl?.includes('?') });
        Alert.alert('Error', 'OAuth callback missing tokens');
        return;
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (__DEV__) console.log('[OAuth] setSession done', { uid: sessionData?.user?.id ?? null, error: sessionError?.message ?? null });

      if (sessionError) {
        Alert.alert('Error', sessionError.message);
        return;
      }

      setLoading(false);
      return;
    } catch (error: any) {
      console.log('[OAuth] ERROR');
      if (__DEV__) console.log('[OAuth] ERROR detail', error?.message ?? String(error));
      Alert.alert('Error', error?.message || 'Error iniciando sesión con Google');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // LEGACY: Funciones no utilizadas
  // ============================================
  // Estas funciones fueron usadas en una versión anterior para crear usuarios owners
  // via Edge Function. Actualmente no se usan en este componente, ya que la lógica
  // de creación de usuarios se maneja automáticamente mediante triggers y Edge Functions
  // en el backend. Se mantienen solo como referencia histórica.
  //
  // NOTA: Antes existían funciones locales checkAndCreateUser/createOwnerUser para
  // manejar creación de usuarios, ahora la lógica vive en otro lugar (Edge Function / trigger).

  /*
  const checkAndCreateUser = async (user: any) => {
    try {
      // Verificar si el usuario existe en nuestra tabla
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (fetchError && fetchError.code === 'PGRST116') {
        // Usuario no existe, crear usando Edge Function
        console.log('📝 Usuario no existe, invocando Edge Function...');
        await createOwnerUser(user, user.user_metadata?.name || user.user_metadata?.full_name || user.email);
      } else if (existingUser) {
        // Usuario existe, continuar
        console.log('✅ Usuario ya existe, continuando...');
        onAuthSuccess();
      }
    } catch (error) {
      console.error('Error verificando usuario:', error);
    }
  };

  const createOwnerUser = async (user: any, userName: string) => {
    try {
      console.log('📝 Invocando Edge Function para crear usuario owner:', user.id);
      
      // ✅ Verificar que el usuario esté autenticado
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        console.error('❌ No hay sesión activa');
        Alert.alert('Error', 'No se pudo verificar la sesión. Intenta iniciar sesión.');
        return;
      }
      
      // Invocar Edge Function para crear usuario y sucursal
      const { data, error } = await supabase.functions.invoke('user-created', {
        body: {
          name: userName,
          invitationType: 'owner_register',
        },
      });

      if (error) {
        console.error('Error en Edge Function:', error);
        throw error;
      }

      console.log('✅ Usuario creado via Edge Function:', data);
      onAuthSuccess();
    } catch (error: any) {
      console.error('Error creando usuario owner:', error);
      Alert.alert('Error', 'Error creando perfil de usuario');
    }
  };
  */

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.formContainer}>
          {/* Header minimalista centrado */}
          <View style={styles.header}>
            <Text style={styles.subtitle}>
              {isLogin ? 'Inicia sesión para continuar' : 'Crea tu cuenta como Owner'}
            </Text>
          </View>

          <View style={styles.form}>
            {/* Botón de Google oficial arriba */}
            <TouchableOpacity
              style={[styles.googleButtonContainer, loading && styles.buttonDisabled]}
              onPress={handleGoogleAuth}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <View style={styles.googleButtonLoading}>
                  <ActivityIndicator
                    size="small"
                    color="#1f2937"
                  />
                </View>
              ) : (
                <Image
                  source={require('../../assets/images/android_dark_rd_ctn.png')}
                  style={styles.googleButtonImage}
                  resizeMode="contain"
                />
              )}
            </TouchableOpacity>

          {/* Divisor "o usa tu correo" */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>o usa tu correo</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Campos de correo */}
          {!isLogin && (
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Nombre completo</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: Juan Pérez"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                placeholderTextColor="#9ca3af"
              />
            </View>
          )}

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Usuario o Email</Text>
            <TextInput
              style={styles.input}
              placeholder="Nombre de usuario o email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Contraseña</Text>
            <TextInput
              style={styles.input}
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholderTextColor="#9ca3af"
            />
          </View>

          {/* Botón de acción con correo */}
          <TouchableOpacity
            style={[styles.emailButton, loading && styles.buttonDisabled]}
            onPress={handleEmailPasswordAuth}
            disabled={loading}
          >
            <View style={styles.buttonContent}>
              {loading && (
                <ActivityIndicator
                  size="small"
                  color="#fff"
                  style={styles.buttonLoader}
                />
              )}
              <Text style={styles.emailButtonText}>
                {loading
                  ? isLogin
                    ? 'Iniciando sesión...'
                    : 'Creando cuenta...'
                  : isLogin
                  ? 'Iniciar sesión con correo'
                  : 'Registrarse con correo'}
              </Text>
            </View>
          </TouchableOpacity>

            {/* Texto para cambiar de modo */}
            <TouchableOpacity
              style={styles.switchButton}
              onPress={() => setIsLogin(!isLogin)}
            >
              <Text style={styles.switchButtonText}>
                {isLogin
                  ? '¿No tienes cuenta? Regístrate'
                  : '¿Ya tienes cuenta? Inicia sesión'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const PRIMARY_COLOR = '#924048';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  formContainer: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  subtitle: {
    fontSize: 24,
    fontWeight: '600',
    color: PRIMARY_COLOR,
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f3f4f6',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    color: '#1f2937',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  dividerText: {
    marginHorizontal: 16,
    color: '#9ca3af',
    fontSize: 14,
  },
  emailButton: {
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginBottom: 24,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLoader: {
    marginRight: 8,
  },
  emailButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  googleButtonContainer: {
    width: '100%',
    height: 52,
    marginBottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleButtonImage: {
    width: '100%',
    height: 52,
  },
  googleButtonLoading: {
    width: '100%',
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 16,
  },
  switchButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchButtonText: {
    color: PRIMARY_COLOR,
    fontSize: 14,
  },
});




