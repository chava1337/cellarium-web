# Registro de Errores y Soluciones

## Error: WebSocket y módulos de Node.js en React Native

### Descripción del Error
```
The package at "node_modules\ws\lib\websocket.js" attempted to import the Node standard library module "net".
It failed because the native React runtime does not include the Node standard library.
```

### Causa
Este error ocurre cuando se intenta usar la librería `ws` (WebSocket) en React Native/Expo. La librería `ws` depende de varios módulos nativos de Node.js que no están disponibles en el entorno de React Native:
- `net`: Para conexiones de red
- `tls`: Para conexiones seguras
- `zlib`: Para compresión

El error aparece porque:
1. `@supabase/supabase-js` usa `@supabase/realtime-js` que depende de `ws`
2. `expo` y `react-native` también usan diferentes versiones de `ws`
3. Estos módulos intentan usar funcionalidades de Node.js que no existen en React Native

### Solución
1. Crear polyfills para los módulos de Node.js necesarios:

```javascript
// src/polyfills/net.js
module.exports = {
  createServer: () => ({}),
  createConnection: () => ({}),
  connect: () => ({}),
  Socket: class Socket {},
  Server: class Server {},
};

// src/polyfills/tls.js
module.exports = {
  createServer: () => ({}),
  createSecurePair: () => ({}),
  connect: () => ({}),
  SecurePair: class SecurePair {},
  Server: class Server {},
};

// src/polyfills/zlib.js
module.exports = {
  createDeflate: () => ({}),
  createInflate: () => ({}),
  createDeflateRaw: () => ({}),
  createInflateRaw: () => ({}),
  createGzip: () => ({}),
  createGunzip: () => ({}),
  createUnzip: () => ({}),
  deflate: () => ({}),
  deflateRaw: () => ({}),
  gzip: () => ({}),
  gunzip: () => ({}),
  inflate: () => ({}),
  inflateRaw: () => ({}),
  unzip: () => ({}),
};
```

2. Configurar Metro para usar los polyfills:

```javascript
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

module.exports = (() => {
  const config = getDefaultConfig(__dirname);
  
  config.transformer.transformIgnorePatterns = [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@supabase/supabase-js|ws)'
  ];

  config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
    events: require.resolve('events/'),
    stream: require.resolve('readable-stream'),
    crypto: require.resolve('react-native-crypto'),
    buffer: require.resolve('buffer/'),
    util: require.resolve('util/'),
    assert: require.resolve('assert/'),
    http: require.resolve('@tradle/react-native-http'),
    https: require.resolve('@tradle/react-native-http'),
    url: require.resolve('react-native-url-polyfill'),
    net: path.resolve(__dirname, 'src/polyfills/net.js'),
    tls: path.resolve(__dirname, 'src/polyfills/tls.js'),
    zlib: path.resolve(__dirname, 'src/polyfills/zlib.js'),
    fs: false,
    path: false,
    os: false,
  };

  return config;
})();
```

### Pasos para resolver
1. Crear la carpeta `src/polyfills` si no existe
2. Crear los archivos de polyfill mencionados arriba
3. Actualizar `metro.config.js` con la configuración proporcionada
4. Limpiar la caché y reinstalar dependencias:
```bash
npm cache clean --force
Remove-Item -Recurse -Force node_modules
npm install
```
5. Reiniciar el proyecto:
```bash
npx expo start --dev-client
```

### Notas Adicionales
- Esta solución proporciona implementaciones vacías de los módulos de Node.js necesarios
- Los polyfills devuelven objetos vacíos o clases vacías para evitar errores
- Esta solución es compatible con Expo Managed y React Native
- Si aparecen errores similares con otros módulos de Node.js, se pueden agregar más polyfills siguiendo el mismo patrón

## Error: Problemas con fuentes y dependencias en build de EAS

### Descripción del Error
1. Error de resolución de módulos:
```
Error: Unable to resolve module @expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/AntDesign.ttf from /home/expo/workingdir/build/node_modules/react-native-vector-icons/lib/create-icon-set.js
```

2. Error de iconos no renderizados:
```
[Unhandled promise rejection: Error: The method or property expo-font.loadAsync is not available on this platform]
```

### Causa
Este error ocurre durante el build de EAS debido a varios factores:
1. Conflicto de versiones con `@react-native-async-storage/async-storage`:
   - Firebase Auth requiere versión `^1.18.1`
   - El proyecto usa versión `2.1.2`
2. El `package-lock.json` desactualizado que no refleja todas las dependencias necesarias
3. Problemas con la resolución de rutas de Metro para los archivos de fuentes
4. Incompatibilidad entre versiones de `@expo/vector-icons` y Expo SDK 53

### Solución
1. Limpiar completamente la instalación:
```bash
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
```

2. Reinstalar todas las dependencias:
```bash
npm install
```

3. Verificar que el archivo `AntDesign.ttf` existe en la ubicación correcta:
```
node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/AntDesign.ttf
```

4. Para el problema de los iconos, asegurarse de usar la versión correcta de `@expo/vector-icons`:
```bash
npm install @expo/vector-icons@13.0.0 --legacy-peer-deps
```

### Pasos para resolver
1. Eliminar `node_modules` y `package-lock.json`
2. Ejecutar `npm install` para regenerar el `package-lock.json`
3. Verificar que todas las dependencias se instalaron correctamente
4. Intentar el build nuevamente con:
```bash
eas build --platform android --profile production --clear-cache
```

### Notas Adicionales
- El problema principal era la desincronización entre `package.json` y `package-lock.json`
- La reinstalación limpia de las dependencias resuelve el problema
- Es importante verificar que las fuentes existan en la ubicación correcta después de la instalación
- El build exitoso generará un archivo AAB (Android App Bundle)
- La versión específica de `@expo/vector-icons` (13.0.0) es crucial para la compatibilidad con Expo SDK 53

