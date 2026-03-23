// Edge Function: public-menu
// PUBLIC endpoint — no Authorization header required.
// Returns branch + wines + cocktails for a valid guest QR token.
// GET /public-menu?token=...  OR  POST /public-menu { "token": "..." }
// JSONB (name, description, ingredients): returned as-is (bilingual objects/arrays) so the client can choose language.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

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
    .select('id, name, address, owner_id')
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
        fizziness_level
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
    };
  }>;

  const wines = winesRaw.map((row) => ({
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
  }));

  const branch = {
    id: (branchRow as { id: string }).id,
    name: (branchRow as { name?: string }).name ?? '',
    address: (branchRow as { address?: string | null }).address ?? null,
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
