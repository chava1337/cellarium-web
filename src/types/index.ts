// Tipos principales de la aplicación Cellarium
import { GlobalWine } from '../services/GlobalWineCatalogService';

/**
 * Normaliza el rol de usuario para compatibilidad con BD
 * Convierte 'staff' (legacy) a 'personal' (canonical).
 * Insensible a mayúsculas para evitar fallback a 'personal' si la BD devuelve 'Supervisor', etc.
 */
export function normalizeRole(role: string | null | undefined): User['role'] {
  if (role == null || typeof role !== 'string') return 'personal';
  const r = role.trim().toLowerCase();
  if (!r) return 'personal';
  if (r === 'staff') return 'personal';
  const validRoles: User['role'][] = ['owner', 'gerente', 'sommelier', 'supervisor', 'personal'];
  return validRoles.includes(r as User['role']) ? (r as User['role']) : 'personal';
}

export interface Wine {
  id: string;
  name: string;
  grape_variety: string;
  region: string;
  country: string;
  vintage: number | string; // Puede ser un número o string con múltiples añadas separadas por comas
  alcohol_content?: number | string | null;
  description: string;
  price: number;
  price_per_glass?: number;
  image_url?: string;
  // Características sensoriales (UI sensorial animada)
  body_level?: number; // 1-5 (ligero a robusto)
  sweetness_level?: number; // 1-5 (seco a dulce)
  acidity_level?: number; // 1-5 (baja a alta)
  intensity_level?: number; // 1-5 (sutil a intenso) - Usado como tannin para tintos
  fizziness_level?: number; // 1-5 (para espumosos - burbujas)
  // Información adicional generada por IA
  winery?: string;
  food_pairings?: string[];
  tasting_notes?: string;
  serving_temperature?: string;
  /** Origen en wines_canonical al agregar desde catálogo global (evita mezclar filas con el mismo nombre). */
  canonical_wine_id?: string | null;
  type?: 'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified';
  // Disponibilidad y stock
  available_by_glass?: boolean;
  available_by_bottle?: boolean;
  stock_quantity?: number;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  created_at: string;
  updated_at: string;
  /** Sucursal bloqueada por límite de suscripción (p. ej. downgrade a free). */
  is_locked?: boolean;
  is_main?: boolean;
}

export interface WineStock {
  id: string;
  wine_id: string;
  branch_id: string;
  quantity: number;
  min_stock: number;
  wine?: Wine;
  branch?: Branch;
  created_at: string;
  updated_at: string;
}

export interface QrToken {
  id: string;
  branch_id: string;
  token: string;
  type: 'guest' | 'admin_invite';
  expires_at: string;
  is_active: boolean;
  max_uses: number;
  uses_count: number;
  created_by: string;
  created_at: string;
}

export interface GuestSession {
  id: string;
  qr_token_id: string;
  branch_id: string;
  session_start: string;
  session_end?: string;
  created_at: string;
}

export interface InventoryMovement {
  id: string;
  wine_id: string;
  branch_id: string;
  movement_type: 'in' | 'out' | 'adjustment';
  quantity: number;
  reason: string;
  created_at: string;
}

/** Planes almacenados en public.users.subscription_plan */
export type CanonicalPlanId = 'cafe' | 'bistro' | 'trattoria' | 'grand-maison';

export interface User {
  id: string;
  email: string;
  username: string;
  /** Undefined/unknown mientras el perfil no está hidratado (evita permisos temporales). */
  role?: 'owner' | 'gerente' | 'sommelier' | 'supervisor' | 'personal';
  status: 'pending' | 'active' | 'inactive' | 'loading';
  branch_id?: string;
  owner_id?: string; // ID del owner al que pertenece este usuario
  invited_by?: string;
  approved_by?: string;
  approved_at?: string;
  /** Plan canónico en BD (inactive/expirado se muestra como cafe vía getEffectivePlan). */
  subscription_plan?: CanonicalPlanId;
  subscription_expires_at?: string;
  subscription_branches_count?: number;
  subscription_active?: boolean;
  subscription_cancel_at_period_end?: boolean;
  subscription_branch_addons_count?: number;
  // Nuevos campos de suscripción y pagos
  subscription_id?: string;
  stripe_customer_id?: string;
  payment_method_id?: string;
  billing_email?: string;
  /** password | google | admin_invite. Set by trigger or Edge. */
  signup_method?: string | null;
  /** For owners: true when email verified (Google or after verify-owner-email). */
  owner_email_verified?: boolean;
  /** Origen de facturación (backend); Apple IAP solo en iOS. */
  billing_provider?: 'none' | 'stripe' | 'apple' | null;
  created_at: string;
  updated_at: string;
}

