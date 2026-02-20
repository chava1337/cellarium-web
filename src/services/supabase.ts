/**
 * Re-exporta el cliente único desde lib/supabase.
 * Tipos Database se mantienen aquí para servicios que los usan.
 */
export { supabase } from '../lib/supabase';

// Tipos de base de datos
export interface Database {
  public: {
    Tables: {
      branches: {
        Row: {
          id: string;
          name: string;
          address: string;
          phone: string;
          email: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          address: string;
          phone: string;
          email: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          address?: string;
          phone?: string;
          email?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      wines: {
        Row: {
          id: string;
          name: string;
          grape_variety: string;
          region: string;
          country: string;
          vintage: number;
          alcohol_content: number;
          description: string;
          price: number;
          image_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          grape_variety: string;
          region: string;
          country: string;
          vintage: number;
          alcohol_content: number;
          description: string;
          price: number;
          image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          grape_variety?: string;
          region?: string;
          country?: string;
          vintage?: number;
          alcohol_content?: number;
          description?: string;
          price?: number;
          image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      wine_branch_stock: {
        Row: {
          id: string;
          wine_id: string;
          branch_id: string;
          quantity: number;
          min_stock: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wine_id: string;
          branch_id: string;
          quantity: number;
          min_stock: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          wine_id?: string;
          branch_id?: string;
          quantity?: number;
          min_stock?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      qr_tokens: {
        Row: {
          id: string;
          branch_id: string;
          token: string;
          expires_at: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          token: string;
          expires_at: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          branch_id?: string;
          token?: string;
          expires_at?: string;
          is_active?: boolean;
          created_at?: string;
        };
      };
      guest_sessions: {
        Row: {
          id: string;
          qr_token_id: string;
          branch_id: string;
          session_start: string;
          session_end: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          qr_token_id: string;
          branch_id: string;
          session_start: string;
          session_end?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          qr_token_id?: string;
          branch_id?: string;
          session_start?: string;
          session_end?: string | null;
          created_at?: string;
        };
      };
    };
  };
}



