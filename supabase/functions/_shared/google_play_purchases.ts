/**
 * Consulta purchases.subscriptionsv2.get — estado de suscripción por purchase token.
 * Ref: https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2/get
 */

import { getGooglePlayAccessToken } from './google_play_oauth.ts';

const PUBLISHER_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3';

/** Respuesta parcial (solo campos que usamos). */
export interface SubscriptionPurchaseV2LineItem {
  productId?: string;
  expiryTime?: string;
  offerDetails?: { basePlanId?: string };
}

export interface SubscriptionPurchaseV2 {
  lineItems?: SubscriptionPurchaseV2LineItem[];
  subscriptionState?: string;
  latestOrderId?: string;
  acknowledgementState?: string;
}

export async function getSubscriptionPurchaseV2(
  packageName: string,
  purchaseToken: string
): Promise<SubscriptionPurchaseV2> {
  const token = await getGooglePlayAccessToken();
  const path = `/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const url = `${PUBLISHER_BASE}${path}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Play API respuesta no JSON: ${res.status} ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const err = json as { error?: { message?: string; status?: string } };
    const msg = err.error?.message ?? text.slice(0, 300);
    throw new Error(`Play API ${res.status}: ${msg}`);
  }

  return json as SubscriptionPurchaseV2;
}

/** Estados con acceso al contenido hasta expiryTime (según política Cellarium). */
const ACTIVE_LIKE_STATES = new Set([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
]);

const INACTIVE_STATES = new Set([
  'SUBSCRIPTION_STATE_EXPIRED',
  'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED',
]);

const PENDING_STATES = new Set(['SUBSCRIPTION_STATE_PENDING']);

export function interpretPlaySubscriptionV2(
  body: SubscriptionPurchaseV2,
  productIdFromClient: string,
  now: Date
): {
  subscriptionActive: boolean;
  expiresAtIso: string | null;
  orderId: string | null;
  productId: string | null;
  playState: string;
  pendingOnly: boolean;
} {
  const playState = String(body.subscriptionState ?? 'SUBSCRIPTION_STATE_UNSPECIFIED');
  const orderId = typeof body.latestOrderId === 'string' ? body.latestOrderId : null;

  const lineItems = Array.isArray(body.lineItems) ? body.lineItems : [];
  let productId: string | null = null;
  let maxExpiryMs = 0;

  for (const li of lineItems) {
    const pid = typeof li.productId === 'string' ? li.productId : '';
    if (pid && pid === productIdFromClient) {
      productId = pid;
    }
    const exp = li.expiryTime ? Date.parse(li.expiryTime) : NaN;
    if (Number.isFinite(exp) && exp > maxExpiryMs) {
      maxExpiryMs = exp;
    }
    if (!productId && pid) productId = pid;
  }

  const expiresAtIso = maxExpiryMs > 0 ? new Date(maxExpiryMs).toISOString() : null;
  const nowMs = now.getTime();

  if (PENDING_STATES.has(playState)) {
    return {
      subscriptionActive: false,
      expiresAtIso,
      orderId,
      productId: productId ?? productIdFromClient,
      playState,
      pendingOnly: true,
    };
  }

  if (INACTIVE_STATES.has(playState) || (expiresAtIso !== null && Date.parse(expiresAtIso) <= nowMs)) {
    return {
      subscriptionActive: false,
      expiresAtIso,
      orderId,
      productId: productId ?? productIdFromClient,
      playState,
      pendingOnly: false,
    };
  }

  const hasFutureExpiry = expiresAtIso !== null && Date.parse(expiresAtIso) > nowMs;
  // CANCELED con periodo aún vigente: acceso hasta expiry (cancelación al final del ciclo).
  const subscriptionActive =
    hasFutureExpiry &&
    (ACTIVE_LIKE_STATES.has(playState) || playState === 'SUBSCRIPTION_STATE_CANCELED');

  return {
    subscriptionActive,
    expiresAtIso,
    orderId,
    productId: productId ?? productIdFromClient,
    playState,
    pendingOnly: false,
  };
}
