import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { User, AuthContextType, UserDataStatus, Branch, normalizeRole } from '../types';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';
import { withTimeout, TimeoutError } from '../utils/withTimeout';
import { captureCriticalError, clearSentryUserContext, setSentryUserContext } from '../utils/sentryContext';
import { resolveDisplayName } from '../utils/resolveDisplayName';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

const USERS_SELECT_COLUMNS = 'id, email, name, role, status, branch_id, owner_id, created_at, updated_at, subscription_plan, subscription_active, subscription_expires_at, subscription_cancel_at_period_end, subscription_branches_count, subscription_branch_addons_count, subscription_id, stripe_customer_id, signup_method, owner_email_verified, billing_provider';

/** Select mínimo para bootstrap rápido; alineado con campos que la UI de suscripción necesita desde el primer paint. */
const USERS_BOOTSTRAP_SELECT =
  'id,email,name,role,status,owner_id,branch_id,created_at,updated_at,subscription_plan,subscription_active,subscription_expires_at,subscription_cancel_at_period_end,subscription_branch_addons_count,subscription_id,stripe_customer_id,signup_method,owner_email_verified,billing_provider';

const HYDRATE_BACKOFF_MS = [300, 600, 1200, 2500, 4000];

/** Suffix del uid para logs (sin PII). */
function uidSuffix(uid: string): string {
  if (!uid || uid.length < 8) return '***';
  return uid.slice(-6);
}

