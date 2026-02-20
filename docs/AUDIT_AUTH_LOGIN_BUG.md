# Auditoría: Bug "Iniciando sesión..." con usuario nuevo (Expo + Supabase Auth)

## ARCHIVOS

| Rol | Ruta exacta |
|-----|-------------|
| Contexto de auth | `src/contexts/AuthContext.tsx` |
| Pantalla Login/Registro (email + OAuth) | `src/screens/AuthScreen.tsx` |
| Pantalla Registro admin (QR) | `src/screens/AdminRegistrationScreen.tsx` |
| Wrapper que decide Auth vs App | `src/screens/AppAuthWrapper.tsx` |
| Bootstrap (splash + redirección por sesión) | `src/screens/BootstrapScreen.tsx` |
| Cliente Supabase | `src/lib/supabase.ts` |
| Helpers Supabase (getUserById, createUser) | `src/lib/supabaseDirect.ts` |
| Welcome (Iniciar sesión / Registrarse) | `src/screens/WelcomeScreen.tsx` |

No hay servicios `auth*` ni hooks dedicados; la lógica está en AuthContext y en las pantallas.

---

## CODE EXCERPTS

### 1) AuthScreen.tsx – Botón "Iniciar sesión" y loading

El botón que muestra "Iniciando sesión..." o "Creando cuenta..." llama a **`handleEmailPasswordAuth`**:

```tsx
// Líneas ~410-431
<TouchableOpacity
  onPress={handleEmailPasswordAuth}
  disabled={loading}
>
  ...
  <Text style={styles.emailButtonText}>
    {loading
      ? isLogin
        ? 'Iniciando sesión...'
        : 'Creando cuenta...'
      : isLogin ? 'Iniciar sesión con correo' : 'Registrarse con correo'}
  </Text>
</TouchableOpacity>
```

### 2) AuthScreen.tsx – handleEmailPasswordAuth (resumen)

- **Registro (`!isLogin`):** `supabase.auth.signUp(...)`. Si error → Alert. Si no → Alert "Revisa tu email para confirmar". **No** se llama `onAuthSuccess()`. `finally` hace `setLoading(false)`.
- **Login (`isLogin`):**
  - Normaliza email o resuelve username vía RPC `get_user_email_by_username`.
  - Invoca Edge Function `rate-limiter` (login).
  - Llama **`supabase.auth.signInWithPassword({ email: authEmail, password: cleanPassword })`**.
  - Si **error** → Alert (credenciales inválidas u otro) y no hace `return` → se ejecuta `finally` → `setLoading(false)`.
  - Si **éxito** → `onAuthSuccess()` y luego `finally` → `setLoading(false)`.

No hay fallback "si falla login entonces signUp". Solo se usa **signInWithPassword** en modo login.

Posibles puntos donde el loading podría no apagarse:

- Cualquier `return` dentro del `try` (p. ej. después de Alert por username no encontrado o por rate limit) **sí** pasa por `finally`, así que en principio `setLoading(false)` siempre se ejecuta.
- Si `signInWithPassword` o `rate-limiter` **no resuelven** (red/colgado), el `try` no termina y nunca se llega a `finally` → loading se quedaría en `true`.

### 3) AuthContext.tsx – onAuthStateChange (resumen)

- **Sin sesión:** `setSession(null)`, `setUser(null)`, `setLoading(false)` y return.
- **TOKEN_REFRESHED:** `setSession(authSession)`, `setLoading(false)`, return (no se hace comprobación de perfil).
- **INITIAL_SESSION:** `setSession(authSession)`, **una sola** `verifyUserProfile(userId)`. Si existe perfil → `loadUserData(authSession.user)`. Si no existe → `setUser(null)`, `setLoading(false)`, return (no forcedSignOut).
- **SIGNED_IN:** `setSession(authSession)`, **waitForProfile(userId, 5, 800)**. Si no hay perfil tras reintentos → `forcedSignOut()`. Si hay perfil → `loadUserData(authSession.user)`.
- **Resto de eventos:** `setSession(authSession)`, `setLoading(false)`.
- **catch:** `forcedSignOut()`.
- **finally:** siempre `setLoading(false)`.

No hay navegación directa en AuthContext; la navegación la hace **BootstrapScreen** y **AppAuthWrapper** según `user` y `loading` del contexto.

### 4) AuthContext – verifyUserProfile y waitForProfile

- **verifyUserProfile(userId):** consulta `public.users` por `id`, devuelve `true`/`false`. En error de Supabase devuelve `false` y en DEV loguea.
- **waitForProfile(userId, 5, 800):** hasta 5 intentos con 800 ms entre ellos llamando a `verifyUserProfile`. Si en alguno existe perfil → `true`; si no → `false`.

