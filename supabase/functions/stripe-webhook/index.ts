// Edge Function: stripe-webhook
// Sincroniza eventos de Stripe con public.subscriptions y public.users.
// 100% Deno Edge: Deno.serve, Web APIs only. NO std/node, NO stripe SDK.
// Lazy imports to avoid top-level side effects; EDGE_MINIMAL_MODE for crash isolation.

import {
  handleStripeSubscriptionDeleted,
  handleSubscriptionUpdate,
} from '../_shared/handle_subscription_update.ts';

// ——— Contención global (DIAG ONLY): evita que UncaughtException se propague; loguea contexto sin secretos ———
function truncate(s: string, max: number): string {
  if (typeof s !== 'string') return String(s);
  return s.length <= max ? s : s.slice(0, max) + '...';
}
addEventListener('unhandledrejection', (e: PromiseRejectionEvent & { preventDefault?: () => void }) => {
  const reason = e.reason;
  const safe =
    reason instanceof Error
      ? { name: reason.name, message: reason.message }
      : { reasonType: typeof reason, reasonString: truncate(String(reason), 200) };
  console.error('[GLOBAL] unhandledrejection', safe);
  if (typeof e.preventDefault === 'function') e.preventDefault();
});
addEventListener('error', (e: ErrorEvent & { preventDefault?: () => void }) => {
  const err = e.error;
  const safe: Record<string, unknown> = {
    message: e.message,
    filename: e.filename,
    lineno: e.lineno,
    colno: e.colno,
  };
  if (err instanceof Error) {
    safe.name = err.name;
    safe.message = err.message;
    safe.stack = truncate(err.stack ?? '', 500);
  }
  console.error('[GLOBAL] error', safe);
  if (typeof e.preventDefault === 'function') e.preventDefault();
});

const WEBHOOK_VERSION = 'stripe-webhook@2026-02-07_v8';

/** DIAG ONLY: true si env var es la string "true" (case-insensitive). */
function envTrue(name: string): boolean {
  const v = Deno.env.get(name);
  return typeof v === 'string' && v.trim().toLowerCase() === 'true';
}

/** Lazy load Stripe helpers (no top-level import; avoids loading _shared until after minimal check). */
async function getStripeHelpers(): Promise<{
  verifyStripeWebhookSignature: (rawBody: string, sig: string, secret: string) => Promise<void>;
  stripeRequest: (method: 'GET' | 'POST' | 'DELETE', endpoint: string, secretKey: string, body?: Record<string, unknown>, query?: Record<string, string>) => Promise<{ data?: unknown; error?: { message?: string; statusCode?: number; raw?: unknown } }>;
}> {
  const mod = await import('../_shared/stripe_rest.ts');
  return {
    verifyStripeWebhookSignature: mod.verifyStripeWebhookSignature,
    stripeRequest: mod.stripeRequest,
  };
}

function unixToIso(unix: number | null | undefined): string | null {
  if (unix == null || typeof unix !== 'number') return null;
  return new Date(unix * 1000).toISOString();
}

/** Obtiene el period end en Unix desde subscription (raíz, items[0] o cancel_at). */
function getSubscriptionPeriodEndUnix(subscription: any): number | null {
  const top =
    typeof subscription?.current_period_end === 'number'
      ? subscription.current_period_end
      : null;

  const item =
    typeof subscription?.items?.data?.[0]?.current_period_end === 'number'
      ? subscription.items.data[0].current_period_end
      : null;

  const cancelAt =
    typeof subscription?.cancel_at === 'number'
      ? subscription.cancel_at
      : null;

  return top ?? item ?? cancelAt ?? null;
}

/** Obtiene el period end en Unix desde invoice (línea 0). Para eventos invoice.* cuando subscription no trae current_period_end. */
function getPeriodEndUnixFromInvoice(invoice: any): number | null {
  const periodEnd = invoice?.lines?.data?.[0]?.period?.end;
  return typeof periodEnd === 'number' ? periodEnd : null;
}

const STATUS_MAP: Record<string, string> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  canceled: 'canceled',
  unpaid: 'unpaid',
  incomplete: 'pending',
  incomplete_expired: 'expired',
  paused: 'pending',
};
function mapStatus(stripeStatus: string): string {
  return STATUS_MAP[stripeStatus] ?? 'active';
}
function toUnix(v: any): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (v && typeof v === 'object') {
    const candidates = [v.unix, v.value, v.timestamp, v.time, v.seconds];
    for (const c of candidates) {
      if (typeof c === 'number' && Number.isFinite(c)) return c;
      if (typeof c === 'string') {
        const n = Number(c);
        if (Number.isFinite(n)) return n;
      }
    }
  }
  return null;
}

/** true si la suscripción está cancelada o tiene cancelación programada (period_end o cancel_at). */
function computeCancelScheduled(subscription: any): boolean {
  const cancel_at_period_end = subscription?.cancel_at_period_end === true;
  const hasCancelAt = typeof subscription?.cancel_at === 'number';
  const hasCanceledAt = typeof subscription?.canceled_at === 'number';
  const status = subscription?.status;
  return cancel_at_period_end || hasCancelAt || hasCanceledAt || status === 'canceled';
}

