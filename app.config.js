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
      ]
    },
    
    // Configuración específica para Android
    android: {
      supportsTablet: true,
      orientation: "default",
      package: "com.cellarium.winecatalog",
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
        }
      ]
    },
    
    // App Store / Play Store URLs
    extra: {
      appStoreUrl: "https://apps.apple.com/app/cellarium/id123456789",
      playStoreUrl: "https://play.google.com/store/apps/details?id=com.cellarium.winecatalog"
    }
  }
};