### 5) AppAuthWrapper – decisión de qué mostrar

```tsx
if (loading) {
  return <View>...<ActivityIndicator /></View>;  // Spinner full-screen, sin texto
}
if (!user) {
  return <AuthScreen onAuthSuccess={() => {}} ... />;
}
return <AppNavigator />;
```

`onAuthSuccess` en este flujo es **no-op**: no navega. El cambio de pantalla ocurre cuando `user` deja de ser null (tras `loadUserData` en AuthContext).

### 6) Registro con email/pass – confirmación de correo

Tras `signUp`:

- Si **error** → Alert con `error.message` y `finally` → `setLoading(false)`.
- Si **no error** → Alert "Usuario registrado. Revisa tu email para confirmar la cuenta." y `finally` → `setLoading(false)`.

No se comprueba `data.session`. Si en el proyecto está desactivada la confirmación de email, Supabase puede devolver sesión inmediata y disparar **SIGNED_IN**; entonces AuthContext hace waitForProfile/loadUserData. Si el trigger que crea `public.users` va con retraso, puede no haber fila aún → reintentos o forcedSignOut. No hay mensaje explícito "confirma tu correo" en código; el texto fijo es "Revisa tu email para confirmar la cuenta." y no hay loading infinito en este bloque (siempre hay `finally`).

---

## HALLAZGOS

- **Login no crea usuarios:** En la pantalla de login solo se usa **signInWithPassword**. No hay llamada a `signUp` ni lógica "si falla login entonces registrarme".
- **Origen del texto "Iniciando sesión...":** Es el estado del **botón** de AuthScreen cuando `loading === true` y `isLogin === true`. Si la pantalla que queda fija es la del botón, entonces **AuthScreen.loading** no se pone en `false` (p. ej. porque el `try` de `handleEmailPasswordAuth` no termina). Si lo que se ve es un spinner a pantalla completa sin botón, es **AuthContext.loading** (AppAuthWrapper).
- **Posible causa del usuario creado:** El usuario puede haberse creado por: (1) Registro en la misma app (signUp o OAuth), (2) OAuth en otra sesión, o (3) trigger en BD al crear en `auth.users`. No por el flujo de "Iniciar sesión" con email/contraseña.
- **Causa más probable del “se queda en Iniciando sesión…”:**  
  - **A)** `signInWithPassword` o la llamada a `rate-limiter` **no resuelve** (red/timeout) → el `try` no termina → `finally` no corre → **AuthScreen.loading** se queda en `true`.  
  - **B)** Login **sí** termina bien, se llama `onAuthSuccess()` (no-op) y AuthScreen hace `setLoading(false)`, pero **AuthContext** recibe SIGNED_IN y entra en waitForProfile/loadUserData. Mientras tanto **AuthContext.loading** sigue en `true` → AppAuthWrapper muestra el **spinner** (que el usuario puede describir como "Iniciando sesión"). Si no hay fila en `public.users` (trigger lento o usuario creado por otro flujo sin perfil), waitForProfile falla → forcedSignOut → se vuelve a AuthScreen. Si loadUserData se cuelga o tarda más de lo esperado, el spinner se alarga.
- **Registro (signUp):** Siempre se hace `setLoading(false)` en `finally`. Si la confirmación está desactivada y hay sesión, el flujo posterior depende de onAuthStateChange (SIGNED_IN) y de que exista fila en `public.users`.

---

## CAMBIOS MÍNIMOS RECOMENDADOS

- [ ] **AuthScreen – handleEmailPasswordAuth (Login)**  
  - Tras error de `signInWithPassword`, si es "Invalid login credentials" (o equivalente), mostrar mensaje tipo: "Cuenta no encontrada. Si no tienes cuenta, regístrate." y no intentar signUp.  
  - Asegurar que **todos** los `return` dentro del `try` que salgan por error/validación sigan dejando que se ejecute `finally` (ya ocurre; no añadir returns que eviten el `finally`).  
  - Opcional: timeout alrededor de `signInWithPassword` (p. ej. Promise.race con 15–20 s) para que, si la red cuelga, se entre al catch y en `finally` se haga `setLoading(false)`.

- [ ] **AuthScreen – handleEmailPasswordAuth (Registro)**  
  - Tras `signUp` sin error, si `data.session == null` (confirmación de email activa), además del Alert actual, asegurar explícitamente `setLoading(false)` en ese ramal (por si en el futuro se añade lógica que no pase por `finally`).  
  - Mantener un solo mensaje tipo "Revisa tu email para confirmar la cuenta" y no dejar loading en true.

