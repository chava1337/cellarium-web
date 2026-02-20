# 📋 RECOPILACIÓN COMPLETA: SISTEMA DE SUSCRIPCIONES CELLARIUM

## A) GATING / SUSCRIPCIONES

### A.1) Archivo: `src/utils/subscriptionPermissions.ts` (CONTENIDO COMPLETO)

```typescript
import { User } from '../types';

export type SubscriptionPlan = 'free' | 'basic' | 'additional-branch';

export interface PlanLimits {
  maxBranches: number;
  maxWines: number;
  maxManagers: number;
  blockedFeatures: string[];
}

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  free: {
    maxBranches: 1,
    maxWines: 5,
    maxManagers: 1,
    blockedFeatures: [
      'Inventario y Análisis',
      'Catas y Degustaciones',
      'Gestión de Sucursales adicionales',
    ],
  },
  basic: {
    maxBranches: 1,
    maxWines: 100,
    maxManagers: -1, // Ilimitado
    blockedFeatures: [],
  },
  'additional-branch': {
    maxBranches: -1, // Sin límite
    maxWines: -1, // Sin límite
    maxManagers: -1, // Ilimitado
    blockedFeatures: [],
  },
};

export const checkSubscriptionFeature = (user: User | null, featureId: string): boolean => {
  if (!user || user.role !== 'owner') return true; // Solo owners tienen límites

  const plan = user.subscription_plan || 'free';
  const limits = PLAN_LIMITS[plan];
  
  // Si el plan básico bloquea la función
  if (limits.blockedFeatures.includes(featureId)) {
    return false;
  }

  return true;
};

export const checkSubscriptionLimit = (
  user: User | null,
  limitType: 'branches' | 'wines' | 'managers',
  currentCount: number
): boolean => {
  if (!user || user.role !== 'owner') return true; // Solo owners tienen límites

  const plan = user.subscription_plan || 'free';
  const limits = PLAN_LIMITS[plan];
  
  const maxLimit = limits[`max${limitType.charAt(0).toUpperCase() + limitType.slice(1)}` as keyof PlanLimits] as number;
  
  // -1 significa ilimitado
  if (maxLimit === -1) return true;
  
  return currentCount < maxLimit;
};

export const getSubscriptionPlanName = (plan: SubscriptionPlan): string => {
  const names: Record<SubscriptionPlan, string> = {
    free: 'Gratis',
    basic: 'Básico',
    'additional-branch': 'Sucursal Adicional',
  };
  return names[plan];
};

export const isSubscriptionActive = (user: User | null): boolean => {
  if (!user) return false;
  
  const active = user.subscription_active ?? true;
  
  if (!active) return false;
  
  // Verificar si la suscripción no ha expirado
  if (user.subscription_expires_at) {
    const expiresAt = new Date(user.subscription_expires_at);
    const now = new Date();
    return expiresAt > now;
  }
  
  return true;
};
```

### A.2) Referencias de `checkSubscriptionFeature`:

**Ubicación:** `src/screens/AdminDashboardScreen.tsx`
- **Línea 24:** `import { checkSubscriptionFeature } from '../utils/subscriptionPermissions';`
- **Línea 222:** `const blocked = !checkSubscriptionFeature(user, item.id);`
- **Contexto:** Se usa en `useMemo` para calcular `blockedFeatureIds` (Set de feature IDs bloqueadas). Se itera sobre `filteredMenuItems` y se verifica cada `item.id` contra el plan del usuario.
- **Uso:** Cuando un item del menú está bloqueado, muestra un Alert con opción de navegar a `Subscriptions`.

**NOTA:** `checkSubscriptionLimit` existe pero NO se usa actualmente en el código. Está disponible para validar límites de branches/wines/managers.

---

## B) AUTH / USER PROFILE

### B.1) Archivo: `src/contexts/AuthContext.tsx` (CONTENIDO COMPLETO)

**Ruta:** `src/contexts/AuthContext.tsx` (747 líneas)

**Funciones clave:**
- `loadUserData(authUser, deepLinkUrl?)`: Carga datos del usuario desde `users` table
- `createOwnerUser(authUser)`: Crea usuario owner si no existe
- `createDefaultBranch(ownerId, ownerName)`: Crea sucursal principal automáticamente
- `signIn(email, password)`: Autenticación con Supabase Auth
- `signOut()`: Cerrar sesión

