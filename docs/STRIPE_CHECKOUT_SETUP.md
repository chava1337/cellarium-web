# 💳 Configuración de Stripe Checkout para Cellarium

## 📋 Resumen

Este documento explica cómo configurar Stripe Checkout para suscripciones reales en Cellarium. Las Edge Functions `create-checkout-session` y `create-portal-session` permiten a los usuarios suscribirse y gestionar sus suscripciones directamente desde Stripe.

## 🔧 Variables de Entorno Requeridas

Configura estas variables en **Supabase Dashboard** → **Settings** → **Edge Functions** → **Secrets**:

### Variables Obligatorias

- ✅ `STRIPE_SECRET_KEY` (sk_test_... o sk_live_...)
  - Clave secreta de Stripe para operaciones de API
  - Obtener desde: [Stripe Dashboard](https://dashboard.stripe.com/apikeys)

- ✅ `STRIPE_WEBHOOK_SECRET` (whsec_...)
  - Secreto para verificar webhooks de Stripe
  - Ver: [docs/STRIPE_WEBHOOK_SETUP.md](./STRIPE_WEBHOOK_SETUP.md)

- ✅ `STRIPE_SUCCESS_URL`
  - URL a la que Stripe redirige después de un pago exitoso
  - Ejemplo: `https://yourapp.com/success` o `cellarium://subscription-success`
  - **IMPORTANTE**: Esta URL debe estar configurada en tu app para manejar deep links

- ✅ `STRIPE_CANCEL_URL`
  - URL a la que Stripe redirige si el usuario cancela el checkout
  - Ejemplo: `https://yourapp.com/cancel` o `cellarium://subscription-cancel`

- ✅ `STRIPE_PORTAL_RETURN_URL`
  - URL a la que Stripe redirige después de usar el Customer Portal
  - Ejemplo: `https://yourapp.com/portal-return` o `cellarium://portal-return`

### Variables Opcionales

- `STRIPE_API_VERSION` (default: `"2024-06-20"`)
  - Versión de la API de Stripe a usar

- `SUPABASE_URL` (ya configurado automáticamente)
- `SUPABASE_ANON_KEY` (ya configurado automáticamente)
- `SUPABASE_SERVICE_ROLE_KEY` (ya configurado automáticamente)

## 🚀 Desplegar Edge Functions

### Opción 1: Desde Terminal

```bash
# Desplegar create-checkout-session
supabase functions deploy create-checkout-session

# Desplegar create-portal-session
supabase functions deploy create-portal-session
```

### Opción 2: Desde Supabase Dashboard

1. Ve a **Edge Functions** en tu proyecto
2. Para cada función:
   - Si ya existe, haz clic en **Deploy**
   - Si no existe, súbela manualmente desde el código fuente

## 📦 Configurar Prices en Stripe

Asegúrate de tener estos Prices creados en Stripe Dashboard con los siguientes `lookup_key`:

1. **`pro_monthly`**
   - Plan: Pro
   - Precio: $950 MXN/mes (o el que corresponda)
   - Tipo: Recurring (mensual)

2. **`business_monthly`**
   - Plan: Business
   - Precio: $750 MXN/mes (o el que corresponda)
   - Tipo: Recurring (mensual)

3. **`branch_addon_monthly`** (ya usado por `update-subscription`)
   - Add-on de sucursales adicionales
   - Precio: según tu modelo de negocio
   - Tipo: Recurring (mensual)

### Crear Prices en Stripe Dashboard

1. Ve a **Products** → **Add product**
2. Configura el producto y precio
3. En **Pricing**, agrega un **Lookup key** (ej: `pro_monthly`)
4. Guarda el producto

## 🔗 Configurar Deep Links (Opcional pero Recomendado)

Para mejorar la UX, configura deep links para que la app se abra automáticamente después del checkout:

### Android (app.json o app.config.js)

```json
{
  "expo": {
    "scheme": "cellarium",
    "android": {
      "intentFilters": [
        {
          "action": "VIEW",
          "data": [
            {
              "scheme": "cellarium",
              "host": "subscription-success",
              "pathPrefix": "/"
            },
            {
              "scheme": "cellarium",
              "host": "subscription-cancel",
              "pathPrefix": "/"
            },
            {
              "scheme": "cellarium",
              "host": "portal-return",
              "pathPrefix": "/"
            }
          ],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    }
  }
}
```

### iOS (app.json o app.config.js)

```json
{
  "expo": {
    "scheme": "cellarium",
    "ios": {
      "bundleIdentifier": "com.cellarium.app"
    }
  }
}
```

### URLs de Ejemplo

- `STRIPE_SUCCESS_URL`: `cellarium://subscription-success`
- `STRIPE_CANCEL_URL`: `cellarium://subscription-cancel`
- `STRIPE_PORTAL_RETURN_URL`: `cellarium://portal-return`

## 🧪 Probar el Flujo

### 1. Probar Checkout Session

1. Abre la app y navega a **Suscripciones**
2. Selecciona un plan (Básico o Sucursal Adicional)
3. Toca **Suscribirse al Plan**
4. Se abrirá Stripe Checkout en el navegador
5. Usa una tarjeta de prueba:
   - Número: `4242 4242 4242 4242`
   - CVV: cualquier 3 dígitos
   - Fecha: cualquier fecha futura
   - Código postal: cualquier código válido
6. Completa el pago
7. La app debería refrescar automáticamente el usuario

### 2. Probar Customer Portal

1. Con una suscripción activa, toca **⚙️ Administrar Suscripción**
2. Se abrirá el Stripe Customer Portal
3. Puedes:
   - Ver detalles de la suscripción
   - Cambiar método de pago
   - Cancelar suscripción
   - Ver historial de pagos
4. Al cerrar, la app refrescará el usuario

### 3. Verificar Webhook

1. Ve a **Stripe Dashboard** → **Developers** → **Webhooks**
2. Revisa los eventos recibidos:
   - `invoice.paid`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
3. Verifica que la BD se actualice correctamente

## 📊 Flujo Completo

```
Usuario → Selecciona Plan → Toca "Suscribirse"
  ↓
Edge Function: create-checkout-session
  ↓
Crea/obtiene Stripe Customer
  ↓
Crea Checkout Session
  ↓
Retorna URL → App abre WebBrowser
  ↓
Usuario completa pago en Stripe
  ↓
Stripe envía webhook → stripe-webhook Edge Function
  ↓
Webhook actualiza BD (subscriptions, users)
  ↓
App refresca usuario (refreshUser)
  ↓
UI muestra suscripción activa
```

## 🔒 Seguridad

- ✅ **Autenticación requerida**: Solo usuarios autenticados pueden crear checkout sessions
- ✅ **Solo owners**: Solo el owner puede suscribirse
- ✅ **Whitelist de planes**: Solo se aceptan `pro_monthly` y `business_monthly`
- ✅ **Validación de firma**: Webhooks verifican firma con `STRIPE_WEBHOOK_SECRET`
- ✅ **No se exponen secretos**: `STRIPE_SECRET_KEY` nunca se envía al frontend

## 🐛 Troubleshooting

### Error: "planLookupKey inválido"
- Verifica que el `lookup_key` del price en Stripe coincida exactamente
- Verifica que el price esté activo en Stripe

### Error: "Price no encontrado en Stripe"
- Verifica que el price exista en Stripe Dashboard
- Verifica que el `lookup_key` sea correcto
- Verifica que el price esté activo

### Error: "NO_CUSTOMER" al abrir portal
- El usuario no tiene `stripe_customer_id` en la BD
- Esto ocurre si nunca ha completado un checkout
- Solución: Suscribirse primero a un plan

### La app no refresca después del checkout
- Verifica que `refreshUser()` se esté llamando
- Verifica que el webhook esté funcionando
- Revisa logs en Supabase Dashboard → Edge Functions → Logs

### Deep links no funcionan
- Verifica la configuración en `app.json` o `app.config.js`
- Reinstala la app después de cambiar deep links
- Verifica que las URLs en Stripe coincidan con el scheme configurado

## 📚 Referencias

- [Stripe Checkout Documentation](https://stripe.com/docs/payments/checkout)
- [Stripe Customer Portal](https://stripe.com/docs/billing/subscriptions/integrating-customer-portal)
- [Expo WebBrowser](https://docs.expo.dev/versions/latest/sdk/webbrowser/)
- [Expo Deep Linking](https://docs.expo.dev/guides/linking/)

