import React, { useState, useEffect, useCallback } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';
import { withTimeout, TimeoutError } from '../utils/withTimeout';
import { useAuth } from '../contexts/AuthContext';
import AppleSignInButton from '../components/auth/AppleSignInButton';

interface AuthScreenProps {
  onAuthSuccess: () => void;
  initialMode?: 'login' | 'register';
}

export default function AuthScreen({ onAuthSuccess, initialMode = 'login' }: AuthScreenProps) {
  const { user } = useAuth();
  const [isLogin, setIsLogin] = useState(initialMode === 'login');
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [appleAuthBusy, setAppleAuthBusy] = useState(false);
  const onAppleBusyChange = useCallback((busy: boolean) => {
    setAppleAuthBusy(busy);
  }, []);

  // Al detectar user en contexto (tras loadUserData), apagar loading local y opcionalmente limpiar campos
  useEffect(() => {
    if (user) {
      setLoading(false);
      setSubmitting(false);
      setEmail('');
      setConfirmEmail('');
      setPassword('');
      setConfirmPassword('');
      setName('');
    }
  }, [user]);


  const handleEmailPasswordAuth = async () => {
    if (submitting) return;
    setSubmitting(true);
    if (__DEV__) {
      console.log('[AUTH] submit start', { submitting: false, mode: isLogin ? 'login' : 'signup' });
    }

    if (!email || !password) {
      Alert.alert('Error', 'Por favor completa todos los campos');
      setSubmitting(false);
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (isLogin) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        Alert.alert('Error', 'Ingresa un correo electrónico válido.');
        setSubmitting(false);
        return;
      }
      if (!normalizedPassword) {
        Alert.alert('Error', 'La contraseña no puede estar vacía.');
        setSubmitting(false);
        return;
      }
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        Alert.alert('Error', 'Ingresa un correo electrónico válido.');
        setSubmitting(false);
        return;
      }
      if (confirmEmail.trim().toLowerCase() !== normalizedEmail) {
        Alert.alert('Error', 'El correo y la confirmación no coinciden.');
        setSubmitting(false);
        return;
      }
      if (!normalizedPassword || normalizedPassword.length < 6) {
        Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres.');
        setSubmitting(false);
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert('Error', 'La contraseña y la confirmación no coinciden.');
        setSubmitting(false);
        return;
      }
    }

    setLoading(true);
    try {
      if (!isLogin) {
        const fullName = name.trim();
        const SUPABASE_URL_FALLBACK = 'https://sejhpjfzznskhmbifrum.supabase.co';
        const base = process.env.EXPO_PUBLIC_SUPABASE_URL ?? SUPABASE_URL_FALLBACK;
        console.log('[NETTEST] base', base);
        try {
          const r = await fetch(`${base}/rest/v1/`, {
            method: 'GET',
            headers: { apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '' },
          });
          console.log('[NETTEST] rest status', r.status);
        } catch (e: any) {
          console.log('[NETTEST] rest fetch failed', e?.message ?? String(e));
        }

        console.log('[SIGNUP] starting', { email: normalizedEmail });
        let data: any;
        let error: any;
        try {
          const result = await supabase.auth.signUp({
            email: normalizedEmail,
            password: normalizedPassword,
            options: {
              data: {
                full_name: fullName || null,
                signup_intent: 'owner',
                signup_method: 'password',
              },
            },
          });
          data = result.data;
          error = result.error;
        } catch (signUpErr: any) {
          console.log('[SIGNUP] error', {
            message: signUpErr?.message,
            status: signUpErr?.status,
            name: signUpErr?.name,
          });
          if (
            signUpErr instanceof TypeError &&
            (String(signUpErr?.message ?? '').toLowerCase().includes('network') ||
              String(signUpErr?.message ?? '').includes('Network request failed'))
          ) {
            Alert.alert(
              'Error de red',
              'Error de red en la app (fetch). Revisa DNS privado, fecha/hora automática y vuelve a intentar.'
            );
            setLoading(false);
            return;
          }
          throw signUpErr;
        }
        if (error) {
          console.log('[SIGNUP] error', { message: error?.message, status: error?.status, name: error?.name });
          Alert.alert('Error', error.message);
        } else {
          Alert.alert(
            'Bienvenido a Cellarium',
            'Verifica tu correo para activar tu cuenta y desbloquear todas tus funciones.'
          );
        }
      } else {
        let remainingAttempts = 4;
        try {
          const { data: rateLimitData, error: rateLimitError } = await withTimeout(
            supabase.functions.invoke('rate-limiter', {
              body: { action: 'login', identifier: normalizedEmail },
            }),
            10000,
            'rate-limiter'
          );
          if (rateLimitError?.status === 429 || rateLimitError?.message?.includes('429')) {
            Alert.alert(
              'Demasiados intentos',
              'Has excedido el límite de intentos. Por seguridad, espera unos minutos antes de intentar de nuevo.'
            );
            setLoading(false);
            return;
          }
          if (rateLimitData && !rateLimitData.allowed) {
            Alert.alert(
              'Demasiados intentos',
              'Has excedido el límite de intentos. Por seguridad, espera unos minutos antes de intentar de nuevo.'
            );
            setLoading(false);
            return;
          }
          remainingAttempts = rateLimitData?.remaining ?? 4;
        } catch {
          // Fail open on rate-limiter error
        }

        const { error } = await withTimeout(
          supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password: normalizedPassword,
          }),
          20000,
          'signInWithPassword'
        );

        if (error) {
          Alert.alert(
            'Credenciales inválidas',
            'Correo o contraseña incorrectos. Si no tienes cuenta, regístrate.',
            [{ text: 'OK', onPress: () => setIsLogin(false) }]
          );
        }
      }
    } catch (error: any) {
      if (error instanceof TimeoutError) {
        Alert.alert(
          'Conexión lenta',
          'La operación tardó demasiado. Revisa tu conexión e intenta de nuevo.'
        );
      } else {
        Alert.alert('Credenciales inválidas', 'Correo o contraseña incorrectos.');
      }
    } finally {
      setLoading(false);
      setSubmitting(false);
      if (__DEV__) console.log('[AUTH] submit end');
    }
  };

  const handleGoogleAuth = async () => {
    if (loading) return;
    setLoading(true);
    const redirectTo = 'cellarium://auth-callback';
    if (__DEV__) console.log('[OAUTH] redirectTo:', redirectTo);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
        },
      });
      if (__DEV__) console.log('[OAUTH] data.url exists:', !!data?.url);

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
        redirectTo
      );
      const resultUrl = (result as { url?: string }).url;
      if (__DEV__) {
        console.log('[OAUTH] result.type:', result.type);
        console.log('[OAUTH] result.url exists:', !!resultUrl);
        if (resultUrl) console.log('[OAUTH] callback raw URL:', resultUrl);
      }

      if (result.type === 'cancel' || !resultUrl) {
        setLoading(false);
        return;
      }
      if (result.type !== 'success') {
        setLoading(false);
        return;
      }

      let url: URL;
      try {
        url = new URL(resultUrl);
      } catch {
        if (__DEV__) console.log('[OAuth] invalid callback url');
        Alert.alert('Error', 'No se pudo procesar la respuesta de inicio de sesión.');
        setLoading(false);
        return;
      }

      const errorParam = url.searchParams.get('error');
      if (errorParam) {
        Alert.alert('Error', 'No se pudo completar el inicio de sesión con Google. Intenta de nuevo.');
        setLoading(false);
        return;
      }

      const code = url.searchParams.get('code');
      if (__DEV__) console.log('[OAUTH] has code:', !!code);
      if (code) {
        const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (__DEV__) console.log('[OAuth] exchangeCodeForSession done', { hasSession: !!exchangeData?.session, error: exchangeError?.message ?? null });
        if (exchangeError) {
          Alert.alert('Error', 'No se pudo completar el inicio de sesión con Google. Intenta de nuevo.');
          setLoading(false);
          return;
        }
        if (exchangeData?.session) {
          try {
            await supabase.functions.invoke('ensure-owner-oauth-metadata', {
              headers: { authorization: `Bearer ${exchangeData.session.access_token}` },
            });
          } catch (_) { /* best effort */ }
          setLoading(false);
          return;
        }
      }

      const fragment = url.hash ? url.hash.slice(1) : '';
      const hashParams = new URLSearchParams(fragment);
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      if (__DEV__) console.log('[OAUTH] has access_token:', !!accessToken);
      if (accessToken && refreshToken) {
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (__DEV__) console.log('[OAuth] setSession done', { uid: sessionData?.user?.id ?? null, error: sessionError?.message ?? null });
        if (sessionError) {
          Alert.alert('Error', 'No se pudo completar el inicio de sesión con Google. Intenta de nuevo.');
          setLoading(false);
          return;
        }
        if (sessionData?.session) {
          try {
            await supabase.functions.invoke('ensure-owner-oauth-metadata', {
              headers: { authorization: `Bearer ${sessionData.session.access_token}` },
            });
          } catch (_) { /* best effort */ }
        }
        setLoading(false);
        return;
      }

      if (__DEV__) console.log('[OAuth] callback missing tokens and code', resultUrl);
      Alert.alert('Error', 'No se pudo completar el inicio de sesión con Google. Intenta de nuevo.');
      setLoading(false);
      return;
    } catch (error: any) {
      if (__DEV__) console.log('[OAUTH ERROR]', error?.message);
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
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.formContainer}>
            <View style={styles.header}>
              <Text style={styles.subtitle}>
                {isLogin ? 'Inicia sesión para continuar' : 'Crea tu cuenta como Owner'}
              </Text>
            </View>

            <View style={styles.form}>
              <AppleSignInButton
                disabled={loading || submitting}
                onBusyChange={onAppleBusyChange}
              />
              <TouchableOpacity
                style={[styles.googleButtonContainer, (loading || appleAuthBusy) && styles.buttonDisabled]}
                onPress={handleGoogleAuth}
                disabled={loading || appleAuthBusy}
                activeOpacity={0.8}
              >
                {loading || appleAuthBusy ? (
                  <View style={styles.googleButtonLoading}>
                    <ActivityIndicator size="small" color="#1f2937" />
                  </View>
                ) : (
                  <Image
                    source={require('../../assets/images/android_dark_rd_ctn.png')}
                    style={styles.googleButtonImage}
                    resizeMode="contain"
                  />
                )}
              </TouchableOpacity>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>o usa tu correo</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Orden registro: Nombre → Correo → Confirmar correo → Contraseña → Confirmar contraseña */}
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
                <Text style={styles.inputLabel}>Correo electrónico</Text>
                <TextInput
                  style={styles.input}
                  placeholder="correo@ejemplo.com"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholderTextColor="#9ca3af"
                />
              </View>

              {!isLogin && (
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Confirmar correo</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="correo@ejemplo.com"
                    value={confirmEmail}
                    onChangeText={setConfirmEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    placeholderTextColor="#9ca3af"
                  />
                </View>
              )}

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Contraseña</Text>
                <View style={styles.inputWithIcon}>
                  <TextInput
                    style={styles.inputPassword}
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChangeText={setPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showPassword}
                    placeholderTextColor="#9ca3af"
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword((v) => !v)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off' : 'eye'}
                      size={22}
                      color="#6b7280"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {!isLogin && (
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Confirmar contraseña</Text>
                  <View style={styles.inputWithIcon}>
                    <TextInput
                      style={styles.inputPassword}
                      placeholder="Repite la contraseña"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry={!showConfirmPassword}
                      placeholderTextColor="#9ca3af"
                    />
                    <TouchableOpacity
                      style={styles.eyeButton}
                      onPress={() => setShowConfirmPassword((v) => !v)}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <Ionicons
                        name={showConfirmPassword ? 'eye-off' : 'eye'}
                        size={22}
                        color="#6b7280"
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={[styles.emailButton, (loading || submitting || appleAuthBusy) && styles.buttonDisabled]}
                onPress={handleEmailPasswordAuth}
                disabled={loading || submitting || appleAuthBusy}
              >
                <View style={styles.buttonContent}>
                  {loading && (
                    <ActivityIndicator size="small" color="#fff" style={styles.buttonLoader} />
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

              <TouchableOpacity style={styles.switchButton} onPress={() => setIsLogin(!isLogin)}>
                <Text style={styles.switchButtonText}>
                  {isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const PRIMARY_COLOR = '#924048';

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContainer: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
  },
  formContainer: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
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
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    height: 50,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    color: '#1f2937',
  },
  inputWithIcon: {
    position: 'relative',
    justifyContent: 'center',
  },
  inputPassword: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    paddingRight: 48,
    height: 50,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    color: '#1f2937',
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
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
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginTop: 16,
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
    height: 50,
    marginBottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleButtonImage: {
    width: '100%',
    height: 50,
  },
  googleButtonLoading: {
    width: '100%',
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
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