// Metadata de cancelación para subscriptions.metadata (cancel_scheduled, cancel_at_*, stripe_status).
function computeCancelMeta(subscription: any): Record<string, unknown> {
  const status = subscription?.status ?? null;
  const cap = subscription?.cancel_at_period_end === true;
  const cancelAt = toUnix(subscription?.cancel_at);
  const canceledAt = toUnix(subscription?.canceled_at);
  const cancelScheduled = computeCancelScheduled(subscription);

  const subIdSuffix =
    typeof subscription?.id === 'string'
      ? subscription.id.slice(-6)
      : '***';
  if (cancelScheduled) {
    console.log('[CANCEL_RAW]', {
      subIdSuffix,
      raw_cancel_at: subscription?.cancel_at ?? null,
      raw_canceled_at: subscription?.canceled_at ?? null,
    });
  }

  return {
    cancel_scheduled: cancelScheduled,
    ...(cap ? { cancel_at_period_end: true } : {}),
    ...(cancelAt != null
      ? {
          cancel_at_unix: cancelAt,
          cancel_at_iso: new Date(cancelAt * 1000).toISOString(),
        }
      : {}),
    stripe_status: status,
  };
}

function extractSubscriptionIdFromInvoice(invoice: any): string | null {
  if (!invoice) return null;
  if (typeof invoice.subscription === 'string') return invoice.subscription;
  if (invoice.subscription?.id) return invoice.subscription.id;
  const parentSub = invoice?.parent?.subscription_details?.subscription;
  if (typeof parentSub === 'string' && parentSub) return parentSub;
  const lineSub = invoice?.lines?.data?.[0]?.parent?.subscription_item_details?.subscription;
  if (typeof lineSub === 'string' && lineSub) return lineSub;
  return null;
}

function extractCustomerIdFromInvoice(invoice: any): string | null {
  if (!invoice) return null;
  if (typeof invoice.customer === 'string') return invoice.customer;
  if (invoice.customer?.id) return invoice.customer.id;
  return null;
}

/** Valores permitidos por subscriptions_plan_id_check en la BD. No tocar sin alinear con la migración. */
const ALLOWED_PLAN_IDS = new Set(['free', 'basic', 'additional-branch'] as const);
type AllowedPlanId = 'free' | 'basic' | 'additional-branch';

/** Ranking para comparar planes: solo permitir upgrade (nunca degradar) desde invoice.* */
function planRank(p: AllowedPlanId): number {
  if (p === 'free') return 0;
  if (p === 'basic') return 1;
  if (p === 'additional-branch') return 2;
  return 0;
}

/** Blindaje: devuelve siempre un plan_id permitido por el CHECK. */
function normalizePlanId(
  input: string | null | undefined,
  planLookupKey?: string | null
): AllowedPlanId {
  const i = (input ?? '').toLowerCase().trim();
  const key = (planLookupKey ?? '').toLowerCase().trim();
  if (i === 'free' || i === 'basic' || i === 'additional-branch') return i as AllowedPlanId;
  if (i === 'pro' || i.startsWith('pro_')) return 'basic';
  if (i === 'business' || i.startsWith('business_')) return 'additional-branch';
  if (key.startsWith('pro_')) return 'basic';
  if (key.startsWith('business_')) return 'additional-branch';
  if (key.startsWith('basic_')) return 'basic';
  if (key.startsWith('free_')) return 'free';
  return 'basic';
}

function getFinalPlanName(planId: AllowedPlanId): string {
  if (planId === 'free') return 'Free';
  if (planId === 'basic') return 'Pro';
  if (planId === 'additional-branch') return 'Business';
  return 'Pro';
}

function mapPlanFromLookupKey(lookupKey: string | null | undefined): { plan_id: string; plan_name: string } {
  const key = (lookupKey ?? '').toLowerCase();
  if (key.startsWith('business_')) return { plan_id: 'additional-branch', plan_name: 'Business' };
  if (key.startsWith('pro_')) return { plan_id: 'basic', plan_name: 'Pro' };
  if (key.startsWith('basic_')) return { plan_id: 'basic', plan_name: 'Basic' };
  return { plan_id: 'free', plan_name: 'Free' };
}

function getPlanLookupKeyFromInvoice(invoice: any): string | null {
  if (!invoice) return null;
  const lineKey = invoice?.lines?.data?.[0]?.metadata?.planLookupKey;
  if (typeof lineKey === 'string' && lineKey) return lineKey;
  const parentKey = invoice?.parent?.subscription_details?.metadata?.planLookupKey;
  if (typeof parentKey === 'string' && parentKey) return parentKey;
  return null;
}

/** Normaliza tipos de evento (Stripe API 2025 invoice_payment.* → invoice.*) */
function normalizeEventType(type: string): string {
  if (type === 'invoice_payment.paid') return 'invoice.payment_succeeded';
  if (type === 'invoice_payment.failed') return 'invoice.payment_failed';
  return type;
}

