-- Reconcilia public.users con la suscripción vigente real en public.subscriptions.
-- Si no hay fila activa+no expirada, degrada a cafe/none y llama reconcile_branch_locks.
-- Idempotente; no borra subscriptions; no toca inventory.

CREATE OR REPLACE FUNCTION public.reconcile_owner_subscription_state(p_owner_id uuid)
RETURNS TABLE(
  owner_found boolean,
  applied_from_subscription boolean,
  out_billing_provider text,
  out_subscription_plan text,
  locked_count integer,
  unlocked_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_exists boolean;
  v_sub_id uuid;
  v_plan_id text;
  v_period_end timestamptz;
  v_stripe_sub text;
  v_google_tok text;
  v_apple_tx_sub text;
  v_meta jsonb;
  v_cancel_at_end boolean;
  v_addons integer;
  v_provider text;
  v_apple_tx_user text;
  v_apple_pid_user text;
  v_locked integer;
  v_unlocked integer;
BEGIN
  -- Permiso: service_role (Edge/cron) o el propio owner autenticado.
  BEGIN
    v_role := nullif(trim(current_setting('request.jwt.claim.role', true)), '');
  EXCEPTION
    WHEN others THEN
      v_role := null;
  END;

  IF coalesce(v_role, '') IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_owner_id THEN
      RAISE EXCEPTION 'reconcile_owner_subscription_state: not allowed'
        USING errcode = '42501';
    END IF;
  END IF;

  SELECT exists (SELECT 1 FROM public.users u WHERE u.id = p_owner_id) INTO v_exists;

  IF coalesce(v_exists, false) = false THEN
    owner_found := false;
    applied_from_subscription := false;
    out_billing_provider := null;
    out_subscription_plan := null;
    locked_count := 0;
    unlocked_count := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT
    s.id,
    s.plan_id,
    s.current_period_end,
    s.stripe_subscription_id,
    s.google_purchase_token,
    s.apple_original_transaction_id,
    s.metadata,
    coalesce(s.cancel_at_period_end, false)
  INTO
    v_sub_id,
    v_plan_id,
    v_period_end,
    v_stripe_sub,
    v_google_tok,
    v_apple_tx_sub,
    v_meta,
    v_cancel_at_end
  FROM public.subscriptions s
  WHERE s.owner_id = p_owner_id
    AND s.status IN ('active', 'trialing')
    AND s.current_period_end > now()
  ORDER BY s.current_period_end DESC NULLS LAST, s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_sub_id IS NULL THEN
    UPDATE public.users u
    SET
      subscription_plan = 'cafe',
      subscription_active = false,
      subscription_expires_at = null,
      subscription_branch_addons_count = 0,
      billing_provider = 'none',
      subscription_cancel_at_period_end = false,
      subscription_id = null,
      apple_original_transaction_id = null,
      apple_product_id = null,
      updated_at = now()
    WHERE u.id = p_owner_id;

    SELECT rl.locked_count, rl.unlocked_count INTO v_locked, v_unlocked
    FROM public.reconcile_branch_locks(p_owner_id) rl;

    owner_found := true;
    applied_from_subscription := false;
    out_billing_provider := 'none';
    out_subscription_plan := 'cafe';
    locked_count := coalesce(v_locked, 0);
    unlocked_count := coalesce(v_unlocked, 0);
    RETURN NEXT;
    RETURN;
  END IF;

  v_addons := coalesce((v_meta ->> 'addonBranchesQty')::integer, 0);
  IF v_addons >= 3 THEN
    v_addons := 3;
  ELSIF v_addons >= 1 THEN
    v_addons := 1;
  ELSE
    v_addons := 0;
  END IF;

  IF v_stripe_sub IS NOT NULL AND length(trim(v_stripe_sub)) > 0 THEN
    v_provider := 'stripe';
  ELSIF v_google_tok IS NOT NULL AND length(trim(v_google_tok)) > 0 THEN
    v_provider := 'google';
  ELSIF v_apple_tx_sub IS NOT NULL AND length(trim(v_apple_tx_sub)) > 0 THEN
    v_provider := 'apple';
  ELSIF lower(coalesce(v_meta ->> 'provider', '')) = 'stripe' THEN
    v_provider := 'stripe';
  ELSIF lower(coalesce(v_meta ->> 'provider', '')) = 'google' THEN
    v_provider := 'google';
  ELSIF lower(coalesce(v_meta ->> 'provider', '')) = 'apple' THEN
    v_provider := 'apple';
  ELSE
    v_provider := 'none';
  END IF;

  v_apple_tx_user := null;
  v_apple_pid_user := null;
  IF v_provider = 'apple' THEN
    v_apple_tx_user := nullif(trim(v_apple_tx_sub), '');
    v_apple_pid_user := nullif(trim(coalesce(v_meta ->> 'apple_product_id', '')), '');
  END IF;

  UPDATE public.users u
  SET
    subscription_plan = v_plan_id,
    subscription_active = true,
    subscription_expires_at = v_period_end,
    subscription_branch_addons_count = v_addons,
    billing_provider = v_provider,
    subscription_id = v_sub_id,
    subscription_cancel_at_period_end = v_cancel_at_end,
    apple_original_transaction_id = v_apple_tx_user,
    apple_product_id = v_apple_pid_user,
    updated_at = now()
  WHERE u.id = p_owner_id;

  SELECT rl.locked_count, rl.unlocked_count INTO v_locked, v_unlocked
  FROM public.reconcile_branch_locks(p_owner_id) rl;

  owner_found := true;
  applied_from_subscription := true;
  out_billing_provider := v_provider;
  out_subscription_plan := v_plan_id;
  locked_count := coalesce(v_locked, 0);
  unlocked_count := coalesce(v_unlocked, 0);
  RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.reconcile_owner_subscription_state(uuid) IS
  'Alinea public.users con la suscripción vigente (active|trialing, current_period_end > now). Si no hay ninguna, cafe/none + addons 0; luego reconcile_branch_locks.';

REVOKE ALL ON FUNCTION public.reconcile_owner_subscription_state(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_owner_subscription_state(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_owner_subscription_state(uuid) TO authenticated;
