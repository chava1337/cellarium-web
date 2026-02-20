# 🔍 DIAGNÓSTICO: Autenticación y Persistencia de Sesión

## 1️⃣ SISTEMA DE NAVEGACIÓN

**✅ Usa React Navigation (NO Expo Router)**
- Archivo de entrada: `App.tsx`
- Stack Navigator con `createStackNavigator` de `@react-navigation/stack`
- Ruta inicial: `initialRouteName="Welcome"` (línea 69 de App.tsx)

**Flujo actual:**
```
App.tsx (initialRouteName="Welcome")
  └─> WelcomeScreen (siempre se muestra primero)
       └─> Usuario navega manualmente a AppAuth
            └─> AppAuthWrapper
                 ├─> Si loading: ActivityIndicator
                 ├─> Si !user: AuthScreen
                 └─> Si user: AppNavigator (initialRouteName="WineCatalog")
```

## 2️⃣ AUTENTICACIÓN

**✅ Usa Supabase Auth**
- Configuración: `src/lib/supabase.ts` y `src/config/supabase.ts`
- Cliente configurado con `AsyncStorage` para persistencia (líneas 10-16 de `lib/supabase.ts`)
- AuthProvider: `src/contexts/AuthContext.tsx`

**Cómo se obtiene el usuario:**
1. **Al cargar la app** (líneas 28-38 de AuthContext.tsx):
   - `supabase.auth.getSession()` obtiene sesión inicial
   - Si hay sesión → `loadUserData(session.user)`
   - Si no hay sesión → `setLoading(false)`

2. **Listener de cambios** (líneas 41-56):
   - `supabase.auth.onAuthStateChange()` escucha cambios
   - Si hay sesión → carga datos del usuario
   - Si no hay sesión → limpia estado

**✅ Persistencia configurada:**
- `storage: AsyncStorage` en configuración de Supabase (línea 12 de `lib/supabase.ts`)
- `autoRefreshToken: true` (línea 13)
- `persistSession: true` (línea 14)

## 3️⃣ PERSISTENCIA DE SESIÓN

**✅ Ya está implementada:**
- Supabase usa `AsyncStorage` automáticamente
- La sesión se persiste en `AsyncStorage` por Supabase
- `getSession()` debería recuperar la sesión al reiniciar

**⚠️ PROBLEMA DETECTADO:**
- El flujo actual NO verifica la sesión persistida antes de mostrar `WelcomeScreen`
- `App.tsx` siempre inicia en `Welcome`, sin importar si hay sesión
- `AuthContext` carga la sesión en background, pero la UI ya mostró `Welcome`

## 4️⃣ FLUJO ACTUAL

**Cuando abro la app:**
1. `App.tsx` renderiza `AppContent` con `initialRouteName="Welcome"`
2. `WelcomeScreen` se muestra inmediatamente
3. `AuthContext` se monta y ejecuta `getSession()` en background
4. Si hay sesión → `loadUserData()` se ejecuta
5. `AppAuthWrapper` verifica `user` y `loading`, pero solo se muestra si navegas a `AppAuth`

**Rutas principales:**
- `Welcome`: Pantalla inicial (siempre se muestra primero)
- `AppAuth`: Wrapper que decide entre `AuthScreen` o `AppNavigator`
- `AppNavigator`: Navegador principal (solo si `user` existe)
- `WineCatalog`: Pantalla principal del catálogo

**❌ NO existe pantalla Splash animada con Rive:**
- Hay assets en `assets/anim/splash_cellarium.riv` pero no se usa
- No hay componente `SplashScreen.tsx`

## 5️⃣ QUÉ FALTA PARA AUTO-LOGIN

1. **Bootstrap/Verificación inicial:**
   - Esperar a que `AuthContext` termine de verificar sesión (`loading === false`)
   - NO mostrar `WelcomeScreen` si hay sesión válida
   - Redirigir automáticamente a `AppNavigator` si hay usuario

2. **Rutas protegidas:**
   - `AppNavigator` ya está protegido (solo se muestra si `user` existe)
   - Pero `WelcomeScreen` no está protegida (cualquiera puede verla)

3. **Pantalla de carga inicial:**
   - Mostrar un loader mientras se verifica la sesión
   - Evitar mostrar `WelcomeScreen` si hay sesión

## 6️⃣ PLAN DE IMPLEMENTACIÓN

### Opción A: Bootstrap en App.tsx (RECOMENDADA)
1. Crear componente `BootstrapScreen` que:
   - Muestra loader mientras `loading === true`
   - Si `user` existe → redirige a `AppNavigator`
   - Si `!user && !loading` → muestra `WelcomeScreen`
2. Modificar `App.tsx` para usar `BootstrapScreen` como ruta inicial
3. Mantener `AppAuthWrapper` para flujo de login/registro

### Opción B: Modificar AppAuthWrapper
1. Hacer que `AppAuthWrapper` sea la ruta inicial
2. Si `loading` → mostrar loader
3. Si `user` → mostrar `AppNavigator`
4. Si `!user` → mostrar `WelcomeScreen` o `AuthScreen` según contexto

**✅ Elegiré Opción A** porque:
- Separa responsabilidades (bootstrap vs auth)
- Más fácil de mantener
- Permite agregar Splash animado después

## 7️⃣ CAMBIOS MÍNIMOS REQUERIDOS

1. **Crear `BootstrapScreen.tsx`:**
   - Componente que verifica `user` y `loading` de `AuthContext`
   - Muestra loader durante verificación
   - Redirige según estado

2. **Modificar `App.tsx`:**
   - Cambiar `initialRouteName` de `"Welcome"` a `"Bootstrap"`
   - Agregar `BootstrapScreen` al Stack

3. **Actualizar `RootStackParamList`:**
   - Agregar `Bootstrap: undefined` a los tipos

4. **Opcional: Mejorar loader:**
   - Usar `CellariumLoader` si existe
   - O crear loader simple con ActivityIndicator

## 8️⃣ VALIDACIÓN

Después de implementar:
- ✅ Al abrir app con sesión válida → debe ir directo a `WineCatalog`
- ✅ Al abrir app sin sesión → debe mostrar `WelcomeScreen`
- ✅ Al hacer logout → debe volver a `WelcomeScreen`
- ✅ No debe haber flicker ni pantallas intermedias