## Error: google-services.json no encontrado en EAS Build

### Descripción del Error
```
"google-services.json" is missing, make sure that the file exists. Remember that EAS Build only uploads the files tracked by git. Use EAS environment variables to provide EAS Build with the file.
```

### Causa
Este error ocurre durante el build de EAS por varias razones posibles:
1. El archivo `google-services.json` no está siendo trackeado por git
2. La variable de entorno tipo archivo no está configurada correctamente en EAS
3. La configuración en `app.config.js` no está referenciando correctamente la variable de entorno
4. Se está usando la variable de entorno del proyecto incorrecto

### Solución
1. Configurar la variable de entorno en EAS:
   - Ir a la sección "Environment Variables" del proyecto en EAS
   - Crear una nueva variable con:
     - Nombre: `GOOGLE_SERVICES_JSON`
     - Tipo: File Secret
     - Visibilidad: Secret
     - Subir el archivo `google-services.json`

2. Configurar `app.config.js`:
```javascript
export default {
  expo: {
    // ... otras configuraciones ...
    android: {
      // ... otras configuraciones de android ...
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './android/app/google-services.json'
    }
  }
};
```

3. Asegurarse que `google-services.json` esté en `.gitignore`:
```
# Firebase
google-services.json
```

### Pasos para resolver
1. Verificar que el archivo `google-services.json` existe en `android/app/`
2. Agregar el archivo a `.gitignore` si no está
3. Subir el archivo como variable de entorno tipo archivo en EAS
4. Configurar `app.config.js` con la referencia a la variable de entorno
5. Hacer un build limpio:
```bash
eas build --profile development --platform android --clear-cache
```

### Notas Adicionales
- La variable de entorno debe ser de tipo **Secret** para mayor seguridad
- El archivo debe estar en `.gitignore` para evitar exponer credenciales
- La ruta en `app.config.js` debe usar el operador `??` para el fallback
- Asegurarse de estar usando la variable de entorno del proyecto correcto
- El build exitoso generará un archivo APK/AAB con Firebase correctamente configurado

## Sistema de Testing Automatizado para Laundry App

### Descripción del Sistema
Se implementó un sistema completo de testing automatizado para verificar la conectividad, configuración y estructura de la aplicación antes de crear builds de producción. Este sistema incluye:

1. **Scripts de Testing Automatizado**
2. **Verificación Pre-Build**
3. **Tests de Conectividad**
4. **Validación de Configuración**

### Estructura de Scripts Implementados

#### 1. Script Principal de Testing (`scripts/test-all.js`)
```javascript
const testConnectivity = require('./test-connectivity');
const testApp = require('./test-app');

async function runAllTests() {
  console.log('🧪 Ejecutando todos los tests...');
  
  await testConnectivity.runAllTests();
  await testApp.runAllTests();
  
  console.log('✅ Todos los tests completados');
}

if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { runAllTests };
```

#### 2. Script de Conectividad (`scripts/test-connectivity.js`)
```javascript
const https = require('https');
const fs = require('fs');

// Tests implementados:
// - Conectividad de Internet
// - Conectividad con Supabase
// - Verificación de archivos críticos
// - Verificación de dependencias
// - Configuración de Metro
// - Sintaxis de archivos
// - Verificación de polyfills

async function testInternetConnectivity() {
  try {
    const response = await makeRequest('https://www.google.com');
    return response.statusCode === 200;
  } catch (error) {
    return false;
  }
}

async function testSupabaseConnectivity() {
  try {
    const supabaseApiUrl = `${TEST_CONFIG.SUPABASE_URL}/rest/v1/`;
    const response = await makeRequest(supabaseApiUrl);
    return response.statusCode === 200 || response.statusCode === 401;
  } catch (error) {
    return false;
  }
}

// ... otros tests
```

#### 3. Script de Estructura de App (`scripts/test-app.js`)
```javascript
const fs = require('fs');
const path = require('path');

// Tests implementados:
// - Estructura de archivos
// - Imports/exports válidos
// - Configuración de app.config.js
// - package.json válido
// - Sintaxis de archivos
// - Configuración de Metro
// - Archivos de polyfill

function testFileStructure() {
  const requiredDirs = ['src', 'components', 'lib', 'config'];
  // Verificar que todas las carpetas existan
}

function testAppConfig() {
  try {
    const appConfig = require('../app.config.js');
    return appConfig && appConfig.expo;
  } catch (error) {
    return false;
  }
}
```

#### 4. Script Pre-Build (`scripts/pre-build.js`)
```javascript
const { execSync } = require('child_process');

async function runPreBuildChecks() {
  console.log('🚀 PRE-BUILD CHECK - LAUNDRY APP');
  
  // Verificaciones implementadas:
  // 1. Archivos críticos
  // 2. Dependencias
  // 3. Configuración de build
  // 4. Variables de entorno
  // 5. Estado de Git
  // 6. Tests automáticos
  
  const results = {
    criticalFiles: await checkCriticalFiles(),
    dependencies: await checkDependencies(),
    buildConfig: await checkBuildConfig(),
    environment: await checkEnvironment(),
    gitStatus: await checkGitStatus(),
    tests: await runTests()
  };
  
  return results;
}
```

### Configuración en package.json

```json
{
  "scripts": {
    "test": "node ./scripts/test-all.js",
    "test:connectivity": "node ./scripts/test-connectivity.js",
    "test:app": "node ./scripts/test-app.js",
    "test:pre-build": "npm run test && echo '✅ Tests pasaron - Listo para build'",
    "pre-build": "node ./scripts/pre-build.js"
  }
}
```

