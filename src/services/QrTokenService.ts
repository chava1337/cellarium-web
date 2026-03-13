/**
 * Servicio para validación y gestión de tokens QR
 * Maneja tanto QR de comensales como de invitaciones admin
 */

import { supabase } from '../lib/supabase';

export interface QrTokenData {
  type: 'guest' | 'admin';
  token: string;
  branchId: string;
  branchName: string;
  expiresAt?: string;
}

export interface QrValidationResult {
  valid: boolean;
  data?: QrTokenData;
  error?: string;
  branch?: {
    id: string;
    name: string;
    address?: string;
  };
}

/**
 * Valida un token QR escaneado
 * Consulta Supabase para verificar token válido
 */
export const validateQrToken = async (token: string): Promise<QrValidationResult> => {
  try {
    // PRODUCCIÓN: Usar Supabase real
    const { data: qrToken, error } = await supabase
      .from('qr_tokens')
      .select(`
        *,
        branches (
          id,
          name,
          address
        )
      `)
      .eq('token', token)
      .single();

    if (error || !qrToken) {
      return {
        valid: false,
        error: 'Código QR no encontrado o inválido',
      };
    }

    // Verificar expiración
    const expirationDate = new Date(qrToken.expires_at);
    if (expirationDate < new Date()) {
      return {
        valid: false,
        error: 'El código QR ha expirado. Solicita uno nuevo al restaurante.',
      };
    }

    // Verificar si ya fue usado (solo para admin_invite)
    if (qrToken.type === 'admin_invite' && qrToken.used) {
      return {
        valid: false,
        error: 'Este código de invitación ya fue utilizado.',
      };
    }

    // Verificar límite de usos
    if (qrToken.current_uses >= qrToken.max_uses) {
      return {
        valid: false,
        error: 'Este código QR alcanzó su límite de usos.',
      };
    }

    // Registrar escaneo
    await supabase.from('qr_scans').insert({
      qr_token_id: qrToken.id,
      success: true,
    });

    // Incrementar contador de usos
    await supabase
      .from('qr_tokens')
      .update({ 
        current_uses: qrToken.current_uses + 1,
        used: qrToken.type === 'admin_invite' ? true : qrToken.used,
        used_at: qrToken.type === 'admin_invite' ? new Date().toISOString() : qrToken.used_at,
      })
      .eq('id', qrToken.id);

    return {
      valid: true,
      data: {
        type: qrToken.type === 'admin_invite' ? 'admin' : 'guest',
        token: qrToken.token,
        branchId: qrToken.branch_id,
        branchName: qrToken.branches.name,
        expiresAt: qrToken.expires_at,
      },
      branch: {
        id: qrToken.branches.id,
        name: qrToken.branches.name,
        address: qrToken.branches.address,
      },
    };


  } catch (error) {
    console.error('Error validating QR token:', error);
    return {
      valid: false,
      error: 'Error al validar el código QR. Por favor, inténtalo de nuevo.',
    };
  }
};

/**
 * Genera URL universal para QR
 * Incluye fallback a App Store/Play Store si la app no está instalada
 */
export const generateUniversalQrUrl = (qrData: QrTokenData): string => {
  // Codificar datos del QR
  const encodedData = encodeURIComponent(JSON.stringify(qrData));
  
  // Dominio asociado a la app (associatedDomains / intentFilters) para que Universal/App Links abran la app
  // Si la app no está instalada, esta URL abre el visualizador web en el navegador
  const universalUrl = `https://www.cellarium.net/qr?data=${encodedData}`;
  
  return universalUrl;
};

/**
 * Genera deep link para la app
 * Solo funciona si la app está instalada
 */
export const generateDeepLink = (qrData: QrTokenData): string => {
  const encodedData = encodeURIComponent(JSON.stringify(qrData));
  // Usar formato de ruta para que el parser funcione correctamente
  return `cellarium://qr/${encodedData}`;
};

/**
 * Verifica si un QR es para comensal
 */
export const isGuestQr = (qrData: QrTokenData): boolean => {
  return qrData.type === 'guest';
};

/**
 * Verifica si un QR es para invitación de admin
 */
export const isAdminInviteQr = (qrData: QrTokenData): boolean => {
  return qrData.type === 'admin';
};

/**
 * Marca un token QR como usado (solo para admin)
 * En producción, esto actualizaría Supabase
 */
export const markQrAsUsed = async (token: string): Promise<boolean> => {
  try {
    const { supabase } = await import('../config/supabase');
    
    await supabase
      .from('qr_tokens')
      .update({ 
        used: true, 
        used_at: new Date().toISOString() 
      })
      .eq('token', token);
    
    console.log(`QR token ${token} marked as used`);
    return true;
  } catch (error) {
    console.error('Error marking QR as used:', error);
    return false;
  }
};