**Listener de auth:**
```typescript
supabase.auth.onAuthStateChange(async (event, session) => {
  if (session?.user) {
    await loadUserData(session.user);
  } else {
    setUser(null);
    setLoading(false);
  }
});
```

**Carga de perfil:**
- Consulta: `supabase.from('users').select('*').eq('id', authUser.id).single()`
- Campos cargados: `id`, `email`, `name`, `role`, `status`, `branch_id`, `owner_id`, `created_at`, `updated_at`
- También carga campos de suscripción: `subscription_plan`, `subscription_expires_at`, `subscription_branches_count`, `subscription_active`, `subscription_id`, `stripe_customer_id`

**setUser se llama desde:**
- `loadUserData()` después de cargar desde BD
- `createOwnerUser()` después de crear usuario
- `signOut()` para limpiar estado

### B.2) Tipos de User: `src/types/index.ts` (Líneas 90-113)

```typescript
export interface User {
  id: string;
  email: string;
  username: string;
  role: 'owner' | 'gerente' | 'sommelier' | 'supervisor' | 'personal';
  status: 'pending' | 'active' | 'inactive';
  branch_id?: string;
  owner_id?: string; // ID del owner al que pertenece este usuario
  invited_by?: string;
  approved_by?: string;
  approved_at?: string;
  // Campos de suscripción (legacy - mantener para compatibilidad)
  subscription_plan?: 'free' | 'basic' | 'additional-branch';
  subscription_expires_at?: string;
  subscription_branches_count?: number;
  subscription_active?: boolean;
  // Nuevos campos de suscripción y pagos
  subscription_id?: string;
  stripe_customer_id?: string;
  payment_method_id?: string;
  billing_email?: string;
  created_at: string;
  updated_at: string;
}
```

---

## C) ROLES / PERMISOS

### C.1) Definición de roles:

**Ubicación:** `src/types/index.ts` (línea 94)
```typescript
role: 'owner' | 'gerente' | 'sommelier' | 'supervisor' | 'personal';
```

**Dónde se guardan:** Campo `role` en tabla `users` (Supabase)

### C.2) Archivo: `src/utils/permissions.ts` (CONTENIDO COMPLETO)

```typescript
// Sistema de permisos jerárquicos para Cellarium

export type UserRole = 'owner' | 'gerente' | 'sommelier' | 'supervisor' | 'staff';

// Jerarquía de roles (de mayor a menor autoridad)
const roleHierarchy: Record<UserRole, number> = {
  owner: 5,
  gerente: 4,
  sommelier: 3,
  supervisor: 2,
  staff: 1,
};

// Verificar si un rol tiene permisos suficientes
export const hasPermission = (userRole: UserRole, requiredRole: UserRole): boolean => {
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
};

// Verificar si un rol puede aprobar a otro rol
export const canApproveRole = (approverRole: UserRole, targetRole: UserRole): boolean => {
  // Owner puede aprobar a todos
  if (approverRole === 'owner') return true;
  
  // Gerente puede aprobar a sommelier, supervisor y staff
  if (approverRole === 'gerente') {
    return targetRole === 'sommelier' || targetRole === 'supervisor' || targetRole === 'staff';
  }
  
  // Sommelier y supervisor no pueden aprobar a nadie
  return false;
};

// Obtener los roles que un usuario puede asignar
export const getAssignableRoles = (userRole: UserRole): UserRole[] => {
  switch (userRole) {
    case 'owner':
      return ['gerente', 'sommelier', 'supervisor', 'staff'];
    case 'gerente':
      return ['sommelier', 'supervisor', 'staff'];
    default:
      return [];
  }
};

// Verificar si un rol puede acceder a gestión de usuarios
export const canManageUsers = (userRole: UserRole): boolean => {
  return userRole === 'owner' || userRole === 'gerente';
};

// Verificar si un rol puede acceder a catas y degustaciones
export const canAccessTasting = (userRole: UserRole): boolean => {
  return userRole === 'owner' || userRole === 'gerente' || userRole === 'sommelier' || userRole === 'staff';
};

// Verificar si un rol puede generar QR
export const canGenerateQr = (userRole: UserRole): boolean => {
  return true; // Todos los roles pueden generar QR
};

// Verificar si un rol puede aprobar usuarios
export const canApproveUsers = (userRole: UserRole): boolean => {
  return userRole === 'owner' || userRole === 'gerente';
};

// Verificar si un rol puede gestionar vinos
export const canManageWines = (userRole: UserRole): boolean => {
  return true; // Todos los roles pueden gestionar vinos (con diferentes permisos)
};

// Verificar si un rol puede gestionar inventario
export const canManageInventory = (userRole: UserRole): boolean => {
  return true; // Todos los roles pueden ver inventario (con diferentes permisos)
};

// Verificar si un rol puede ver análisis
export const canViewAnalytics = (userRole: UserRole): boolean => {
  return true; // Todos los roles pueden ver análisis (con diferentes niveles)
};

// Verificar si un rol puede gestionar promociones
export const canManagePromotions = (userRole: UserRole): boolean => {
  return userRole === 'owner' || userRole === 'gerente';
};

// Obtener nombre del rol en español
export const getRoleName = (role: UserRole): string => {
  const roleNames: Record<UserRole, string> = {
    owner: 'Dueño',
    gerente: 'Gerente',
    sommelier: 'Sommelier',
    supervisor: 'Supervisor',
    staff: 'Staff',
  };
  return roleNames[role];
};

// Obtener descripción del rol
export const getRoleDescription = (role: UserRole): string => {
  const descriptions: Record<UserRole, string> = {
    owner: 'Acceso completo al sistema. Puede otorgar cualquier tipo de permiso.',
    gerente: 'Acceso a gestión y puede aprobar Sommelier, Supervisor y Staff.',
    sommelier: 'Acceso a catas y degustaciones. Sin permisos de aprobación.',
    supervisor: 'Acceso básico de supervisión. Sin catas ni aprobaciones.',
    staff: 'Acceso solo a catálogo de vinos y catas. Permisos mínimos.',
  };
  return descriptions[role];
};
```

