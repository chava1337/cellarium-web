// Shared Stripe REST API helpers for Supabase Edge Functions
// 100% Deno Edge compatible: NO stripe SDK, NO qs, NO deno.land/std/node
// Uses only Web APIs: fetch, crypto.subtle, TextEncoder

/**
 * Constant-time comparison for two Uint8Arrays (timing-safe).
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

/**
 * Convert hex string to Uint8Array.
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Returns true if value is a primitive (no nested objects/arrays).
 * Used to encode body as-is when keys are already form keys (e.g. items[0][id]).
 */
function isPrimitive(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const t = typeof value;
  return t === 'string' || t === 'number' || t === 'boolean';
}

/**
 * Returns true if body is already flat (all values primitive).
 * Then we encode key=value without re-flattening to preserve keys like items[0][id].
 */
function isAlreadyFlatForm(body: Record<string, unknown>): boolean {
  return Object.values(body).every(isPrimitive);
}

/**
 * Flatten nested objects/arrays to form-urlencoded keys (Stripe format).
 * e.g. metadata[owner_id]=value, items[0][price]=value
 */
function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;

    const newKey = prefix ? `${prefix}[${key}]` : key;

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          const nested = flattenObject(item as Record<string, unknown>, `${newKey}[${index}]`);
          Object.assign(result, nested);
        } else {
          result[`${newKey}[${index}]`] = String(item);
        }
      });
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const nested = flattenObject(value as Record<string, unknown>, newKey);
      Object.assign(result, nested);
    } else {
      result[newKey] = String(value);
    }
  }

  return result;
}

/**
 * Verifies Stripe webhook signature using WebCrypto (crypto.subtle).
 * @param rawBody - Raw request body as string
 * @param signatureHeader - Stripe-Signature header (e.g. "t=timestamp,v1=signature,...")
 * @param webhookSecret - Stripe webhook signing secret
 * @throws Error if signature is invalid
 */
export async function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string
): Promise<void> {
  const parts: Record<string, string[]> = {};
  const headerParts = signatureHeader.split(',');

  for (const part of headerParts) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key && value) {
      if (!parts[key]) parts[key] = [];
      parts[key].push(value);
    }
  }

  const t = parts['t']?.[0];
  const v1Signatures = parts['v1'] || [];

  if (!t || v1Signatures.length === 0) {
    throw new Error('Invalid signature header format');
  }

  const payload = `${t}.${rawBody}`;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(webhookSecret);
  const payloadData = encoder.encode(payload);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign('HMAC', cryptoKey, payloadData);
  const computedHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const computedBytes = hexToBytes(computedHex);

  let valid = false;
  for (const v1Hex of v1Signatures) {
    if (v1Hex.length !== computedHex.length) continue;
    try {
      const v1Bytes = hexToBytes(v1Hex);
      if (timingSafeEqual(computedBytes, v1Bytes)) {
        valid = true;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!valid) {
    throw new Error('Invalid signature');
  }
}

/**
 * Stripe REST API request using fetch.
 * @param method - GET, POST, or DELETE
 * @param endpoint - API path (e.g. "prices", "subscriptions/sub_xxx")
 * @param secretKey - Stripe secret key
 * @param body - Optional form body (nested objects flattened)
 * @param query - Optional query params
 */
export async function stripeRequest(
  method: 'GET' | 'POST' | 'DELETE',
  endpoint: string,
  secretKey: string,
  body?: Record<string, unknown>,
  query?: Record<string, string>
): Promise<{ data?: unknown; error?: { message?: string; statusCode?: number; raw?: unknown } }> {
  let url = `https://api.stripe.com/v1/${endpoint}`;

  if (query && Object.keys(query).length > 0) {
    const qs = new URLSearchParams(query);
    url += `?${qs.toString()}`;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
  };

  const init: RequestInit = { method, headers };

  if (body && method !== 'GET') {
    const flattened = isAlreadyFlatForm(body as Record<string, unknown>)
      ? Object.fromEntries(
          Object.entries(body).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)])
        )
      : flattenObject(body as Record<string, unknown>);
    const formBody = Object.entries(flattened)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = formBody;
  }

  try {
    const response = await fetch(url, init);
    const text = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    if (!response.ok) {
      const err = json as { error?: { message?: string } };
      return {
        error: {
          message: err?.error?.message ?? `Stripe API error: ${response.status}`,
          statusCode: response.status,
          raw: json,
        },
      };
    }

    return { data: json };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { error: { message: msg, statusCode: 0, raw: e } };
  }
}
