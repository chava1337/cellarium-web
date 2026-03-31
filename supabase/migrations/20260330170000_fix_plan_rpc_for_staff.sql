-- Fix: staff (gerente/supervisor/sommelier) must resolve owner effective plan correctly.
-- Root cause: get_plan_id_effective/is_subscription_effectively_active ran with invoker rights
-- and could be affected by RLS when reading owner's row in public.users.

CREATE OR REPLACE FUNCTION public.is_subscription_effectively_active(p_owner uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  u record;
begin
  select subscription_active, subscription_expires_at
  into u
  from public.users
  where id = p_owner;

  if u is null then
    return false;
  end if;

  if coalesce(u.subscription_active, false) = false then
    return false;
  end if;

  if u.subscription_expires_at is not null and u.subscription_expires_at <= now() then
    return false;
  end if;

  return true;
end;
$function$;

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
    return 'free';
  end if;

  return coalesce(plan, 'free');
end;
$function$;

REVOKE ALL ON FUNCTION public.is_subscription_effectively_active(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_plan_id_effective(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_subscription_effectively_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_plan_id_effective(uuid) TO authenticated;