/** Extrae subscriptionId y customerId desde eventos de invoice (incl. invoice_payment.*) */
async function extractInvoiceRefs(
  event: { type: string; data?: { object?: Record<string, unknown> } },
  stripeSecretKey: string | null
): Promise<{ subscriptionId: string | null; customerId: string | null }> {
  const obj = event.data?.object as Record<string, unknown> | undefined;
  if (!obj) return { subscriptionId: null, customerId: null };

  const subFromObj = obj.subscription;
  const custFromObj = obj.customer;
  let subscriptionId: string | null =
    subFromObj == null ? null : typeof subFromObj === 'string' ? subFromObj : (subFromObj as { id?: string })?.id ?? null;
  let customerId: string | null =
    custFromObj == null ? null : typeof custFromObj === 'string' ? custFromObj : (custFromObj as { id?: string })?.id ?? null;

  if (event.type.startsWith('invoice_payment.')) {
    const ip = obj;
    const inv = ip?.invoice;
    if (inv != null && typeof inv === 'object' && inv !== null) {
      const invObj = inv as Record<string, unknown>;
      const sub = invObj.subscription;
      const cust = invObj.customer;
      subscriptionId = sub == null ? null : typeof sub === 'string' ? sub : (sub as { id?: string })?.id ?? null;
      customerId = cust == null ? null : typeof cust === 'string' ? cust : (cust as { id?: string })?.id ?? null;
    } else if (typeof inv === 'string' && stripeSecretKey && !envTrue('DIAG_SKIP_STRIPE_API_FETCH')) {
      const res = await stripeRequest(
        'GET',
        `invoices/${inv}`,
        stripeSecretKey,
        undefined,
        { 'expand[0]': 'subscription' }
      );
      const invData = res.data as { subscription?: string | { id?: string }; customer?: string | { id?: string } } | undefined;
      if (invData?.subscription) {
        subscriptionId = typeof invData.subscription === 'string' ? invData.subscription : invData.subscription?.id ?? null;
      }
      if (invData?.customer) {
        customerId = typeof invData.customer === 'string' ? invData.customer : invData.customer?.id ?? null;
      }
    }
  }

  return { subscriptionId, customerId };
}

/** Eventos que procesamos; customer.subscription.created se trata como updated */
const PROCESSED_EVENTS = [
  'checkout.session.completed',
  'invoice.payment_succeeded',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.updated',
  'customer.subscription.created',
  'customer.subscription.deleted',
] as const;

const defaultHeaders = { 'Content-Type': 'application/json', 'x-webhook-version': WEBHOOK_VERSION };

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: defaultHeaders,
  });
}