### C.3) Hook: `src/hooks/useAdminGuard.ts` (CONTENIDO COMPLETO)

```typescript
import { Alert } from 'react-native';
import { useFocusEffect, RouteProp as RNRouteProp } from '@react-navigation/native';
import { useCallback } from 'react';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types';
import { useGuest } from '../contexts/GuestContext';
import { useAuth } from '../contexts/AuthContext';

type NavigationProp = StackNavigationProp<RootStackParamList>;
type RoutePropType<T extends keyof RootStackParamList> = RNRouteProp<RootStackParamList, T>;

interface UseAdminGuardOptions<T extends keyof RootStackParamList> {
  navigation: NavigationProp;
  route: RoutePropType<T>;
  requireAuth?: boolean; // Si true, requiere usuario autenticado además de no ser guest
  allowedRoles?: ('owner' | 'gerente' | 'personal')[]; // Roles permitidos (solo si requireAuth es true)
}

/**
 * Hook para proteger pantallas administrativas contra acceso de guests
 */
export function useAdminGuard<T extends keyof RootStackParamList>({
  navigation,
  route,
  requireAuth = true,
  allowedRoles = ['owner', 'gerente', 'personal'],
}: UseAdminGuardOptions<T>) {
  const { session: guestSession, currentBranch: guestBranch } = useGuest();
  const { user } = useAuth();

  // Detectar si es guest
  const isGuest = useCallback(() => {
    // Prioridad 1: route.params?.isGuest
    if (route.params && 'isGuest' in route.params && route.params.isGuest === true) {
      return true;
    }
    
    // Prioridad 2: useGuest() - si hay sesión o branch de guest
    if (guestSession || guestBranch) {
      return true;
    }
    
    return false;
  }, [route.params, guestSession, guestBranch]);

  // Verificar autenticación y roles
  const hasValidAuth = useCallback(() => {
    if (!requireAuth) return true;
    
    if (!user) return false;
    
    if (user.status !== 'active') return false;
    
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role as any)) {
      return false;
    }
    
    return true;
  }, [user, requireAuth, allowedRoles]);

  // Ejecutar guard en cada focus de la pantalla
  useFocusEffect(
    useCallback(() => {
      // Verificar si es guest
      if (isGuest()) {
        Alert.alert(
          'Acceso restringido',
          'Esta sección es solo para administración. Los comensales no pueden acceder a funciones administrativas.',
          [
            {
              text: 'OK',
              onPress: () => {
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'WineCatalog', params: { isGuest: true } }],
                });
              },
            },
          ],
          { cancelable: false }
        );
        return;
      }

      // Verificar autenticación y roles (solo si no es guest)
      if (requireAuth && !hasValidAuth()) {
        Alert.alert(
          'Acceso restringido',
          'Debes iniciar sesión como administrador para acceder a esta sección.',
          [
            {
              text: 'OK',
              onPress: () => {
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'AdminLogin' }],
                });
              },
            },
          ],
          { cancelable: false }
        );
        return;
      }
    }, [isGuest, hasValidAuth, requireAuth, navigation])
  );
}
```

