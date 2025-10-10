/**
 * Servicio para validación y gestión de tokens QR
 * Maneja tanto QR de comensales como de invitaciones admin
 */

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
    // PRODUCCIÓN: Descomentar este código cuando tengas Supabase configurado
    /*
    import { supabase } from '../config/supabase';
    
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

    // Verificar si ya fue usado (solo para admin)
    if (qrToken.type === 'admin' && qrToken.used) {
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
        used: qrToken.type === 'admin' ? true : qrToken.used,
        used_at: qrToken.type === 'admin' ? new Date().toISOString() : qrToken.used_at,
      })
      .eq('id', qrToken.id);

    return {
      valid: true,
      data: {
        type: qrToken.type,
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
    */

    // DESARROLLO: Código mock (eliminar en producción)
    // Simular delay de red
    await new Promise(resolve => setTimeout(resolve, 500));

    // Mock de sucursales
    const mockBranches = [
      { id: '1', name: 'Restaurante Principal', address: 'Av. Principal 123' },
      { id: '2', name: 'Sucursal Centro', address: 'Calle Central 456' },
      { id: '3', name: 'Sucursal Norte', address: 'Blvd. Norte 789' },
    ];

    // Extraer datos del token (en producción vendría de Supabase)
    // Por ahora, parseamos si es JSON o generamos mock
    let tokenData: QrTokenData;
    
    try {
      // Intentar parsear como JSON (si viene de QRCode component)
      tokenData = JSON.parse(token);
    } catch {
      // Si no es JSON, es un token simple, generar mock
      tokenData = {
        type: 'guest',
        token: token,
        branchId: '1',
        branchName: 'Restaurante Principal',
      };
    }

    // Verificar expiración
    if (tokenData.expiresAt) {
      const expirationDate = new Date(tokenData.expiresAt);
      if (expirationDate < new Date()) {
        return {
          valid: false,
          error: 'El código QR ha expirado. Solicita uno nuevo al restaurante.',
        };
      }
    }

    // Buscar información de la sucursal
    const branch = mockBranches.find(b => b.id === tokenData.branchId);
    
    if (!branch) {
      return {
        valid: false,
        error: 'Sucursal no encontrada',
      };
    }

    // Token válido
    return {
      valid: true,
      data: tokenData,
      branch: branch,
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
  
  // URL universal que funciona en web y redirige a stores si no hay app
  const universalUrl = `https://cellarium.app/qr?data=${encodedData}`;
  
  return universalUrl;
};

/**
 * Genera deep link para la app
 * Solo funciona si la app está instalada
 */
export const generateDeepLink = (qrData: QrTokenData): string => {
  const encodedData = encodeURIComponent(JSON.stringify(qrData));
  return `cellarium://qr?data=${encodedData}`;
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
    // En producción:
    // await supabase
    //   .from('qr_tokens')
    //   .update({ 
    //     used: true, 
    //     used_at: new Date().toISOString() 
    //   })
    //   .eq('token', token);
    
    console.log(`QR token ${token} marked as used`);
    return true;
  } catch (error) {
    console.error('Error marking QR as used:', error);
    return false;
  }
};

