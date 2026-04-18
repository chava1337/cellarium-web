// Plugins requeridos por Expo (SDK 54).
// Nota: Stripe nativo no se configura en mobile porque el proyecto usa:
// - iOS: Apple IAP
// - Android: Google Play Billing
// - Web: Stripe Checkout/Portal (sin plugin nativo)
/** iOS: static frameworks — alinea resolución CocoaPods (RCT-Folly / react-native-iap en EAS). */
const BUILD_PROPERTIES_PLUGIN = [
  "expo-build-properties",
  {
    ios: {
      useFrameworks: "static",
    },
  },
];

const OTHER_PLUGINS = [
  "expo-font",
  "expo-secure-store",
  "expo-web-browser",
  "expo-apple-authentication",
  "@sentry/react-native",
  "react-native-iap",
];

// IMPORTANT: Icon filenames changed to avoid Android/EAS cache issues (use icon-v2 / adaptive-icon-v2; then `npx expo prebuild --clean` before EAS).
const config = {
  expo: {
    name: "Cellarium",
    slug: "cellarium-wine-catalog",
    // Versión de marketing. Con appVersionSource: local en eas.json, EAS usa esta versión y android.versionCode del repo.
    version: "1.0.9",
    orientation: "default",
    userInterfaceStyle: "light",
    // App Store, Play listing, iOS: PNG 1024×1024 recomendado.
    icon: "./assets/icon-v2.png",

    // Deep Linking Configuration
    scheme: "cellarium",

    // Universal Links / App Links
    associatedDomains: [
      "applinks:cellarium.net",
      "applinks:www.cellarium.net"
    ],

    // Configuración para manejar OAuth callbacks (prefix dinámico en runtime vía App.tsx)
    linking: {
      prefixes: ["cellarium://"]
    },

    updates: {
      enabled: false
    },

    runtimeVersion: {
      policy: "sdkVersion"
    },

    // Configuración para orientación adaptativa
    orientation: "default",

    // Configuración específica para iOS
    ios: {
      supportsTablet: true,
      usesAppleSignIn: true,
      orientation: "default",
      bundleIdentifier: "com.cellarium.winecatalog",
      // CFBundleVersion: debe ser > al último build subido a TestFlight/App Store.
      buildNumber: "8",
      associatedDomains: [
        "applinks:cellarium.net",
        "applinks:www.cellarium.net"
      ],
      infoPlist: {
        NSCameraUsageDescription: "Esta app necesita acceso a la cámara para capturar etiquetas de vino.",
        ITSAppUsesNonExemptEncryption: false,
        NSLocationWhenInUseUsageDescription: "Cellarium utiliza la ubicación únicamente para mejorar la experiencia del usuario dentro de la app. No se recopila información sensible.",
      },
    },

    // Configuración específica para Android
    android: {
      supportsTablet: true,
      orientation: "default",
      package: "com.cellarium.winecatalog",
      // versionName en Gradle = expo.version. versionCode: entero monotónico por subida a Play (alinear con android/app/build.gradle).
      // Debe ser SIEMPRE mayor que el último subido a Play (Play rechaza duplicados).
      versionCode: 8,
      // Foreground: adaptive icon (dejar margen ~20–30% para la máscara del sistema).
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon-v2.png",
        backgroundColor: "#ffffff",
      },
      // Solo permisos que la app debe declarar explícitamente; el resto vienen de dependencias (p. ej. image-picker).
      permissions: ["android.permission.CAMERA"],
      // Quitar permisos fusionados por plantillas/librerías que no usamos o no deben ir a producción.
      blockedPermissions: [
        "android.permission.SYSTEM_ALERT_WINDOW",
        "android.permission.RECORD_AUDIO",
      ],
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            {
              scheme: "https",
              host: "cellarium.net",
              pathPrefix: "/qr"
            },
            {
              scheme: "https",
              host: "www.cellarium.net",
              pathPrefix: "/qr"
            }
          ],
          category: ["BROWSABLE", "DEFAULT"]
        },
        {
          action: "VIEW",
          category: ["BROWSABLE", "DEFAULT"],
          data: [
            { scheme: "cellarium" },
            { scheme: "cellarium", host: "auth-callback", pathPrefix: "/" },
            // Dev client / OAuth: debe persistir en AndroidManifest tras prebuild.
            { scheme: "exp+cellarium-wine-catalog" },
          ],
        },
      ]
    },

    // App Store / Play Store URLs
    extra: {
      appStoreUrl: "https://apps.apple.com/app/cellarium/id123456789",
      playStoreUrl: "https://play.google.com/store/apps/details?id=com.cellarium.winecatalog",
      /** Inyectado en build (EAS); alternativa: EXPO_PUBLIC_SENTRY_DSN en .env */
      sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN || "",
      eas: {
        projectId: "d69705be-f13a-4241-be49-0cbe7a34d8d9"
      }
    }
  }
};

// Merge plugins sin duplicados
const existingPlugins = config.expo.plugins ?? [];
const pluginName = (p) => (Array.isArray(p) ? p[0] : p);
const hasPlugin = (name) => existingPlugins.some((p) => pluginName(p) === name);
const withRequired = [...existingPlugins];
for (const name of OTHER_PLUGINS) {
  if (!hasPlugin(name)) withRequired.push(name);
}
if (!hasPlugin("expo-build-properties")) {
  withRequired.unshift(BUILD_PROPERTIES_PLUGIN);
}
config.expo.plugins = withRequired;

// Tras cambiar iconos: `npx expo prebuild --clean` luego `eas build` (p. ej. production) para regenerar mipmap sin caché antigua.

export default config;
