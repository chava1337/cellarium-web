/**
 * Almacenamiento temporal de payload QR para transporte listener → QrProcessor
 * independiente de React Navigation params (evita fallos en dev client).
 * Uso: App listener setPendingQrPayload → reset a QrProcessor → QrProcessor consumePendingQrPayload.
 */

export interface PendingQrPayload {
  rawUrl?: string;
  qrData?: unknown;
  token?: string;
  timestamp: number;
}

let pending: PendingQrPayload | null = null;

export function setPendingQrPayload(payload: Omit<PendingQrPayload, 'timestamp'>): void {
  pending = {
    ...payload,
    timestamp: Date.now(),
  };
}

export function getPendingQrPayload(): PendingQrPayload | null {
  return pending;
}

/** Obtiene y elimina el payload en una sola llamada. Evita doble procesamiento. */
export function consumePendingQrPayload(): PendingQrPayload | null {
  const value = pending;
  pending = null;
  return value;
}

export function clearPendingQrPayload(): void {
  pending = null;
}
