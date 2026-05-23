// Edge Function: public-menu
// PUBLIC endpoint — no Authorization header required.
// Returns branch + wines + cocktails for a valid guest QR token.
// GET /public-menu?token=...  OR  POST /public-menu { "token": "..." }
// JSONB (name, description, ingredients): returned as-is (bilingual objects/arrays) so the client can choose language.
// Wine items include legacy tenant strings plus optional *_i18n from wines_canonical when canonical_wine_id is set.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const CANONICAL_BATCH_SIZE = 100;

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

type CanonicalI18nRow = {
  id: string;
  country: JsonValue;
  region: JsonValue;
  flavors: JsonValue;
  serving: JsonValue;
};

function extractPairingI18n(serving: JsonValue): JsonValue {
  if (serving == null || typeof serving !== 'object' || Array.isArray(serving)) {
    return null;
  }
  const pairing = (serving as Record<string, unknown>).pairing;
  return pairing ?? null;
}

function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

async function fetchCanonicalI18nByIds(
  supabase: ReturnType<typeof createClient>,
  canonicalIds: string[]
): Promise<Map<string, CanonicalI18nRow>> {
  const map = new Map<string, CanonicalI18nRow>();
  if (canonicalIds.length === 0) return map;

  for (const batch of chunkIds(canonicalIds, CANONICAL_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from('wines_canonical')
      .select('id, country, region, flavors, serving')
      .in('id', batch);

    if (error) {
      console.warn('[public-menu] wines_canonical batch error', {
        message: error.message,
        batchSize: batch.length,
      });
      continue;
    }

    for (const row of data ?? []) {
      if (row?.id) {
        map.set(row.id, row as CanonicalI18nRow);
      }
    }
  }

  return map;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'method_not_allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let token: string | null = null;
  if (req.method === 'GET') {
    const url = new URL(req.url);
    token = url.searchParams.get('token');
  } else {
    try {
      const body = await req.json();
      token = typeof body?.token === 'string' ? body.token : null;
    } catch {
      token = null;
    }
  }

  if (!token || token.trim() === '') {
    return new Response(
      JSON.stringify({ error: 'invalid_token' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: 'server_error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: qrRow, error: qrError } = await supabase
    .from('qr_tokens')
    .select('id, token, type, branch_id, expires_at, max_uses, current_uses')
    .eq('token', token.trim())
    .maybeSingle();

  if (qrError) {
    return new Response(
      JSON.stringify({ error: 'invalid_token' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!qrRow) {
    return new Response(
      JSON.stringify({ error: 'invalid_token' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (qrRow.type !== 'guest') {
    return new Response(
      JSON.stringify({ error: 'invalid_token' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const expiresAt = qrRow.expires_at ? new Date(qrRow.expires_at) : null;
  if (expiresAt && expiresAt <= new Date()) {
    return new Response(
      JSON.stringify({ error: 'token_expired' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const maxUses = qrRow.max_uses ?? 0;
  const currentUses = qrRow.current_uses ?? 0;
  if (maxUses > 0 && currentUses >= maxUses) {
    return new Response(
      JSON.stringify({ error: 'token_limit_exceeded' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const branchId = qrRow.branch_id;
  const { data: branchRow, error: branchError } = await supabase
    .from('branches')
    .select('id, name, address, owner_id, catalog_background_preset_id')
    .eq('id', branchId)
    .maybeSingle();

  if (branchError || !branchRow) {
    return new Response(
      JSON.stringify({ error: 'invalid_token' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const ownerId = (branchRow as { owner_id?: string }).owner_id;
  if (!ownerId) {
    return new Response(
      JSON.stringify({ error: 'invalid_token' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { data: stockRows, error: stockError } = await supabase
    .from('wine_branch_stock')
    .select(`
      wine_id,
      stock_quantity,
      price_by_glass,
      price_by_bottle,
      wines!inner (
        id,
        name,
        grape_variety,
        region,
        country,
        vintage,
        type,
        description,
        image_url,
        winery,
        alcohol_content,
        body_level,
        sweetness_level,
        acidity_level,
        intensity_level,
        fizziness_level,
        canonical_wine_id
      )
    `)
    .eq('branch_id', branchId)
    .eq('wines.owner_id', ownerId)
    .gte('stock_quantity', 0);

  if (stockError) {
    return new Response(
      JSON.stringify({ error: 'server_error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const winesRaw = (stockRows || []).filter(
    (row: any) => row.wines && row.wines.id
  ) as Array<{
    wine_id: string;
    stock_quantity: number | null;
    price_by_glass: number | null;
    price_by_bottle: number | null;
    wines: {
      id: string;
      name: string;
      grape_variety: string | null;
      region: string | null;
      country: string | null;
      vintage: string | null;
      type: string | null;
      description: string | null;
      image_url: string | null;
      winery: string | null;
      alcohol_content?: number | string | null;
      body_level?: number | null;
      sweetness_level?: number | null;
      acidity_level?: number | null;
      intensity_level?: number | null;
      fizziness_level?: number | null;
      canonical_wine_id?: string | null;
    };
  }>;

  const canonicalIds = [
    ...new Set(
      winesRaw
        .map((row) => row.wines.canonical_wine_id)
        .filter((id): id is string => typeof id === 'string' && id.trim() !== '')
    ),
  ];

  const canonicalById = await fetchCanonicalI18nByIds(supabase, canonicalIds);

  let winesWithCanonicalMatch = 0;

  const wines = winesRaw.map((row) => {
    const canonicalId = row.wines.canonical_wine_id ?? null;
    const canonical = canonicalId ? canonicalById.get(canonicalId) : undefined;

    if (canonical) {
      winesWithCanonicalMatch += 1;
    }

    return {
      id: row.wines.id,
      name: row.wines.name,
      grape_variety: row.wines.grape_variety ?? null,
      region: row.wines.region ?? null,
      country: row.wines.country ?? null,
      vintage: row.wines.vintage ?? null,
      type: row.wines.type ?? null,
      description: row.wines.description ?? null,
      image_url: row.wines.image_url ?? null,
      winery: row.wines.winery ?? null,
      alcohol_content: row.wines.alcohol_content ?? null,
      body_level: row.wines.body_level ?? null,
      sweetness_level: row.wines.sweetness_level ?? null,
      acidity_level: row.wines.acidity_level ?? null,
      intensity_level: row.wines.intensity_level ?? null,
      fizziness_level: row.wines.fizziness_level ?? null,
      stock_quantity: row.stock_quantity ?? 0,
      price_by_glass: row.price_by_glass ?? null,
      price_by_bottle: row.price_by_bottle ?? null,
      country_i18n: canonical?.country ?? null,
      region_i18n: canonical?.region ?? null,
      flavors_i18n: canonical?.flavors ?? null,
      pairing_i18n: canonical ? extractPairingI18n(canonical.serving) : null,
    };
  });

  console.log('[public-menu] wines i18n', {
    winesTotal: wines.length,
    winesWithCanonicalWineId: winesRaw.filter((row) => row.wines.canonical_wine_id).length,
    uniqueCanonicalIds: canonicalIds.length,
    withCanonicalMatch: winesWithCanonicalMatch,
  });

  const row = branchRow as {
    id: string;
    name?: string;
    address?: string | null;
    catalog_background_preset_id?: string | null;
  };

  const branch = {
    id: row.id,
    name: row.name ?? '',
    address: row.address ?? null,
    catalog_background_preset_id: row.catalog_background_preset_id ?? 'default',
  };

  // Cocktails: same branch/owner, is_active only. name/description/ingredients (jsonb) returned as-is for client i18n.
  const { data: cocktailRows, error: cocktailError } = await supabase
    .from('cocktail_menu')
    .select('id, name, description, ingredients, image_url, price, display_order')
    .eq('branch_id', branchId)
    .eq('owner_id', ownerId)
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (cocktailError) {
    return new Response(
      JSON.stringify({ error: 'server_error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const cocktails = (cocktailRows || []).map((row: Record<string, unknown>) => ({
    id: row.id,
    name: row.name ?? null,
    description: row.description ?? null,
    ingredients: row.ingredients ?? null,
    image_url: row.image_url ?? null,
    price: typeof row.price === 'number' ? row.price : Number(row.price) ?? 0,
    display_order: typeof row.display_order === 'number' ? row.display_order : Number(row.display_order) ?? 0,
  }));

  return new Response(
    JSON.stringify({ branch, wines, cocktails }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
