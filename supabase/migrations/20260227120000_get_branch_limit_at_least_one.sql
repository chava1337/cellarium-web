-- Fix onboarding: get_branch_limit_for_owner debe retornar al menos 1 para owners nuevos.
-- Síntoma: owner nuevo sin subscription row hace que enforce_branch_limit bloquee el primer INSERT en branches.
-- Garantía: free / datos incompletos / error al resolver plan => al menos 1 branch.

CREATE OR REPLACE FUNCTION public.get_branch_limit_for_owner(p_owner uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  plan text;
  addons int;
  result int;
begin
  plan := public.get_plan_id_effective(p_owner);

  select coalesce(subscription_branch_addons_count, 0) into addons
  from public.users
  where id = p_owner;

  -- Business plan: app 'additional-branch', legacy 'business' => 3 + addons
  if plan in ('additional-branch', 'business') then
    result := 3 + coalesce(addons, 0);
  else
    -- Free, Pro (app: 'basic'), NULL o cualquier otro => 1 branch
    result := 1;
  end if;

  -- Garantía: nunca devolver 0 (owner nuevo sin suscripción debe poder crear sucursal principal)
  return greatest(1, result);
exception
  when others then
    return 1;
end;
$function$;

-- =============================================================================
-- Verificación (ejecutar manualmente si se desea; no afecta el deploy)
-- =============================================================================
-- Para un owner recién creado (sin subscription, subscription_plan = 'free'):
--
--   SELECT public.get_branch_limit_for_owner('<owner_id>');
--   -- Esperado: 1
--
-- Tras signup, el trigger handle_new_user inserta en public.users y luego
-- inserta en public.branches; trg_enforce_branch_limit llama a esta función.
-- Con límite >= 1, el primer INSERT de branch está permitido y users.branch_id
-- se actualiza correctamente.
-- =============================================================================
