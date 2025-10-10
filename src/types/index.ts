// Tipos principales de la aplicación Cellarium

export interface Wine {
  id: string;
  name: string;
  grape_variety: string;
  region: string;
  country: string;
  vintage: number;
  alcohol_content: number;
  description: string;
  price: number;
  price_per_glass?: number;
  image_url?: string;
  // Características sensoriales (UI sensorial animada)
  body_level?: number; // 1-5 (ligero a robusto)
  sweetness_level?: number; // 1-5 (seco a dulce)
  acidity_level?: number; // 1-5 (baja a alta)
  intensity_level?: number; // 1-5 (sutil a intenso)
  // Información adicional generada por IA
  winery?: string;
  food_pairings?: string[];
  tasting_notes?: string;
  serving_temperature?: string;
  // Disponibilidad y stock
  available_by_glass?: boolean;
  available_by_bottle?: boolean;
  stock_quantity?: number;
  // Promociones y destacados
  is_featured?: boolean;
  is_promotion?: boolean;
  promotion_text?: string;
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

export interface User {
  id: string;
  email: string;
  username: string;
  role: 'owner' | 'gerente' | 'sommelier' | 'supervisor';
  status: 'pending' | 'active' | 'inactive';
  branch_id?: string;
  invited_by?: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

// Tipos para navegación
export type RootStackParamList = {
  Login: undefined;
  AdminLogin: undefined;
  AdminRegistration: { qrToken?: string; branchName?: string; branchId?: string };
  AdminDashboard: undefined;
  WineCatalog: { branchId?: string; isGuest?: boolean };
  QrProcessor: { qrData?: any; token?: string };
  UserManagement: undefined;
  TastingNotes: undefined;
  QrGeneration: undefined;
  BranchManagement: undefined;
  WineManagement: undefined;
  InventoryManagement: { branchId: string };
  Analytics: { branchId: string };
  Promotions: undefined;
  QrScanner: undefined;
};

// Tipos para el contexto de autenticación
export interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
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