// Tipos para navegación
export type RootStackParamList = {
  Bootstrap: undefined;
  Welcome: undefined;
  OwnerRegistration: undefined;
  Login: undefined;
  AdminLogin: undefined;
  AdminRegistration: { qrToken?: string; branchName?: string; branchId?: string; ownerId?: string };
  AdminDashboard: undefined;
  WineCatalog: { branchId?: string; isGuest?: boolean; guestToken?: string };
  QrProcessor: { qrData?: any; token?: string };
  UserManagement: undefined;
  TastingNotes: undefined;
  QrGeneration: undefined;
  BranchManagement: undefined;
  WineManagement: undefined;
  InventoryManagement: { branchId: string };
  QrScanner: undefined;
  TastingExamsList: undefined;
  CreateTastingExam: undefined;
  TakeTastingExam: { examId: string };
  TastingExamResults: { examId: string };
  Settings: undefined;
  CocktailManagement: undefined;
  GlobalWineCatalog: undefined;
  AddWineToCatalog: { wine: GlobalWine };
  AppAuth: { mode?: 'login' | 'register' };
  AppNavigator: undefined;
  Subscriptions: { openVerifyEmail?: boolean } | undefined;
  OwnerEmailVerification: undefined;
};

// Tipos para el contexto de autenticación
export type UserDataStatus = 'ok' | 'loading' | 'fallback' | 'error';

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  /** Session from Supabase auth (null when signed out). */
  session: { user: { id: string; email?: string } } | null;
  /** 'fallback' = user from session after DB timeout/failure; show "Reintentando…" banner */
  userDataStatus?: UserDataStatus;
  /** true cuando el perfil está hidratado (userDataStatus==='ok'). Fuente de verdad para permitir acciones owner/staff. */
  profileReady?: boolean;
  /** Mensaje cuando la sesión se cerró por perfil faltante (no row en public.users). Ej: "Tu sesión expiró o tu cuenta ya no existe." */
  profileMissingMessage?: string | null;
  signIn: (email: string, password: string, roleData?: any) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Reload user from DB using current session (for retry after timeout). */
  refreshUserData: () => Promise<void>;
  currentBranch: Branch | null;
}

// Tipos para el contexto de sesión de invitado
export interface GuestContextType {
  session: GuestSession | null;
  currentBranch: Branch | null;
  qrToken: QrToken | null;
  startSession: (token: string) => Promise<void>;
  endSession: () => Promise<void>;
}

// Tipos para filtros de vinos
export interface WineFilters {
  grape_variety?: string;
  region?: string;
  country?: string;
  price_min?: number;
  price_max?: number;
  vintage_min?: number;
  vintage_max?: number;
}

// Tipos para estadísticas
export interface WineStats {
  total_wines: number;
  total_stock: number;
  low_stock_wines: number;
  total_value: number;
}

export interface BranchStats {
  branch_id: string;
  branch_name: string;
  total_wines: number;
  total_stock: number;
  low_stock_wines: number;
  total_value: number;
}

// =====================================================
// Tipos para Suscripciones y Pagos
// =====================================================

export type SubscriptionPlan = CanonicalPlanId;
export type SubscriptionStatus = 'active' | 'canceled' | 'expired' | 'past_due' | 'trialing' | 'pending';
export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'canceled';
export type PaymentMethod = 'card' | 'bank_transfer' | 'cash' | 'other';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void' | 'uncollectible';

export interface Subscription {
  id: string;
  user_id: string;
  owner_id: string;
  plan_id: SubscriptionPlan;
  plan_name: string;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at?: string;
  stripe_subscription_id?: string;
  stripe_customer_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  subscription_id?: string;
  user_id: string;
  owner_id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  payment_method: PaymentMethod;
  payment_method_details?: Record<string, any>;
  stripe_payment_intent_id?: string;
  stripe_charge_id?: string;
  description?: string;
  failure_reason?: string;
  failure_code?: string;
  invoice_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface Invoice {
  id: string;
  payment_id?: string;
  user_id: string;
  owner_id: string;
  subscription_id?: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  invoice_date: string;
  due_date?: string;
  paid_at?: string;
  pdf_url?: string;
  pdf_path?: string;
  stripe_invoice_id?: string;
  customer_name?: string;
  customer_email?: string;
  customer_address?: Record<string, any>;
  line_items?: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
  }>;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}




