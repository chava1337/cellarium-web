export default {
  expo: {
    name: "Cellarium",
    slug: "cellarium-wine-catalog",
    version: "1.0.0",
    orientation: "default",
    userInterfaceStyle: "light",
    
    // Deep Linking Configuration
    scheme: "cellarium",
    
    // Universal Links / App Links
    associatedDomains: [
      "applinks:cellarium.app",
      "applinks:www.cellarium.app"
    ],
    
    // Configuración para manejar OAuth callbacks
    linking: {
      prefixes: [
        "exp://192.168.1.100:8081",
        "cellarium://"
      ]
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
      orientation: "default",
      bundleIdentifier: "com.cellarium.winecatalog",
      associatedDomains: [
        "applinks:cellarium.app",
        "applinks:www.cellarium.app"
      ],
      infoPlist: {
        NSCameraUsageDescription: "Esta app necesita acceso a la cámara para capturar etiquetas de vino.",
        NSMicrophoneUsageDescription: "Esta app necesita acceso al micrófono para grabar videos."
      }
    },
    
    // Configuración específica para Android
    android: {
      supportsTablet: true,
      orientation: "default",
      package: "com.cellarium.winecatalog",
      permissions: [
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
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
              host: "cellarium.app",
              pathPrefix: "/qr"
            },
            {
              scheme: "https",
              host: "www.cellarium.app",
              pathPrefix: "/qr"
            }
          ],
          category: ["BROWSABLE", "DEFAULT"]
        },
        {
          action: "VIEW",
          category: ["BROWSABLE", "DEFAULT"],
          data: [{ scheme: "cellarium" }]
        }
      ]
    },
    
    // App Store / Play Store URLs
    extra: {
      appStoreUrl: "https://apps.apple.com/app/cellarium/id123456789",
      playStoreUrl: "https://play.google.com/store/apps/details?id=com.cellarium.winecatalog",
      eas: {
        projectId: "d69705be-f13a-4241-be49-0cbe7a34d8d9"
      }
    }
  }
};
