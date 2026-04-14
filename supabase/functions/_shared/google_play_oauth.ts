/**
 * Access token OAuth2 para Google Play Android Developer API (cuenta de servicio).
 * Env: GOOGLE_PLAY_SERVICE_ACCOUNT_JSON — JSON completo de la key descargada desde GCP.
 */

import { SignJWT, importPKCS8 } from 'npm:jose@5';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

export interface GoogleServiceAccountKey {
  client_email: string;
  private_key: string;
}

function parseServiceAccountJson(raw: string): GoogleServiceAccountKey {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const client_email = parsed.client_email;
  const private_key = parsed.private_key;
  if (typeof client_email !== 'string' || typeof private_key !== 'string') {
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON inválido: faltan client_email o private_key');
  }
  return { client_email, private_key };
}

let cachedToken: { value: string; expMs: number } | null = null;

/** Obtiene Bearer token (con caché en memoria ~50 min). */
export async function getGooglePlayAccessToken(): Promise<string> {
  const raw = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON') ?? '';
  if (!raw.trim()) {
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON no configurada');
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expMs > now + 60_000) {
    return cachedToken.value;
  }

  const { client_email, private_key } = parseServiceAccountJson(raw);
  const key = await importPKCS8(private_key.replace(/\\n/g, '\n'), 'RS256');

  const jwt = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(client_email)
    .setSubject(client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(
      `OAuth Google Play falló: ${json.error ?? res.status} ${JSON.stringify(json).slice(0, 200)}`
    );
  }

  const expMs = now + (json.expires_in ?? 3600) * 1000 - 120_000;
  cachedToken = { value: json.access_token, expMs };
  return json.access_token;
}