---

## D) SUCURSALES / BRANCHES

### D.1) Archivo: `src/contexts/BranchContext.tsx` (CONTENIDO COMPLETO)

```typescript
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Branch } from '../types';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

interface BranchContextType {
  currentBranch: Branch | null;
  setCurrentBranch: (branch: Branch) => void;
  availableBranches: Branch[];
  setAvailableBranches: (branches: Branch[]) => void;
  isInitialized: boolean;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

export const useBranch = () => {
  const context = useContext(BranchContext);
  if (context === undefined) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return context;
};

interface BranchProviderProps {
  children: React.ReactNode;
}

export const BranchProvider: React.FC<BranchProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
  const [availableBranches, setAvailableBranches] = useState<Branch[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Cargar sucursales desde la base de datos
  useEffect(() => {
    if (user) {
      loadBranchesFromDB(user);
    } else {
      setAvailableBranches([]);
      setCurrentBranch(null);
      setIsInitialized(true);
    }
  }, [user]);

  const loadBranchesFromDB = async (user: User) => {
    try {
      // Obtener owner_id correcto: si el usuario es owner usa su ID, si no usa owner_id
      const ownerId = user.owner_id || user.id;
      
      console.log(`🏢 Cargando sucursales para ${user.role} (${ownerId})`);
      
      const { data: branches, error } = await supabase
        .from('branches')
        .select('*')
        .eq('owner_id', ownerId);

      if (error) {
        console.error('Error cargando sucursales:', error);
        throw error;
      }

      let filteredBranches: Branch[] = [];
      
      if (user.role === 'owner') {
        // Owner puede ver todas sus sucursales
        filteredBranches = branches || [];
      } else {
        // Otros roles solo pueden ver su sucursal asignada
        filteredBranches = (branches || []).filter(
          branch => branch.id === user.branch_id
        );
      }
      
      console.log(`🏢 Sucursales disponibles para ${user.role}:`, filteredBranches.map(b => b.name));
      
      setAvailableBranches(filteredBranches);
      
      // Establecer sucursal actual basada en el usuario
      if (filteredBranches.length > 0) {
        if (user.role === 'owner') {
          // Para owners, usar la primera sucursal disponible
          setCurrentBranch(filteredBranches[0]);
        } else {
          // Para staff, usar su sucursal asignada
          const assignedBranch = filteredBranches.find(b => b.id === user.branch_id);
          setCurrentBranch(assignedBranch || filteredBranches[0]);
        }
      }
      
      setIsInitialized(true);
    } catch (error) {
      console.error('Error cargando sucursales desde BD:', error);
      setAvailableBranches([]);
      setCurrentBranch(null);
      setIsInitialized(true);
    }
  };

  const value: BranchContextType = {
    currentBranch,
    setCurrentBranch,
    availableBranches,
    setAvailableBranches,
    isInitialized,
  };

  return (
    <BranchContext.Provider value={value}>
      {children}
    </BranchContext.Provider>
  );
};
```

### D.2) Tipos de Branch: `src/types/index.ts` (Líneas 36-44)

```typescript
export interface Branch {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  created_at: string;
  updated_at: string;
}
```

**Relación user-branch:**
- Campo `branch_id` en tabla `users` (opcional)
- Campo `owner_id` en tabla `branches` (obligatorio)
- Owners pueden ver todas sus sucursales (`owner_id` coincide)
- Staff solo ve su sucursal asignada (`branch_id` coincide)

### D.3) Creación/Selección de Sucursal:

**Archivo:** `src/screens/BranchManagementScreen.tsx`
- **Crear:** `supabase.from('branches').insert({ name, owner_id, ... })`
- **Actualizar:** `supabase.from('branches').update({ name, ... }).eq('id', branchId)`
- **Selección:** Se hace desde `AdminDashboardScreen` usando `setCurrentBranch` del contexto

---

## E) VINOS / CATÁLOGO / LÍMITES

### E.1) Servicio de creación de vinos: `src/services/WineService.ts`

**Función principal:** `createWineWithStock()`

