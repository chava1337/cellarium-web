/**
 * Servicio para generar tokens QR reales en Supabase
 * Reemplaza la generación mock por tokens reales en base de datos
 */

import { supabase } from '../lib/supabase';

/** Duración para QR guest: 1 semana, 2 semanas, 1 mes */
export type GuestQrDuration = '1w' | '2w' | '1m';

export interface QrGenerationData {
  type: 'guest' | 'admin_invite';
  branchId: string;
  createdBy: string;
  ownerId: string; // Agregar ownerId
  expiresInHours?: number;
  maxUses?: number;
}

export interface GeneratedQrToken {
  id: string;
  token: string;
  type: 'guest' | 'admin_invite';
  branchId: string;
  branchName: string;
  expiresAt: string;
  maxUses: number;
  createdAt: string;
  createdBy?: string;
  createdByName?: string;
  createdByEmail?: string;
  createdByRole?: string;
}

/**
 * Genera un token QR guest vía RPC (expiración 1w/2w/1m).
 * Payload del QR sigue siendo { type:'guest', token, branchId, branchName } para compatibilidad web.
 */
export const createGuestQrToken = async (
  branchId: string,
  duration: GuestQrDuration,
  maxUses: number = 100
): Promise<GeneratedQrToken> => {
  const { data, error } = await supabase.rpc('create_guest_qr_token', {
    p_branch_id: branchId,
    p_duration: duration,
    p_max_uses: maxUses,
  });

  if (error) {
    throw new Error(error.message || 'Error creando QR para comensales');
  }

  const row = data as {
    id: string;
    token: string;
    expires_at: string;
    branch_id: string;
    branch_name: string;
    max_uses: number;
    created_at: string;
  };

  return {
    id: row.id,
    token: row.token,
    type: 'guest',
    branchId: row.branch_id,
    branchName: row.branch_name || '',
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    createdAt: row.created_at,
  };
};

/**
 * Genera un token QR (solo admin_invite). Para guest usar createGuestQrToken.
 */
export const generateQrToken = async (data: QrGenerationData): Promise<GeneratedQrToken> => {
  if (data.type === 'guest') {
    throw new Error('Use createGuestQrToken for QR guest');
  }
  try {
    const token = await generateUniqueToken();
    const expiresInHours = data.expiresInHours || 24 * 7;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);

    const { data: qrToken, error } = await supabase
      .from('qr_tokens')
      .insert({
        token,
        type: data.type,
        branch_id: data.branchId,
        created_by: data.createdBy,
        owner_id: data.ownerId,
        expires_at: expiresAt.toISOString(),
        max_uses: data.maxUses || 1,
        current_uses: 0,
        used: false,
      })
      .select(`
        id,
        token,
        type,
        branch_id,
        created_at,
        expires_at,
        max_uses,
        branches (
          id,
          name
        )
      `)
      .single();

    if (error) throw new Error(`Error creating QR token: ${error.message}`);

    return {
      id: qrToken.id,
      token: qrToken.token,
      type: qrToken.type,
      branchId: qrToken.branch_id,
      branchName: qrToken.branches.name,
      expiresAt: qrToken.expires_at,
      maxUses: qrToken.max_uses,
      createdAt: qrToken.created_at,
    };
  } catch (error) {
    console.error('Error generating QR token:', error);
    throw error;
  }
};

/**
 * Genera un token único usando la función de Supabase
 */
const generateUniqueToken = async (): Promise<string> => {
  try {
    // Usar la función SQL que creamos
    const { data, error } = await supabase.rpc('generate_qr_token');
    
    if (error) {
      // Fallback: generar token manualmente
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      let token = '';
      for (let i = 0; i < 32; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return token;
    }
    
    return data;
  } catch (error) {
    // Fallback: generar token manualmente
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }
};

/**
 * Obtiene todos los tokens QR generados por un usuario
 */
export const getUserQrTokens = async (userId: string): Promise<GeneratedQrToken[]> => {
  try {
    const { data: qrTokens, error } = await supabase
      .from('qr_tokens')
      .select(`
        id,
        token,
        type,
        branch_id,
        created_at,
        created_by,
        expires_at,
        max_uses,
        current_uses,
        used,
        branches (
          id,
          name
        ),
        creator:users!created_by (
          id,
          name,
          email,
          role
        )
      `)
      .eq('created_by', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Error fetching QR tokens: ${error.message}`);
    }

    return qrTokens.map(token => ({
      id: token.id,
      token: token.token,
      type: token.type,
      branchId: token.branch_id,
      branchName: token.branches.name,
      expiresAt: token.expires_at,
      maxUses: token.max_uses,
      createdAt: token.created_at,
      createdBy: token.created_by,
      createdByName: token.creator?.name || null,
      createdByEmail: token.creator?.email || null,
      createdByRole: token.creator?.role || null,
    }));

  } catch (error) {
    console.error('Error fetching user QR tokens:', error);
    throw error;
  }
};

/**
 * Revoca un token QR (lo marca como expirado)
 */
export const revokeQrToken = async (tokenId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('qr_tokens')
      .update({ 
        expires_at: new Date().toISOString() // Marcar como expirado ahora
      })
      .eq('id', tokenId);

    if (error) {
      throw new Error(`Error revoking QR token: ${error.message}`);
    }

    return true;
  } catch (error) {
    console.error('Error revoking QR token:', error);
    return false;
  }
};

/**
 * Obtiene estadísticas de escaneos de un token
 */
export const getTokenScanStats = async (tokenId: string) => {
  try {
    const { data: scans, error } = await supabase
      .from('qr_scans')
      .select('*')
      .eq('qr_token_id', tokenId)
      .order('scanned_at', { ascending: false });

    if (error) {
      throw new Error(`Error fetching scan stats: ${error.message}`);
    }

    return {
      totalScans: scans.length,
      successfulScans: scans.filter(s => s.success).length,
      failedScans: scans.filter(s => !s.success).length,
      scans: scans,
    };

  } catch (error) {
    console.error('Error fetching token scan stats:', error);
    throw error;
  }
};

