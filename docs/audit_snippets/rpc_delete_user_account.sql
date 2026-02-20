-- delete_user_account (20250122140000) - SECURITY DEFINER, SET search_path TO 'public'
-- No valida auth.uid() vs p_user_id. La Edge Function solo pasa user.id del token;
-- defensa en profundidad: el RPC debería rechazar si p_user_id != auth.uid() y no es owner borrando staff.

CREATE OR REPLACE FUNCTION public.delete_user_account(p_user_id uuid)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_role TEXT;
  v_owner_id UUID;
  ...
BEGIN
  -- FALTA: IF p_user_id != auth.uid() AND NOT (SELECT (owner_id = auth.uid()) FROM users WHERE id = p_user_id) THEN
  --          RAISE EXCEPTION 'No autorizado';
  --        END IF;
  SELECT role, COALESCE(owner_id, id), email INTO v_user_role, v_owner_id, v_user_email
  FROM public.users WHERE id = p_user_id LIMIT 1;
  ...
END; $function$;