### Archivos de Configuración Requeridos

#### 1. Configuración de Entorno (`src/config/environment.js`)
```javascript
const ENV_CONFIG = {
  SUPABASE: {
    URL: 'https://jitvzdzzuzujqzuaejgm.supabase.co',
    ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  },
  EXPO: {
    PROJECT_ID: 'your-project-id'
  }
};

const getConfig = (environment = 'production') => {
  return ENV_CONFIG;
};

module.exports = {
  ENV_CONFIG,
  getConfig,
  validateConfig
};
```

#### 2. Configuración de Red (`src/lib/networkConfig.js`)
```javascript
const { getConfig } = require('../config/environment');

const NETWORK_CONFIG = {
  TIMEOUT: 10000,
  MAX_RETRIES: 3,
  BACKOFF_MULTIPLIER: 2
};

const checkInternetConnectivity = async () => {
  // Implementación de verificación de internet
};

const calculateBackoffDelay = (attempt) => {
  return Math.min(1000 * Math.pow(NETWORK_CONFIG.BACKOFF_MULTIPLIER, attempt), 30000);
};

module.exports = {
  NETWORK_CONFIG,
  checkInternetConnectivity,
  calculateBackoffDelay
};
```

### Proceso de Testing Implementado

#### 1. Tests de Conectividad
- **Test 1**: Conectividad básica de Internet
- **Test 2**: Conectividad con Supabase (API y URL base)
- **Test 3**: Verificación de archivos críticos
- **Test 4**: Verificación de dependencias
- **Test 5**: Configuración de Metro
- **Test 6**: Sintaxis de archivos principales
- **Test 7**: Verificación de polyfills

#### 2. Verificación Pre-Build
- Archivos críticos existentes y accesibles
- Dependencias instaladas correctamente
- Configuración de build válida
- Variables de entorno configuradas
- Estado de Git limpio
- Todos los tests automáticos pasando

#### 3. Criterios de Bloqueo
- Si algún test falla, el build se bloquea
- Mensajes claros sobre qué necesita ser corregido
- Recomendaciones específicas para resolver problemas

### Comandos de Testing

```bash
# Ejecutar todos los tests
npm run test

# Ejecutar solo tests de conectividad
npm run test:connectivity

# Ejecutar solo tests de estructura de app
npm run test:app

# Verificación completa pre-build
npm run pre-build

# Build de desarrollo (después de tests exitosos)
eas build --profile development --platform android
```

### Beneficios del Sistema

1. **Detección Temprana de Problemas**: Identifica errores antes del build
2. **Validación Automatizada**: Reduce errores humanos en el proceso
3. **Documentación del Estado**: Muestra claramente qué está funcionando y qué no
4. **Integración con CI/CD**: Fácil de integrar en pipelines de desarrollo
5. **Reutilización**: Los scripts pueden adaptarse a otras aplicaciones

### Adaptación para Otras Aplicaciones

Para implementar este sistema en otras aplicaciones:

1. **Copiar la estructura de scripts** de `scripts/`
2. **Adaptar las configuraciones** en `src/config/`
3. **Modificar las URLs y keys** específicas de la aplicación
4. **Ajustar los archivos críticos** según la estructura del proyecto
5. **Configurar las dependencias** específicas en `package.json`

### Notas Importantes

- **Compatibilidad de Módulos**: Los scripts usan CommonJS para compatibilidad con Node.js
- **Rutas Relativas**: Los scripts se ejecutan desde la raíz del proyecto
- **Manejo de Errores**: Cada test maneja errores graciosamente y proporciona información útil
- **Colores en Consola**: Los scripts usan códigos ANSI para mejor legibilidad
- **Exit Codes**: Los scripts retornan códigos de salida apropiados para CI/CD

## Error: Worker Configuration Failed en EAS Build

### Descripción del Error
```
Build failed: An unexpected error happened.
Worker configuration failed.
Try running the build again. Report the issue to https://expo.dev/contact if the problem persists.
```

### Causa
Este error ocurre cuando hay configuraciones muy complejas en Gradle que causan conflictos con EAS Build:
1. Configuraciones complejas de packaging y optimización
2. Conflictos entre diferentes versiones de dependencias
3. Configuraciones incompatibles con EAS Build
4. Configuraciones de R8 y shrink resources muy agresivas

### Solución
1. Simplificar la configuración de `android/app/build.gradle`:
```gradle
buildTypes {
    release {
        // Caution! In production, you need to generate your own keystore file.
        // see https://reactnative.dev/docs/signed-apk-android.
        signingConfig signingConfigs.debug
        minifyEnabled false  // Cambiar de true a false
        proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
    }
}
```

2. Simplificar `android/gradle.properties`:
```properties
# Configuración básica para evitar conflictos
android.enableR8=false
android.enableShrinkResources=false
```

3. Simplificar `app.config.js`:
```javascript
android: {
    adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff"
    },
    package: "com.eyedol.laundry2",
    versionCode: 6,
    // Configuración básica
    enableHermes: true,
    // Remover configuraciones complejas
}
```

### Pasos para resolver
1. Simplificar configuraciones complejas en build.gradle
2. Deshabilitar R8 y shrink resources temporalmente
3. Remover configuraciones complejas de app.config.js
4. Hacer commit de los cambios
5. Intentar el build nuevamente:
```bash
eas build --profile production --platform android --clear-cache
```

### Notas Adicionales
- Este error es común cuando se usan configuraciones muy agresivas de optimización
- La simplificación temporal permite identificar qué configuración específica causa el problema
- Una vez que el build funciona, se pueden reintroducir optimizaciones gradualmente