```typescript
static async createWineWithStock(
  wine: Omit<Wine, 'id' | 'created_at' | 'updated_at'>,
  branchId: string,
  ownerId: string,
  initialStock: number,
  priceByGlass: number,
  priceByBottle: number
): Promise<Wine> {
  // 1. Crear el vino
  const { data: wineData, error: wineError } = await supabase
    .from('wines')
    .insert({
      ...wine,
      owner_id: ownerId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  // 2. Crear el stock inicial en la sucursal
  const { error: stockError } = await supabase
    .from('wine_branch_stock')
    .insert({
      wine_id: wineData.id,
      branch_id: branchId,
      owner_id: ownerId,
      stock_quantity: initialStock,
      price_by_glass: priceByGlass,
      price_by_bottle: priceByBottle,
      min_stock: Math.max(1, Math.floor(initialStock * 0.2)),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  return wineData;
}
```

### E.2) Agregar vino desde catálogo global: `src/services/GlobalWineCatalogService.ts`

**Función:** `addWineToUserCatalog()` (líneas 767-1116)

- Inserta en `wines` con `owner_id`
- Crea/actualiza `wine_branch_stock` con `branch_id`
- Evita duplicados por `(owner_id, name)`

### E.3) Pantallas donde se agregan vinos:

1. **`src/screens/WineManagementScreen.tsx`**
   - Escaneo de botella con IA
   - Llama a `WineService.createWineWithStock()`
   - Línea 599: `const savedWine = await WineService.createWineWithStock(...)`

2. **`src/screens/AddWineToCatalogScreen.tsx`**
   - Agrega desde catálogo global
   - Llama a `addWineToUserCatalog()` de `GlobalWineCatalogService`

### E.4) Tablas relacionadas:

- **`wines`**: Catálogo de vinos por owner
  - Campos: `id`, `name`, `winery`, `vintage`, `grape_variety`, `type`, `region`, `country`, `alcohol_content`, `description`, `price`, `price_per_glass`, `image_url`, `owner_id`, `created_at`, `updated_at`
  
- **`wine_branch_stock`**: Stock por sucursal
  - Campos: `id`, `wine_id`, `branch_id`, `owner_id`, `stock_quantity`, `min_stock`, `price_by_glass`, `price_by_bottle`, `created_at`, `updated_at`

- **`wines_canonical`**: Catálogo global compartido
  - Campos: `id`, `winery`, `label`, `image_canonical_url`, `grapes`, `region`, `country`, `abv`, `color`, `serving`, `taste_profile`, `flavors`, `is_shared`

### E.5) Validación de límites:

**NOTA:** `checkSubscriptionLimit()` existe pero NO se aplica actualmente en la creación de vinos. Debería validarse antes de:
- Crear nueva sucursal (límite de branches)
- Agregar vino (límite de wines)
- Crear usuario gerente (límite de managers)

---

## F) PAGOS

### F.1) Archivo: `src/services/PaymentService.ts` (CONTENIDO COMPLETO)

