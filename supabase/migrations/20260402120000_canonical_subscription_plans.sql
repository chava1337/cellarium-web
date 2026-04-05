-- Modelo canónico: cafe | bistro | trattoria | grand-maison
-- Sucursales: 1 base + subscription_branch_addons_count (activo); reconcile alineado.
-- Datos legacy (free/basic/additional-branch) se normalizan a 'cafe' en filas existentes.

-- 1) Normalizar datos antes de cambiar CHECK
UPDATE public.users
SET subscription_plan = 'cafe'
WHERE subscription_plan IS NULL
   OR subscription_plan IN ('free', 'basic', 'additional-branch', 'pro', 'business');

UPDATE public.subscriptions
SET plan_id = 'cafe',
    plan_name = COALESCE(NULLIF(TRIM(plan_name), ''), 'Cafe')
WHERE plan_id IN ('free', 'basic', 'additional-branch', 'pro', 'business');

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_subscription_plan_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_subscription_plan_check
  CHECK (subscription_plan = ANY (ARRAY['cafe'::text, 'bistro'::text, 'trattoria'::text, 'grand-maison'::text]));

ALTER TABLE public.users ALTER COLUMN subscription_plan SET DEFAULT 'cafe';

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_id_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_id_check
  CHECK (plan_id = ANY (ARRAY['cafe'::text, 'bistro'::text, 'trattoria'::text, 'grand-maison'::text]));

-- 2) Plan efectivo: inactivo / expirado => 'cafe' (ya no 'free')
CREATE OR REPLACE FUNCTION public.get_plan_id_effective(p_owner uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  plan text;
  active boolean;
begin
  select subscription_plan into plan
  from public.users
  where id = p_owner;

  active := public.is_subscription_effectively_active(p_owner);

  if active = false then
    return 'cafe';
  end if;

  return coalesce(nullif(trim(plan), ''), 'cafe');
end;
$function$;

-- 3) Límite de sucursales: 1 + add-ons si suscripción activa; si no, 1
CREATE OR REPLACE FUNCTION public.get_branch_limit_for_owner(p_owner uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  addons int;
begin
  if not public.is_subscription_effectively_active(p_owner) then
    return greatest(1, 1);
  end if;

  select coalesce(subscription_branch_addons_count, 0) into addons
  from public.users
  where id = p_owner;

  return greatest(1, 1 + coalesce(addons, 0));
exception
  when others then
    return 1;
end;
$function$;

-- 4) Reconcile: siempre 1 + add-ons (metadata o users)
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
      (SELECT subscription_branch_addons_count FROM public.users WHERE id = p_owner_id),
      0
    )
  INTO v_plan_id, v_addon_qty
  FROM public.subscriptions
  WHERE owner_id = p_owner_id
    AND status = 'active'
    AND current_period_end > NOW()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    v_plan_id := 'cafe';
    SELECT COALESCE(subscription_branch_addons_count, 0) INTO v_addon_qty
    FROM public.users
    WHERE id = p_owner_id;
    v_addon_qty := COALESCE(v_addon_qty, 0);
  END IF;

  v_allowed_count := GREATEST(1, 1 + COALESCE(v_addon_qty, 0));

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

-- Límite de vinos (trigger enforce_wine_limit): alinear con PLAN_LIMITS del cliente
CREATE OR REPLACE FUNCTION public.get_wine_limit_for_owner(p_owner uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  plan text;
begin
  plan := public.get_plan_id_effective(p_owner);

  if plan = 'cafe' then return 10;
  elsif plan = 'bistro' then return 50;
  elsif plan = 'trattoria' then return 150;
  elsif plan = 'grand-maison' then return -1;
  else return 10;
  end if;
end;
$function$;

-- Staff bajo plan cafe (antes "free")
CREATE OR REPLACE FUNCTION public.enforce_free_user_limits_on_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  owner uuid;
  plan text;
  total_users int;
  manager_count int;
begin
  if (new.owner_id is null and old.owner_id is null)
     and (new.role = old.role) then
    return new;
  end if;

  owner := coalesce(new.owner_id, old.owner_id);

  if owner is null then
    return new;
  end if;

  plan := public.get_plan_id_effective(owner);

  if plan <> 'cafe' then
    return new;
  end if;

  if auth.uid() <> owner then
    raise exception 'Only owner can modify staff assignments in Cafe plan.'
      using errcode = 'P0001';
  end if;

  select count(*) into total_users
  from public.users
  where (id = owner) or (owner_id = owner);

  if total_users > 2 then
    raise exception 'Cafe plan limit: max 2 users total (owner + 1).'
      using errcode = 'P0001';
  end if;

  select count(*) into manager_count
  from public.users
  where owner_id = owner
    and role = 'gerente';

  if new.role = 'gerente' and (old.role is distinct from 'gerente') then
    manager_count := manager_count + 1;
  end if;

  if manager_count > 1 then
    raise exception 'Cafe plan limit: max 1 gerente.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$;
