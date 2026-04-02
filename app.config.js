// Plugins requeridos por Expo (SDK 54); Stripe como tuple con merchantIdentifier (iOS)
const STRIPE_PLUGIN = [
  "@stripe/stripe-react-native",
  {
    merchantIdentifier: "merchant.com.cellarium.app",
    enableGooglePay: true,
  },
];
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

// Icono principal (App Store, Play Store legacy, etc.): PNG 1024x1024.
const config = {
  expo: {
    name: "Cellarium",
    slug: "cellarium-wine-catalog",
    version: "1.0.2",
    orientation: "default",
    userInterfaceStyle: "light",
    icon: "./assets/icon.png",

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
      merchantIdentifier: "merchant.com.cellarium.app",
      orientation: "default",
      bundleIdentifier: "com.cellarium.winecatalog",
      buildNumber: "3",
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
      // Foreground: asset específico para adaptive icon (margen ~20–30% para evitar recorte con la máscara).
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#6D1F2B"
      },
      permissions: [
        "android.permission.CAMERA",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.READ_EXTERNAL_STORAGE"
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
            { scheme: "cellarium", host: "auth-callback", pathPrefix: "/" }
          ]
        }
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

// Merge plugins sin duplicados: Stripe como tuple; sin string simple "@stripe/stripe-react-native"
const existingPlugins = config.expo.plugins ?? [];
const withoutStripe = existingPlugins.filter(
  (p) =>
    p !== "@stripe/stripe-react-native" &&
    !(Array.isArray(p) && p[0] === "@stripe/stripe-react-native")
);
const pluginName = (p) => (Array.isArray(p) ? p[0] : p);
const hasPlugin = (name) => withoutStripe.some((p) => pluginName(p) === name);
const withRequired = [...withoutStripe];
if (!hasPlugin("@stripe/stripe-react-native")) withRequired.push(STRIPE_PLUGIN);
for (const name of OTHER_PLUGINS) {
  if (!hasPlugin(name)) withRequired.push(name);
}
if (!hasPlugin("expo-build-properties")) {
  withRequired.unshift(BUILD_PROPERTIES_PLUGIN);
}
config.expo.plugins = withRequired;

// Tras cambiar el icono: eas build --profile development --platform android
// e instalar el nuevo dev client en el dispositivo.

export default config;