```typescript
/**
 * Servicio para gestionar pagos con Stripe
 * NOTA: Las operaciones sensibles (crear PaymentIntent, confirmar pagos)
 * deben hacerse desde Supabase Edge Functions para mantener seguras las claves secretas
 */

import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';
import { Payment, PaymentStatus, PaymentMethod } from '../types';

export interface CreatePaymentIntentData {
  amount: number; // En centavos (ej: 95000 = $950.00 MXN)
  currency?: string; // Por defecto 'MXN'
  description?: string;
  metadata?: Record<string, any>;
}

export interface PaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
}

export interface ConfirmPaymentData {
  paymentIntentId: string;
  paymentMethodId?: string;
}

/**
 * Crea un PaymentIntent en Stripe a través de Edge Function
 */
export async function createPaymentIntent(
  data: CreatePaymentIntentData
): Promise<PaymentIntentResponse> {
  const { data: response, error } = await supabase.functions.invoke('create-payment-intent', {
    body: {
      amount: data.amount,
      currency: data.currency || 'MXN',
      description: data.description,
      metadata: data.metadata,
    },
  });

  if (error) throw error;
  if (!response?.clientSecret || !response?.paymentIntentId) {
    throw new Error('Respuesta inválida del servidor');
  }

  return {
    clientSecret: response.clientSecret,
    paymentIntentId: response.paymentIntentId,
  };
}

/**
 * Confirma un pago después de que el usuario completa el proceso en Stripe
 */
export async function confirmPayment(
  paymentIntentId: string,
  userId: string,
  ownerId: string,
  subscriptionId?: string
): Promise<Payment> {
  // Llamar a Edge Function para confirmar el pago
  const { data: response, error } = await supabase.functions.invoke('confirm-payment', {
    body: {
      paymentIntentId,
      userId,
      ownerId,
      subscriptionId,
    },
  });

  if (error) throw error;

  // Guardar el pago en nuestra base de datos
  const { data: payment, error: dbError } = await supabase
    .from('payments')
    .insert({
      user_id: userId,
      owner_id: ownerId,
      subscription_id: subscriptionId,
      amount: response.amount / 100, // Convertir de centavos a pesos
      currency: response.currency,
      status: response.status === 'succeeded' ? 'completed' : 'failed',
      payment_method: 'card',
      payment_method_details: {
        last4: response.paymentMethod?.card?.last4,
        brand: response.paymentMethod?.card?.brand,
      },
      stripe_payment_intent_id: paymentIntentId,
      stripe_charge_id: response.chargeId,
      description: response.description,
      metadata: response.metadata,
    })
    .select()
    .single();

  if (dbError) throw dbError;
  return payment;
}

/**
 * Obtiene el historial de pagos de un usuario
 */
export async function getPaymentHistory(
  userId: string,
  limit: number = 50
): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/**
 * Obtiene un pago específico por ID
 */
export async function getPayment(paymentId: string): Promise<Payment | null> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .single();

  if (error) return null;
  return data;
}

/**
 * Obtiene un pago por PaymentIntent ID de Stripe
 */
export async function getPaymentByStripeIntentId(
  stripePaymentIntentId: string
): Promise<Payment | null> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('stripe_payment_intent_id', stripePaymentIntentId)
    .single();

  if (error) return null;
  return data;
}
```

### F.2) Edge Functions relacionadas:

**Rutas encontradas:**
- `supabase/functions/create-payment-intent/` (no existe en repo, debe crearse)
- `supabase/functions/confirm-payment/` (no existe en repo, debe crearse)
- `supabase/functions/create-subscription/` (referenciada en `SubscriptionService.ts`)
- `supabase/functions/cancel-subscription/` (referenciada en `SubscriptionService.ts`)
- `supabase/functions/update-subscription/` (referenciada en `SubscriptionService.ts`)

**Edge Functions existentes en repo:**
- `supabase/functions/rate-limiter/index.ts`
- `supabase/functions/delete-user-account/index.ts`
- `supabase/functions/user-created/index.ts`
- `supabase/functions/user-onboarding/index.ts`

### F.3) Deep Links de pago:

**NOTA:** No se encontró uso de `WebBrowser.openAuthSessionAsync` ni deep links de retorno post-pago en el código actual. `SubscriptionsScreen.tsx` actualmente simula pagos actualizando directamente la BD.

---

## G) NAVEGACIÓN (SUSCRIPCIONES)

### G.1) Stack Navigator: `App.tsx` y `src/screens/AppNavigator.tsx`

**En `App.tsx` (Stack principal):**
```typescript
<Stack.Screen 
  name="Subscriptions" 
  component={SubscriptionsScreen}
  options={{ title: 'Suscripciones' }}
/>
```

**En `src/screens/AppNavigator.tsx` (Stack anidado):**
```typescript
<Stack.Screen 
  name="Subscriptions" 
  component={SubscriptionsScreen}
  options={{ title: 'Suscripciones' }}
/>
```

**Ruta en tipos:** `src/types/index.ts` (línea 144)
```typescript
Subscriptions: undefined;
```

### G.2) Navegación hacia/desde suscripciones:

**Desde `AdminDashboardScreen.tsx`:**
- Línea 95: `handleSubscriptions` → `navigation.navigate('Subscriptions')`
- Línea 244: Alert bloqueado → `navigation.navigate('Subscriptions')`

**Pantalla:** `src/screens/SubscriptionsScreen.tsx`
- Navegación de retorno: `navigation.goBack()` después de suscribirse

---

## EXTRA: UI TOKENS E I18N

### EXTRA.1) Tema: `src/theme/cellariumTheme.ts` (CONTENIDO COMPLETO)

