# Auditoría flujo guest en WineCatalogScreen — "Código expiró o ya no es válido"

## Estado confirmado por pruebas

- Android App Links y QrProcessor reciben el link correctamente.
- Overlay muestra: `step: response`, `source: deepLinkUrl`, `request: done | public-menu`, `http: 200`, `resp: ok`, `nav: triggered`.
- La pantalla destino (WineCatalog) muestra: **"Este código expiró o ya no es válido. Solicita uno nuevo."**

Conclusión: el fallo ocurre **después** de la navegación, en WineCatalogScreen o en la segunda validación del token.

---

## 1. Auditoría WineCatalogScreen

| Aspecto | Detalle |
|--------|--------|
| **Modo guest** | `isGuest = route.params?.isGuest \|\| false` |
| **Token** | `guestToken = route.params?.guestToken` |
| **Params esperados** | `isGuest`, `guestToken` (nombres correctos; mismo uso que QrProcessor) |
| **Segunda validación** | Sí: al montar, `useEffect` llama a `loadGuestMenuByToken()` → `getPublicMenuByToken(token)` (Edge `public-menu` GET). |
| **Mensaje de error** | Cualquier `catch` en `loadGuestMenuByToken` pone `setGuestMenuError(t('catalog.guest_code_expired'))` → "Este código expiró o ya no es válido. Solicita uno nuevo." |

---

## 2. Dónde se muestra el mensaje

| Ubicación | Condición | Variables |
|-----------|-----------|-----------|
| **Archivo** | `src/screens/WineCatalogScreen.tsx` |
| **Texto** | `src/contexts/LanguageContext.tsx`: clave `catalog.guest_code_expired` → "Este código expiró o ya no es válido. Solicita uno nuevo." |
| **Condición** | `if (isGuest && guestMenuError)` (aprox. líneas 2151–2152) |
| **Origen de `guestMenuError`** | `loadGuestMenuByToken` (aprox. 919–923): en el `catch` se hace `setGuestMenuError(t('catalog.guest_code_expired'))` |
| **Disparador** | Que `getPublicMenuByToken(token)` lance (p. ej. `res.ok === false` en `PublicMenuService.ts`). |

---

## 3. Segunda validación del token

- **WineCatalogScreen** llama a **public-menu** (GET) en `loadGuestMenuByToken` → `getPublicMenuByToken(token)` (`PublicMenuService.ts`).
- No se llama a resolve-qr desde WineCatalog.
- El token viene de `route.params.guestToken`; no se reconstruye desde otro sitio.

---

## 4. Causa raíz exacta

**En el flujo guest con payload `type === 'guest'`, QrProcessor no validaba el token con public-menu antes de navegar.**

- Se ponía el overlay en "public-menu", "200", "ok" y "triggered" **sin llamar** a la Edge.
- Se hacía `navigation.replace('WineCatalog', { isGuest: true, guestToken: trimmed })`.
- WineCatalog montaba y ejecutaba la **primera (y única)** llamada a public-menu en `loadGuestMenuByToken`.
- Si esa llamada fallaba (token inválido/expirado, 400, red, etc.), se mostraba siempre el mensaje genérico "Este código expiró o ya no es válido. Solicita uno nuevo." aunque el overlay en QrProcessor hubiera mostrado "200/ok".

Además, en **WineCatalog** cualquier error de la petición se mapeaba a ese mismo mensaje, sin distinguir el motivo (token faltante vs expirado vs error de red), lo que dificultaba el diagnóstico.

---

## 5. Archivos y líneas relevantes

| Archivo | Líneas (aprox.) | Qué pasa |
|---------|-----------------|----------|
| `src/screens/QrProcessorScreen.tsx` | 332–356 (antes) | Flujo guest: no se llamaba a `getPublicMenuByToken`; se navegaba con overlay "200/ok" falso. |
| `src/screens/WineCatalogScreen.tsx` | 919–923 (catch) | Cualquier error de `getPublicMenuByToken` → `guest_code_expired`. |
| `src/screens/WineCatalogScreen.tsx` | 2151–2157 | Render de la pantalla de error cuando `isGuest && guestMenuError`. |
| `src/services/PublicMenuService.ts` | 79–86 | Si `!res.ok` se lanza `Error(body \|\| statusText)`. |

---

## 6. Diff mínimo aplicado

1. **QrProcessorScreen.tsx — Flujo guest (`type === 'guest'`)**  
   - Antes de navegar a WineCatalog se llama a `getPublicMenuByToken(trimmed)`.  
   - Solo si la llamada es correcta se actualiza el overlay a 200/ok y se hace `navigation.replace('WineCatalog', …)`.  
   - Si falla, se muestra error en QrProcessor y no se navega (evitando llegar a WineCatalog con token inválido).

2. **WineCatalogScreen.tsx — Trazabilidad y diagnóstico**  
   - Log de `route.params` (claves, `isGuest`, `hasGuestToken`, `guestTokenLen`, `guestTokenSuffix`) cuando cambian.  
   - Log al entrar en `loadGuestMenuByToken` (longitud y sufijo del token).  
   - En el `catch`, en `__DEV__`, se muestra el error real en pantalla: `[mensaje del error]` además del texto genérico.

3. **PublicMenuService.ts**  
   - En `__DEV__`, si `!res.ok`, log del cuerpo de respuesta (primeros 300 caracteres) para ver el motivo del fallo.

---

## 7. Inconsistencias detectadas y resueltas

- **Overlay vs realidad**: En flujo guest el overlay podía mostrar 200/ok sin haber llamado a public-menu. Corregido validando antes de navegar.
- **Un solo mensaje para todos los fallos**: En WineCatalog cualquier error se mostraba como "expiró o inválido". Añadido en dev el mensaje real para distinguir token faltante, expirado, red, etc.

---

## 8. Checklist de prueba real

1. **App Link guest (token válido)**  
   - Abrir enlace con token de tipo guest válido (no expirado, dentro de límite de usos).  
   - Ver en overlay: "public-menu", 200, ok, triggered.  
   - Ver transición a WineCatalog y menú cargado (vinos/sucursal).  
   - En consola: `[WineCatalog] loadGuestMenuByToken success` con `branchId` y `winesCount`.

2. **App Link guest (token expirado o inválido)**  
   - Abrir enlace con token expirado o inválido.  
   - Ver en QrProcessor mensaje de error y redirección a Welcome (no llegar a WineCatalog).  
   - Overlay debe reflejar error (no 200/ok).

3. **Trazabilidad en __DEV__**  
   - Tras navegar a WineCatalog como guest: logs `[WineCatalog] route.params` y `loadGuestMenuByToken called` con longitud/sufijo del token.  
   - Si falla la carga: en pantalla (solo en dev) el mensaje debe incluir `[detalle del error]`; en consola `[GUEST_MENU] fetch error body` con status y cuerpo.

4. **Legacy (QR sin type)**  
   - Comportamiento previo se mantiene: QrProcessor valida con public-menu y solo entonces navega a WineCatalog.
