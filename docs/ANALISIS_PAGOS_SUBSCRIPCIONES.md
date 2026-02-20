# 💳 Análisis: Sistema de Pagos y Subscripciones

## 📊 Estado Actual

### ✅ **Lo que YA está implementado:**

1. **UI de Suscripciones** (`SubscriptionsScreen.tsx`)
   - ✅ Pantalla con 3 planes: Gratis, Básico, Sucursal Adicional
   - ✅ Selección de planes
   - ✅ Visualización de características y limitaciones
   - ✅ Botón de suscripción (simulado)

2. **Lógica de Permisos** (`subscriptionPermissions.ts`)
   - ✅ Verificación de características bloqueadas
   - ✅ Verificación de límites (sucursales, vinos, gerentes)
   - ✅ Validación de suscripción activa
   - ✅ Integración con `AdminDashboardScreen`

3. **Integración en Dashboard**
   - ✅ Bloqueo de funciones según plan
   - ✅ Navegación a pantalla de suscripciones
   - ✅ Alertas cuando se intenta usar función bloqueada

4. **Campos en Base de Datos** (tabla `users`)
   - ✅ `subscription_plan` (free, basic, additional-branch)
   - ✅ `subscription_expires_at` (fecha de expiración)
   - ✅ `subscription_branches_count` (límite de sucursales)
   - ✅ `subscription_active` (estado activo/inactivo)

### ❌ **Lo que FALTA implementar:**

1. **Sistema de Pagos Real**
   - ❌ Integración con pasarela de pagos (Stripe, PayPal, Mercado Pago)
   - ❌ Procesamiento de tarjetas de crédito
   - ❌ Manejo de pagos recurrentes
   - ❌ Webhooks para confirmación de pagos

2. **Base de Datos Completa**
   - ❌ Tabla `subscriptions` (historial de suscripciones)
   - ❌ Tabla `payments` o `transactions` (historial de pagos)
   - ❌ Tabla `invoices` (facturas)
   - ❌ Tabla `payment_methods` (métodos de pago guardados)

3. **Gestión de Suscripciones**
   - ❌ Renovación automática
   - ❌ Cancelación de suscripción
   - ❌ Cambio de plan (upgrade/downgrade)
   - ❌ Período de gracia al expirar
   - ❌ Notificaciones de expiración

4. **Facturación**
   - ❌ Generación de facturas
   - ❌ Historial de facturas
   - ❌ Descarga de facturas (PDF)
   - ❌ Facturación automática mensual

5. **Panel de Administración**
   - ❌ Vista de suscripción actual
   - ❌ Historial de pagos
   - ❌ Métodos de pago guardados
   - ❌ Cambio de método de pago
   - ❌ Cancelación de suscripción
   - ❌ Renovación manual

6. **Validaciones y Seguridad**
   - ❌ Verificación de límites en tiempo real
   - ❌ Bloqueo automático al expirar
   - ❌ Validación de pagos antes de activar
   - ❌ Manejo de pagos fallidos
   - ❌ Reintentos automáticos

7. **Notificaciones**
   - ❌ Email de confirmación de pago
   - ❌ Email de renovación exitosa
   - ❌ Email de pago fallido
   - ❌ Email de expiración próxima
   - ❌ Email de cancelación

8. **Reportes y Analytics**
   - ❌ Revenue por plan
   - ❌ Churn rate (tasa de cancelación)
   - ❌ MRR (Monthly Recurring Revenue)
   - ❌ ARR (Annual Recurring Revenue)
   - ❌ Conversión de planes

---

## 🎯 Recomendaciones de Implementación

### **FASE 1: Base de Datos (Prioridad ALTA)**