function optimisticUserFromAuth(authUser: any): User {
  const meta = authUser.user_metadata ?? {};
  const username = resolveDisplayName({
    dbName: null,
    metaFullName: meta.full_name,
    metaName: meta.name,
    email: authUser.email ?? null,
  });
  return {
    id: authUser.id,
    email: authUser.email ?? '',
    username,
    role: undefined,
    status: 'loading',
    branch_id: undefined,
    owner_id: authUser.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/** Verifica que exista una fila en public.users para el userId (evita sesiones zombie). Usa cliente canonical src/lib/supabase. */
async function verifyUserProfile(userId: string): Promise<boolean> {
  if (__DEV__) {
    const { data: { session } } = await supabase.auth.getSession();
    console.log('[verifyUserProfile] session user:', session?.user?.id ?? null);
  }
  let data: any = null;
  let error: any = null;
  try {
    const queryPromise = supabase.from('users').select('id').eq('id', userId).maybeSingle();
    const result = await withTimeout(
      Promise.resolve(queryPromise) as Promise<{ data: any; error: any }>,
      4000,
      'verifyUserProfile'
    );
    data = result.data;
    error = result.error;
  } catch (e) {
    if (__DEV__) console.warn('[verifyUserProfile] timeout or error', e);
    return false;
  }
  if (__DEV__) console.log('[verifyUserProfile]', { userId, hasData: !!data, errorCode: (error as any)?.code ?? null });
  if (error) {
    if (__DEV__) console.warn('[verifyUserProfile]', (error as any).code, error.message);
    return false;
  }
  return !!data;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [userDataStatus, setUserDataStatus] = useState<UserDataStatus>('ok');
  const retryCountRef = useRef(0);
  const authSubRef = useRef<{ unsubscribe: () => void } | null>(null);
  const loadUserDataFlightRef = useRef<Promise<void> | null>(null);
  const isSigningOutRef = useRef(false);
  const [profileMissingMessage, setProfileMissingMessage] = useState<string | null>(null);

  const isAbortOrTimeout = (e: unknown) =>
    (e as any)?.name === 'AbortError' ||
    (e as Error)?.message?.includes('loadUserData timeout') ||
    e instanceof TimeoutError;

  const isAuthError = (e: unknown) => {
    const msg = (e as Error)?.message ?? '';
    return /jwt|refresh_token|session|invalid.*token|auth/i.test(String(msg).toLowerCase());
  };

  /** Forced sign-out: limpia sesión local (AsyncStorage) y estado. No lanza. */
  const forcedSignOut = async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (err) {
      if (__DEV__) console.warn('[Auth] forcedSignOut signOut error', err);
    }
    try {
      if (typeof (supabase.auth as any).clearSession === 'function') {
        await (supabase.auth as any).clearSession();
      }
    } catch (_) {
      // clearSession not available or failed; clear known auth keys in AsyncStorage
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const keys = ['supabase.auth.token', 'supabase.auth.token-code-verifier', 'supabase.auth.token-user'];
        for (const key of keys) await AsyncStorage.removeItem(key);
      } catch (__) {}
    }
    setSession(null);
    setUser(null);
    setLoading(false);
    if (__DEV__) console.log('[Auth] forcedSignOut: local session cleared');
  };

  /** Self-healing: crea fila mínima en public.users si no existe (sin deepLink). */
  const ensureUserRow = async (authUser: any) => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (currentSession?.user?.id !== authUser.id) return;
    const { data: existing } = await supabase.from('users').select('id').eq('id', authUser.id).maybeSingle();
    if (existing) return;
    const meta = authUser.user_metadata ?? {};
    const name = resolveDisplayName({
      dbName: null,
      metaFullName: meta.full_name,
      metaName: meta.name,
      email: authUser.email ?? null,
    });
    const invitationType = authUser.user_metadata?.invitationType;
    if (invitationType === 'admin_invite') {
      await supabase.from('users').insert({
        id: authUser.id,
        email: authUser.email ?? '',
        name,
        role: 'personal',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } else {
      // Sin invitationType: flujo típico de registro owner; si en el futuro hay más flujos, ajustar role/status.
      await supabase.from('users').insert({
        id: authUser.id,
        email: authUser.email ?? '',
        name,
        role: 'owner',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  };

  /** Hydrata perfil desde public.users en background; reintentos con backoff. Si data==null tras 2 intentos, ensureUserRow una vez. Si no hay fila al final de reintentos → signOut y mensaje (evitar loop). */
  const hydrateProfile = async (authUser: any) => {
    const uid = authUser?.id;
    if (!uid) return;
    let didEnsureUserRow = false;
    let lastWasNoRow = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        if (__DEV__) console.log('[hydrateProfile] start', uid, 'attempt', attempt + 1);
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession?.user?.id !== uid) return;
        const { data, error } = await supabase
          .from('users')
          .select(USERS_BOOTSTRAP_SELECT)
          .eq('id', uid)
          .maybeSingle();
        if (error) {
          if ((error as any)?.code === 'PGRST116') lastWasNoRow = true;
          throw error;
        }
        if (!data) {
          lastWasNoRow = true;
          if (__DEV__) console.log('[hydrateProfile] done (no row)', uid);
          if (attempt >= 1 && !didEnsureUserRow) {
            didEnsureUserRow = true;
            await ensureUserRow(authUser);
          }
          const delay = HYDRATE_BACKOFF_MS[attempt] ?? 4000;
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        const normalizedRole = normalizeRole(data.role);
        if (__DEV__) {
          const effective = data.subscription_active === true
            && (data.subscription_expires_at == null || new Date(data.subscription_expires_at) > new Date())
            ? (data.subscription_plan ?? 'cafe')
            : 'cafe';
          console.log('[hydrateProfile] done', {
            uid,
            'data.role (raw from DB)': data.role,
            'normalizeRole(data.role)': normalizedRole,
            subscription_plan: data.subscription_plan ?? null,
            subscription_active: data.subscription_active ?? null,
            subscription_expires_at: data.subscription_expires_at ?? null,
            effectivePlan: effective,
          });
        }
        setUserDataStatus('ok');
        setUser((prev) => {
          if (!prev || prev.id !== data.id) return prev;
          return {
            ...prev,
            email: data.email ?? prev.email,
            username: resolveDisplayName({
              dbName: data.name,
              metaFullName: authUser.user_metadata?.full_name,
              metaName: authUser.user_metadata?.name,
              email: data.email ?? authUser.email,
            }),
            role: normalizedRole ?? prev.role,
            status: (data.status as User['status']) ?? 'active',
            branch_id: data.branch_id ?? prev.branch_id,
            owner_id: data.owner_id ?? prev.owner_id,
            created_at: data.created_at ?? prev.created_at,
            updated_at: data.updated_at ?? prev.updated_at,
            subscription_plan: data.subscription_plan ?? prev.subscription_plan,
            subscription_active: data.subscription_active ?? prev.subscription_active,
            subscription_expires_at: data.subscription_expires_at ?? prev.subscription_expires_at,
            subscription_cancel_at_period_end: data.subscription_cancel_at_period_end ?? prev.subscription_cancel_at_period_end,
            subscription_branch_addons_count:
              data.subscription_branch_addons_count ?? prev.subscription_branch_addons_count,
            subscription_id: data.subscription_id ?? prev.subscription_id,
            stripe_customer_id: data.stripe_customer_id ?? prev.stripe_customer_id,
            billing_provider: data.billing_provider ?? prev.billing_provider,
            signup_method: data.signup_method ?? prev.signup_method,
            owner_email_verified: data.owner_email_verified ?? prev.owner_email_verified,
          };
        });
        if (data.branch_id) {
          supabase.from('branches').select('*').eq('id', data.branch_id).maybeSingle()
            .then(({ error: branchError }) => {
              if (branchError && __DEV__) console.warn('[hydrateProfile] branches fetch failed', branchError);
            });
        }
        return;
      } catch (e) {
        if (__DEV__) console.log('[hydrateProfile] fail', uid, (e as Error)?.message ?? String(e));
        if (isAbortOrTimeout(e) && attempt < 4) {
          const delay = HYDRATE_BACKOFF_MS[attempt] ?? 4000;
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        if (lastWasNoRow && attempt < 4) {
          const delay = HYDRATE_BACKOFF_MS[attempt] ?? 4000;
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        return;
      }
    }
    // Agotados los reintentos sin perfil (no row): cerrar sesión y llevar al login para evitar loop
    if (lastWasNoRow) {
      if (isSigningOutRef.current) return;
      isSigningOutRef.current = true;
      setProfileMissingMessage('Tu sesión expiró o tu cuenta ya no existe. Inicia sesión de nuevo.');
      if (__DEV__) console.log('[AUTH_RECOVERY] profile missing -> signOut', uidSuffix(uid));
      try {
        await forcedSignOut();
      } finally {
        isSigningOutRef.current = false;
      }
    }
  };

  // Single bootstrap path: onAuthStateChange (including INITIAL_SESSION) only
  useEffect(() => {
    if (authSubRef.current) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, authSession) => {
        try {
          if (isSigningOutRef.current) {
            setSession(null);
            setUser(null);
            setLoading(false);
            return;
          }
          if (__DEV__) {
            console.log('[Auth] event:', event);
            console.log('[Auth] authSession user:', authSession?.user?.id ?? null);
            console.log('[Auth] authSession email:', authSession?.user?.email ?? null);
          }
          if (!authSession?.user) {
            setSession(null);
            setUser(null);
            setLoading(false);
            return;
          }

          if (event === 'TOKEN_REFRESHED') {
            setSession(authSession);
            setLoading(false);
            return;
          }

          if (event === 'INITIAL_SESSION') {
            if (__DEV__) console.log('[AUTH] event INITIAL_SESSION');
            setSession(authSession);
            setUser(optimisticUserFromAuth(authSession.user));
            setLoading(false);
            loadUserData(authSession.user).catch(() => {});
            return;
          }

          if (event === 'SIGNED_IN') {
            if (__DEV__) console.log('[AUTH] event SIGNED_IN');
            setSession(authSession);
            setUser(optimisticUserFromAuth(authSession.user));
            setLoading(false);
            loadUserData(authSession.user).catch(() => {});
            return;
          }

          setSession(authSession);
          setLoading(false);
        } catch (err) {
          if (__DEV__) console.warn('[Auth] onAuthStateChange error', err);
          captureCriticalError(err, {
            feature: 'auth_bootstrap',
            app_area: 'auth',
          });
          await forcedSignOut();
        } finally {
          setLoading(false);
        }
      }
    );
    authSubRef.current = subscription;

    return () => {
      authSubRef.current?.unsubscribe();
      authSubRef.current = null;
    };
  }, []);

  /** Solo para deepLink: asegura que exista fila en public.users (insert o createOwnerUser), luego hydrate. */
  const ensureDeepLinkUser = async (authUser: any) => {
    let { data: userRow, error: userError } = await supabase
      .from('users')
      .select(USERS_BOOTSTRAP_SELECT)
      .eq('id', authUser.id)
      .maybeSingle();
    let userData: any = userRow;
    if (!userData && !userError) {
      const meta = authUser.user_metadata ?? {};
      const resolvedName = resolveDisplayName({
        dbName: null,
        metaFullName: meta.full_name,
        metaName: meta.name,
        email: authUser.email ?? null,
      });
      const { data: createdUser, error: createError } = await supabase
        .from('users')
        .insert({
          id: authUser.id,
          email: authUser.email,
          name: resolvedName,
          role: 'owner',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select(USERS_BOOTSTRAP_SELECT)
        .single();
      if (createError) {
        userData = {
          id: authUser.id,
          email: authUser.email,
          name: resolvedName,
          role: 'owner',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      } else {
        userData = createdUser;
      }
    }
    if (userError && userError.code === 'PGRST116') {
      await createOwnerUser(authUser);
      return;
    }
    if (userError) throw userError;
    if (!userData) throw new Error('no user row');
  };

  const loadUserDataImpl = async (authUser: any, deepLinkUrl?: string) => {
    if (__DEV__) console.log('[loadUserData] start', authUser.id);
    setUser(optimisticUserFromAuth(authUser));
    setLoading(false);
    setUserDataStatus('loading');
    if (deepLinkUrl) {
      ensureDeepLinkUser(authUser)
        .then(() => hydrateProfile(authUser))
        .catch((e) => {
          if (isAuthError(e)) forcedSignOut();
          else hydrateProfile(authUser);
        });
    } else {
      hydrateProfile(authUser);
    }
  };

  const loadUserData = async (authUser: any, deepLinkUrl?: string) => {
    const inFlight = loadUserDataFlightRef.current;
    if (inFlight) {
      await inFlight;
      return;
    }
    const promise = loadUserDataImpl(authUser, deepLinkUrl);
    loadUserDataFlightRef.current = promise;
    try {
      await promise;
    } finally {
      loadUserDataFlightRef.current = null;
    }
  };

  const createOwnerUser = async (authUser: any) => {
    try {
      const meta = authUser.user_metadata ?? {};
      const resolvedName = resolveDisplayName({
        dbName: null,
        metaFullName: meta.full_name,
        metaName: meta.name,
        email: authUser.email ?? null,
      });
      const insertUserPromise = supabase.from('users').insert({
        id: authUser.id,
        email: authUser.email,
        name: resolvedName,
        role: 'owner',
        signup_method: 'password',
        owner_email_verified: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).select().single();

      // Timeout de 30 segundos para la inserción
      const insertTimeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout en inserción de usuario')), 30000)
      );

      let userData, userError;
      try {
        const result = await Promise.race([insertUserPromise, insertTimeoutPromise]) as any;
        userData = result.data;
        userError = result.error;
      } catch (timeoutError) {
        try {
          // Timeout corto para cargar usuario recién creado
          const loadUserPromise = supabase
            .from('users')
            .select('*')
            .eq('id', authUser.id)
            .single();
          
          const loadTimeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout en carga de usuario')), 3000)
          );
          
          const { data: createdUser, error: loadError } = await Promise.race([
            loadUserPromise,
            loadTimeoutPromise
          ]) as any;
          
          if (createdUser && !loadError) {
            userData = createdUser;
            userError = null;
          } else {
            userError = { code: 'TIMEOUT' };
            userData = null;
          }
        } catch {
          userError = { code: 'TIMEOUT' };
          userData = null;
        }
      }

      if (userError) {
        if (userError.code === 'TIMEOUT') {
          userData = {
            id: authUser.id,
            email: authUser.email,
            name: resolvedName,
            role: 'owner',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          userError = null;
        } else {
          throw userError;
        }
      }

      let branchData = null;
      try {
        branchData = await createDefaultBranch(authUser.id, userData.name);
      } catch (branchError) {
        if (__DEV__) console.warn('[createOwnerUser] createDefaultBranch', (branchError as Error)?.message);
        throw branchError;
      }

      if (branchData) {
        try {
          await supabase
            .from('users')
            .update({ branch_id: branchData.id })
            .eq('id', authUser.id);
        } catch (updateError) {
          if (__DEV__) console.warn('[createOwnerUser] update branch_id', (updateError as Error)?.message);
        }
      }
      
      // Establecer el usuario y sucursal en el estado (normalizando rol)
      const appUser: User = {
        id: userData.id,
        email: userData.email,
        username: resolveDisplayName({
          dbName: userData.name,
          metaFullName: meta.full_name,
          metaName: meta.name,
          email: userData.email ?? authUser.email,
        }),
        role: normalizeRole(userData.role),
        status: 'active',
        branch_id: branchData?.id ?? undefined,
        owner_id: undefined,
        created_at: userData.created_at,
        updated_at: userData.updated_at,
      };
      setUser(appUser);

      // La sucursal será manejada por BranchContext

    } catch (error) {
      if (__DEV__) console.warn('[createOwnerUser]', (error as Error)?.message);
      throw error;
    }
  };

  const createDefaultBranch = async (ownerId: string, ownerName: string) => {
    try {
      
      // Generar un UUID válido usando una función simple
      const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      };
      
      const branchId = generateUUID();
      
      const insertPromise = supabase.from('branches').insert({
        id: branchId,
        name: `${ownerName} - Sucursal Principal`,
        address: 'Dirección por definir',
        owner_id: ownerId,
        is_main: true, // Marcar como sucursal principal
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).select().single();

      // Timeout de 8 segundos para la inserción
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => {
          reject(new Error('Timeout en inserción de sucursal'));
        }, 8000)
      );

      let branchData, branchError;
      try {
        const result = await Promise.race([insertPromise, timeoutPromise]) as any;
        branchData = result.data;
        branchError = result.error;
      } catch (timeoutError) {
        branchData = {
          id: `temp-${ownerId}`,
          name: `${ownerName} - Sucursal Principal`,
          address: 'Dirección por definir',
          phone: '',
          email: '',
          owner_id: ownerId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        branchError = null;
      }

      if (branchError) throw branchError;
      return branchData;

    } catch (error) {
      if (__DEV__) console.warn('[createDefaultBranch]', (error as Error)?.message);
      throw error;
    }
  };

  const signIn = async (email: string, password: string) => {
    setProfileMissingMessage(null);
    try {
      setLoading(true);
      
      // Verificar que la contraseña no esté vacía
      if (!password || password.trim().length === 0) {
        throw new Error('La contraseña no puede estar vacía');
      }
      
      // Limpiar espacios al inicio y fin de la contraseña
      const cleanPassword = password.trim();
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(), // Normalizar email
        password: cleanPassword,
      });

      if (error) {
        throw error;
      }
      
      if (!data.user) {
        throw new Error('No se pudo obtener información del usuario');
      }
      
      // loadUserData se ejecutará automáticamente por el listener
      
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setLoading(true);
      await supabase.auth.signOut();
    } catch (error) {
      if (__DEV__) console.warn('[Auth] signOut error', error);
    } finally {
      setSession(null);
      setUser(null);
      setLoading(false);
    }
  };

  const refreshUserData = async () => {
    if (!session?.user) return;
    try {
      setLoading(true);
      await loadUserData(session.user);
    } catch (err) {
      if (__DEV__) console.warn('[Auth] refreshUserData error', err);
      captureCriticalError(err, {
        feature: 'auth_bootstrap',
        app_area: 'auth',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userDataStatus === 'ok' && user) {
      setSentryUserContext(user);
    } else if (!user) {
      clearSentryUserContext();
    }
  }, [user, userDataStatus]);

  /** Referencia estable: evita que useFocusEffect([refreshUser]) vuelva a ejecutarse tras cada setUser (p. ej. Suscripciones). */
  const refreshUser = useCallback(async () => {
    try {
      // Obtener sesión actual
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      if (!currentSession?.user) return;

      // Leer usuario desde public.users (columnas mínimas)
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select(USERS_SELECT_COLUMNS)
        .eq('id', currentSession.user.id)
        .maybeSingle();

      if (userError || !userData) return;

      setUserDataStatus('ok');
      setUser((prev) => {
        const plan = userData.subscription_plan ?? prev?.subscription_plan;
        const rawBranches = userData.subscription_branches_count ?? prev?.subscription_branches_count;
        const subscription_branches_count = rawBranches ?? undefined;
        return {
          id: userData.id,
          email: userData.email,
          username: resolveDisplayName({
            dbName: userData.name,
            metaFullName: currentSession.user.user_metadata?.full_name,
            metaName: currentSession.user.user_metadata?.name,
            email: userData.email ?? currentSession.user.email,
          }),
          role: normalizeRole(userData.role),
          status: userData.status || 'active',
          branch_id: userData.branch_id,
          owner_id: userData.owner_id,
          created_at: userData.created_at,
          updated_at: userData.updated_at,
          subscription_plan: plan ?? undefined,
          subscription_active: userData.subscription_active ?? prev?.subscription_active,
          subscription_expires_at: userData.subscription_expires_at ?? prev?.subscription_expires_at,
          subscription_cancel_at_period_end: userData.subscription_cancel_at_period_end ?? prev?.subscription_cancel_at_period_end,
          subscription_branches_count,
          subscription_branch_addons_count: userData.subscription_branch_addons_count ?? prev?.subscription_branch_addons_count,
          subscription_id: userData.subscription_id ?? prev?.subscription_id,
          stripe_customer_id: userData.stripe_customer_id ?? prev?.stripe_customer_id,
          billing_provider: userData.billing_provider ?? prev?.billing_provider,
          signup_method: userData.signup_method ?? prev?.signup_method,
          owner_email_verified: userData.owner_email_verified ?? prev?.owner_email_verified,
        };
      });
    } catch (error) {
      if (__DEV__) console.warn('[refreshUser]', (error as Error)?.message);
      captureCriticalError(error, {
        feature: 'auth_bootstrap',
        app_area: 'auth',
      });
    }
  }, []);

  const value: AuthContextType = {
    user,
    loading,
    session,
    userDataStatus,
    profileReady: userDataStatus === 'ok',
    profileMissingMessage,
    signIn,
    signOut,
    refreshUser,
    refreshUserData,
    currentBranch: null,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