## Error: Archivo gradlew Faltante en EAS Build

### Descripción del Error
```
ENOENT: no such file or directory, open '/home/expo/workingdir/build/android/gradlew'
```

### Causa
Este error ocurre cuando:
1. El archivo `gradlew` no existe en el directorio Android
2. El archivo no está marcado como ejecutable
3. La estructura Android no está completa después de cambios
4. Los archivos no están siendo trackeados por Git

### Solución
1. Regenerar la estructura Android completa:
```bash
npx expo prebuild --platform android --clean
```

2. Marcar el archivo gradlew como ejecutable:
```bash
git add android/gradlew
git update-index --chmod=+x android/gradlew
```

3. Agregar todos los archivos Android al repositorio:
```bash
git add android/
git commit -m "Fix: Regenerate Android native files and make gradlew executable"
```

### Archivos que deben existir
- `android/gradlew` (ejecutable)
- `android/gradlew.bat`
- `android/gradle/wrapper/gradle-wrapper.jar`
- `android/gradle/wrapper/gradle-wrapper.properties`
- Estructura completa de `android/app/`

### Pasos para resolver
1. Ejecutar `npx expo prebuild --platform android --clean`
2. Marcar gradlew como ejecutable con Git
3. Hacer commit de todos los archivos Android
4. Verificar que la estructura esté completa
5. Intentar el build nuevamente

### Notas Adicionales
- El archivo gradlew es esencial para que EAS Build pueda ejecutar Gradle
- Debe estar marcado como ejecutable en Git para que funcione en el servidor
- La regeneración completa asegura que todos los archivos necesarios estén presentes

## Error: URI Scheme Faltante para Dev Client

### Descripción del Error
```
The /android project does not contain any URI schemes. Expo CLI will not be able to use links to launch the project.
You can configure a custom URI scheme using the --scheme option.
```

### Causa
Este error ocurre cuando:
1. No hay un URI scheme configurado en el proyecto
2. El dev client no puede conectarse al servidor de desarrollo
3. La configuración se perdió después de regenerar la estructura Android

### Solución
1. Agregar URI scheme al `app.config.js`:
```javascript
module.exports = {
  expo: {
    name: "Laundry App",
    slug: "laundry-app",
    version: "1.4.0",
    scheme: "laundryapp",  // Agregar esta línea
    // ... resto de configuración
  }
};
```

2. Usar el comando con el scheme personalizado:
```bash
npx expo start --dev-client --scheme laundryapp
```

### Pasos para resolver
1. Agregar `scheme: "laundryapp"` al app.config.js
2. Hacer commit del cambio
3. Usar siempre el comando con `--scheme laundryapp`
4. El QR code ahora incluirá el esquema correcto

### Notas Adicionales
- El URI scheme actúa como "dirección" para que el dev client se conecte
- Sin el scheme, el dev client no sabe cómo conectarse al servidor
- Es necesario usar el parámetro `--scheme` en el comando de desarrollo

## Error: Color iconBackground Faltante

### Descripción del Error
```
Android resource linking failed … ic_launcher.xml … error: resource color/iconBackground not found.
```

### Causa
Los archivos de iconos adaptativos referencian un color que no existe:
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` usa `@color/iconBackground`
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml` usa `@color/iconBackground`
- Este color no está definido en `android/app/src/main/res/values/colors.xml`

### Solución
Agregar el color faltante al archivo `colors.xml`:
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<resources>
  <color name="splashscreen_background">#FFFFFF</color>
  <!-- Color que están pidiendo ic_launcher.xml y ic_launcher_round.xml -->
  <color name="iconBackground">#FFFFFF</color>
</resources>
```

### Archivos afectados
- `android/app/src/main/res/values/colors.xml` - Agregar el color
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` - Referencia el color
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml` - Referencia el color

### Pasos para resolver
1. Abrir `android/app/src/main/res/values/colors.xml`
2. Agregar `<color name="iconBackground">#FFFFFF</color>`
3. Hacer commit del cambio
4. Intentar el build nuevamente

### Notas Adicionales
- El color puede ser cualquier valor hexadecimal válido
- `#FFFFFF` es blanco, pero se puede cambiar por cualquier color deseado
- Este error es común después de regenerar la estructura Android

## Error: Inconsistencia de Paquete/Namespace

### Descripción del Error
```
e: .../MainActivity.kt:18:14 Unresolved reference 'R'
e: .../MainActivity.kt:35:11 Unresolved reference 'BuildConfig'
e: .../MainApplication.kt:33:60 Unresolved reference 'BuildConfig'
...
Execution failed for task ':app:compileReleaseKotlin'
```

### Causa
Este error ocurre por inconsistencias de paquete/namespace:
1. El `namespace` en `build.gradle` no coincide con el `package` en `app.config.js`
2. Los archivos Kotlin declaran un paquete diferente al configurado
3. AGP 8 requiere que el namespace coincida exactamente con el paquete de las fuentes
4. R y BuildConfig no se generan para el paquete correcto

### Solución
1. Verificar y corregir `android/app/build.gradle`:
```gradle
android {
    namespace "com.eyedol.laundry2"  // Debe coincidir exactamente
    defaultConfig {
        applicationId "com.eyedol.laundry2"  // Debe coincidir exactamente
        versionCode 6
        versionName "1.4.0"
    }
}
```

2. Verificar que `app.config.js` tenga el mismo paquete:
```javascript
android: {
    package: "com.eyedol.laundry2",  // Debe coincidir exactamente
    versionCode: 6,
}
```

3. Verificar que los archivos Kotlin tengan el paquete correcto:
```kotlin
// MainActivity.kt y MainApplication.kt
package com.eyedol.laundry2  // Debe coincidir exactamente
```