#### 1.1 Crear tabla `subscriptions`
```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL, -- 'free', 'basic', 'additional-branch'
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'expired', 'pending')),
  current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  canceled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 1.2 Crear tabla `payments`
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MXN',
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  payment_method TEXT NOT NULL, -- 'card', 'bank_transfer', etc.
  payment_provider TEXT, -- 'stripe', 'mercadopago', etc.
  provider_payment_id TEXT, -- ID del pago en el proveedor
  invoice_url TEXT, -- URL de la factura
  failure_reason TEXT, -- Razón si falla
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 1.3 Crear tabla `invoices`
```sql
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_number TEXT UNIQUE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MXN',
  status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'paid', 'void')),
  pdf_url TEXT, -- URL del PDF de la factura
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  paid_at TIMESTAMP WITH TIME ZONE
);
```

#### 1.4 Actualizar tabla `users`
```sql
-- Agregar campos adicionales si no existen
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_method_id TEXT; -- ID del método de pago guardado
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_email TEXT; -- Email para facturación
```

---

### **FASE 2: Integración de Pagos (Prioridad ALTA)**

#### 2.1 Elegir Proveedor de Pagos

**Recomendación: Stripe** (para México)
- ✅ Soporte para tarjetas mexicanas
- ✅ Webhooks robustos
- ✅ SDK para React Native
- ✅ Manejo de suscripciones recurrentes
- ✅ Facturación automática
- ✅ Dashboard completo

**Alternativa: Mercado Pago**
- ✅ Popular en México
- ✅ Múltiples métodos de pago
- ✅ SDK disponible

#### 2.2 Instalar Dependencias
```bash
npm install @stripe/stripe-react-native
# o
npm install react-native-mercadopago-checkout
```

#### 2.3 Crear Servicio de Pagos
- `src/services/PaymentService.ts`
  - Procesar pago inicial
  - Crear suscripción recurrente
  - Manejar webhooks
  - Cancelar suscripción
  - Actualizar método de pago

---

### **FASE 3: Servicio de Suscripciones (Prioridad ALTA)**

#### 3.1 Crear `SubscriptionService.ts`
```typescript
- createSubscription(userId, planId, paymentMethodId)
- cancelSubscription(subscriptionId)
- updateSubscription(subscriptionId, newPlanId)
- renewSubscription(subscriptionId)
- checkSubscriptionStatus(userId)
- getSubscriptionHistory(userId)
```

#### 3.2 Crear Funciones de Base de Datos
- Función para verificar expiración automática
- Función para renovar suscripciones
- Función para cancelar al final del período
- Trigger para actualizar `updated_at`

---

### **FASE 4: UI Mejorada (Prioridad MEDIA)**

#### 4.1 Mejorar `SubscriptionsScreen.tsx`
- ✅ Mostrar suscripción actual
- ✅ Mostrar fecha de expiración
- ✅ Botón para cancelar suscripción
- ✅ Botón para cambiar plan
- ✅ Formulario de método de pago
- ✅ Historial de pagos

#### 4.2 Crear `PaymentMethodScreen.tsx`
- Agregar tarjeta de crédito
- Ver métodos guardados
- Eliminar método de pago
- Establecer método por defecto

#### 4.3 Crear `BillingHistoryScreen.tsx`
- Lista de pagos realizados
- Descargar facturas
- Ver detalles de cada pago

---

### **FASE 5: Validaciones y Bloqueos (Prioridad ALTA)**

#### 5.1 Middleware de Validación
- Verificar límites antes de crear recurso
- Bloquear acciones si suscripción expirada
- Mostrar mensajes claros de límites alcanzados

#### 5.2 Funciones de Verificación
- `checkCanCreateBranch(userId)`
- `checkCanAddWine(userId)`
- `checkCanAddManager(userId)`
- `checkFeatureAccess(userId, featureId)`

---

### **FASE 6: Notificaciones (Prioridad MEDIA)**

#### 6.1 Emails Automáticos
- Confirmación de pago
- Recordatorio de expiración (7 días antes)
- Notificación de expiración
- Notificación de pago fallido
- Confirmación de cancelación

#### 6.2 Notificaciones en App
- Push notifications para eventos importantes
- Badges en el dashboard

---

### **FASE 7: Reportes y Analytics (Prioridad BAJA)**

#### 7.1 Dashboard de Analytics (Solo para admins)
- MRR (Monthly Recurring Revenue)
- ARR (Annual Recurring Revenue)
- Churn rate
- Conversión por plan
- Revenue por mes

---

## 📋 Plan de Implementación Recomendado

### **Sprint 1 (2 semanas): Base de Datos**
1. Crear migraciones para tablas nuevas
2. Agregar campos faltantes a `users`
3. Crear funciones de base de datos
4. Crear triggers para actualización automática
5. Implementar RLS policies

### **Sprint 2 (2 semanas): Integración de Pagos**
1. Configurar Stripe/Mercado Pago
2. Crear `PaymentService.ts`
3. Implementar procesamiento de pagos
4. Implementar webhooks
5. Testing de pagos

### **Sprint 3 (2 semanas): Servicio de Suscripciones**
1. Crear `SubscriptionService.ts`
2. Implementar creación de suscripciones
3. Implementar cancelación
4. Implementar renovación automática
5. Testing completo

### **Sprint 4 (1 semana): UI Mejorada**
1. Mejorar `SubscriptionsScreen.tsx`
2. Crear `PaymentMethodScreen.tsx`
3. Crear `BillingHistoryScreen.tsx`
4. Integrar con servicios

### **Sprint 5 (1 semana): Validaciones y Notificaciones**
1. Implementar middleware de validación
2. Configurar emails automáticos
3. Implementar notificaciones push
4. Testing end-to-end

---

## 🔧 Archivos a Crear/Modificar

### **Nuevos Archivos:**
1. `supabase/migrations/037_create_subscriptions_tables.sql`
2. `src/services/PaymentService.ts`
3. `src/services/SubscriptionService.ts`
4. `src/screens/PaymentMethodScreen.tsx`
5. `src/screens/BillingHistoryScreen.tsx`
6. `src/utils/subscriptionValidation.ts`
7. `src/hooks/useSubscription.ts`

### **Archivos a Modificar:**
1. `src/screens/SubscriptionsScreen.tsx` - Integrar pagos reales
2. `src/utils/subscriptionPermissions.ts` - Mejorar validaciones
3. `src/types/index.ts` - Agregar tipos de suscripciones y pagos
4. `src/screens/AdminDashboardScreen.tsx` - Mejorar bloqueos

---

## 🎯 Próximos Pasos Inmediatos

### **1. Decidir Proveedor de Pagos**
- [ ] Evaluar Stripe vs Mercado Pago
- [ ] Crear cuenta de prueba
- [ ] Obtener API keys

### **2. Crear Estructura de Base de Datos**
- [ ] Crear migración `037_create_subscriptions_tables.sql`
- [ ] Ejecutar migración en desarrollo
- [ ] Verificar estructura

### **3. Implementar Servicio Básico**
- [ ] Crear `SubscriptionService.ts` con funciones básicas
- [ ] Crear `PaymentService.ts` con integración de pagos
- [ ] Testing básico

### **4. Mejorar UI**
- [ ] Actualizar `SubscriptionsScreen.tsx` con información real
- [ ] Agregar formulario de pago
- [ ] Mostrar estado de suscripción actual

---

## 💡 Consideraciones Importantes

1. **Seguridad**: Nunca procesar pagos directamente en el cliente. Usar webhooks del proveedor.

2. **Idioma**: Implementar traducciones bilingües para toda la UI de pagos.

3. **Testing**: Usar modo sandbox/test del proveedor antes de producción.

4. **Backup**: Mantener sincronización entre proveedor de pagos y base de datos.

5. **Legal**: Considerar términos de servicio y política de reembolsos.

6. **UX**: Hacer el proceso de pago lo más simple posible (menos fricción = más conversiones).

---

## 📊 Métricas a Monitorear

- Tasa de conversión (free → paid)
- Tasa de churn (cancelaciones)
- Tiempo promedio hasta primera conversión
- Revenue por usuario (ARPU)
- Lifetime Value (LTV)
- Customer Acquisition Cost (CAC)

---

**¿Listo para implementar?** 🚀

**Recomendación**: Empezar con FASE 1 (Base de Datos) y FASE 2 (Integración de Pagos) en paralelo.

