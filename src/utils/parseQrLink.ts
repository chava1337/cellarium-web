/**
 * Utilidad central para parsear URLs de QR (deep link o universal link).
 * Contrato oficial: query param `data`; fallback opcional por path /qr/TOKEN.
 * Usado por BootstrapScreen, QrProcessorScreen y cualquier listener de Linking.
 */

export type ParseQrLinkResult = { qrData?: unknown; token?: string } | null;

function decodeEncoded(encoded: string): { type: 'object'; data: unknown } | { type: 'token'; data: string } | null {
  if (!encoded || typeof encoded !== 'string') return null;
  try {
    let decoded = encoded.trim();
    try {
      decoded = decodeURIComponent(decoded);
    } catch (_) {}
    const trimmed = decoded.trim();
    if (trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed) as unknown;
      return { type: 'object', data: parsed };
    }
    if (trimmed.startsWith('%7B')) {
      try {
        const again = decodeURIComponent(trimmed);
        if (again.startsWith('{')) return { type: 'object', data: JSON.parse(again) as unknown };
      } catch (_) {}
    }
    return { type: 'token', data: decoded };
  } catch {
    return null;
  }
}

/**
 * Parsea una URL entrante y extrae payload del QR.
 * Prioridad 1: query param `data`.
 * Prioridad 2: path /qr/TOKEN (cellarium:// o https).
 * Retorna { qrData?, token? } o null si no es un link de QR válido.
 */
export function parseQrLink(url: string | null): ParseQrLinkResult {
  if (!url || typeof url !== 'string') {
    if (__DEV__) console.log('[parseQrLink] url vacía o no string');
    return null;
  }
  try {
    // 1) Query param data (contrato oficial: https://www.cellarium.net/qr?data=...)
    const parsedUrl = new URL(url);
    const dataParam = parsedUrl.searchParams.get('data');
    if (__DEV__) console.log('[parseQrLink] input url host/path:', parsedUrl.host, parsedUrl.pathname, 'hasDataParam:', !!dataParam, 'dataParamLen:', dataParam?.length ?? 0);
    if (dataParam) {
      const result = decodeEncoded(dataParam);
      if (result?.type === 'object') {
        if (__DEV__) console.log('[parseQrLink] payload desde ?data= (objeto)', { type: (result.data as any)?.type, tokenLen: (result.data as any)?.token?.length });
        return { qrData: result.data };
      }
      if (result?.type === 'token') {
        if (__DEV__) console.log('[parseQrLink] payload desde ?data= (token)', { tokenLen: result.data?.length });
        return { token: result.data };
      }
      if (__DEV__) console.log('[parseQrLink] ?data= presente pero decode falló, devolviendo dataParam como token');
      return { token: dataParam };
    }

    // 2) Fallback: path /qr/TOKEN (cellarium://qr/... o https://.../qr/...)
    const pathMatch =
      url.match(/cellarium:\/\/\/?qr\/([^?#]+)/i) ||
      url.match(/cellarium:\/\/qr\/([^?#]+)/i) ||
      url.match(/https?:\/\/[^/]+\/qr\/([^?#]+)/i);
    if (pathMatch && pathMatch[1]) {
      const segment = pathMatch[1];
      const result = decodeEncoded(segment);
      if (result?.type === 'object') {
        if (__DEV__) console.log('[parseQrLink] payload desde path /qr/ (objeto)');
        return { qrData: result.data };
      }
      if (result?.type === 'token') {
        if (__DEV__) console.log('[parseQrLink] payload desde path /qr/ (token)');
        return { token: result.data };
      }
      if (__DEV__) console.log('[parseQrLink] path /qr/ presente, usando segmento como token');
      return { token: segment };
    }

    if (__DEV__) console.log('[parseQrLink] no es link de QR', { urlPreview: url.slice(0, 60) });
    return null;
  } catch (e) {
    if (__DEV__) console.warn('[parseQrLink] error', e);
    return null;
  }
}
