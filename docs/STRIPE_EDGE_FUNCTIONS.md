# 🔐 Stripe Edge Functions - Guía de Implementación

## 📋 Resumen

Para mantener seguras las claves secretas de Stripe, todas las operaciones sensibles deben ejecutarse en **Supabase Edge Functions** (backend), no en el cliente.

## 🎯 Edge Functions Necesarias

### 1. `create-payment-intent`
Crea un PaymentIntent en Stripe para procesar un pago único.

### 2. `confirm-payment`
Confirma un pago después de que el usuario completa el proceso.

### 3. `create-subscription`
Crea una suscripción recurrente en Stripe.

### 4. `cancel-subscription`
Cancela una suscripción en Stripe.

### 5. `update-subscription`
Actualiza una suscripción (cambio de plan).

### 6. `stripe-webhook`
Recibe webhooks de Stripe para eventos (pago exitoso, renovación, etc.).

---

## 🚀 Pasos para Implementar

### **Paso 1: Instalar Stripe en Supabase**

1. Ve a tu proyecto en Supabase Dashboard
2. Ve a **Edge Functions**
3. Instala las dependencias necesarias

### **Paso 2: Configurar Variables de Entorno**

En Supabase Dashboard → **Settings** → **Edge Functions** → **Secrets**:

```
STRIPE_SECRET_KEY=sk_test_... (o sk_live_... para producción)
STRIPE_WEBHOOK_SECRET=whsec_... (para verificar webhooks)
```

### **Paso 3: Crear Edge Functions**

Crea las siguientes funciones en `supabase/functions/`:

---

## 📁 Estructura de Archivos

```
supabase/
  functions/
    create-payment-intent/
      index.ts
    confirm-payment/
      index.ts
    create-subscription/
      index.ts
    cancel-subscription/
      index.ts
    update-subscription/
      index.ts
    stripe-webhook/
      index.ts
```

---

## 💻 Código de las Edge Functions

### **1. create-payment-intent/index.ts**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { amount, currency = 'MXN', description, metadata } = await req.json();

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: currency.toLowerCase(),
      description,
      metadata,
    });

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
```

### **2. confirm-payment/index.ts**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { paymentIntentId, userId, ownerId, subscriptionId } = await req.json();

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    return new Response(
      JSON.stringify({
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        paymentMethod: paymentIntent.payment_method
          ? await stripe.paymentMethods.retrieve(paymentIntent.payment_method as string)
          : null,
        chargeId: paymentIntent.latest_charge,
        description: paymentIntent.description,
        metadata: paymentIntent.metadata,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
```

### **3. create-subscription/index.ts**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const planPrices: Record<string, string> = {
  basic: 'price_xxxxx', // Reemplazar con Price ID de Stripe
  'additional-branch': 'price_xxxxx', // Reemplazar con Price ID de Stripe
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { customerId, planId, paymentMethodId } = await req.json();

    // Crear o obtener cliente en Stripe
    let customer;
    const customers = await stripe.customers.list({ email: customerId, limit: 1 });
    if (customers.data.length > 0) {
      customer = customers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: customerId,
        metadata: { userId: customerId },
      });
    }

    // Crear suscripción
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: planPrices[planId] }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    });

    return new Response(
      JSON.stringify({
        subscriptionId: subscription.id,
        customerId: customer.id,
        clientSecret: (subscription.latest_invoice as any)?.payment_intent?.client_secret,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
```

### **4. cancel-subscription/index.ts**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { subscriptionId, cancelAtPeriodEnd } = await req.json();

    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: cancelAtPeriodEnd,
    });

    return new Response(
      JSON.stringify({
        subscriptionId: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
```

### **5. stripe-webhook/index.ts**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';

serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('No signature', { status: 400 });
  }

  try {
    const body = await req.text();
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    // Manejar diferentes tipos de eventos
    switch (event.type) {
      case 'payment_intent.succeeded':
        // Actualizar pago en BD
        const paymentIntent = event.data.object;
        await supabase
          .from('payments')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('stripe_payment_intent_id', paymentIntent.id);
        break;

      case 'invoice.payment_succeeded':
        // Renovar suscripción
        const invoice = event.data.object;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          await supabase
            .from('subscriptions')
            .update({
              current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              status: 'active',
            })
            .eq('stripe_subscription_id', subscription.id);
        }
        break;

      case 'customer.subscription.deleted':
        // Cancelar suscripción
        const deletedSubscription = event.data.object;
        await supabase
          .from('subscriptions')
          .update({ status: 'canceled', canceled_at: new Date().toISOString() })
          .eq('stripe_subscription_id', deletedSubscription.id);
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    return new Response(`Webhook Error: ${error.message}`, { status: 400 });
  }
});
```

---

## 🔧 Configuración en Stripe Dashboard

### **1. Crear Products y Prices**

1. Ve a **Products** en Stripe Dashboard
2. Crea productos para cada plan:
   - **Básico**: $950.00 MXN/mes
   - **Sucursal Adicional**: $750.00 MXN/mes
3. Copia los **Price IDs** y úsalos en `create-subscription/index.ts`

### **2. Configurar Webhook**

1. Ve a **Developers** → **Webhooks**
2. Clic en **Add endpoint**
3. URL: `https://[tu-proyecto].supabase.co/functions/v1/stripe-webhook`
4. Eventos a escuchar:
   - `payment_intent.succeeded`
   - `invoice.payment_succeeded`
   - `customer.subscription.deleted`
   - `customer.subscription.updated`
5. Copia el **Signing secret** y úsalo en las variables de entorno

---

## ✅ Verificación

1. **Probar Edge Functions localmente**:
   ```bash
   supabase functions serve
   ```

2. **Desplegar a producción**:
   ```bash
   supabase functions deploy create-payment-intent
   supabase functions deploy confirm-payment
   supabase functions deploy create-subscription
   supabase functions deploy cancel-subscription
   supabase functions deploy update-subscription
   supabase functions deploy stripe-webhook
   ```

3. **Probar con Stripe Test Mode**:
   - Usa tarjetas de prueba: `4242 4242 4242 4242`
   - CVV: cualquier 3 dígitos
   - Fecha: cualquier fecha futura

---

## 📝 Notas Importantes

1. **Nunca** expongas `STRIPE_SECRET_KEY` en el cliente
2. **Siempre** verifica webhooks con el signing secret
3. **Usa** Stripe Test Mode durante desarrollo
4. **Mantén** sincronización entre Stripe y tu BD
5. **Maneja** errores de pago gracefully

---

**¿Listo para implementar?** 🚀






