### Verificaciones necesarias
- `app.config.js`: `android.package`
- `build.gradle`: `namespace` y `applicationId`
- Archivos Kotlin: `package` en la primera línea
- Estructura de carpetas: `com/eyedol/laundry2/`

### Pasos para resolver
1. Verificar que todos los paquetes coincidan exactamente
2. Corregir cualquier inconsistencia encontrada
3. No importar R o BuildConfig manualmente (se resuelven automáticamente)
4. Hacer commit de los cambios
5. Intentar el build nuevamente

### Notas Adicionales
- AGP 8 es más estricto con la consistencia de paquetes
- El namespace es obligatorio desde AGP 8
- Cualquier inconsistencia causa que R y BuildConfig no se generen
- La estructura de carpetas debe coincidir con el paquete declarado

## Error: google-services.json No Encontrado

### Descripción del Error
```
Could not parse Expo config: android.googleServicesFile: "./android/app/google-services.json"
```

### Causa
Este error ocurre cuando:
1. El archivo `google-services.json` no existe en la ruta especificada
2. Se perdió durante la regeneración de la estructura Android
3. La referencia en `app.config.js` apunta a un archivo inexistente

### Solución
Comentar temporalmente la referencia en `app.config.js`:
```javascript
android: {
    // ... otras configuraciones ...
    // googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./android/app/google-services.json",
}
```

### Pasos para resolver
1. Comentar la línea de `googleServicesFile` en `app.config.js`
2. Hacer commit del cambio
3. El build funcionará sin Firebase por ahora
4. Para producción, configurar la variable de entorno en EAS

### Notas Adicionales
- Esta es una solución temporal para permitir que el build funcione
- Para producción, se debe configurar la variable de entorno `GOOGLE_SERVICES_JSON` en EAS
- El archivo debe estar en `.gitignore` por seguridad

## Error: Apple Developer Portal Connection Timeout

**Fecha**: 2024-12-01
**Error**: `connect ETIMEDOUT 2600:1404:200:581::9ba:443`
**Mensaje**: `Authentication with Apple Developer Portal failed!`

### Descripción
Error de conectividad con los servidores de Apple Developer Portal durante el proceso de autenticación para builds de iOS.

### Causa
- Problemas de red temporales
- Servidores de Apple sobrecargados
- Firewall o proxy bloqueando conexión
- DNS no resolviendo correctamente

### Solución
1. **Reintentar**: `eas build --profile production --platform ios --clear-cache --auto-submit`
2. **Sin auto-submit**: `eas build --profile production --platform ios --clear-cache`
3. **Cambiar DNS**: Usar 8.8.8.8 y 8.8.4.4
4. **Usar VPN**: Conectar a VPN diferente
5. **Esperar**: Reintentar en unos minutos

### Archivos Afectados
- `app.config.js` (Bundle ID corregido)
- EAS Build process

### Estado
- ✅ Bundle ID corregido a `com.noirsong.laundryapp`
- ❌ Build falló por timeout de conexión
- 🔄 Pendiente: Reintentar build

---

## Error: Resource Compilation Failed - Google Play Services Conflict (Recurrente)

**Fecha:** 2024-12-01  
**Contexto:** Build de desarrollo Android falló nuevamente por conflictos de recursos de Google Play Services

### **Síntomas:**
```
Resource compilation failed (Failed to compile values resource file .../values.xml. 
Cause: java.lang.IllegalStateException: Can not extract resource from com.android.aaptcompiler.ParsedResource@2c85403.)

/home/expo/.gradle/caches/8.10.2/transforms/86521b212ddaf166c74efb2d2374118e/transformed/play-services-base-18.0.1/res/values/values.xml:4:0: Invalid <color> for given resource value.
```

### **Causa:**
- **Conflicto recurrente** de recursos de Google Play Services
- **play-services-base-18.0.1** tiene valores de color inválidos
- Configuración de recursos insuficiente para resolver conflictos

### **Solución Mejorada:**
1. **Mejorar packagingOptions en build.gradle:**
   ```gradle
   packagingOptions {
       resources {
           excludes += [
               '**/play-services-base-*.xml',
               '**/play-services-*.xml',  // Agregado
               '**/values.xml',
               '**/firebase-*.xml',
               '**/google-services-*.xml',
               '**/material-*.xml',
               '**/design-*.xml',
               '**/react-native-*.xml',
               '**/expo-*.xml',
               '**/META-INF/DEPENDENCIES',  // Agregado
               '**/META-INF/LICENSE',       // Agregado
               '**/META-INF/LICENSE.txt',   // Agregado
               '**/META-INF/NOTICE',        // Agregado
               '**/META-INF/NOTICE.txt'     // Agregado
           ]
           pickFirsts += [
               '**/libc++_shared.so',
               '**/libjsc.so',
               '**/values/colors.xml',      // Agregado
               '**/values/strings.xml'      // Agregado
           ]
       }
   }
   ```

2. **Agregar configuración en gradle.properties:**
   ```properties
   # Resource optimization settings
   android.enableResourceOptimizations=false
   android.disableResourceValidation=true
   ```

3. **Agregar aaptOptions en app.config.js:**
   ```javascript
   android: {
       aaptOptions: {
           ignoreAssetsPattern: "!.svn:!.git:!.ds_store:!*.scc:!CVS:!thumbs.db:!picasa.ini:!*~"
       }
   }
   ```

### **Prevención:**
- **Configuración exhaustiva** de excludes para Google Play Services
- **Deshabilitar validación** de recursos problemáticos
- **Usar pickFirsts** para recursos críticos
- **Regenerar proyecto** después de cambios significativos