```typescript
// Paleta de colores CELLARIUM - tema centralizado
export const CELLARIUM = {
  primary: "#924048",
  primaryDark: "#6f2f37",
  primaryDarker: "#4e2228",
  textOnDark: "rgba(255,255,255,0.92)",
  textOnDarkMuted: "rgba(255,255,255,0.75)",
  chipActiveBg: "rgba(255,255,255,0.14)",
  chipBorder: "rgba(255,255,255,0.16)",
} as const;

// Tokens de diseño para Admin Dashboard
export const CELLARIUM_THEME = {
  admin: {
    bg: '#F6F6F6',
    card: '#FFFFFF',
    text: '#2B2B2B',
    subtext: '#6B6B6B',
    border: 'rgba(0,0,0,0.06)',
    shadow: 'rgba(0,0,0,0.12)',
    wine1: '#5A1F2B',   // burdeos oscuro
    wine2: '#7A2F3A',   // burdeos medio (gradiente)
    wine3: '#8C3A45',   // burdeos claro opcional
    graphite: '#4A4A4A',
    graphite2: '#5A5A5A',
    pillBg: 'rgba(255,255,255,0.18)',
    warning: '#C85A5A', // rojo suave para bloqueados
  }
} as const;
```

### EXTRA.2) i18n: `src/contexts/LanguageContext.tsx` (CONTENIDO COMPLETO - 897 líneas)

**Funciones clave:**
- `t(key: string)`: Traduce una clave
- `getBilingualValue(value, fallback?)`: Obtiene valor bilingüe (es/en)
- `setLanguage(lang: 'es' | 'en')`: Cambia idioma
- `language`: Estado actual ('es' | 'en')

**Claves relacionadas con suscripciones:**
- `admin.subscriptions`: "Suscripciones" / "Subscriptions"
- `admin.subscriptions_sub`: "Planes y facturación" / "Plans and billing"
- `admin.feature_locked`: "Función Bloqueada" / "Feature Locked"
- `admin.feature_locked_msg`: Mensaje de función bloqueada
- `admin.view_plans`: "Ver Planes" / "View Plans"
- `admin.requires_subscription`: "⚠️ Requiere suscripción" / "⚠️ Requires subscription"

---

## RESUMEN TÉCNICO

### Modelo de Datos Inferido:

1. **Tabla `users`:**
   - `id` (UUID, PK)
   - `email` (string)
   - `name` (string)
   - `role` ('owner' | 'gerente' | 'sommelier' | 'supervisor' | 'personal')
   - `status` ('pending' | 'active' | 'inactive')
   - `branch_id` (UUID, FK a branches, nullable)
   - `owner_id` (UUID, FK a users, nullable - apunta al owner del "universo")
   - `subscription_plan` ('free' | 'basic' | 'additional-branch', nullable)
   - `subscription_expires_at` (timestamp, nullable)
   - `subscription_branches_count` (integer, nullable)
   - `subscription_active` (boolean, nullable)
   - `subscription_id` (UUID, FK a subscriptions, nullable)
   - `stripe_customer_id` (string, nullable)
   - `payment_method_id` (string, nullable)
   - `billing_email` (string, nullable)
   - `created_at`, `updated_at` (timestamps)

2. **Tabla `branches`:**
   - `id` (UUID, PK)
   - `name` (string)
   - `address` (string)
   - `phone` (string, nullable)
   - `email` (string, nullable)
   - `owner_id` (UUID, FK a users, NOT NULL)
   - `is_main` (boolean, nullable - marca sucursal principal)
   - `created_at`, `updated_at` (timestamps)

3. **Tabla `subscriptions`:**
   - `id` (UUID, PK)
   - `user_id` (UUID, FK a users)
   - `owner_id` (UUID, FK a users)
   - `plan_id` ('free' | 'basic' | 'additional-branch')
   - `plan_name` (string)
   - `status` ('active' | 'canceled' | 'expired' | 'past_due' | 'trialing' | 'pending')
   - `current_period_start` (timestamp)
   - `current_period_end` (timestamp)
   - `cancel_at_period_end` (boolean)
   - `canceled_at` (timestamp, nullable)
   - `stripe_subscription_id` (string, nullable)
   - `stripe_customer_id` (string, nullable)
   - `metadata` (JSONB, nullable)
   - `created_at`, `updated_at` (timestamps)