Deno.serve(async (req: Request) => {
  console.log('[BOOT]', { fn: 'stripe-webhook', version: WEBHOOK_VERSION, ts: new Date().toISOString() });

  if (Deno.env.get('EDGE_MINIMAL_MODE') === 'true') {
    console.log('[MINIMAL] stripe-webhook minimal mode active');
    return new Response(JSON.stringify({ ok: true, mode: 'minimal' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // DIAG ONLY: A/B flags to find which import triggers runMicrotasks crash
  if (Deno.env.get('DISABLE_STRIPE_HELPERS') === 'true') {
    console.log('[DIAG] DISABLE_STRIPE_HELPERS=true (skipping stripe_rest import)');
    return new Response(JSON.stringify({ ok: true, diag: 'no_stripe_helpers' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (Deno.env.get('DISABLE_SUPABASE_JS') === 'true') {
    console.log('[DIAG] DISABLE_SUPABASE_JS=true (skipping supabase-js import)');
    return new Response(JSON.stringify({ ok: true, diag: 'no_supabase_js' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { verifyStripeWebhookSignature, stripeRequest } = await getStripeHelpers();

  const url = new URL(req.url);
  if (req.method === 'GET' && url.searchParams.get('debug') === '1') {
    const token = url.searchParams.get('token') ?? '';
    const secret = Deno.env.get('INTERNAL_WEBHOOK_SHARED_SECRET');
    if (!secret || token !== secret) {
      return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(
      JSON.stringify({
        ok: true,
        has_STRIPE_WEBHOOK_SECRET: Boolean(Deno.env.get('STRIPE_WEBHOOK_SECRET')),
        has_STRIPE_SECRET_KEY: Boolean(Deno.env.get('STRIPE_SECRET_KEY')),
        has_SUPABASE_URL: Boolean(Deno.env.get('SUPABASE_URL')),
        has_SUPABASE_SERVICE_ROLE_KEY: Boolean(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const INTERNAL_WEBHOOK_SHARED_SECRET = Deno.env.get('INTERNAL_WEBHOOK_SHARED_SECRET');

  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const signature = req.headers.get('stripe-signature') ?? req.headers.get('Stripe-Signature') ?? '';
  const hasStripeSignature = signature.length > 0;
  if (!hasStripeSignature) {
    const auth = req.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) return json(401, { error: 'Unauthorized' });
    if (INTERNAL_WEBHOOK_SHARED_SECRET) {
      const got = req.headers.get('x-internal-webhook-secret');
      if (got !== INTERNAL_WEBHOOK_SHARED_SECRET) return json(403, { error: 'Forbidden' });
    }
  }

  const rawBody = await req.text();
  if (!signature) {
    console.error('No stripe-signature header');
    return json(400, { error: 'No stripe-signature header' });
  }

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET no configurada');
    return json(500, { received: false, error: 'STRIPE_WEBHOOK_SECRET not configured' });
  }

  try {
    await verifyStripeWebhookSignature(rawBody, signature, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid signature';
    const stack = err instanceof Error && err.stack ? truncate(err.stack, 300) : '';
    console.error('Error verificando firma Stripe:', message, stack ? { stack } : '');
    return json(400, { error: 'Invalid signature' });
  }

  let event: { type: string; id: string; livemode?: boolean; created?: number; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    console.error('Error parseando JSON del evento');
    return json(400, { error: 'Invalid JSON in webhook body' });
  }

  const eventType = normalizeEventType(event.type);
  const eventId = event.id ?? 'unknown';
  console.log('[WEBHOOK]', {
    eventId,
    eventType: event.type,
    livemode: event.livemode ?? null,
    created: event.created ?? null,
  });

  // DIAG ONLY: log which flags are active (no secret values)
  const diagFlags = {
    MINIMAL_OK: envTrue('DIAG_MINIMAL_OK'),
    SKIP_RECONCILE_BRANCH_LOCKS: envTrue('DIAG_SKIP_RECONCILE_BRANCH_LOCKS'),
    SKIP_STRIPE_API_FETCH: envTrue('DIAG_SKIP_STRIPE_API_FETCH'),
    SKIP_INVOICE_PARSE: envTrue('DIAG_SKIP_INVOICE_PARSE'),
    SKIP_SUBSCRIPTION_LOOKUP: envTrue('DIAG_SKIP_SUBSCRIPTION_LOOKUP'),
    SKIP_DB_UPSERT: envTrue('DIAG_SKIP_DB_UPSERT'),
  };
  if (Object.values(diagFlags).some(Boolean)) {
    console.log('[DIAG] flags', diagFlags);
  }

  if (envTrue('DIAG_MINIMAL_OK')) {
    console.log('[DIAG] MINIMAL_OK=true (returning 200 after signature verify)', { eventType: event.type, eventId });
    return json(200, { ok: true, diag: 'minimal_ok' });
  }

  if (!PROCESSED_EVENTS.includes(eventType as typeof PROCESSED_EVENTS[number])) {
    console.log('⚠️ Event type ignored', event.type);
    return json(200, { received: true, message: 'Event type not handled' });
  }

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeSecretKey) {
    console.error('STRIPE_SECRET_KEY no configurada');
    return json(200, { received: true, error: 'Configuration error' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configuradas');
    return json(200, { received: true, error: 'Configuration error' });
  }
  const { createClient } = await import('jsr:@supabase/supabase-js@2');
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  let subscriptionId: string | null = null;
  let sessionMetadata: Record<string, string> = {};
  let resolvedPlanFromInvoice: { plan_id: string; plan_name: string } | null = null;
  let isInvoiceEvent = false;
  /** Solo en eventos invoice.*: objeto invoice para resolver period end (lines[0].period.end). */
  let invoiceForPeriod: any = null;
  const obj = event.data?.object as Record<string, unknown> | undefined;

  // ——— customer.subscription.deleted: actualizar users por stripe_customer_id y salir ———
  if (eventType === 'customer.subscription.deleted' && obj) {
    const customerId = typeof obj.customer === 'string' ? obj.customer : (obj.customer as { id?: string })?.id ?? '';
    const subId = typeof obj.id === 'string' ? obj.id : '';
    if (!customerId) {
      console.log('[SUB_DELETED] no customerId in object');
      return json(200, { received: true });
    }
    const { data: userRow, error: findErr } = await supabaseAdmin
      .from('users')
      .select('id, owner_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    if (findErr || !userRow) {
      console.log('[SUB_DELETED] no user for stripe_customer_id, ack 200', customerId);
      return json(200, { received: true });
    }
    const ownerId = (userRow as { owner_id?: string }).owner_id ?? userRow.id;
    const delRes = await handleStripeSubscriptionDeleted({
      supabaseAdmin,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subId,
      ownerId,
    });
    if (delRes.error) {
      console.error('[SUB_DELETED] update failed', delRes.error);
    } else {
      console.log('[SUB_DELETED]', { userId: userRow.id, customerId, subscriptionId: subId });
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    return json(200, { received: true });
  }

  // ——— customer.subscription.updated / created: fuente de verdad del PLAN (lookup_key desde subscription price) ———
  if ((eventType === 'customer.subscription.updated' || eventType === 'customer.subscription.created') && obj) {
    console.log('[SUB_UPDATED] handler entered', { eventType, eventId });
    if (envTrue('DIAG_SKIP_STRIPE_API_FETCH')) {
      console.log('[DIAG] DIAG_SKIP_STRIPE_API_FETCH=true (skipping subscription.updated/created Stripe fetch)', { eventType, eventId });
      return json(200, { received: true, diag: 'skip_stripe_fetch' });
    }
    const customerId = typeof obj.customer === 'string' ? obj.customer : (obj.customer as { id?: string })?.id ?? '';
    const subId = typeof obj.id === 'string' ? obj.id : '';
    const subIdSuffix = subId.length >= 6 ? subId.slice(-6) : '***';
    const custIdSuffix = customerId.length >= 6 ? customerId.slice(-6) : '***';
    if (!customerId || !subId) {
      console.log('[SUB_UPDATED] missing customerId or subscriptionId', { subIdSuffix, hasCustomerId: !!customerId });
      return json(200, { received: true });
    }
    // Siempre obtener subscription desde Stripe con expand items.data.price para lookup_key fiable
    const subResult = await stripeRequest(
      'GET',
      `subscriptions/${subId}`,
      stripeSecretKey,
      undefined,
      { 'expand[0]': 'items.data.price' }
    );
    if (subResult.error || !subResult.data) {
      console.error('[SUB_UPDATED] failed to fetch subscription', subResult.error?.message ?? 'unknown');
      return json(200, { received: true });
    }
    const subscription = subResult.data as { status?: string; current_period_end?: number; cancel_at?: number; cancel_at_period_end?: boolean; items?: { data?: Array<{ price?: { lookup_key?: string }; current_period_end?: number }> } };
    const status = subscription.status ?? 'active';
    const cancelScheduled = computeCancelScheduled(subscription);
    console.log('[WEBHOOK_SYNC] cancelScheduled', {
      subIdSuffix,
      cancel_at_period_end: subscription.cancel_at_period_end ?? null,
      hasCancelAt: typeof (subscription as any)?.cancel_at === 'number',
      hasCanceledAt: typeof (subscription as any)?.canceled_at === 'number',
      status: subscription?.status ?? null,
      cancelScheduled,
    });
    console.log('[SUB_UPDATED] Stripe subscription', {
      subIdSuffix,
      custIdSuffix,
      status,
      cancel_at_period_end: subscription.cancel_at_period_end ?? null,
    });
    const periodEndUnix = toUnix((subscription as any)?.cancel_at) ?? getSubscriptionPeriodEndUnix(subscription);
    const expiresAt = periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null;
    const statusIsActiveOrTrialing = status === 'active' || status === 'trialing';
    const periodNotExpired = !expiresAt || new Date(expiresAt) > new Date();
    const active = statusIsActiveOrTrialing && periodNotExpired;
    const lookupKey = subscription.items?.data?.[0]?.price?.lookup_key ?? null;
    let plan: AllowedPlanId = 'free';
    if (lookupKey && typeof lookupKey === 'string') {
      plan = normalizePlanId(null, lookupKey);
    } else {
      const { data: userRow } = await supabaseAdmin
        .from('users')
        .select('subscription_plan')
        .eq('stripe_customer_id', customerId)
        .maybeSingle();
      const prev = userRow?.subscription_plan;
      if (prev === 'free' || prev === 'basic' || prev === 'additional-branch') {
        plan = prev as AllowedPlanId;
      }
      console.log('[SUB_UPDATED] no lookup_key, keeping previous plan', { lookupKey, previousPlan: prev });
    }
    const subscriptionPlan = active ? plan : 'free';
    const { data: userRow, error: findErr } = await supabaseAdmin
      .from('users')
      .select('id, owner_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    if (findErr || !userRow) {
      console.log('[SUB_UPDATED] no user for stripe_customer_id, ack 200', { custIdSuffix });
      return json(200, { received: true });
    }
    console.log('[stripe-webhook] period_end resolution', {
      subscriptionId: subId,
      topLevel: subscription?.current_period_end ?? null,
      itemLevel: subscription?.items?.data?.[0]?.current_period_end ?? null,
      cancel_at: subscription?.cancel_at ?? null,
      chosenUnix: periodEndUnix ?? null,
    });
    const ownerId = (userRow as { owner_id?: string }).owner_id ?? userRow.id;
    const nowSub = new Date().toISOString();
    const cancelMeta = computeCancelMeta(subscription);
    const subRow = {
      owner_id: ownerId,
      user_id: userRow.id,
      plan_id: subscriptionPlan,
      plan_name: getFinalPlanName(subscriptionPlan),
      status: mapStatus(subscription.status ?? 'active'),
      current_period_start: unixToIso(subscription.current_period_start) ?? nowSub,
      current_period_end: expiresAt ?? unixToIso(subscription.current_period_end) ?? nowSub,
      cancel_at_period_end: !!(subscription.cancel_at_period_end === true),
      canceled_at: unixToIso((subscription as { canceled_at?: number }).canceled_at ?? null),
      stripe_subscription_id: subId,
      stripe_customer_id: customerId || null,
      metadata: {
        ...cancelMeta,
        lastEventType: event.type,
        lastEventId: event.id,
        lastEventAt: nowSub,
      } as Record<string, unknown>,
      updated_at: nowSub,
    };
    await handleSubscriptionUpdate({
      supabaseAdmin,
      ownerId,
      userId: userRow.id,
      plan: subscriptionPlan,
      expiresAt,
      provider: 'stripe',
      addonsCount: null,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subId,
      subscriptionActive: active,
      subscriptionCancelAtPeriodEnd: subscriptionPlan === 'free' ? false : cancelScheduled,
      userPatchOverride: null,
      subscriptionsUpsertRow: subRow,
      reconcileBranchLocks: true,
      reconcileOnlyWhenPlanFree: true,
      parallelUserUpdateAndSubscriptionsUpsert: true,
      diagSkipReconcile: envTrue('DIAG_SKIP_RECONCILE_BRANCH_LOCKS'),
    });
    console.log('[SUB_UPDATED] sync delegated to handleSubscriptionUpdate', { subIdSuffix, subscription_active: active });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return json(200, { received: true });
  }

  if (eventType === 'checkout.session.completed') {
    subscriptionId = typeof obj?.subscription === 'string' ? obj.subscription : (obj?.subscription as { id?: string })?.id ?? null;
    if (obj?.metadata && typeof obj.metadata === 'object') sessionMetadata = obj.metadata as Record<string, string>;
  } else if (
    eventType === 'invoice.payment_succeeded' ||
    eventType === 'invoice.paid' ||
    eventType === 'invoice.payment_failed'
  ) {
    if (envTrue('DIAG_SKIP_INVOICE_PARSE')) {
      console.log('[DIAG] DIAG_SKIP_INVOICE_PARSE=true (skipping invoice parse)', { eventType, eventId });
      return json(200, { received: true, diag: 'skip_invoice_parse' });
    }
    // invoice.* NO debe sobrescribir subscription_plan (customer.subscription.updated es fuente de verdad)
    let invoice: any = obj;
    if (event.type.startsWith('invoice_payment.') && obj?.invoice != null) {
      if (typeof (obj as any).invoice === 'object') {
        invoice = (obj as any).invoice;
      } else if (typeof (obj as any).invoice === 'string' && stripeSecretKey && !envTrue('DIAG_SKIP_STRIPE_API_FETCH')) {
        const res = await stripeRequest(
          'GET',
          `invoices/${(obj as any).invoice}`,
          stripeSecretKey,
          undefined,
          { 'expand[0]': 'subscription' }
        );
        invoice = res.data ?? null;
      } else {
        invoice = null;
      }
    }
    subscriptionId = extractSubscriptionIdFromInvoice(invoice);
    console.log('Resolved subscriptionId from invoice:', subscriptionId);
    if (!subscriptionId) {
      const refs = await extractInvoiceRefs(event, stripeSecretKey);
      subscriptionId = refs.subscriptionId;
    }
    if (!subscriptionId) {
      console.log('⚠️ Sin subscription ID en evento', event.type, 'invoice:', invoice?.id);
      return json(200, { received: true, message: 'No subscription id' });
    }
    isInvoiceEvent = true;
    invoiceForPeriod = invoice;
    console.log('[INVOICE]', { eventType: event.type, subscriptionId });
  } else if (eventType === 'customer.subscription.updated' || eventType === 'customer.subscription.deleted') {
    subscriptionId = typeof obj?.id === 'string' ? obj.id : null;
  }

  if (!subscriptionId) {
    console.log('Sin subscription ID en evento:', event.type);
    return json(200, { received: true, message: 'No subscription ID' });
  }

  if (envTrue('DIAG_SKIP_SUBSCRIPTION_LOOKUP')) {
    console.log('[DIAG] DIAG_SKIP_SUBSCRIPTION_LOOKUP=true (skipping subscription fetch)', { eventType, eventId, subscriptionId });
    return json(200, { received: true, diag: 'skip_subscription_lookup' });
  }

  if (envTrue('DIAG_SKIP_STRIPE_API_FETCH')) {
    console.log('[DIAG] DIAG_SKIP_STRIPE_API_FETCH=true (skipping main subscription fetch)', { eventType, eventId, subscriptionId });
    return json(200, { received: true, diag: 'skip_stripe_fetch' });
  }

  let subscription: {
    id: string;
    status: string;
    customer: string;
    current_period_start: number;
    current_period_end: number;
    cancel_at_period_end?: boolean;
    canceled_at?: number | null;
    metadata?: Record<string, string>;
    items?: { data?: Array<{ price?: { id?: string } }> };
  };
  const subResult = await stripeRequest(
    'GET',
    `subscriptions/${subscriptionId}`,
    stripeSecretKey,
    undefined,
    { 'expand[0]': 'items.data.price' }
  );
  if (subResult.error || !subResult.data) {
    if (event.type === 'customer.subscription.deleted' && obj) {
      subscription = obj as typeof subscription;
    } else {
      console.error('Error recuperando subscription de Stripe:', subResult.error?.message ?? 'unknown');
      return json(200, { received: true, error: 'Failed to retrieve subscription' });
    }
  } else {
    subscription = subResult.data as typeof subscription;
  }

  console.log('[CANCEL_FIELDS]', {
    subIdSuffix: subscriptionId?.slice?.(-6) ?? '***',
    status: (subscription as any)?.status ?? null,
    cancel_at_period_end: (subscription as any)?.cancel_at_period_end ?? null,
    cancel_at_type: typeof (subscription as any)?.cancel_at,
    cancel_at_is_number: typeof (subscription as any)?.cancel_at === 'number',
    canceled_at_type: typeof (subscription as any)?.canceled_at,
    canceled_at_is_number: typeof (subscription as any)?.canceled_at === 'number',
  });

  const subMeta = (subscription.metadata || {}) as Record<string, string>;
  let owner_id = subMeta.owner_id ?? sessionMetadata.owner_id ?? '';
  let user_id = subMeta.user_id ?? sessionMetadata.user_id ?? '';
  const stripeCustomerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : (subscription.customer as { id?: string })?.id ?? '';
  const plan_name = subMeta.plan_name ?? sessionMetadata.plan_name ?? sessionMetadata.planLookupKey ?? '';
  const plan_id = subscription.items?.data?.[0]?.price?.id ?? (obj?.items as { data?: Array<{ price?: { id?: string } }> } | undefined)?.data?.[0]?.price?.id ?? '';

  console.log('📦 Stripe metadata received', {
    eventType: event.type,
    subscriptionId,
    subscriptionMetadata: subscription?.metadata ?? null,
    sessionMetadata: Object.keys(sessionMetadata).length ? sessionMetadata : null,
  });

  if (!owner_id || !user_id) {
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('id, owner_id')
      .eq('stripe_customer_id', stripeCustomerId)
      .maybeSingle();
    if (userRow) {
      if (!user_id) user_id = userRow.id;
      if (!owner_id) owner_id = userRow.owner_id ?? userRow.id;
    }
  }

  if (!owner_id || !user_id) {
    console.error('No se pudo resolver owner_id/user_id para stripe_customer_id:', stripeCustomerId);
    return json(200, { received: true, error: 'Could not resolve owner_id/user_id' });
  }

  const now = new Date().toISOString();
  const currentPeriodStart = unixToIso(subscription.current_period_start);
  const currentPeriodEnd = unixToIso(subscription.current_period_end);
  const canceledAt = unixToIso(subscription.canceled_at ?? null);
  const safeStart = currentPeriodStart ?? canceledAt ?? now;

  // Period end: subscription (raíz/items/cancel_at) o invoice.lines[0].period.end. Si no hay valor fiable, no sobrescribir en subscriptions.
  const endUnix =
    getSubscriptionPeriodEndUnix(subscription) ?? getPeriodEndUnixFromInvoice(invoiceForPeriod);
  const periodEndIso = endUnix != null ? new Date(endUnix * 1000).toISOString() : null;
  const safeEnd = periodEndIso ?? currentPeriodEnd ?? currentPeriodStart ?? canceledAt ?? now;

  // Prueba manual: reenviar invoice.payment_succeeded en Stripe → verificar en logs chosenUnix y que subscriptions.current_period_end sea fecha futura; get_branch_limit_for_owner(owner_id) debe devolver 3 para Business.
  console.log('[stripe-webhook] subscriptions period_end resolution', {
    eventType: event.type,
    subscriptionId,
    chosenUnix: endUnix ?? null,
    subscription_current_period_end: subscription?.current_period_end ?? null,
    invoice_line0_period_end: invoiceForPeriod?.lines?.data?.[0]?.period?.end ?? null,
  });

  const planLookupKey = (plan_name || sessionMetadata.planLookupKey || '').trim();
  const priceObj = subscription.items?.data?.[0]?.price as { lookup_key?: string } | undefined;
  const lookupKeyFromSubscription = priceObj?.lookup_key ?? null;
  const mappedPlan = lookupKeyFromSubscription
    ? mapPlanFromLookupKey(lookupKeyFromSubscription)
    : (resolvedPlanFromInvoice ?? mapPlanFromLookupKey(planLookupKey || null));
  const finalPlanId = normalizePlanId(mappedPlan?.plan_id, lookupKeyFromSubscription ?? planLookupKey);
  const finalPlanName = getFinalPlanName(finalPlanId);
  console.log('✅ FINAL PLAN', { planLookupKey, lookupKeyFromSubscription, mappedPlan, finalPlanId, finalPlanName });
  const cancelMeta = computeCancelMeta(subscription);
  const row = {
    owner_id,
    user_id,
    plan_id: finalPlanId,
    plan_name: finalPlanName,
    status: mapStatus(subscription.status ?? 'active'),
    current_period_start: safeStart,
    ...(periodEndIso != null ? { current_period_end: periodEndIso } : {}),
    cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    canceled_at: canceledAt,
    stripe_subscription_id: subscriptionId,
    stripe_customer_id: stripeCustomerId || null,
    metadata: {
      ...subMeta,
      ...cancelMeta,
      lastEventType: event.type,
      lastEventId: event.id,
      lastEventAt: now,
    } as Record<string, unknown>,
    updated_at: now,
  };

  if (!owner_id || !user_id) {
    console.error('❌ Missing owner_id or user_id before UPSERT', {
      subscriptionId,
      ownerId: owner_id,
      userId: user_id,
      metadata: subscription?.metadata ?? null,
    });
    return new Response(JSON.stringify({ error: 'Missing owner/user metadata' }), {
      status: 400,
      headers: defaultHeaders,
    });
  }

  console.log('[DIAG] reached: BEFORE_DB_UPSERT', { eventType, eventId });
  console.log('🚀 About to UPSERT subscription', { subscriptionId, owner_id, user_id, plan_name: finalPlanName });

  if (envTrue('DIAG_SKIP_DB_UPSERT')) {
    console.log('[DIAG] DIAG_SKIP_DB_UPSERT=true (skipping DB upsert and user update)', { eventType, eventId });
    return json(200, { received: true, diag: 'skip_db_upsert' });
  }

  const statusIsActiveOrTrialing = row.status === 'active' || row.status === 'trialing';
  const periodNotExpired = !currentPeriodEnd || new Date(currentPeriodEnd) > new Date();
  const subscriptionActive = statusIsActiveOrTrialing && periodNotExpired;
  const cancelScheduled = computeCancelScheduled(subscription);
  const subIdSuffixSync = subscriptionId?.slice?.(-6) ?? '***';
  console.log('[WEBHOOK_SYNC] cancelScheduled', {
    subIdSuffix: subIdSuffixSync,
    cancel_at_period_end: subscription?.cancel_at_period_end ?? null,
    hasCancelAt: typeof (subscription as any)?.cancel_at === 'number',
    hasCanceledAt: typeof (subscription as any)?.canceled_at === 'number',
    status: subscription?.status ?? null,
    cancelScheduled,
  });
  const userExpiresAtUnix = toUnix((subscription as any)?.cancel_at) ?? endUnix;
  const userUpdatePayload: Record<string, unknown> = {
    stripe_subscription_id: subscriptionId,
    subscription_active: subscriptionActive,
    subscription_cancel_at_period_end: cancelScheduled,
  };
  if (userExpiresAtUnix != null) {
    userUpdatePayload.subscription_expires_at = new Date(userExpiresAtUnix * 1000).toISOString();
  } else if (periodEndIso) {
    userUpdatePayload.subscription_expires_at = periodEndIso;
  }
  console.log('[stripe-webhook] period_end resolution', {
    subscriptionId,
    topLevel: subscription?.current_period_end ?? null,
    itemLevel: (subscription?.items?.data?.[0] as { current_period_end?: number } | undefined)?.current_period_end ?? null,
    cancel_at: (subscription as any)?.cancel_at ?? null,
    chosenUnix: endUnix ?? null,
  });

  if (!isInvoiceEvent) {
    userUpdatePayload.subscription_plan = finalPlanId;
  } else {
    // Invoice fallback: allow ONLY upgrades (never degrade) when subscription is active/trialing.
    // This rescues cases where customer.subscription.updated is missing (e.g. Pro → Business).
    let invoicePlanToApply: AllowedPlanId | null = null;
    if (lookupKeyFromSubscription && typeof lookupKeyFromSubscription === 'string') {
      const mappedFromLookup = mapPlanFromLookupKey(lookupKeyFromSubscription);
      const newPlan = normalizePlanId(mappedFromLookup.plan_id, lookupKeyFromSubscription);
      const subscriptionActiveOrTrialing = subscriptionActive;

      if ((newPlan === 'basic' || newPlan === 'additional-branch') && subscriptionActiveOrTrialing) {
        const { data: userRow } = await supabaseAdmin
          .from('users')
          .select('subscription_plan')
          .eq('stripe_customer_id', stripeCustomerId)
          .maybeSingle();

        const dbPlan = (userRow?.subscription_plan ?? 'free') as AllowedPlanId;

        // Allow upgrade if newPlan is higher rank than dbPlan (free→basic, free→additional-branch, basic→additional-branch)
        if (planRank(newPlan) > planRank(dbPlan)) {
          invoicePlanToApply = newPlan;
          console.log('[INVOICE_PLAN_UPGRADE]', { dbPlan, newPlan, lookupKeyFromSubscription });
        } else {
          // Never degrade or overwrite same plan from invoice.*
          console.log('[INVOICE_PLAN_NOOP]', { dbPlan, newPlan, lookupKeyFromSubscription });
        }
      }
    }

    if (invoicePlanToApply) {
      userUpdatePayload.subscription_plan = invoicePlanToApply;
    }
  }

  const syncResult = await handleSubscriptionUpdate({
    supabaseAdmin,
    ownerId: owner_id,
    userId: user_id,
    plan: finalPlanId,
    expiresAt: null,
    provider: 'stripe',
    addonsCount: null,
    stripeCustomerId,
    stripeSubscriptionId: subscriptionId,
    subscriptionActive,
    subscriptionCancelAtPeriodEnd: cancelScheduled,
    userPatchOverride: userUpdatePayload,
    subscriptionsUpsertRow: row,
    reconcileBranchLocks: true,
    reconcileOnlyWhenPlanFree: false,
    parallelUserUpdateAndSubscriptionsUpsert: false,
    afterUpsertCleanupOtherActives: { ownerId: owner_id },
    afterSuccessfulUpsert: ({ upsertId }) => {
      console.log('event.type', event.type, 'subscriptionId', subscriptionId, 'owner_id', owner_id, 'UPSERT result', upsertId ?? 'ok');
      console.log('[DIAG] reached: AFTER_DB_UPSERT', { eventType, eventId });
    },
    diagSkipReconcile: envTrue('DIAG_SKIP_RECONCILE_BRANCH_LOCKS'),
  });

  if (syncResult.error) {
    return new Response(JSON.stringify({ error: 'Database UPSERT failed' }), {
      status: 500,
      headers: defaultHeaders,
    });
  }

  if (envTrue('DIAG_SKIP_RECONCILE_BRANCH_LOCKS')) {
    console.log('[DIAG] DIAG_SKIP_RECONCILE_BRANCH_LOCKS=true (skipping reconcile_branch_locks)', { eventType, eventId });
  }

  console.log('[DIAG] reached: BEFORE_RETURN_200', { eventType, eventId });
  return json(200, { received: true });
});
