// stripe-webhook/index.ts: auth (Bearer + optional x-internal-webhook-secret)
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return json(401, { error: 'Unauthorized' });

  if (INTERNAL_WEBHOOK_SHARED_SECRET) {
    const got = req.headers.get('x-internal-webhook-secret');
    if (got !== INTERNAL_WEBHOOK_SHARED_SECRET) return json(403, { error: 'Forbidden' });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature') ?? req.headers.get('Stripe-Signature') ?? '';
  if (!signature) {
    console.error('No stripe-signature header');
    return json(400, { error: 'No stripe-signature header' });
  }
  // ... verifyStripeWebhookSignature(rawBody, signature, webhookSecret);