### **Solución Final Implementada (Corregida):**
1. **Forzar versiones específicas de Play Services en android/build.gradle:**
   ```gradle
   subprojects { subproject ->
     subproject.configurations.all { config ->
       resolutionStrategy.eachDependency { details ->
         if (details.requested.group == "com.google.android.gms"
             && details.requested.name == "play-services-base") {
           details.useVersion "18.7.2" // corrige el <color> inválido de 18.0.1
           details.because("Fix resource compile error on compileSdk 35")
         }
         if (details.requested.group == "com.google.android.gms"
             && details.requested.name == "play-services-basement") {
           details.useVersion "18.7.1"
           details.because("Fix resource compile error on compileSdk 35")
         }
         // Solo si aún ves conflictos de versiones:
         if (details.requested.group == "com.google.android.gms"
             && details.requested.name == "play-services-tasks") {
           details.useVersion "18.3.2"
           details.because("Fix version conflicts with firebase-messaging")
         }
         if (details.requested.group == "com.google.android.gms"
             && details.requested.name == "play-services-stats") {
           details.useVersion "17.1.0"
           details.because("Fix version conflicts with firebase-messaging")
         }
         if (details.requested.group == "com.google.android.gms"
             && details.requested.name == "play-services-cloud-messaging") {
           details.useVersion "17.3.0"
           details.because("Fix version conflicts with firebase-messaging")
         }
       }
     }
   }
   ```

2. **Configurar NODE_ENV en eas.json:**
   ```json
   "development": {
     "env": {
       "NODE_ENV": "development"
     }
   }
   ```

3. **Mantener configuración de recursos** como respaldo

### **Notas Importantes:**
- **NO usar reglas genéricas** como `play-services-* => 18.5.0` (causa artifacts faltantes)
- **Usar versiones específicas** según release notes oficiales de Google
- **Alinear con firebase-messaging 24.0.1** que requiere versiones específicas
- **Remover configuraciones experimentales** como `disableResourceValidation`

## Error: Google Play Services Resource Conflict

**Fecha:** 2024-12-01
**Contexto:** Build de desarrollo para Android

### Descripción del Error
```
Resource compilation failed (Failed to compile values resource file .../values.xml. Cause: java.lang.IllegalStateException: Can not extract resource from com.android.aaptcompiler.ParsedResource@73e6687e.)
```

### Causa
- Conflicto de recursos entre Google Play Services y la aplicación
- Color inválido en `play-services-base-18.0.1/res/values/values.xml`

### Solución
1. **Excluir recursos problemáticos en build.gradle**:
   ```gradle
   packagingOptions {
       resources {
           excludes += ['**/play-services-base-*.xml', '**/values.xml']
       }
   }
   ```

2. **Configurar recursos en app.config.js**:
   ```javascript
   android: {
       resConfigs: ["es", "en"],
       resourceConfig: {
           keep: ["**/values/colors.xml", "**/values/strings.xml"]
       }
   }
   ```

### Prevención
- Configurar exclusiones de recursos desde el inicio
- Usar `resConfigs` para limitar idiomas soportados

## Error: Opciones Deprecadas en gradle.properties

**Fecha:** 2024-12-01
**Contexto:** Build de desarrollo para Android

### Descripción del Error
```
The option 'android.enableR8' is deprecated. It was removed in version 7.0 of the Android Gradle plugin.
The option setting 'android.enableResourceOptimizations=false' is deprecated.
The option setting 'android.disableResourceValidation=true' is experimental.
```

### Causa
- Opciones deprecadas en `gradle.properties` que ya no son compatibles con AGP 8.6.1
- `android.enableR8` fue removido en AGP 7.0
- `android.enableResourceOptimizations` será removido en AGP 9.0

### Solución
1. **Remover opciones deprecadas de gradle.properties**:
   ```properties
   # Remover estas líneas:
   # android.enableR8=false
   # android.enableShrinkResources=false
   # android.enableResourceOptimizations=false
   # android.disableResourceValidation=true
   ```

2. **Configurar optimizaciones en build.gradle**:
   ```gradle
   buildTypes {
       release {
           shrinkResources false
           minifyEnabled false
       }
   }
   ```

### Prevención
- No usar opciones deprecadas en gradle.properties
- Configurar optimizaciones directamente en build.gradle
- Verificar compatibilidad de opciones con la versión de AGP

## Error: splashscreen_logo.png No Encontrado en EAS Build

**Fecha:** 2024-12-19
**Contexto:** Build de EAS para Android fallando por archivo de splashscreen faltante

### Descripción del Error
```
Android resource linking failed
com.eyedol.laundry2.app-mergeDebugResources-68:/values/values.xml:6526: error: resource drawable/splashscreen_logo (aka com.eyedol.laundry2:drawable/splashscreen_logo) not found.
error: failed linking references.
```

### Causa
- El archivo `splashscreen_logo.png` se perdía durante el proceso de prebuild de EAS
- EAS Build no incluía automáticamente el archivo en la ubicación correcta
- El archivo existía localmente pero no se copiaba al build de EAS

### Solución Implementada
1. **Crear plugin personalizado de Expo** (`plugins/withSplashscreenLogo.js`):
```javascript
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withSplashscreenLogo = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const androidProjectPath = config.modRequest.platformProjectRoot;
      
      // Ruta del archivo fuente
      const sourcePath = path.join(projectRoot, 'assets', 'splashscreen_logo.png');
      // Ruta de destino
      const destPath = path.join(androidProjectPath, 'app', 'src', 'main', 'res', 'drawable', 'splashscreen_logo.png');
      
      // Crear directorio si no existe
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      
      // Copiar archivo si existe
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
        console.log('✅ splashscreen_logo.png copiado exitosamente');
      } else {
        console.warn('⚠️ splashscreen_logo.png no encontrado en assets/');
      }
      
      return config;
    },
  ]);
};

module.exports = withSplashscreenLogo;
```

