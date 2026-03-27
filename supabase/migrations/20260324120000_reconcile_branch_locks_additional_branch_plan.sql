-- Alinear reconcile_branch_locks con get_branch_limit_for_owner: plan Business en BD es 'additional-branch' (no solo 'business').

CREATE OR REPLACE FUNCTION public.reconcile_branch_locks(p_owner_id uuid)
 RETURNS TABLE(locked_count integer, unlocked_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan_id TEXT;
  v_addon_qty INTEGER;
  v_allowed_count INTEGER;
  v_unlocked_count INTEGER;
  v_locked_total INTEGER;
  v_locked_now INTEGER := 0;
  v_unlocked_now INTEGER := 0;
  v_to_lock_count INTEGER;
  v_to_unlock_count INTEGER;
  v_unlocked_after_lock INTEGER;
BEGIN
  SELECT 
    plan_id,
    COALESCE(
      (metadata->>'addonBranchesQty')::INTEGER,
      (SELECT subscription_branch_addons_count FROM users WHERE id = p_owner_id),
      0
    )
  INTO v_plan_id, v_addon_qty
  FROM subscriptions
  WHERE owner_id = p_owner_id
    AND status = 'active'
    AND current_period_end > NOW()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    v_plan_id := 'free';
    v_addon_qty := 0;
  END IF;

  IF v_plan_id IN ('additional-branch', 'business') THEN
    v_allowed_count := 3 + v_addon_qty;
  ELSE
    v_allowed_count := 1;
  END IF;
  v_allowed_count := GREATEST(v_allowed_count, 1);

  SELECT COUNT(*)
  INTO v_unlocked_count
  FROM branches
  WHERE owner_id = p_owner_id
    AND is_locked = false;

  SELECT COUNT(*)
  INTO v_locked_total
  FROM branches
  WHERE owner_id = p_owner_id
    AND is_locked = true
    AND is_main = false;

  v_to_lock_count := GREATEST(0, v_unlocked_count - v_allowed_count);

  IF v_to_lock_count > 0 THEN
    UPDATE branches
    SET 
      is_locked = true,
      lock_reason = 'subscription_limit',
      locked_at = NOW()
    WHERE id IN (
      SELECT id
      FROM branches
      WHERE owner_id = p_owner_id
        AND is_locked = false
        AND is_main = false
      ORDER BY created_at DESC
      LIMIT v_to_lock_count
    );
    GET DIAGNOSTICS v_locked_now = ROW_COUNT;
  ELSE
    v_locked_now := 0;
  END IF;

  SELECT COUNT(*)
  INTO v_unlocked_after_lock
  FROM branches
  WHERE owner_id = p_owner_id
    AND is_locked = false;

  SELECT COUNT(*)
  INTO v_locked_total
  FROM branches
  WHERE owner_id = p_owner_id
    AND is_locked = true
    AND is_main = false;

  v_to_unlock_count := LEAST(
    v_locked_total,
    GREATEST(0, v_allowed_count - v_unlocked_after_lock)
  );

  IF v_to_unlock_count > 0 THEN
    UPDATE branches
    SET 
      is_locked = false,
      lock_reason = NULL,
      locked_at = NULL
    WHERE id IN (
      SELECT id
      FROM branches
      WHERE owner_id = p_owner_id
        AND is_locked = true
        AND is_main = false
      ORDER BY created_at ASC
      LIMIT v_to_unlock_count
    );
    GET DIAGNOSTICS v_unlocked_now = ROW_COUNT;
  ELSE
    v_unlocked_now := 0;
  END IF;

  RETURN QUERY SELECT v_locked_now, v_unlocked_now;
END;
$function$;