4. **Tabla `payments`:**
   - `id` (UUID, PK)
   - `subscription_id` (UUID, FK a subscriptions, nullable)
   - `user_id` (UUID, FK a users)
   - `owner_id` (UUID, FK a users)
   - `amount` (numeric)
   - `currency` (string)
   - `status` ('pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'canceled')
   - `payment_method` ('card' | 'bank_transfer' | 'cash' | 'other')
   - `payment_method_details` (JSONB, nullable)
   - `stripe_payment_intent_id` (string, nullable)
   - `stripe_charge_id` (string, nullable)
   - `description` (string, nullable)
   - `failure_reason` (string, nullable)
   - `failure_code` (string, nullable)
   - `invoice_id` (UUID, FK a invoices, nullable)
   - `metadata` (JSONB, nullable)
   - `created_at`, `updated_at`, `completed_at` (timestamps)

5. **Tabla `wines`:**
   - `id` (UUID, PK)
   - `owner_id` (UUID, FK a users, NOT NULL)
   - `name` (string)
   - `winery` (string, nullable)
   - `vintage` (integer, nullable)
   - `grape_variety` (string)
   - `type` ('red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified')
   - `region` (string)
   - `country` (string)
   - `alcohol_content` (numeric, nullable)
   - `description` (text, nullable)
   - `tasting_notes` (text, nullable)
   - `food_pairings` (array, nullable)
   - `serving_temperature` (string, nullable)
   - `body_level`, `sweetness_level`, `acidity_level`, `intensity_level`, `fizziness_level` (integer 1-5, nullable)
   - `price` (numeric, nullable)
   - `price_per_glass` (numeric, nullable)
   - `image_url` (string, nullable)
   - `created_by` (UUID, FK a users, nullable)
   - `updated_by` (UUID, FK a users, nullable)
   - `created_at`, `updated_at` (timestamps)

6. **Tabla `wine_branch_stock`:**
   - `id` (UUID, PK)
   - `wine_id` (UUID, FK a wines)
   - `branch_id` (UUID, FK a branches)
   - `owner_id` (UUID, FK a users, NOT NULL)
   - `stock_quantity` (integer)
   - `min_stock` (integer)
   - `price_by_glass` (numeric, nullable)
   - `price_by_bottle` (numeric, nullable)
   - `created_at`, `updated_at` (timestamps)

### Lógica de Suscripciones:

- **Solo owners tienen límites:** `checkSubscriptionFeature` retorna `true` si `user.role !== 'owner'`
- **Planes:**
  - `free`: 1 branch, 5 wines, 1 manager, bloquea "Inventario y Análisis", "Catas y Degustaciones", "Gestión de Sucursales adicionales"
  - `basic`: 1 branch, 100 wines, managers ilimitados, sin bloqueos
  - `additional-branch`: branches/wines/managers ilimitados, sin bloqueos
- **Validación de expiración:** `isSubscriptionActive()` verifica `subscription_active` y `subscription_expires_at`
- **Gating de features:** Se aplica en `AdminDashboardScreen` para bloquear items del menú según plan

### Flujo de Auth:

1. Usuario inicia sesión → `supabase.auth.signInWithPassword()`
2. `onAuthStateChange` detecta sesión → llama `loadUserData()`
3. `loadUserData()` consulta `users` table por `id`
4. Si no existe, crea usuario owner con `createOwnerUser()`
5. Si es owner sin branch, crea sucursal principal con `createDefaultBranch()`
6. Actualiza `user` en contexto con datos completos (incluyendo campos de suscripción)

### Flujo de Creación de Vinos:

1. **Desde escaneo:** `WineManagementScreen` → `WineService.createWineWithStock()` → inserta en `wines` y `wine_branch_stock`
2. **Desde catálogo global:** `AddWineToCatalogScreen` → `GlobalWineCatalogService.addWineToUserCatalog()` → inserta en `wines` y `wine_branch_stock`
3. **Validación de límites:** NO implementada actualmente (debería usar `checkSubscriptionLimit()` antes de insertar)

### Servicios de Suscripciones:

- **`SubscriptionService.ts`:** Gestiona suscripciones (crear, cancelar, actualizar, renovar)
- **`PaymentService.ts`:** Gestiona pagos (crear PaymentIntent, confirmar pago, historial)
- **Edge Functions requeridas:** `create-subscription`, `cancel-subscription`, `update-subscription`, `create-payment-intent`, `confirm-payment` (no están en el repo, deben crearse)

### Estado Actual:

- ✅ Gating de features implementado (`checkSubscriptionFeature`)
- ✅ Tipos y servicios de suscripciones definidos
- ✅ UI de suscripciones (`SubscriptionsScreen`) con simulación de pago
- ❌ Validación de límites NO aplicada (branches/wines/managers)
- ❌ Integración real con Stripe NO implementada (solo simulación)
- ❌ Edge Functions de pagos NO existen en repo
- ❌ Webhooks de Stripe NO configurados

