# Reporte informativo: Wiring de navegación del flujo "Escanear botella"

**Objetivo:** Documentar cómo está conectada la navegación para el ítem "Escanear botella" (sin proponer cambios).

---

## 1) Handler del ítem "Escanear botella" en AdminDashboardScreen

**Archivo:** `src/screens/AdminDashboardScreen.tsx`

El card "Escanear botella" usa el handler **`handleWineManagement`**, que navega a **`WineManagement`** (no a CaptureWineLabel).

```ts
// Líneas 88-90
const handleWineManagement = useCallback(() => {
  navigation.navigate('WineManagement');
}, [navigation]);
```

El ítem del menú que muestra el título "Escanear botella" está definido así (líneas 160-165):

```ts
{
  id: 'wines',
  title: t('admin.scan_bottle'),       // "Escanear botella"
  subtitle: t('admin.scan_bottle_sub'),
  color: UI.wine1,
  onPress: handleWineManagement,        // → navigate('WineManagement')
},
```

**Conclusión:** Al pulsar "Escanear botella" en el dashboard admin se navega a la pantalla **WineManagement**, no a CaptureWineLabel.

---

## 2) Registro en el navigator (route names)

**Archivo:** `src/screens/AppNavigator.tsx`

- **WineManagementScreen** está registrada:
  - **Route name exacto:** `"WineManagement"`
  - **Componente:** `WineManagementScreen`
  - **Líneas 85-88:**

```tsx
<Stack.Screen 
  name="WineManagement" 
  component={WineManagementScreen}
  options={{ headerShown: false }}
/>
```

- **CaptureWineLabelScreen** **no** está registrada en `AppNavigator.tsx`. No existe ningún `<Stack.Screen name="CaptureWineLabel" ... />` ni import de `CaptureWineLabelScreen` en ese archivo. La lista de pantallas del stack termina en `OwnerEmailVerification` (líneas 148-152); no hay entrada para CaptureWineLabel.

**Resumen:**

| Pantalla              | ¿Registrada en AppNavigator? | Route name   |
|-----------------------|-----------------------------|--------------|
| WineManagementScreen  | Sí                          | `WineManagement` |
| CaptureWineLabelScreen | No                          | —            |

---

## 3) Búsqueda de `navigate('CaptureWineLabel')` en el repo

- No existe en el código fuente ninguna llamada a `navigation.navigate('CaptureWineLabel')` ni equivalente (p. ej. `navigate('CaptureWineLabel', …)`).
- Las únicas referencias a "CaptureWineLabel" son:
  - **`src/screens/CaptureWineLabelScreen.tsx`:** tipado de la pantalla (`StackNavigationProp<RootStackParamList, 'CaptureWineLabel'>`).
  - **`docs/REPORTE_CAPTURE_WINE_LABEL_SCREEN.md`** y **`docs/REPORTE_MANEJO_IMAGENES.md`:** documentación.
  - **`scripts/setup-camera-module.sh`** y **`scripts/setup-camera-module.ps1`:** texto instructivo que dice "Navega a CaptureWineLabelScreen" (no código de navegación).

**Conclusión:** Ningún punto de la app navega a CaptureWineLabel; la pantalla no es accesible desde la UI.

---

## 4) CaptureWineLabel: registrada o enlazada desde UI

- **Registro en navigator:** CaptureWineLabelScreen **no** está registrada en `AppNavigator.tsx`. No hay `Stack.Screen` con `name="CaptureWineLabel"`.
- **Tipo de rutas:** En `src/types/index.ts`, `RootStackParamList` incluye `WineManagement: undefined` (línea 148) pero **no** incluye la clave `CaptureWineLabel`. La pantalla CaptureWineLabelScreen asume que existe `RootStackParamList['CaptureWineLabel']`, por lo que el tipo no está alineado con las rutas realmente definidas.
- **Enlace desde UI:** No hay botón, card ni acción en la app que haga `navigate('CaptureWineLabel')`. El único flujo "Escanear botella" visible (card del AdminDashboard) va a **WineManagement**.

**Conclusión:** CaptureWineLabelScreen está **ni registrada en el navigator ni enlazada desde la UI**. Es código que no se puede alcanzar por navegación en la aplicación actual.

---

## Resumen de archivos y fragmentos

| Qué | Archivo | Fragmento / detalle |
|-----|---------|----------------------|
| onPress del card "Escanear botella" | `src/screens/AdminDashboardScreen.tsx` | `onPress: handleWineManagement` (línea 164). |
| Handler que ejecuta el card | `src/screens/AdminDashboardScreen.tsx` | `handleWineManagement` → `navigation.navigate('WineManagement')` (líneas 88-90). |
| Registro WineManagement | `src/screens/AppNavigator.tsx` | `<Stack.Screen name="WineManagement" component={WineManagementScreen} ... />` (líneas 85-88). |
| Registro CaptureWineLabel | `src/screens/AppNavigator.tsx` | No existe; no hay import ni `Stack.Screen` para CaptureWineLabel. |
| Navegación a CaptureWineLabel | Todo el repo | No hay `navigate('CaptureWineLabel')` en ningún archivo. |
| Tipo de ruta WineManagement | `src/types/index.ts` | `WineManagement: undefined` en `RootStackParamList` (línea 148). |
| Tipo de ruta CaptureWineLabel | `src/types/index.ts` | No existe la clave `CaptureWineLabel` en `RootStackParamList`. |

---

*Reporte solo informativo; no se ha modificado código.*
