# ✅ SOLUCIÓN DEFINITIVA: Integración Rive en Expo RN

## 📋 DIAGNÓSTICO

### Entorno Detectado:
- **Tipo de build**: Development Build (NO Expo Go)
- **Razón**: `expo-dev-client@6.0.15` está instalado en `package.json`
- **Módulo nativo**: `rive-react-native@9.7.1` requiere código nativo
- **Archivo Rive**: `assets/anim/splash_cellarium.riv` ✅ (confirmado)

### Problemas Identificados:
1. ❌ Ruta incorrecta: `../../assets/anim/` (debería ser `../../../assets/anim/`)
2. ❌ API incorrecta: Usaba `src` y `Asset.fromModule()`, pero Rive acepta `source` con `require()`
3. ✅ Metro config: Ya tiene `.riv` en `assetExts` ✅

## 📝 ARCHIVOS MODIFICADOS

1. **`src/screens/BootstrapScreen.tsx`** (corregido)
   - Ruta corregida: `../../../assets/anim/splash_cellarium.riv`
   - API corregida: `source={require(...)}` en lugar de `src` o `Asset.fromModule()`
   - Agregado fallback con `ActivityIndicator` si Rive falla
   - Agregado `onError` handler

2. **`metro.config.js`** (ya estaba correcto)
   - ✅ `.riv` ya está en `assetExts`

## 💻 CÓDIGO FINAL

### `src/screens/BootstrapScreen.tsx`:

```typescript
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types';
import Rive from 'rive-react-native';

type BootstrapScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Bootstrap'>;

interface Props {
  navigation: BootstrapScreenNavigationProp;
}

const BootstrapScreen: React.FC<Props> = ({ navigation }) => {
  const { user, loading } = useAuth();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [riveError, setRiveError] = React.useState(false);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!loading) {
      const delay = 300;
      
      timeoutRef.current = setTimeout(() => {
        if (user) {
          navigation.reset({
            index: 0,
            routes: [{ name: 'AppAuth' }],
          });
        } else {
          navigation.reset({
            index: 0,
            routes: [{ name: 'Welcome' }],
          });
        }
      }, delay);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [user, loading, navigation]);

  return (
    <View style={styles.container}>
      {riveError ? (
        <ActivityIndicator size="large" color="#8B0000" />
      ) : (
        <Rive
          source={require('../../../assets/anim/splash_cellarium.riv')}
          autoplay={true}
          style={styles.rive}
          onError={(error) => {
            console.error('Error en Rive:', error);
            setRiveError(true);
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111111',
  },
  rive: {
    width: '100%',
    height: '100%',
  },
});

export default BootstrapScreen;
```

### `metro.config.js` (verificación):

```javascript
// Agregar extensión .riv como asset source
config.resolver.assetExts.push('riv');
```

✅ Ya está configurado correctamente.

## 🔧 API DE RIVE-REACT-NATIVE (v9.7.1)

Según los tipos en `node_modules/rive-react-native/lib/typescript/Rive.d.ts`:

El componente `Rive` acepta:
- ✅ `source: number | { uri: string }` - Para `require()` o URI
- ✅ `resourceName: string` - Para assets nativos (Android/iOS)
- ✅ `url: string` - Para URLs remotas
- ✅ `autoplay?: boolean` - Para autoplay
- ✅ `onError?: (error) => void` - Para manejo de errores

**Solución elegida**: `source={require('../../../assets/anim/splash_cellarium.riv')}`
- Metro reconoce `.riv` como asset (ya configurado)
- `require()` devuelve un `number` (ID del asset)
- Compatible con Development Build

## 🚨 REBUILD EAS REQUERIDO

### ⚠️ SÍ, SE REQUIERE REBUILD

**Razón**: `rive-react-native` es un módulo nativo que requiere código nativo compilado.

**Comando para rebuild**:

```bash
# Para Android
eas build --profile development --platform android

# Para iOS
eas build --profile development --platform ios

# Para ambos
eas build --profile development --platform all
```

**Después del build**:
1. Descargar el APK/IPA desde EAS
2. Instalar en el dispositivo/emulador
3. Ejecutar `npx expo start --dev-client` para conectar con el dev client

### Alternativa (solo desarrollo local):

Si estás desarrollando localmente y tienes Android Studio/Xcode configurado:

```bash
# Android
npx expo run:android

# iOS
npx expo run:ios
```

Esto compilará el código nativo localmente.

## ✅ PASOS FINALES PARA PROBAR

### 1. Limpiar cache de Metro:
```bash
npx expo start -c
```

### 2. Si ya tienes un Development Build instalado:
- El código debería funcionar después de limpiar cache
- Si ves errores de módulo nativo, necesitas rebuild

### 3. Si NO tienes Development Build:
```bash
# Construir Development Build
eas build --profile development --platform android

# O para desarrollo local
npx expo run:android
```

### 4. Verificar:
- ✅ El splash Rive debería aparecer al abrir la app
- ✅ Si falla, se mostrará `ActivityIndicator` como fallback
- ✅ La navegación debería funcionar correctamente después del delay

## 📊 RESUMEN DE CAMBIOS

| Archivo | Cambio | Estado |
|---------|--------|--------|
| `src/screens/BootstrapScreen.tsx` | Ruta corregida + API corregida | ✅ |
| `metro.config.js` | `.riv` en assetExts | ✅ Ya estaba |
| `package.json` | `rive-react-native@9.7.1` | ✅ Instalado |
| `eas.json` | Profile `development` | ✅ Configurado |

## 🎯 CONFIRMACIÓN FINAL

- ✅ **Ruta corregida**: `../../../assets/anim/splash_cellarium.riv`
- ✅ **API correcta**: `source={require(...)}`
- ✅ **Metro configurado**: `.riv` en `assetExts`
- ✅ **Fallback agregado**: `ActivityIndicator` si Rive falla
- ⚠️ **Rebuild requerido**: SÍ, porque es módulo nativo
- ✅ **Archivo existe**: `assets/anim/splash_cellarium.riv` confirmado

## 🔍 VERIFICACIÓN ADICIONAL

Si después del rebuild aún hay problemas:

1. Verificar que el archivo `.riv` esté en `assets/anim/`
2. Verificar que Metro reconozca el asset:
   ```bash
   npx expo start -c
   ```
3. Verificar logs de error en consola
4. Si persiste, verificar que el archivo `.riv` no esté corrupto











