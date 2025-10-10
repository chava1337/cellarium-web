import { supabase } from './supabase';
import { QrToken } from '../types';
import * as Crypto from 'expo-crypto';

export class QrService {
  // Generar un nuevo token QR para una sucursal
  static async generateQrToken(branchId: string, expirationHours: number = 24): Promise<QrToken> {
    try {
      // Generar token único
      const token = Crypto.randomUUID();
      
      // Calcular fecha de expiración
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + expirationHours);

      // Crear token en la base de datos
      const { data, error } = await supabase
        .from('qr_tokens')
        .insert({
          branch_id: branchId,
          token: token,
          expires_at: expiresAt.toISOString(),
          is_active: true,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error generating QR token:', error);
      throw error;
    }
  }

  // Validar un token QR
  static async validateQrToken(token: string): Promise<QrToken | null> {
    try {
      const { data, error } = await supabase
        .from('qr_tokens')
        .select(`
          id,
          branch_id,
          token,
          expires_at,
          is_active,
          created_at,
          branches (
            id,
            name,
            address,
            phone,
            email
          )
        `)
        .eq('token', token)
        .eq('is_active', true)
        .single();

      if (error) {
        return null;
      }

      // Verificar que el token no haya expirado
      const now = new Date();
      const expiresAt = new Date(data.expires_at);
      
      if (now > expiresAt) {
        // Marcar token como inactivo si ha expirado
        await supabase
          .from('qr_tokens')
          .update({ is_active: false })
          .eq('id', data.id);
        
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error validating QR token:', error);
      return null;
    }
  }

  // Obtener tokens QR activos de una sucursal
  static async getActiveTokensByBranch(branchId: string): Promise<QrToken[]> {
    try {
      const { data, error } = await supabase
        .from('qr_tokens')
        .select('*')
        .eq('branch_id', branchId)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching active tokens:', error);
      throw error;
    }
  }

  // Desactivar un token QR
  static async deactivateToken(tokenId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('qr_tokens')
        .update({ is_active: false })
        .eq('id', tokenId);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error deactivating token:', error);
      throw error;
    }
  }

  // Desactivar todos los tokens de una sucursal
  static async deactivateAllTokensByBranch(branchId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('qr_tokens')
        .update({ is_active: false })
        .eq('branch_id', branchId)
        .eq('is_active', true);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error deactivating all tokens:', error);
      throw error;
    }
  }

  // Limpiar tokens expirados
  static async cleanupExpiredTokens(): Promise<void> {
    try {
      const { error } = await supabase
        .from('qr_tokens')
        .update({ is_active: false })
        .eq('is_active', true)
        .lt('expires_at', new Date().toISOString());

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error cleaning up expired tokens:', error);
      throw error;
    }
  }

  // Renovar un token QR (crear uno nuevo y desactivar el anterior)
  static async renewToken(oldTokenId: string, branchId: string, expirationHours: number = 24): Promise<QrToken> {
    try {
      // Desactivar token anterior
      await this.deactivateToken(oldTokenId);

      // Generar nuevo token
      const newToken = await this.generateQrToken(branchId, expirationHours);

      return newToken;
    } catch (error) {
      console.error('Error renewing token:', error);
      throw error;
    }
  }

  // Obtener estadísticas de tokens QR
  static async getTokenStats(branchId: string): Promise<{
    total_tokens: number;
    active_tokens: number;
    expired_tokens: number;
    used_tokens: number;
  }> {
    try {
      const { data: allTokens, error: allError } = await supabase
        .from('qr_tokens')
        .select('id, is_active, expires_at')
        .eq('branch_id', branchId);

      if (allError) {
        throw allError;
      }

      const now = new Date();
      const stats = {
        total_tokens: allTokens?.length || 0,
        active_tokens: allTokens?.filter(token => 
          token.is_active && new Date(token.expires_at) > now
        ).length || 0,
        expired_tokens: allTokens?.filter(token => 
          new Date(token.expires_at) <= now
        ).length || 0,
        used_tokens: 0, // Se puede calcular consultando guest_sessions
      };

      // Calcular tokens usados
      const { data: usedTokens, error: usedError } = await supabase
        .from('guest_sessions')
        .select('qr_token_id')
        .eq('branch_id', branchId);

      if (!usedError && usedTokens) {
        const uniqueUsedTokens = new Set(usedTokens.map(session => session.qr_token_id));
        stats.used_tokens = uniqueUsedTokens.size;
      }

      return stats;
    } catch (error) {
      console.error('Error fetching token stats:', error);
      throw error;
    }
  }
}