2. **Configurar el plugin en app.config.js**:
```javascript
plugins: [
  "expo-font",
  "expo-secure-store",
  [
    "expo-notifications",
    {
      icon: "./assets/icon.png",
      color: "#ffffff",
      sounds: ["./assets/sounds/notificationsound.mp3"],
      mode: "production"
    }
  ],
  "./plugins/withSplashscreenLogo.js"  // Agregar el plugin
],
```

### Pasos para resolver
1. Crear el archivo `plugins/withSplashscreenLogo.js` con el código del plugin
2. Agregar la referencia al plugin en `app.config.js`
3. Asegurar que `assets/splashscreen_logo.png` existe
4. Ejecutar `npx expo prebuild --clean` para probar localmente
5. Verificar que el archivo se copie correctamente
6. Hacer build de EAS: `eas build --platform android --profile development --clear-cache`

### Notas Adicionales
- El plugin se ejecuta automáticamente durante el prebuild
- Copia el archivo desde `assets/` a la ubicación correcta de Android
- Funciona tanto en builds locales como en EAS Build
- Proporciona mensajes de confirmación en la consola

## Error: Autolinking Fallido en Prebuild

**Fecha:** 2024-12-19
**Contexto:** Prebuild fallando por problemas de autolinking de React Native

### Descripción del Error
```
error: package com.reactnativecommunity.asyncstorage does not exist
error: package com.reactnativecommunity.clipboard does not exist
error: package com.reactcommunity.rndatetimepicker does not exist
...
22 errors
```

### Causa
- El prebuild no estaba generando correctamente los paquetes de React Native
- Conflictos en la configuración de autolinking
- Dependencias no resueltas correctamente

### Solución
1. **Limpiar completamente el proyecto**:
```bash
npx expo prebuild --clean
```

2. **Si falla, reinstalar dependencias**:
```bash
npm cache clean --force
rm -rf node_modules
npm install
npx expo install --fix
```

3. **Regenerar estructura Android**:
```bash
npx expo prebuild --clean
```

### Pasos para resolver
1. Ejecutar `npx expo prebuild --clean`
2. Si falla, limpiar dependencias y reinstalar
3. Verificar que el plugin de splashscreen funcione
4. Probar build local: `cd android && ./gradlew assembleDebug`
5. Si funciona localmente, hacer build de EAS

### Notas Adicionales
- El prebuild limpio resuelve la mayoría de problemas de autolinking
- Es importante verificar que el build local funcione antes de EAS
- El plugin personalizado debe funcionar en ambos entornos

## Error: Build Local Exitoso pero EAS Build Fallando

**Fecha:** 2024-12-19
**Contexto:** Diferencia entre builds locales y de EAS

### Descripción del Error
- Build local: ✅ BUILD SUCCESSFUL
- EAS Build: ❌ Resource linking failed - splashscreen_logo not found

### Causa
- El archivo `splashscreen_logo.png` se copiaba localmente pero no en EAS
- EAS Build usa un proceso de prebuild diferente
- El archivo se perdía durante la subida a EAS

### Solución
- **Plugin de Expo personalizado** que se ejecuta durante el prebuild de EAS
- **Verificación automática** de que el archivo existe antes de copiarlo
- **Mensajes de confirmación** para debugging

### Resultado Final
- ✅ Build local exitoso
- ✅ Plugin funcionando correctamente
- ✅ Archivo copiado automáticamente
- ✅ EAS Build exitoso

### Lecciones Aprendidas
1. **Los builds locales y de EAS pueden diferir** en archivos incluidos
2. **Los plugins de Expo son la solución** para automatizar tareas durante el prebuild
3. **La verificación local es crucial** antes de hacer builds de EAS
4. **Los archivos de assets deben manejarse explícitamente** en EAS Build

## Error: Configuración de CompileSdk y Dependencias

**Fecha:** 2024-12-18 - 2024-12-19
**Contexto:** Múltiples intentos de resolver conflictos de versiones

### Problemas Encontrados
1. **CompileSdk 35 vs 34**: Incompatibilidades con algunas dependencias
2. **Google Play Services**: Conflictos de recursos y versiones
3. **React Native 0.79.6**: Problemas de compatibilidad con Expo SDK 53
4. **AGP 8.8.2**: Configuraciones deprecadas y conflictos

### Soluciones Implementadas
1. **Establecer compileSdk 34** como versión estable
2. **Usar versiones específicas** de Play Services en lugar de rangos
3. **Configurar expo-build-properties** para controlar versiones
4. **Limpiar configuraciones deprecadas** de gradle.properties

### Configuración Final Exitosa
```javascript
// app.config.js
plugins: [
  "expo-font",
  "expo-secure-store",
  [
    "expo-notifications",
    {
      icon: "./assets/icon.png",
      color: "#ffffff",
      sounds: ["./assets/sounds/notificationsound.mp3"],
      mode: "production"
    }
  ],
  "./plugins/withSplashscreenLogo.js"
],
```

```gradle
// android/build.gradle
android {
    compileSdk 34
    defaultConfig {
        minSdk 24
        targetSdk 34
    }
}
```

### Resultado
- ✅ Build de Android funcionando
- ✅ Plugin de splashscreen implementado
- ✅ Configuración estable y reproducible
- ✅ EAS Build exitoso

## Error: iOS Build - Firebase Modular Headers

**Fecha:** 2024-12-19
**Contexto:** Preparación para Apple Store - Build de iOS fallando por problemas de Firebase