- [ ] **AuthScreen – handleGoogleAuth**  
  - Mantener el flujo actual: `signInWithOAuth` → `WebBrowser.openAuthSessionAsync` → parsear tokens → `setSession` → en éxito `setLoading(false)` y return; en todos los demás casos `finally` con `setLoading(false)`.  
  - No llamar a `onAuthSuccess()` desde aquí; dejar que AuthContext (SIGNED_IN) y loadUserData marquen el usuario y que AppAuthWrapper reaccione a `user`.

- [ ] **AppAuthWrapper**  
  - No depender de `onAuthSuccess` para navegar; la transición a la app debe ser solo cuando `user !== null` (ya es así). Opcional: si se quiere feedback inmediato al login exitoso, se podría llamar a un callback que solo muestre un breve "Entrando..." sin cambiar la condición `!user` hasta que AuthContext tenga `user` y `loading === false`.

- [ ] **AuthContext**  
  - Ya tiene `setLoading(false)` en finally de onAuthStateChange y en loadUserData. Revisar que no exista ninguna rama (p. ej. dentro de loadUserData o createOwnerUser) que pueda lanzar sin pasar por el `finally` del handler que corresponda.

- [ ] **AdminRegistrationScreen – handleGoogleAuth**  
  - Misma idea que en AuthScreen: asegurar `setGoogleLoading(false)` en éxito y en `finally` en todos los caminos (ya está).

---

## PSEUDOCÓDIGO RECOMENDADO

### handleLoginEmailPassword (AuthScreen)

```text
function handleLoginEmailPassword() {
  if (!email || !password) { Alert; return; }
  setLoading(true);
  try {
    authEmail = resolveEmailOrUsername(email);  // RPC si es username
    rateLimitCheck(authEmail);
    const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password });
    if (error) {
      if (invalidCredentials(error))
        Alert('Credenciales inválidas', 'Si no tienes cuenta, regístrate.');
      else
        Alert('Error', error.message);
      return;
    }
    onAuthSuccess();  // opcional; la UI ya cambia por AuthContext.user
  } catch (e) {
    Alert('Error', e.message ?? 'Error desconocido');
  } finally {
    setLoading(false);
  }
}
```

### handleRegisterEmailPassword (AuthScreen)

```text
function handleRegisterEmailPassword() {
  if (!email || !password) { Alert; return; }
  setLoading(true);
  try {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name } } });
    if (error) {
      Alert('Error', error.message);
      return;
    }
    if (data?.session)
      Alert('Éxito', 'Cuenta creada. Redirigiendo...');
    else
      Alert('Éxito', 'Revisa tu email para confirmar la cuenta.');
  } catch (e) {
    Alert('Error', e.message ?? 'Error desconocido');
  } finally {
    setLoading(false);
  }
}
```

### handleGoogleOAuth (Login y Registro)

```text
function handleGoogleOAuth() {
  if (loading) return;
  setLoading(true);  // o setGoogleLoading(true) en AdminRegistration
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '...' } });
    if (error) { Alert; return; }
    if (!data?.url) return;
    const result = await WebBrowser.openAuthSessionAsync(data.url, 'cellarium://auth-callback');
    if (result.type !== 'success' || !result.url) return;
    const { access_token, refresh_token } = parseFragment(result.url);
    if (!access_token || !refresh_token) { Alert('...'); return; }
    const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
    if (sessionError) { Alert(sessionError.message); return; }
    setLoading(false);
    return;
  } catch (e) {
    Alert('Error', e.message ?? '...');
  } finally {
    setLoading(false);
  }
}
```

Regla común: en **todos** los handlers (login, registro, OAuth), usar **try/catch/finally** y en **finally** (o en cada rama de error antes de return) asegurar **setLoading(false)** (o setGoogleLoading(false)) para que ni AuthScreen ni el spinner de AppAuthWrapper se queden colgados.

---

## RESUMEN

- **Login no crea usuarios;** solo usa `signInWithPassword`.
- El texto "Iniciando sesión..." viene del botón de AuthScreen cuando su `loading` es true; el spinner a pantalla completa viene de AuthContext.loading en AppAuthWrapper.
- La causa más probable del bloqueo es: (A) que `signInWithPassword` (o rate-limiter) no resuelva y no se ejecute `finally`, o (B) que AuthContext.loading se quede en true por waitForProfile/loadUserData (perfil ausente o lento).
- Cambios mínimos: mensaje claro en login cuando las credenciales son inválidas ("ve a Registro"), timeout opcional a signInWithPassword, y garantizar en todos los flujos (login, registro, OAuth) que **siempre** se ejecute **setLoading(false)** en finally o en cada salida de error.
