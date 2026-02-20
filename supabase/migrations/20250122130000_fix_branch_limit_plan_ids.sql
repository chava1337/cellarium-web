-- Fix: get_branch_limit_for_owner must treat subscription_plan values used by the app.
-- App uses: 'free', 'basic' (Pro), 'additional-branch' (Business).
-- DB previously only checked 'pro' and 'business', so 'additional-branch' fell to else => 1.

CREATE OR REPLACE FUNCTION public.get_branch_limit_for_owner(p_owner uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  plan text;
  addons int;
begin
  plan := public.get_plan_id_effective(p_owner);

  select coalesce(subscription_branch_addons_count, 0) into addons
  from public.users
  where id = p_owner;

  -- Business plan: app stores 'additional-branch', legacy 'business'; both get 3 + addons
  if plan in ('additional-branch', 'business') then
    return 3 + addons;
  end if;
  -- Free, Pro (app: 'basic'), or any other => 1 branch
  return 1;
end;
$function$;
