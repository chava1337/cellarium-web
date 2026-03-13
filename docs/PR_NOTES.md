# PR1 (P0) — Email-only login + OAuth callback + logs

## Resumen de cambios

- **Login solo con email:** Eliminado soporte de username; validación de email con regex; mensaje genérico "Credenciales inválidas".
- **AdminLoginScreen:** Mismo flujo email-only; `signIn(email, password)` con email validado.
- **Logs:** `supabaseUrl` y anon key solo en `__DEV__` en `src/lib/supabase.ts`.
- **Android OAuth:** `app.config.js` — intentFilter para `cellarium` incluye explícitamente `cellarium://auth-callback` (host `auth-callback`, pathPrefix `/`) para que el callback de Google abra la app.

---

## Checklist de tests manuales

- [ ] **Login email + contraseña:** Iniciar sesión con un correo y contraseña válidos → sesión iniciada correctamente.
- [ ] **Email inválido:** Introducir texto que no sea email (ej. "usuario") → se muestra error tipo "Ingresa un correo electrónico válido" y no se llama al backend de auth.
- [ ] **Username rechazado:** Introducir solo un username (sin @) → validación de email falla con mensaje claro; no se realiza lookup RPC ni signIn.
- [ ] **Google OAuth (Android):** Iniciar login con Google → navegador/WebView → tras autorizar, redirección a `cellarium://auth-callback` abre la app y la sesión queda iniciada.
- [ ] **Google OAuth (iOS):** Mismo flujo en iOS; callback abre la app y sesión correcta.
- [ ] **QR `https://cellarium.app/qr`:** Escanear o abrir enlace `https://cellarium.app/qr` → abre la app y procesa el contenido (sin regresiones).

---

## P0 — OAuth callback PKCE + hash (Google OAuth)

- **Cambio:** El callback de Google OAuth acepta tanto **implicit** (`#access_token=...&refresh_token=...`) como **PKCE** (`?code=...`). Si viene `code`, se llama `exchangeCodeForSession(code)`; si viene hash con tokens, se usa `setSession`. Errores OAuth muestran mensaje genérico; no se loguean tokens en producción.
- **Archivos:** `src/screens/AuthScreen.tsx`, `src/screens/AdminRegistrationScreen.tsx`.

### Checklist tests manuales OAuth

- [ ] **Google OAuth en Android:** Iniciar sesión con Google → autorizar → vuelve a la app y sesión iniciada (sin "OAuth callback missing tokens").
- [ ] **Google OAuth en iOS:** Mismo flujo; callback abre la app y sesión correcta.
- [ ] **Cancelar OAuth:** Pulsar "Continuar con Google" y cancelar/cerrar el navegador → no crashea; vuelve a la pantalla de login sin error.
- [ ] **Error de OAuth:** Si el proveedor devuelve `?error=...` en la URL, se muestra mensaje genérico (no tokens ni detalles técnicos).

---

## Fix mínimo — SubscriptionsScreen: loading pegado + texto "Renueva" cuando cancel_at_period_end

- **Cambios:** (1) `users.subscription_cancel_at_period_end` en BD; webhook lo persiste en subscription.updated/deleted. (2) AuthContext y tipos incluyen el campo. (3) SubscriptionsScreen: `useFocusEffect` resetea `isProcessing` y llama `refreshUser` al volver a la pantalla; estado "Se renueva" vs "Se desactiva el {date}" según `user.subscription_cancel_at_period_end`.
- **Archivos:** migración `20260224100000_users_subscription_cancel_at_period_end.sql`, `stripe-webhook/index.ts`, `AuthContext.tsx`, `types/index.ts`, `SubscriptionsScreen.tsx`, `LanguageContext.tsx`.

### Checklist tests manuales (suscripciones)

- [ ] **Cancelar en portal (cancel_at_period_end):** Cancelar suscripción en Stripe Portal (al final del periodo) → volver a la app → UI muestra "Se desactiva el {date}" (no "Se renueva"); botones no quedan en loading.
- [ ] **Suscripción activa normal:** Con suscripción activa y sin cancelar → UI muestra "Se renueva el {date}".
- [ ] **Suscripción expirada:** Tras expiración, `enforce_subscription_expiry` / refresh sigue mostrando plan Gratis y estado coherente.
- [ ] **Volver del portal sin cerrar pestaña:** Abrir portal, luego volver a la app con back/switch → pantalla Suscripciones no queda con botones en loading (useFocusEffect resetea y refresca).

---

*Tras completar los ítems, marcar cada uno en el PR antes de merge.*
