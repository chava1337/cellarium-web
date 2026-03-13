// Edge Function: Process storage delete queue
// Reads pending rows from public.storage_delete_queue and removes objects from storage.
// Run via: supabase functions invoke process-storage-delete-queue

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface QueueRow {
  id: string;
  bucket: string;
  path: string;
  status: string;
  attempts: number;
  last_error: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl?.trim() || !serviceRoleKey?.trim()) {
    console.error('[process-storage-delete-queue] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return jsonResponse(
      { error: 'Missing env', processed: 0, errors: 0 },
      500
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const limit = 100;
  const { data: rows, error: fetchError } = await supabase
    .from('storage_delete_queue')
    .select('id, bucket, path, status, attempts, last_error')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (fetchError) {
    console.error('[process-storage-delete-queue] Failed to fetch queue:', fetchError.message);
    return jsonResponse(
      { error: fetchError.message, processed: 0, errors: 0 },
      500
    );
  }

  const queueRows = (rows ?? []) as QueueRow[];
  let processed = 0;
  let errors = 0;

  for (const row of queueRows) {
    const { data: removeData, error: removeError } = await supabase.storage
      .from(row.bucket)
      .remove([row.path]);

    if (!removeError) {
      await supabase
        .from('storage_delete_queue')
        .update({ status: 'done', processed_at: new Date().toISOString() })
        .eq('id', row.id);
      processed++;
    } else {
      const nextAttempts = (row.attempts ?? 0) + 1;
      const newStatus = nextAttempts >= 5 ? 'error' : 'pending';
      await supabase
        .from('storage_delete_queue')
        .update({
          attempts: nextAttempts,
          status: newStatus,
          last_error: removeError.message,
        })
        .eq('id', row.id);
      errors++;
      console.warn('[process-storage-delete-queue] remove failed', row.bucket, row.path, removeError.message);
    }
  }

  return jsonResponse(
    {
      ok: true,
      processed,
      errors,
      total: queueRows.length,
    },
    200
  );
});