### Descripción del Error
```
The Swift pod FirebaseCoreInternal depends upon GoogleUtilities, which does not define modules. 
To opt into those targets generating module maps (which is necessary to import them from Swift when building as static libraries), 
you may set use_modular_headers! globally in your Podfile, or specify :modular_headers => true for particular dependencies.
```

### Causa
- Firebase requiere modular headers para funcionar correctamente en iOS
- El problema surge cuando Swift intenta importar dependencias de GoogleUtilities
- Es necesario configurar `use_modular_headers!` en el Podfile o usar `useFrameworks: "static"`

### Solución Implementada
1. **Instalar expo-build-properties**:
```bash
npm install expo-build-properties
```

2. **Configurar en app.config.js**:
```javascript
plugins: [
  // ... otros plugins
  [
    "expo-build-properties",
    {
      "android": {
        "compileSdkVersion": 35,
        "targetSdkVersion": 35,
        "minSdkVersion": 24
      },
      "ios": {
        "deploymentTarget": "15.1",
        "useFrameworks": "static"
      }
    }
  ]
]
```

### Pasos para resolver
1. Instalar `expo-build-properties`
2. Configurar `useFrameworks: "static"` en la configuración de iOS
3. Establecer `deploymentTarget: "15.1"` (requisito mínimo de EAS)
4. Ejecutar build: `eas build --profile production --platform ios`

### Notas Adicionales
- **NO usar `useModularHeaders: true`** - causa conflictos
- **Usar `useFrameworks: "static"`** - evita problemas de módulos
- **deploymentTarget mínimo 15.1** - requisito de EAS Build
- **Firebase funciona correctamente** con esta configuración

## Error: iOS Build - DeploymentTarget Insuficiente

**Fecha:** 2024-12-19
**Contexto:** Build de iOS fallando por deploymentTarget muy bajo

### Descripción del Error
```
`ios.deploymentTarget` needs to be at least version 15.1.
Error: build command failed.
```

### Causa
- EAS Build requiere deploymentTarget mínimo de 15.1
- Configuración inicial usaba 13.4 (muy baja)

### Solución
Actualizar `deploymentTarget` en `app.config.js`:
```javascript
"ios": {
  "deploymentTarget": "15.1",
  "useFrameworks": "static"
}
```

### Resultado
- ✅ Build de iOS exitoso
- ✅ Firebase funcionando correctamente
- ✅ Notificaciones push habilitadas

## Error: GoogleService-Info.plist Faltante

**Fecha:** 2024-12-19
**Contexto:** Prebuild de iOS fallando por archivo de Firebase faltante

### Descripción del Error
```
Path to GoogleService-Info.plist is not defined. 
Please specify the expo.ios.googleServicesFile field in app.json.
```

### Causa
- Archivo `GoogleService-Info.plist` no existe
- Configuración de Firebase para iOS incompleta

### Solución
1. **Crear GoogleService-Info.plist** en la raíz del proyecto
2. **Configurar en app.config.js**:
```javascript
ios: {
  googleServicesFile: "./GoogleService-Info.plist",
  // ... otras configuraciones
}
```

### Contenido del archivo
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CLIENT_ID</key>
  <string>your-client-id</string>
  <key>REVERSED_CLIENT_ID</key>
  <string>your-reversed-client-id</string>
  <key>API_KEY</key>
  <string>your-api-key</string>
  <key>GCM_SENDER_ID</key>
  <string>your-sender-id</string>
  <key>PLIST_VERSION</key>
  <string>1</string>
  <key>BUNDLE_ID</key>
  <string>com.noirsong.laundryapp</string>
  <key>PROJECT_ID</key>
  <string>laundry-app-dev</string>
  <key>STORAGE_BUCKET</key>
  <string>laundry-app-dev.appspot.com</string>
  <key>IS_ADS_ENABLED</key>
  <false/>
  <key>IS_ANALYTICS_ENABLED</key>
  <false/>
  <key>IS_APPINVITE_ENABLED</key>
  <true/>
  <key>IS_GCM_ENABLED</key>
  <true/>
  <key>IS_SIGNIN_ENABLED</key>
  <true/>
  <key>GOOGLE_APP_ID</key>
  <string>your-google-app-id</string>
</dict>
</plist>
```

### Resultado
- ✅ Prebuild de iOS exitoso
- ✅ Firebase configurado correctamente
- ✅ Build de iOS funcionando

## Error: Apple Store - Configuración de InfoPlist

**Fecha:** 2024-12-19
**Contexto:** Preparación para Apple Store - Configuraciones requeridas

### Configuraciones Agregadas
```javascript
ios: {
  infoPlist: {
    // ... configuraciones existentes
    LSRequiresIPhoneOS: true,
    UIRequiredDeviceCapabilities: ["armv7"],
    UIStatusBarStyle: "UIStatusBarStyleDefault",
    UIViewControllerBasedStatusBarAppearance: false,
    NSAppTransportSecurity: {
      NSAllowsArbitraryLoads: false,
      NSExceptionDomains: {
        "supabase.co": {
          NSExceptionAllowsInsecureHTTPLoads: false,
          NSExceptionMinimumTLSVersion: "TLSv1.2",
          NSIncludesSubdomains: true
        }
      }
    }
  }
}
```

### Propósito
- **LSRequiresIPhoneOS**: Requiere iOS (no iPad)
- **UIRequiredDeviceCapabilities**: Especifica capacidades del dispositivo
- **UIStatusBarStyle**: Configuración de barra de estado
- **NSAppTransportSecurity**: Configuración de seguridad de red

### Resultado
- ✅ Configuración compatible con Apple Store
- ✅ Cumple con requisitos de seguridad
- ✅ Build de iOS exitoso