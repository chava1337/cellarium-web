/**
 * Public menu via Edge Function public-menu (service_role).
 * Used by guest flow so the app does not touch qr_tokens or wine_branch_stock from the client.
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

function tokenSuffix(token: string): string {
  if (!token || token.length <= 8) return '***';
  return `${token.slice(-6)}`;
}

export interface PublicMenuBranch {
  id: string;
  name: string;
  address: string;
}

export interface PublicMenuWine {
  id: string;
  name: string;
  grape_variety?: string | null;
  region?: string | null;
  country?: string | null;
  vintage?: number | string | null;
  type?: string | null;
  description?: string | null;
  image_url?: string | null;
  winery?: string | null;
  stock_quantity?: number | null;
  price_by_glass?: number | null;
  price_by_bottle?: number | null;
}

/**
 * Cocktail item in the public menu response.
 * name, description, ingredients are kept as bilingual objects/arrays (jsonb from DB)
 * so the client can choose language (e.g. es vs en).
 */
export interface PublicMenuCocktail {
  id: string;
  /** Bilingual: { en?: string; es?: string } */
  name: Record<string, string> | null;
  /** Bilingual: { en?: string; es?: string } */
  description: Record<string, string> | null;
  /** Bilingual: { en?: string[]; es?: string[] } or array */
  ingredients: Record<string, string[]> | string[] | null;
  image_url: string | null;
  price: number;
  display_order: number;
}

export interface PublicMenuResponse {
  branch: PublicMenuBranch;
  wines: PublicMenuWine[];
  /** Cocktails for the branch (active only). Empty array if none. */
  cocktails?: PublicMenuCocktail[];
}

/**
 * Fetches the public menu by guest token from the Edge Function.
 * Do not log the full token; use tokenSuffix only.
 */
export async function getPublicMenuByToken(token: string): Promise<PublicMenuResponse> {
  const suffix = tokenSuffix(token);
  if (__DEV__) console.log('[GUEST_MENU] fetch start tokenSuffix:', suffix);

  const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/public-menu?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (__DEV__) console.log('[GUEST_MENU] fetch end tokenSuffix:', suffix, 'status:', res.status);

  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
      if (body.length > 200) body = body.slice(0, 200) + '...';
    } catch (_) {}
    const msg = body.trim() || res.statusText || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  const json = await res.json();
  return json as PublicMenuResponse;
}
